# Implementation Plan: RemediAide

## Overview

Rencana implementasi ini mengikuti pendekatan incremental 14 hari dalam empat fase:
**Fondasi → Fitur Inti → Analitik & Output → Quality & Testing**.
Setiap task membangun di atas task sebelumnya dan diakhiri dengan wiring komponen bersama.
Stack: Next.js 14+ App Router, TypeScript strict, PostgreSQL + Prisma, BullMQ + Redis,
SSE, pdf-lib, Vitest + fast-check + Playwright.

---

## Tasks

### Fase 1 — Fondasi

- [x] 1. Setup Proyek dan Infrastruktur Dasar
  - Inisialisasi proyek Next.js 14+ dengan App Router dan TypeScript strict mode
  - Konfigurasi Tailwind CSS dan install shadcn/ui dengan komponen dasar (Button, Input,
    Dialog, Slider, Badge, Toast)
  - Setup Prisma ORM dengan koneksi PostgreSQL; buat file `prisma/schema.prisma` awal
  - Konfigurasi environment variables: `DATABASE_URL`, `REDIS_URL`, `NEXTAUTH_SECRET`,
    `NEXTAUTH_URL`
  - Setup file `src/lib/db/client.ts` untuk Prisma Client singleton
  - Buat `src/types/index.ts` dengan re-export semua shared types
  - Konfigurasi path aliases TypeScript (`@/lib`, `@/components`, `@/types`)
  - _Requirements: 15.7_


- [x] 2. Database Schema dan Migrasi
  - Tulis Prisma schema lengkap di `prisma/schema.prisma` dengan semua models: `School`,
    `Teacher`, `Class`, `Student`, `Test`, `Question`, `ItemVariant`, `SessionPin`,
    `Response`, `ConceptDiagnosis`, `RemedialGroup`, `CalibrationConfig`, `AutoWipeLog`
  - Definisikan semua enums: `TeacherRole`, `SessionState`, `CalibrationStatus`,
    `PerItemStatus`, `FinalStatus`
  - Tambahkan unique constraints dan composite indexes sesuai ERD
  - Jalankan `prisma migrate dev` untuk membuat migrasi awal
  - Implementasikan Prisma Client Extension di `src/lib/db/tenant-extension.ts` yang
    menyuntikkan filter `school_id` via `AsyncLocalStorage` untuk models:
    Teacher, Class, Student, Test, Question, Response, ConceptDiagnosis
  - Buat `src/lib/db/context.ts` untuk `AsyncLocalStorage` tenant context
  - Buat seed file `prisma/seed.ts` dengan data demo satu sekolah, satu guru, satu kelas
  - _Requirements: 3.6, 15.7_


- [x] 3. Autentikasi dan Otorisasi Berbasis Peran
  - Setup next-auth v5 di `src/auth.ts` dengan dua providers:
    (a) CredentialsProvider untuk Guru/Kepala Sekolah (email + password bcrypt),
    (b) CredentialsProvider untuk Siswa (PIN sesi sementara)
  - Konfigurasi session token HTTP-only cookie dengan `SameSite=Strict`
  - Buat JWT callback yang menyertakan `school_id` dan `role` ke dalam token
  - Implementasikan middleware RBAC di `src/middleware.ts` yang memproteksi rute:
    `/dashboard/**` (TEACHER/PRINCIPAL), `/student/**` (STUDENT/public PIN)
  - Buat route handler `src/app/api/auth/[...nextauth]/route.ts`
  - Buat route handler `POST /api/student/join` untuk autentikasi PIN sesi
  - Implementasikan rate-limiting PIN: exponential backoff 1s/2s/4s setelah 3 gagal
  - Buat helper `src/lib/auth/session.ts` untuk `getSession`, `requireRole`
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 3.8_

