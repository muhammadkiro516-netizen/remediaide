# Implementation Plan — Exit Ticket Feature

## Overview

Implements the Exit Ticket feature end-to-end: Prisma schema additions, a token utility library, a category theme mapping, two public API endpoints, a public Next.js page (Server + Client components), a fix to the existing LKPD PDF route (bug: wrong env var + wrong path), an auth-config update to whitelist the new routes, and a summary badge integrated into the teacher Results page.

The implementation is sequenced so that each layer depends only on previously completed work: schema first, then utilities, then server infrastructure, then UI, then integration.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2", "5"] },
    { "wave": 3, "tasks": ["3", "6", "8"] },
    { "wave": 4, "tasks": ["4", "7", "9"] },
    { "wave": 5, "tasks": ["10", "11"] },
    { "wave": 6, "tasks": ["12"] },
    { "wave": 7, "tasks": ["13"] }
  ]
}
```


## Tasks

- [x] 1. Update Prisma schema with ExitTicketToken and ExitTicketSubmission models
- [x] 2. Create exit-ticket token utility library (`src/lib/exit-ticket/token.ts`)
- [x] 3. Create exit-ticket category theme mapping (`src/lib/exit-ticket/theme.ts`)
- [x] 4. Write property-based tests for token and theme utilities (Properties 1–8)
- [x] 5. Add `/exit-ticket` and `/api/exit-ticket` to public routes in `auth.config.ts`
- [x] 6. Fix LKPD route: generate token, use `AUTH_URL`, embed correct QR path
- [x] 7. Create GET `/api/exit-ticket/[token]` endpoint (validate token, return public data)
- [x] 8. Create in-memory rate-limit helper (`src/lib/exit-ticket/rate-limit.ts`)
- [x] 9. Create POST `/api/exit-ticket/[token]/submit` endpoint (save submission, mark USED)
- [x] 10. Write property-based tests for API endpoints (Properties 9–11)
- [x] 11. Build Exit Ticket page components (Server Component + Client Form + Confirmation + Error)
- [x] 12. Integrate ExitTicketSummaryBadge into the teacher Results page
- [x] 13. Write unit tests for UI components and integration flows


### 1. Update Prisma schema with ExitTicketToken and ExitTicketSubmission models

**Requirement refs:** Requirements 8.1–8.5

Add new enum and two new models to `prisma/schema.prisma`, plus back-relation fields on existing `SessionPin`, `RemedialGroup`, and `School` models. Then generate and apply the migration.

#### Sub-tasks

- [x] 1.1 Add `ExitTicketStatus` enum (`UNUSED` | `USED`) to `prisma/schema.prisma`
- [x] 1.2 Add `ExitTicketToken` model with fields: `id`, `token` (unique), `sessionPinId`, `remedialGroupId` (nullable), `schoolId`, `status`, `createdAt`, `usedAt` (nullable); indexes `@@unique([token])` and `@@index([sessionPinId])`; relations to `SessionPin`, `RemedialGroup?`, `School`, `ExitTicketSubmission?`
- [x] 1.3 Add `ExitTicketSubmission` model with fields: `id`, `exitTicketTokenId` (unique), `reflectionText` (`@db.VarChar(1000)`), `confidenceScore`, `submittedAt`, `schoolId`; relations to `ExitTicketToken` and `School`
- [x] 1.4 Add back-relation `exitTicketTokens ExitTicketToken[]` to `SessionPin`, `RemedialGroup`, and `School` models
- [x] 1.5 Add back-relation `exitTicketSubmissions ExitTicketSubmission[]` to `School` model
- [x] 1.6 Run `prisma migrate dev --name add_exit_ticket_models` to create and apply the migration
- [x] 1.7 Run `prisma generate` to regenerate the Prisma client

**Acceptance check:** `prisma migrate status` shows no pending migrations; Prisma client includes `exitTicketToken` and `exitTicketSubmission` accessors.


### 2. Create exit-ticket token utility library

**Requirement refs:** Requirements 1.1–1.5, 2.1–2.5, 4.3, 6.1

Create `src/lib/exit-ticket/token.ts` with pure/async functions for token generation, URL construction, format validation, and expiry checking.

#### Sub-tasks

- [x] 2.1 Implement `generateToken(): string` — calls `crypto.randomBytes(32).toString('hex')`, returns 64-char hex string
- [x] 2.2 Implement `generateAndSaveToken(params: { sessionPinId, remedialGroupId, schoolId }): Promise<string>` — calls `generateToken()`, saves to DB via `prisma.exitTicketToken.create`, throws on DB failure
- [x] 2.3 Implement `buildQrUrl(token: string, baseUrl?: string): string` — strips trailing slashes, concatenates `/exit-ticket/{token}`, validates result starts with `http://` or `https://`, throws on invalid; logs `console.warn` and falls back to `https://remediaide.app` when `baseUrl` is empty/undefined
- [x] 2.4 Implement `isValidTokenFormat(token: string): boolean` — returns true iff token matches `/^[a-zA-Z0-9-]{8,128}$/`
- [x] 2.5 Implement `isTokenExpired(createdAt: Date): boolean` — returns true if `Date.now() - createdAt.getTime() > 30 * 24 * 60 * 60 * 1000`
- [x] 2.6 Export all five functions; ensure no Prisma import appears in the three pure functions (`generateToken`, `buildQrUrl`, `isValidTokenFormat`, `isTokenExpired`)

