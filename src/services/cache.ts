import net from 'net';
import tls from 'tls';
import crypto from 'crypto';

export type PublicCacheNamespace =
  | 'home'
  | 'categories'
  | 'search'
  | 'public_ai'
  | 'video_meta'
  | 'doc_extract';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  namespace: PublicCacheNamespace;
}

const MAX_MEMORY_ENTRIES = 600;
const memoryCache = new Map<string, CacheEntry<unknown>>();

const stats = {
  hits: 0,
  misses: 0,
  sets: 0,
  evictions: 0,
  redisHits: 0,
  redisErrors: 0,
};

function encodeRespCommand(args: string[]): string {
  return `*${args.length}\r\n${args
    .map((a) => `$${Buffer.byteLength(a, 'utf8')}\r\n${a}\r\n`)
    .join('')}`;
}

async function execRedisCommand(args: string[]): Promise<string | null> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (val: string | null) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };

    try {
      const parsed = new URL(redisUrl);
      const isTls = parsed.protocol === 'rediss:';
      const host = parsed.hostname;
      const port = Number(parsed.port || (isTls ? 6380 : 6379));
      const password = parsed.password ? decodeURIComponent(parsed.password) : '';

      const socket = isTls
        ? tls.connect({ host, port, servername: host })
        : net.connect({ host, port });

      socket.setTimeout(500);
      let buffer = '';

      socket.on('connect', () => {
        const cmds: string[] = [];
        if (password) {
          cmds.push(encodeRespCommand(['AUTH', password]));
        }
        cmds.push(encodeRespCommand(args));
        socket.write(cmds.join(''));
      });

      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\r\n');
        // Handle AUTH + command response cleanly
        if (password) {
          const okIndex = buffer.indexOf('+OK\r\n');
          if (okIndex === -1) return;
          const rest = buffer.slice(okIndex + 5);
          if (!rest) return;
          if (rest.startsWith('$-1')) {
            socket.destroy();
            return finish(null);
          }
          if (rest.startsWith('+OK')) {
            socket.destroy();
            return finish('OK');
          }
          if (rest.startsWith('$')) {
            const firstBreak = rest.indexOf('\r\n');
            if (firstBreak === -1) return;
            const len = Number(rest.slice(1, firstBreak));
            const payloadStart = firstBreak + 2;
            if (rest.length >= payloadStart + len + 2) {
              const out = rest.slice(payloadStart, payloadStart + len);
              socket.destroy();
              return finish(out);
            }
          }
          return;
        }

        if (lines[0].startsWith('$-1')) {
          socket.destroy();
          return finish(null);
        }
        if (lines[0].startsWith('+OK')) {
          socket.destroy();
          return finish('OK');
        }
        if (lines[0].startsWith('$')) {
          const len = Number(lines[0].slice(1));
          const payloadStart = lines[0].length + 2;
          if (buffer.length >= payloadStart + len + 2) {
            const out = buffer.slice(payloadStart, payloadStart + len);
            socket.destroy();
            return finish(out);
          }
        }
      });

      socket.on('timeout', () => {
        socket.destroy();
        finish(null);
      });
      socket.on('error', () => {
        stats.redisErrors += 1;
        socket.destroy();
        finish(null);
      });
    } catch {
      stats.redisErrors += 1;
      finish(null);
    }
  });
}

export function buildPublicCacheKey(namespace: PublicCacheNamespace, rawKey: string): string {
  const normalized = rawKey.toLowerCase().trim().replace(/\s+/g, ' ');
  const digest = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 24);
  return `2mr:${namespace}:${digest}`;
}

export async function getPublicCache<T>(namespace: PublicCacheNamespace, rawKey: string): Promise<T | null> {
  const key = buildPublicCacheKey(namespace, rawKey);
  const now = Date.now();
  const mem = memoryCache.get(key);

  if (mem) {
    if (mem.expiresAt > now) {
      // Refresh LRU position
      memoryCache.delete(key);
      memoryCache.set(key, mem);
      stats.hits += 1;
      return mem.value as T;
    }
    memoryCache.delete(key);
  }

  if (process.env.REDIS_URL) {
    const raw = await execRedisCommand(['GET', key]);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as T;
        stats.hits += 1;
        stats.redisHits += 1;
        memoryCache.set(key, { value: parsed, expiresAt: now + 60_000, namespace });
        return parsed;
      } catch {
        // ignore parse failure
      }
    }
  }

  stats.misses += 1;
  return null;
}

export async function setPublicCache<T>(
  namespace: PublicCacheNamespace,
  rawKey: string,
  value: T,
  ttlSeconds: number
): Promise<void> {
  if (ttlSeconds <= 0) return;
  const key = buildPublicCacheKey(namespace, rawKey);
  const expiresAt = Date.now() + ttlSeconds * 1000;

  if (memoryCache.size >= MAX_MEMORY_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey) {
      memoryCache.delete(oldestKey);
      stats.evictions += 1;
    }
  }

  memoryCache.set(key, { value, expiresAt, namespace });
  stats.sets += 1;

  if (process.env.REDIS_URL) {
    try {
      const serialized = JSON.stringify(value);
      if (serialized.length <= 256_000) {
        execRedisCommand(['SET', key, serialized, 'EX', String(Math.max(10, Math.round(ttlSeconds)))]).catch(
          () => {}
        );
      }
    } catch {
      // ignore serialization issues
    }
  }
}

export async function getOrSetPublicCache<T>(
  namespace: PublicCacheNamespace,
  rawKey: string,
  ttlSeconds: number,
  loader: () => Promise<T>
): Promise<{ data: T; cacheHit: boolean }> {
  const cached = await getPublicCache<T>(namespace, rawKey);
  if (cached !== null) {
    return { data: cached, cacheHit: true };
  }
  const fresh = await loader();
  await setPublicCache(namespace, rawKey, fresh, ttlSeconds);
  return { data: fresh, cacheHit: false };
}

export function clearPublicCache(namespace?: PublicCacheNamespace): number {
  if (!namespace) {
    const count = memoryCache.size;
    memoryCache.clear();
    return count;
  }
  let cleared = 0;
  for (const [k, entry] of memoryCache.entries()) {
    if (entry.namespace === namespace) {
      memoryCache.delete(k);
      cleared += 1;
    }
  }
  return cleared;
}

export function getCacheStats() {
  const now = Date.now();
  const byNamespace: Record<string, number> = {};
  for (const [k, entry] of memoryCache.entries()) {
    if (entry.expiresAt <= now) {
      memoryCache.delete(k);
      continue;
    }
    byNamespace[entry.namespace] = (byNamespace[entry.namespace] || 0) + 1;
  }
  const totalLookups = stats.hits + stats.misses;
  return {
    backend: process.env.REDIS_URL ? 'redis+memory' : 'memory_lru',
    redisConfigured: Boolean(process.env.REDIS_URL),
    hits: stats.hits,
    misses: stats.misses,
    sets: stats.sets,
    evictions: stats.evictions,
    redisHits: stats.redisHits,
    redisErrors: stats.redisErrors,
    hitRatePercent: totalLookups > 0 ? Number(((stats.hits / totalLookups) * 100).toFixed(1)) : 0,
    entriesCount: memoryCache.size,
    byNamespace,
  };
}
