# Remedi Bugfix Batch — Technical Design Document

## Overview

Dokumen ini merinci pendekatan teknis untuk memperbaiki 8 bug pada aplikasi Remedi (Next.js 14, Prisma, NextAuth, PostgreSQL). Setiap bug dianalisis menggunakan metodologi Bug Condition: C(X) mendefinisikan input yang memicu bug, P(result) mendefinisikan perilaku yang diharapkan setelah fix, dan ¬C(X) mendefinisikan input yang harus tetap tidak terpengaruh. Semua perbaikan bersifat incremental dan tidak mengubah auth, middleware, RBAC, atau koneksi database.

---

## Glossary

- **Bug_Condition (C)**: Kondisi spesifik yang memicu bug — input, state, atau jalur eksekusi yang menyebabkan perilaku salah
- **Property (P)**: Perilaku yang diharapkan ketika bug condition terpenuhi setelah fix diterapkan
- **Preservation (¬C)**: Input/state yang TIDAK memicu bug dan harus tetap berperilaku identik sebelum dan sesudah fix
- **F**: Fungsi/kode asli (belum di-fix)
- **F'**: Fungsi/kode yang sudah di-fix
- **Cascade Delete**: Penghapusan rekord terkait secara berantai sebelum menghapus rekord induk
- **Race Condition**: Kondisi ketika dua operasi async berjalan bersamaan dan urutan penyelesaiannya tidak deterministik
- **sessionPin.schoolId**: Isolasi multi-tenant — semua query harus di-scope ke `schoolId` yang sama
- **templateAST**: Abstract Syntax Tree dari template soal yang di-parse oleh `src/lib/template/parser.ts`
- **ItemVariant**: Varian soal yang di-generate dari template, tersimpan di tabel `item_variants`
- **renderedOptions**: Field JSON di `ItemVariant` yang berisi array `{ key, text, isCorrect }` untuk opsi A–D

---

## Bug Details

### Bug 1 — Opsi Jawaban Pilihan Ganda Hanya Numerik

#### Bug Condition

Bug terjadi ketika guru membuat soal pilihan ganda yang membutuhkan opsi berupa teks (bukan angka). Sistem `variant-generator.ts` saat ini hanya menghasilkan opsi numerik melalui `String(correctAnswer)` dan `String(distractor)`. Tidak ada mekanisme untuk mendefinisikan opsi teks secara manual.

```
FUNCTION isBugCondition(input)
  INPUT: input berupa QuestionCreationRequest
  OUTPUT: boolean

  RETURN input.questionType === "TEXT_OPTIONS"
         AND input.options CONTAINS text strings (bukan range numerik)
         AND sistem tidak menyediakan form input untuk opsi teks
END FUNCTION
```

**Contoh Bug:**
- Guru ingin membuat soal: *"Manakah yang bukan merupakan jenis energi?"* dengan opsi A) Energi kinetik, B) Energi potensial, C) Energi panas, D) Energi acak — sistem tidak bisa menangani ini
- Guru ingin membuat soal logika Bahasa Indonesia dengan opsi berupa kalimat — tidak ada field input untuk teks bebas
- Soal tanpa variabel numerik `[min..max]` → parser mengembalikan error `UNDEFINED_VARIABLE`

**Root Cause:** `variant-generator.ts` di `src/lib/template/variant-generator.ts` hanya mendukung pipeline: sample integer → compute answer → generate distractors numerik. Tidak ada path untuk "static text options" tanpa variable substitution. Parser di `parser.ts` mensyaratkan `# variables:` line jika ada `{{placeholder}}`, dan jika tidak ada placeholder sama sekali, `generateVariants()` tidak tahu jawaban benarnya.

**File yang Terdampak:**
- `src/lib/template/variant-generator.ts` — perlu jalur generasi baru untuk opsi teks
- `src/app/api/tests/[testId]/questions/route.ts` — perlu mendeteksi `questionType`
- `src/app/dashboard/tests/[testId]/questions/page.tsx` (`QuestionFormPanel`) — perlu form UI untuk opsi teks

### Bug 2 — Error Saat Klik "Lihat Varian"

#### Bug Condition

Bug terjadi dalam dua skenario: (a) soal belum pernah di-generate variannya sehingga array varian kosong, (b) fetch ke `/api/questions/[id]/variants` gagal (non-200 / network error) dan komponen `VariantPreview` menampilkan error mentah tanpa tombol retry.

```
FUNCTION isBugCondition(input)
  INPUT: input berupa { questionId, apiResponse }
  OUTPUT: boolean

  RETURN (apiResponse.success === true AND apiResponse.data.length === 0)
         OR (apiResponse.success === false AND noRetryButtonShown)
         OR (networkError AND noRetryButtonShown)
END FUNCTION
```

**Contoh Bug:**
- Guru klik "Lihat Varian" pada soal baru → tampil "Belum ada varian. Simpan template soal untuk men-generate varian." tanpa penjelasan bahwa soal ini sudah tersimpan dan perlu disimpan ulang
- API mengembalikan `500 INTERNAL_ERROR` → komponen menampilkan string error mentah dari `result.error.message` tanpa tombol "Coba lagi"
- Network timeout → state `error` terisi tapi tidak ada UI untuk retry selain tombol "↺ Refresh" yang selalu ada di header (ini berfungsi, tapi tidak terlihat ketika error message mengisi area konten)

**Root Cause:** Di `src/components/teacher/VariantPreview.tsx`, blok `{!loading && error && ...}` hanya merender `<div>` berisi pesan error tanpa tombol retry. Pesan kosong (0 varian) juga tidak cukup informatif — tidak menjelaskan cara men-generate ulang.

**File yang Terdampak:**
- `src/components/teacher/VariantPreview.tsx` — perlu retry button di blok error dan pesan lebih informatif di blok empty

---

### Bug 3 — Tidak Ada Tombol Hapus Paket Soal

