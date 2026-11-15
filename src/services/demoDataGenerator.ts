import crypto from 'crypto';
import os from 'os';
import { desc, eq, sql } from 'drizzle-orm';
import { createPool, db, measureDbLatencyMs } from '../db/index.ts';
import {
  adCampaigns,
  advertisements,
  demoGenerationBatches,
  demoGenerationJobs,
  demoGenerationLogs,
  plans,
  videos,
} from '../db/schema.ts';

export interface CountryWeight {
  country: string;
  city: string;
  percent: number;
}

export interface LanguageWeight {
  code: string;
  label: string;
  percent: number;
}

export interface DemoGeneratorConfig {
  targetUsers: number;
  freePercent: number;
  premiumPercent: number;
  activePercent: number;
  inactivePercent: number;
  newRegistrationsPercent: number;
  olderRegistrationsPercent: number;
  dateRangeStart: string; // YYYY-MM-DD
  dateRangeEnd: string; // YYYY-MM-DD
  activityScale: 'minimal' | 'standard' | 'heavy';
  countries: CountryWeight[];
  languages: LanguageWeight[];
}

export const DEFAULT_GENERATOR_CONFIG: DemoGeneratorConfig = {
  targetUsers: 500000,
  freePercent: 82,
  premiumPercent: 18,
  activePercent: 74,
  inactivePercent: 26,
  newRegistrationsPercent: 28,
  olderRegistrationsPercent: 72,
  dateRangeStart: new Date(Date.now() - 365 * 86400_000).toISOString().slice(0, 10),
  dateRangeEnd: new Date().toISOString().slice(0, 10),
  activityScale: 'standard',
  countries: [
    { country: 'Rwanda', city: 'Kigali', percent: 22 },
    { country: 'United States', city: 'New York', percent: 18 },
    { country: 'Kenya', city: 'Nairobi', percent: 12 },
    { country: 'United Kingdom', city: 'London', percent: 10 },
    { country: 'Germany', city: 'Berlin', percent: 9 },
    { country: 'India', city: 'Bengaluru', percent: 9 },
    { country: 'Canada', city: 'Toronto', percent: 6 },
    { country: 'France', city: 'Paris', percent: 5 },
    { country: 'Japan', city: 'Tokyo', percent: 5 },
    { country: 'Brazil', city: 'Sao Paulo', percent: 4 },
  ],
  languages: [
    { code: 'en', label: 'English', percent: 55 },
    { code: 'fr', label: 'French', percent: 18 },
    { code: 'rw', label: 'Kinyarwanda', percent: 12 },
    { code: 'es', label: 'Spanish', percent: 8 },
    { code: 'de', label: 'German', percent: 7 },
  ],
};

// Strictly fictional name pools & reserved example.com domain
const FICTIONAL_FIRST_NAMES = [
  'Amina', 'Lucas', 'Keza', 'Nadia', 'Samuel', 'Claire', 'Tariq', 'Hana', 'Mateo', 'Chloe',
  'Jean', 'Priya', 'Daniel', 'Sora', 'Elena', 'Marcus', 'Yuki', 'Zara', 'Owen', 'Lina',
  'Victor', 'Maya', 'Felix', 'Amara', 'Noah', 'Sofia', 'Liam', 'Ines', 'Caleb', 'Avery',
  'Darius', 'Rina', 'Henrik', 'Salma', 'Julian', 'Leila', 'Tomas', 'Nora', 'Emile', 'Kofi',
  'Ananya', 'Gael', 'Mireille', 'Rohan', 'Tessa', 'Kaito', 'Beatriz', 'Jonas', 'Ester', 'Bram',
];

const FICTIONAL_LAST_NAMES = [
  'Uwimana', 'Mercer', 'Kagabo', 'Patel', 'Lindqvist', 'Okafor', 'Takahashi', 'Moreau', 'Vance', 'Ndiaye',
  'Schmidt', 'Silva', 'Benali', 'Kimani', 'Rostova', 'Alvarez', 'Haddad', 'Mugisha', 'Bauer', 'Kowalski',
  'Dubois', 'Mensah', 'Sato', 'Fernandez', 'Muller', 'Nkurunziza', 'Nair', 'Rossi', 'Castillo', 'Osei',
  'Vermeer', 'Habimana', 'Nakamura', 'Novak', 'Santos', 'Diallo', 'Fischer', 'Romano', 'Kariuki', 'Fontaine',
];

const REGISTRATION_SOURCES = [
  'web_organic',
  'academic_referral',
  'research_portal',
  'mobile_web',
  'institutional_directory',
];

const SYNTHETIC_QUERIES = [
  'quantum error correction surface codes',
  'crispr cas9 base editing clinical trials',
  'post quantum cryptography nist ml kem',
  'renewable microgrid battery storage economics',
  'machine learning interpretability mechanistic',
  'solid state electrolyte lithium conductivity',
  'climate adaptation drought resilient crops',
  'distributed consensus raft paxos trade offs',
  'rna therapeutics lipid nanoparticle delivery',
  'fusion plasma magnetic confinement tokamak',
  'east african fintech interoperability standards',
  'photonic integrated circuits optical interconnects',
  'ocean carbon sequestration measurement protocols',
  'open access scholarly metadata crossref arxiv',
  'transformer sparse attention memory scaling',
];

const SYNTHETIC_TOPICS = [
  'Post-Quantum Lattice Encryption',
  'CRISPR Gene Regulation',
  'Grid-Scale Solid-State Storage',
  'Federated Healthcare Learning',
  'Satellite Earth Observation Analytics',
  'Low-Resource NLP Evaluation',
  'Bio-Degradable Polymer Composites',
  'Solar Desalination Membrane Efficiency',
];

const SYNTHETIC_PASSWORD_MARKER = '$2a$04$SYNTHETIC_DEMO_ACCOUNT_LOGIN_DISABLED';

let activeJobId: string | null = null;
let cancelRequested = false;

export function getActiveGeneratorJobId(): string | null {
  return activeJobId;
}

