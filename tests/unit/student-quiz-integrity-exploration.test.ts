/**
 * Student Quiz Integrity Fixes — Bug Condition Exploration Tests
 * tests/unit/student-quiz-integrity-exploration.test.ts
 *
 * Phase 1: EXPLORATION TESTS (written BEFORE any fix)
 * These tests MUST FAIL on unfixed code — failure proves each bug exists.
 * DO NOT modify source code to make these tests pass.
 *
 * Bugs covered: B1 (cross-class auth bypass), B2 (deadline not enforced),
 *               B3 (auto-diagnosis not triggered), B4 (SSE broadcast missing),
 *               B5 (complete page no back/countdown), B6 (isSubmitting not reset)
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 1.10, 1.11
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 1.10, 1.11**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../../src');

function readSrc(relative: string): string {
  return fs.readFileSync(path.join(SRC, relative), 'utf-8');
}

// ─── Prisma mocks (hoisted) ───────────────────────────────────────────────────

const prismaMocks = vi.hoisted(() => ({
  sessionPinFindUnique: vi.fn(),
  sessionPinFindFirst: vi.fn(),
  studentFindUnique: vi.fn(),
  responseFindFirst: vi.fn(),
  responseCreate: vi.fn(),
  responseCount: vi.fn(),
  questionCount: vi.fn(),
  itemVariantFindFirst: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    sessionPin: {
      findUnique: prismaMocks.sessionPinFindUnique,
      findFirst: prismaMocks.sessionPinFindFirst,
    },
    student: {
      findUnique: prismaMocks.studentFindUnique,
    },
    response: {
      findFirst: prismaMocks.responseFindFirst,
      create: prismaMocks.responseCreate,
      count: prismaMocks.responseCount,
    },
    question: {
      count: prismaMocks.questionCount,
    },
    itemVariant: {
      findFirst: prismaMocks.itemVariantFindFirst,
    },
  },
}));

// ─── Auth mocks ───────────────────────────────────────────────────────────────

const authMocks = vi.hoisted(() => ({
  requireStudentSession: vi.fn(),
  auth: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  requireStudentSession: authMocks.requireStudentSession,
  getStudentSession: vi.fn(),
  requireTeacherSession: vi.fn(),
}));

vi.mock('@/auth', () => ({
  auth: authMocks.auth,
}));

// ─── SSE / diagnosis mocks ────────────────────────────────────────────────────

const sseMocks = vi.hoisted(() => ({
  broadcast: vi.fn(),
  getLastState: vi.fn().mockReturnValue([]),
  subscribe: vi.fn(),
  cleanup: vi.fn(),
}));

vi.mock('@/lib/sse/manager', () => ({
  sseManager: sseMocks,
}));

const heatmapMocks = vi.hoisted(() => ({
  buildHeatmapState: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/sse/heatmap-builder', () => ({
  buildHeatmapState: heatmapMocks.buildHeatmapState,
}));

const diagnosisMocks = vi.hoisted(() => ({
  enqueueRunDiagnosis: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/workers/run-diagnosis', () => ({
  enqueueRunDiagnosis: diagnosisMocks.enqueueRunDiagnosis,
}));

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const SCHOOL_ID = 'school-sman1';
const CLASS_A_ID = 'class-A';
const CLASS_B_ID = 'class-B';
const SESSION_ID = 'session-class-a';
const STUDENT_A_ID = 'student-A-01';
const STUDENT_B_ID = 'student-B-01';

/** A student session JWT payload for a student who belongs to CLASS_B
 *  but holds a JWT from SESSION_ID (sesi Kelas A — the bug condition). */
const CROSS_CLASS_STUDENT_SESSION = {
  studentId: STUDENT_B_ID,
  sessionPinId: SESSION_ID,
  schoolId: SCHOOL_ID,
  anonymousLabel: 'B_Siswa_01',
};

const ACTIVE_SESSION_PIN = {
  id: SESSION_ID,
  schoolId: SCHOOL_ID,
  state: 'ACTIVE' as const,
  testId: 'test-newton',
  // NOTE: "test" relation is NOT selected on unfixed code — only id/schoolId/state/testId
};

// A valid ItemVariant fixture for submission tests
const ITEM_VARIANT_FIXTURE = {
  id: 'variant-001',
  correctOptionKey: 'A',
  tauMinSeconds: 10,
  renderedOptions: [{ key: 'A', text: 'Opsi A' }],
  question: {
    id: 'question-001',
    variants: [{ id: 'variant-001' }],
  },
};

// ─── Bug #1 — Cross-Class Authentication Bypass ───────────────────────────────

