# Implementation Plan: Custom Session Duration

## Overview

Implementasi dilakukan dalam urutan sekuensial ketat sesuai prioritas:

1. **Bug fix produksi terlebih dahulu** — perbaiki hardcode `900_000` di `activate/route.ts` yang menyebabkan semua sesi (termasuk yang sudah ada di DB) auto-close pada 15 menit terlepas dari `durationSeconds`-nya.
2. **Validasi server-side** — tambahkan guard validasi `durationSeconds` di `POST /api/tests`.
3. **UI `CreateTestDialog`** — tambahkan preset 2 & 3 menit (⚡ Demo) dan opsi Custom dengan input & validasi.
4. **Property-based tests** — tulis 9 PBT dengan fast-check mencakup semua Correctness Properties di design.
5. **Build verification** — pastikan `npm run build` sukses tanpa error.

Setiap task harus selesai dan tesnya hijau sebelum melanjutkan ke task berikutnya.

---

## Tasks

- [x] 1. Fix bug auto-close hardcode di `activate/route.ts`
  - Ubah query `prisma.sessionPin.findFirst` agar menyertakan `test: { select: { durationSeconds: true } }` dalam `select`
  - Tambahkan guard fallback: `const rawDuration = sessionPin.test?.durationSeconds ?? 0; const safeDuration = rawDuration > 0 ? rawDuration : 900; const durationMs = safeDuration * 1000;`
  - Ganti baris hardcode `await enqueueAutoClose(id, 900_000)` dengan `await enqueueAutoClose(id, durationMs)`
  - _Requirements: 4.1, 4.2, 4.4, 4.6_

  - [x] 1.1 Tulis unit tests untuk fix activate route
    - Verifikasi bahwa sesi dengan `durationSeconds = 1800` (30 menit, **legacy session**) menjadwalkan delay `1800000` ms — ini adalah kasus legacy utama yang memastikan sesi lama di DB tidak ter-affect bug
    - Verifikasi bahwa sesi dengan `durationSeconds = 120` (2 menit) menjadwalkan delay `120000` ms
    - Verifikasi bahwa sesi dengan `durationSeconds = 0` atau `null` (fallback) menjadwalkan delay `900000` ms
    - Verifikasi bahwa sesi dengan `durationSeconds = 2700` (45 menit), `1800` (30 menit), dan `3600` (60 menit) masing-masing menghasilkan delay yang tepat — memvalidasi skenario re-aktivasi legacy
    - File: `src/__tests__/custom-session-duration/activate-route.test.ts`
    - _Requirements: 4.1, 4.2, 4.4, 4.6, 5.4_

- [x] 2. Tambahkan validasi server-side `durationSeconds` di `POST /api/tests`
  - Tambahkan blok validasi setelah destructure body, sebelum query DB: cek `typeof dur !== "number" || !Number.isInteger(dur) || dur < 60 || dur > 10800`
  - Return HTTP 422 dengan `code: "VALIDATION_ERROR"` jika validasi gagal
  - Jika `durationSeconds` tidak disertakan dalam body, gunakan default `900`
  - Pastikan nilai valid (integer 60–10800) diteruskan ke Prisma `test.create` tanpa modifikasi
  - File yang dimodifikasi: `src/app/api/tests/route.ts`
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 2.1 Tulis unit tests untuk validasi POST /api/tests
    - Test `durationSeconds` missing → default 900 disimpan (`durationSeconds = 900`)
    - Test `durationSeconds = 59` → HTTP 422, `VALIDATION_ERROR`
    - Test `durationSeconds = 10801` → HTTP 422, `VALIDATION_ERROR`
    - Test `durationSeconds = 90.5` → HTTP 422, `VALIDATION_ERROR`
    - Test `durationSeconds = "abc"` dan `null` → HTTP 422, `VALIDATION_ERROR`
    - Test `durationSeconds = 600` (valid) → HTTP 201, nilai disimpan persis 600
    - File: `src/__tests__/custom-session-duration/api-tests-route.test.ts`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Checkpoint — Pastikan semua tes untuk task 1–2 hijau
  - Jalankan `npm test -- --reporter=verbose` dan pastikan semua tes di file `activate-route.test.ts` dan `api-tests-route.test.ts` pass
  - Tanya user jika ada pertanyaan sebelum lanjut ke UI