export function normalizeConfig(input?: Partial<DemoGeneratorConfig>): DemoGeneratorConfig {
  const base = { ...DEFAULT_GENERATOR_CONFIG, ...(input || {}) };
  const targetUsers = 500000; // Enforce exact 500,000 target for the 500K generator

  const freePct = Math.max(0, Math.min(100, Number(base.freePercent ?? 82)));
  const premiumPct = 100 - freePct;

  const activePct = Math.max(0, Math.min(100, Number(base.activePercent ?? 74)));
  const inactivePct = 100 - activePct;

  const newPct = Math.max(0, Math.min(100, Number(base.newRegistrationsPercent ?? 28)));
  const olderPct = 100 - newPct;

  const countriesRaw = Array.isArray(base.countries) && base.countries.length > 0
    ? base.countries
    : DEFAULT_GENERATOR_CONFIG.countries;
  const cSum = countriesRaw.reduce((a, c) => a + Math.max(0, Number(c.percent || 0)), 0) || 100;
  const countries = countriesRaw.map((c) => ({
    country: String(c.country || 'Rwanda'),
    city: String(c.city || 'Kigali'),
    percent: (Math.max(0, Number(c.percent || 0)) / cSum) * 100,
  }));

  const langsRaw = Array.isArray(base.languages) && base.languages.length > 0
    ? base.languages
    : DEFAULT_GENERATOR_CONFIG.languages;
  const lSum = langsRaw.reduce((a, l) => a + Math.max(0, Number(l.percent || 0)), 0) || 100;
  const languages = langsRaw.map((l) => ({
    code: String(l.code || 'en'),
    label: String(l.label || 'English'),
    percent: (Math.max(0, Number(l.percent || 0)) / lSum) * 100,
  }));

  const activityScale: DemoGeneratorConfig['activityScale'] =
    base.activityScale === 'minimal' || base.activityScale === 'heavy' ? base.activityScale : 'standard';

  return {
    targetUsers,
    freePercent: freePct,
    premiumPercent: premiumPct,
    activePercent: activePct,
    inactivePercent: inactivePct,
    newRegistrationsPercent: newPct,
    olderRegistrationsPercent: olderPct,
    dateRangeStart: base.dateRangeStart || DEFAULT_GENERATOR_CONFIG.dateRangeStart,
    dateRangeEnd: base.dateRangeEnd || DEFAULT_GENERATOR_CONFIG.dateRangeEnd,
    activityScale,
    countries,
    languages,
  };
}

/**
 * Largest-Remainder (Hamilton) apportionment so category counts sum to EXACTLY `total`.
 */
function apportionExactCounts(total: number, percents: number[]): number[] {
  const sum = percents.reduce((a, b) => a + b, 0) || 1;
  const exact = percents.map((p) => (total * p) / sum);
  const floors = exact.map((v) => Math.floor(v));
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, idx) => ({ idx, frac: v - floors[idx] }))
    .sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < remainder; i++) {
    floors[order[i % order.length].idx] += 1;
  }
  return floors;
}

function buildLookupIndices(counts: number[]): number[] {
  // Returns cumulative counts for O(log k) / fast index lookup across 500,000 items
  const cum: number[] = [];
  let acc = 0;
  for (const c of counts) {
    acc += c;
    cum.push(acc);
  }
  return cum;
}

function pickByStridedRank(rank: number, cumulative: number[]): number {
  for (let i = 0; i < cumulative.length; i++) {
    if (rank < cumulative[i]) return i;
  }
  return cumulative.length - 1;
}

async function appendJobLog(
  jobId: string,
  level: 'info' | 'warning' | 'error',
  message: string,
  details?: Record<string, unknown>
) {
  await db.insert(demoGenerationLogs).values({
    jobId,
    level,
    message,
    details: details || {},
  });
}

export async function recoverStaleJobsIfNeeded(): Promise<void> {
  if (activeJobId) return;
  await db
    .update(demoGenerationJobs)
    .set({
      status: 'failed',
      errorMessage: 'Server restarted before job completed.',
      updatedAt: new Date(),
    })
    .where(eq(demoGenerationJobs.status, 'running'));
}