#### Bug Condition

Bug terjadi saat guru ingin menghapus paket soal dari halaman `/dashboard/tests`. UI tidak menampilkan tombol hapus. Selain itu, endpoint `DELETE /api/tests/:testId` akan gagal dengan constraint error karena tidak melakukan cascade delete.

```
FUNCTION isBugCondition(input)
  INPUT: input berupa { testId, hasRelatedQuestions, hasSessionPins }
  OUTPUT: boolean

  RETURN deleteButtonNotShownOnUI(testId)
         OR (prisma.test.delete(testId) THROWS ForeignKeyConstraintError
             WHEN relatedQuestions > 0 OR relatedSessionPins > 0)
END FUNCTION
```

**Contoh Bug:**
- Halaman `/dashboard/tests` (`TestsPage`) tidak memiliki tombol hapus pada kartu test — hanya ada "Kelola Soal"
- `DELETE /api/tests/:testId` langsung memanggil `prisma.test.delete()` tanpa menghapus `ItemVariant` → `Question` → `Response` → `ConceptDiagnosis` → `RemedialGroup` → `AutoWipeLog` → `SessionPin` terlebih dahulu, menyebabkan `P2003` foreign key constraint error yang dikembalikan sebagai HTTP 500

**Root Cause:**
1. `TestsPage` di `src/app/dashboard/tests/page.tsx` tidak mengimplementasikan delete UI — tidak ada state `deleteConfirm`, tidak ada handler, tidak ada `Trash2` icon
2. `DELETE` handler di `src/app/api/tests/[testId]/route.ts` memanggil `prisma.test.delete()` langsung tanpa memeriksa dependensi, dan tidak menangkap Prisma error code `P2003`

**File yang Terdampak:**
- `src/app/dashboard/tests/page.tsx` — tambah delete button dengan two-step confirm dan validasi sesi aktif
- `src/app/api/tests/[testId]/route.ts` — implementasi cascade delete dan cek sesi aktif

### Bug 4 — Belum Ada Upload CSV untuk Paket Soal

#### Bug Condition

Bug terjadi saat guru ingin membuat banyak soal sekaligus. Tidak ada endpoint API maupun komponen UI untuk import soal dari file CSV.

```
FUNCTION isBugCondition(input)
  INPUT: input berupa TeacherIntent
  OUTPUT: boolean

  RETURN input.intent === "BULK_CREATE_QUESTIONS"
         AND csvImportButtonNotFound(currentPage)
         AND POST /api/tests/:testId/questions/csv DOES NOT EXIST
END FUNCTION
```

**Contoh Bug:**
- Halaman `/dashboard/tests/[testId]/questions` tidak memiliki tombol "Import CSV"
- Tidak ada route `POST /api/tests/[testId]/questions/csv` atau serupa
- Guru harus mengisi form satu soal per satu soal, tidak efisien untuk bank soal besar

**Root Cause:** Fitur ini belum pernah diimplementasikan. Tidak ada endpoint dan tidak ada komponen UI.

**File yang Terdampak:**
- `src/app/api/tests/[testId]/questions/csv/route.ts` — file baru, endpoint POST untuk upload CSV
- `src/app/dashboard/tests/[testId]/questions/page.tsx` — tambah tombol "Import CSV" dan dialog
- Komponen baru: `src/components/teacher/ImportQuestionsDialog.tsx`

---

### Bug 5 — Kelas Tidak Bisa Dihapus (Foreign Key Constraint)

#### Bug Condition

Bug terjadi saat guru menghapus kelas yang masih memiliki siswa terdaftar. Prisma melempar foreign key constraint error (`P2003`) yang tidak ditangkap secara spesifik, dikembalikan sebagai HTTP 500. UI tidak menampilkan pesan error ke pengguna.

```
FUNCTION isBugCondition(input)
  INPUT: input berupa { classId, studentCount }
  OUTPUT: boolean

  RETURN prisma.class.delete(classId) THROWS P2003
         AND studentCount > 0
         AND response.status === 500 (instead of 409)
         AND UI tidak menampilkan error message
END FUNCTION
```

**Contoh Bug:**
- Kelas "10-A" dengan 30 siswa → klik Hapus → Konfirmasi → API mengembalikan 500 → UI tidak memberikan feedback
- Di `ClassCard.handleDeleteClass()`: `if (r.success) onDelete(cls.id)` — jika `!r.success`, tidak ada `else` branch untuk menampilkan error
- API mengembalikan `{ success: false, error: { code: 'INTERNAL_ERROR' } }` alih-alih `{ code: 'CONSTRAINT_ERROR' }` dengan status 409

**Root Cause:**
1. `DELETE` handler di `src/app/api/classes/[id]/route.ts` tidak menangkap Prisma error `P2003` secara eksplisit — semua error jatuh ke `catch` generik yang mengembalikan 500
2. `handleDeleteClass()` di `src/app/dashboard/classes/page.tsx` tidak memiliki error handling untuk `r.success === false`

**File yang Terdampak:**
- `src/app/api/classes/[id]/route.ts` — tangkap `P2003`, kembalikan 409 dengan pesan deskriptif
- `src/app/dashboard/classes/page.tsx` (`ClassCard`) — tambah error state dan tampilkan pesan error dari API response

### Bug 6 — Tidak Ada Tombol Back di Dashboard Guru

#### Bug Condition

Bug terjadi dalam dua skenario terkait: (a) halaman `QuestionsPage` tidak memiliki tombol "Kembali ke Paket Soal", (b) login menggunakan `window.location.href` yang merusak browser history.

```
FUNCTION isBugCondition(input)
  INPUT: input berupa { currentPage, loginMethod }
  OUTPUT: boolean

  RETURN (currentPage === "/dashboard/tests/[testId]/questions"
          AND backButtonNotFound)
         OR (loginMethod === "window.location.href"
             AND browserHistoryCorrupted)
END FUNCTION
```