- [x] 4. Diagnostic Engine Core
  - Buat `src/lib/diagnostic/engine.ts` dengan interface dan implementasi:
    `calculateTauMin(wordCount)`, `countWords(text)`, `calculateIntegrityIndex(input)`,
    `classifyPerItem(input)`, `aggregateMajorityVoting(results)`
  - Implementasikan formula τ_min: `Math.ceil(L_i / 2.5)` (ceiling ke detik)
  - Implementasikan 4 cabang I_i asimetris sesuai matriks (benar/salah × CRI≥3/<3)
  - Implementasikan BELOW_THRESHOLD check: jika `responseTimeMs < tauMinMs × 1000`
    maka `I_i = 0.0` dan status `INVALID`
  - Implementasikan Majority Voting dengan Precedency Rule:
    MISKONSEPSI > LUCKY_GUESS > TIDAK_PAHAM > PAHAM_KONSEP
  - Tambahkan `auditTrail` pada setiap `DiagnosisResult`
  - Semua fungsi HARUS pure (tanpa side effects, tanpa DB call)
  - Ekspor tipe: `CognitiveStatus`, `ResponseInput`, `DiagnosisResult`, `AggregationResult`
  - _Requirements: 4.1, 4.2, 4.3, 4.5, 5.1, 5.2, 5.4, 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4_


  - [x]* 4.1 Tulis unit tests DiagnosticEngine
    - Test semua 4 cabang I_i, BELOW_THRESHOLD, setiap kombinasi `classifyPerItem`
    - Test majority voting: semua skenario 3-butir (konsensus, split 2-1, tie 3-way)
    - _Requirements: 4.1, 5.1, 6.1, 7.1_

  - [x]* 4.2 Tulis property test: Property 1 — Deterministic Classification Idempotence
    - **Property 1: Deterministic Classification Idempotence**
    - **Validates: Requirements 6.3**

  - [x]* 4.3 Tulis property test: Property 2 — I_i Bounds Invariant
    - **Property 2: I_i Bounds Invariant**
    - **Validates: Requirements 5.4**

  - [x]* 4.4 Tulis property test: Property 3 — BELOW_THRESHOLD Always Produces I_i = 0.0
    - **Property 3: BELOW_THRESHOLD Always Produces I_i = 0.0**
    - **Validates: Requirements 5.2**

  - [x]* 4.5 Tulis property test: Property 4 — INVALID Status for BELOW_THRESHOLD
    - **Property 4: INVALID Status for BELOW_THRESHOLD Responses**
    - **Validates: Requirements 6.2**

  - [x]* 4.6 Tulis property test: Property 11 — τ_min Ceiling Invariant
    - **Property 11: τ_min Ceiling Invariant**
    - **Validates: Requirements 4.1, 4.3**

  - [x]* 4.7 Tulis property test: Property 6 — Majority Voting Always Returns Single Status
    - **Property 6: Majority Voting Always Returns Single Status**
    - **Validates: Requirements 7.1, 7.2, 7.3**

  - [x]* 4.8 Tulis property test: Property 7 — Precedency Rule Tie-Breaking Determinism
    - **Property 7: Precedency Rule Tie-Breaking Determinism**
    - **Validates: Requirements 7.3**

- [x] 5. Checkpoint Fase 1 — Fondasi Stabil
  - Pastikan semua tests pass (`vitest run`), Prisma schema valid, next-auth terkonfigurasi
  - Verifikasi tenant extension menyuntikkan `school_id` pada query
  - Tanyakan kepada user jika ada pertanyaan sebelum melanjutkan ke Fase 2


---

### Fase 2 — Fitur Inti