**Acceptance check:** TypeScript compiles without errors; all exports are correctly typed.


### 3. Create exit-ticket category theme mapping

**Requirement refs:** Requirements 3.2, 3.4, 3.5

Create `src/lib/exit-ticket/theme.ts` with `CognitiveGroupType`, `CategoryTheme`, `CATEGORY_THEMES`, and `CONFIDENCE_LABELS`.

#### Sub-tasks

- [x] 3.1 Define and export type `CognitiveGroupType` as union of the five status strings (matching `FinalStatus` enum values used in `ResultsClient`)
- [x] 3.2 Define and export interface `CategoryTheme` with fields: `bgClass`, `headingClass`, `buttonClass`, `label`, `reflectionQuestion`
- [x] 3.3 Implement and export `CATEGORY_THEMES: Record<CognitiveGroupType, CategoryTheme>` with exact Tailwind classes and Indonesian reflection questions as specified in the design (colors consistent with `GROUP_COLORS` in `lkpd-generator.ts`)
- [x] 3.4 Implement and export `CONFIDENCE_LABELS: Record<number, string>` for values 0–5 with Indonesian labels matching the CRI scale: 0 = "Menebak Sepenuhnya", 1 = "Sangat Tidak Yakin", 2 = "Tidak Yakin", 3 = "Yakin", 4 = "Sangat Yakin", 5 = "Mutlak Yakin"
- [x] 3.5 Define and export helper `getCategoryTheme(category: CognitiveGroupType): CategoryTheme` as a safe accessor that falls back to `INSUFFICIENT_DATA` theme if the key is not found
- [x] 3.6 Export `isValidReflectionText(text: string): boolean` — returns true iff `text.trim().length >= 1`

**Acceptance check:** TypeScript compiles; all 5 categories and 6 confidence levels are defined and correctly typed.


### 4. Write property-based tests for token and theme utilities (Properties 1–8)

**Requirement refs:** Design Properties 1–8

Create `src/lib/exit-ticket/token.test.ts` and `src/lib/exit-ticket/theme.test.ts` using **Vitest** + **fast-check** (≥100 iterations per property).

#### Sub-tasks

- [x] 4.1 **PBT** — Property 1: Token uniqueness — generate 100 tokens in a loop and assert all values in the resulting array are distinct (no duplicates in the set).
  **Validates: Requirements 1.2, 6.1**

- [x] 4.2 **PBT** — Property 2: Token format — for any call to `generateToken()`, assert result is exactly 64 characters and matches `/^[0-9a-f]{64}$/`.
  **Validates: Requirements 1.1, 6.1**

- [x] 4.3 **PBT** — Property 3: `buildQrUrl` path correctness — for `fc.stringMatching(/^[a-zA-Z0-9-]{8,64}$/)` as token and `fc.constantFrom('https://a.com', 'http://b.io')` as base, assert result contains `/exit-ticket/${token}` and starts with `http://` or `https://`.
  **Validates: Requirements 1.4, 2.2, 2.4**

