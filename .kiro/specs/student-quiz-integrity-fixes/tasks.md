# Implementation Plan

## Overview

Rencana implementasi ini mencakup perbaikan 6 bug pada alur siswa RemediAide menggunakan bug condition methodology. Bug #1 (KRITIS) adalah celah keamanan cross-class authentication bypass; Bug #2–#6 adalah gap fungsionalitas: deadline enforcement, auto-trigger diagnosis, SSE broadcast real-time, complete page redirect, dan state reset di finally block. Alur: (1) tulis exploration tests SEBELUM fix untuk membuktikan bug ada, (2) tulis preservation tests untuk mendokumentasikan baseline, (3) implementasikan fix per-bug, (4) verifikasi tiap fix lulus, (5) checkpoint akhir.

## Tasks

- [x] 1. Write bug condition exploration tests (BEFORE implementing any fix)
  - **Property 1: Bug Condition** - Cross-Class Authentication Bypass & All Bug Conditions
  - **CRITICAL**: These tests MUST FAIL on unfixed code — failure confirms each bug exists
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **GOAL**: Surface counterexamples that demonstrate each bug exists before implementing any fix

  - **Bug #1 — Cross-class auth bypass:**
    - isBugCondition_B1: create student from Class B, look up PIN of active Class A session, call `authorize()` in provider `student-pin` → assert returns `null` (WILL PASS on unfixed code — bug confirms bypass)
    - Scope: `(pinCode, studentId)` where `student.schoolId === sessionPin.schoolId` AND `student.classId !== sessionPin.test.classId` AND `sessionPin.state === 'ACTIVE'`
    - Expected after fix: `authorize()` returns `null`, `POST /api/responses` returns `403 FORBIDDEN`
    - Counterexample to document: `authorize({ pinCode: "PIN-A", studentId: "S-B-01" })` returns session instead of null

  - **Bug #2 — Server-side deadline not enforced:**
    - isBugCondition_B2: mock `Date.now()` to value after `startedAt + durationSeconds * 1000`, submit answer to ACTIVE session → assert returns `409 SESSION_EXPIRED` (WILL return `201` on unfixed code)
    - Scope: `sessionPin.state === 'ACTIVE'` AND `startedAt !== null` AND `startedAt + durationSeconds * 1000 < Date.now()`
    - Counterexample to document: submit with `Date.now()` = deadline + 1ms returns 201 instead of 409

  - **Bug #3 — Auto-diagnosis not triggered:**
    - isBugCondition_B3: spy on `enqueueRunDiagnosis`, submit last answer (mock `response.count === totalQuestions`) → assert `enqueueRunDiagnosis` called once (WILL NOT be called on unfixed code)
    - Counterexample to document: studentResponseCount = totalQuestions, enqueueRunDiagnosis not called

  - **Bug #4 — SSE broadcast not called per answer:**
    - isBugCondition_B4: spy on `sseManager.broadcast`, submit any valid answer → assert `broadcast` called once (WILL NOT be called on unfixed code)
    - Counterexample to document: successful response.create(), sseManager.broadcast never called

  - **Bug #5 — Complete page has no back button or countdown:**
    - isBugCondition_B5: render `QuizCompletePage` → assert has explicit back button → assert has countdown state (WILL fail assertions on unfixed Server Component)
    - Counterexample to document: no button with href/onClick to /student/join, no countdown timer

  - **Bug #6 — isSubmitting not reset in finally:**
    - isBugCondition_B6: mock `router.push` to throw error after successful `fetch`, run `handleSubmit` → assert `isSubmitting === false` after (WILL be `true` on unfixed code)
    - Counterexample to document: errorOccursAfterApiSuccess → isSubmitting stays true

  - Run all exploration tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct — proves all bugs exist)
  - Document all counterexamples found to understand root cause before implementing
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 1.10, 1.11_