- [x] 6. Template Parser & Isomorphic Item Pool
  - Buat `src/lib/template/types.ts` dengan tipe: `ASTNode`, `TemplateAST`,
    `VariableDefinition`, `ConstraintExpression`, `ITemplateParser`,
    `ITemplatePrettyPrinter`, `ITemplateRenderer`
  - Implementasikan `src/lib/template/parser.ts`:
    parsing regex untuk `{{placeholder}}`, validasi placeholder vs variable definitions,
    deteksi injection (reject HTML tags, script tags), return `Result<AST, ParseError>`
  - Implementasikan `src/lib/template/pretty-printer.ts`:
    print AST kembali ke string format standar
  - Implementasikan `src/lib/template/renderer.ts`:
    substitute placeholder dengan nilai numerik konkret
  - Implementasikan `src/lib/template/variant-generator.ts`:
    generate minimal 5 ItemVariant yang memenuhi semua constraints menggunakan
    sampling atau constraint solver sederhana
  - Simpan hasil render dan metadata variant ke database (tabel `ItemVariant`)
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6, 17.1, 17.2, 17.3, 17.5, 18.1_

  - [x]* 6.1 Tulis unit tests Template Parser
    - Test parsing valid template, placeholder tidak terdefinisi, injection rejection
    - _Requirements: 17.2, 17.5_

  - [x]* 6.2 Tulis property test: Property 5 — Template Parser Round-Trip
    - **Property 5: Template Parser Round-Trip**
    - **Validates: Requirements 17.4, 18.4**

  - [x]* 6.3 Tulis property test: Property 8 — ItemVariant Constraint Satisfaction
    - **Property 8: ItemVariant Constraint Satisfaction**
    - **Validates: Requirements 10.2, 10.3**

  - [x]* 6.4 Tulis property test: Property 12 — Invalid Template Rejection
    - **Property 12: Invalid Template Rejection with Descriptive Error**
    - **Validates: Requirements 17.2, 17.5**


- [x] 7. Session & Exit Ticket Lifecycle
  - Buat route handlers session API:
    `GET /api/sessions`, `POST /api/sessions`, `GET /api/sessions/:id`,
    `POST /api/sessions/:id/activate`, `POST /api/sessions/:id/close`
  - Implementasikan state machine LOCKED→ACTIVE→CLOSED dengan validasi transisi
    satu arah (reject reverse transitions)
  - Pada `POST /api/sessions/:id/activate`: set `started_at = now()`,
    enqueue BullMQ job `auto-close-session` dengan delay 900.000ms
  - Setup BullMQ worker di `src/workers/auto-close.ts`:
    job `auto-close-session` → UPDATE state=CLOSED, enqueue `run-diagnosis`
  - Buat helper `src/lib/session/state-machine.ts` untuk validasi transisi
  - Buat route `GET /api/sessions/:id/quiz` (STUDENT_PIN): kembalikan ItemVariant
    yang diacak order opsinya untuk siswa tersebut, tanpa correct_option_key
  - Buat route `POST /api/responses`: validasi server-side (a) item sesuai siswa,
    (b) session ACTIVE, (c) tidak duplikat; simpan response dengan I_i terkalkulasi
  - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 1.7, 16.1, 16.2, 16.3, 16.4_

  - [x]* 7.1 Tulis unit tests state machine transitions
    - Test semua 6 kombinasi transisi (valid dan invalid)
    - _Requirements: 1.7_

  - [x]* 7.2 Tulis property test: Property 9 — State Machine Irreversibility
    - **Property 9: State Machine Irreversibility**
    - **Validates: Requirements 1.7**

  - [x]* 7.3 Tulis integration test: session lifecycle
    - Test LOCKED→ACTIVE→CLOSED via API dengan BullMQ mock
    - Test HTTP 409 pada duplicate response submission
    - _Requirements: 1.1, 1.4, 1.5, 16.3_


- [x] 8. Portal Siswa PWA
  - Buat halaman `src/app/student/join/page.tsx`: form input PIN dengan rate-limit
    feedback (disabled + countdown setelah 3 kegagalan)
  - Buat halaman `src/app/student/quiz/[sessionId]/page.tsx`: tampilkan soal satu per
    satu dengan pilihan jawaban dan MetacognitiveSlider CRI
  - Implementasikan komponen `src/components/student/MetacognitiveSlider.tsx`:
    slider integer 0–5 dengan deskripsi verbal per nilai, accessible (aria-label,
    keyboard navigation)
  - Buat halaman `src/app/student/quiz/[sessionId]/complete/page.tsx`: halaman
    konfirmasi sukses tanpa mengekspos status kognitif
  - Simpan progress ke `sessionStorage` (soal terakhir yang dikerjakan)
  - Konfigurasi `next-pwa` (Workbox) di `next.config.js`:
    CacheFirst untuk static assets, NetworkFirst untuk quiz API,
    Background Sync untuk POST /api/responses via IndexedDB
  - Buat `public/manifest.json` dan ikon PWA 192px / 512px
  - Validasi viewport minimum 320px, WCAG 2.1 AA contrast untuk semua elemen
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 15.4, 15.5_


