# Implementation Plan

## Overview

Rencana implementasi ini mencakup perbaikan 8 bug pada aplikasi Remedi menggunakan bug condition methodology. Setiap bug diperbaiki secara incremental tanpa menyentuh auth, middleware, RBAC, atau koneksi database. Alur: (1) tulis exploration tests sebelum fix untuk membuktikan bug ada, (2) tulis preservation tests untuk mendokumentasikan baseline, (3) implementasikan fix, (4) verifikasi semua tes lulus.

## Tasks

<!-- ========================================================
     FASE 1 — EKSPLORASI BUG (Tulis tes SEBELUM fix)
     ======================================================== -->

- [x] 1. Tulis bug condition exploration tests (SEBELUM implementasi fix)
  - **Property 1: Bug Condition** - Batch Bug Exploration (Bugs 1–8)
  - **CRITICAL**: Tes ini HARUS GAGAL pada kode yang belum di-fix — kegagalan membuktikan bug ada
  - **DO NOT attempt to fix the test or the code when it fails**
  - **GOAL**: Dapatkan counterexample konkret yang membuktikan setiap bug sebelum fix
  - **Scoped PBT Approach**: Setiap bug di-scope ke kasus deterministik yang paling representatif

  - **Bug 1 — Text Options:** POST `{ templateText: "Mana yang benar?", questionType: "text", textOptions: [4 items] }` ke API → ekspektasi setelah fix: HTTP 201 dengan `variants[0].renderedOptions[0].text` berupa string teks; pada kode unfixed: kembalikan 422/500 karena field tidak dikenali
  - **Bug 2 — VariantPreview:** Render `<VariantPreview questionId="nonexistent-id" />` → API 404 → ekspektasi setelah fix: error div + tombol "Coba lagi" terlihat; pada kode unfixed: error ditampilkan tanpa retry button
  - **Bug 3 — Delete Test:** Buat test dengan 1 question + 1 session CLOSED, panggil `DELETE /api/tests/:id` → ekspektasi setelah fix: HTTP 200 cascade; pada kode unfixed: HTTP 500 P2003
  - **Bug 4 — CSV Import:** POST ke `/api/tests/:testId/questions/csv` dengan file CSV 3 baris → ekspektasi setelah fix: HTTP 201 `created: 3`; pada kode unfixed: 404 route not found
  - **Bug 5 — Delete Class:** Buat kelas dengan 1 siswa, panggil `DELETE /api/classes/:id` → ekspektasi setelah fix: HTTP 409 `CONSTRAINT_ERROR`; pada kode unfixed: HTTP 500
  - **Bug 6a — Back Button:** Render `QuestionsPage` → cek DOM → ekspektasi setelah fix: elemen "← Kembali ke Paket Soal" ada; pada kode unfixed: tidak ada elemen tersebut
  - **Bug 6b — Login Navigation:** Spy `window.location.href` dan `router.push`, lakukan login sukses → ekspektasi setelah fix: `router.push` dipanggil, bukan `window.location.href`; pada kode unfixed: sebaliknya
  - **Bug 7 — Session Race:** Mock `getSession()` return null pada call pertama setelah `signIn()` sukses → ekspektasi setelah fix: `router.push` belum dipanggil sampai session confirmed; pada kode unfixed: `router.push` langsung dipanggil
  - **Bug 8 — classId Filter:** Setup 2 kelas (A & B) di sekolah sama, PIN sesi kelas A → POST `/api/student/join` → ekspektasi setelah fix: hanya siswa kelas A; pada kode unfixed: semua siswa dari kedua kelas
  - Run semua tes pada kode UNFIXED — ekspektasi: GAGAL untuk semua bug
  - Dokumentasikan counterexample yang ditemukan untuk memahami root cause masing-masing
  - Tandai task selesai ketika tes sudah ditulis, dijalankan, dan kegagalan terdokumentasi
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14, 1.15, 1.16, 1.17_

