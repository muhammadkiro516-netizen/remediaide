/**
 * RemediAide — BullMQ Auto-Close Worker
 *
 * Queue: 'session-auto-close'
 * Job payload: { sessionId: string }
 *
 * On execute:
 *   1. Load session from DB
 *   2. If state === ACTIVE, transition to CLOSED (set closed_at = now())
 *   3. Log intention to enqueue 'run-diagnosis' (Task 12 will implement the worker)
 *
 * The worker is exported but NOT auto-started — it is started by a separate
 * long-running process (e.g. `node src/workers/index.js`).
 *
 * In test environments (no REDIS_URL), all exported functions become no-ops
 * so tests can import this module without a live Redis connection.
 */

import type { Job } from 'bullmq';

// ─── Environment guard ────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL;
const IS_TEST = process.env.NODE_ENV === 'test';

// ─── Redis connection options ─────────────────────────────────────────────────

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

// ─── Queue name ───────────────────────────────────────────────────────────────

export const QUEUE_NAME = 'session-auto-close';

// ─── Job payload type ─────────────────────────────────────────────────────────

export interface AutoCloseJobData {
  sessionId: string;
}

// ─── Conditional BullMQ setup ─────────────────────────────────────────────────
// We use dynamic lazy-initialization so that in environments without Redis
// (including Vitest unit tests) nothing throws on import.

import type { Queue as BullQueue, Worker as BullWorker } from 'bullmq';

let _queue: BullQueue<AutoCloseJobData> | null = null;
let _worker: BullWorker<AutoCloseJobData> | null = null;

function getQueue(): BullQueue<AutoCloseJobData> | null {
  if (IS_TEST || !REDIS_URL) return null;

  if (!_queue) {
    // Dynamic require to avoid issues in test environments
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Queue } = require('bullmq') as typeof import('bullmq');
    _queue = new Queue<AutoCloseJobData>(QUEUE_NAME, {
      connection: parseRedisConnection(REDIS_URL),
      defaultJobOptions: {
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });
  }

  return _queue;
}

// Re-export for consumers that need a typed Queue reference
export const sessionQueue: BullQueue<AutoCloseJobData> = new Proxy(
  {} as BullQueue<AutoCloseJobData>,
  {
    get(_target, prop) {
      const q = getQueue();
      if (!q) return undefined;
      const val = (q as unknown as Record<string | symbol, unknown>)[prop];
      return typeof val === 'function' ? val.bind(q) : val;
    },
  }
);

// ─── Job processor ────────────────────────────────────────────────────────────

export async function processAutoClose(
  job: Job<AutoCloseJobData>
): Promise<void> {
  const { sessionId } = job.data;

  // Import prisma lazily to avoid issues in test environments
  const { prisma } = await import('@/lib/db/client');

  const session = await prisma.sessionPin.findUnique({
    where: { id: sessionId },
    select: { id: true, state: true },
  });

  if (!session) {
    console.warn(
      `[auto-close] Session ${sessionId} not found — skipping.`
    );
    return;
  }

  if (session.state !== 'ACTIVE') {
    console.info(
      `[auto-close] Session ${sessionId} is already '${session.state}' — no action needed.`
    );
    return;
  }

  await prisma.sessionPin.update({
    where: { id: sessionId },
    data: {
      state: 'CLOSED',
      closedAt: new Date(),
    },
  });

  console.info(
    `[auto-close] Session ${sessionId} transitioned ACTIVE → CLOSED.`
  );

  // Enqueue run-diagnosis job (fire-and-forget)
  try {
    const { enqueueRunDiagnosis } = await import('./run-diagnosis');
    await enqueueRunDiagnosis(sessionId);
  } catch (err) {
    console.error(
      `[auto-close] Failed to enqueue run-diagnosis for session ${sessionId}:`,
      err
    );
  }
}

// ─── Worker factory (NOT auto-started) ───────────────────────────────────────

/**
 * Create and return the BullMQ Worker.
 * Call this from a dedicated worker process — never from Next.js route handlers.
 */
export function createAutoCloseWorker(): BullWorker<AutoCloseJobData> | null {
  if (IS_TEST || !REDIS_URL) {
    console.warn(
      '[auto-close] No REDIS_URL configured — worker will not start.'
    );
    return null;
  }

  if (!_worker) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Worker } = require('bullmq') as typeof import('bullmq');
    _worker = new Worker<AutoCloseJobData>(
      QUEUE_NAME,
      processAutoClose,
      { connection: parseRedisConnection(REDIS_URL) }
    );

    _worker.on('completed', (job) => {
      console.info(
        `[auto-close] Job ${job.id} completed for session ${job.data.sessionId}.`
      );
    });

    _worker.on('failed', (job, err) => {
      console.error(
        `[auto-close] Job ${job?.id} failed for session ${job?.data?.sessionId}:`,
        err
      );
    });
  }

  return _worker;
}

// ─── Queue helpers (public API) ───────────────────────────────────────────────

/**
 * Enqueue an auto-close job for the given session with the specified delay.
 *
 * In test / no-Redis environments this is a no-op that logs a warning.
 *
 * @param sessionId - The SessionPin.id to close
 * @param delayMs   - Delay before execution in milliseconds (default 900_000)
 */
export async function enqueueAutoClose(
  sessionId: string,
  delayMs: number = 900_000
): Promise<void> {
  const queue = getQueue();
  if (!queue) {
    console.warn(
      `[auto-close] No queue available — enqueueAutoClose(${sessionId}) skipped.`
    );
    return;
  }

  await queue.add(
    'auto-close-session',
    { sessionId },
    {
      delay: delayMs,
      jobId: `auto-close:${sessionId}`, // idempotent — only one pending job per session
    }
  );

  console.info(
    `[auto-close] Enqueued auto-close for session ${sessionId} with ${delayMs}ms delay.`
  );
}

/**
 * Cancel a pending auto-close job for the given session.
 * Silently succeeds if no job is found (idempotent).
 *
 * @param sessionId - The SessionPin.id whose pending job should be cancelled
 */
export async function cancelAutoClose(sessionId: string): Promise<void> {
  const queue = getQueue();
  if (!queue) {
    console.warn(
      `[auto-close] No queue available — cancelAutoClose(${sessionId}) skipped.`
    );
    return;
  }

  const jobId = `auto-close:${sessionId}`;
  const job = await queue.getJob(jobId);

  if (!job) {
    console.info(
      `[auto-close] No pending job found for session ${sessionId} — nothing to cancel.`
    );
    return;
  }

  await job.remove();
  console.info(
    `[auto-close] Cancelled pending auto-close job for session ${sessionId}.`
  );
}