- [x] 4.4 **PBT** — Property 4: `buildQrUrl` trailing slash normalization — for any base URL with 1–5 trailing slashes appended via `fc.nat({max:4})`, assert result never contains `//` after the `://` protocol prefix.
  **Validates: Requirements 2.3**

- [x] 4.5 **PBT** — Property 5: `isValidTokenFormat` rejects invalid tokens — for strings with `fc.string({ minLength: 0, maxLength: 7 })` (too short), `fc.string({ minLength: 129 })` (too long), and strings containing non-`[a-zA-Z0-9-]` characters, assert `isValidTokenFormat` returns `false`.
  **Validates: Requirements 4.3**

- [x] 4.6 **PBT** — Property 6: `CATEGORY_THEMES` completeness — for every value in the `CognitiveGroupType` union (5 values), assert `CATEGORY_THEMES[v].reflectionQuestion` is a non-empty string and `CATEGORY_THEMES[v].bgClass` is a non-empty string.
  **Validates: Requirements 3.1, 3.2, 3.5**

- [x] 4.7 **PBT** — Property 7: `CONFIDENCE_LABELS` completeness — for every integer n in [0, 5] via `fc.integer({min:0, max:5})`, assert `CONFIDENCE_LABELS[n]` is a defined non-empty string.
  **Validates: Requirements 3.4**

- [x] 4.8 **PBT** — Property 8: `isValidReflectionText` rejects whitespace-only strings — for `fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r'), {minLength:1, maxLength:1000})`, assert `isValidReflectionText(s)` returns `false`.
  **Validates: Requirements 5.3**

- [x] 4.9 Run `vitest run src/lib/exit-ticket` and verify all property tests pass

**Acceptance check:** All 8 properties pass; no fast-check shrinking reveals a counterexample.


### 5. Add `/exit-ticket` and `/api/exit-ticket` to public routes in `auth.config.ts`

**Requirement refs:** Requirements 3.7, 4 (general access control)

The middleware must not block unauthenticated requests to the Exit Ticket page or its API endpoints.

#### Sub-tasks

- [x] 5.1 Open `src/auth.config.ts` and add two entries to the `PUBLIC_ROUTES` array:
  - `/^\/exit-ticket(\/.*)?$/` — covers the Next.js page route at any token value
  - `/^\/api\/exit-ticket\/.*/` — covers the GET validate and POST submit endpoints
- [x] 5.2 Write a unit test asserting `isPublic('/exit-ticket/sometoken')` returns `true`, `isPublic('/api/exit-ticket/sometoken/submit')` returns `true`, and `isPublic('/dashboard/sessions/123/results')` still returns `false`

**Acceptance check:** TypeScript compiles; unit test passes; no existing route protection is broken.


### 6. Fix LKPD route: generate token, use `AUTH_URL`, embed correct QR path

**Requirement refs:** Requirements 1.1–1.7, 2.1–2.5

Modify `src/app/api/sessions/[id]/lkpd/route.ts` to replace the buggy QR URL construction with the new token-generation and URL-building logic.

#### Sub-tasks

- [x] 6.1 Import `generateAndSaveToken` and `buildQrUrl` from `@/lib/exit-ticket/token` at the top of the file
- [x] 6.2 Remove the two buggy lines:
  ```
  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://remediaide.app';
  const qrUrl = `${baseUrl}/student/join`;
  ```
- [x] 6.3 After the `group` query succeeds, insert token generation before the PDF call:
  - Call `generateAndSaveToken({ sessionPinId: sessionId, remedialGroupId: body.groupId, schoolId: session.schoolId })`
  - Read `process.env.AUTH_URL`; if falsy, log `console.warn('[lkpd] AUTH_URL not set, using fallback')`
  - Call `buildQrUrl(exitToken, rawBaseUrl)` to get `qrUrl`
- [x] 6.4 Wrap `generateAndSaveToken` in a try/catch — if it throws, return HTTP 500 with `{ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal membuat token exit ticket.' } }`
- [x] 6.5 Confirm `generateLKPDPdf` already accepts `qrUrl` as a parameter (no changes needed to `lkpd-generator.ts`)

**Acceptance check:** TypeScript compiles; grep confirms no reference to `NEXTAUTH_URL` or `/student/join` remains in the file.