<!-- ========================================================
     FASE 2 — PRESERVATION TESTS (Tulis SEBELUM fix)
     ======================================================== -->

- [x] 2. Tulis preservation property tests (SEBELUM implementasi fix)
  - **Property 2: Preservation** - Existing Behavior Unchanged (Semua Bug)
  - **IMPORTANT**: Ikuti observation-first methodology — jalankan kode UNFIXED dengan input non-buggy, rekam output, lalu tulis tes
  - Observe pada kode unfixed:
    - Bug 1: soal dengan `a[2..50], b[2..50]` → varian numerik di-generate (renderedOptions[0].text adalah angka) → tulis property: untuk semua template numerik valid, varian selalu di-generate
    - Bug 2: varian ada (array tidak kosong) → tabel render dengan kolom teks/opsi A–D/τ_min/status kalibrasi → tulis property: untuk semua varian non-empty, tabel selalu render lengkap
    - Bug 3: tombol "Kelola Soal" menavigasi ke `/dashboard/tests/[testId]/questions` → tulis property: tombol ini selalu ada dan navigasinya tidak berubah
    - Bug 4: POST form manual `QuestionFormPanel` ke `POST /api/tests/:testId/questions` masih bekerja → tulis property: endpoint ini tetap menerima templateText biasa
    - Bug 5: kelas tanpa siswa → DELETE HTTP 200 + `onDelete(cls.id)` dipanggil → tulis property: kelas kosong selalu bisa dihapus
    - Bug 6: sidebar navigation + tombol "Keluar" → navigasi tetap bekerja → tulis property: sidebar items masih navigasi ke URL yang sesuai
    - Bug 7: rate limiting countdown + tombol disabled saat rate limited → tulis property: rate limit behavior tidak berubah
    - Bug 8: PIN tidak valid → error generik (tidak ekspos info sesi); student.schoolId verification tetap dijalankan; daftar siswa diurutkan anonymousLabel ascending
  - Verifikasi semua preservation tests PASS pada kode UNFIXED
  - **EXPECTED OUTCOME**: Tests PASS (membuktikan baseline behavior yang harus dijaga)
  - Tandai task selesai ketika tes sudah ditulis, dijalankan, dan passing pada unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 3.15, 3.16, 3.17_

<!-- ========================================================
     FASE 3 — IMPLEMENTASI FIX
     ======================================================== -->