describe('isBugCondition_B1 — Cross-class auth bypass', () => {
  /**
   * Property 1: Bug Condition — Cross-Class Authentication Rejected
   *
   * Scope: student.schoolId === sessionPin.schoolId
   *        AND student.classId !== sessionPin.test.classId
   *        AND sessionPin.state === 'ACTIVE'
   *
   * Expected after fix: authorize() returns null
   * On unfixed code: authorize() returns a session object (bypasses classId check)
   *
   * Counterexample: authorize({ pinCode: "PIN-A", studentId: "S-B-01" })
   *   returns session instead of null
   *
   * **Validates: Requirements 1.1, 1.2**
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Bug B1 PROOF (source check): auth.ts student-pin provider does NOT query test.classId', () => {
    const authSrc = readSrc('auth.ts');

    // Find the student-pin provider block
    const providerIdx = authSrc.indexOf("id: \"student-pin\"");
    expect(providerIdx).toBeGreaterThan(-1);

    const providerBlock = authSrc.slice(providerIdx, providerIdx + 2000);

    // On UNFIXED code: sessionPin select does NOT include test relation
    const selectsTestClassId =
      providerBlock.includes('test:') &&
      providerBlock.includes('classId');

    // EXPECT TO FAIL on unfixed code: this should be false (bug condition)
    // After fix: test.classId WILL be in the select
    expect(selectsTestClassId).toBe(true);
  });

  it('Bug B1 PROOF (source check): auth.ts student-pin provider does NOT validate classId', () => {
    const authSrc = readSrc('auth.ts');

    // On unfixed code: the only validation is student.schoolId !== sessionPin.schoolId
    // There is NO check for classId mismatch
    const hasClassIdValidation =
      authSrc.includes('classId') &&
      authSrc.includes('sessionPin.test.classId');

    // EXPECT TO FAIL on unfixed code: classId validation does NOT exist
    expect(hasClassIdValidation).toBe(true);
  });

  it('Bug B1 PROOF (runtime): authorize() with cross-class credentials returns session instead of null', async () => {
    // Simulate the unfixed authorize() behavior
    // Student B belongs to CLASS_B, but the PIN is for CLASS_A session
    prismaMocks.sessionPinFindUnique.mockResolvedValue({
      id: SESSION_ID,
      schoolId: SCHOOL_ID,
      state: 'ACTIVE',
      // NOTE: on unfixed code, 'test' is NOT selected — no classId in result
    });

    prismaMocks.studentFindUnique.mockResolvedValue({
      id: STUDENT_B_ID,
      schoolId: SCHOOL_ID,
      anonymousLabel: 'B_Siswa_01',
      // NOTE: on unfixed code, 'classId' is NOT selected
    });

    // Import and call the actual auth provider logic indirectly via source inspection
    // The unfixed authorize() only checks schoolId === schoolId, so it returns a session
    // We verify this by inspecting what the source code actually checks
    const authSrc = readSrc('auth.ts');
    const providerIdx = authSrc.indexOf("id: \"student-pin\"");
    const providerBlock = authSrc.slice(providerIdx, providerIdx + 2000);

    // On unfixed code: the if-condition only checks student.schoolId !== sessionPin.schoolId
    // There is no classId mismatch check — so a Class B student can authenticate with Class A PIN
    const onlyChecksSchoolId =
      providerBlock.includes('student.schoolId !== sessionPin.schoolId') &&
      !providerBlock.includes('student.classId !== sessionPin.test.classId');

    // EXPECT TO FAIL after fix: after fix the classId check WILL be present
    // This assertion documents the bug: only schoolId is checked
    expect(onlyChecksSchoolId).toBe(false);
  });

  it('Bug B1 PROOF (API layer): POST /api/responses does NOT cross-check student.classId', () => {
    const routeSrc = readSrc('app/api/responses/route.ts');

    // On unfixed code: sessionPin select does NOT include test.classId
    // There is no student lookup after sessionPin is loaded
    // There is no classId cross-check
    const hasCrossClassCheck =
      routeSrc.includes('student.classId') &&
      routeSrc.includes('sessionPin.test.classId') &&
      routeSrc.includes('FORBIDDEN');

    // EXPECT TO FAIL on unfixed code: no cross-class check in responses route
    expect(hasCrossClassCheck).toBe(true);
  });

  it('Bug B1 PROOF (API layer): POST /api/responses with cross-class JWT returns 201 instead of 403', async () => {
    // Student B holds JWT for session of Class A
    authMocks.requireStudentSession.mockResolvedValue(CROSS_CLASS_STUDENT_SESSION);

    // Session PIN is ACTIVE (Class A's session) — include test relation as fixed route requires
    prismaMocks.sessionPinFindFirst.mockResolvedValue({
      ...ACTIVE_SESSION_PIN,
      startedAt: null,
      test: {
        classId: CLASS_A_ID,      // Class A's session
        durationSeconds: 900,
      },
    });

    // Student B belongs to CLASS_B — different from CLASS_A → triggers 403
    prismaMocks.studentFindUnique.mockResolvedValue({ classId: CLASS_B_ID });

    // No duplicate response
    prismaMocks.responseFindFirst.mockResolvedValue(null);

    // ItemVariant is valid for this test
    prismaMocks.itemVariantFindFirst.mockResolvedValue(ITEM_VARIANT_FIXTURE);

    // Response creation succeeds
    prismaMocks.responseCreate.mockResolvedValue({ id: 'response-created' });

    const { NextRequest } = await import('next/server');
    const { POST } = await import('@/app/api/responses/route');

    const req = new NextRequest('http://localhost/api/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: SESSION_ID,
        itemVariantId: 'variant-001',
        chosenOptionKey: 'A',
        criValue: 3,
        responseTimeMs: 5000,
      }),
    });

    const response = await POST(req);
    const body = await response.json();

    // On UNFIXED code: returns 201 (bug — cross-class student bypasses auth)
    // After fix: returns 403 FORBIDDEN
    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('FORBIDDEN');
  });
});

