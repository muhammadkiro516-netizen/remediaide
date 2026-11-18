/**
 * Student Quiz Integrity Fixes — Bug Condition Exploration Tests
 * src/__tests__/student-quiz-integrity-fixes/bug-condition-exploration.test.ts
 *
 * Task 1: Write bug condition exploration tests (BEFORE implementing any fix)
 *
 * These tests target CURRENT UNFIXED code. ALL 6 tests are EXPECTED TO FAIL —
 * failure proves each bug exists. DO NOT fix the code when these tests fail.
 *
 * Bugs covered:
 *   Bug #1 — Cross-class auth bypass (src/auth.ts)
 *   Bug #2 — Server-side deadline not enforced (src/app/api/responses/route.ts)
 *   Bug #3 — Auto-diagnosis not triggered (src/app/api/responses/route.ts)
 *   Bug #4 — SSE broadcast not called per answer (src/app/api/responses/route.ts)
 *   Bug #5 — Complete page has no back button or countdown
 *   Bug #6 — isSubmitting not reset in finally block
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 1.10, 1.11**
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// ─── Source path helpers ──────────────────────────────────────────────────────

const SRC = path.resolve(__dirname, '../../');

function readSrc(relative: string): string {
  return fs.readFileSync(path.join(SRC, relative), 'utf-8');
}


// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const prismaMocks = vi.hoisted(() => ({
  sessionPinFindUnique: vi.fn(),
  sessionPinFindFirst: vi.fn(),
  studentFindUnique: vi.fn(),
  itemVariantFindFirst: vi.fn(),
  responseFindFirst: vi.fn(),
  responseCreate: vi.fn(),
  responseCount: vi.fn(),
  questionCount: vi.fn(),
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
    itemVariant: {
      findFirst: prismaMocks.itemVariantFindFirst,
    },
    response: {
      findFirst: prismaMocks.responseFindFirst,
      create: prismaMocks.responseCreate,
      count: prismaMocks.responseCount,
    },
    question: {
      count: prismaMocks.questionCount,
    },
  },
}));

const authMocks = vi.hoisted(() => ({
  requireStudentSession: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  requireStudentSession: authMocks.requireStudentSession,
  requireTeacherSession: vi.fn(),
  getTeacherSession: vi.fn(),
  requireRole: vi.fn(),
}));

const sseMocks = vi.hoisted(() => ({
  broadcast: vi.fn(),
  getLastState: vi.fn(),
  subscribe: vi.fn(),
  cleanup: vi.fn(),
}));

vi.mock('@/lib/sse/manager', () => ({
  sseManager: sseMocks,
}));

const heatmapMocks = vi.hoisted(() => ({
  buildHeatmapState: vi.fn(),
}));

vi.mock('@/lib/sse/heatmap-builder', () => ({
  buildHeatmapState: heatmapMocks.buildHeatmapState,
}));

const diagnosisMocks = vi.hoisted(() => ({
  enqueueRunDiagnosis: vi.fn(),
}));

vi.mock('@/workers/run-diagnosis', () => ({
  enqueueRunDiagnosis: diagnosisMocks.enqueueRunDiagnosis,
}));


// ─── Shared fixtures ──────────────────────────────────────────────────────────

const SCHOOL_ID = 'school-x';
const CLASS_A_ID = 'class-a';
const CLASS_B_ID = 'class-b';
const SESSION_ID = 'session-class-a';
const STUDENT_A_ID = 'student-s-a-01'; // belongs to Class A
const STUDENT_B_ID = 'student-s-b-01'; // belongs to Class B (DIFFERENT class, same school)
const ITEM_VARIANT_ID = 'variant-q1-v1';
const QUESTION_ID = 'question-1';

// Student B session — has JWT for Class A session (bug condition)
const CROSS_CLASS_STUDENT_SESSION = {
  studentId: STUDENT_B_ID,
  schoolId: SCHOOL_ID,
  sessionPinId: SESSION_ID,
  anonymousLabel: 'B_Siswa_01',
};

// ItemVariant mock with deterministic assignment that matches STUDENT_B
// hash("student-s-b-01:question-1:pick") % 1 === 0 → variant index 0
function mockItemVariant() {
  return {
    id: ITEM_VARIANT_ID,
    correctOptionKey: 'A',
    tauMinSeconds: 10,
    renderedOptions: [
      { key: 'A', text: 'Option A' },
      { key: 'B', text: 'Option B' },
      { key: 'C', text: 'Option C' },
      { key: 'D', text: 'Option D' },
    ],
    question: {
      id: QUESTION_ID,
      variants: [{ id: ITEM_VARIANT_ID }],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no duplicate responses
  prismaMocks.responseFindFirst.mockResolvedValue(null);
  // Default response create succeeds
  prismaMocks.responseCreate.mockResolvedValue({ id: 'response-new-1' });
  // Default: SSE broadcast succeeds
  sseMocks.broadcast.mockReturnValue(undefined);
  heatmapMocks.buildHeatmapState.mockResolvedValue([]);
  diagnosisMocks.enqueueRunDiagnosis.mockResolvedValue(undefined);
});


// ═══════════════════════════════════════════════════════════════════════════════
// BUG #1 — Cross-Class Authentication Bypass (src/auth.ts)
// isBugCondition_B1: student.schoolId === sessionPin.schoolId
//                   AND student.classId !== sessionPin.test.classId
//                   AND sessionPin.state === 'ACTIVE'
// ═══════════════════════════════════════════════════════════════════════════════

describe('Bug #1 — Cross-class auth bypass (isBugCondition_B1)', () => {
  /**
   * Bug condition: student-pin provider's authorize() only checks schoolId.
   * A student from Class B can authenticate against a Class A session.
   *
   * Expected after fix: authorize() returns null when classId mismatches.
   * Bug on unfixed code: returns a valid session object (non-null).
   *
   * Counterexample: authorize({ pinCode: "PIN-CLASS-A", studentId: "STUDENT-FROM-CLASS-B" })
   *   returns non-null on unfixed code.
   *
   * Validates: Requirements 1.1, 1.2
   */

  it('BugCondition_B1: auth.ts provider student-pin does NOT validate classId — missing classId check in select', () => {
    // STATIC SOURCE CHECK: unfixed code does NOT select test.classId from sessionPin
    // and does NOT select classId from student — confirming the bug exists structurally.
    const src = readSrc('auth.ts');

    // On UNFIXED code: sessionPin select only has { id, schoolId, state }
    // It does NOT include `test: { select: { classId: true } }`
    // This assertion FAILS after fix (which adds test.classId)
    const hasTestClassIdSelect = src.includes('test: { select: { classId') ||
      src.includes("test: { select: { classId");
    expect(hasTestClassIdSelect).toBe(true); // WILL FAIL on unfixed code — bug confirmed
  });

  it('BugCondition_B1: authorize() validation check does NOT compare student.classId vs sessionPin.test.classId (runtime logic)', () => {
    const src = readSrc('auth.ts');

    // On UNFIXED code: the validation check is ONLY student.schoolId !== sessionPin.schoolId
    // There is NO check for student.classId !== sessionPin.test.classId
    // A student from Class B can pass the schoolId check and get a valid JWT for Class A's session.
    //
    // Counterexample: authorize({ pinCode: "PIN-CLASS-A", studentId: "STUDENT-FROM-CLASS-B" })
    //   - sessionPin.schoolId === student.schoolId → PASS (both from same school)
    //   - student.classId !== sessionPin.test.classId → NOT CHECKED → auth succeeds (BUG)
    //
    // After fix: this check IS present, so hasClassIdValidation = true
    // On unfixed code: hasClassIdValidation = false → assertion fails (bug confirmed)
    const hasClassIdValidation =
      src.includes('student.classId') &&
      src.includes('sessionPin.test.classId');

    // WILL FAIL on unfixed code — confirms bug #1 exists
    expect(hasClassIdValidation).toBe(true);
  });

  it('BugCondition_B1: student query in auth.ts does NOT select classId (unfixed)', () => {
    const src = readSrc('auth.ts');

    // On UNFIXED code: student select is { id: true, schoolId: true, anonymousLabel: true }
    // classId is NOT selected — confirms the bug
    // This assertion FAILS after fix (which adds classId to the student select)
    const studentSelectHasClassId =
      src.includes("classId: true") && src.match(/student[^}]+classId/s) !== null;

    // WILL FAIL on unfixed code (classId not selected for student in auth.ts)
    expect(studentSelectHasClassId).toBe(true);
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// BUG #2 — Server-Side Deadline Not Enforced (POST /api/responses)
// isBugCondition_B2: sessionPin.state === 'ACTIVE'
//                   AND startedAt !== null
//                   AND startedAt + durationSeconds * 1000 < Date.now()
// ═══════════════════════════════════════════════════════════════════════════════

describe('Bug #2 — Server-side deadline not enforced (isBugCondition_B2)', () => {
  /**
   * Bug condition: POST /api/responses only checks state === 'ACTIVE', not deadline.
   * A submission made AFTER the session deadline still returns 201.
   *
   * Expected after fix: returns 409 SESSION_EXPIRED when past deadline.
   * Bug on unfixed code: returns 201 Created.
   *
   * Counterexample: submit with mocked Date.now() = deadline + 1ms → returns 201.
   *
   * Validates: Requirements 1.4
   */

  it('BugCondition_B2: responses/route.ts does NOT select startedAt in sessionPin query (unfixed)', () => {
    const src = readSrc('app/api/responses/route.ts');

    // On UNFIXED code: select is { id: true, state: true, testId: true }
    // No startedAt, no durationSeconds — deadline check is impossible
    // This assertion FAILS after fix (which adds startedAt + durationSeconds)
    const hasDeadlineCheck =
      src.includes('startedAt') && src.includes('durationSeconds') && src.includes('SESSION_EXPIRED');

    // WILL FAIL on unfixed code — confirms bug #2 exists
    expect(hasDeadlineCheck).toBe(true);
  });

  it('BugCondition_B2: POST /api/responses returns 201 instead of 409 when past deadline (runtime)', async () => {
    const STARTED_AT = new Date('2025-01-01T08:00:00.000Z');
    const DURATION_SECONDS = 900; // 15 minutes
    const DEADLINE_MS = STARTED_AT.getTime() + DURATION_SECONDS * 1000;
    const MOCKED_NOW = DEADLINE_MS + 1; // 1ms AFTER deadline

    // Mock Date.now() to return a value past the deadline
    vi.spyOn(Date, 'now').mockReturnValue(MOCKED_NOW);

    authMocks.requireStudentSession.mockResolvedValue(CROSS_CLASS_STUDENT_SESSION);

    // Session is ACTIVE but past deadline
    prismaMocks.sessionPinFindFirst.mockResolvedValue({
      id: SESSION_ID,
      state: 'ACTIVE',
      testId: 'test-1',
      startedAt: STARTED_AT,            // needed for deadline check
      test: {
        classId: CLASS_B_ID,            // matches student's class (not the auth bug)
        durationSeconds: DURATION_SECONDS,
      },
    });

    prismaMocks.studentFindUnique.mockResolvedValue({
      classId: CLASS_B_ID,
    });

    prismaMocks.itemVariantFindFirst.mockResolvedValue(mockItemVariant());

    const { POST } = await import('@/app/api/responses/route');
    const { NextRequest } = await import('next/server');

    const req = new NextRequest('http://localhost/api/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: SESSION_ID,
        itemVariantId: ITEM_VARIANT_ID,
        chosenOptionKey: 'A',
        criValue: 3,
        responseTimeMs: 5000,
      }),
    });

    const response = await POST(req);
    const body = await response.json();

    // EXPECTED AFTER FIX: 409 SESSION_EXPIRED
    // BUG ON UNFIXED CODE: 201 Created (deadline not checked)
    // This assertion WILL FAIL on unfixed code — confirms bug #2
    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('SESSION_EXPIRED');

    vi.restoreAllMocks();
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// BUG #3 — Auto-Diagnosis Not Triggered (POST /api/responses)
// isBugCondition_B3: studentResponseCount === totalQuestions
//                   AND enqueueRunDiagnosis NOT called
// ═══════════════════════════════════════════════════════════════════════════════

describe('Bug #3 — Auto-diagnosis not triggered on last answer (isBugCondition_B3)', () => {
  /**
   * Bug condition: after prisma.response.create(), there is no check whether the
   * student has answered all questions. enqueueRunDiagnosis is never called.
   *
   * Expected after fix: enqueueRunDiagnosis called once when count === total.
   * Bug on unfixed code: enqueueRunDiagnosis call count = 0.
   *
   * Counterexample: studentResponseCount === totalQuestions → enqueueRunDiagnosis not called.
   *
   * Validates: Requirements 1.6
   */

  it('BugCondition_B3: responses/route.ts does NOT import or call enqueueRunDiagnosis (unfixed)', () => {
    const src = readSrc('app/api/responses/route.ts');

    // On UNFIXED code: enqueueRunDiagnosis is NOT imported and NOT called
    const hasEnqueueImport =
      src.includes('enqueueRunDiagnosis') || src.includes('run-diagnosis');

    // WILL FAIL on unfixed code — confirms bug #3 exists
    expect(hasEnqueueImport).toBe(true);
  });

  it('BugCondition_B3: enqueueRunDiagnosis is NOT called when last answer submitted (runtime)', async () => {
    authMocks.requireStudentSession.mockResolvedValue(CROSS_CLASS_STUDENT_SESSION);

    // Session is ACTIVE, within deadline
    prismaMocks.sessionPinFindFirst.mockResolvedValue({
      id: SESSION_ID,
      state: 'ACTIVE',
      testId: 'test-1',
      startedAt: null, // null → skip deadline check
      test: {
        classId: CLASS_B_ID,
        durationSeconds: 900,
      },
    });

    prismaMocks.studentFindUnique.mockResolvedValue({ classId: CLASS_B_ID });
    prismaMocks.itemVariantFindFirst.mockResolvedValue(mockItemVariant());
    prismaMocks.responseCreate.mockResolvedValue({ id: 'response-last' });

    // This is the LAST answer: studentResponseCount === totalQuestions
    prismaMocks.responseCount.mockResolvedValue(5);  // 5 answers submitted
    prismaMocks.questionCount.mockResolvedValue(5);  // 5 total questions

    const { POST } = await import('@/app/api/responses/route');
    const { NextRequest } = await import('next/server');

    const req = new NextRequest('http://localhost/api/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: SESSION_ID,
        itemVariantId: ITEM_VARIANT_ID,
        chosenOptionKey: 'A',
        criValue: 3,
        responseTimeMs: 5000,
      }),
    });

    const response = await POST(req);
    const body = await response.json();

    // First: the response must succeed (201) — answer saved
    expect(response.status).toBe(201);
    expect(body.success).toBe(true);

    // Wait for fire-and-forget promises to settle (if any)
    await new Promise((resolve) => setTimeout(resolve, 50));

    // EXPECTED AFTER FIX: enqueueRunDiagnosis called once
    // BUG ON UNFIXED CODE: enqueueRunDiagnosis never called (call count = 0)
    // This assertion WILL FAIL on unfixed code — confirms bug #3
    expect(diagnosisMocks.enqueueRunDiagnosis).toHaveBeenCalledOnce();
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// BUG #4 — SSE Broadcast Not Called Per Answer (POST /api/responses)
// isBugCondition_B4: after response.create(), sseManager.broadcast NOT called
// ═══════════════════════════════════════════════════════════════════════════════

describe('Bug #4 — SSE broadcast not called per answer (isBugCondition_B4)', () => {
  /**
   * Bug condition: after prisma.response.create() succeeds, sseManager.broadcast()
   * is never called. Heatmap does not update in real-time per answer.
   *
   * Expected after fix: sseManager.broadcast called at least once per answer.
   * Bug on unfixed code: sseManager.broadcast call count = 0.
   *
   * Counterexample: successful response.create() → sseManager.broadcast never called.
   *
   * Validates: Requirements 1.8
   */

  it('BugCondition_B4: responses/route.ts does NOT import sseManager or buildHeatmapState (unfixed)', () => {
    const src = readSrc('app/api/responses/route.ts');

    // On UNFIXED code: neither sseManager nor buildHeatmapState are imported
    const hasSseImport =
      src.includes('sseManager') || src.includes('heatmap-builder');

    // WILL FAIL on unfixed code — confirms bug #4 exists
    expect(hasSseImport).toBe(true);
  });

  it('BugCondition_B4: sseManager.broadcast is NOT called after a valid answer submission (runtime)', async () => {
    authMocks.requireStudentSession.mockResolvedValue(CROSS_CLASS_STUDENT_SESSION);

    prismaMocks.sessionPinFindFirst.mockResolvedValue({
      id: SESSION_ID,
      state: 'ACTIVE',
      testId: 'test-1',
      startedAt: null,
      test: {
        classId: CLASS_B_ID,
        durationSeconds: 900,
      },
    });

    prismaMocks.studentFindUnique.mockResolvedValue({ classId: CLASS_B_ID });
    prismaMocks.itemVariantFindFirst.mockResolvedValue(mockItemVariant());
    prismaMocks.responseCreate.mockResolvedValue({ id: 'response-sse-test' });

    // Not the last answer — so diagnosis trigger is irrelevant here
    prismaMocks.responseCount.mockResolvedValue(1);
    prismaMocks.questionCount.mockResolvedValue(5);

    const { POST } = await import('@/app/api/responses/route');
    const { NextRequest } = await import('next/server');

    const req = new NextRequest('http://localhost/api/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: SESSION_ID,
        itemVariantId: ITEM_VARIANT_ID,
        chosenOptionKey: 'A',
        criValue: 3,
        responseTimeMs: 5000,
      }),
    });

    const response = await POST(req);
    const body = await response.json();

    // First: the response must succeed (201)
    expect(response.status).toBe(201);
    expect(body.success).toBe(true);

    // Wait for fire-and-forget promises to settle (if any)
    await new Promise((resolve) => setTimeout(resolve, 50));

    // EXPECTED AFTER FIX: sseManager.broadcast called at least once
    // BUG ON UNFIXED CODE: sseManager.broadcast never called (call count = 0)
    // This assertion WILL FAIL on unfixed code — confirms bug #4
    expect(sseMocks.broadcast).toHaveBeenCalled();
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// BUG #5 — Complete Page Has No Back Button or Countdown
// isBugCondition_B5: rendered complete page has no explicit back button
//                   AND no auto-redirect countdown
// ═══════════════════════════════════════════════════════════════════════════════

describe('Bug #5 — Complete page has no back button or countdown (isBugCondition_B5)', () => {
  /**
   * Bug condition: complete/page.tsx is a Server Component (no "use client").
   * It has no back button navigating to /student/join and no countdown useEffect.
   *
   * Expected after fix: explicit back button present, countdown state + auto-redirect.
   * Bug on unfixed code: static Server Component with neither.
   *
   * Counterexample: no button to /student/join, no countdown timer.
   *
   * Validates: Requirements 1.10
   */

  it('BugCondition_B5: complete/page.tsx is a Server Component — missing "use client" directive (unfixed)', () => {
    const src = readSrc('app/student/quiz/[sessionId]/complete/page.tsx');

    // On UNFIXED code: Server Component has NO "use client" at the top
    // After fix: "use client" must be present
    // This assertion WILL FAIL on unfixed code — confirms bug #5
    expect(src.startsWith('"use client"') || src.startsWith("'use client'")).toBe(true);
  });

  it('BugCondition_B5: complete page has NO back button navigating to /student/join (unfixed)', () => {
    const src = readSrc('app/student/quiz/[sessionId]/complete/page.tsx');

    // On UNFIXED code: no button or link that navigates to /student/join
    // After fix: explicit button with onClick={() => router.push('/student/join')} present
    // This assertion WILL FAIL on unfixed code — confirms no back button
    const hasBackButton =
      src.includes('/student/join') &&
      (src.includes('onClick') || src.includes('href'));

    expect(hasBackButton).toBe(true);
  });

  it('BugCondition_B5: complete page has NO countdown timer / auto-redirect logic (unfixed)', () => {
    const src = readSrc('app/student/quiz/[sessionId]/complete/page.tsx');

    // On UNFIXED code: no useState, no useEffect, no countdown variable
    // After fix: countdown state + useEffect for auto-redirect present
    // This assertion WILL FAIL on unfixed code — confirms no countdown
    const hasCountdown =
      src.includes('countdown') &&
      src.includes('useEffect') &&
      src.includes('router.push');

    expect(hasCountdown).toBe(true);
  });

  it('BugCondition_B5: complete page exports metadata (incompatible with "use client") (unfixed)', () => {
    const src = readSrc('app/student/quiz/[sessionId]/complete/page.tsx');

    // On UNFIXED code: Server Component has `export const metadata = ...`
    // After fix: metadata must be REMOVED because "use client" components cannot export metadata
    // If this test PASSES it means the Server Component still has metadata → bug confirmed
    const hasMetadataExport = src.includes('export const metadata');

    // After fix: metadata should be GONE, so hasMetadataExport must be false
    // WILL FAIL on unfixed code (metadata still present, "use client" not added)
    expect(hasMetadataExport).toBe(false);
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// BUG #6 — isSubmitting Not Reset in Finally Block
// isBugCondition_B6: errorOccursAfterApiSuccess AND isSubmitting remains true
// ═══════════════════════════════════════════════════════════════════════════════

describe('Bug #6 — isSubmitting not reset in finally block (isBugCondition_B6)', () => {
  /**
   * Bug condition: in handleSubmit, setIsSubmitting(false) is only inside the
   * setTimeout callback (non-last question) or absent (last question with router.push).
   * If an error occurs after the API call but before setState, isSubmitting stays true.
   *
   * Expected after fix: isSubmitting reset to false in finally block always.
   * Bug on unfixed code: setIsSubmitting(false) NOT in a finally block.
   *
   * Counterexample: errorOccursAfterApiSuccess → isSubmitting remains true.
   *
   * Validates: Requirements 1.11
   */

  it('BugCondition_B6: quiz page.tsx does NOT have setIsSubmitting(false) in a finally block (unfixed)', () => {
    const src = readSrc('app/student/quiz/[sessionId]/page.tsx');

    // On UNFIXED code: there is NO `finally` block in handleSubmit
    // After fix: `finally { ... setIsSubmitting(false) ... }` must be present
    // This assertion WILL FAIL on unfixed code — confirms bug #6
    const hasFinallyWithReset =
      src.includes('finally') &&
      src.includes('setIsSubmitting(false)') &&
      // Ensure handleSubmit's finally block contains setIsSubmitting(false)
      // Search from handleSubmit onwards so we skip the fetchQuiz finally block
      (() => {
        const handleSubmitIdx = src.indexOf('const handleSubmit = useCallback');
        if (handleSubmitIdx < 0) return false;
        // Look for `} finally {` within handleSubmit (up to 4000 chars to cover the function)
        const handleSubmitSection = src.slice(handleSubmitIdx, handleSubmitIdx + 4000);
        const finallyIdx = handleSubmitSection.indexOf('} finally {');
        if (finallyIdx < 0) return false;
        // setIsSubmitting(false) must appear within 300 chars after the finally keyword
        const resetIdx = handleSubmitSection.indexOf('setIsSubmitting(false)', finallyIdx);
        return resetIdx >= 0 && (resetIdx - finallyIdx) < 300;
      })();

    expect(hasFinallyWithReset).toBe(true);
  });

  it('BugCondition_B6: handleSubmit function does NOT have a finally block (unfixed)', () => {
    const src = readSrc('app/student/quiz/[sessionId]/page.tsx');

    // On UNFIXED code: handleSubmit's try/catch does NOT have a finally block.
    // The only `finally` in the file is inside fetchQuiz (for setLoading(false)).
    //
    // To detect the bug: extract the handleSubmit function body and check for finally.
    // Approach: find handleSubmit then look for `} finally {` within handleSubmit's scope.
    const handleSubmitIdx = src.indexOf('const handleSubmit = useCallback');
    expect(handleSubmitIdx).toBeGreaterThanOrEqual(0); // sanity check

    // Extract content from handleSubmit onwards (large enough to cover the whole function)
    const handleSubmitSlice = src.slice(handleSubmitIdx, handleSubmitIdx + 4000);

    // On UNFIXED code: no finally block in handleSubmit
    // After fix: `} finally {` must appear inside handleSubmit
    const hasFinallyInHandleSubmit =
      handleSubmitSlice.includes('} finally {') ||
      handleSubmitSlice.includes('} finally{');

    // WILL FAIL on unfixed code — confirms bug #6 (no finally in handleSubmit)
    expect(hasFinallyInHandleSubmit).toBe(true);
  });

  it('BugCondition_B6: setIsSubmitting(false) is ONLY inside setTimeout (not finally) in non-last-question path (unfixed)', () => {
    const src = readSrc('app/student/quiz/[sessionId]/page.tsx');

    // On UNFIXED code: setIsSubmitting(false) appears inside setTimeout callback
    // The bug: it is NOT guaranteed to run on all execution paths (e.g., if router.push throws)
    //
    // After fix: setIsSubmitting(false) is moved to the finally block.
    // It should NO LONGER be inside setTimeout (not required there since finally covers all paths).
    // The fix guarantees isSubmitting resets regardless of success, error, or unexpected throw.

    const handleSubmitIdx = src.indexOf('const handleSubmit = useCallback');
    expect(handleSubmitIdx).toBeGreaterThanOrEqual(0); // sanity check

    // Check: finally block in handleSubmit contains setIsSubmitting(false)
    // (this is the fixed state — WILL FAIL on unfixed code)
    const handleSubmitSlice = src.slice(handleSubmitIdx, handleSubmitIdx + 4000);
    const hasFinallyInHandleSubmit =
      handleSubmitSlice.includes('} finally {') ||
      handleSubmitSlice.includes('} finally{');

    // WILL FAIL on unfixed code — confirms bug #6 (no finally in handleSubmit)
    expect(hasFinallyInHandleSubmit).toBe(true);

    // Confirm setIsSubmitting(false) exists in the finally block (within 300 chars of finally)
    const finallyIdx = handleSubmitSlice.indexOf('} finally {');
    const resetAfterFinally = handleSubmitSlice.indexOf('setIsSubmitting(false)', finallyIdx);
    const isResetInFinally = finallyIdx >= 0 && resetAfterFinally >= 0 && (resetAfterFinally - finallyIdx) < 300;

    // WILL FAIL on unfixed code — setIsSubmitting(false) not in finally
    expect(isResetInFinally).toBe(true);
  });
});