- [x] 4. Update `CreateTestDialog` — tambah preset 2 & 3 menit dan opsi Custom
  - File yang dimodifikasi: `src/app/dashboard/tests/page.tsx`

  - [x] 4.1 Tambahkan state dan helper untuk Custom mode
    - Tambahkan state: `const [isCustom, setIsCustom] = useState(false)` dan `const [customMinutes, setCustomMinutes] = useState("")`
    - Implementasikan fungsi `parseCustomMinutes(raw: string)` sesuai spesifikasi design (handle empty, NaN, round, batas 1–180)
    - Implementasikan handler `handleSelectPreset(value: number)`, `handleSelectCustom()`, `handleCustomChange(raw: string)`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.7, 2.8, 2.9, 2.10_

  - [x] 4.2 Update array `durationOptions` dan render grid preset
    - Ubah `durationOptions` menjadi array 8 item dengan `isDemo: true` untuk 2 dan 3 menit: `[{label:"2 menit",value:120,isDemo:true},{label:"3 menit",value:180,isDemo:true},{label:"10 menit",value:600},…,{label:"60 menit",value:3600}]`
    - Render tombol preset dengan badge "⚡ Demo" untuk item `isDemo === true` — badge harus visually distinct (misalnya warna amber/yellow atau inline text "⚡ Demo")
    - Pastikan grid menampilkan semua 8 preset dalam urutan naik: 2, 3, 10, 15, 20, 30, 45, 60
    - Tombol aktif ketika `!isCustom && duration === d.value`; tombol Custom aktif ketika `isCustom`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 5.1, 5.2_

  - [x] 4.3 Render tombol Custom dan `Custom_Input` kondisional
    - Tambahkan tombol "Custom" sebagai item terakhir di grid (setelah 60 menit)
    - Ketika `isCustom` aktif, tampilkan `<input type="number" min="1" max="180" placeholder="1–180 menit" />` di bawah grid
    - Tampilkan pesan validasi inline jika `parseCustomMinutes(customMinutes).error !== null`
    - Update kondisi `disabled` pada tombol submit: `loading || !classId || !topic || (isCustom && !parseCustomMinutes(customMinutes).valid)`
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 2.8, 2.9_

  - [x]* 4.4 Tulis unit tests untuk CreateTestDialog
    - Render dialog: verifikasi semua 8 preset lama+baru hadir, dalam urutan 2, 3, 10, 15, 20, 30, 45, 60
    - Tombol 2 menit dan 3 menit menampilkan label "⚡ Demo"
    - Tombol "Custom" hadir sebagai pilihan setelah 60 menit
    - Initial state: tombol 15 menit aktif (`duration = 900`), `isCustom = false`
    - Pilih preset 2 menit → hanya tombol 2 menit aktif, `duration = 120`
    - Pilih Custom → `Custom_Input` muncul, tombol Custom aktif
    - Input valid (mis. "45") → `duration = 2700`, submit enabled
    - Input < 1 → pesan "Minimal 1 menit", submit disabled
    - Input > 180 → pesan "Maksimal 180 menit (3 jam)", submit disabled
    - Beralih dari Custom ke preset → `Custom_Input` tersembunyi
    - File: `src/__tests__/custom-session-duration/create-test-dialog.test.tsx`
    - _Requirements: 1.1–1.8, 2.1–2.10, 5.1–5.3_

- [x] 5. Checkpoint — Pastikan semua tes UI hijau
  - Jalankan `npm test -- --reporter=verbose` dan pastikan file `create-test-dialog.test.tsx` pass
  - Tanya user jika ada pertanyaan