### 7. Create GET `/api/exit-ticket/[token]` endpoint

**Requirement refs:** Requirements 3.1, 3.6, 3.8, 4.1–4.5, 6.2–6.4

Create `src/app/api/exit-ticket/[token]/route.ts`. This public endpoint validates the token, enforces rate limiting, and returns only the minimal public data needed to render the form.

#### Sub-tasks

- [x] 7.1 Create `src/app/api/exit-ticket/[token]/route.ts` with a named `GET` export; extract `token` from `params`
- [x] 7.2 Validate format with `isValidTokenFormat(token)` — return 404 (no body) if invalid to avoid oracle leakage
- [x] 7.3 Apply `checkRateLimit(ip)` (from Task 8) — return 429 `{ "error": "RATE_LIMIT_EXCEEDED" }` if denied
- [x] 7.4 Query `prisma.exitTicketToken.findUnique({ where: { token } })` with joins to `session.test` (select `topic`) and `remedialGroup` (select `cognitiveStatus`)
- [x] 7.5 If not found → return 404 `{ "error": "TOKEN_NOT_FOUND" }`
- [x] 7.6 If `isTokenExpired(record.createdAt)` → return 404 `{ "error": "TOKEN_NOT_FOUND" }` (same code, no distinction)
- [x] 7.7 If `status === 'USED'` → return 200 `{ "status": "USED" }`
- [x] 7.8 If `status === 'UNUSED'` → return 200 `{ "status": "UNUSED", "topicName": record.session.test.topic, "cognitiveCategory": record.remedialGroup.cognitiveStatus }` — no IDs, no sensitive fields
- [x] 7.9 Wrap entire handler in try/catch → return 500 `{ "error": "INTERNAL_ERROR" }` on unexpected error

**Acceptance check:** TypeScript compiles; response shape contains no `id`, `sessionPinId`, `schoolId`, or `remedialGroupId`.


### 8. Create in-memory rate-limit helper

**Requirement refs:** Requirements 6.3

Create `src/lib/exit-ticket/rate-limit.ts` with a simple in-memory sliding-window rate limiter (20 req/min/IP), shared by both API endpoints.

#### Sub-tasks

- [x] 8.1 Define module constants `WINDOW_MS = 60_000` and `MAX_REQUESTS = 20`
- [x] 8.2 Create module-level `Map<string, { count: number; resetAt: number }>` as the in-memory store
- [x] 8.3 Export `checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number }` — resets entry if window expired, increments count, denies if `count >= MAX_REQUESTS` with `retryAfter` in seconds
- [x] 8.4 Export `clearRateLimitStore(): void` for test isolation (resets the Map to empty)

**Acceptance check:** Unit test verifies first 20 calls are allowed; 21st call returns `{ allowed: false, retryAfter: <positive number> }`; after calling `clearRateLimitStore()`, count resets.


### 9. Create POST `/api/exit-ticket/[token]/submit` endpoint

**Requirement refs:** Requirements 5.5–5.11, 6.2–6.4

Create `src/app/api/exit-ticket/[token]/submit/route.ts`. This public endpoint validates all inputs and uses a Prisma transaction to atomically save the submission and mark the token as USED.

#### Sub-tasks

- [x] 9.1 Create the file with a named `POST` export; extract `token` from `params`
- [x] 9.2 Validate format with `isValidTokenFormat(token)` — return 404 if invalid
- [x] 9.3 Apply `checkRateLimit(ip)` — return 429 if denied
- [x] 9.4 Parse and validate request body:
  - `reflectionText.trim().length` must be ≥1 and ≤1000 → 422 `{ "error": "VALIDATION_ERROR", "field": "reflectionText" }`
  - `confidenceScore` must be an integer in [0, 5] (use `Number.isInteger` + range check) → 422 `{ "error": "VALIDATION_ERROR", "field": "confidenceScore" }`
- [x] 9.5 Execute `prisma.$transaction` containing three sequential operations:
  1. `findUnique({ where: { token } })` — if null or status `USED`, abort with a custom `AlreadyUsedError`
  2. `exitTicketSubmission.create(...)` with `reflectionText: body.reflectionText.trim()`, `confidenceScore`, `exitTicketTokenId: record.id`, `schoolId: record.schoolId`
  3. `exitTicketToken.update({ where: { id: record.id }, data: { status: 'USED', usedAt: new Date() } })`
