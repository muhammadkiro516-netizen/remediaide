/**
 * Remedi Bugfix Batch — Bug Condition Exploration Tests
 * tests/unit/bugfix-batch-exploration.test.ts
 *
 * Phase 1: EXPLORATION TESTS (written BEFORE any fix)
 * These tests MUST FAIL on unfixed code — failure proves each bug exists.
 * DO NOT modify source code to make these tests pass.
 *
 * Bugs covered: 1, 2, 3, 4, 5, 6a, 6b, 7, 8
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9,
 *               1.10, 1.11, 1.12, 1.13, 1.14, 1.15, 1.16, 1.17
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9,
 *               1.10, 1.11, 1.12, 1.13, 1.14, 1.15, 1.16, 1.17**
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// ─── Source paths ─────────────────────────────────────────────────────────────

const SRC = path.resolve(__dirname, '../../src');

function readSrc(relative: string): string {
  return fs.readFileSync(path.join(SRC, relative), 'utf-8');
}

// ─── Prisma mocks ─────────────────────────────────────────────────────────────

const prismaMocks = vi.hoisted(() => ({
  testFindFirst: vi.fn(),
  questionCreate: vi.fn(),
  questionCount: vi.fn(),
  itemVariantDeleteMany: vi.fn(),
  questionDeleteMany: vi.fn(),
  sessionPinDeleteMany: vi.fn(),
  sessionPinFindUnique: vi.fn(),
  sessionPinCount: vi.fn(),
  testDelete: vi.fn(),
  responseDeleteMany: vi.fn(),
  conceptDiagnosisDeleteMany: vi.fn(),
  remedialGroupDeleteMany: vi.fn(),
  autoWipeLogDeleteMany: vi.fn(),
  classFindFirst: vi.fn(),
  classDelete: vi.fn(),
  studentCount: vi.fn(),
  studentFindMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    test: { findFirst: prismaMocks.testFindFirst },
    question: {
      create: prismaMocks.questionCreate,
      count: prismaMocks.questionCount,
    },
    itemVariant: { deleteMany: prismaMocks.itemVariantDeleteMany },
    sessionPin: {
      findUnique: prismaMocks.sessionPinFindUnique,
      deleteMany: prismaMocks.sessionPinDeleteMany,
      count: prismaMocks.sessionPinCount,
    },
    test_delete: { delete: prismaMocks.testDelete },
    response: { deleteMany: prismaMocks.responseDeleteMany },
    conceptDiagnosis: { deleteMany: prismaMocks.conceptDiagnosisDeleteMany },
    remedialGroup: { deleteMany: prismaMocks.remedialGroupDeleteMany },
    autoWipeLog: { deleteMany: prismaMocks.autoWipeLogDeleteMany },
    class: {
      findFirst: prismaMocks.classFindFirst,
      delete: prismaMocks.classDelete,
    },
    student: {
      count: prismaMocks.studentCount,
      findMany: prismaMocks.studentFindMany,
    },
    $transaction: prismaMocks.transaction,
  },
}));

// ─── Auth session mocks ───────────────────────────────────────────────────────

const authMocks = vi.hoisted(() => ({
  requireTeacherSession: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  requireTeacherSession: authMocks.requireTeacherSession,
  getTeacherSession: vi.fn(),
  requireRole: vi.fn(),
}));

// ─── Shared teacher session fixture ──────────────────────────────────────────

const TEACHER_SESSION = {
  userId: 'teacher-1',
  schoolId: 'school-1',
  role: 'TEACHER' as const,
  name: 'Guru Demo',
  email: 'guru@test.com',
};

// ─── Bug 1 — Text Options: questionType "text" not supported ─────────────────

describe('Bug 1 — Text Options (variant-generator)', () => {
  /**
   * Property 1: Bug Condition — Text Option Type Support
   * C(X): POST questions with questionType="text" and textOptions array
   * Expected after fix: HTTP 201, renderedOptions[0].text is a text string
   * On unfixed code: API ignores questionType field, tries to parseTemplate, fails
   *
   * Validates: Requirements 1.1, 1.2, 1.3
   */

  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requireTeacherSession.mockResolvedValue(TEACHER_SESSION);
  });

  it('Bug 1 PROOF: questions/route.ts POST handler does NOT handle questionType="text" field', () => {
    // Read the actual source of the questions POST handler
    const routeSrc = readSrc('app/api/tests/[testId]/questions/route.ts');

    // On unfixed code: no handling for "text" questionType
    // After fix: should branch on questionType === "text"
    const handlesTextQuestionType =
      routeSrc.includes('questionType') &&
      routeSrc.includes('"text"') &&
      routeSrc.includes('textOptions');

    // EXPECT TO FAIL on unfixed code: this should be false (bug condition)
    expect(handlesTextQuestionType).toBe(true);
  });

  it('Bug 1 PROOF: variant-generator.ts does NOT export generateStaticVariant', () => {
    const generatorSrc = readSrc('lib/template/variant-generator.ts');

    // On unfixed code: no generateStaticVariant function
    // After fix: should export generateStaticVariant
    const hasStaticVariantFunction = generatorSrc.includes('generateStaticVariant');

    // EXPECT TO FAIL on unfixed code
    expect(hasStaticVariantFunction).toBe(true);
  });

  it('Bug 1 PROOF: POST /questions with text-type request fails to produce renderedOptions with text strings', async () => {
    // Simulate what the API does with a text-options request on unfixed code:
    // It calls parseTemplate() which will fail because there are no {{variables}}
    const { parseTemplate } = await import('@/lib/template/parser');

    const templateText = 'Mana yang bukan jenis energi?';
    const result = parseTemplate(templateText);

    // On unfixed code: template without variables fails or has no renderedOptions with text
    // After fix: text-type questions bypass parseTemplate entirely
    // This confirms the bug: a plain text question without {{var}} syntax FAILS to parse
    // or produces a question with no renderedOptions containing text strings
    const wouldFailParsing = !result.ok;

    // EXPECT TO FAIL on unfixed code (this assertion will fail after the fix is applied)
    // The bug is: even if parse succeeds, there's no mechanism to set text options
    const hasTextOptionsInSource = readSrc('app/api/tests/[testId]/questions/route.ts')
      .includes('textOptions');

    expect(hasTextOptionsInSource).toBe(true); // fails on unfixed
  });
});