**Contoh Bug:**
- Guru berada di `/dashboard/tests/123/questions` → tidak ada tombol "← Kembali ke Paket Soal" → harus klik "Soal" di sidebar lalu klik test lagi
- Setelah login, guru menekan tombol Back browser → kembali ke halaman login (karena `window.location.href` menambah entry history baru, bukan mengganti)

**Root Cause:**
1. `QuestionsPage` di `src/app/dashboard/tests/[testId]/questions/page.tsx` — bagian header halaman hanya memiliki `<h1>Question Builder</h1>` dan info topik/kelas, tanpa tombol navigasi kembali
2. `handleSubmit` di `src/app/login/page.tsx` menggunakan `window.location.href = destination` di baris 56 alih-alih `router.push(destination)`. Kode sudah mengimport `useRouter` tapi tidak menggunakannya untuk navigasi post-login

**File yang Terdampak:**
- `src/app/dashboard/tests/[testId]/questions/page.tsx` — tambah tombol `← Kembali ke Paket Soal` di header
- `src/app/login/page.tsx` — ganti `window.location.href = destination` dengan `router.push(destination)`

---

### Bug 7 — Double-Click di Portal Siswa (Race Condition)

#### Bug Condition

Bug terjadi saat `signIn("student-pin")` berhasil (session cookie di-set) tapi `router.push` dipanggil terlalu cepat sebelum session cookie benar-benar terbaca oleh halaman tujuan. Siswa mengalami error di quiz page atau harus klik ulang.

```
FUNCTION isBugCondition(input)
  INPUT: input berupa { signInResult, sessionCookieReady }
  OUTPUT: boolean

  RETURN signInResult.ok === true
         AND sessionCookieReady === false
         AND router.push("/student/quiz/:id") CALLED IMMEDIATELY
         AND quizPage.getServerSideSession() RETURNS null
END FUNCTION
```

**Contoh Bug:**
- Siswa klik "Masuk" → `signIn()` resolve dengan `{ ok: true }` → `router.push` dipanggil segera → quiz page di-load sebelum session cookie tersedia → error atau halaman kosong
- Siswa harus klik "Masuk" dua kali untuk berhasil masuk

**Root Cause:** Di `handleSelectSubmit` dalam `src/app/student/join/page.tsx`, setelah `signIn("student-pin", { ..., redirect: false })` berhasil, kode langsung memanggil `router.push(...)` tanpa menunggu session aktif terkonfirmasi. NextAuth membutuhkan waktu untuk menyimpan session cookie dan membuatnya tersedia untuk request berikutnya. Bandingkan dengan login guru di `login/page.tsx` yang sudah melakukan `await new Promise(resolve => setTimeout(resolve, 300))` dan `await getSession()`.

**File yang Terdampak:**
- `src/app/student/join/page.tsx` — tambah delay/session verification sebelum `router.push`, tambah retry logic untuk `POST /api/student/join` pada network error

### Bug 8 — Portal Siswa Menampilkan Semua Siswa Lintas Kelas

#### Bug Condition

Bug terjadi saat siswa memasukkan PIN sesi yang valid. Query `prisma.student.findMany` hanya mem-filter berdasarkan `schoolId`, bukan `classId` dari kelas yang terkait dengan sesi tersebut.

```
FUNCTION isBugCondition(input)
  INPUT: input berupa { pinCode, sessionPin }
  OUTPUT: boolean

  RETURN sessionPin.state === "ACTIVE"
         AND query.where EQUALS { schoolId: sessionPin.schoolId }
         AND query.where NOT INCLUDES { classId: sessionPin.test.classId }
         AND studentsFromOtherClasses INCLUDED IN response
END FUNCTION
```

**Contoh Bug:**
- Sekolah memiliki 5 kelas × 30 siswa = 150 siswa. Siswa memasukkan PIN sesi kelas 10-A → daftar menampilkan 150 nama dari semua kelas, bukan 30 nama dari kelas 10-A
- Siswa dari kelas 10-B bisa "memilih" nama dari kelas 10-A dan mengumpulkan jawaban atas nama siswa lain
- Data respons tercampur antar kelas

**Root Cause:** Di `src/app/api/student/join/route.ts`, query `prisma.sessionPin.findUnique()` tidak menyertakan `test: { select: { classId: true } }`. Kemudian query `prisma.student.findMany()` menggunakan `where: { schoolId: sessionPin.schoolId }` tanpa filter `classId`. Relasi `SessionPin → Test → classId` sudah ada di schema Prisma tapi tidak dimanfaatkan.

**File yang Terdampak:**
- `src/app/api/student/join/route.ts` — tambah `include: { test: { select: { classId: true } } }` pada lookup sessionPin, tambah `classId` ke filter `student.findMany`

---

## Expected Behavior

### Preservation Requirements

**Behavior yang TIDAK boleh berubah:**

**Bug 1 (Opsi Numerik):**
- Soal dengan variabel numerik `varName[min..max]` tetap men-generate varian numerik otomatis
- Field `renderedOptions` di `ItemVariant` tetap menyimpan format JSON `[{ key, text, isCorrect }]`

**Bug 2 (VariantPreview):**
- Ketika varian berhasil dimuat (array tidak kosong), tabel varian tetap menampilkan kolom teks, opsi A–D, τ_min, dan status kalibrasi
- Tombol "↺ Refresh" di header VariantPreview tetap berfungsi

**Bug 3 (Hapus Paket Soal):**
- Tombol "Kelola Soal" tetap menavigasi ke `/dashboard/tests/[testId]/questions`
- Dialog "Buat Paket Soal Baru" tetap berfungsi normal

**Bug 4 (CSV Upload):**
- Form manual `QuestionFormPanel` tetap berfungsi — template parsing dan variant generation tidak berubah
- `POST /api/tests/[testId]/questions` dengan `templateText` biasa tetap bekerja normal