- [x] 9.6 Catch `AlreadyUsedError` → return 409 `{ "error": "TOKEN_ALREADY_USED" }`
- [x] 9.7 On transaction success → return 200 `{ "success": true }`
- [x] 9.8 Wrap outer handler in try/catch → return 500 `{ "error": "INTERNAL_ERROR" }` on unexpected error
- [x] 9.9 Confirm response body never includes any internal IDs, `schoolId`, `anonymousLabel`, or student data

**Acceptance check:** TypeScript compiles; a second POST with the same token returns 409.


### 10. Write property-based tests for API endpoints (Properties 9–11)

**Requirement refs:** Design Properties 9–11

Create tests in `src/app/api/exit-ticket/__tests__/api.test.ts` using Vitest + fast-check. Test business logic of validation and state transitions — not live HTTP (integration/E2E handles that separately).

#### Sub-tasks

- [x] 10.1 **PBT** — Property 9: Submit round-trip state transition — for `fc.string({ minLength: 1, maxLength: 1000 }).filter(s => s.trim().length > 0)` as `reflectionText` and `fc.integer({ min: 0, max: 5 })` as `confidenceScore`, simulate a successful submit and assert the token status changes from `UNUSED` to `USED` and `usedAt` is set.
  **Validates: Requirements 5.5, 5.6**

- [x] 10.2 **PBT** — Property 10: USED token always returns 409 — for any `reflectionText` and `confidenceScore` pair, when the token record has `status: 'USED'`, the submit handler must return a response object with status 409 and body containing `TOKEN_ALREADY_USED`.
  **Validates: Requirements 5.9**

- [x] 10.3 **PBT** — Property 11: GET response never exposes sensitive fields — for any valid UNUSED token scenario, assert the constructed response object does not include the keys: `id`, `sessionPinId`, `schoolId`, `remedialGroupId`, `studentId`, or any key matching `/label|anonymous/i`.
  **Validates: Requirements 4.4, 6.4**

- [x] 10.4 Run `vitest run src/app/api/exit-ticket` and verify all 3 properties pass

**Acceptance check:** All 3 properties pass with ≥100 iterations; no shrinking finds a counterexample.


### 11. Build Exit Ticket page components

**Requirement refs:** Requirements 3.1–3.8, 4.1–4.5, 5.1–5.11, 9.1–9.5

Create four files under `src/app/exit-ticket/[token]/`:

| File | Type | Purpose |
|------|------|---------|
| `page.tsx` | Server Component | Validate token, fetch data server-side, route to sub-component |
| `ExitTicketForm.tsx` | `'use client'` | Interactive form with textarea, confidence scale, submit |
| `ConfirmationPage.tsx` | `'use client'` | Post-submit or already-submitted confirmation |
| `ErrorPage.tsx` | Pure component | NOT_FOUND and DATA_NOT_FOUND error states |

#### Sub-tasks

- [x] 11.1 Create `src/app/exit-ticket/[token]/page.tsx`:
  - Import `notFound` from `next/navigation`; call `notFound()` if `isValidTokenFormat(token)` is false
  - Query Prisma directly (server-side — no client API call) selecting only `status`, `session.test.topic`, `remedialGroup.cognitiveStatus`
  - If not found or `isTokenExpired` → `<ErrorPage type="NOT_FOUND" />`
  - If `status === 'USED'` → `<ConfirmationPage alreadySubmitted />`
  - If `status === 'UNUSED'` but no `cognitiveCategory` → `<ErrorPage type="DATA_NOT_FOUND" />`
  - Otherwise → `<ExitTicketForm token={token} topicName={...} cognitiveCategory={...} />`

- [x] 11.2 Create `src/app/exit-ticket/[token]/ErrorPage.tsx`:
  - Props: `type: 'NOT_FOUND' | 'DATA_NOT_FOUND'`
  - `NOT_FOUND` → "Link ini tidak valid atau sudah tidak berlaku."
  - `DATA_NOT_FOUND` → "Data refleksi tidak ditemukan. Hubungi gurumu."
  - Centered, no form elements, Tailwind-styled