- [x] 3. Fix Bug 1 — Opsi Jawaban Pilihan Ganda Teks

  - [x] 3.1 Tambah `generateStaticVariant()` di `variant-generator.ts`
    - Buat fungsi `generateStaticVariant(textOptions: StaticTextOption[]): GeneratedVariant`
    - Terima array 4 opsi `{ key: "A"|"B"|"C"|"D", text: string, isCorrect: boolean }`
    - Set `variableValues: {}`, `renderedOptions` dari array teks statis, `tauMinSeconds: 10`
    - Export fungsi agar dapat digunakan oleh API route
    - _Bug_Condition: `isBugCondition(input)` = `input.questionType === "text" AND input.textOptions.length === 4`_
    - _Expected_Behavior: fungsi menghasilkan valid `GeneratedVariant` tanpa error, `renderedOptions[i].text` berupa string teks_
    - _Preservation: jalur generasi numerik via `generateVariants()` tidak berubah sama sekali_
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.2 Update API route `POST /api/tests/[testId]/questions` untuk menerima `questionType: "text"`
    - Terima field opsional `questionType: "numeric" | "text"` dan `textOptions` di request body
    - Jika `questionType === "text"`: skip `parseTemplate()` dan `generateVariants()`, panggil `generateStaticVariant(textOptions)`; simpan `variableDefinitions: []`, `constraints: []`
    - Jika `questionType === "numeric"` atau tidak ada: gunakan jalur existing (tidak ada perubahan)
    - _Bug_Condition: `questionType === "text"` AND `textOptions` array valid 4 items_
    - _Expected_Behavior: HTTP 201, question tersimpan, minimal 1 `ItemVariant` dengan `renderedOptions` berisi teks_
    - _Preservation: request tanpa `questionType` (soal lama / numerik) tetap diproses via jalur existing_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2_

  - [x] 3.3 Update `QuestionFormPanel` di `questions/page.tsx` untuk mendukung tipe Teks
    - Tambah toggle `questionType` (Numerik / Teks) di atas form — default: "Numerik"
    - Jika "Teks" dipilih: sembunyikan seksi Variable/Constraint, tampilkan 4 field input teks (Opsi A, B, C, D) + radio button "Jawaban Benar"
    - Update `canSave` validation: tipe Teks requires 4 opsi diisi dan satu jawaban benar dipilih
    - Kirim `{ templateText, questionType: "text", textOptions: [...] }` ke API saat submit
    - _Bug_Condition: guru memilih tipe "Teks" dan mengisi 4 opsi teks_
    - _Preservation: saat toggle tetap di "Numerik" (default), form identik dengan sebelumnya_
    - _Requirements: 2.1, 2.2, 3.7, 3.8_

  - [x] 3.4 Verifikasi bug condition exploration test (Bug 1) sekarang PASS
    - **Property 1: Expected Behavior** - Text Option Type Support
    - **IMPORTANT**: Re-run tes yang SAMA dari task 1 untuk Bug 1 — jangan tulis tes baru
    - **EXPECTED OUTCOME**: Test PASS (membuktikan bug 1 telah diperbaiki)
    - _Requirements: 2.1, 2.2_

  - [x] 3.5 Verifikasi preservation tests (Bug 1) masih PASS
    - **Property 2: Preservation** - Numeric Option Generation Unchanged
    - Re-run preservation tests dari task 2 terkait Bug 1
    - **EXPECTED OUTCOME**: Tests PASS (tidak ada regresi pada generasi varian numerik)
    - _Requirements: 3.1, 3.2_

- [x] 4. Fix Bug 2 — VariantPreview Error & Empty State

  - [x] 4.1 Tambah retry button di blok error `VariantPreview.tsx`
    - Di blok `{!loading && error && ...}`: tambah tombol "↺ Coba lagi" yang memanggil `loadVariants()`
    - Render button dengan `role="button"` dan style yang jelas (e.g. `text-red-600 underline mt-2`)
    - _Bug_Condition: `error !== null` di state VariantPreview_
    - _Expected_Behavior: tombol "Coba lagi" terlihat di DOM dan memanggil `loadVariants()` saat diklik_
    - _Preservation: tombol "↺ Refresh" di header tetap ada dan berfungsi_
    - _Requirements: 2.5, 3.3, 3.4_

  - [x] 4.2 Perbaiki pesan empty state di `VariantPreview.tsx`
    - Di blok `{!loading && !error && variants.length === 0 && ...}`: ubah pesan menjadi informatif
    - Pesan baru: "Belum ada varian untuk soal ini. Jika soal sudah disimpan, klik Refresh untuk memuat ulang. Jika belum, simpan ulang template untuk men-generate varian."
    - _Bug_Condition: `variants.length === 0` (soal baru atau belum pernah di-generate)_
    - _Expected_Behavior: pesan menjelaskan cara men-generate ulang_
    - _Requirements: 2.4_

  - [x] 4.3 Verifikasi bug condition exploration tests (Bug 2) sekarang PASS
    - **Property 1: Expected Behavior** - VariantPreview Error Has Retry & Empty State Is Informative
    - Re-run tes yang SAMA dari task 1 untuk Bug 2
    - **EXPECTED OUTCOME**: Tests PASS
    - _Requirements: 2.4, 2.5_

  - [x] 4.4 Verifikasi preservation tests (Bug 2) masih PASS
    - **Property 2: Preservation** - Variant Table Renders When Data Exists
    - Re-run preservation tests dari task 2 terkait Bug 2
    - **EXPECTED OUTCOME**: Tests PASS
    - _Requirements: 3.3, 3.4_