**Bug 5 (Hapus Kelas):**
- Two-step confirm (3 detik timeout) pada tombol hapus kelas tetap berjalan
- Callback `onDelete(cls.id)` tetap dipanggil setelah penghapusan berhasil

**Bug 6 (Navigasi Back):**
- Klik item sidebar tetap menavigasi ke halaman yang sesuai
- Tombol "Keluar" tetap memanggil `signOut({ callbackUrl: '/login' })`

**Bug 7 (Double-click):**
- Step 1: PIN submit tetap memanggil `POST /api/student/join` dengan `studentId: ""`
- Rate limiting countdown timer tetap aktif dan tombol dinonaktifkan saat rate limited

**Bug 8 (Filter Siswa):**
- PIN tidak valid atau sesi tidak ACTIVE tetap mengembalikan error generik (tidak mengekspos info sesi)
- Verifikasi `student.schoolId === sessionPin.schoolId` tetap dijalankan di Step 2
- Daftar siswa tetap diurutkan berdasarkan `anonymousLabel` ascending

---

## Hypothesized Root Cause

| Bug | Root Cause Category | File(s) |
|-----|---------------------|---------|
| 1 | Missing feature path: variant-generator hanya ada jalur numerik, tidak ada jalur teks statis | `variant-generator.ts`, `questions/page.tsx` |
| 2 | Missing UI element: blok error di VariantPreview tidak punya retry button; empty state kurang informatif | `VariantPreview.tsx` |
| 3 | Missing UI + wrong API pattern: TestsPage tidak punya delete UI; DELETE endpoint tidak cascade | `tests/page.tsx`, `api/tests/[testId]/route.ts` |
| 4 | Feature not implemented: tidak ada endpoint CSV, tidak ada UI untuk import | baru: `questions/csv/route.ts`, `ImportQuestionsDialog.tsx` |
| 5 | Missing error type handling: catch block tidak bedakan P2003; UI tidak handle `success: false` | `api/classes/[id]/route.ts`, `classes/page.tsx` |
| 6 | Wrong navigation API + missing back button: `window.location.href` bukan `router.push`; tidak ada back button di QuestionsPage | `login/page.tsx`, `questions/page.tsx` |
| 7 | Race condition: `router.push` dipanggil tanpa menunggu session cookie ready setelah `signIn()` | `student/join/page.tsx` |
| 8 | Missing query filter: `findMany` tidak menyertakan `classId` dari `sessionPin.test.classId` | `api/student/join/route.ts` |

---

## Correctness Properties

Property 1: Bug Condition — Text Option Type Support

_For any_ request membuat soal dengan `questionType: "text"` dan array `textOptions` berisi 4 string, sistem SHALL menyimpan `renderedOptions` berisi opsi teks tersebut dan menghasilkan minimal 1 `ItemVariant` tanpa error.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation — Numeric Option Generation Unchanged

_For any_ template soal dengan variabel numerik `name[min..max]` yang valid, sistem SHALL CONTINUE TO men-generate varian numerik secara otomatis identik dengan perilaku sebelum Bug 1 fix diterapkan.

**Validates: Requirements 3.1, 3.2**

Property 3: Bug Condition — VariantPreview Error Has Retry

_For any_ state di mana `VariantPreview` memiliki `error !== null`, komponen SHALL menampilkan tombol "Coba lagi" yang ketika diklik memanggil `loadVariants()` ulang.

**Validates: Requirements 2.5**

Property 4: Bug Condition — VariantPreview Empty State Is Informative

_For any_ soal dengan 0 varian tersimpan, `VariantPreview` SHALL menampilkan pesan yang menjelaskan bahwa soal perlu disimpan ulang untuk men-generate varian (bukan hanya "Belum ada varian").

**Validates: Requirements 2.4**

Property 5: Bug Condition — Test Delete Cascades Correctly

_For any_ test yang tidak memiliki `SessionPin` dengan state `ACTIVE`, `DELETE /api/tests/:testId` SHALL berhasil (HTTP 200) dan menghapus semua `ItemVariant`, `Question`, `Response`, `ConceptDiagnosis`, `RemedialGroup`, dan `SessionPin` terkait sebelum menghapus test.

**Validates: Requirements 2.9**

Property 6: Bug Condition — Active Session Blocks Test Delete

_For any_ test yang memiliki minimal 1 `SessionPin` dengan state `ACTIVE`, `DELETE /api/tests/:testId` SHALL mengembalikan HTTP 409 dengan `code: 'ACTIVE_SESSION'`.

**Validates: Requirements 2.8**

Property 7: Bug Condition — Test Delete Button Visible

_For any_ `TestItem` yang ditampilkan di `TestsPage`, UI SHALL menampilkan tombol hapus dengan two-step confirm.

**Validates: Requirements 2.6, 2.7**

Property 8: Bug Condition — CSV Questions Import

_For any_ file CSV yang valid dengan kolom wajib (`nomor`, `teks_soal`, `tipe_jawaban`, `opsi_a`, `opsi_b`, `opsi_c`, `opsi_d`, `jawaban_benar`), `POST /api/tests/:testId/questions/csv` SHALL membuat Question records sejumlah baris CSV yang valid.

**Validates: Requirements 2.10, 2.11, 2.12, 2.13**

Property 9: Bug Condition — Class Delete Returns 409 on FK Constraint

_For any_ kelas yang memiliki siswa terdaftar, `DELETE /api/classes/:id` SHALL mengembalikan HTTP 409 dengan `code: 'CONSTRAINT_ERROR'` dan pesan yang menyebutkan jumlah siswa.

**Validates: Requirements 2.14, 2.15**

Property 10: Bug Condition — Class Delete Error Shown in UI

_For any_ response `DELETE /api/classes/:id` dengan `success: false`, `ClassCard` SHALL menampilkan pesan error dari `r.error.message` kepada pengguna.

**Validates: Requirements 2.14**

