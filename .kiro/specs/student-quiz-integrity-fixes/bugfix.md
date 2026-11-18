# Bugfix Requirements Document

## Introduction

Dokumen ini mencakup 6 bug pada alur siswa dan portal guru RemediAide, diurutkan dari paling kritis.
Bug #1 adalah celah keamanan/integritas data di mana seorang siswa bisa masuk ke sesi kelas lain dan mengerjakan soal atas nama dirinya di sesi tersebut. Bug #2–#6 adalah fungsionalitas yang belum sesuai proposal: penegakan durasi sesi, trigger diagnosis otomatis, heatmap real-time, redirect setelah selesai kuis, dan navigasi client-side.

Investigasi kode mendalam dilakukan sebelum penulisan dokumen ini. Root cause setiap bug sudah dikonfirmasi:
- **Bug #1** — `src/auth.ts`: provider `student-pin` hanya verifikasi `schoolId`, tidak verifikasi `classId`. Siswa lintas kelas bisa login ke sesi kelas lain.
- **Bug #2** — `src/app/api/responses/route.ts`: tidak ada cek server-side `startedAt + durationSeconds` saat submit. Klien juga tidak ada countdown yang memblokir.
- **Bug #3** — `src/lib/diagnosis/compute.ts` + `src/workers/run-diagnosis.ts`: tidak ada trigger otomatis `enqueueRunDiagnosis` setelah jawaban terakhir masuk via `POST /api/responses`.
- **Bug #4** — `src/app/api/responses/route.ts`: setelah respons tersimpan, tidak ada panggilan `sseManager.broadcast()`. Broadcast hanya terjadi setelah diagnosis selesai, bukan per-jawaban.
- **Bug #5** — `src/app/student/quiz/[sessionId]/complete/page.tsx`: Server Component statik, tidak ada tombol kembali atau redirect otomatis.
- **Bug #6** — `src/app/student/quiz/[sessionId]/page.tsx`: navigasi sudah client-side di kode, perlu konfirmasi kasus edge di mana state `animating` atau `isSubmitting` tidak di-reset dengan benar.

---

## Bug Analysis

### Current Behavior (Defect)

**Bug #1 — Satu Siswa Bisa Mengerjakan Soal Sesi Kelas Lain (KRITIS)**

Root cause: `src/auth.ts` provider `student-pin` hanya verifikasi `student.schoolId === sessionPin.schoolId`, tanpa mengecek `student.classId === sessionPin.test.classId`.

1.1 WHEN siswa dari Kelas B memasukkan PIN sesi Kelas A yang sedang ACTIVE THEN sistem memverifikasi hanya `student.schoolId === sessionPin.schoolId` sehingga autentikasi berhasil dan siswa Kelas B mendapatkan JWT dengan `sessionPinId` sesi Kelas A

1.2 WHEN siswa Kelas B yang sudah memiliki JWT sesi Kelas A mengirim jawaban ke `POST /api/responses` THEN sistem menerima dan menyimpan jawaban ke sesi Kelas A atas nama siswa Kelas B karena `studentSession.sessionPinId === body.sessionId` terpenuhi

1.3 WHEN endpoint `GET /api/student/join` dipanggil dengan PIN sesi Kelas A yang valid THEN sistem menampilkan semua siswa dari sekolah yang sama, termasuk siswa dari kelas lain yang bukan peserta sesi tersebut

**Bug #2 — Durasi Sesi Habis Tapi Siswa Masih Bisa Mengerjakan**

1.4 WHEN durasi sesi yang dikonfigurasi sudah terlewati namun job auto-close BullMQ belum sempat dieksekusi THEN `POST /api/responses` menerima jawaban karena hanya mengecek `state === 'ACTIVE'`, tanpa memvalidasi `startedAt + durationSeconds * 1000 < Date.now()`

1.5 WHEN siswa masih berada di halaman kuis setelah durasi sesi habis THEN klien tidak memblokir submit — tombol "Lanjut" dan "Selesai" tetap aktif karena tidak ada countdown timer server-side yang dikomunikasikan ke klien

**Bug #3 — Diagnosis Siswa Selalu "Data Kurang" Meski Sudah Selesai**