- [x] 9. Portal Guru — Manajemen Kelas & Question Builder
  - Buat layout `src/app/dashboard/layout.tsx` dengan navigasi sidebar
    (Kelas, Sesi, Soal, Hasil)
  - Buat halaman manajemen kelas `src/app/dashboard/classes/page.tsx`:
    CRUD kelas, CRUD siswa (anonymousLabel), import CSV siswa
  - Buat komponen `src/components/teacher/ImportCsvDialog.tsx`:
    upload CSV, parse, preview, konfirmasi import batch siswa
  - Buat halaman Question Builder `src/app/dashboard/tests/[testId]/questions/page.tsx`:
    form template soal dengan placeholder `{{var}}`, definisi rentang variabel,
    input constraint expressions (misalnya `a < b`)
  - Buat komponen `src/components/teacher/VariantPreview.tsx`:
    tampilkan render semua ItemVariant dari template, dengan warning kuning
    jika semua variant berstatus `expert_estimated`
  - Implementasikan route handlers:
    `GET/POST /api/tests/:testId/questions`,
    `PUT /api/questions/:id`,
    `GET /api/questions/:id/variants`,
    `PUT /api/variants/:id/calibration`
  - _Requirements: 10.1, 10.2, 10.4, 10.5, 10.6, 10.7_

- [x] 10. Real-Time Heatmap (SSE + Fallback Polling)
  - Implementasikan `src/lib/sse/manager.ts` dengan `ISSEManager`:
    `subscribe`, `unsubscribe`, `broadcast`, `getLastState`
  - Gunakan Redis PubSub (`ioredis`) untuk channel `heatmap:{sessionId}`:
    publish saat siswa submit, subscribe di SSE endpoint
  - Buat route handler `GET /api/sse/heatmap/:sessionId`:
    `Content-Type: text/event-stream`, kirim state terakhir dari Redis saat koneksi
    dibuka, stream events berikutnya
  - Buat komponen `src/components/teacher/LiveHeatmap.tsx`:
    grid ≤50 siswa per viewport 1024px, color-code: abu (belum), kuning (sebagian),
    hijau (semua), merah (INSUFFICIENT_DATA post-CLOSED)
  - Implementasikan reconnect exponential backoff di client (1s→2s→4s→max 30s)
  - Implementasikan fallback polling `GET /api/sessions/:id/heatmap` setiap 5 detik
    jika SSE tidak tersedia
  - Buat halaman `src/app/dashboard/sessions/[id]/live/page.tsx` dengan LiveHeatmap
    dan countdown timer yang update setiap detik
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_


- [x] 11. Checkpoint Fase 2 — Fitur Inti Terwiring
  - Pastikan semua tests pass, SSE endpoint terhubung ke Redis, BullMQ worker berjalan
  - Verifikasi alur end-to-end: Guru buat sesi → Siswa join PIN → submit soal → heatmap update
  - Tanyakan kepada user jika ada pertanyaan sebelum melanjutkan ke Fase 3

---

### Fase 3 — Analitik & Output

- [x] 12. Diagnosis Engine Pipeline & Remedial Groups
  - Buat BullMQ worker `src/workers/run-diagnosis.ts`:
    baca semua responses per sesi, panggil `DiagnosticEngine.classifyPerItem` per respons,
    lalu `aggregateMajorityVoting` per (student, question), simpan `ConceptDiagnosis`
  - Implementasikan `computeConceptDiagnosis(sessionId)`:
    fungsi orkestrasi yang memanggil engine dan batch-upsert ke database
  - Implementasikan `generateRemedialGroups(sessionId)`:
    kelompokkan siswa berdasarkan S_final menjadi 4 kelompok + grup INSUFFICIENT_DATA
    dengan preskripsi hardcoded per kelompok kognitif
  - Buat route handlers:
    `GET /api/sessions/:id/diagnoses`,
    `GET /api/sessions/:id/groups`,
    `POST /api/sessions/:id/groups/:groupId/override`
  - Implementasikan halaman `src/app/dashboard/sessions/[id]/results/page.tsx`:
    ringkasan kelas, tabel matriks (siswa × butir soal), filter, tombol
    "Generate Kelompok Remedial", ekspor CSV
  - Implementasikan ekspor CSV via `GET /api/sessions/:id/export/csv`
  - _Requirements: 7.5, 7.6, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 11.1, 11.2, 11.3, 11.4, 11.5_