Property 11: Bug Condition — Back Button Exists on QuestionsPage

_For any_ render dari `QuestionsPage`, halaman SHALL menampilkan elemen navigasi "← Kembali ke Paket Soal" yang ketika diklik menavigasi ke `/dashboard/tests`.

**Validates: Requirements 2.17**

Property 12: Bug Condition — Login Uses router.push

_For any_ login sukses di `LoginPage`, navigasi post-login SHALL menggunakan `router.push(destination)` sehingga entry history sebelumnya (bukan halaman login) tersimpan di browser history.

**Validates: Requirements 2.18**

Property 13: Bug Condition — Student Portal Session Wait

_For any_ `signIn("student-pin")` yang berhasil (result.ok === true), sistem SHALL menunggu session aktif terkonfirmasi (via `getSession()` atau delay + polling) sebelum memanggil `router.push`.

**Validates: Requirements 2.20**

Property 14: Preservation — Student Portal Loading State

_For any_ proses login siswa yang sedang berjalan, semua tombol SHALL dinonaktifkan dan loading state SHALL ditampilkan selama proses berlangsung.

**Validates: Requirements 2.21, 3.14**

Property 15: Bug Condition — Student List Filtered by ClassId

_For any_ PIN sesi yang valid (`sessionPin.state === "ACTIVE"`), `POST /api/student/join` dengan `studentId: ""` SHALL mengembalikan hanya siswa dari `classId === sessionPin.test.classId`.

**Validates: Requirements 2.22, 2.23**

Property 16: Preservation — Cross-Class Student Not Accepted

_For any_ `studentId` yang `classId`-nya berbeda dari `sessionPin.test.classId`, Step 2 verify SHALL mengembalikan `AUTH_FAILED` error.

**Validates: Requirements 3.16**

---

## Fix Implementation

### Bug 1 — Text Option Type Support

> **Klarifikasi schema:** `questionType` adalah **request-body field saja**, bukan kolom database baru. Model `Question` di `schema.prisma` tidak berubah — field `variableDefinitions` (Json) dan `constraints` (Json) yang sudah ada tetap dipakai. Untuk soal teks, keduanya disimpan sebagai `[]`. Tidak ada kolom baru, tidak ada migrasi Prisma yang diperlukan.
>
> **Backward compatibility:** Semua soal Matematika/Fisika yang sudah ada di database tidak tersentuh. Field `questionType` tidak dikirim dari form lama, sehingga API default ke jalur `"numeric"` (jalur existing). Toggle UI default-nya "Numerik". Tidak ada backfill data yang diperlukan.

**File:** `src/lib/template/variant-generator.ts`

**Perubahan:**
1. Export fungsi baru `generateStaticVariant(options: StaticTextOption[]): GeneratedVariant` yang menerima 4 opsi teks (A/B/C/D + kunci jawaban benar) dan menghasilkan 1 `ItemVariant` tanpa variable substitution
2. Fungsi ini membuat `renderedOptions` dari array teks statis, `renderedText` = template body, `variableValues = {}`, `tauMinSeconds` dihitung dari word count

**File:** `src/app/api/tests/[testId]/questions/route.ts`

**Perubahan:**
1. Terima field opsional `questionType: "numeric" | "text"` dan `textOptions: [{ key, text, isCorrect }]` di request body. **Field ini tidak disimpan ke database** — hanya digunakan sebagai routing signal di runtime.
2. Jika `questionType === "text"`: skip `parseTemplate()` dan `generateVariants()`, langsung panggil `generateStaticVariant(textOptions)`. Simpan `variableDefinitions: []`, `constraints: []`, `templateAst: { nodes: [], variables: [], constraints: [] }`.
3. Jika `questionType === "numeric"` **atau tidak ada** (default), gunakan jalur existing — ini memastikan soal lama yang tidak menyertakan field ini tetap diproses normal.

**File:** `src/app/dashboard/tests/[testId]/questions/page.tsx` (`QuestionFormPanel`)

**Perubahan:**
1. Tambah toggle `questionType` (Numerik / Teks) di atas form. **Default: "Numerik"** — form terbuka dalam mode numerik, identik dengan perilaku sebelumnya.
2. Jika Teks dipilih: sembunyikan seksi Variable/Constraint, tampilkan 4 field input teks untuk Opsi A, B, C, D dan radio button "Jawaban Benar"
3. Update `canSave` validation: untuk tipe Teks, validasi 4 opsi diisi dan satu jawaban benar dipilih
4. Kirim `{ templateText: bodyText, questionType: "text", textOptions: [...] }` ke API

```
// Pseudocode generateStaticVariant
FUNCTION generateStaticVariant(textOptions: StaticTextOption[])
  INPUT: array of 4 { key: "A"|"B"|"C"|"D", text: string, isCorrect: boolean }
  OUTPUT: GeneratedVariant

  correctOption = textOptions.find(o => o.isCorrect)
  renderedOptions = textOptions.map(o => ({ key: o.key, text: o.text, isCorrect: o.isCorrect }))
  RETURN {
    variableValues: {},
    renderedText: "", // akan diisi dari templateText di caller
    renderedOptions,
    correctOptionKey: correctOption.key,
    tauMinSeconds: 10 // default untuk soal teks
  }
END FUNCTION
```

---

### Bug 2 — VariantPreview Error & Empty State

**File:** `src/components/teacher/VariantPreview.tsx`

**Perubahan:**
1. Di blok `{!loading && error && ...}`: tambah tombol "Coba lagi" yang memanggil `loadVariants()`
2. Di blok `{!loading && !error && variants.length === 0 && ...}`: ubah pesan menjadi lebih informatif — "Belum ada varian untuk soal ini. Jika soal sudah disimpan, klik Refresh untuk memuat ulang. Jika belum, simpan ulang template untuk men-generate varian."

