/**
 * Custom Session Duration — POST /api/tests Route Unit Tests
 * src/__tests__/custom-session-duration/api-tests-route.test.ts
 *
 * Task 2.1: Verifies server-side validation of durationSeconds in POST /api/tests.
 *
 * Test matrix (unit):
 *   1. durationSeconds missing → default 900 stored, HTTP 201
 *   2. durationSeconds = 59 (below minimum) → HTTP 422, VALIDATION_ERROR
 *   3. durationSeconds = 10801 (above maximum) → HTTP 422, VALIDATION_ERROR
 *   4. durationSeconds = 90.5 (non-integer float) → HTTP 422, VALIDATION_ERROR
 *   5. durationSeconds = "abc" (non-numeric string) → HTTP 422, VALIDATION_ERROR
 *   6. durationSeconds = null → treated as default 900 → HTTP 201
 *   7. durationSeconds = 60 (minimum boundary, valid) → HTTP 201, stored as 60
 *   8. durationSeconds = 10800 (maximum boundary, valid) → HTTP 201, stored as 10800
 *   9. durationSeconds = 600 (valid 10 min) → HTTP 201, stored as 600
 *
 * _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const prismaMocks = vi.hoisted(() => ({
  classFindFirst: vi.fn(),
  testCreate: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    class: {
      findFirst: prismaMocks.classFindFirst,
    },
    test: {
      create: prismaMocks.testCreate,
    },
  },
}));

const authMocks = vi.hoisted(() => ({
  requireTeacherSession: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  requireTeacherSession: authMocks.requireTeacherSession,
}));

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const TEACHER_SESSION = {
  userId: 'teacher-1',
  schoolId: 'school-1',
  role: 'TEACHER' as const,
  name: 'Guru Demo',
  email: 'guru@test.com',
};

const VALID_CLASS = {
  id: 'class-1',
  name: 'Kelas 9A',
  grade: '9',
  schoolId: 'school-1',
};

/** Build a mock test record returned from prisma.test.create */
function mockTestRecord(durationSeconds: number) {
  return {
    id: 'test-created-1',
    schoolId: 'school-1',
    teacherId: 'teacher-1',
    classId: 'class-1',
    topic: 'Matematika',
    durationSeconds,
    createdAt: new Date(),
    class: { id: 'class-1', name: 'Kelas 9A', grade: '9' },
    _count: { questions: 0 },
  };
}

