/**
 * Custom Session Duration — Activate Route Unit Tests
 * src/__tests__/custom-session-duration/activate-route.test.ts
 *
 * Task 1.1: Verifies that the activate route schedules auto-close with the
 * correct delay derived from test.durationSeconds instead of the old hardcoded
 * 900_000 ms value.
 *
 * Test matrix:
 *   - durationSeconds = 1800 (30 min, legacy session) → 1800000 ms
 *   - durationSeconds = 2700 (45 min, legacy session) → 2700000 ms
 *   - durationSeconds = 3600 (60 min, legacy session) → 3600000 ms
 *   - durationSeconds = 120  (2 min, new preset)      → 120000 ms
 *   - durationSeconds = 0    (fallback case)           → 900000 ms
 *   - durationSeconds = null (fallback case)           → 900000 ms
 *
 * _Requirements: 4.1, 4.2, 4.4, 4.6, 5.4_
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const prismaMocks = vi.hoisted(() => ({
  sessionPinFindFirst: vi.fn(),
  sessionPinUpdate: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    sessionPin: {
      findFirst: prismaMocks.sessionPinFindFirst,
      update: prismaMocks.sessionPinUpdate,
    },
  },
}));

const authMocks = vi.hoisted(() => ({
  requireTeacherSession: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  requireTeacherSession: authMocks.requireTeacherSession,
}));

// Capture the delay argument passed to enqueueAutoClose
const autoCloseMocks = vi.hoisted(() => ({
  enqueueAutoClose: vi.fn(),
}));

vi.mock('@/workers/auto-close', () => ({
  enqueueAutoClose: autoCloseMocks.enqueueAutoClose,
}));

// State machine: always allow LOCKED → ACTIVE
vi.mock('@/lib/session/state-machine', () => ({
  applyTransition: vi.fn().mockReturnValue('ACTIVE'),
}));

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const TEACHER_SESSION = {
  userId: 'teacher-1',
  schoolId: 'school-1',
  role: 'TEACHER' as const,
  name: 'Guru Demo',
  email: 'guru@test.com',
};

const SESSION_ID = 'session-abc-123';

function makeRequest(): NextRequest {
  return new NextRequest(
    `http://localhost/api/sessions/${SESSION_ID}/activate`,
    { method: 'POST' }
  );
}

function makeContext(): { params: { id: string } } {
  return { params: { id: SESSION_ID } };
}

/** Build the mock return value for prisma.sessionPin.findFirst */
function mockSessionPin(durationSeconds: number | null) {
  return {
    id: SESSION_ID,
    state: 'LOCKED',
    schoolId: 'school-1',
    test: durationSeconds !== null ? { durationSeconds } : undefined,
  };
}