- [x] 5. Fix Bug 3 — Hapus Paket Soal (Cascade Delete + UI)

  - [x] 5.1 Implementasi cascade delete di `DELETE /api/tests/[testId]/route.ts`
    - Cek sesi aktif: `prisma.sessionPin.count({ where: { testId, state: "ACTIVE" } })`
    - Jika ada sesi aktif: kembalikan HTTP 409 `{ code: 'ACTIVE_SESSION', message: 'Tidak bisa menghapus paket soal yang memiliki sesi aktif.' }`
    - Jika tidak ada sesi aktif: lakukan cascade delete dalam `prisma.$transaction` dengan urutan:
      1. `response.deleteMany({ where: { session: { testId } } })`
      2. `conceptDiagnosis.deleteMany({ where: { session: { testId } } })`
      3. `remedialGroup.deleteMany({ where: { sessionPinId: { in: sessionIds } } })`
      4. `autoWipeLog.deleteMany({ where: { sessionPinId: { in: sessionIds } } })`
      5. `itemVariant.deleteMany({ where: { question: { testId } } })`
      6. `sessionPin.deleteMany({ where: { testId } })`
      7. `question.deleteMany({ where: { testId } })`
      8. `test.delete({ where: { id: testId } })`
    - _Bug_Condition: `isBugCondition(input)` = test memiliki questions/sessions terkait → tanpa cascade → P2003_
    - _Expected_Behavior: HTTP 200, semua child records terhapus, tidak ada orphaned records_
    - _Preservation: tombol "Kelola Soal" dan POST/PUT test tidak terpengaruh_
    - _Requirements: 2.8, 2.9, 3.5, 3.6_

  - [x] 5.2 Tambah delete button dengan two-step confirm di `TestsPage` (`tests/page.tsx`)
    - Ubah item kartu menjadi komponen `TestCard` (atau tambah state lokal) dengan `deleteConfirm` dan `deleting`
    - Tambah tombol Hapus (ikon `Trash2`) dengan two-step confirm identik dengan pola `ClassCard`
    - Saat konfirmasi: panggil `DELETE /api/tests/:testId`; jika sukses hapus dari state; jika 409 tampilkan pesan error
    - _Bug_Condition: `deleteButtonNotShownOnUI(testId)` = tombol hapus tidak ada di kartu_
    - _Expected_Behavior: setiap kartu test menampilkan tombol hapus dengan two-step confirm_
    - _Requirements: 2.6, 2.7, 2.8_

  - [x] 5.3 Verifikasi bug condition exploration tests (Bug 3) sekarang PASS
    - **Property 1: Expected Behavior** - Test Delete Cascades Correctly & Active Session Blocks Delete
    - Re-run tes yang SAMA dari task 1 untuk Bug 3
    - **EXPECTED OUTCOME**: Tests PASS
    - _Requirements: 2.8, 2.9_

  - [x] 5.4 Verifikasi preservation tests (Bug 3) masih PASS
    - **Property 2: Preservation** - Kelola Soal Button & Test Create Still Work
    - Re-run preservation tests dari task 2 terkait Bug 3
    - **EXPECTED OUTCOME**: Tests PASS
    - _Requirements: 3.5, 3.6_