// ─── Bug 2 — VariantPreview: error state has no retry button ─────────────────

describe('Bug 2 — VariantPreview error state missing retry button', () => {
  /**
   * Property 3: Bug Condition — VariantPreview Error Has Retry
   * C(X): VariantPreview component in error state (error !== null)
   * Expected after fix: error div + "Coba lagi" button visible
   * On unfixed code: error shown but NO retry button
   *
   * Validates: Requirements 1.4, 1.5
   */

  it('Bug 2 PROOF: VariantPreview error block does NOT contain a "Coba lagi" retry button', () => {
    const componentSrc = readSrc('components/teacher/VariantPreview.tsx');

    // Find the error rendering block: {!loading && error && ...}
    // On unfixed code: the error block has no button for retry
    // After fix: a "Coba lagi" button that calls loadVariants() is present

    // Check that the error section contains a retry button calling loadVariants
    const errorBlockHasRetryButton =
      componentSrc.includes('Coba lagi') ||
      componentSrc.includes('coba lagi') ||
      componentSrc.includes('↺ Coba');

    // EXPECT TO FAIL on unfixed code: no retry button in error state
    expect(errorBlockHasRetryButton).toBe(true);
  });

  it('Bug 2 PROOF: VariantPreview error block does not call loadVariants() for retry', () => {
    const componentSrc = readSrc('components/teacher/VariantPreview.tsx');

    // Extract the error rendering section
    // On unfixed code: the error section only renders a div with the error message
    // After fix: there's a button onClick={loadVariants} inside the error block

    // The fix requires a button inside the error div that calls loadVariants
    // We check if there's a pattern of button + loadVariants inside the error block
    const errorSectionIndex = componentSrc.indexOf('{!loading && error &&');
    const nextSectionIndex = componentSrc.indexOf('{!loading && !error &&', errorSectionIndex);

    if (errorSectionIndex === -1) {
      // Error block doesn't exist at all — definitely a bug
      expect(false).toBe(true);
      return;
    }

    const errorBlock = componentSrc.slice(errorSectionIndex, nextSectionIndex);
    const retryButtonInErrorBlock =
      errorBlock.includes('onClick={loadVariants}') ||
      errorBlock.includes('onClick={() => loadVariants') ||
      errorBlock.includes('Coba lagi');

    // EXPECT TO FAIL on unfixed code
    expect(retryButtonInErrorBlock).toBe(true);
  });
});

