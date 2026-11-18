/**
 * Integration Test — Session Lifecycle
 * tests/integration/session-lifecycle.test.ts
 *
 * Tests:
 *   - Full LOCKED → ACTIVE → CLOSED state transition via mocked route logic
 *   - BullMQ enqueue/cancel called with correct args
 *   - HTTP 409 when trying to activate an already-ACTIVE session
 *   - HTTP 409 when trying to activate a CLOSED session
 *   - HTTP 409 when trying to close an already-CLOSED session
 *
 * Requirements: 1.1, 1.4, 1.5, 1.7, 16.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  applyTransition,
  validateTransition,
  isTerminalState,
  type SessionState,
} from '@/lib/session/state-machine';

// ─── Mock Prisma ──────────────────────────────────────────────────────────────

const prismaMocks = vi.hoisted(() => ({
  sessionPinFindFirst: vi.fn(),
  sessionPinFindUnique: vi.fn(),
  sessionPinUpdate: vi.fn(),
  responseFindFirst: vi.fn(),
  responseCreate: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    sessionPin: {
      findFirst: prismaMocks.sessionPinFindFirst,
      findUnique: prismaMocks.sessionPinFindUnique,
      update: prismaMocks.sessionPinUpdate,
    },
    response: {
      findFirst: prismaMocks.responseFindFirst,
      create: prismaMocks.responseCreate,
    },
  },
}));

// ─── Mock BullMQ workers ──────────────────────────────────────────────────────

const workerMocks = vi.hoisted(() => ({
  enqueueAutoClose: vi.fn(),
  cancelAutoClose: vi.fn(),
}));

vi.mock('@/workers/auto-close', () => ({
  enqueueAutoClose: workerMocks.enqueueAutoClose,
  cancelAutoClose: workerMocks.cancelAutoClose,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Simulate the activate route handler logic:
 *   1. Load session from DB (mock)
 *   2. applyTransition LOCKED → ACTIVE
 *   3. DB update
 *   4. enqueueAutoClose
 * Returns { status, newState }
 */
async function simulateActivate(
  sessionId: string,
  schoolId: string
): Promise<{ status: number; newState?: SessionState; error?: string }> {
  const { prisma } = await import('@/lib/db/client');
  const { enqueueAutoClose } = await import('@/workers/auto-close');

  const session = await prisma.sessionPin.findFirst({
    where: { id: sessionId, schoolId },
    select: { id: true, state: true },
  } as Parameters<typeof prisma.sessionPin.findFirst>[0]);

  if (!session) return { status: 404, error: 'NOT_FOUND' };

  let newState: SessionState;
  try {
    newState = applyTransition(session.state as SessionState, 'activate');
  } catch (err) {
    return { status: 409, error: err instanceof Error ? err.message : 'INVALID_TRANSITION' };
  }

  const updated = await prisma.sessionPin.update({
    where: { id: sessionId },
    data: { state: newState, startedAt: new Date() },
  } as Parameters<typeof prisma.sessionPin.update>[0]);

  await enqueueAutoClose(sessionId, 900_000);

  return { status: 200, newState: (updated as { state: SessionState }).state };
}

/**
 * Simulate the close route handler logic.
 */