- [x] 6. Fix Bug 4 — Import CSV untuk Paket Soal

  - [x] 6.1 Buat endpoint `POST /api/tests/[testId]/questions/csv/route.ts` (file baru)
    - Terima `multipart/form-data` dengan field `file` (CSV)
    - Parse CSV: baca baris, validasi kolom wajib (`nomor`, `teks_soal`, `tipe_jawaban`, `opsi_a`, `opsi_b`, `opsi_c`, `opsi_d`, `jawaban_benar`)
    - Untuk setiap baris valid dalam transaction:
      - Jika `tipe_jawaban === "teks"`: panggil `generateStaticVariant()` dari fix Bug 1
      - Jika `tipe_jawaban === "numerik"`: parse template dan generate varian numerik
      - Buat `Question` dan `ItemVariant` records
    - Return `{ success: true, data: { created: N, errors: [...] } }`
    - Validasi `testId` milik teacher yang terautentikasi
    - _Bug_Condition: `POST /api/tests/:testId/questions/csv` tidak ada (404)_
    - _Expected_Behavior: HTTP 201, `data.created` sesuai jumlah baris valid di CSV_
    - _Preservation: POST manual via `QuestionFormPanel` ke endpoint lama tidak terpengaruh_
    - _Requirements: 2.10, 2.11, 2.12, 2.13, 3.7, 3.8_

  - [x] 6.2 Buat komponen `ImportQuestionsDialog.tsx` (file baru di `src/components/teacher/`)
    - Dialog dengan dua tab: "Unduh Template" dan "Upload CSV"
    - Tab "Unduh Template": tombol download file CSV dengan header `nomor,teks_soal,tipe_jawaban,opsi_a,opsi_b,opsi_c,opsi_d,jawaban_benar`
    - Tab "Upload CSV": file input untuk CSV, tabel preview setelah file dipilih
    - Validasi kolom wajib sebelum preview ditampilkan — tampilkan error per baris yang invalid
    - Tombol "Konfirmasi Import" yang submit `multipart/form-data` ke `/api/tests/[testId]/questions/csv`
    - _Requirements: 2.11, 2.12, 2.13_

  - [x] 6.3 Tambah tombol "Import CSV" di header `QuestionsPage`
    - Tambah tombol "Import CSV" di header halaman `src/app/dashboard/tests/[testId]/questions/page.tsx`
    - Render `<ImportQuestionsDialog testId={testId} onSuccess={loadData} />` saat tombol diklik
    - Setelah import sukses: panggil `loadData()` untuk reload daftar pertanyaan
    - _Requirements: 2.10_

  - [x] 6.4 Verifikasi bug condition exploration test (Bug 4) sekarang PASS
    - **Property 1: Expected Behavior** - CSV Questions Import
    - Re-run tes yang SAMA dari task 1 untuk Bug 4
    - **EXPECTED OUTCOME**: Test PASS
    - _Requirements: 2.10, 2.11, 2.12, 2.13_

  - [x] 6.5 Verifikasi preservation tests (Bug 4) masih PASS
    - **Property 2: Preservation** - Manual QuestionFormPanel Still Works
    - Re-run preservation tests dari task 2 terkait Bug 4
    - **EXPECTED OUTCOME**: Tests PASS
    - _Requirements: 3.7, 3.8_