- [x] 2. Write preservation property tests (BEFORE implementing any fix)
  - **Property 2: Preservation** - Valid Auth, Active Session, Partial Completion, SSE State, Complete Page Visual, Error State
  - **IMPORTANT**: Follow observation-first methodology — observe behavior on UNFIXED code for non-buggy inputs
  - **GOAL**: Capture baseline behavior that must not change after any fix

  - **Preservation #1 — Valid student auth unchanged (Bug #1):**
    - Observe: `authorize({ pinCode: "PIN-A", studentId: "S-A-01" })` where S-A-01 belongs to Class A → returns valid session on unfixed code
    - Property: FOR ALL `(pinCode, studentId)` where `student.classId === sessionPin.test.classId` AND `student.schoolId === sessionPin.schoolId` → auth STILL succeeds after fix
    - Property-based: generate random valid (classId-matching) student+pin pairs → all must pass auth

  - **Preservation #2 — Active session accepts valid answers (Bug #2):**
    - Observe: submit answer with `Date.now()` well before deadline → returns `201` on unfixed code
    - Property: FOR ALL requests where `state === 'ACTIVE'` AND `Date.now() < startedAt + durationSeconds * 1000` → endpoint STILL returns `201`
    - Property-based: generate random timestamps in range [startedAt, deadline) → all must return 201

  - **Preservation #3 — Partial completion does not trigger diagnosis (Bug #3):**
    - Observe: spy on `enqueueRunDiagnosis`, submit answer 1 of 5 → `enqueueRunDiagnosis` NOT called on unfixed code
    - Property: FOR ALL (studentResponseCount < totalQuestions) → `enqueueRunDiagnosis` is NOT called
    - Property-based: generate random response counts from 1 to (totalQuestions - 1) → enqueueRunDiagnosis must never be called

  - **Preservation #4 — SSE last state preserved for new clients (Bug #4):**
    - Observe: `sseManager.getLastState(sessionId)` returns stored state even when no clients connected on unfixed code
    - Property: after any broadcast, `getLastState(sessionId)` STILL returns the last broadcasted entries for newly connecting clients
    - Verify: existing behavior of `getLastState()` returning cached state is not broken by adding new broadcast calls

  - **Preservation #5 — Complete page visual content preserved (Bug #5):**
    - Observe: render existing complete page → green checkmark, "Kuis Selesai!" message, "tunggu guru" instruction present on unfixed code
    - Property: after converting to Client Component, all existing visual elements STILL present
    - Test: render converted page → assert green checkmark element exists, assert "Kuis Selesai!" text, assert instruction text visible

  - **Preservation #6 — Error path state preserved (Bug #6):**
    - Observe: mock API to return non-2xx → `isSubmitting = false`, error message shown, no soal transition on unfixed code
    - Property: FOR ALL API error responses → error handling behavior STILL unchanged (error msg + retry countdown shown, no page transition)
    - Test: mock fetch to return 500 → assert isSubmitting resets to false, assert error message displayed, assert currentIndex unchanged

  - **Preservation #7 — Closed/locked session still rejected (Bug #1, #2):**
    - Observe: session with `state = 'CLOSED'` → auth fails and answer submission returns `SESSION_CLOSED` on unfixed code
    - Property: state-based rejection (CLOSED/LOCKED) STILL works after adding classId + deadline checks

  - Run all preservation tests on UNFIXED code
  - **EXPECTED OUTCOME**: ALL preservation tests PASS (this confirms the baseline to protect)
  - Mark task complete when tests are written, run, and all pass on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 3.9, 3.10, 3.11, 3.12_