```tsx
// Error block fix
{!loading && error && (
  <div role="alert" className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
    <p>{error}</p>
    <button onClick={loadVariants} className="mt-2 text-sm text-red-600 underline">
      ↺ Coba lagi
    </button>
  </div>
)}
```

---

### Bug 3 — Hapus Paket Soal

**File:** `src/app/api/tests/[testId]/route.ts` — `DELETE` handler

**Perubahan:**
1. Sebelum delete, cek apakah ada `SessionPin` dengan `state: "ACTIVE"` terkait test ini
2. Jika ada sesi aktif: kembalikan HTTP 409 `{ code: 'ACTIVE_SESSION', message: 'Tidak bisa menghapus paket soal yang memiliki sesi aktif.' }`
3. Jika tidak ada sesi aktif: lakukan cascade delete dalam urutan benar menggunakan `prisma.$transaction`:
   - `prisma.response.deleteMany({ where: { session: { testId } } })`
   - `prisma.conceptDiagnosis.deleteMany({ where: { session: { testId } } })`
   - `prisma.remedialGroup.deleteMany({ where: { sessionPinId: { in: sessionIds } } })`
   - `prisma.autoWipeLog.deleteMany({ where: { sessionPinId: { in: sessionIds } } })`
   - `prisma.itemVariant.deleteMany({ where: { question: { testId } } })`
   - `prisma.sessionPin.deleteMany({ where: { testId } })`
   - `prisma.question.deleteMany({ where: { testId } })`
   - `prisma.test.delete({ where: { id: testId } })`

**File:** `src/app/dashboard/tests/page.tsx`

**Perubahan:**
1. Ubah item kartu menjadi komponen `TestCard` dengan state `deleteConfirm` dan `deleting`
2. Tambah tombol hapus dengan two-step confirm (identik dengan pola di `ClassCard`)
3. Saat konfirmasi: panggil `DELETE /api/tests/:testId`, jika sukses hapus dari state, jika gagal (409) tampilkan pesan error

---

### Bug 4 — CSV Upload untuk Soal

**File baru:** `src/app/api/tests/[testId]/questions/csv/route.ts`

**Perubahan:**
1. `POST` handler: terima `multipart/form-data` dengan field `file` (CSV)
2. Parse CSV: baca baris, validasi kolom wajib (`nomor`, `teks_soal`, `tipe_jawaban`, `opsi_a`, `opsi_b`, `opsi_c`, `opsi_d`, `jawaban_benar`)
3. Untuk setiap baris valid: buat `Question` dan `ItemVariant` dalam transaction
4. Jika `tipe_jawaban === "numerik"`: parse `templateText` dan generate varian
5. Jika `tipe_jawaban === "teks"`: buat static variant dari opsi A–D
6. Kembalikan `{ success: true, data: { created: N, errors: [...] } }`

**File baru:** `src/components/teacher/ImportQuestionsDialog.tsx`

**Perubahan:**
1. Dialog dengan dua tab: "Unduh Template" dan "Upload CSV"
2. Tombol download template CSV dengan header: `nomor,teks_soal,tipe_jawaban,opsi_a,opsi_b,opsi_c,opsi_d,jawaban_benar`
3. File input untuk CSV, preview tabel setelah file dipilih
4. Tombol "Konfirmasi Import" yang submit ke `/api/tests/[testId]/questions/csv`

**File:** `src/app/dashboard/tests/[testId]/questions/page.tsx`

**Perubahan:**
1. Tambah tombol "Import CSV" di header halaman
2. Render `<ImportQuestionsDialog>` ketika tombol diklik
3. Setelah import sukses: reload pertanyaan dengan `loadData()`

### Bug 5 — Hapus Kelas dengan Foreign Key

> **Keputusan desain — Block vs Cascade:**
>
> Pendekatan yang dipilih adalah **block deletion dengan pesan 409 yang jelas** (bukan cascade delete). Ini adalah pilihan yang aman dan konservatif: guru harus hapus semua siswa dari kelas terlebih dahulu sebelum bisa menghapus kelasnya.
>
> **Trade-off yang perlu disadari:** Untuk kelas dengan banyak siswa (misal 30+ orang), alur ini bisa tidak praktis karena guru harus menghapus siswa satu per satu atau via bulk delete. Ini adalah konsekuensi yang disengaja dari pilihan ini — keamanan data diutamakan di atas kenyamanan.
>
> **Opsi peningkatan di masa depan (tidak dikerjakan sekarang):** Tambahkan endpoint/dialog "Hapus kelas beserta semua siswanya sekaligus" dengan konfirmasi tegas dua langkah yang menyebutkan jumlah siswa yang akan terhapus. Ini bisa diimplementasikan sebagai item terpisah bila alur block terbukti terlalu tidak nyaman di production. Implementasinya akan menggunakan `prisma.$transaction([prisma.student.deleteMany({ where: { classId: id } }), prisma.class.delete({ where: { id } })])`.

**File:** `src/app/api/classes/[id]/route.ts` — `DELETE` handler

**Perubahan:**
1. Sebelum delete, hitung jumlah siswa: `const studentCount = await prisma.student.count({ where: { classId: id } })`
2. Jika `studentCount > 0`: kembalikan HTTP 409 dengan pesan deskriptif yang menyebutkan jumlah siswa
3. Tangkap Prisma error `P2003` di catch block sebagai fallback safety net

```typescript
// Fix pseudocode untuk DELETE /api/classes/:id
const studentCount = await prisma.student.count({ where: { classId: id } });
if (studentCount > 0) {
  return NextResponse.json(
    { success: false, error: {
        code: "CONSTRAINT_ERROR",
        message: `Tidak bisa menghapus kelas. Masih ada ${studentCount} siswa terdaftar.`
    }},
    { status: 409 }
  );
}
```

**File:** `src/app/dashboard/classes/page.tsx` (`ClassCard`)

