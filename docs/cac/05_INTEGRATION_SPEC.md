# 05 — Spesifikasi Integrasi Web (fase P6)

Prinsip:
1. Branch `feat/ml-integration`. Aplikasi v1 harus tetap jalan tanpa layanan ML. Fallback-nya selalu `engine.ts`.
2. Hasil ML **tidak menggantikan** `ConceptDiagnosis` (B0). Hasil ML disimpan di tabel baru dan ditampilkan
   berdampingan, berlabel "Rekomendasi AI". Keputusan tetap di tangan guru.
3. `npm test` lama wajib lulus. Setiap fitur baru punya tes Vitest, dan API ML punya tes pytest.

## 1. Menjalankan aplikasi lokal (T60)
- Buat `.env.example` (DATABASE_URL, REDIS_URL opsional, AUTH_SECRET, AUTH_URL, ML_SERVICE_URL,
  ML_TIMEOUT_MS=4000, RESEARCH_EXPORT_SALT) dan `.env.local` untuk dev (jangan di-commit).
- PostgreSQL di Mac: Docker (`docker run -d --name remediaide-pg -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:15`)
  atau `brew install postgresql@15`. Jika keduanya belum ada → minta M7.
- `npm ci && npx prisma migrate dev --name init && npm run prisma:seed && npm run dev`.
  Catat akun seed di PROGRESS.md (jangan menulis password produksi).
- Redis tidak wajib: worker BullMQ menjadi no-op tanpa REDIS_URL. Pastikan diagnosis tetap terpicu dan dokumentasikan caranya.

## 2. Perubahan Prisma (T61) — satu migrasi `ml_integration`
```prisma
// Question: tandai soal kunci yang meminta alasan
requireExplanation Boolean @default(false) @map("require_explanation")
mapQuestionId      Int?    @map("map_question_id")   // ID soal MAP asli untuk instrumen pilot

// Response: alasan satu kalimat (opsional)
explanation        String? @map("explanation")       // maks 280 karakter, divalidasi di API

// SessionPin: persetujuan riset (default false = tidak boleh diekspor)
researchConsent    Boolean @default(false) @map("research_consent")

model MlDiagnosis {
  id                  String   @id @default(uuid())
  sessionPinId        String   @map("session_pin_id")
  studentId           String   @map("student_id")
  questionId          String?  @map("question_id")     // null = ringkasan per siswa
  schoolId            String   @map("school_id")
  quadrantProbs       Json     @map("quadrant_probs")  // {PAHAM_KONSEP:..., LUCKY_GUESS:..., MISKONSEPSI:..., TIDAK_PAHAM:...}
  quadrant            String
  masteryProb         Float    @map("mastery_prob")
  misconceptionLabel  String?  @map("misconception_label")
  misconceptionProb   Float?   @map("misconception_prob")
  hiddenMisconception Boolean  @default(false) @map("hidden_misconception")
  predictionSet       Json     @map("prediction_set")  // himpunan conformal
  deferred            Boolean  @default(false)
  reasons             Json                              // [{text, impact}] maks 3, Bahasa Indonesia
  ruleStatus          String   @map("rule_status")      // label B0 untuk perbandingan
  modelVersion        String   @map("model_version")
  createdAt           DateTime @default(now()) @map("created_at")
  @@unique([sessionPinId, studentId, questionId])
  @@map("ml_diagnoses")
}

model MlFeedback {   // koreksi guru = label baru
  id            String   @id @default(uuid())
  mlDiagnosisId String   @map("ml_diagnosis_id")
  schoolId      String   @map("school_id")
  teacherId     String   @map("teacher_id")
  action        String   // ACCEPT | CHANGE_QUADRANT | CHANGE_MISCONCEPTION | NOT_SURE
  newValue      String?  @map("new_value")
  createdAt     DateTime @default(now()) @map("created_at")
  @@map("ml_feedback")
}
```
Relasi dan tenant isolation mengikuti pola yang ada (`schoolId` + `src/lib/db/tenant-extension.ts`).
Auto-wipe (`src/lib/privacy/auto-wipe.ts`) menghapus semua `Response` termasuk kolom `explanation`. Kolom
ini ada di tabel yang sama, jadi otomatis ikut terhapus. Tambahkan tes yang membuktikannya. `MlDiagnosis`
diperlakukan seperti `ConceptDiagnosis`: ringkasan non-granular yang dipertahankan untuk laporan. Karena
itu, MlDiagnosis **tidak boleh menyimpan teks alasan siswa**; field `reasons` hanya berisi kalimat buatan
sistem. Ekspor riset (§7) wajib dilakukan **sebelum** auto-wipe. Perbarui komentar dokumentasi di auto-wipe.ts.