- [x] 3. Fix Bug #1 — Cross-class authentication bypass

  - [x] 3.1 Fix `src/auth.ts` provider `student-pin`
    - Extend sessionPin query to include `test: { select: { classId: true } }`
    - Extend student query to include `classId: true`
    - Add classId validation: `student.classId !== sessionPin.test.classId → return null`
    - _Bug_Condition: isBugCondition_B1 — student.classId !== sessionPin.test.classId AND schoolId matches AND session ACTIVE_
    - _Expected_Behavior: authorize() returns null when classId mismatch_
    - _Preservation: student with matching classId+schoolId STILL authenticates successfully (3.1, 3.2)_
    - _Requirements: 2.1, 3.1, 3.2_

  - [x] 3.2 Fix `src/app/api/student/join/route.ts` — studentId-provided path
    - Add `classId: true` to student `select` in the `if (studentId)` block
    - Add classId validation: `student.classId !== sessionPin.test.classId → return error response`
    - Note: the no-studentId path (return student list) already filters by `classId: sessionPin.test.classId` — do not change it
    - _Bug_Condition: isBugCondition_B1 — studentId provided but classId not validated in join route_
    - _Expected_Behavior: join endpoint validates classId in both paths_
    - _Requirements: 2.3, 3.1_

  - [x] 3.3 Fix `src/app/api/responses/route.ts` — add classId cross-check layer
    - Extend sessionPin `select` to include `test: { select: { classId: true } }` (will be extended further in task 4.1)
    - After sessionPin validation, fetch student `classId` via `prisma.student.findUnique({ where: { id: studentSession.studentId }, select: { classId: true } })`
    - Add cross-check: `student.classId !== sessionPin.test.classId → return 403 FORBIDDEN`
    - Error body: `{ success: false, error: { code: 'FORBIDDEN', message: 'Anda tidak terdaftar di kelas sesi ini.' } }`
    - _Bug_Condition: isBugCondition_B1 — student belongs to different class, bypass reaches /api/responses_
    - _Expected_Behavior: 403 FORBIDDEN returned for cross-class submission_
    - _Requirements: 2.1, 2.2, 3.1_

  - [x] 3.4 Verify Bug #1 exploration test now passes
    - **Property 1: Expected Behavior** - Cross-Class Authentication Rejected
    - **IMPORTANT**: Re-run the SAME tests from task 1 (Bug #1 assertions) — do NOT write new tests
    - `authorize()` with cross-class credentials must return `null`
    - `POST /api/responses` with cross-class JWT must return `403 FORBIDDEN`
    - **EXPECTED OUTCOME**: Tests PASS (confirms Bug #1 is fixed)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.5 Manual end-to-end verification — two students, two browsers (REQUIRED before Task 3 is considered complete)
    - **TUJUAN**: Konfirmasi fix bekerja di kondisi nyata — unit test dengan mock tidak cukup untuk celah keamanan
    - **Prasyarat**: Aplikasi berjalan di localhost, seed data tersedia dengan minimal 2 kelas dan masing-masing ≥1 siswa
    - **Setup data yang dibutuhkan**:
      - Kelas X-A: siswa `S-A-01` (catat PIN-nya)
      - Kelas X-B: siswa `S-B-01` (kelas berbeda, sekolah sama)
      - Satu sesi aktif (ACTIVE) untuk Kelas X-A — catat PIN sesi
    - **Skenario 1 — Lapis 1 (Login/Join ditolak)**:
      - Buka browser terpisah (atau incognito window)
      - Gunakan identitas siswa `S-B-01` (Kelas X-B)
      - Masukkan PIN sesi Kelas X-A di halaman join
      - **Expected**: Sistem menolak — `S-B-01` tidak muncul di daftar siswa kelas X-A, atau mendapat error karena classId tidak cocok
      - **Document result**: catat response/pesan error yang muncul
    - **Skenario 2 — Lapis 2 (Submit jawaban ditolak, bypass JWT)**:
      - Jika bypass lapis 1 masih mungkin (misal: session JWT lama sebelum fix), coba kirim request `POST /api/responses` langsung via DevTools/curl menggunakan JWT siswa X-B dengan sessionId sesi X-A
      - **Expected**: Response `403 FORBIDDEN` dengan `code: 'FORBIDDEN'`
      - **Document result**: catat HTTP status dan body response
    - **Skenario 3 — Preservation: siswa yang benar tetap bisa masuk**:
      - Gunakan identitas `S-A-01` (Kelas X-A) di browser berbeda
      - Masukkan PIN sesi Kelas X-A
      - **Expected**: Login berhasil, soal muncul, submit jawaban diterima `201`
      - **Document result**: konfirmasi flow normal tidak terganggu
    - **Laporkan hasil ketiga skenario secara eksplisit** — Task 3 TIDAK dianggap selesai sampai hasil manual test ini dilaporkan
    - _Requirements: 2.1, 2.2, 2.3, 3.1_

  - [x] 3.6 Verify preservation tests still pass after Bug #1 fix
    - **Property 2: Preservation** - Valid Auth Unchanged, Closed Session Still Rejected
    - **IMPORTANT**: Re-run the SAME preservation tests from task 2 — do NOT write new tests
    - Valid student with matching classId STILL authenticates
    - CLOSED/LOCKED sessions STILL rejected
    - **EXPECTED OUTCOME**: All preservation tests PASS (no regressions from Bug #1 fix)

- [x] 4. Fix Bug #2 — Server-side deadline enforcement

  - [x] 4.1 Fix `src/app/api/responses/route.ts` — add deadline check
    - Extend sessionPin `select` to additionally include `startedAt: true` and `test: { select: { durationSeconds: true } }` (merge with classId select from task 3.3)
    - After `state === 'ACTIVE'` check and BEFORE classId cross-check, add deadline validation:
      ```
      if (sessionPin.startedAt) {
        const deadlineMs = sessionPin.startedAt.getTime() + sessionPin.test.durationSeconds * 1000;
        if (Date.now() > deadlineMs) → return 409 SESSION_EXPIRED
      }
      ```
    - Error body: `{ success: false, error: { code: 'SESSION_EXPIRED', message: 'Waktu sesi telah habis.' } }`
    - Final sessionPin select must include: `id, state, testId, startedAt, test: { classId, durationSeconds }`
    - _Bug_Condition: isBugCondition_B2 — state ACTIVE but startedAt + durationSeconds * 1000 < Date.now()_
    - _Expected_Behavior: 409 SESSION_EXPIRED returned when past deadline_
    - _Preservation: ACTIVE sessions within deadline STILL return 201 (3.3); manually closed sessions STILL return SESSION_CLOSED (3.4)_
    - _Requirements: 2.4, 3.3, 3.4_

  - [x] 4.2 Fix `src/app/api/sessions/[id]/quiz/route.ts` — expose `startedAt` in response
    - Add `startedAt: true` to the sessionPin `select` in this route
    - Include `startedAt: sessionPin.startedAt?.toISOString() ?? null` in the response JSON data
    - _Requirements: 2.5_

  - [x] 4.3 Fix `src/app/student/quiz/[sessionId]/page.tsx` — add countdown timer
    - Add `startedAt: string | null` to the `QuizData` type
    - Parse `raw.startedAt` when normalizing quiz data from the API response
    - Compute `sessionDeadlineMs = new Date(startedAt).getTime() + durationSeconds * 1000` when startedAt is not null
    - Add state `timeExpired: boolean` (initial: false)
    - Add `useEffect` that ticks every 1000ms: `remaining = sessionDeadlineMs - Date.now(); if (remaining <= 0) setTimeExpired(true)`
    - Add `timeExpired` to `canSubmit` condition: `canSubmit = ... && !timeExpired`
    - Display countdown timer "Sisa waktu: MM:SS" when `sessionDeadlineMs` is set and time has not expired
    - Display "Waktu Habis" banner when `timeExpired === true`
    - Edge case: if `startedAt` is null (older sessions), skip countdown entirely — no behavior change
    - Edge case: if page loads after deadline, `timeExpired` is `true` immediately from the first tick
    - _Requirements: 2.5_

  - [x] 4.4 Verify Bug #2 exploration test now passes
    - **Property 1: Expected Behavior** - Server-Side Deadline Enforced
    - **IMPORTANT**: Re-run the SAME tests from task 1 (Bug #2 assertions) — do NOT write new tests
    - Submit with mocked `Date.now()` past deadline → must return `409 SESSION_EXPIRED`
    - **EXPECTED OUTCOME**: Tests PASS (confirms Bug #2 is fixed)
    - _Requirements: 2.4_

  - [x] 4.5 Verify preservation tests still pass after Bug #2 fix
    - **Property 2: Preservation** - Active Session Within Deadline Still Accepts Answers
    - **IMPORTANT**: Re-run the SAME preservation tests from task 2 — do NOT write new tests
    - ACTIVE sessions with `Date.now() < deadline` STILL return `201`
    - Manually closed sessions STILL return `SESSION_CLOSED`
    - **EXPECTED OUTCOME**: All preservation tests PASS (no regressions from Bug #2 fix)

- [x] 5. Fix Bug #4 — SSE broadcast per answer (fix before Bug #3 to establish execution order)

  - [x] 5.1 Fix `src/app/api/responses/route.ts` — add fire-and-forget SSE broadcast after `response.create()`
    - Add imports: `import { sseManager } from '@/lib/sse/manager'` and `import { buildHeatmapState } from '@/lib/sse/heatmap-builder'`
    - After `prisma.response.create(...)`, add fire-and-forget broadcast:
      ```
      buildHeatmapState(sessionId, studentSession.schoolId)
        .then((entries) => sseManager.broadcast(sessionId, entries))
        .catch((err) => console.error('[responses] SSE broadcast failed:', err));
      ```
    - This must NOT block the `201` response — do not await
    - _Bug_Condition: isBugCondition_B4 — after response.create(), sseManager.broadcast not called_
    - _Expected_Behavior: buildHeatmapState + sseManager.broadcast called for every saved response_
    - _Preservation: getLastState() still returns last broadcasted state for new SSE clients (3.7); final broadcast after diagnosis still occurs (3.8)_
    - _Requirements: 2.8, 2.9, 3.7, 3.8_

  - [x] 5.2 Verify Bug #4 exploration test now passes
    - **Property 1: Expected Behavior** - SSE Broadcast per Response
    - **IMPORTANT**: Re-run the SAME tests from task 1 (Bug #4 assertions) — do NOT write new tests
    - Spy on `sseManager.broadcast` → submit valid answer → assert called once with current entries
    - **EXPECTED OUTCOME**: Tests PASS (confirms Bug #4 is fixed)
    - _Requirements: 2.8, 2.9_

  - [x] 5.3 Verify preservation tests still pass after Bug #4 fix
    - **Property 2: Preservation** - SSE Last State Still Available for New Clients
    - **IMPORTANT**: Re-run the SAME preservation tests from task 2 — do NOT write new tests
    - `sseManager.getLastState(sessionId)` STILL returns cached entries for new clients after fix
    - Broadcast after diagnosis completion STILL works
    - **EXPECTED OUTCOME**: All preservation tests PASS (no regressions from Bug #4 fix)

- [ ] 6. Fix Bug #3 — Auto-trigger diagnosis on last answer

  - [x] 6.1 Fix `src/app/api/responses/route.ts` — add fire-and-forget completion check + enqueue diagnosis
    - Add import: `import { enqueueRunDiagnosis } from '@/workers/run-diagnosis'`
    - After the SSE broadcast fire-and-forget (task 5.1), add completion check fire-and-forget:
      ```
      prisma.response.count({
        where: { sessionPinId: sessionId, studentId: studentSession.studentId },
      }).then(async (studentResponseCount) => {
        const totalQuestions = await prisma.question.count({ where: { testId: sessionPin.testId } });
        if (studentResponseCount >= totalQuestions) {
          await enqueueRunDiagnosis(sessionId);
        }
      }).catch((err) => console.error('[responses] Diagnosis enqueue failed:', err));
      ```
    - This must NOT block the `201` response — do not await
    - Execution order in route after this task: (1) save to DB → (2) broadcast SSE (fire-and-forget) → (3) check completion + enqueue (fire-and-forget) → (4) return 201
    - _Bug_Condition: isBugCondition_B3 — studentResponseCount === totalQuestions AND enqueueRunDiagnosis not called_
    - _Expected_Behavior: enqueueRunDiagnosis called exactly once when student completes all questions_
    - _Preservation: partial completion (count < total) STILL does not trigger enqueueRunDiagnosis (3.5); on-demand generate via teacher portal STILL works (3.6)_
    - _Requirements: 2.6, 2.7, 3.5, 3.6_

  - [x] 6.2 Verify Bug #3 exploration test now passes
    - **Property 1: Expected Behavior** - Auto-Trigger Diagnosis on Last Answer
    - **IMPORTANT**: Re-run the SAME tests from task 1 (Bug #3 assertions) — do NOT write new tests
    - Mock response.count = totalQuestions → assert `enqueueRunDiagnosis` called once
    - **EXPECTED OUTCOME**: Tests PASS (confirms Bug #3 is fixed)
    - _Requirements: 2.6_

  - [x] 6.3 Verify preservation tests still pass after Bug #3 fix
    - **Property 2: Preservation** - Partial Completion Does Not Trigger Diagnosis
    - **IMPORTANT**: Re-run the SAME preservation tests from task 2 — do NOT write new tests
    - Mock response.count = 1 (of 5 total) → `enqueueRunDiagnosis` MUST NOT be called
    - On-demand diagnosis from teacher portal STILL works independently
    - **EXPECTED OUTCOME**: All preservation tests PASS (no regressions from Bug #3 fix)

- [x] 7. Fix Bug #5 — Complete page redirect and back button

  - [x] 7.1 Convert `src/app/student/quiz/[sessionId]/complete/page.tsx` to Client Component
    - Add `"use client"` directive at the top of the file (first line)
    - Remove `export const metadata` export (not allowed in Client Components)
    - Add imports: `useEffect`, `useState` from `react`; `useRouter` from `next/navigation`
    - Add `const router = useRouter()`
    - Add `const [countdown, setCountdown] = useState(10)`
    - Add `useEffect` for countdown and auto-redirect:
      ```
      useEffect(() => {
        if (countdown <= 0) { router.push('/student/join'); return; }
        const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
        return () => clearTimeout(timer);
      }, [countdown, router]);
      ```
    - Add visible countdown display: `"Kembali otomatis dalam {countdown} detik"`
    - Add explicit back button: `<button onClick={() => router.push('/student/join')}>Kembali ke Halaman Awal</button>`
    - Retain all existing visual content: green checkmark, "Kuis Selesai!" message, "tunggu guru" instruction
    - _Bug_Condition: isBugCondition_B5 — rendered complete page has no back button AND no auto-redirect countdown_
    - _Expected_Behavior: countdown starts at 10, auto-redirects to /student/join; explicit back button present_
    - _Preservation: green checkmark, "Kuis Selesai!", and "tunggu guru" instruction STILL visible after conversion (3.9); pressing back button before countdown ends redirects immediately (3.10)_
    - _Requirements: 2.10, 2.11, 3.9, 3.10_

  - [x] 7.2 Verify Bug #5 exploration test now passes
    - **Property 1: Expected Behavior** - Complete Page Has Redirect and Back Button
    - **IMPORTANT**: Re-run the SAME tests from task 1 (Bug #5 assertions) — do NOT write new tests
    - Render complete page → assert back button with `/student/join` navigation exists
    - Assert countdown starts at 10 and decrements
    - Assert `router.push('/student/join')` called when countdown reaches 0
    - **EXPECTED OUTCOME**: Tests PASS (confirms Bug #5 is fixed)
    - _Requirements: 2.10, 2.11_

  - [x] 7.3 Verify preservation tests still pass after Bug #5 fix
    - **Property 2: Preservation** - Complete Page Visual Content Unchanged
    - **IMPORTANT**: Re-run the SAME preservation tests from task 2 — do NOT write new tests
    - Green checkmark, "Kuis Selesai!", "tunggu guru" instruction STILL present after Client Component conversion
    - **EXPECTED OUTCOME**: All preservation tests PASS (no regressions from Bug #5 fix)

- [x] 8. Fix Bug #6 — State reset in finally block

  - [x] 8.1 Fix `src/app/student/quiz/[sessionId]/page.tsx` — restructure `handleSubmit` finally block
    - Locate the `handleSubmit` `useCallback` function
    - Add or restructure the `try/catch/finally` block so that `setIsSubmitting(false)` is called in `finally`
    - For non-last-question path (uses `setTimeout` for animation): the `animating` state is controlled by `setTimeout`; `isSubmitting` must still be reset in `finally` after the `setTimeout` is scheduled
    - For last-question path (`router.push(...)`): `isSubmitting` MUST be reset in `finally` before/after push
    - For error path: existing `catch` behavior (error message + retry countdown) must remain intact; `isSubmitting` reset in `finally` supersedes any reset in `catch`
    - Ensure `canSubmit` still correctly uses `isSubmitting`, `animating`, `selectedOption`, `criTouched`, `retryCountdown`, and `timeExpired`
    - _Bug_Condition: isBugCondition_B6 — errorOccursAfterApiSuccess AND isSubmitting remains true after handleSubmit resolves_
    - _Expected_Behavior: isSubmitting and animating always reset to false via finally block for all execution paths_
    - _Preservation: API error (non-2xx) STILL shows error message and retry countdown, no soal transition (3.11); submit button STILL disabled when no answer/CRI selected (3.12)_
    - _Requirements: 2.12, 2.13, 3.11, 3.12_

  - [x] 8.2 Verify Bug #6 exploration test now passes
    - **Property 1: Expected Behavior** - Submit State Always Resets
    - **IMPORTANT**: Re-run the SAME tests from task 1 (Bug #6 assertions) — do NOT write new tests
    - Mock `router.push` to throw after successful `fetch` → assert `isSubmitting === false` after `handleSubmit` settles
    - **EXPECTED OUTCOME**: Tests PASS (confirms Bug #6 is fixed)
    - _Requirements: 2.12, 2.13_

  - [x] 8.3 Verify preservation tests still pass after Bug #6 fix
    - **Property 2: Preservation** - Error Path and Disabled Button Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME preservation tests from task 2 — do NOT write new tests
    - API non-2xx response STILL shows error message + retry countdown, no soal transition
    - Submit button STILL disabled when `selectedOption` or `criTouched` not set
    - **EXPECTED OUTCOME**: All preservation tests PASS (no regressions from Bug #6 fix)

- [x] 9. Checkpoint — All tests pass, all 6 bugs fixed

  - Re-run the complete test suite (unit + integration + property-based)
  - Verify all 6 bug condition exploration tests now PASS (bugs are fixed)
  - Verify all preservation tests still PASS (no regressions introduced)
  - Verify execution order in `POST /api/responses`: save to DB → broadcast SSE (fire-and-forget) → check completion + enqueue (fire-and-forget) → return 201
  - Confirm `startedAt` is exposed in `GET /api/sessions/:id/quiz` response
  - Confirm `complete/page.tsx` is a Client Component with countdown + back button
  - Confirm `handleSubmit` always resets `isSubmitting` via `finally`
  - Ensure all tests pass; ask the user if questions arise.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 3.1–3.12_

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2"], "description": "Exploration & Preservation tests — harus selesai sebelum fix apapun" },
    { "wave": "2a", "tasks": ["3"], "description": "PRIORITAS KRITIS — Fix Bug #1 (cross-class auth bypass): celah keamanan, dikerjakan pertama sebelum bug lain" },
    { "wave": "2b", "tasks": ["4"], "description": "Fix Bug #2 (deadline enforcement) — boleh dimulai setelah wave 2a selesai; task 4.1 meng-extend sessionPin select yang sama dengan task 3.3" },
    { "wave": "2c", "tasks": ["5", "6", "7", "8"], "description": "Fix Bug #4, #3, #5, #6 — boleh paralel setelah wave 2a selesai; task 5 dan 6 keduanya edit responses/route.ts (sequential)" },
    { "wave": 3, "tasks": ["9"], "description": "Checkpoint akhir — setelah semua fix dan verify selesai" }
  ]
}
```

### Aturan Urutan Eksplisit

1. **Task 1 → Task 2** selesai sebelum fix apapun dimulai (Wave 1)
2. **Task 3 (Bug #1) dikerjakan pertama** di Wave 2a karena menyangkut celah keamanan — siswa lintas kelas dapat mengakses data sesi kelas lain
3. **Task 4.1 dan Task 3.3 TIDAK boleh paralel** — keduanya meng-extend `sessionPin select` di `responses/route.ts`. Task 4.1 harus menggabungkan kedua extend (classId dari task 3.3 + startedAt + durationSeconds) dalam satu query. Task 4 dimulai setelah task 3 selesai.
4. **Task 5 dan Task 6 SEQUENTIAL** — keduanya menambahkan kode ke `responses/route.ts` setelah `prisma.response.create()`. Task 5 (SSE broadcast) ditambahkan lebih dulu agar execution order yang benar terbentuk: SSE → diagnosis check. Task 6 dimulai setelah task 5 selesai.
5. **Task 7 (Bug #5) dan Task 8 (Bug #6)** independen dan bisa paralel setelah wave 2a selesai — masing-masing hanya menyentuh satu file UI.
6. **Task 9** bergantung pada semua task verify: 3.4, 3.5, 3.6, 4.4, 4.5, 5.2, 5.3, 6.2, 6.3, 7.2, 7.3, 8.2, 8.3

## Notes

- **Tidak ada migrasi Prisma**: semua 6 fix berada di layer aplikasi (TypeScript/Next.js); `schema.prisma` tidak berubah — `classId` dan `startedAt` sudah ada di schema
- **Task 3.3 + 4.1 satu query**: `sessionPin select` di `responses/route.ts` harus digabungkan menjadi `{ id, state, testId, startedAt, test: { classId, durationSeconds } }` — pastikan task 4.1 tidak menimpa perubahan task 3.3
- **Execution order di responses/route.ts setelah semua fix**: save to DB → broadcast SSE (fire-and-forget) → check completion + enqueue diagnosis (fire-and-forget) → return 201
- **Fire-and-forget pattern**: Bug #3 dan #4 menggunakan `.then().catch()` tanpa await — kegagalan di-log tapi tidak memblokir 201 response ke klien
- **Bug #5 konversi Client Component**: hapus `export const metadata` saat menambah `"use client"` — keduanya tidak bisa coexist
- **Kode unfixed saat task 1**: jangan modifikasi kode apapun saat menjalankan exploration tests — tujuannya hanya mendapatkan counterexample dan membuktikan bug ada
- **startedAt null-safety**: jika `startedAt` null (sesi lama sebelum fix), skip countdown di klien dan skip deadline check di server — tidak ada perubahan perilaku untuk sesi lama