export async function getDemoGeneratorStatus() {
  await recoverStaleJobsIfNeeded();
  const pool = createPool();

  const [jobs, latestBatches, latestLogs, countsRes, dbLatencyMs] = await Promise.all([
    db.select().from(demoGenerationJobs).orderBy(desc(demoGenerationJobs.createdAt)).limit(10),
    db.select().from(demoGenerationBatches).orderBy(desc(demoGenerationBatches.createdAt)).limit(20),
    db.select().from(demoGenerationLogs).orderBy(desc(demoGenerationLogs.createdAt)).limit(30),
    pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM users WHERE is_synthetic = true) AS synthetic_users,
        (SELECT COUNT(*)::int FROM users WHERE is_synthetic = false) AS real_users,
        (SELECT COUNT(*)::int FROM users WHERE is_synthetic = true AND role = 'free') AS synthetic_free,
        (SELECT COUNT(*)::int FROM users WHERE is_synthetic = true AND role = 'premium') AS synthetic_premium,
        (SELECT COUNT(*)::int FROM users WHERE is_synthetic = true AND activity_status = 'active') AS synthetic_active,
        (SELECT COUNT(*)::int FROM search_history WHERE is_synthetic = true) AS synthetic_searches,
        (SELECT COUNT(*)::int FROM ai_requests WHERE is_synthetic = true) AS synthetic_ai_requests,
        (SELECT COUNT(*)::int FROM research_projects WHERE is_synthetic = true) AS synthetic_projects,
        (SELECT COUNT(*)::int FROM saved_items WHERE is_synthetic = true) AS synthetic_saved,
        (SELECT COUNT(*)::int FROM saved_videos WHERE is_synthetic = true) AS synthetic_saved_videos,
        (SELECT COUNT(*)::int FROM video_notes WHERE is_synthetic = true) AS synthetic_video_notes,
        (SELECT COUNT(*)::int FROM knowledge_notes WHERE is_synthetic = true) AS synthetic_notes,
        (SELECT COUNT(*)::int FROM feedback_submissions WHERE is_synthetic = true) AS synthetic_feedback,
        (SELECT COUNT(*)::int FROM subscriptions WHERE is_synthetic = true) AS synthetic_subscriptions,
        (SELECT COUNT(*)::int FROM payments WHERE is_synthetic = true) AS synthetic_payments,
        (SELECT COUNT(*)::int FROM ad_events WHERE is_synthetic = true) AS synthetic_ad_events,
        (SELECT COUNT(*)::int FROM advertisement_events WHERE is_synthetic = true) AS synthetic_adv_events
    `),
    measureDbLatencyMs(),
  ]);

  const row = countsRes.rows[0] || {};
  const memMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
  const loadAvg = os.loadavg()[0] ? Number(os.loadavg()[0].toFixed(2)) : 0;

  return {
    activeJobId,
    jobs,
    batches: latestBatches,
    logs: latestLogs,
    counts: {
      syntheticUsers: Number(row.synthetic_users || 0),
      realUsers: Number(row.real_users || 0),
      syntheticFree: Number(row.synthetic_free || 0),
      syntheticPremium: Number(row.synthetic_premium || 0),
      syntheticActive: Number(row.synthetic_active || 0),
      syntheticSearches: Number(row.synthetic_searches || 0),
      syntheticAiRequests: Number(row.synthetic_ai_requests || 0),
      syntheticProjects: Number(row.synthetic_projects || 0),
      syntheticSavedResources: Number(row.synthetic_saved || 0),
      syntheticVideoInteractions: Number(row.synthetic_saved_videos || 0) + Number(row.synthetic_video_notes || 0),
      syntheticNotes: Number(row.synthetic_notes || 0),
      syntheticFeedback: Number(row.synthetic_feedback || 0),
      syntheticSubscriptions: Number(row.synthetic_subscriptions || 0),
      syntheticPayments: Number(row.synthetic_payments || 0),
      syntheticAdInteractions: Number(row.synthetic_ad_events || 0) + Number(row.synthetic_adv_events || 0),
    },
    system: {
      memoryRssMb: memMb,
      cpuLoad1m: loadAvg,
      dbLatencyMs,
    },
  };
}

export async function start500kGenerationJob(
  adminUserId: string,
  rawConfig?: Partial<DemoGeneratorConfig>
): Promise<{ job: typeof demoGenerationJobs.$inferSelect }> {
  await recoverStaleJobsIfNeeded();
  if (activeJobId) {
    throw new Error('A synthetic data generation job is already running.');
  }
  const [existingRunning] = await db
    .select()
    .from(demoGenerationJobs)
    .where(eq(demoGenerationJobs.status, 'running'))
    .limit(1);
  if (existingRunning) {
    throw new Error('A synthetic data generation job is already running.');
  }

  const config = normalizeConfig(rawConfig);
  const batchSize = 10000; // 50 batches x 10,000 = 500,000 exact rows

  const [job] = await db
    .insert(demoGenerationJobs)
    .values({
      jobType: 'users_500k',
      status: 'running',
      targetCount: config.targetUsers,
      generatedCount: 0,
      activityGeneratedCount: 0,
      batchSize,
      config: config as unknown as Record<string, unknown>,
      startedByAdminId: adminUserId,
      startedAt: new Date(),
      peakMemoryMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
    })
    .returning();

  activeJobId = job.id;
  cancelRequested = false;

  await appendJobLog(job.id, 'info', 'Started 500,000 synthetic user generation job.', {
    batchSize,
    freePercent: config.freePercent,
    premiumPercent: config.premiumPercent,
    activePercent: config.activePercent,
    activityScale: config.activityScale,
  });

  // Launch background execution asynchronously without blocking the HTTP response
  setImmediate(() => {
    run500kJobWorker(job.id, config, batchSize).catch((err) => {
      console.error('Demo 500k job worker failed:', err);
    });
  });

  return { job };
}

async function run500kJobWorker(jobId: string, config: DemoGeneratorConfig, batchSize: number) {
  const pool = createPool();
  const total = config.targetUsers; // 500,000
  const runTag = jobId.replace(/-/g, '').slice(0, 8);
  const totalBatches = Math.ceil(total / batchSize);

  // Compute exact Hamiltonian apportionments totaling 500,000
  const [freeCount] = apportionExactCounts(total, [config.freePercent, config.premiumPercent]);
  const [activeCount] = apportionExactCounts(total, [config.activePercent, config.inactivePercent]);
  const [newRegCount] = apportionExactCounts(total, [
    config.newRegistrationsPercent,
    config.olderRegistrationsPercent,
  ]);
  const countryCounts = apportionExactCounts(
    total,
    config.countries.map((c) => c.percent)
  );
  const countryCum = buildLookupIndices(countryCounts);

  const langCounts = apportionExactCounts(
    total,
    config.languages.map((l) => l.percent)
  );
  const langCum = buildLookupIndices(langCounts);

  const startMs = new Date(config.dateRangeStart).getTime() || Date.now() - 365 * 86400_000;
  const endMs = Math.max(startMs + 86400_000, new Date(config.dateRangeEnd).getTime() || Date.now());
  const thirtyDaysAgoMs = Math.max(startMs, endMs - 30 * 86400_000);
  const olderSpanMs = Math.max(86400_000, thirtyDaysAgoMs - startMs);
  const recentSpanMs = Math.max(86400_000, endMs - thirtyDaysAgoMs);

  let totalInserted = 0;
  let peakMemoryMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
  let batchDurationSum = 0;

  // Coprime stride permutations distribute free/premium, active/inactive, countries, and dates uniformly across all 50 batches
  const PRIME_A = 104729;
  const PRIME_B = 1299709;
  const PRIME_C = 15485863;
  const PRIME_D = 32452843;
  const PRIME_E = 49979687;

  try {
    for (let batchNum = 1; batchNum <= totalBatches; batchNum++) {
      if (cancelRequested) {
        await db
          .update(demoGenerationJobs)
          .set({
            status: 'cancelled',
            cancelledAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(demoGenerationJobs.id, jobId));
        await appendJobLog(jobId, 'warning', `Job cancelled cleanly after ${totalInserted.toLocaleString()} users.`);
        return;
      }

      const remaining = total - totalInserted;
      const currentBatchCount = Math.min(batchSize, remaining);
      const t0 = Date.now();

      const ids: string[] = new Array(currentBatchCount);
      const emails: string[] = new Array(currentBatchCount);
      const fullNames: string[] = new Array(currentBatchCount);
      const passwordHashes: string[] = new Array(currentBatchCount);
      const rolesArr: string[] = new Array(currentBatchCount);
      const statusesArr: string[] = new Array(currentBatchCount);
      const verifiedArr: boolean[] = new Array(currentBatchCount);
      const langsArr: string[] = new Array(currentBatchCount);
      const themesArr: string[] = new Array(currentBatchCount);
      const aiUsedArr: number[] = new Array(currentBatchCount);
      const aiLimitArr: number[] = new Array(currentBatchCount);
      const storageUsedArr: number[] = new Array(currentBatchCount);
      const storageLimitArr: number[] = new Array(currentBatchCount);
      const isSynthArr: boolean[] = new Array(currentBatchCount);
      const accountTypeArr: string[] = new Array(currentBatchCount);
      const countriesArr: string[] = new Array(currentBatchCount);
      const citiesArr: string[] = new Array(currentBatchCount);
      const activityArr: string[] = new Array(currentBatchCount);
      const sourcesArr: string[] = new Array(currentBatchCount);
      const createdArr: string[] = new Array(currentBatchCount);
      const updatedArr: string[] = new Array(currentBatchCount);

      for (let i = 0; i < currentBatchCount; i++) {
        const idx = totalInserted + i;
        const fName = FICTIONAL_FIRST_NAMES[idx % FICTIONAL_FIRST_NAMES.length];
        const lName =
          FICTIONAL_LAST_NAMES[Math.floor(idx / FICTIONAL_FIRST_NAMES.length) % FICTIONAL_LAST_NAMES.length];

        const rankRole = (idx * PRIME_A + 17) % total;
        const isFree = rankRole < freeCount;
        const role = isFree ? 'free' : 'premium';

        const rankActive = (idx * PRIME_B + 53) % total;
        const isActive = rankActive < activeCount;
        const activityStatus = isActive ? 'active' : 'inactive';

        const rankNew = (idx * PRIME_C + 97) % total;
        const isNewReg = rankNew < newRegCount;
        const tsMs = isNewReg
          ? thirtyDaysAgoMs + (((idx * 7919) % 10000) / 10000) * recentSpanMs
          : startMs + (((idx * 104729) % 10000) / 10000) * olderSpanMs;
        const tsIso = new Date(Math.min(Date.now(), tsMs)).toISOString();

        const rankCountry = (idx * PRIME_D + 131) % total;
        const cIdx = pickByStridedRank(rankCountry, countryCum);
        const countryObj = config.countries[cIdx] || config.countries[0];

        const rankLang = (idx * PRIME_E + 211) % total;
        const lIdx = pickByStridedRank(rankLang, langCum);
        const langObj = config.languages[lIdx] || config.languages[0];

        ids[i] = crypto.randomUUID();
        emails[i] = `demo.${fName.toLowerCase()}.${lName.toLowerCase()}.${runTag}.${idx + 1}@example.com`;
        fullNames[i] = `${fName} ${lName}`;
        passwordHashes[i] = SYNTHETIC_PASSWORD_MARKER;
        rolesArr[i] = role;
        statusesArr[i] = isActive ? 'active' : 'suspended';
        verifiedArr[i] = false;
        langsArr[i] = langObj.code;
        themesArr[i] = idx % 3 === 0 ? 'light' : 'dark';
        aiUsedArr[i] = isActive ? (idx % (isFree ? 24 : 180)) : idx % 3;
        aiLimitArr[i] = isFree ? 50 : 5000;
        storageUsedArr[i] = isActive ? (idx % (isFree ? 240 : 4200)) : 0;
        storageLimitArr[i] = isFree ? 1024 : 51200;
        isSynthArr[i] = true;
        accountTypeArr[i] = 'DEMO';
        countriesArr[i] = countryObj.country;
        citiesArr[i] = countryObj.city;
        activityArr[i] = activityStatus;
        sourcesArr[i] = REGISTRATION_SOURCES[idx % REGISTRATION_SOURCES.length];
        createdArr[i] = tsIso;
        updatedArr[i] = tsIso;
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL statement_timeout = 60000');
        await client.query(
          `INSERT INTO users (
            id, email, full_name, password_hash, role, status, email_verified,
            preferred_language, preferred_theme, ai_queries_used, ai_queries_limit,
            storage_used_mb, storage_limit_mb, is_synthetic, account_type,
            country, city, activity_status, registration_source, created_at, updated_at
          )
          SELECT * FROM unnest(
            $1::uuid[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::boolean[],
            $8::text[], $9::text[], $10::integer[], $11::integer[],
            $12::integer[], $13::integer[], $14::boolean[], $15::text[],
            $16::text[], $17::text[], $18::text[], $19::text[], $20::timestamp[], $21::timestamp[]
          )`,
          [
            ids,
            emails,
            fullNames,
            passwordHashes,
            rolesArr,
            statusesArr,
            verifiedArr,
            langsArr,
            themesArr,
            aiUsedArr,
            aiLimitArr,
            storageUsedArr,
            storageLimitArr,
            isSynthArr,
            accountTypeArr,
            countriesArr,
            citiesArr,
            activityArr,
            sourcesArr,
            createdArr,
            updatedArr,
          ]
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }

      const durationMs = Date.now() - t0;
      batchDurationSum += durationMs;
      totalInserted += currentBatchCount;
      const memNow = Math.round(process.memoryUsage().rss / (1024 * 1024));
      if (memNow > peakMemoryMb) peakMemoryMb = memNow;

      await Promise.all([
        db.insert(demoGenerationBatches).values({
          jobId,
          batchNumber: batchNum,
          tableName: 'users',
          recordsInserted: currentBatchCount,
          durationMs,
          status: 'completed',
        }),
        db
          .update(demoGenerationJobs)
          .set({
            generatedCount: totalInserted,
            peakMemoryMb,
            avgBatchMs: Math.round(batchDurationSum / batchNum),
            updatedAt: new Date(),
          })
          .where(eq(demoGenerationJobs.id, jobId)),
      ]);

      if (batchNum === 1 || batchNum % 10 === 0 || batchNum === totalBatches) {
        await appendJobLog(
          jobId,
          'info',
          `Users batch ${batchNum}/${totalBatches} committed (${totalInserted.toLocaleString()} / ${total.toLocaleString()}).`,
          { durationMs, memoryMb: memNow }
        );
      }

      // Yield briefly to keep Express API responsive
      await new Promise((r) => setTimeout(r, 5));
    }

    // Generate linked synthetic activity across all 10 platform domains
    const activityCounts =
      config.activityScale === 'heavy'
        ? { searches: 12000, ai: 8000, projects: 2500, saved: 4000, videos: 2500, notes: 3000, feedback: 1200, subs: 5000, payments: 3500, ads: 10000 }
        : config.activityScale === 'minimal'
          ? { searches: 2000, ai: 1200, projects: 400, saved: 600, videos: 400, notes: 500, feedback: 200, subs: 800, payments: 500, ads: 1500 }
          : { searches: 6000, ai: 4000, projects: 1200, saved: 2000, videos: 1200, notes: 1500, feedback: 600, subs: 2500, payments: 1800, ads: 5000 };

    const activityTotal = await generateSyntheticActivityInternal(
      jobId,
      activityCounts,
      config.dateRangeStart,
      config.dateRangeEnd
    );

    await db
      .update(demoGenerationJobs)
      .set({
        status: 'completed',
        generatedCount: totalInserted,
        activityGeneratedCount: activityTotal,
        completedAt: new Date(),
        peakMemoryMb,
        updatedAt: new Date(),
      })
      .where(eq(demoGenerationJobs.id, jobId));

    await appendJobLog(
      jobId,
      'info',
      `Completed 500,000 synthetic users and ${activityTotal.toLocaleString()} linked demo activity records.`,
      { peakMemoryMb }
    );
  } catch (err: any) {
    const errMsg = err?.message || 'Unknown generation error';
    await db
      .update(demoGenerationJobs)
      .set({
        status: 'failed',
        errorMessage: errMsg,
        updatedAt: new Date(),
      })
      .where(eq(demoGenerationJobs.id, jobId));
    await appendJobLog(jobId, 'error', `Generation failed: ${errMsg}`);
  } finally {
    if (activeJobId === jobId) {
      activeJobId = null;
      cancelRequested = false;
    }
  }
}

export async function cancelRunningJob(jobId?: string): Promise<boolean> {
  if (!activeJobId) {
    // Check if DB has any stale running job
    const res = await db
      .update(demoGenerationJobs)
      .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(demoGenerationJobs.status, 'running'))
      .returning();
    return res.length > 0;
  }
  if (jobId && jobId !== activeJobId) {
    return false;
  }
  cancelRequested = true;
  return true;
}

export async function generateAdditionalActivityJob(
  adminUserId: string,
  scale: 'minimal' | 'standard' | 'heavy' = 'standard',
  dateRangeStart?: string,
  dateRangeEnd?: string
) {
  await recoverStaleJobsIfNeeded();
  if (activeJobId) {
    throw new Error('Another synthetic data job is currently running.');
  }

  const pool = createPool();
  const check = await pool.query(`SELECT COUNT(*)::int AS cnt FROM users WHERE is_synthetic = true`);
  if (Number(check.rows[0]?.cnt || 0) === 0) {
    throw new Error('Generate the 500,000 synthetic users first before generating additional activity.');
  }

  const [job] = await db
    .insert(demoGenerationJobs)
    .values({
      jobType: 'activity_batch',
      status: 'running',
      targetCount: 0,
      generatedCount: 0,
      activityGeneratedCount: 0,
      batchSize: 5000,
      config: { scale, dateRangeStart, dateRangeEnd },
      startedByAdminId: adminUserId,
      startedAt: new Date(),
    })
    .returning();

  activeJobId = job.id;
  cancelRequested = false;

  const activityCounts =
    scale === 'heavy'
      ? { searches: 12000, ai: 8000, projects: 2500, saved: 4000, videos: 2500, notes: 3000, feedback: 1200, subs: 5000, payments: 3500, ads: 10000 }
      : scale === 'minimal'
        ? { searches: 2000, ai: 1200, projects: 400, saved: 600, videos: 400, notes: 500, feedback: 200, subs: 800, payments: 500, ads: 1500 }
        : { searches: 6000, ai: 4000, projects: 1200, saved: 2000, videos: 1200, notes: 1500, feedback: 600, subs: 2500, payments: 1800, ads: 5000 };

  try {
    const totalActivity = await generateSyntheticActivityInternal(
      job.id,
      activityCounts,
      dateRangeStart || DEFAULT_GENERATOR_CONFIG.dateRangeStart,
      dateRangeEnd || DEFAULT_GENERATOR_CONFIG.dateRangeEnd
    );
    const [updated] = await db
      .update(demoGenerationJobs)
      .set({
        status: 'completed',
        activityGeneratedCount: totalActivity,
        completedAt: new Date(),
        peakMemoryMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
        updatedAt: new Date(),
      })
      .where(eq(demoGenerationJobs.id, job.id))
      .returning();
    await appendJobLog(job.id, 'info', `Generated ${totalActivity.toLocaleString()} linked synthetic activity records.`);
    return { job: updated, totalActivity };
  } catch (err: any) {
    await db
      .update(demoGenerationJobs)
      .set({ status: 'failed', errorMessage: err?.message || 'Activity generation failed', updatedAt: new Date() })
      .where(eq(demoGenerationJobs.id, job.id));
    throw err;
  } finally {
    if (activeJobId === job.id) {
      activeJobId = null;
      cancelRequested = false;
    }
  }
}

async function generateSyntheticActivityInternal(
  jobId: string,
  counts: {
    searches: number;
    ai: number;
    projects: number;
    saved: number;
    videos: number;
    notes: number;
    feedback: number;
    subs: number;
    payments: number;
    ads: number;
  },
  dateRangeStart: string,
  dateRangeEnd: string
): Promise<number> {
  const pool = createPool();
  const runTag = jobId.replace(/-/g, '').slice(0, 8);
  const startMs = new Date(dateRangeStart).getTime() || Date.now() - 365 * 86400_000;
  const endMs = Math.max(startMs + 86400_000, new Date(dateRangeEnd).getTime() || Date.now());
  const spanMs = endMs - startMs;
  const pickTs = (i: number) =>
    new Date(Math.min(Date.now(), startMs + (((i * 2654435761) % 10000) / 10000) * spanMs)).toISOString();

  const [sampleUsersRes, allPlans, allVideos, legacyCampaigns, newCampaigns, newAds] = await Promise.all([
    pool.query(`SELECT id, email, full_name, role FROM users WHERE is_synthetic = true LIMIT 20000`),
    db.select({ id: plans.id, slug: plans.slug, monthlyPriceRwf: plans.monthlyPriceRwf }).from(plans),
    db.select({ id: videos.id, title: videos.title }).from(videos).limit(50),
    db.select({ id: adCampaigns.id }).from(adCampaigns).limit(20),
    pool.query(`SELECT id FROM advertisement_campaigns LIMIT 20`),
    db.select({ id: advertisements.id, campaignId: advertisements.campaignId }).from(advertisements).limit(20),
  ]);

  const sampleUsers = sampleUsersRes.rows as Array<{ id: string; email: string; full_name: string; role: string }>;
  if (sampleUsers.length === 0) return 0;

  let totalInserted = 0;
  let batchNo = 100;

  const runBatchTx = async (tableName: string, rowCount: number, execFn: (client: any) => Promise<void>) => {
    const t0 = Date.now();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL statement_timeout = 60000');
      await execFn(client);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    totalInserted += rowCount;
    batchNo += 1;
    await db.insert(demoGenerationBatches).values({
      jobId,
      batchNumber: batchNo,
      tableName,
      recordsInserted: rowCount,
      durationMs: Date.now() - t0,
      status: 'completed',
    });
  };

  // 1. Search history
  if (counts.searches > 0) {
    const n = counts.searches;
    const ids = new Array(n);
    const uids = new Array(n);
    const queries = new Array(n);
    const mods = new Array(n);
    const resCounts = new Array(n);
    const synths = new Array(n).fill(true);
    const ts = new Array(n);
    const modalities = ['all', 'academic', 'videos', 'news', 'websites'];
    for (let i = 0; i < n; i++) {
      ids[i] = crypto.randomUUID();
      uids[i] = sampleUsers[i % sampleUsers.length].id;
      queries[i] = SYNTHETIC_QUERIES[i % SYNTHETIC_QUERIES.length];
      mods[i] = modalities[i % modalities.length];
      resCounts[i] = 6 + (i % 18);
      ts[i] = pickTs(i);
    }
    await runBatchTx('search_history', n, (client) =>
      client.query(
        `INSERT INTO search_history (id, user_id, query, modality, results_count, is_synthetic, created_at)
         SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::text[], $5::integer[], $6::boolean[], $7::timestamp[])`,
        [ids, uids, queries, mods, resCounts, synths, ts]
      )
    );
  }

  // 2. Simulated AI requests + AI usage logs (never consumes real AI credits!)
  if (counts.ai > 0) {
    const n = counts.ai;
    const reqIds = new Array(n);
    const uids = new Array(n);
    const modes = new Array(n);
    const depths = new Array(n);
    const intents = new Array(n);
    const prompts = new Array(n);
    const statuses = new Array(n).fill('completed');
    const latencies = new Array(n);
    const synths = new Array(n).fill(true);
    const ts = new Array(n);

    const logIds = new Array(n);
    const provSlugs = new Array(n).fill('demo_simulator');
    const modelKeys = new Array(n).fill('synthetic-benchmark-sim');
    const inTokens = new Array(n);
    const outTokens = new Array(n);
    const logStatuses = new Array(n).fill('simulated');

    const modeOpts = ['ask', 'smart_answer', 'research_intelligence', 'deep_research'];
    const depthOpts = ['fast', 'fast', 'balanced', 'deep'];
    const intentOpts = ['simple_qa', 'general_explanation', 'academic_research', 'complex_research'];

    for (let i = 0; i < n; i++) {
      reqIds[i] = crypto.randomUUID();
      logIds[i] = crypto.randomUUID();
      uids[i] = sampleUsers[(i * 3) % sampleUsers.length].id;
      modes[i] = modeOpts[i % modeOpts.length];
      depths[i] = depthOpts[i % depthOpts.length];
      intents[i] = intentOpts[i % intentOpts.length];
      prompts[i] = `[SIMULATED] ${SYNTHETIC_QUERIES[i % SYNTHETIC_QUERIES.length]}`;
      latencies[i] = 450 + (i % 2400);
      inTokens[i] = 180 + (i % 420);
      outTokens[i] = 260 + (i % 650);
      ts[i] = pickTs(i + 17);
    }

    await runBatchTx('ai_requests', n, (client) =>
      client.query(
        `INSERT INTO ai_requests (id, user_id, mode, research_depth, intent_category, prompt_summary, status, latency_ms, is_synthetic, created_at)
         SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::integer[], $9::boolean[], $10::timestamp[])`,
        [reqIds, uids, modes, depths, intents, prompts, statuses, latencies, synths, ts]
      )
    );

    await runBatchTx('ai_usage_logs', n, (client) =>
      client.query(
        `INSERT INTO ai_usage_logs (id, user_id, provider_slug, model_key, mode, input_tokens, output_tokens, status, is_synthetic, created_at)
         SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::text[], $5::text[], $6::integer[], $7::integer[], $8::text[], $9::boolean[], $10::timestamp[])`,
        [logIds, uids, provSlugs, modelKeys, modes, inTokens, outTokens, logStatuses, synths, ts]
      )
    );
  }

  // 3. Research projects
  if (counts.projects > 0) {
    const n = counts.projects;
    const ids = new Array(n);
    const uids = new Array(n);
    const titles = new Array(n);
    const topics = new Array(n);
    const statuses = new Array(n);
    const synths = new Array(n).fill(true);
    const ts = new Array(n);
    for (let i = 0; i < n; i++) {
      const t = SYNTHETIC_TOPICS[i % SYNTHETIC_TOPICS.length];
      ids[i] = crypto.randomUUID();
      uids[i] = sampleUsers[(i * 5) % sampleUsers.length].id;
      titles[i] = `${t} Study #${i + 1}`;
      topics[i] = t;
      statuses[i] = i % 3 === 0 ? 'completed' : 'in_progress';
      ts[i] = pickTs(i + 41);
    }
    await runBatchTx('research_projects', n, (client) =>
      client.query(
        `INSERT INTO research_projects (id, user_id, title, topic, status, is_synthetic, created_at, updated_at)
         SELECT *, created_at FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::text[], $5::text[], $6::boolean[], $7::timestamp[]) AS t(id, user_id, title, topic, status, is_synthetic, created_at)`,
        [ids, uids, titles, topics, statuses, synths, ts]
      )
    );
  }

  // 4. Saved resources
  if (counts.saved > 0) {
    const n = counts.saved;
    const ids = new Array(n);
    const uids = new Array(n);
    const types = new Array(n);
    const titles = new Array(n);
    const cats = new Array(n);
    const synths = new Array(n).fill(true);
    const ts = new Array(n);
    const itemTypes = ['research', 'article', 'video', 'answer'];
    const catNames = ['Computer Science', 'Medicine', 'Physics', 'Economics', 'Climate'];
    for (let i = 0; i < n; i++) {
      ids[i] = crypto.randomUUID();
      uids[i] = sampleUsers[(i * 7) % sampleUsers.length].id;
      types[i] = itemTypes[i % itemTypes.length];
      titles[i] = `Synthetic Library Entry: ${SYNTHETIC_TOPICS[i % SYNTHETIC_TOPICS.length]}`;
      cats[i] = catNames[i % catNames.length];
      ts[i] = pickTs(i + 73);
    }
    await runBatchTx('saved_items', n, (client) =>
      client.query(
        `INSERT INTO saved_items (id, user_id, type, title, category, is_synthetic, created_at, updated_at)
         SELECT *, created_at FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::text[], $5::text[], $6::boolean[], $7::timestamp[]) AS t(id, user_id, type, title, category, is_synthetic, created_at)`,
        [ids, uids, types, titles, cats, synths, ts]
      )
    );
  }

  // 5. Video interactions (saved_videos & video_notes)
  if (counts.videos > 0 && allVideos.length > 0) {
    const n = counts.videos;
    const svIds = new Array(n);
    const vnIds = new Array(n);
    const vids = new Array(n);
    const uids = new Array(n);
    const notes = new Array(n);
    const synths = new Array(n).fill(true);
    const ts = new Array(n);
    for (let i = 0; i < n; i++) {
      svIds[i] = crypto.randomUUID();
      vnIds[i] = crypto.randomUUID();
      vids[i] = allVideos[i % allVideos.length].id;
      uids[i] = sampleUsers[(i * 11) % sampleUsers.length].id;
      notes[i] = `Demo study timestamp note #${i + 1}`;
      ts[i] = pickTs(i + 99);
    }
    await runBatchTx('saved_videos', n, (client) =>
      client.query(
        `INSERT INTO saved_videos (id, video_id, user_id, notes, is_synthetic, created_at)
         SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::text[], $5::boolean[], $6::timestamp[])`,
        [svIds, vids, uids, notes, synths, ts]
      )
    );
    await runBatchTx('video_notes', n, (client) =>
      client.query(
        `INSERT INTO video_notes (id, video_id, user_id, content, is_synthetic, created_at, updated_at)
         SELECT *, created_at FROM unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::text[], $5::boolean[], $6::timestamp[]) AS t(id, video_id, user_id, content, is_synthetic, created_at)`,
        [vnIds, vids, uids, notes, synths, ts]
      )
    );
  }

  // 6. Notes activity (knowledge_notes)
  if (counts.notes > 0) {
    const n = counts.notes;
    const ids = new Array(n);
    const uids = new Array(n);
    const titles = new Array(n);
    const contents = new Array(n);
    const synths = new Array(n).fill(true);
    const ts = new Array(n);
    for (let i = 0; i < n; i++) {
      ids[i] = crypto.randomUUID();
      uids[i] = sampleUsers[(i * 13) % sampleUsers.length].id;
      titles[i] = `Demo Research Note: ${SYNTHETIC_TOPICS[i % SYNTHETIC_TOPICS.length]}`;
      contents[i] = `Synthetic structured notes entry #${i + 1} for analytics simulation.`;
      ts[i] = pickTs(i + 123);
    }
    await runBatchTx('knowledge_notes', n, (client) =>
      client.query(
        `INSERT INTO knowledge_notes (id, user_id, title, content, is_synthetic, created_at, updated_at)
         SELECT *, created_at FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::text[], $5::boolean[], $6::timestamp[]) AS t(id, user_id, title, content, is_synthetic, created_at)`,
        [ids, uids, titles, contents, synths, ts]
      )
    );
  }

  // 7. Feedback submissions (suppressed email dispatch)
  if (counts.feedback > 0) {
    const n = counts.feedback;
    const ids = new Array(n);
    const refs = new Array(n);
    const uids = new Array(n);
    const names = new Array(n);
    const emails = new Array(n);
    const cats = new Array(n);
    const subjs = new Array(n);
    const msgs = new Array(n);
    const statuses = new Array(n);
    const dispatch = new Array(n).fill('suppressed_synthetic');
    const synths = new Array(n).fill(true);
    const ts = new Array(n);
    const fbCats = ['Feature Suggestion', 'Search Quality', 'AI Accuracy', 'Video Player'];
    const fbStat = ['new', 'in_review', 'resolved'];
    for (let i = 0; i < n; i++) {
      const u = sampleUsers[(i * 17) % sampleUsers.length];
      ids[i] = crypto.randomUUID();
      refs[i] = `DEMO-FB-${runTag}-${i + 1}`;
      uids[i] = u.id;
      names[i] = u.full_name;
      emails[i] = u.email;
      cats[i] = fbCats[i % fbCats.length];
      subjs[i] = `Synthetic Feedback Sample #${i + 1}`;
      msgs[i] = 'Demo feedback record generated strictly for analytics testing.';
      statuses[i] = fbStat[i % fbStat.length];
      ts[i] = pickTs(i + 149);
    }
    await runBatchTx('feedback_submissions', n, (client) =>
      client.query(
        `INSERT INTO feedback_submissions (id, reference_number, user_id, full_name, email, category, subject, message, status, email_dispatch_status, is_synthetic, created_at, updated_at)
         SELECT *, created_at FROM unnest($1::uuid[], $2::text[], $3::uuid[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::boolean[], $12::timestamp[]) AS t(id, reference_number, user_id, full_name, email, category, subject, message, status, email_dispatch_status, is_synthetic, created_at)`,
        [ids, refs, uids, names, emails, cats, subjs, msgs, statuses, dispatch, synths, ts]
      )
    );
  }

  // 8. Demo subscriptions & Demo-only simulated transactions (NEVER counted as real revenue)
  const premiumSample = sampleUsers.filter((u) => u.role === 'premium');
  const subPool = premiumSample.length > 0 ? premiumSample : sampleUsers;
  const premiumPlan = allPlans.find((p) => p.slug === 'premium') || allPlans[0];
  if (counts.subs > 0 && premiumPlan) {
    const n = counts.subs;
    const ids = new Array(n);
    const uids = new Array(n);
    const pids = new Array(n).fill(premiumPlan.id);
    const statuses = new Array(n);
    const cycles = new Array(n);
    const starts = new Array(n);
    const expires = new Array(n);
    const synths = new Array(n).fill(true);
    for (let i = 0; i < n; i++) {
      ids[i] = crypto.randomUUID();
      uids[i] = subPool[i % subPool.length].id;
      statuses[i] = i % 8 === 0 ? 'expired' : 'active';
      cycles[i] = i % 4 === 0 ? 'annual' : 'monthly';
      const st = new Date(pickTs(i + 179));
      starts[i] = st.toISOString();
      expires[i] = new Date(st.getTime() + (cycles[i] === 'annual' ? 365 : 30) * 86400_000).toISOString();
    }
    await runBatchTx('subscriptions', n, (client) =>
      client.query(
        `INSERT INTO subscriptions (id, user_id, plan_id, status, billing_cycle, starts_at, expires_at, is_synthetic, created_at, updated_at)
         SELECT *, starts_at, starts_at FROM unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::text[], $5::text[], $6::timestamp[], $7::timestamp[], $8::boolean[]) AS t(id, user_id, plan_id, status, billing_cycle, starts_at, expires_at, is_synthetic)`,
        [ids, uids, pids, statuses, cycles, starts, expires, synths]
      )
    );
  }

  if (counts.payments > 0) {
    const n = counts.payments;
    const ids = new Array(n);
    const uids = new Array(n);
    const refs = new Array(n);
    const amounts = new Array(n);
    const currencies = new Array(n).fill('RWF');
    const providers = new Array(n).fill('demo_simulator');
    const statuses = new Array(n).fill('demo_simulated');
    const planSlugs = new Array(n).fill('premium');
    const cycles = new Array(n);
    const synths = new Array(n).fill(true);
    const demoTx = new Array(n).fill(true);
    const ts = new Array(n);
    for (let i = 0; i < n; i++) {
      ids[i] = crypto.randomUUID();
      uids[i] = subPool[i % subPool.length].id;
      refs[i] = `DEMO-TX-${runTag}-${i + 1}`;
      cycles[i] = i % 4 === 0 ? 'annual' : 'monthly';
      amounts[i] = cycles[i] === 'annual' ? 99000 : 12000;
      ts[i] = pickTs(i + 211);
    }
    await runBatchTx('payments', n, (client) =>
      client.query(
        `INSERT INTO payments (id, user_id, transaction_ref, amount, currency, provider, status, plan_slug, billing_cycle, is_synthetic, is_demo_transaction, created_at)
         SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::integer[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::boolean[], $11::boolean[], $12::timestamp[])`,
        [ids, uids, refs, amounts, currencies, providers, statuses, planSlugs, cycles, synths, demoTx, ts]
      )
    );
  }

  // 9. Simulated Ad Impressions & Clicks (NEVER mutates real campaign billing totals!)
  if (counts.ads > 0) {
    const n = counts.ads;
    if (legacyCampaigns.length > 0) {
      const ids = new Array(n);
      const cids = new Array(n);
      const evTypes = new Array(n);
      const uids = new Array(n);
      const synths = new Array(n).fill(true);
      const ts = new Array(n);
      for (let i = 0; i < n; i++) {
        ids[i] = crypto.randomUUID();
        cids[i] = legacyCampaigns[i % legacyCampaigns.length].id;
        evTypes[i] = i % 15 === 0 ? 'click' : 'impression';
        uids[i] = sampleUsers[(i * 19) % sampleUsers.length].id;
        ts[i] = pickTs(i + 251);
      }
      await runBatchTx('ad_events', n, (client) =>
        client.query(
          `INSERT INTO ad_events (id, campaign_id, event_type, user_id, is_synthetic, created_at)
           SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::uuid[], $5::boolean[], $6::timestamp[])`,
          [ids, cids, evTypes, uids, synths, ts]
        )
      );
    }

    const newCampRows = newCampaigns.rows as Array<{ id: string }>;
    if (newCampRows.length > 0 || newAds.length > 0) {
      const ids = new Array(n);
      const adIds = new Array(n);
      const cids = new Array(n);
      const codes = new Array(n);
      const evTypes = new Array(n);
      const uids = new Array(n);
      const synths = new Array(n).fill(true);
      const ts = new Array(n);
      const placementCodes = ['home_banner', 'search_sponsored', 'video_preroll', 'sidebar_card'];
      for (let i = 0; i < n; i++) {
        const ad = newAds[i % Math.max(1, newAds.length)];
        ids[i] = crypto.randomUUID();
        adIds[i] = ad ? ad.id : null;
        cids[i] = ad?.campaignId || newCampRows[i % Math.max(1, newCampRows.length)]?.id || null;
        codes[i] = placementCodes[i % placementCodes.length];
        evTypes[i] = i % 14 === 0 ? 'click' : 'impression';
        uids[i] = sampleUsers[(i * 23) % sampleUsers.length].id;
        ts[i] = pickTs(i + 271);
      }
      await runBatchTx('advertisement_events', n, (client) =>
        client.query(
          `INSERT INTO advertisement_events (id, advertisement_id, campaign_id, placement_code, event_type, user_id, is_synthetic, created_at)
           SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::text[], $5::text[], $6::uuid[], $7::boolean[], $8::timestamp[])`,
          [ids, adIds, cids, codes, evTypes, uids, synths, ts]
        )
      );
    }
  }

  return totalInserted;
}