- [x] 11.3 Create `src/app/exit-ticket/[token]/ConfirmationPage.tsx`:
  - Props: `alreadySubmitted?: boolean`
  - `alreadySubmitted=true` → "Refleksimu sudah tercatat sebelumnya. Terima kasih!"
  - `alreadySubmitted=false` (default) → "Terima kasih, refleksimu sudah tersimpan!"
  - No form; checkmark/success visual; centered layout

- [x] 11.4 Create `src/app/exit-ticket/[token]/ExitTicketForm.tsx`:
  - Props: `token: string`, `topicName: string`, `cognitiveCategory: CognitiveGroupType`
  - Use `CATEGORY_THEMES[cognitiveCategory]` for `bgClass`, `buttonClass`, `reflectionQuestion`
  - Include `<noscript>` fallback message (Req 9.5)
  - State: `reflectionText`, `confidenceScore: number | null`, `isSubmitting`, `submitError`, `isSuccess`, `validationErrors`
  - Textarea: `maxLength={1000}`, class `text-base` (16 px, prevents iOS zoom), `min-h-[120px]`, `resize-none`
  - Confidence scale: 6 buttons (0–5) each `min-h-[44px]`, labeled via `CONFIDENCE_LABELS`
  - Client-side validation: whitespace-only text → "Jawaban tidak boleh kosong"; no confidence → "Pilih dulu tingkat keyakinanmu"; never sends request if validation fails
  - On valid submit: disable button + loading indicator → `POST /api/exit-ticket/${token}/submit`
  - On 200 → set `isSuccess = true` and render `<ConfirmationPage />`
  - On 409 → render `<ConfirmationPage alreadySubmitted />`
  - On any other error → show "Terjadi kesalahan, coba lagi." and re-enable button
  - All interactive elements have `min-h-[44px]` (WCAG 2.1 AA touch target, Req 9.3)
  - Layout uses `max-w-md mx-auto px-4` — no horizontal scroll at 320 px viewport (Req 9.1)
  - Topic displayed as heading text

- [x] 11.5 Run `npx tsc --noEmit` (or `vitest typecheck`) across all four files and confirm zero TypeScript errors

**Acceptance check:** Rendering with a valid UNUSED token shows the correct question and colors; submit flow transitions to confirmation; invalid format token returns Next.js 404.


### 12. Integrate ExitTicketSummaryBadge into the teacher Results page

**Requirement refs:** Requirements 7.1–7.5

Add a small badge to each group card in `ResultsClient` showing how many tokens have been submitted. All data is loaded server-side — no new client fetch.

#### Sub-tasks

- [x] 12.1 Create `src/components/teacher/ExitTicketSummaryBadge.tsx`:
  - Props: `submittedCount: number`, `totalTokens: number`
  - If `totalTokens === 0` → return `null` (no tokens generated yet, Req 7.5 edge case)
  - If `submittedCount === 0` → render `<p className="text-xs text-gray-400 mt-2">Belum ada yang submit Exit Ticket</p>`
  - Otherwise → render `<p className="text-xs text-gray-600 mt-2"><span className="font-semibold text-green-700">{submittedCount}</span>{' '}dari {totalTokens} kelompok sudah submit Exit Ticket</p>`

- [x] 12.2 Modify `src/app/dashboard/sessions/[id]/results/page.tsx`:
  - Update the `groups` Prisma query to `include: { exitTicketTokens: { select: { status: true } } }`
  - Derive `exitTicketTokenCount` = `exitTicketTokens.length` and `exitTicketSubmissionCount` = count of tokens with `status === 'USED'`
  - Pass these two counts as new fields in the `initialGroups` array passed to `ResultsClient`

- [x] 12.3 Modify `src/app/dashboard/sessions/[id]/results/ResultsClient.tsx`:
  - Add optional fields `exitTicketSubmissionCount?: number` and `exitTicketTokenCount?: number` to `RemedialGroupData` interface
  - Import `ExitTicketSummaryBadge` from `@/components/teacher/ExitTicketSummaryBadge`
  - Inside the group card's content `div` (after member labels), add `<ExitTicketSummaryBadge submittedCount={g.exitTicketSubmissionCount ?? 0} totalTokens={g.exitTicketTokenCount ?? 0} />`
  - Do not add any new `fetch` or `useEffect` calls (Req 7.3)