**Perubahan:**
1. Tambah state `deleteError: string | null` di `ClassCard`
2. Di `handleDeleteClass()`: tambah `else` branch untuk `!r.success` yang set `deleteError` dan tampilkan alert
3. Tampilkan `deleteError` di bawah tombol hapus ketika terisi

---

### Bug 6 — Tombol Back dan Navigasi Login

**File:** `src/app/login/page.tsx`

**Perubahan:**
1. Ganti `window.location.href = destination` dengan `router.push(destination)` di `handleSubmit`
2. Variabel `router` sudah di-declare via `useRouter()` di baris atas — tinggal digunakan

```typescript
// Sebelum
window.location.href = destination;

// Sesudah  
router.push(destination);
```

**File:** `src/app/dashboard/tests/[testId]/questions/page.tsx`

**Perubahan:**
1. Di bagian header halaman (di atas `<h1>Question Builder</h1>`), tambah:
```tsx
<Link href="/dashboard/tests" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
  <ChevronLeft className="h-4 w-4" /> Kembali ke Paket Soal
</Link>
```
2. Import `Link` dari `next/link` dan `ChevronLeft` dari `lucide-react`

---

### Bug 7 — Race Condition Student Portal

**File:** `src/app/student/join/page.tsx`

**Perubahan di `handleSelectSubmit`:**
1. Setelah `signIn()` sukses, tambah wait + session confirmation (pola yang sama dengan guru login):
```typescript
await new Promise((resolve) => setTimeout(resolve, 300));
const session = await getSession();
if (!session) {
  // Retry sekali lagi
  await new Promise((resolve) => setTimeout(resolve, 500));
}
```
2. Import `getSession` dari `next-auth/react`

**Perubahan untuk network error retry di `handlePinSubmit`:**
1. Bungkus fetch dengan retry logic: maksimal 2 percobaan dengan jeda 500ms untuk error 5xx atau network error
2. Hanya retry untuk error yang bisa di-retry (5xx, network error) — tidak retry untuk 4xx (PIN salah, rate limited)

```
// Pseudocode retry logic
FOR attempt = 1 TO 3:
  TRY:
    response = await fetch("/api/student/join", ...)
    IF response.status >= 500 AND attempt < 3:
      WAIT 500ms
      CONTINUE
    BREAK
  CATCH networkError:
    IF attempt < 3:
      WAIT 500ms
      CONTINUE
    THROW
```

---

### Bug 8 — Filter classId di Student Join API

**File:** `src/app/api/student/join/route.ts`

**Perubahan:**
1. Di lookup `sessionPin`, tambah `include: { test: { select: { classId: true } } }`:
```typescript
const sessionPin = await prisma.sessionPin.findUnique({
  where: { pinCode },
  select: {
    id: true,
    schoolId: true,
    state: true,
    test: { select: { classId: true } }   // TAMBAH INI
  },
});
```

2. Di query `student.findMany`, tambah `classId` ke where clause:
```typescript
const students = await prisma.student.findMany({
  where: {
    schoolId: sessionPin.schoolId,
    classId: sessionPin.test.classId,   // TAMBAH INI
  },
  select: { id: true, anonymousLabel: true },
  orderBy: { anonymousLabel: "asc" },
});
```

3. Tidak ada perubahan schema — relasi sudah ada di Prisma schema (`Test.classId`)

---

## Testing Strategy

### Validation Approach

Strategi pengujian mengikuti dua fase untuk setiap bug: pertama, tulis exploratory tests pada kode yang BELUM di-fix untuk membuktikan bug ada (mendapatkan counterexample), lalu verifikasi fix bekerja dan behavior yang ada terjaga.

---

### Exploratory Bug Condition Checking

**Goal:** Dapatkan counterexample konkret yang membuktikan setiap bug sebelum implementasi fix.

**Bug 1 (Text Options):**
- Submit soal tanpa `# variables:` line → ekspektasi: error `UNDEFINED_VARIABLE`
- Coba POST `{ templateText: "Mana yang benar?", questionType: "text", textOptions: [...] }` → ekspektasi: 422 atau 500 karena field tidak dikenali

**Bug 2 (VariantPreview):**
- Render `<VariantPreview questionId="nonexistent-id" />` → API akan 404 → ekspektasi: error ditampilkan tanpa retry button

**Bug 3 (Delete Test):**
- Buat test dengan 1 question dan 1 session, panggil `DELETE /api/tests/:id` → ekspektasi: 500 `P2003` constraint error

**Bug 5 (Delete Class):**
- Buat kelas dengan 1 siswa, panggil `DELETE /api/classes/:id` → ekspektasi: 500 bukan 409

**Bug 6 (Navigation):**
- Login dan cek `window.history.length` — bertambah 2 alih-alih 1 saat menggunakan `window.location.href`

**Bug 7 (Race Condition):**
- Simulasi: mock `getSession()` mengembalikan `null` pada call pertama setelah `signIn()` → ekspektasi: quiz page gagal load

**Bug 8 (classId filter):**
- Setup: 2 kelas dengan siswa berbeda, PIN sesi kelas A → response daftar siswa berisi siswa dari kelas B → ekspektasi: bug terbukti

---

### Fix Checking

**Goal:** Verifikasi bahwa untuk semua input di mana bug condition terpenuhi, fungsi yang sudah di-fix menghasilkan perilaku yang benar.

```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedFunction(input)
  ASSERT expectedBehavior(result)
END FOR
```

**Per Bug:**

| Bug | Input (C(X)) | Expected (P) |
|-----|-------------|--------------|
| 1 | `questionType: "text"`, `textOptions: [4 items]` | HTTP 201, `variants.length >= 1`, `renderedOptions[0].text` adalah teks |
| 2 | API 500 response | Error div + retry button visible |
| 3 | DELETE test dengan questions+sessions | HTTP 200, semua child records terhapus |
| 4 | Upload CSV 5 baris valid | HTTP 201, `data.created === 5` |
| 5 | DELETE class dengan 3 siswa | HTTP 409, `code: "CONSTRAINT_ERROR"`, pesan menyebut "3 siswa" |
| 6a | Render QuestionsPage | Link "← Kembali ke Paket Soal" ada di DOM |
| 6b | Login sukses | `router.push` dipanggil, `window.location.href` tidak dipanggil |
| 7 | signIn sukses, getSession delay | `router.push` dipanggil setelah session confirmed |
| 8 | PIN valid kelas A (ada 3 kelas) | Response hanya siswa kelas A |