- [x] 7. Fix Bug 5 — Kelas Tidak Bisa Dihapus (Foreign Key Constraint)

  - [x] 7.1 Tangkap Prisma P2003 di `DELETE /api/classes/[id]/route.ts`
    - Sebelum delete: hitung siswa dengan `prisma.student.count({ where: { classId: id } })`
    - Jika `studentCount > 0`: kembalikan HTTP 409 `{ success: false, error: { code: 'CONSTRAINT_ERROR', message: 'Tidak bisa menghapus kelas. Masih ada N siswa terdaftar.' } }`
    - Tambah catch untuk `Prisma.PrismaClientKnownRequestError` dengan `code === "P2003"` sebagai fallback safety net → HTTP 409
    - _Bug_Condition: `prisma.class.delete(classId) THROWS P2003 AND studentCount > 0 AND response.status === 500`_
    - _Expected_Behavior: HTTP 409 `CONSTRAINT_ERROR`, pesan menyebutkan jumlah siswa_
    - _Preservation: DELETE kelas tanpa siswa tetap HTTP 200_
    - _Requirements: 2.14, 2.15, 2.16, 3.9, 3.10_

  - [x] 7.2 Tambah error handling di `ClassCard` (`classes/page.tsx`)
    - Tambah state `deleteError: string | null` di `ClassCard`
    - Di `handleDeleteClass()`: tambah `else` branch untuk `!r.success` — set `deleteError` dari `r.error.message`
    - Tampilkan `deleteError` di bawah tombol hapus ketika terisi
    - _Bug_Condition: `handleDeleteClass()` menerima `r.success === false` tapi tidak menampilkan error_
    - _Expected_Behavior: pesan error dari API response ditampilkan ke pengguna_
    - _Requirements: 2.14_

  - [x] 7.3 Verifikasi bug condition exploration tests (Bug 5) sekarang PASS
    - **Property 1: Expected Behavior** - Class Delete Returns 409 on FK Constraint & Error Shown in UI
    - Re-run tes yang SAMA dari task 1 untuk Bug 5
    - **EXPECTED OUTCOME**: Tests PASS
    - _Requirements: 2.14, 2.15_

  - [x] 7.4 Verifikasi preservation tests (Bug 5) masih PASS
    - **Property 2: Preservation** - Empty Class Delete Still Works & Two-Step Confirm Unchanged
    - Re-run preservation tests dari task 2 terkait Bug 5
    - **EXPECTED OUTCOME**: Tests PASS
    - _Requirements: 2.16, 3.9, 3.10_

- [x] 8. Fix Bug 6 — Navigasi Back di Dashboard Guru

  - [x] 8.1 Ganti `window.location.href` dengan `router.push` di `login/page.tsx`
    - Di `handleSubmit`: ganti `window.location.href = destination` dengan `router.push(destination)`
    - `router` sudah di-declare via `useRouter()` — tinggal digunakan untuk navigasi post-login
    - _Bug_Condition: `loginMethod === "window.location.href" AND browserHistoryCorrupted`_
    - _Expected_Behavior: `router.push(destination)` dipanggil; browser history terjaga (Back tidak kembali ke login)_
    - _Preservation: `signOut({ callbackUrl: '/login' })` tidak berubah_
    - _Requirements: 2.18, 3.11, 3.12_

  - [x] 8.2 Tambah tombol "← Kembali ke Paket Soal" di `QuestionsPage`
    - Di header `src/app/dashboard/tests/[testId]/questions/page.tsx`, tambah di atas `<h1>`:
      `<Link href="/dashboard/tests" className="...">← Kembali ke Paket Soal</Link>`
    - Import `Link` dari `next/link` dan `ChevronLeft` dari `lucide-react` bila belum diimport
    - _Bug_Condition: `currentPage === "/dashboard/tests/[testId]/questions" AND backButtonNotFound`_
    - _Expected_Behavior: elemen "← Kembali ke Paket Soal" ada di DOM dan navigasi ke `/dashboard/tests`_
    - _Requirements: 2.17_

  - [x] 8.3 Verifikasi bug condition exploration tests (Bug 6) sekarang PASS
    - **Property 1: Expected Behavior** - Back Button Exists & Login Uses router.push
    - Re-run tes yang SAMA dari task 1 untuk Bug 6
    - **EXPECTED OUTCOME**: Tests PASS
    - _Requirements: 2.17, 2.18_

  - [x] 8.4 Verifikasi preservation tests (Bug 6) masih PASS
    - **Property 2: Preservation** - Sidebar Navigation & SignOut Unchanged
    - Re-run preservation tests dari task 2 terkait Bug 6
    - **EXPECTED OUTCOME**: Tests PASS
    - _Requirements: 3.11, 3.12_