- [x] 13. PDF Generator LKPD-KK
  - Buat `src/lib/pdf/lkpd-generator.ts` dengan fungsi `generateLKPDGroup`:
    gunakan `pdf-lib` untuk membuat PDF ukuran A4, margin 2cm (≈56.7pt),
    header berisi metadata sesi (ID, tanggal, nama guru, topik),
    body berisi daftar anonymousLabel, preskripsi strategi, soal latihan isomorfik
  - Integrasikan library `qrcode` untuk generate QR code sebagai data URL PNG,
    embed ke setiap halaman PDF; content QR: URL sesi aktif
  - Buat BullMQ worker `src/workers/generate-pdf.ts`:
    ambil data ConceptDiagnosis + RemedialGroup → render PDF per kelompok →
    simpan file → return URL download
  - Buat route handlers:
    `POST /api/sessions/:id/pdf` (enqueue generate-pdf job),
    `GET /api/sessions/:id/pdf/:jobId/status` (poll status),
    `GET /api/sessions/:id/pdf/:fileId/download` (download file)
  - Buat komponen `src/components/teacher/PDFDownloadPanel.tsx`:
    tombol generate, loading state dengan progress, link download per kelompok
  - Error handling: HTTP 500 dengan pesan user-friendly, log ke server tanpa
    stack trace di response
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_


- [x] 14. Auto-Wipe & Privacy
  - Buat route handler `POST /api/sessions/:id/wipe/preview`:
    hitung dan kembalikan ringkasan jumlah records yang akan dihapus
    (responses per siswa, per butir) tanpa melakukan penghapusan
  - Buat route handler `POST /api/sessions/:id/wipe/confirm`:
    (a) validasi input konfirmasi teks "HAPUS DATA RESPONS",
    (b) jalankan `executeAutoWipe` dalam satu transaksi Prisma,
    (c) simpan `AutoWipeLog` setelah sukses
  - Implementasikan `executeAutoWipe(sessionId, teacherId)` di
    `src/lib/privacy/auto-wipe.ts`:
    - DELETE records Response untuk session
    - pertahankan ConceptDiagnosis dan RemedialGroup
    - ROLLBACK jika ada error (Prisma `$transaction`)
    - catat log: timestamp, sessionId, teacherId, jumlah records dihapus
  - Buat komponen `src/components/teacher/AutoWipeDialog.tsx`:
    step 1 — tampilkan ringkasan + input teks konfirmasi,
    step 2 — modal konfirmasi akhir sebelum eksekusi
  - Buat halaman `src/app/dashboard/sessions/[id]/wipe/page.tsx`
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_

  - [x]* 14.1 Tulis integration test: Auto-Wipe
    - Verifikasi responses terhapus, ConceptDiagnosis tetap ada post-wipe
    - Test rollback transaksi jika error di tengah eksekusi
    - _Requirements: 13.3, 13.6, 13.7_

- [x] 15. Portal Kepala Sekolah
  - Buat layout dan halaman `src/app/principal/page.tsx`:
    dashboard agregat sekolah — rata-rata % Paham Konsep per kelas,
    jumlah sesi per bulan, tren antar siklus
  - Buat komponen `src/components/principal/StackedBarChart.tsx`:
    perbandingan distribusi status kognitif per kelas menggunakan Recharts
  - Implementasikan filter tanggal (minggu/bulan/semester) dengan update <3 detik
  - Buat route handlers:
    `GET /api/principal/overview` (agregat sekolah),
    `GET /api/principal/classes` (perbandingan per kelas)
  - Pastikan response hanya berisi data agregat — TANPA anonymousLabel atau
    data respons individual
  - Log akses lintas sekolah ke audit log jika `school_id` berbeda (HTTP 403)
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