---

### Preservation Checking

**Goal:** Verifikasi bahwa untuk input di mana bug condition TIDAK terpenuhi, fungsi fixed menghasilkan hasil identik dengan sebelumnya.

```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalFunction(input) = fixedFunction(input)
END FOR
```

**Test Cases Preservation:**

1. **Numeric variant generation (Bug 1):** Soal dengan `a[2..50], b[2..50]` → varian numerik tetap di-generate, `renderedOptions[0].text` adalah angka
2. **VariantPreview success state (Bug 2):** Varian ada → tabel tetap render dengan semua kolom
3. **Test create/update still works (Bug 3):** POST dan PUT test tetap berhasil
4. **Manual question add (Bug 4):** `QuestionFormPanel` submit tetap memanggil `POST /api/tests/:testId/questions`
5. **Class delete no students (Bug 5):** DELETE kelas tanpa siswa tetap HTTP 200
6. **Sidebar navigation (Bug 6):** Klik sidebar item tetap navigasi
7. **Rate limiting still works (Bug 7):** Rate limit countdown tetap aktif
8. **Invalid PIN still rejected (Bug 8):** PIN salah tetap 401 generic error
9. **Correct student from same class accepted (Bug 8):** Siswa dari kelas yang sama tetap bisa autentikasi

---

### Unit Tests

**Bug 1:**
- `generateStaticVariant([{ key: "A", text: "...", isCorrect: true }, ...])` returns valid `GeneratedVariant`
- API route mendeteksi `questionType: "text"` dan skip `parseTemplate()`
- `QuestionFormPanel` validation: `canSave === false` ketika kurang dari 4 opsi diisi

**Bug 2:**
- `VariantPreview` dengan `error` state menampilkan retry button
- `VariantPreview` dengan empty array menampilkan pesan informatif

**Bug 3:**
- `DELETE /api/tests/:id` dengan sesi aktif → 409
- `DELETE /api/tests/:id` tanpa sesi aktif, dengan questions → cascade delete dalam transaction → 200

**Bug 4:**
- CSV parser menolak baris tanpa kolom wajib
- CSV parser mengembalikan structured error per baris yang invalid

**Bug 5:**
- `DELETE /api/classes/:id` dengan siswa → 409 dengan jumlah siswa
- `ClassCard` menampilkan `deleteError` dari response

**Bug 6:**
- `LoginForm` memanggil `router.push` bukan `window.location.href`

**Bug 7:**
- `handleSelectSubmit` menunggu session sebelum `router.push`
- Retry logic dipanggil untuk 500 error tapi tidak untuk 401

**Bug 8:**
- `POST /api/student/join` query filter menggunakan `classId: sessionPin.test.classId`
- Siswa dari kelas lain tidak muncul di response

---

### Property-Based Tests

**Bug 3 (Cascade Delete):**
- Generate arbitrary test dengan N questions (N ∈ [0, 10]) dan M sessions (M ∈ [0, 5]) dengan state `CLOSED` → DELETE selalu sukses dan database tidak memiliki orphaned records

**Bug 5 (FK Constraint):**
- Generate arbitrary kelas dengan S siswa (S ∈ [0, 30]) → jika S > 0, DELETE harus 409; jika S === 0, DELETE harus 200

**Bug 8 (classId Filter):**
- Generate arbitrary sekolah dengan K kelas (K ∈ [2, 10]) dan siswa terdistribusi → untuk setiap PIN sesi dari kelas X, response hanya berisi siswa dari kelas X

---

### Integration Tests

**Bug 3:**
- Flow: Buat test → tambah soal → hapus test → verifikasi semua questions dan variants terhapus

**Bug 4:**
- Flow: Buka halaman questions → klik Import CSV → upload template → konfirmasi → soal muncul di daftar

**Bug 7:**
- Flow: Siswa memasukkan PIN → pilih nama → klik Masuk → halaman quiz ter-load → session valid → bisa submit jawaban

**Bug 8:**
- Flow: Setup 2 kelas berbeda (A dan B) → aktivasi sesi untuk kelas A → siswa masukkan PIN → dropdown hanya tampilkan siswa kelas A → siswa kelas B tidak bisa memilih nama

---

## Migration Notes

Tidak ada perubahan database schema yang diperlukan untuk semua 8 bug. Semua fix berada di layer aplikasi (API routes + React components).

**Bug 1 — konfirmasi tidak ada migrasi:** `questionType` adalah request-body field saja, bukan kolom database. Model `Question` tidak berubah. Field `variableDefinitions` dan `constraints` yang sudah ada diisi `[]` untuk soal teks. Soal lama (format numerik) tidak perlu di-migrate — API default ke jalur numerik ketika `questionType` tidak dikirim.

**Bug 8 — konfirmasi tidak ada migrasi:** Relasi `Test.classId` sudah ada di `schema.prisma` dan dapat langsung dimanfaatkan. Tidak ada kolom baru.

**Prisma Error Codes yang Relevan:**
- `P2003`: Foreign key constraint failed on the field
- `P2025`: Record to delete does not exist

Tangkap keduanya dengan pattern:
```typescript
import { Prisma } from "@prisma/client";

if (err instanceof Prisma.PrismaClientKnownRequestError) {
  if (err.code === "P2003") {
    return NextResponse.json(
      { success: false, error: { code: "CONSTRAINT_ERROR", message: "..." } },
      { status: 409 }
    );
  }
}
```