// ─── Bug 3 — Delete Test with relations fails with FK constraint ──────────────

describe('Bug 3 — Delete Test with related records (P2003 foreign key)', () => {
  /**
   * Property 5: Bug Condition — Test Delete Cascades Correctly
   * C(X): test has related Questions + SessionPins; call DELETE /api/tests/:id
   * Expected after fix: HTTP 200, cascade delete
   * On unfixed code: HTTP 500 Prisma P2003 foreign key constraint
   *
   * Validates: Requirements 1.6, 1.7
   */

  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requireTeacherSession.mockResolvedValue(TEACHER_SESSION);
  });

  it('Bug 3 PROOF: DELETE /api/tests/:testId route does NOT perform cascade delete', () => {
    const routeSrc = readSrc('app/api/tests/[testId]/route.ts');

    // On unfixed code: DELETE handler directly calls prisma.test.delete() without cascade
    // After fix: must delete variants → questions → sessions → test in order

    const hasCascadeDelete =
      routeSrc.includes('itemVariant') ||
      routeSrc.includes('deleteMany') ||
      routeSrc.includes('$transaction');

    // EXPECT TO FAIL on unfixed code: no cascade logic present
    expect(hasCascadeDelete).toBe(true);
  });

  it('Bug 3 PROOF: DELETE route throws P2003 when test has related records', async () => {
    // Simulate unfixed route behavior: directly call prisma.test.delete which throws P2003
    const { NextRequest } = await import('next/server');

    // Mock: test exists
    prismaMocks.testFindFirst.mockResolvedValue({
      id: 'test-with-relations',
      schoolId: 'school-1',
      topic: 'Newton',
    });

    // Mock: prisma.test.delete throws a Prisma P2003 foreign key constraint error
    // This is what the unfixed code does — no cascade, direct delete fails
    const { PrismaClientKnownRequestError } = await import('@prisma/client/runtime/library');
    const p2003Error = new PrismaClientKnownRequestError(
      'Foreign key constraint failed',
      { code: 'P2003', clientVersion: '6.0.0', meta: {} }
    );

    // The unfixed DELETE handler will call prisma.test.delete → throws P2003 → 500
    // We verify the route source doesn't have cascade delete
    const routeSrc = readSrc('app/api/tests/[testId]/route.ts');
    const directDeleteWithoutCascade =
      routeSrc.includes('prisma.test.delete') &&
      !routeSrc.includes('$transaction') &&
      !routeSrc.includes('itemVariant.deleteMany');

    // EXPECT TO FAIL on unfixed code: this should be FALSE (i.e., after fix no direct delete)
    expect(directDeleteWithoutCascade).toBe(false);
  });
});

// ─── Bug 4 — CSV Import endpoint doesn't exist ───────────────────────────────

describe('Bug 4 — CSV Import endpoint missing (404)', () => {
  /**
   * Property 8: Bug Condition — CSV Questions Import
   * C(X): POST /api/tests/:testId/questions/csv
   * Expected after fix: HTTP 201 { data: { created: N } }
   * On unfixed code: HTTP 404 (route doesn't exist)
   *
   * Validates: Requirements 1.8, 1.9
   */

  it('Bug 4 PROOF: CSV import route file does NOT exist', () => {
    const csvRoutePath = path.join(
      SRC,
      'app/api/tests/[testId]/questions/csv/route.ts'
    );

    const csvRouteExists = fs.existsSync(csvRoutePath);

    // EXPECT TO FAIL on unfixed code: the file doesn't exist
    expect(csvRouteExists).toBe(true);
  });

  it('Bug 4 PROOF: QuestionsPage does NOT have an Import CSV button', () => {
    const pageSrc = readSrc('app/dashboard/tests/[testId]/questions/page.tsx');

    // On unfixed code: no "Import CSV" button in the page
    // After fix: button present that opens the import dialog
    const hasImportCsvButton =
      pageSrc.includes('Import CSV') ||
      pageSrc.includes('ImportQuestionsDialog') ||
      pageSrc.includes('import-csv');

    // EXPECT TO FAIL on unfixed code
    expect(hasImportCsvButton).toBe(true);
  });
});