- [x] 16. Checkpoint Fase 3 — Analitik & Output Selesai
  - Pastikan pipeline diagnosis berjalan, PDF dapat di-generate, auto-wipe berfungsi
  - Verifikasi isolasi data kepala sekolah (tidak ada kebocoran antar tenant)
  - Tanyakan kepada user jika ada pertanyaan sebelum melanjutkan ke Fase 4


---

### Fase 4 — Quality & Testing

- [x] 17. Unit Tests + Property-Based Tests (Vitest + fast-check)
  - Setup Vitest di `vitest.config.ts` dengan coverage provider v8, path aliases
  - Implementasikan semua 12 property-based tests yang belum ditulis di task-task
    sebelumnya, pastikan setiap test menggunakan `numRuns: 100`
  - Pastikan tag setiap property test:
    `// Feature: remediaide, Property N: <property_text>`
  - Remaining properties untuk di-cover di task ini:
    - Property 10: Tenant Isolation in Query Results
      (`∀ query Q dengan school_id=X, ∀ record r ∈ result: r.school_id === X`)
      **Validates: Requirements 3.6, 14.3**
  - Tambahkan unit tests komponen yang belum ter-cover:
    `SSEManager`, `PDFGenerator` (mock pdf-lib), `AutoWipe` fungsi murni
  - Target: 100% branch coverage pada `DiagnosticEngine`, `TemplateParser`,
    `MajorityVoting` verifiable dengan `vitest run --coverage`
  - _Requirements: 4.1–4.5, 5.1–5.4, 6.1–6.3, 7.1–7.4_

  - [x]* 17.1 Tulis property test: Property 10 — Tenant Isolation
    - **Property 10: Tenant Isolation in Query Results**
    - **Validates: Requirements 3.6, 14.3**


- [x] 18. Integration & E2E Tests
  - Setup Vitest integration tests menggunakan PostgreSQL test instance (docker-compose
    test profile) atau in-memory test database
  - Tulis `tests/integration/session-lifecycle.test.ts`:
    LOCKED→ACTIVE→CLOSED via API, BullMQ job mock, HTTP 409 pada state CLOSED
  - Tulis `tests/integration/tenant-isolation.test.ts`:
    buat dua sekolah, pastikan query school A tidak mengembalikan data school B
  - Tulis `tests/integration/auto-wipe.test.ts`:
    responses terhapus setelah wipe, ConceptDiagnosis tetap, rollback on error
  - Tulis `tests/integration/response-submission.test.ts`:
    duplicate submission HTTP 409, item_id validation, session state validation
  - Setup Playwright di `playwright.config.ts` dengan base URL, test timeout
  - Tulis `tests/e2e/student-quiz.spec.ts`:
    join PIN → jawab semua soal → halaman konfirmasi
  - Tulis `tests/e2e/teacher-session.spec.ts`:
    buat sesi → aktifkan → lihat Live Heatmap → tutup sesi manual
  - Tulis `tests/e2e/remedial-pdf.spec.ts`:
    buka hasil → generate kelompok → request PDF → download
  - Tulis `tests/e2e/principal-dashboard.spec.ts`:
    akses agregat sekolah → filter tanggal → verify no individual data
  - _Requirements: 1.1–1.7, 3.1–3.8, 9.1–9.7, 12.1–12.6, 13.1–13.7, 14.1–14.5_


- [x] 19. Performance, PWA & Accessibility
  - Tulis load test script `tests/load/response-submission.js` (k6 atau artillery):
    300 concurrent virtual users, endpoint `POST /api/responses`,
    target P95 latency ≤ 200ms; jalankan dan buat laporan
  - Audit Lighthouse PWA: buka halaman student di browser, jalankan Lighthouse,
    pastikan semua PWA criteria pass (HTTPS, manifest valid, service worker aktif)
  - Audit aksesibilitas dengan `@axe-core/playwright` di E2E tests:
    scan semua halaman utama (join, quiz, dashboard guru, principal),
    zero critical violations wajib; verifikasi contrast ratio ≥ 4.5:1
  - Tambahkan `aria-label` dan `role` yang hilang pada: MetacognitiveSlider,
    LiveHeatmap cells, dialog konfirmasi Auto-Wipe
  - Verifikasi responsive pada viewport 320px (mobile) dan 1024px (desktop)
  - Pastikan `manifest.json` valid dan ikon tersedia (192px, 512px)
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 2.7_