## 3. Portal siswa (T62)
- Di `src/app/student/quiz/[sessionId]/page.tsx`, setelah slider CRI dan hanya pada soal
  `requireExplanation=true`, tampilkan textarea "Tulis alasanmu dalam satu kalimat" (opsional, maks 280).
- `POST /api/responses` menerima `explanation?: string` (trim, maks 280, buang karakter kontrol). Tes untuk
  validasinya ditambahkan.
- Dasbor guru: toggle "Minta alasan" per soal di halaman soal (`dashboard/tests/[testId]/questions`).

## 4. Layanan ML — `ml/service/` (T63)
FastAPI + uvicorn. Memuat artefak dari `ml/models/`. Tidak menyimpan data siswa dan tidak me-log teks alasan.

`GET /health` → `{status, model_version, loaded: {l1, l2, l3}}`

`POST /v1/diagnose`
```json
{
  "session_id": "uuid",
  "items": [{"question_id": "uuid", "kc_id": "string|null", "correct_option": "A", "map_question_id": 31772,
             "question_text": "..."}],
  "responses": [{"student_key": "opaque", "question_id": "uuid", "chosen_option": "B", "is_correct": false,
                 "cri": 4, "response_time_ms": 7300, "tau_min_ms": 4000, "explanation": "...",
                 "answered_at": "2026-11-30T08:12:00Z"}]
}
```
Respons:
```json
{
  "model_version": "rmd2-2026.11.25",
  "students": [{
    "student_key": "opaque",
    "per_question": [{"question_id": "uuid", "quadrant_probs": {"PAHAM_KONSEP": 0.1, "LUCKY_GUESS": 0.1, "MISKONSEPSI": 0.7, "TIDAK_PAHAM": 0.1},
                      "quadrant": "MISKONSEPSI", "prediction_set": ["MISKONSEPSI"], "rule_status": "MISKONSEPSI",
                      "misconception": {"label": "Longer_is_bigger", "label_id": "Angka lebih panjang dianggap lebih besar", "prob": 0.82},
                      "hidden_misconception": false, "rapid_guess": false}],
    "summary": {"quadrant": "MISKONSEPSI", "mastery_prob": 0.31, "deferred": false,
                "reasons": [{"text": "Salah 3× di topik desimal dengan keyakinan tinggi", "impact": 0.42}]}
  }],
  "latency_ms": 120
}
```
Aturan: soal tanpa `map_question_id` atau tanpa alasan → L2 dilewati, L1 + L3 tetap jalan. Input yang tidak
lengkap → respons 422 dengan pesan jelas. Tes pytest: skema, latensi < 2 detik untuk 40 siswa × 15 soal di
CPU, deterministik, dan fallback saat model L2 tidak dimuat. Sertakan Dockerfile.

## 5. Pipeline diagnosis (T64)
Di `src/lib/diagnosis/compute.ts`, setelah upsert ConceptDiagnosis (B0) dan pembuatan kelompok:
1. Jika `ML_SERVICE_URL` ada, kirim payload ke `/v1/diagnose` dengan `AbortController` (ML_TIMEOUT_MS).
2. Sukses → upsert MlDiagnosis per (siswa, soal) dan ringkasan per siswa. Gagal/timeout → `console.warn` lalu
   lanjut. Tidak boleh ada exception yang menggagalkan diagnosis B0.