- [x] 9. Fix Bug 7 — Double-Click di Portal Siswa (Race Condition)

  - [x] 9.1 Tambah session wait setelah `signIn()` di `student/join/page.tsx`
    - Di `handleSelectSubmit`, setelah `signIn("student-pin", { ..., redirect: false })` sukses:
      1. `await new Promise((resolve) => setTimeout(resolve, 300))`
      2. `const session = await getSession()`
      3. Jika `!session`: `await new Promise((resolve) => setTimeout(resolve, 500))`
    - Panggil `router.push(...)` hanya setelah session verification
    - Import `getSession` dari `next-auth/react`
    - _Bug_Condition: `signIn result.ok === true AND sessionCookieReady === false AND router.push called immediately`_
    - _Expected_Behavior: `router.push` dipanggil hanya setelah session aktif terkonfirmasi_
    - _Preservation: loading state dan nonaktifkan tombol saat proses berlangsung tetap bekerja_
    - _Requirements: 2.20, 2.21, 3.13, 3.14_

  - [x] 9.2 Tambah retry logic untuk network error di `handlePinSubmit`
    - Bungkus fetch `POST /api/student/join` dengan retry: maks 3 percobaan, jeda 500ms per retry
    - Hanya retry untuk error 5xx atau network error — tidak retry untuk 4xx (PIN salah, rate limited)
    - _Bug_Condition: `fetch POST /api/student/join` gagal karena error jaringan sementara_
    - _Expected_Behavior: sistem retry otomatis maks 2 kali sebelum menampilkan error_
    - _Requirements: 2.19, 2.21_

  - [x] 9.3 Verifikasi bug condition exploration tests (Bug 7) sekarang PASS
    - **Property 1: Expected Behavior** - Student Portal Session Wait
    - Re-run tes yang SAMA dari task 1 untuk Bug 7
    - **EXPECTED OUTCOME**: Tests PASS
    - _Requirements: 2.19, 2.20_

  - [x] 9.4 Verifikasi preservation tests (Bug 7) masih PASS
    - **Property 2: Preservation** - Loading State & Rate Limit Unchanged
    - Re-run preservation tests dari task 2 terkait Bug 7
    - **EXPECTED OUTCOME**: Tests PASS
    - _Requirements: 2.21, 3.13, 3.14_

- [x] 10. Fix Bug 8 — Portal Siswa Tampilkan Semua Siswa Lintas Kelas

  - [x] 10.1 Tambah `classId` filter di `POST /api/student/join/route.ts`
    - Di lookup `sessionPin`, tambah `include: { test: { select: { classId: true } } }` (atau `select` equivalent)
    - Di query `student.findMany`, ubah where clause:
      - Sebelum: `where: { schoolId: sessionPin.schoolId }`
      - Sesudah: `where: { schoolId: sessionPin.schoolId, classId: sessionPin.test.classId }`
    - Tidak ada perubahan schema — relasi `Test.classId` sudah ada di Prisma schema
    - _Bug_Condition: `query.where EQUALS { schoolId } AND NOT INCLUDES { classId }` → siswa lintas kelas muncul_
    - _Expected_Behavior: response hanya berisi siswa dari `classId === sessionPin.test.classId`_
    - _Preservation: PIN tidak valid → error generik; `student.schoolId` verification tetap dijalankan; urutan `anonymousLabel` asc tetap_
    - _Requirements: 2.22, 2.23, 3.15, 3.16, 3.17_

  - [x] 10.2 Verifikasi bug condition exploration test (Bug 8) sekarang PASS
    - **Property 1: Expected Behavior** - Student List Filtered by ClassId
    - Re-run tes yang SAMA dari task 1 untuk Bug 8
    - **EXPECTED OUTCOME**: Test PASS
    - _Requirements: 2.22, 2.23_

  - [x] 10.3 Verifikasi preservation tests (Bug 8) masih PASS
    - **Property 2: Preservation** - Invalid PIN Rejected & Same-Class Student Accepted
    - Re-run preservation tests dari task 2 terkait Bug 8
    - **EXPECTED OUTCOME**: Tests PASS
    - _Requirements: 3.15, 3.16, 3.17_