- [x] 20. Checkpoint Final — Semua Tests Pass
  - Jalankan `vitest run --coverage` dan pastikan coverage target terpenuhi
  - Jalankan semua E2E tests Playwright
  - Verifikasi build produksi berhasil: `next build`
  - Pastikan semua 12 correctness properties diimplementasikan dan pass
  - Tanyakan kepada user jika ada pertanyaan atau penyesuaian akhir yang diperlukan


---

## Notes

- Task yang ditandai `*` adalah opsional (testing) dan dapat dilewati untuk MVP lebih cepat
- Semua property-based tests menggunakan `numRuns: 100` (minimum per design)
- Tag setiap property test: `// Feature: remediaide, Property N: <deskripsi>`
- Setiap task mereferensikan requirement spesifik dari requirements.md
- Checkpoints memastikan validasi inkremental sebelum melanjutkan ke fase berikutnya
- Urutan task menjamin tidak ada kode yang "tergantung" — setiap komponen terwired
  sebelum task berikutnya dimulai

### Ringkasan 12 Correctness Properties

| # | Judul | Diimplementasikan di Task |
|---|-------|--------------------------|
| 1 | Deterministic Classification Idempotence | 4.2 |
| 2 | I_i Bounds Invariant | 4.3 |
| 3 | BELOW_THRESHOLD Always Produces I_i = 0.0 | 4.4 |
| 4 | INVALID Status for BELOW_THRESHOLD Responses | 4.5 |
| 5 | Template Parser Round-Trip | 6.2 |
| 6 | Majority Voting Always Returns Single Status | 4.7 |
| 7 | Precedency Rule Tie-Breaking Determinism | 4.8 |
| 8 | ItemVariant Constraint Satisfaction | 6.3 |
| 9 | State Machine Irreversibility | 7.2 |
| 10 | Tenant Isolation in Query Results | 17.1 |
| 11 | τ_min Ceiling Invariant | 4.6 |
| 12 | Invalid Template Rejection with Descriptive Error | 6.4 |

---

## Task Dependency Graph

```json
{
  "waves": [
    {
      "name": "Fase 1 — Fondasi",
      "tasks": [
        "1. Setup Proyek dan Infrastruktur Dasar",
        "2. Database Schema dan Migrasi",
        "3. Autentikasi dan Otorisasi Berbasis Peran",
        "4. Diagnostic Engine Core",
        "5. Checkpoint Fase 1 — Fondasi Stabil"
      ]
    },
    {
      "name": "Fase 2 — Fitur Inti",
      "tasks": [
        "6. Template Parser & Isomorphic Item Pool",
        "7. Session & Exit Ticket Lifecycle",
        "8. Portal Siswa PWA",
        "9. Portal Guru — Manajemen Kelas & Question Builder",
        "10. Real-Time Heatmap (SSE + Fallback Polling)",
        "11. Checkpoint Fase 2 — Fitur Inti Terwiring"
      ]
    },
    {
      "name": "Fase 3 — Analitik & Output",
      "tasks": [
        "12. Diagnosis Engine Pipeline & Remedial Groups",
        "13. PDF Generator LKPD-KK",
        "14. Auto-Wipe & Privacy",
        "15. Portal Kepala Sekolah",
        "16. Checkpoint Fase 3 — Analitik & Output Selesai"
      ]
    },
    {
      "name": "Fase 4 — Quality & Testing",
      "tasks": [
        "17. Unit Tests + Property-Based Tests (Vitest + fast-check)",
        "18. Integration & E2E Tests",
        "19. Performance, PWA & Accessibility",
        "20. Checkpoint Final — Semua Tests Pass"
      ]
    }
  ]
}
```