- [x] 12.4 Confirm that when `groups` is empty (no diagnosis run yet), the badge is simply not rendered since no group cards are shown (Req 7.5)

**Acceptance check:** TypeScript compiles; results page loads without errors; group cards display the correct Exit Ticket count.


### 13. Write unit tests for UI components and integration flows

**Requirement refs:** Requirements 3.3, 5.1–5.4, 5.8, 5.11, 9.1–9.3

Create unit tests using Vitest + `@testing-library/react`. Focus on real validation logic — no mocked return values that bypass actual behavior.

#### Sub-tasks

- [x] 13.1 Create `src/app/exit-ticket/[token]/ExitTicketForm.test.tsx`:
  - Test: renders the reflection question text matching the given `cognitiveCategory`
  - Test: submit with empty textarea shows "Jawaban tidak boleh kosong" and does not call `fetch`
  - Test: submit without selecting confidence shows "Pilih dulu tingkat keyakinanmu" and does not call `fetch`
  - Test: submit button is disabled and shows loading text while request is in-flight (mock `fetch` to delay)
  - Test: on 200 response, confirmation message "Terima kasih, refleksimu sudah tersimpan!" appears
  - Test: on 409 response, "Refleksimu sudah tercatat sebelumnya." message appears
  - Test: on 500 response, "Terjadi kesalahan, coba lagi." appears and submit button is re-enabled
  - Test: textarea has `maxLength` attribute set to `1000`
  - Test: confidence scale renders exactly 6 buttons with labels from `CONFIDENCE_LABELS`

- [x] 13.2 Create `src/components/teacher/ExitTicketSummaryBadge.test.tsx`:
  - Test: returns null (renders nothing) when `totalTokens === 0`
  - Test: shows "Belum ada yang submit Exit Ticket" when `submittedCount === 0` and `totalTokens > 0`
  - Test: shows correct numeric count in output when `submittedCount > 0`

- [x] 13.3 Create `src/lib/exit-ticket/rate-limit.test.ts`:
  - Test: first 20 calls within a window are all allowed
  - Test: 21st call within same window returns `{ allowed: false }` with a `retryAfter` property
  - Test: after calling `clearRateLimitStore()` the count resets and the next call is allowed

- [x] 13.4 Run `vitest run` across all new test files and confirm all pass

**Acceptance check:** All unit tests pass; `vitest run` exits with code 0.


## Notes

- **Task order matters:** Tasks 1–3 (schema + pure utilities) have no external dependencies and can be done first. Tasks 5–9 depend on the utilities from Task 2. Tasks 11–12 depend on Task 3 (theme) and Task 9 (API). Tests in Tasks 4, 10, 13 should be run after their respective implementation tasks.
- **No changes to `lkpd-generator.ts`:** The PDF generator already accepts `qrUrl` as a parameter. Only the route handler (`route.ts`) needs updating in Task 6.
- **Rate limiting scope:** The in-memory rate limiter in Task 8 is per-process. For horizontal scaling, replace the `Map` with a Redis-backed implementation (ioredis is already a dependency). This is noted in the design as a known tradeoff for pilot scale.
- **Token format note:** Tokens generated by `crypto.randomBytes(32).toString('hex')` are 64-char lowercase hex strings. The validation regex `/^[a-zA-Z0-9-]{8,128}$/` deliberately accepts a wider set (including uppercase and hyphens) to be forward-compatible with potential alternative generation schemes.
- **Prisma transaction atomicity (Task 9):** Using `prisma.$transaction` ensures no submission is saved without the token being marked USED, and no token is marked USED without a matching submission. This prevents duplicate submissions even under concurrent requests.
- **No E2E tasks included here:** Mobile viewport and Playwright E2E tests (Requirements 9.x) are considered out of scope for this implementation plan's automated tasks but should be added manually after deployment to a staging environment.
- **Property test IDs for PBT tasks:** Tasks 4.1–4.8 and 10.1–10.3 are PBT tasks and must be tracked with `update_pbt_status` after execution.