<!-- ========================================================
     FASE 4 — CHECKPOINT AKHIR
     ======================================================== -->

- [x] 11. Checkpoint — Verifikasi Semua Tes Lulus
  - Jalankan seluruh test suite (unit + integration) untuk semua 8 bug
  - Verifikasi semua bug condition exploration tests PASS (bug terperbaiki)
  - Verifikasi semua preservation tests PASS (tidak ada regresi)
  - Periksa tidak ada orphaned records di database setelah tes cascade delete
  - Pastikan tidak ada perubahan pada skema Prisma (konfirmasi 0 migration file baru dibuat)
  - Tanyakan ke user jika ada tes yang masih gagal atau ada pertanyaan yang muncul

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2"], "description": "Exploration & Preservation tests — harus selesai sebelum fix apapun" },
    { "wave": 2a", "tasks": ["7", "10"], "description": "PRIORITAS TINGGI — Fix Bug 5 (hapus kelas) & Bug 8 (filter siswa): menyangkut integritas data dan privasi siswa — dikerjakan dan diverifikasi LEBIH DULU sebelum wave 2b" },
    { "wave": "2b", "tasks": ["3", "4", "5", "8", "9"], "description": "Fix Bug 1,2,3,6,7 — boleh paralel, mulai setelah wave 2a selesai" },
    { "wave": 3, "tasks": ["6"], "description": "Fix Bug 4 (CSV) — HARUS setelah task 3 selesai dan verified (3.4 PASS) karena reuse generateStaticVariant()" },
    { "wave": 4, "tasks": ["11"], "description": "Checkpoint akhir — setelah semua fix dan verify selesai" }
  ]
}
```

### Aturan Urutan Eksplisit

1. **Task 1 → Task 2** selesai sebelum fix apapun dimulai (Wave 1)
2. **Task 7 (Bug 5) dan Task 10 (Bug 8) dikerjakan terlebih dahulu** di Wave 2, karena:
   - Bug 5: integritas data — hapus kelas dengan siswa harus menghasilkan 409, bukan 500
   - Bug 8: privasi siswa — filter `classId` mencegah data siswa lintas kelas terekspos
   - Keduanya harus selesai dan verified (7.3, 7.4, 10.2, 10.3 PASS) sebelum lanjut ke Wave 2b
3. **Task 6 TIDAK boleh dieksekusi paralel dengan Task 3** — Task 6.1 menggunakan `generateStaticVariant()` yang baru ada setelah Task 3.1 selesai. Task 6 hanya boleh dimulai setelah sub-task 3.4 (verification) PASS.
4. **Task 11** bergantung pada semua task verify: 3.4, 3.5, 4.3, 4.4, 5.3, 5.4, 6.4, 6.5, 7.3, 7.4, 8.3, 8.4, 9.3, 9.4, 10.2, 10.3

## Notes

- **Tidak ada migrasi Prisma**: semua 8 fix berada di layer aplikasi; schema.prisma tidak berubah
- **Bug 1 & Bug 4 terkait**: `generateStaticVariant()` yang dibuat untuk Bug 1 (task 3.1) digunakan kembali oleh endpoint CSV Bug 4 (task 6.1) — Task 6 SEQUENTIAL setelah Task 3, bukan paralel
- **Prioritas data integrity**: Bug 5 (Task 7) dan Bug 8 (Task 10) dikerjakan di Wave 2a karena menyangkut integritas data dan privasi siswa
- **Kode unfixed**: saat menjalankan task 1 (exploration tests), jangan modifikasi kode apapun — tujuannya hanya mendapatkan counterexample
- **Two-step confirm pattern**: Bug 3 (delete test) mengikuti pola two-step confirm yang sudah ada di `ClassCard` (Bug 5)