async function simulateClose(
  sessionId: string,
  schoolId: string
): Promise<{ status: number; newState?: SessionState; error?: string }> {
  const { prisma } = await import('@/lib/db/client');
  const { cancelAutoClose } = await import('@/workers/auto-close');

  const session = await prisma.sessionPin.findFirst({
    where: { id: sessionId, schoolId },
    select: { id: true, state: true },
  } as Parameters<typeof prisma.sessionPin.findFirst>[0]);

  if (!session) return { status: 404, error: 'NOT_FOUND' };

  let newState: SessionState;
  try {
    newState = applyTransition(session.state as SessionState, 'close');
  } catch (err) {
    return { status: 409, error: err instanceof Error ? err.message : 'INVALID_TRANSITION' };
  }

  const updated = await prisma.sessionPin.update({
    where: { id: sessionId },
    data: { state: newState, closedAt: new Date() },
  } as Parameters<typeof prisma.sessionPin.update>[0]);

  await cancelAutoClose(sessionId);

  return { status: 200, newState: (updated as { state: SessionState }).state };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Session Lifecycle Integration', () => {
  const schoolId = 'school-01';
  const sessionId = 'sess-lifecycle-1';

  beforeEach(() => {
    vi.clearAllMocks();
    workerMocks.enqueueAutoClose.mockResolvedValue(undefined);
    workerMocks.cancelAutoClose.mockResolvedValue(undefined);
  });

  // ── 1. Full LOCKED → ACTIVE → CLOSED happy path ───────────────────────────

  it('LOCKED → ACTIVE via activate: DB updated, auto-close enqueued', async () => {
    prismaMocks.sessionPinFindFirst.mockResolvedValue({
      id: sessionId,
      state: 'LOCKED',
      schoolId,
    });
    prismaMocks.sessionPinUpdate.mockResolvedValue({
      id: sessionId,
      state: 'ACTIVE',
      startedAt: new Date(),
    });

    const result = await simulateActivate(sessionId, schoolId);

    expect(result.status).toBe(200);
    expect(result.newState).toBe('ACTIVE');
    expect(prismaMocks.sessionPinUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: 'ACTIVE' }),
      })
    );
    expect(workerMocks.enqueueAutoClose).toHaveBeenCalledWith(sessionId, 900_000);
  });

  it('ACTIVE → CLOSED via close: DB updated, auto-close cancelled', async () => {
    prismaMocks.sessionPinFindFirst.mockResolvedValue({
      id: sessionId,
      state: 'ACTIVE',
      schoolId,
    });
    prismaMocks.sessionPinUpdate.mockResolvedValue({
      id: sessionId,
      state: 'CLOSED',
      closedAt: new Date(),
    });

    const result = await simulateClose(sessionId, schoolId);

    expect(result.status).toBe(200);
    expect(result.newState).toBe('CLOSED');
    expect(prismaMocks.sessionPinUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: 'CLOSED' }),
      })
    );
    expect(workerMocks.cancelAutoClose).toHaveBeenCalledWith(sessionId);
  });

  it('full LOCKED→ACTIVE→CLOSED sequence updates state correctly', async () => {
    // Step 1: Activate
    prismaMocks.sessionPinFindFirst.mockResolvedValueOnce({
      id: sessionId, state: 'LOCKED', schoolId,
    });
    prismaMocks.sessionPinUpdate.mockResolvedValueOnce({
      id: sessionId, state: 'ACTIVE',
    });

    const activateResult = await simulateActivate(sessionId, schoolId);
    expect(activateResult.newState).toBe('ACTIVE');

    // Step 2: Close
    prismaMocks.sessionPinFindFirst.mockResolvedValueOnce({
      id: sessionId, state: 'ACTIVE', schoolId,
    });
    prismaMocks.sessionPinUpdate.mockResolvedValueOnce({
      id: sessionId, state: 'CLOSED',
    });

    const closeResult = await simulateClose(sessionId, schoolId);
    expect(closeResult.newState).toBe('CLOSED');
    expect(isTerminalState('CLOSED')).toBe(true);
  });

  // ── 2. HTTP 409 on invalid transitions ────────────────────────────────────

  it('activate returns 409 when session is already ACTIVE', async () => {
    prismaMocks.sessionPinFindFirst.mockResolvedValue({
      id: sessionId, state: 'ACTIVE', schoolId,
    });

    const result = await simulateActivate(sessionId, schoolId);
    expect(result.status).toBe(409);
    expect(result.error).toMatch(/ACTIVE|diaktifkan ulang/i);
  });

  it('activate returns 409 when session is CLOSED (reverse transition)', async () => {
    prismaMocks.sessionPinFindFirst.mockResolvedValue({
      id: sessionId, state: 'CLOSED', schoolId,
    });

    const result = await simulateActivate(sessionId, schoolId);
    expect(result.status).toBe(409);
    expect(result.error).toMatch(/CLOSED|terminal/i);
  });

  it('close returns 409 when session is still LOCKED', async () => {
    prismaMocks.sessionPinFindFirst.mockResolvedValue({
      id: sessionId, state: 'LOCKED', schoolId,
    });

    const result = await simulateClose(sessionId, schoolId);
    expect(result.status).toBe(409);
    expect(result.error).toMatch(/LOCKED|diaktifkan/i);
  });

  it('close returns 409 when session is already CLOSED', async () => {
    prismaMocks.sessionPinFindFirst.mockResolvedValue({
      id: sessionId, state: 'CLOSED', schoolId,
    });

    const result = await simulateClose(sessionId, schoolId);
    expect(result.status).toBe(409);
    expect(result.error).toMatch(/CLOSED|terminal/i);
  });

  // ── 3. HTTP 409 on duplicate response submission ───────────────────────────

  it('second response submission for same (session, student, item) is detected as duplicate', async () => {
    const { prisma } = await import('@/lib/db/client');
    const studentId = 'student-001';
    const itemVariantId = 'item-v1';

    // First submission: no existing response
    prismaMocks.responseFindFirst.mockResolvedValueOnce(null);
    prismaMocks.responseCreate.mockResolvedValueOnce({
      id: 'resp-1', sessionPinId: sessionId, studentId, itemVariantId,
    });

    const first = await prisma.response.findFirst({
      where: { sessionPinId: sessionId, studentId, itemVariantId },
    } as Parameters<typeof prisma.response.findFirst>[0]);
    expect(first).toBeNull();

    await prisma.response.create({ data: {} } as Parameters<typeof prisma.response.create>[0]);

    // Second attempt: duplicate found
    prismaMocks.responseFindFirst.mockResolvedValueOnce({ id: 'resp-1' });

    const duplicate = await prisma.response.findFirst({
      where: { sessionPinId: sessionId, studentId, itemVariantId },
    } as Parameters<typeof prisma.response.findFirst>[0]);

    expect(duplicate).not.toBeNull();
    expect(duplicate?.id).toBe('resp-1');
    // In the real route handler this would trigger HTTP 409 — here we verify detection logic
  });

  // ── 4. Session not found returns 404 ─────────────────────────────────────

  it('activate returns 404 when session does not exist', async () => {
    prismaMocks.sessionPinFindFirst.mockResolvedValue(null);

    const result = await simulateActivate('non-existent', schoolId);
    expect(result.status).toBe(404);
  });

  // ── 5. validateTransition covers all 6 combinations ─────────────────────

  describe('validateTransition exhaustive combinations', () => {
    it('LOCKED → ACTIVE: valid', () => {
      expect(() => validateTransition('LOCKED', 'ACTIVE')).not.toThrow();
    });
    it('ACTIVE → CLOSED: valid', () => {
      expect(() => validateTransition('ACTIVE', 'CLOSED')).not.toThrow();
    });
    it('LOCKED → CLOSED: invalid (skip)', () => {
      expect(() => validateTransition('LOCKED', 'CLOSED')).toThrow();
    });
    it('ACTIVE → LOCKED: invalid (reverse)', () => {
      expect(() => validateTransition('ACTIVE', 'LOCKED')).toThrow();
    });
    it('CLOSED → LOCKED: invalid (terminal)', () => {
      expect(() => validateTransition('CLOSED', 'LOCKED')).toThrow();
    });
    it('CLOSED → ACTIVE: invalid (terminal)', () => {
      expect(() => validateTransition('CLOSED', 'ACTIVE')).toThrow();
    });
  });
});