- [x] 6. Tulis Property-Based Tests (fast-check)
  - Buat test file structure di `src/__tests__/custom-session-duration/`
  - Konfigurasikan setiap `fc.assert` dengan `{ numRuns: 100 }` minimal

  - [x]* 6.1 Property 1 — Single Active Selection
    - **Property 1: Single Active Selection**
    - **Validates: Requirements 1.3, 1.4, 2.3, 5.2**
    - Gunakan `fc.constantFrom(...allOptions)` — termasuk semua preset dan Custom
    - Setelah klik opsi manapun, tepat satu tombol harus memiliki class "aktif"; semua lainnya tidak aktif
    - File: `src/__tests__/custom-session-duration/create-test-dialog.test.tsx`

  - [x]* 6.2 Property 2 — Custom Input Multiplier
    - **Property 2: Custom Input Multiplier**
    - **Validates: Requirements 2.4**
    - Gunakan `fc.integer({ min: 1, max: 180 })`
    - Untuk setiap N ∈ [1, 180], `parseCustomMinutes(String(N)).minutes * 60` harus sama dengan `N * 60`
    - File: `src/__tests__/custom-session-duration/create-test-dialog.test.tsx`

  - [x]* 6.3 Property 3 — Decimal Rounding
    - **Property 3: Decimal Rounding**
    - **Validates: Requirements 2.7**
    - Gunakan `fc.float({ min: 1.0, max: 180.0, noNaN: true })`
    - Untuk setiap desimal D di mana `Math.round(D) ∈ [1, 180]`, `parseCustomMinutes(String(D)).minutes` harus sama dengan `Math.round(D)`
    - File: `src/__tests__/custom-session-duration/create-test-dialog.test.tsx`

  - [x]* 6.4 Property 4 — Invalid Custom Input Disables Submit
    - **Property 4: Invalid Custom Input Disables Submit**
    - **Validates: Requirements 2.5, 2.6, 2.8, 2.9**
    - Gunakan `fc.oneof(fc.constant(""), fc.string().filter(s => isNaN(parseFloat(s))), fc.integer({ max: 0 }).map(String), fc.integer({ min: 181 }).map(String))`
    - Untuk setiap input invalid dengan `isCustom = true`, `parseCustomMinutes(input).valid` harus `false`
    - File: `src/__tests__/custom-session-duration/create-test-dialog.test.tsx`

  - [x]* 6.5 Property 5 — Server Rejects Out-of-Range durationSeconds
    - **Property 5: Server Rejects Out-of-Range durationSeconds**
    - **Validates: Requirements 3.1, 3.2**
    - Gunakan `fc.oneof(fc.integer({ max: 59 }), fc.integer({ min: 10801 }))`
    - `POST /api/tests` dengan nilai di luar [60, 10800] harus return HTTP 422, `error.code === "VALIDATION_ERROR"`
    - File: `src/__tests__/custom-session-duration/api-tests-route.test.ts`

  - [x]* 6.6 Property 6 — Server Rejects Non-Integer durationSeconds
    - **Property 6: Server Rejects Non-Integer durationSeconds**
    - **Validates: Requirements 3.3**
    - Gunakan `fc.float({ min: 60, max: 10800, noNaN: true }).filter(n => !Number.isInteger(n))`
    - Nilai non-integer di range valid harus tetap return HTTP 422
    - File: `src/__tests__/custom-session-duration/api-tests-route.test.ts`

  - [x]* 6.7 Property 7 — Server Persists Exact Valid durationSeconds
    - **Property 7: Server Persists Exact Valid durationSeconds**
    - **Validates: Requirements 3.5, 1.6, 1.7**
    - Gunakan `fc.integer({ min: 60, max: 10800 })`
    - Mock `prisma.test.create` dan verifikasi `capturedCreateData.durationSeconds === dur` untuk setiap nilai valid
    - File: `src/__tests__/custom-session-duration/api-tests-route.test.ts`

  - [x]* 6.8 Property 8 — Activate Route Delay Equals durationSeconds × 1000
    - **Property 8: Activate Route Delay Equals durationSeconds × 1000**
    - **Validates: Requirements 4.1, 4.2, 5.4**
    - Gunakan `fc.integer({ min: 60, max: 10800 })`
    - Mock `prisma.sessionPin.findFirst` mengembalikan session dengan `test.durationSeconds = dur`; mock `enqueueAutoClose` untuk capture argumen
    - Verifikasi `capturedDelay === dur * 1000` untuk setiap nilai valid
    - File: `src/__tests__/custom-session-duration/activate-route.test.ts`

  - [x]* 6.9 Property 9 — Auto-Close Idempotency
    - **Property 9: Auto-Close Idempotency**
    - **Validates: Requirements 4.5**
    - Gunakan `fc.record({ id: fc.uuid(), state: fc.constant("CLOSED"), closedAt: fc.date() })`
    - Mock `prisma.sessionPin.findUnique` mengembalikan session dengan `state = "CLOSED"`
    - Jalankan `processAutoClose` (exported dari worker) dan verifikasi `prisma.sessionPin.update` **tidak** dipanggil
    - File: `src/__tests__/custom-session-duration/auto-close-worker.test.ts`

- [x] 7. Checkpoint — Semua tes hijau sebelum build
  - Jalankan `npm test -- --reporter=verbose` dan verifikasi seluruh suite `custom-session-duration` pass
  - Tanya user jika ada pertanyaan

- [x] 8. Build verification
  - [x] 8.1 Jalankan `npm run build` dan perbaiki semua TypeScript/lint errors
    - Perbaiki TypeScript errors yang muncul dari perubahan di `activate/route.ts`, `tests/route.ts`, dan `page.tsx`
    - Pastikan tidak ada `any` types implisit yang baru diperkenalkan
    - _Requirements: semua_

---

## Notes

- Tasks marked with `*` adalah opsional dan dapat di-skip untuk MVP lebih cepat — namun sangat direkomendasikan untuk memvalidasi correctness properties
- **Task 1 (bug fix) HARUS diselesaikan sebelum task apapun lainnya** — ini adalah bug produksi yang mempengaruhi semua sesi yang sudah ada di DB
- Task 1.1 mencakup tes legacy session (durationSeconds = 1800/2700/3600) untuk memverifikasi bahwa re-aktivasi sesi lama bekerja benar setelah fix
- Fallback `durationSeconds = 0` atau `null` → 900 detik menjaga backward-compatibility dengan sesi yang dibuat sebelum kolom ini punya nilai valid
- Tidak ada migrasi schema yang diperlukan — kolom `durationSeconds` sudah ada di tabel `tests` dengan default 900
- fast-check (`^4.8.0`) dan vitest (`^4.1.10`) sudah tersedia di `devDependencies` — tidak perlu install dependency baru
- Test files diletakkan di `src/__tests__/custom-session-duration/` mengikuti structure yang didefinisikan di design.md
- `processAutoClose` perlu di-export dari `src/workers/auto-close.ts` untuk testability Property 9

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3"] },
    { "id": 4, "tasks": ["4.4", "6.1", "6.2", "6.3", "6.4"] },
    { "id": 5, "tasks": ["6.5", "6.6", "6.7"] },
    { "id": 6, "tasks": ["6.8", "6.9"] },
    { "id": 7, "tasks": ["8.1"] }
  ]
}
```