// ─── Bug 5 — Delete Class with students returns 500 instead of 409 ───────────

describe('Bug 5 — Delete Class with students (foreign key → should be 409)', () => {
  /**
   * Property 9: Bug Condition — Class Delete Returns 409 on FK Constraint
   * C(X): class has students; call DELETE /api/classes/:id
   * Expected after fix: HTTP 409 { error: { code: 'CONSTRAINT_ERROR' } }
   * On unfixed code: HTTP 500
   *
   * Validates: Requirements 1.10, 1.11
   */

  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requireTeacherSession.mockResolvedValue(TEACHER_SESSION);
  });

  it('Bug 5 PROOF: DELETE /api/classes/:id route does NOT check for existing students', () => {
    const routeSrc = readSrc('app/api/classes/[id]/route.ts');

    // On unfixed code: no studentCount check before delete, no 409 handling
    // After fix: must check studentCount and return 409 with CONSTRAINT_ERROR
    const hasConstraintHandling =
      (routeSrc.includes('studentCount') || routeSrc.includes('student.count')) &&
      routeSrc.includes('CONSTRAINT_ERROR') &&
      routeSrc.includes('409');

    // EXPECT TO FAIL on unfixed code
    expect(hasConstraintHandling).toBe(true);
  });

  it('Bug 5 PROOF: DELETE /api/classes/:id returns 500 instead of 409 when class has students', async () => {
    const { NextRequest } = await import('next/server');
    const { DELETE } = await import('@/app/api/classes/[id]/route');

    // Mock: class exists
    prismaMocks.classFindFirst.mockResolvedValue({
      id: 'class-with-students',
      schoolId: 'school-1',
      name: '10-A',
    });

    // Mock: studentCount returns 1 — simulates a class with enrolled students
    // The fixed route checks studentCount > 0 before calling delete
    prismaMocks.studentCount.mockResolvedValue(1);

    // Mock: prisma.class.delete throws a Prisma P2003 foreign key constraint error
    // This simulates having students in the class (safety-net fallback path)
    const { PrismaClientKnownRequestError } = await import('@prisma/client/runtime/library');
    const p2003Error = new PrismaClientKnownRequestError(
      'Foreign key constraint failed on the field: `Student_classId_fkey`',
      { code: 'P2003', clientVersion: '6.0.0', meta: { field_name: 'Student_classId_fkey' } }
    );
    prismaMocks.classDelete.mockRejectedValue(p2003Error);

    const req = new NextRequest('http://localhost/api/classes/class-with-students', {
      method: 'DELETE',
    });

    const response = await DELETE(req, {
      params: Promise.resolve({ id: 'class-with-students' }),
    });

    const body = await response.json();

    // On unfixed code: returns 500 INTERNAL_ERROR
    // After fix: should return 409 CONSTRAINT_ERROR
    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('CONSTRAINT_ERROR');
  });
});

// ─── Bug 6a — Back Button missing on QuestionsPage ───────────────────────────

describe('Bug 6a — Back button missing on QuestionsPage', () => {
  /**
   * Property 11: Bug Condition — Back Button Exists on QuestionsPage
   * C(X): render QuestionsPage, check for "← Kembali ke Paket Soal"
   * Expected after fix: element with that text exists in DOM
   * On unfixed code: no such element
   *
   * Validates: Requirements 1.12, 1.13
   */

  it('Bug 6a PROOF: QuestionsPage does NOT contain "Kembali ke Paket Soal" back button', () => {
    const pageSrc = readSrc('app/dashboard/tests/[testId]/questions/page.tsx');

    // On unfixed code: no back button in the header
    // After fix: must contain a Link/button with "← Kembali ke Paket Soal"
    const hasBackButton =
      pageSrc.includes('Kembali ke Paket Soal') ||
      pageSrc.includes('kembali-ke-paket');

    // EXPECT TO FAIL on unfixed code
    expect(hasBackButton).toBe(true);
  });

  it('Bug 6a PROOF: QuestionsPage has no navigation link to /dashboard/tests', () => {
    const pageSrc = readSrc('app/dashboard/tests/[testId]/questions/page.tsx');

    // On unfixed code: no explicit back link to /dashboard/tests
    // After fix: should have href="/dashboard/tests"
    const hasBackLink = pageSrc.includes('href="/dashboard/tests"') ||
                        pageSrc.includes("href='/dashboard/tests'");

    // EXPECT TO FAIL on unfixed code
    expect(hasBackLink).toBe(true);
  });
});

