/**
 * Custom Session Duration — Auto-Close Worker Property-Based Tests
 * src/__tests__/custom-session-duration/auto-close-worker.test.ts
 *
 * Property 9: Auto-Close Idempotency on CLOSED sessions
 *
 * For any session already in CLOSED state, processAutoClose should NOT call
 * prisma.sessionPin.update — the worker must be idempotent and skip gracefully.
 *
 * _Requirements: 4.5_
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type { Job } from 'bullmq';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const prismaMocks = vi.hoisted(() => ({
  sessionPinFindUnique: vi.fn(),
  sessionPinUpdate: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    sessionPin: {
      findUnique: prismaMocks.sessionPinFindUnique,
      update: prismaMocks.sessionPinUpdate,
    },
  },
}));

// Mock run-diagnosis to prevent side effects
vi.mock('@/workers/run-diagnosis', () => ({
  enqueueRunDiagnosis: vi.fn().mockResolvedValue(undefined),
}));

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Helper: build a mock BullMQ Job ─────────────────────────────────────────

function makeJob(sessionId: string): Job<{ sessionId: string }> {
  return {
    id: `job-${sessionId}`,
    data: { sessionId },
    name: 'auto-close-session',
    opts: {},
    timestamp: Date.now(),
    attemptsMade: 0,
    processedOn: undefined,
    finishedOn: undefined,
    returnvalue: undefined,
    stacktrace: [],
    progress: vi.fn(),
    log: vi.fn(),
    update: vi.fn(),
    updateData: vi.fn(),
    discard: vi.fn(),
    remove: vi.fn(),
    retry: vi.fn(),
    getState: vi.fn(),
    moveToDelayed: vi.fn(),
    promote: vi.fn(),
    toJSON: vi.fn(),
    asJSON: vi.fn(),
    queue: {} as never,
    prefix: 'bull',
    queueName: 'session-auto-close',
    queueQualifiedName: 'bull:session-auto-close',
    isCompleted: vi.fn(),
    isFailed: vi.fn(),
    isDelayed: vi.fn(),
    isActive: vi.fn(),
    isWaiting: vi.fn(),
    isWaitingChildren: vi.fn(),
    isPaused: vi.fn(),
    isDependenciesResolved: vi.fn(),
    changePriority: vi.fn(),
    waitUntilFinished: vi.fn(),
    extendLock: vi.fn(),
  } as unknown as Job<{ sessionId: string }>;
}

// ─── Property-Based Tests ─────────────────────────────────────────────────────

describe('Auto-Close Worker — Property-Based Tests (fast-check)', () => {
  /**
   * Feature: custom-session-duration, Property 9: auto-close idempotency on CLOSED sessions
   * For any session already in CLOSED state, processAutoClose should NOT call prisma.update
   *
   * Validates: Requirements 4.5
   */
  it('Property 9 — auto-close idempotency: does NOT call prisma.update for already-CLOSED sessions', async () => {
    const { processAutoClose } = await import('@/workers/auto-close');

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          id: fc.uuid(),
          state: fc.constant('CLOSED'),
          closedAt: fc.date(),
        }),
        async (closedSession) => {
          vi.clearAllMocks();

          // Mock findUnique to return the already-closed session
          prismaMocks.sessionPinFindUnique.mockResolvedValue({
            id: closedSession.id,
            state: closedSession.state,
          });
          prismaMocks.sessionPinUpdate.mockResolvedValue({});

          const job = makeJob(closedSession.id);

          await processAutoClose(job);

          // The worker must NOT attempt to update a session that is already CLOSED
          expect(prismaMocks.sessionPinUpdate).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 50 }
    );
  });
});