1.6 WHEN siswa mengirim jawaban soal terakhir via `POST /api/responses` THEN sistem menyimpan respons tetapi tidak otomatis men-enqueue job `run-diagnosis`, sehingga `ConceptDiagnosis` tidak pernah dibuat dan halaman hasil menampilkan status `INSUFFICIENT_DATA`

1.7 WHEN guru membuka portal hasil setelah semua siswa selesai mengerjakan THEN tabel diagnosis menampilkan "data kurang" untuk semua siswa karena `computeConceptDiagnosis` tidak pernah dieksekusi secara otomatis

**Bug #4 — Live Heatmap Tidak Real-Time**

1.8 WHEN siswa mengirim jawaban dan `POST /api/responses` berhasil menyimpan ke DB THEN `sseManager.broadcast()` tidak dipanggil, sehingga status heatmap siswa di portal guru tidak berubah secara real-time

1.9 WHEN 3 siswa menyelesaikan kuis secara bersamaan THEN portal guru heatmap hanya menampilkan data lengkap setelah tombol "Generate Kelompok Remedial" ditekan, bukan secara instan per-jawaban

**Bug #5 — Tidak Ada Redirect Otomatis / Tombol Kembali Setelah Selesai Kuis**

1.10 WHEN siswa berhasil mengirim semua jawaban dan diarahkan ke `/student/quiz/[sessionId]/complete` THEN halaman menampilkan konfirmasi statis tanpa tombol kembali dan tanpa redirect otomatis, sehingga siswa harus menutup halaman atau navigasi manual

**Bug #6 — Perlu Refresh Manual untuk Lanjut ke Soal Berikutnya**

1.11 WHEN siswa menekan tombol "Lanjut" atau "Selesai" dan API berhasil merespons `201 Created` THEN ada kondisi di mana perpindahan soal atau redirect ke halaman complete tidak terjadi otomatis (state `animating` atau `isSubmitting` tidak di-reset karena error yang tidak terkendali)

### Expected Behavior (Correct)

**Bug #1 — Fix: Validasi classId pada Autentikasi PIN**

2.1 WHEN siswa dari Kelas B memasukkan PIN sesi Kelas A THEN sistem SHALL menolak autentikasi dengan `FORBIDDEN` karena `student.classId !== sessionPin.test.classId`, meskipun `student.schoolId === sessionPin.schoolId`

2.2 WHEN `POST /api/responses` menerima request dari siswa yang sudah login THEN sistem SHALL memverifikasi bahwa `studentSession.studentId` memiliki `classId` yang sama dengan `sessionPin.test.classId` sebelum menerima respons

2.3 WHEN `POST /api/student/join` dipanggil dengan PIN yang valid THEN sistem SHALL hanya menampilkan daftar siswa yang `classId`-nya cocok dengan kelas dalam sesi tersebut

**Bug #2 — Fix: Server-Side Deadline Enforcement**

2.4 WHEN siswa mengirim jawaban ke `POST /api/responses` dan `sessionPin.startedAt + durationSeconds * 1000 < Date.now()` THEN sistem SHALL menolak jawaban dengan HTTP 409 `SESSION_EXPIRED` meskipun state masih `ACTIVE` dalam transisi

2.5 WHEN klien menerima data sesi (termasuk `startedAt` dan `durationSeconds`) THEN klien SHALL menghitung sisa waktu dan menampilkan countdown timer, serta menonaktifkan tombol submit saat waktu habis

**Bug #3 — Fix: Auto-Trigger Diagnosis**

2.6 WHEN `POST /api/responses` berhasil menyimpan jawaban dan jumlah respons siswa tersebut di sesi ini sama dengan total soal dalam test THEN sistem SHALL otomatis memanggil `enqueueRunDiagnosis(sessionId)` untuk menjadwalkan komputasi diagnosis

2.7 WHEN `computeConceptDiagnosis` dijalankan setelah semua siswa selesai THEN sistem SHALL menghasilkan `ConceptDiagnosis` yang akurat sesuai algoritma CRI Majority Voting untuk setiap pasangan `(studentId, questionId)`

**Bug #4 — Fix: Broadcast SSE per Jawaban**

