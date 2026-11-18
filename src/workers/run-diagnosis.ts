/**
 * RemediAide — BullMQ Run-Diagnosis Worker
 *
 * Queue: 'run-diagnosis'
 * Job payload: { sessionId: string }
 *
 * On execute:
 *   1. Call computeConceptDiagnosis(sessionId)
 *   2. Broadcast final heatmap state via sseManager (already done inside compute)
 *
 * Follows the same lazy-init Redis pattern as auto-close.ts.
 * All exports are no-ops when REDIS_URL is not set (test / dev environments).
 */

import type { Job } from 'bullmq';

const REDIS_URL = process.env.REDIS_URL;
const IS_TEST = process.env.NODE_ENV === 'test';

export const QUEUE_NAME = 'run-diagnosis';

export interface RunDiagnosisJobData {
  sessionId: string;
}

import type { Queue as BullQueue, Worker as BullWorker } from 'bullmq';

let _queue: BullQueue<RunDiagnosisJobData> | null = null;
let _worker: BullWorker<RunDiagnosisJobData> | null = null;

function parseRedisConnection(url: string) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || '127.0.0.1',
      port: parseInt(parsed.port || '6379', 10),
      password: parsed.password || undefined,
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
    };
  } catch {
    return { host: '127.0.0.1', port: 6379 };
  }
}

function getQueue(): BullQueue<RunDiagnosisJobData> | null {
  if (IS_TEST || !REDIS_URL) return null;
  if (!_queue) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Queue } = require('bullmq') as typeof import('bullmq');
    _queue = new Queue<RunDiagnosisJobData>(QUEUE_NAME, {
      connection: parseRedisConnection(REDIS_URL),
      defaultJobOptions: {
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });
  }
  return _queue;
}

// ─── Job processor ────────────────────────────────────────────────────────────

async function processRunDiagnosis(
  job: Job<RunDiagnosisJobData>
): Promise<void> {
  const { sessionId } = job.data;
  console.info(`[run-diagnosis] Starting diagnosis for session ${sessionId}.`);

  const { computeConceptDiagnosis } = await import('@/lib/diagnosis/compute');
  await computeConceptDiagnosis(sessionId);

  console.info(`[run-diagnosis] Completed diagnosis for session ${sessionId}.`);
}

// ─── Worker factory (NOT auto-started) ───────────────────────────────────────

export function createRunDiagnosisWorker(): BullWorker<RunDiagnosisJobData> | null {
  if (IS_TEST || !REDIS_URL) {
    console.warn('[run-diagnosis] No REDIS_URL configured — worker will not start.');
    return null;
  }

  if (!_worker) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Worker } = require('bullmq') as typeof import('bullmq');
    _worker = new Worker<RunDiagnosisJobData>(
      QUEUE_NAME,
      processRunDiagnosis,
      { connection: parseRedisConnection(REDIS_URL) }
    );

    _worker.on('completed', (job) => {
      console.info(`[run-diagnosis] Job ${job.id} completed for session ${job.data.sessionId}.`);
    });

    _worker.on('failed', (job, err) => {
      console.error(
        `[run-diagnosis] Job ${job?.id} failed for session ${job?.data?.sessionId}:`,
        err
      );
    });
  }

  return _worker;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Enqueue a run-diagnosis job for the given session.
 * No-op in test / no-Redis environments.
 */
export async function enqueueRunDiagnosis(sessionId: string): Promise<void> {
  const queue = getQueue();
  if (!queue) {
    console.warn(`[run-diagnosis] No queue — enqueueRunDiagnosis(${sessionId}) skipped.`);
    return;
  }

  await queue.add(
    'run-diagnosis',
    { sessionId },
    { jobId: `run-diagnosis:${sessionId}` } // idempotent
  );

  console.info(`[run-diagnosis] Enqueued diagnosis job for session ${sessionId}.`);
}