/** Build a POST NextRequest with the given body */
function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/tests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.requireTeacherSession.mockResolvedValue(TEACHER_SESSION);
  // By default class lookup returns a valid class
  prismaMocks.classFindFirst.mockResolvedValue(VALID_CLASS);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/tests — durationSeconds validation', () => {
  /**
   * Requirement 3.6: When durationSeconds is omitted, the default value 900 is used.
   */
  it('1. durationSeconds missing → stores default 900, HTTP 201', async () => {
    prismaMocks.testCreate.mockResolvedValue(mockTestRecord(900));

    const { POST } = await import('@/app/api/tests/route');
    const res = await POST(makeRequest({ classId: 'class-1', topic: 'Matematika' }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(prismaMocks.testCreate).toHaveBeenCalledOnce();
    const createArgs = prismaMocks.testCreate.mock.calls[0][0];
    expect(createArgs.data.durationSeconds).toBe(900);
  });

  /**
   * Requirement 3.1: durationSeconds < 60 must return HTTP 422 with VALIDATION_ERROR.
   */
  it('2. durationSeconds = 59 (below minimum) → HTTP 422, VALIDATION_ERROR', async () => {
    const { POST } = await import('@/app/api/tests/route');
    const res = await POST(makeRequest({ classId: 'class-1', topic: 'Matematika', durationSeconds: 59 }));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(prismaMocks.testCreate).not.toHaveBeenCalled();
  });

  /**
   * Requirement 3.2: durationSeconds > 10800 must return HTTP 422 with VALIDATION_ERROR.
   */
  it('3. durationSeconds = 10801 (above maximum) → HTTP 422, VALIDATION_ERROR', async () => {
    const { POST } = await import('@/app/api/tests/route');
    const res = await POST(makeRequest({ classId: 'class-1', topic: 'Matematika', durationSeconds: 10801 }));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(prismaMocks.testCreate).not.toHaveBeenCalled();
  });

  /**
   * Requirement 3.3: Non-integer float must return HTTP 422 with VALIDATION_ERROR.
   */
  it('4. durationSeconds = 90.5 (non-integer float) → HTTP 422, VALIDATION_ERROR', async () => {
    const { POST } = await import('@/app/api/tests/route');
    const res = await POST(makeRequest({ classId: 'class-1', topic: 'Matematika', durationSeconds: 90.5 }));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(prismaMocks.testCreate).not.toHaveBeenCalled();
  });

  /**
   * Requirement 3.4: Non-numeric string must return HTTP 422 with VALIDATION_ERROR.
   */
  it('5. durationSeconds = "abc" (non-numeric string) → HTTP 422, VALIDATION_ERROR', async () => {
    const { POST } = await import('@/app/api/tests/route');
    // Cast to any to simulate a malformed request body bypassing TypeScript
    const res = await POST(makeRequest({ classId: 'class-1', topic: 'Matematika', durationSeconds: 'abc' as unknown as number }));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(prismaMocks.testCreate).not.toHaveBeenCalled();
  });

  /**
   * Note on null: null ?? 900 evaluates to 900 (the ?? operator catches both null and undefined).
   * So explicit null is treated as "missing" → default 900 → HTTP 201.
   *
   * Requirement 3.6 (null treated as omitted, falls back to 900).
   */
  it('6. durationSeconds = null → treated as default 900 → HTTP 201', async () => {
    prismaMocks.testCreate.mockResolvedValue(mockTestRecord(900));

    const { POST } = await import('@/app/api/tests/route');
    const res = await POST(makeRequest({ classId: 'class-1', topic: 'Matematika', durationSeconds: null as unknown as number }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(prismaMocks.testCreate).toHaveBeenCalledOnce();
    const createArgs = prismaMocks.testCreate.mock.calls[0][0];
    expect(createArgs.data.durationSeconds).toBe(900);
  });

  /**
   * Requirement 3.5: Minimum boundary value 60 must be accepted and stored exactly.
   */
  it('7. durationSeconds = 60 (minimum boundary) → HTTP 201, stored as 60', async () => {
    prismaMocks.testCreate.mockResolvedValue(mockTestRecord(60));

    const { POST } = await import('@/app/api/tests/route');
    const res = await POST(makeRequest({ classId: 'class-1', topic: 'Matematika', durationSeconds: 60 }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(prismaMocks.testCreate).toHaveBeenCalledOnce();
    const createArgs = prismaMocks.testCreate.mock.calls[0][0];
    expect(createArgs.data.durationSeconds).toBe(60);
  });

  /**
   * Requirement 3.5: Maximum boundary value 10800 must be accepted and stored exactly.
   */
  it('8. durationSeconds = 10800 (maximum boundary) → HTTP 201, stored as 10800', async () => {
    prismaMocks.testCreate.mockResolvedValue(mockTestRecord(10800));

    const { POST } = await import('@/app/api/tests/route');
    const res = await POST(makeRequest({ classId: 'class-1', topic: 'Matematika', durationSeconds: 10800 }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(prismaMocks.testCreate).toHaveBeenCalledOnce();
    const createArgs = prismaMocks.testCreate.mock.calls[0][0];
    expect(createArgs.data.durationSeconds).toBe(10800);
  });

  /**
   * Requirement 3.5: Valid value 600 (10 min) must be accepted and stored exactly.
   */
  it('9. durationSeconds = 600 (valid 10 min) → HTTP 201, stored as 600', async () => {
    prismaMocks.testCreate.mockResolvedValue(mockTestRecord(600));

    const { POST } = await import('@/app/api/tests/route');
    const res = await POST(makeRequest({ classId: 'class-1', topic: 'Matematika', durationSeconds: 600 }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(prismaMocks.testCreate).toHaveBeenCalledOnce();
    const createArgs = prismaMocks.testCreate.mock.calls[0][0];
    expect(createArgs.data.durationSeconds).toBe(600);
  });
});

// ─── Property-Based Tests ─────────────────────────────────────────────────────

import * as fc from 'fast-check';

describe('POST /api/tests — Property-Based Tests (fast-check)', () => {
  /**
   * Feature: custom-session-duration, Property 5: server rejects out-of-range durationSeconds
   * For any integer outside [60, 10800], POST /api/tests returns HTTP 422 VALIDATION_ERROR
   *
   * Validates: Requirements 3.1, 3.2
   */
  it('Property 5 — server rejects out-of-range durationSeconds: any integer outside [60, 10800] returns HTTP 422', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.integer({ min: -100000, max: 59 }),
          fc.integer({ min: 10801, max: 100000 })
        ),
        async (dur) => {
          const { POST } = await import('@/app/api/tests/route');
          const res = await POST(makeRequest({ classId: 'class-1', topic: 'Matematika', durationSeconds: dur }));
          const body = await res.json();
          expect(res.status).toBe(422);
          expect(body.success).toBe(false);
          expect(body.error.code).toBe('VALIDATION_ERROR');
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Feature: custom-session-duration, Property 6: server rejects non-integer durationSeconds
   * For any non-integer float in [60, 10800], POST /api/tests returns HTTP 422
   *
   * Validates: Requirements 3.3
   */
  it('Property 6 — server rejects non-integer durationSeconds: any float in [60,10800] returns HTTP 422', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: 61, max: 10799, noNaN: true }).filter((n) => !Number.isInteger(n)),
        async (dur) => {
          const { POST } = await import('@/app/api/tests/route');
          const res = await POST(makeRequest({ classId: 'class-1', topic: 'Matematika', durationSeconds: dur as unknown as number }));
          const body = await res.json();
          expect(res.status).toBe(422);
          expect(body.success).toBe(false);
          expect(body.error.code).toBe('VALIDATION_ERROR');
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Feature: custom-session-duration, Property 7: server persists exact valid durationSeconds
   * For any valid integer in [60, 10800], POST /api/tests stores exactly that value
   *
   * Validates: Requirements 3.5, 1.6, 1.7
   */
  it('Property 7 — server persists exact valid durationSeconds: stored value equals submitted value', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 60, max: 10800 }),
        async (dur) => {
          // Reset mocks and set up for this run
          vi.clearAllMocks();
          authMocks.requireTeacherSession.mockResolvedValue(TEACHER_SESSION);
          prismaMocks.classFindFirst.mockResolvedValue(VALID_CLASS);
          prismaMocks.testCreate.mockResolvedValue(mockTestRecord(dur));

          const { POST } = await import('@/app/api/tests/route');
          const res = await POST(makeRequest({ classId: 'class-1', topic: 'Matematika', durationSeconds: dur }));
          const body = await res.json();

          expect(res.status).toBe(201);
          expect(body.success).toBe(true);
          expect(prismaMocks.testCreate).toHaveBeenCalledOnce();
          const createArgs = prismaMocks.testCreate.mock.calls[0][0];
          expect(createArgs.data.durationSeconds).toBe(dur);
        }
      ),
      { numRuns: 50 }
    );
  });
});