/** Build the mock return value for prisma.sessionPin.update */
function mockUpdatedPin(durationSeconds: number | null) {
  return {
    id: SESSION_ID,
    state: 'ACTIVE',
    schoolId: 'school-1',
    startedAt: new Date(),
    test: {
      id: 'test-1',
      topic: 'Matematika',
      durationSeconds: durationSeconds ?? 900,
    },
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.requireTeacherSession.mockResolvedValue(TEACHER_SESSION);
  autoCloseMocks.enqueueAutoClose.mockResolvedValue(undefined);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Activate Route — auto-close delay derived from durationSeconds', () => {
  /**
   * Requirements 5.4 / 4.4: legacy sessions with durationSeconds already stored
   * in DB must be re-activated with their actual duration, not 900_000 ms.
   */
  it('schedules delay of 1800000 ms when durationSeconds = 1800 (30 min, legacy session)', async () => {
    prismaMocks.sessionPinFindFirst.mockResolvedValue(mockSessionPin(1800));
    prismaMocks.sessionPinUpdate.mockResolvedValue(mockUpdatedPin(1800));

    const { POST } = await import('@/app/api/sessions/[id]/activate/route');
    const res = await POST(makeRequest(), makeContext());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(autoCloseMocks.enqueueAutoClose).toHaveBeenCalledOnce();
    expect(autoCloseMocks.enqueueAutoClose).toHaveBeenCalledWith(SESSION_ID, 1_800_000);
  });

  it('schedules delay of 2700000 ms when durationSeconds = 2700 (45 min, legacy session)', async () => {
    prismaMocks.sessionPinFindFirst.mockResolvedValue(mockSessionPin(2700));
    prismaMocks.sessionPinUpdate.mockResolvedValue(mockUpdatedPin(2700));

    const { POST } = await import('@/app/api/sessions/[id]/activate/route');
    const res = await POST(makeRequest(), makeContext());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(autoCloseMocks.enqueueAutoClose).toHaveBeenCalledOnce();
    expect(autoCloseMocks.enqueueAutoClose).toHaveBeenCalledWith(SESSION_ID, 2_700_000);
  });

  it('schedules delay of 3600000 ms when durationSeconds = 3600 (60 min, legacy session)', async () => {
    prismaMocks.sessionPinFindFirst.mockResolvedValue(mockSessionPin(3600));
    prismaMocks.sessionPinUpdate.mockResolvedValue(mockUpdatedPin(3600));

    const { POST } = await import('@/app/api/sessions/[id]/activate/route');
    const res = await POST(makeRequest(), makeContext());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(autoCloseMocks.enqueueAutoClose).toHaveBeenCalledOnce();
    expect(autoCloseMocks.enqueueAutoClose).toHaveBeenCalledWith(SESSION_ID, 3_600_000);
  });

  /**
   * Requirements 4.1, 4.2: new preset (2 min = 120 s) must use its own delay.
   */
  it('schedules delay of 120000 ms when durationSeconds = 120 (2 min, new preset)', async () => {
    prismaMocks.sessionPinFindFirst.mockResolvedValue(mockSessionPin(120));
    prismaMocks.sessionPinUpdate.mockResolvedValue(mockUpdatedPin(120));

    const { POST } = await import('@/app/api/sessions/[id]/activate/route');
    const res = await POST(makeRequest(), makeContext());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(autoCloseMocks.enqueueAutoClose).toHaveBeenCalledOnce();
    expect(autoCloseMocks.enqueueAutoClose).toHaveBeenCalledWith(SESSION_ID, 120_000);
  });

  /**
   * Requirement 4.6: durationSeconds = 0 triggers fallback to 900 s (15 min).
   */
  it('schedules fallback delay of 900000 ms when durationSeconds = 0', async () => {
    prismaMocks.sessionPinFindFirst.mockResolvedValue(mockSessionPin(0));
    prismaMocks.sessionPinUpdate.mockResolvedValue(mockUpdatedPin(0));

    const { POST } = await import('@/app/api/sessions/[id]/activate/route');
    const res = await POST(makeRequest(), makeContext());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(autoCloseMocks.enqueueAutoClose).toHaveBeenCalledOnce();
    expect(autoCloseMocks.enqueueAutoClose).toHaveBeenCalledWith(SESSION_ID, 900_000);
  });

  /**
   * Requirement 4.6: missing test relation (null/undefined) triggers fallback to 900 s.
   * This covers sessions created before the durationSeconds column had a valid value.
   */
  it('schedules fallback delay of 900000 ms when test.durationSeconds is null / missing', async () => {
    prismaMocks.sessionPinFindFirst.mockResolvedValue(mockSessionPin(null));
    prismaMocks.sessionPinUpdate.mockResolvedValue(mockUpdatedPin(null));

    const { POST } = await import('@/app/api/sessions/[id]/activate/route');
    const res = await POST(makeRequest(), makeContext());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(autoCloseMocks.enqueueAutoClose).toHaveBeenCalledOnce();
    expect(autoCloseMocks.enqueueAutoClose).toHaveBeenCalledWith(SESSION_ID, 900_000);
  });
});

// ─── Property-Based Tests ─────────────────────────────────────────────────────

import * as fc from 'fast-check';

describe('Activate Route — Property-Based Tests (fast-check)', () => {
  /**
   * Feature: custom-session-duration, Property 8: activate route delay = durationSeconds * 1000
   * For any valid durationSeconds in [60, 10800], activating a session schedules
   * auto-close with delay = durationSeconds * 1000 ms
   *
   * Validates: Requirements 4.1, 4.2, 5.4
   */
  it('Property 8 — activate route delay equals durationSeconds × 1000 for all valid values', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 60, max: 10800 }),
        async (dur) => {
          vi.clearAllMocks();
          authMocks.requireTeacherSession.mockResolvedValue(TEACHER_SESSION);
          autoCloseMocks.enqueueAutoClose.mockResolvedValue(undefined);
          prismaMocks.sessionPinFindFirst.mockResolvedValue(mockSessionPin(dur));
          prismaMocks.sessionPinUpdate.mockResolvedValue(mockUpdatedPin(dur));

          const { POST } = await import('@/app/api/sessions/[id]/activate/route');
          const res = await POST(makeRequest(), makeContext());
          const body = await res.json();

          expect(body.success).toBe(true);
          expect(autoCloseMocks.enqueueAutoClose).toHaveBeenCalledOnce();
          expect(autoCloseMocks.enqueueAutoClose).toHaveBeenCalledWith(SESSION_ID, dur * 1000);
        }
      ),
      { numRuns: 50 }
    );
  });
});