export async function deleteAllSyntheticData(adminUserId: string, resetHistory = false) {
  await recoverStaleJobsIfNeeded();
  if (activeJobId) {
    throw new Error('Cancel the running generation job before deleting synthetic data.');
  }

  const pool = createPool();
  const [job] = await db
    .insert(demoGenerationJobs)
    .values({
      jobType: 'cleanup',
      status: 'running',
      targetCount: 0,
      generatedCount: 0,
      startedByAdminId: adminUserId,
      startedAt: new Date(),
    })
    .returning();

  activeJobId = job.id;

  const beforeReal = await pool.query(`SELECT COUNT(*)::int AS cnt FROM users WHERE is_synthetic = false`);
  const realCountBefore = Number(beforeReal.rows[0]?.cnt || 0);

  let deletedUsersTotal = 0;
  const client = await pool.connect();
  try {
    await client.query('SET LOCAL statement_timeout = 120000').catch(() => {});
    // Delete standalone synthetic activity rows first so deletes stay fast
    for (const tbl of [
      'ad_events',
      'advertisement_events',
      'payments',
      'subscriptions',
      'feedback_submissions',
      'video_notes',
      'saved_videos',
      'knowledge_notes',
      'saved_items',
      'research_projects',
      'ai_usage_logs',
      'ai_requests',
      'search_history',
    ]) {
      await client.query(`DELETE FROM ${tbl} WHERE is_synthetic = true`);
    }

    // Delete synthetic users in 50,000-row chunks so PostgreSQL never hits lock/timeout ceilings
    while (true) {
      await client.query('BEGIN');
      await client.query('SET LOCAL statement_timeout = 120000');
      const delRes = await client.query(`
        DELETE FROM users
        WHERE id IN (
          SELECT id FROM users WHERE is_synthetic = true LIMIT 50000
        )
      `);
      await client.query('COMMIT');
      const countDeleted = delRes.rowCount || 0;
      deletedUsersTotal += countDeleted;
      if (countDeleted < 50000) break;
    }

    if (resetHistory) {
      await client.query(`DELETE FROM demo_generation_jobs WHERE id <> $1`, [job.id]);
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    await db
      .update(demoGenerationJobs)
      .set({ status: 'failed', errorMessage: (err as Error).message, updatedAt: new Date() })
      .where(eq(demoGenerationJobs.id, job.id));
    throw err;
  } finally {
    client.release();
    if (activeJobId === job.id) {
      activeJobId = null;
    }
  }

  const afterReal = await pool.query(`SELECT COUNT(*)::int AS cnt FROM users WHERE is_synthetic = false`);
  const realCountAfter = Number(afterReal.rows[0]?.cnt || 0);

  await db
    .update(demoGenerationJobs)
    .set({
      status: 'completed',
      generatedCount: deletedUsersTotal,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(demoGenerationJobs.id, job.id));

  await appendJobLog(
    job.id,
    'info',
    `Deleted ${deletedUsersTotal.toLocaleString()} synthetic users and all linked demo activity. Genuine users preserved (${realCountAfter}).`,
    { realCountBefore, realCountAfter }
  );

  return {
    deletedUsers: deletedUsersTotal,
    realUsersPreserved: realCountAfter,
  };
}

export async function querySyntheticUsersPaginated(params: {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  activityStatus?: string;
  country?: string;
  language?: string;
}) {
  const pool = createPool();
  const page = Math.max(1, Number(params.page || 1));
  const limit = Math.min(100, Math.max(10, Number(params.limit || 25)));
  const offset = (page - 1) * limit;

  const conditions: string[] = ['is_synthetic = true'];
  const values: any[] = [];

  if (params.role && params.role !== 'all') {
    values.push(params.role);
    conditions.push(`role = $${values.length}`);
  }
  if (params.activityStatus && params.activityStatus !== 'all') {
    values.push(params.activityStatus);
    conditions.push(`activity_status = $${values.length}`);
  }
  if (params.country && params.country !== 'all') {
    values.push(params.country);
    conditions.push(`country = $${values.length}`);
  }
  if (params.language && params.language !== 'all') {
    values.push(params.language);
    conditions.push(`preferred_language = $${values.length}`);
  }
  if (params.search && params.search.trim()) {
    values.push(`%${params.search.trim()}%`);
    conditions.push(`(full_name ILIKE $${values.length} OR email ILIKE $${values.length})`);
  }

  const whereSql = conditions.join(' AND ');

  const [countRes, rowsRes] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total FROM users WHERE ${whereSql}`, values),
    pool.query(
      `SELECT id, email, full_name, role, status, account_type, country, city, activity_status,
              preferred_language, registration_source, ai_queries_used, ai_queries_limit, created_at
       FROM users
       WHERE ${whereSql}
       ORDER BY created_at DESC, id ASC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    ),
  ]);

  const total = Number(countRes.rows[0]?.total || 0);
  return {
    users: rowsRes.rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}