3. `student_key` = HMAC(studentId, RESEARCH_EXPORT_SALT). ID asli tidak dikirim.
4. Tes Vitest dengan fetch di-mock: sukses, timeout, 500, dan respons rusak. B0 tetap tersimpan di semua kasus.

## 6. Dasbor hasil (T65)
Di `src/app/dashboard/sessions/[id]/results/ResultsClient.tsx` (dan endpoint API baru
`GET /api/sessions/[id]/ml`):
- Toggle **"Mode AI"**. Kolom tambahan: kuadran AI + probabilitas (bar kecil), nama miskonsepsi (Bahasa
  Indonesia), badge "Benar tapi nalar keliru" untuk hidden_misconception, dan 3 alasan.
- Panel **"Perlu dicek guru"**: daftar siswa `deferred=true` atau hidden_misconception, diurutkan dari yang
  paling meragukan.
- Kelompok remedial versi AI: per miskonsepsi bernama, bukan hanya per kuadran. Tombol unduh LKPD memakai
  generator yang ada (`src/lib/pdf/lkpd-generator.ts`), dengan judul miskonsepsi.
- Tombol guru per baris: Setuju / Ubah kuadran / Ubah miskonsepsi / Tidak yakin → `POST /api/ml-feedback`
  → MlFeedback.
- Bila tidak ada MlDiagnosis: tampilkan info "Mode AI belum tersedia untuk sesi ini" tanpa error.

## 7. Ekspor riset (T66)
`GET /api/sessions/[id]/export/research` (guru pemilik sesi, `researchConsent=true` wajib) → CSV sesuai
skema pilot (02 §7). Tanpa nama, NIS, atau anonymousLabel. `student_key` = HMAC per sesi. Unduhan dicatat
di log server tanpa isi datanya. Tes: tanpa consent → 403; kolom terlarang tidak pernah muncul.

## 8. Landing page (T67)
- Ganti statistik dengan angka bersumber (01_CONTEXT §D): PISA 2025 17% vs OECD 65%; Rapor Pendidikan 2025
  numerasi SMA 67,14%. Tautkan sumber di bawah angka.
- Hapus "68%" dan "3× lebih berbahaya" kecuali ditemukan sumber yang kuat.
- Label kompetisi → "CAC Machine Learning Solution Challenge 2026".
- Bagian baru "Mesin AI 3 Lapis" dengan diagram sederhana dan tautan ke halaman metodologi.
- Link footer placeholder (`#`) dihapus atau diarahkan ke halaman nyata.

## 9. Mode offline (T68, Tingkat A)
- L1 LightGBM → ONNX (`onnxmltools`). Fitur dihitung di TypeScript (`src/lib/ml/features.ts`) dengan **tes
  kesetaraan** terhadap Python (fixture JSON dari Python, toleransi 1e-6).
- `onnxruntime-web` di dasbor guru. Model di-cache oleh service worker (`src/sw.ts`). Saat offline, Mode AI
  memakai model lokal (tanpa L2 bila model L2 terlalu besar), lalu disinkronkan saat online.

## 10. Deploy (T69)
- Web: Vercel (sudah ada: remediaide.vercel.app; domain lama remediaidee.vercel.app dari v1). Tambahkan env ML_SERVICE_URL.
- Layanan ML: kontainer di layanan gratis/murah (Render, Railway, Fly.io, atau Hugging Face Spaces Docker).
  Pilih yang muat RAM model L2. Jika L2 terlalu besar untuk tier gratis, deploy L1 + L3 saja dan jalankan L2
  di demo lokal. Akun penyedia = M9.
- Setelah deploy: uji end-to-end dari HP (portal siswa) ke dasbor guru, lalu rekam hasilnya di PROGRESS.md.