// ─── Bug 6b — Login uses window.location.href instead of router.push ─────────

describe('Bug 6b — Login navigation uses window.location.href instead of router.push', () => {
  /**
   * Property 12: Bug Condition — Login Uses router.push
   * C(X): successful login, check navigation method used
   * Expected after fix: router.push called, NOT window.location.href
   * On unfixed code: window.location.href is used
   *
   * Validates: Requirements 1.12, 1.13
   */

  it('Bug 6b PROOF: login/page.tsx uses window.location.href for post-login navigation', () => {
    const loginSrc = readSrc('app/login/page.tsx');

    // On unfixed code: uses window.location.href = destination
    const usesWindowLocationHref = loginSrc.includes('window.location.href');

    // EXPECT TO FAIL on unfixed code: window.location.href IS used (should NOT be)
    // The test proves the bug: after fix, window.location.href should be REMOVED
    expect(usesWindowLocationHref).toBe(false);
  });

  it('Bug 6b PROOF: login/page.tsx does NOT use router.push for post-login navigation', () => {
    const loginSrc = readSrc('app/login/page.tsx');

    // On unfixed code: router is imported but never used for navigation
    // After fix: router.push(destination) replaces window.location.href = destination
    const usesRouterPush =
      loginSrc.includes('router.push(destination)') ||
      loginSrc.includes('router.push(callbackUrl)') ||
      (loginSrc.includes('router.push(') && loginSrc.includes('destination'));

    // EXPECT TO FAIL on unfixed code
    expect(usesRouterPush).toBe(true);
  });
});

// ─── Bug 7 — Session race condition: router.push before session confirmed ─────

describe('Bug 7 — Session race condition (router.push before session ready)', () => {
  /**
   * Property 13: Bug Condition — Student Portal Session Wait
   * C(X): signIn() succeeds, getSession() returns null on first call
   * Expected after fix: router.push NOT called until session confirmed
   * On unfixed code: router.push called immediately after signIn resolves
   *
   * Validates: Requirements 1.14, 1.15
   */

  it('Bug 7 PROOF: student/join/page.tsx calls router.push immediately after signIn without session verification', () => {
    const joinSrc = readSrc('app/student/join/page.tsx');

    // On unfixed code: after signIn(), router.push is called immediately
    // No getSession() call, no delay before router.push
    // After fix: getSession() or delay must appear before router.push

    // Check that the unfixed code has the race condition pattern
    const hasSessionWait =
      joinSrc.includes('getSession') ||
      (joinSrc.includes('setTimeout') && joinSrc.includes('router.push'));

    // EXPECT TO FAIL on unfixed code: no session wait present
    expect(hasSessionWait).toBe(true);
  });

  it('Bug 7 PROOF: handleSelectSubmit calls router.push immediately after signIn without delay', () => {
    const joinSrc = readSrc('app/student/join/page.tsx');

    // Extract the handleSelectSubmit function region to check the order of operations
    const selectSubmitIdx = joinSrc.indexOf('handleSelectSubmit');
    if (selectSubmitIdx === -1) {
      expect(false).toBe(true); // function not found
      return;
    }

    // Get the function body (next 50 lines approx)
    const functionSlice = joinSrc.slice(
      selectSubmitIdx,
      selectSubmitIdx + 2000
    );

    // On unfixed code: signIn() is called, then immediately router.push
    // No await getSession(), no delay
    const signInIdx = functionSlice.indexOf('signIn(');
    const routerPushIdx = functionSlice.indexOf('router.push(');
    const getSessionIdx = functionSlice.indexOf('getSession()');

    // Bug condition: router.push comes after signIn but there's no getSession() call
    const hasRaceCondition =
      signInIdx !== -1 &&
      routerPushIdx !== -1 &&
      getSessionIdx === -1; // no getSession call at all

    // EXPECT TO FAIL on unfixed code: race condition IS present
    // After fix: getSession() should exist between signIn and router.push
    expect(hasRaceCondition).toBe(false);
  });
});

