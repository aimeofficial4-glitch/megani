type JobTask = () => Promise<void>;

interface QueueItem {
  label: string;
  task: JobTask;
}

const pending: QueueItem[] = [];
let activeCount = 0;
const MAX_CONCURRENCY = 4;

const workerStats = {
  enqueued: 0,
  completed: 0,
  failed: 0,
};

function pumpQueue() {
  while (activeCount < MAX_CONCURRENCY && pending.length > 0) {
    const item = pending.shift();
    if (!item) break;
    activeCount += 1;
    Promise.resolve()
      .then(() => item.task())
      .then(() => {
        workerStats.completed += 1;
      })
      .catch((err) => {
        workerStats.failed += 1;
        console.error(`[BackgroundWorker:${item.label}] failed:`, err?.message || err);
      })
      .finally(() => {
        activeCount -= 1;
        if (pending.length > 0) {
          setImmediate(pumpQueue);
        }
      });
  }
}

export function enqueueBackgroundJob(label: string, task: JobTask): void {
  if (pending.length > 500) {
    // Drop oldest non-critical telemetry write under extreme backpressure
    pending.shift();
  }
  workerStats.enqueued += 1;
  pending.push({ label, task });
  setImmediate(pumpQueue);
}

export function getBackgroundWorkerStats() {
  return {
    ...workerStats,
    activeCount,
    queuedCount: pending.length,
  };
}