2.8 WHEN `POST /api/responses` berhasil menyimpan jawaban ke DB THEN sistem SHALL memanggil `buildHeatmapState(sessionId, schoolId)` dan `sseManager.broadcast(sessionId, entries)` untuk memperbarui status heatmap secara real-time

2.9 WHEN status submission siswa berubah dari `PARTIAL` ke `COMPLETE` (semua soal terjawab) THEN portal guru SHALL menerima event SSE dalam waktu kurang dari 2 detik yang memperbarui cell siswa di heatmap

**Bug #5 — Fix: Redirect Otomatis + Tombol Kembali**

2.10 WHEN halaman `/student/quiz/[sessionId]/complete` dirender THEN sistem SHALL menampilkan tombol eksplisit "Kembali ke Halaman Awal" yang mengarahkan ke `/student/join`

2.11 WHEN halaman complete dirender THEN sistem SHALL memulai countdown 10 detik dan otomatis redirect ke `/student/join` setelah countdown selesai, dengan indikator visual countdown yang terlihat jelas

**Bug #6 — Fix: Client-Side Navigation Tanpa Reload**

2.12 WHEN respons API soal non-terakhir berhasil (`201 Created`) THEN halaman SHALL berpindah ke soal berikutnya dalam 250ms via client-side state update, dengan state `animating` dan `isSubmitting` di-reset dengan benar di blok `finally` atau `setTimeout` callback

2.13 WHEN respons API soal terakhir berhasil (`201 Created`) THEN halaman SHALL langsung melakukan `router.push` ke `/student/quiz/[sessionId]/complete` tanpa memerlukan interaksi tambahan atau full page reload

### Unchanged Behavior (Regression Prevention)

**Bug #1 — Preservation**

3.1 WHEN siswa dari kelas yang benar memasukkan PIN sesi kelasnya sendiri THEN sistem SHALL CONTINUE TO mengizinkan autentikasi dan menampilkan daftar siswa kelas tersebut

3.2 WHEN PIN yang dimasukkan salah atau sesi tidak ACTIVE THEN sistem SHALL CONTINUE TO menolak autentikasi dengan error generik

**Bug #2 — Preservation**

3.3 WHEN sesi masih ACTIVE dan waktu belum habis THEN sistem SHALL CONTINUE TO menerima jawaban dari siswa yang valid

3.4 WHEN guru menutup sesi secara manual sebelum durasi habis THEN sistem SHALL CONTINUE TO menolak jawaban baru dengan `SESSION_CLOSED`

**Bug #3 — Preservation**

3.5 WHEN siswa belum menyelesaikan semua soal (masih ada soal yang belum dijawab) THEN sistem SHALL CONTINUE TO tidak men-trigger diagnosis secara otomatis

3.6 WHEN guru menekan tombol "Generate Kelompok Remedial" di portal guru THEN sistem SHALL CONTINUE TO menjalankan `computeConceptDiagnosis` secara on-demand

**Bug #4 — Preservation**

3.7 WHEN tidak ada klien SSE yang tersambung ke sesi THEN `sseManager.broadcast()` SHALL CONTINUE TO menyimpan state terakhir di memory sehingga klien yang baru connect mendapat state terkini

3.8 WHEN sesi di-close dan diagnosis selesai THEN sistem SHALL CONTINUE TO broadcast state final heatmap dengan `cognitiveStatus` dari hasil diagnosis

**Bug #5 — Preservation**

3.9 WHEN halaman complete dirender THEN sistem SHALL CONTINUE TO menampilkan konfirmasi visual (centang hijau, pesan "Kuis Selesai!", instruksi tunggu guru)

3.10 WHEN siswa menekan tombol kembali sebelum countdown habis THEN sistem SHALL CONTINUE TO mengarahkan ke `/student/join` segera

**Bug #6 — Preservation**

3.11 WHEN API response gagal (non-2xx) THEN sistem SHALL CONTINUE TO menampilkan pesan error dan countdown retry, tanpa berpindah soal

3.12 WHEN siswa belum memilih jawaban atau belum mengisi CRI THEN tombol submit SHALL CONTINUE TO tetap disabled