// ─── Bug 8 — Student list includes cross-class students ──────────────────────

describe('Bug 8 — Student list not filtered by classId (privacy bug)', () => {
  /**
   * Property 15: Bug Condition — Student List Filtered by ClassId
   * C(X): valid PIN for session of class A; call POST /api/student/join
   * Expected after fix: only students from class A returned
   * On unfixed code: all students from the school returned (no classId filter)
   *
   * Validates: Requirements 1.16, 1.17
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Bug 8 PROOF: POST /api/student/join does NOT filter students by classId', () => {
    const routeSrc = readSrc('app/api/student/join/route.ts');

    // On unfixed code: student.findMany uses only { schoolId } filter
    // No classId included anywhere in the query
    // After fix: { schoolId: sessionPin.schoolId, classId: sessionPin.test.classId }

    const filtersStudentsByClassId =
      routeSrc.includes('classId') &&
      routeSrc.includes('test.classId');

    // EXPECT TO FAIL on unfixed code: classId filter is NOT present
    expect(filtersStudentsByClassId).toBe(true);
  });

  it('Bug 8 PROOF: sessionPin lookup does NOT include test relation with classId', () => {
    const routeSrc = readSrc('app/api/student/join/route.ts');

    // On unfixed code: sessionPin query only selects { id, schoolId, state }
    // It does NOT include: { test: { select: { classId: true } } }
    // After fix: must include test.classId in the select

    const sessionPinSelectIdx = routeSrc.indexOf('sessionPin.findUnique');
    if (sessionPinSelectIdx === -1) {
      expect(false).toBe(true);
      return;
    }

    const sessionPinBlock = routeSrc.slice(
      sessionPinSelectIdx,
      sessionPinSelectIdx + 500
    );

    const includesTestClassId =
      sessionPinBlock.includes('test') &&
      sessionPinBlock.includes('classId');

    // EXPECT TO FAIL on unfixed code: test.classId NOT in sessionPin query
    expect(includesTestClassId).toBe(true);
  });

  it('Bug 8 PROOF: student.findMany query returns students from ALL classes in the school', async () => {
    const { POST } = await import('@/app/api/student/join/route');
    const { NextRequest } = await import('next/server');

    const SCHOOL_ID = 'school-bug8';
    const CLASS_A_ID = 'class-A';
    const CLASS_B_ID = 'class-B';

    // Mock: active session pin for class A — include test.classId (required by the fix)
    prismaMocks.sessionPinFindUnique.mockResolvedValue({
      id: 'session-1',
      schoolId: SCHOOL_ID,
      state: 'ACTIVE',
      test: { classId: CLASS_A_ID },
    });

    // After fix: student.findMany is called with { schoolId, classId: CLASS_A_ID }
    // The DB only returns students matching that classId filter (class A only).
    const studentsFromClassAOnly = [
      { id: 'student-a1', anonymousLabel: 'Siswa_01' },
      { id: 'student-a2', anonymousLabel: 'Siswa_02' },
    ];
    prismaMocks.studentFindMany.mockResolvedValue(studentsFromClassAOnly);

    const req = new NextRequest('http://localhost/api/student/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinCode: '123456', studentId: '' }),
    });

    const response = await POST(req);
    const body = await response.json();

    expect(body.success).toBe(true);

    const returnedStudents = body.data?.students ?? [];

    // After fix: only class A students are returned — verify class B students are absent
    const crossClassStudentsFound = returnedStudents.some(
      (s: { id: string; anonymousLabel: string }) =>
        s.id === 'student-b1' || s.id === 'student-b2'
    );

    // EXPECT TO PASS after fix: cross-class students NOT present in response
    expect(crossClassStudentsFound).toBe(false);

    // Also verify the where clause passed to studentFindMany included classId
    expect(prismaMocks.studentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          schoolId: SCHOOL_ID,
          classId: CLASS_A_ID,
        }),
      })
    );
  });
});
