# RemediAide — Panduan Testing & Pemakaian Aplikasi

> Dokumen ini mencakup kredensial akun test, hierarki akses (RBAC), alur pemakaian per role, dan cara testing fitur utama. Dibuat berdasarkan seed data (`prisma/seed.ts`) dan konfigurasi autentikasi (`src/middleware.ts`, `src/auth.config.ts`).

---

## 1. Akun Test (Seed Data)

Semua akun berikut tersedia setelah menjalankan `npm run prisma:seed`.

| Role        | Email                        | Password    | Nama                      | Sekolah                   |
|-------------|------------------------------|-------------|---------------------------|---------------------------|
| SUPERADMIN  | `superadmin@remediaide.app`  | `remedi123` | Tim Internal RemediAide   | RemediAide Internal       |
| TEACHER     | `guru@remediaide.app`        | `demo123`   | Guru Demo SMAN 1          | SMA Negeri 1 Demo (sman1) |
| TEACHER     | `demo@remediaide.app`        | `demo123`   | Guru Demo (Legacy)        | SMA Negeri 1 Demo (sman1) |
| PRINCIPAL   | `kepsek@remediaide.app`      | `demo123`   | Kepala Sekolah SMAN 1     | SMA Negeri 1 Demo (sman1) |
| TEACHER     | `guru2@remediaide.app`       | `demo123`   | Guru Demo SMAN 2          | SMA Negeri 2 Demo (sman2) |

### Data Pendukung yang Sudah Di-seed

| Entitas           | Detail                                                                 |
|-------------------|------------------------------------------------------------------------|
| Kelas             | **Kelas X-A** (SMAN 1, guru@), **Kelas X-B** (SMAN 2, guru2@)       |
| Siswa SMAN 1      | `A_Siswa_01` s/d `A_Siswa_06` (6 siswa anonim di Kelas X-A)          |
| Siswa SMAN 2      | `B_Siswa_01` s/d `B_Siswa_03` (3 siswa anonim di Kelas X-B)          |
| Test              | **"Hukum Newton"** — 2 soal, masing-masing 2 variant                  |
| Sesi ACTIVE       | PIN `123456` — siap dipakai untuk join siswa                           |
| Sesi LOCKED       | PIN `999999` — untuk testing state machine (tidak bisa diikuti)        |

> **Catatan tenant isolation:** Data SMAN 1 dan SMAN 2 sepenuhnya terpisah. Akun `guru2@remediaide.app` tidak bisa melihat kelas atau sesi milik SMAN 1, dan sebaliknya.

---

## 2. Struktur Role & Hierarki Akses (RBAC)

### 2.1 Hierarki Role

```
SUPERADMIN
  └── Dapat mengakses semua route (admin, principal, dashboard/teacher)
PRINCIPAL
  └── Dapat mengakses /principal/** dan /dashboard/**
TEACHER
  └── Dapat mengakses /dashboard/**
Student (anonymous)
  └── Dapat mengakses /student/quiz/** setelah join via PIN
```

### 2.2 Route Protection Rules

Berikut adalah aturan proteksi yang di-enforce oleh `middleware.ts` + `auth.config.ts`:

| Route Pattern         | Role yang Diizinkan                        | Catatan                              |
|-----------------------|--------------------------------------------|--------------------------------------|
| `/`                   | Publik                                     | Landing page                         |
| `/login`              | Publik                                     | Halaman login guru/kepsek/superadmin |
| `/register`           | Publik                                     | Registrasi akun baru                 |
| `/student/join`       | Publik                                     | Halaman input PIN untuk siswa        |
| `/dashboard/**`       | TEACHER, PRINCIPAL, SUPERADMIN             | Dashboard utama guru                 |
| `/principal/**`       | PRINCIPAL, SUPERADMIN                      | Dashboard kepala sekolah             |
| `/admin/**`           | SUPERADMIN only                            | Panel admin sistem                   |
| `/student/quiz/**`    | Student (userType=student, setelah join)   | Halaman pengerjaan kuis              |
| `/api/auth/**`        | Publik                                     | NextAuth handlers                    |
| `/api/student/join`   | Publik                                     | Endpoint PIN authentication          |
| `/api/health`         | Publik                                     | Health check endpoint                |
| `/api/admin/**`       | SUPERADMIN only                            | API endpoint admin                   |
| `/api/principal/**`   | PRINCIPAL, SUPERADMIN                      | API endpoint principal               |

> **Penting:** Semua endpoint API mengembalikan JSON `401` (belum login) atau `403` (role tidak cukup) — **bukan redirect**. Hanya route halaman yang di-redirect ke `/login`.

### 2.3 Akses per Role secara Detail

#### TEACHER
- ✅ Login di `/login`
- ✅ Akses `/dashboard` dan semua sub-halaman
- ✅ Membuat & mengelola kelas, soal, test, sesi
- ✅ Melihat live monitoring sesi milik sendiri
- ✅ Export hasil CSV
- ❌ Tidak bisa mengakses `/principal/**`
- ❌ Tidak bisa mengakses `/admin/**`

#### PRINCIPAL
- ✅ Semua yang bisa TEACHER
- ✅ Akses `/principal/overview` — statistik sekolah
- ✅ Akses `/principal/teachers` — kelola daftar guru
- ❌ Tidak bisa mengakses `/admin/**`

#### SUPERADMIN
- ✅ Semua yang bisa PRINCIPAL
- ✅ Akses `/admin/dashboard` — panel manajemen sistem
- ✅ Akses `/admin/schools` — tambah/kelola sekolah
- ✅ **Bisa masuk ke `/dashboard`** (fitur teacher) karena middleware mengizinkan SUPERADMIN di semua route
- ⚠️ SUPERADMIN login melalui `/login` yang sama — tidak ada halaman login terpisah untuk admin

---

## 3. Alur Pemakaian End-to-End

### 3.1 Alur Guru (TEACHER)

```
1. Login
   → Buka /login
   → Masukkan: guru@remediaide.app / demo123
   → Diarahkan ke /dashboard

2. Buat Kelas (opsional, jika belum ada)
   → /dashboard/classes → klik "Buat Kelas Baru"
   → Isi nama kelas, tingkat, tahun akademik

3. Tambah Siswa ke Kelas
   → /dashboard/classes → pilih kelas → tambah siswa (satu per satu atau bulk)
   → Siswa menggunakan label anonim (misal: Siswa_01)

4. Buat Test & Soal
   → /dashboard/tests → klik "Buat Test Baru"
   → Isi topik, durasi
   → Tambah soal (template dengan variabel) dan generate variant

5. Buat Sesi Kuis
   → /dashboard/sessions → klik "Buat Sesi Baru"
   → Pilih test yang sudah dibuat, pilih kelas
   → Sesi dibuat dalam status DRAFT

6. Aktifkan Sesi (Launch Live)
   → Di halaman sesi, klik "Aktifkan" → status berubah ke ACTIVE
   → PIN kode ditampilkan — bagikan ke siswa

7. Monitor Sesi Live
   → /dashboard/sessions/[id]/live
   → Lihat heatmap real-time, jawaban masuk per siswa
   → Bisa lock/close sesi dari halaman ini

8. Lihat Hasil & Export
   → /dashboard/sessions/[id]/results — ringkasan diagnosis
   → /dashboard/results — semua hasil historis
   → Tombol "Export CSV" tersedia di halaman hasil sesi
```

### 3.2 Alur Kepala Sekolah (PRINCIPAL)

```
1. Login
   → Buka /login
   → Masukkan: kepsek@remediaide.app / demo123
   → Diarahkan ke /dashboard (bisa juga langsung ke /principal/overview)

2. Lihat Overview Sekolah
   → /principal/overview
   → Statistik kelas, guru aktif, sesi terkini di seluruh sekolah

3. Kelola Daftar Guru
   → /principal/teachers
   → Lihat semua guru di sekolah, bisa tambah/nonaktifkan guru

4. Lihat Laporan
   → Dari overview, bisa drill-down ke data per kelas atau per guru
```

### 3.3 Alur Superadmin

```
1. Login
   → Buka /login
   → Masukkan: superadmin@remediaide.app / remedi123
   → Diarahkan ke /admin/dashboard

2. Kelola Sekolah
   → /admin/dashboard — lihat daftar semua sekolah terdaftar
   → /admin/schools/new — tambah sekolah baru
   → Isi nama sekolah dan subdomain unik

3. (Opsional) Akses fitur Teacher/Principal
   → SUPERADMIN bisa navigasi ke /dashboard atau /principal/overview
   → Berguna untuk impersonasi/debug tanpa ganti akun
```

### 3.4 Alur Siswa (Student — Anonymous Join)

Siswa **tidak memiliki akun**. Mereka join menggunakan PIN yang diberikan guru.

```
1. Buka halaman join
   → /student/join
   → Masukkan PIN 6 digit (contoh: 123456)
   → Masukkan nama/label (atau sistem assign label anonim)

2. Kerjakan Kuis
   → Setelah join berhasil, diarahkan ke /student/quiz/[sessionId]
   → Jawab soal pilihan ganda satu per satu
   → Sistem mencatat waktu pengerjaan per soal

3. Selesai
   → Setelah semua soal dijawab atau waktu habis
   → Diarahkan ke /student/quiz/[sessionId]/complete
   → Lihat ringkasan hasil (tergantung pengaturan sesi)
```

---

## 4. Cara Testing Fitur Utama

### 4.1 Membuat Sesi Kuis Baru & Mendapatkan PIN

1. Login sebagai `guru@remediaide.app` / `demo123`
2. Buka `/dashboard/sessions` → klik **"Buat Sesi"**
3. Pilih Test (gunakan "Hukum Newton" yang sudah ada) dan Kelas (Kelas X-A)
4. Setelah sesi dibuat, klik **"Aktifkan"**
5. PIN 6 digit akan ditampilkan — catat PIN ini untuk digunakan siswa

> **Shortcut testing:** Seed sudah menyediakan sesi ACTIVE dengan PIN **`123456`** yang langsung bisa dipakai.

### 4.2 Siswa Join via PIN (Anonymous)

1. Buka tab/browser baru (atau mode incognito)
2. Buka `/student/join`
3. Masukkan PIN: `123456`
4. Masukkan nama panggilan atau biarkan sistem assign label anonim
5. Klik **Join** → langsung masuk ke halaman kuis

> Siswa tidak perlu registrasi atau login dengan akun.

### 4.3 Live Monitoring (Heatmap & Real-time Responses)

1. Login sebagai guru di satu tab, join sebagai siswa di tab lain
2. Guru buka `/dashboard/sessions/[id]/live`
3. Heatmap akan update real-time saat siswa menjawab soal
4. Data dikirim via **SSE (Server-Sent Events)** dari `/api/sse/heatmap/[sessionId]`
5. Bisa close/lock sesi dari halaman live ini

### 4.4 Export Hasil CSV

1. Login sebagai guru
2. Buka `/dashboard/sessions/[id]/results`
3. Klik tombol **"Export CSV"**
4. File CSV diunduh via endpoint `/api/sessions/[id]/export/csv`
5. Berisi data: label siswa, soal, jawaban, benar/salah, waktu pengerjaan

### 4.5 Testing Tenant Isolation

1. Login sebagai `guru2@remediaide.app` / `demo123` (SMAN 2)
2. Cek `/dashboard/classes` — hanya tampil Kelas X-B, tidak ada Kelas X-A
3. Coba akses API langsung: `GET /api/classes/[id-kelas-sman1]` → harus return `403`

### 4.6 Testing State Sesi

| Kondisi                         | PIN      | Expected Behavior                    |
|---------------------------------|----------|--------------------------------------|
| Sesi ACTIVE — bisa join         | `123456` | Join berhasil, masuk ke kuis         |
| Sesi LOCKED — tidak bisa join   | `999999` | Error "Sesi sudah ditutup/terkunci"  |
| PIN tidak ada                   | `000000` | Error "PIN tidak ditemukan"          |

---

## 5. Informasi Teknis

### 5.1 URL & Environment

| Environment | URL Base              | Database                                  |
|-------------|----------------------|-------------------------------------------|
| Lokal       | `http://localhost:3000` | Supabase (lihat `.env.local`)          |
| Production  | *(sesuaikan dengan deployment URL Anda)* | —                       |

> Database aktif saat ini terhubung ke **Supabase** (`db.zcvtmbabxtsswbcokxih.supabase.co`). Konfigurasi lengkap ada di `.env.local`.

### 5.2 Daftar Halaman Utama

| Path                                    | Role          | Deskripsi                              |
|-----------------------------------------|---------------|----------------------------------------|
| `/`                                     | Publik        | Landing page                           |
| `/login`                                | Publik        | Login semua role (teacher/principal/superadmin) |
| `/register`                             | Publik        | Registrasi guru baru                   |
| `/student/join`                         | Publik        | Siswa masuk dengan PIN                 |
| `/student/quiz/[sessionId]`             | Student       | Halaman pengerjaan kuis                |
| `/student/quiz/[sessionId]/complete`    | Student       | Halaman selesai kuis                   |
| `/dashboard`                            | TEACHER+      | Dashboard utama guru                   |
| `/dashboard/classes`                    | TEACHER+      | Manajemen kelas & siswa                |
| `/dashboard/tests`                      | TEACHER+      | Manajemen test & soal                  |
| `/dashboard/tests/[testId]`             | TEACHER+      | Detail/edit test                       |
| `/dashboard/sessions`                   | TEACHER+      | Daftar sesi kuis                       |
| `/dashboard/sessions/[id]/live`         | TEACHER+      | Live monitoring sesi (heatmap)         |
| `/dashboard/sessions/[id]/results`      | TEACHER+      | Hasil & diagnosis sesi                 |
| `/dashboard/results`                    | TEACHER+      | Riwayat semua hasil                    |
| `/principal/overview`                   | PRINCIPAL+    | Overview statistik sekolah             |
| `/principal/teachers`                   | PRINCIPAL+    | Manajemen daftar guru                  |
| `/admin/dashboard`                      | SUPERADMIN    | Panel admin — kelola sekolah           |
| `/admin/schools/new`                    | SUPERADMIN    | Tambah sekolah baru                    |

### 5.3 Endpoint API Utama

| Method | Endpoint                               | Auth          | Deskripsi                        |
|--------|----------------------------------------|---------------|----------------------------------|
| POST   | `/api/auth/[...nextauth]`              | Publik        | NextAuth sign-in/sign-out        |
| POST   | `/api/auth/register`                   | Publik        | Registrasi akun guru             |
| POST   | `/api/student/join`                    | Publik        | Join sesi via PIN (buat session) |
| GET    | `/api/classes`                         | TEACHER+      | Daftar kelas                     |
| POST   | `/api/classes`                         | TEACHER+      | Buat kelas baru                  |
| GET    | `/api/tests`                           | TEACHER+      | Daftar test                      |
| POST   | `/api/tests`                           | TEACHER+      | Buat test baru                   |
| GET    | `/api/sessions`                        | TEACHER+      | Daftar sesi                      |
| POST   | `/api/sessions`                        | TEACHER+      | Buat sesi baru                   |
| POST   | `/api/sessions/[id]/activate`          | TEACHER+      | Aktifkan sesi (DRAFT → ACTIVE)   |
| POST   | `/api/sessions/[id]/close`             | TEACHER+      | Tutup sesi                       |
| GET    | `/api/sessions/[id]/diagnoses`         | TEACHER+      | Hasil diagnosis sesi             |
| GET    | `/api/sessions/[id]/export/csv`        | TEACHER+      | Download hasil CSV               |
| POST   | `/api/responses`                       | Student       | Submit jawaban siswa             |
| GET    | `/api/sse/heatmap/[sessionId]`         | TEACHER+      | SSE stream real-time heatmap     |
| GET    | `/api/principal/overview`              | PRINCIPAL+    | Data overview sekolah            |
| GET    | `/api/principal/teachers`              | PRINCIPAL+    | Daftar guru sekolah              |
| GET    | `/api/admin/schools`                   | SUPERADMIN    | Daftar semua sekolah             |
| POST   | `/api/admin/schools`                   | SUPERADMIN    | Tambah sekolah baru              |

### 5.4 Respons API untuk Akses Tidak Sah

API **tidak pernah redirect** — selalu mengembalikan JSON:

```json
// 401 — Belum login
{
  "success": false,
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "Autentikasi diperlukan"
  }
}

// 403 — Role tidak cukup
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Akses ditolak"
  }
}
```

### 5.5 Teknologi & Stack

| Komponen     | Teknologi                                     |
|--------------|-----------------------------------------------|
| Framework    | Next.js (App Router)                          |
| Auth         | Auth.js v5 (NextAuth) — JWT strategy, 8 jam   |
| Database     | PostgreSQL via Supabase + Prisma ORM           |
| Cache/Queue  | Redis + BullMQ                                |
| Real-time    | SSE (Server-Sent Events)                      |
| Deployment   | Vercel (serverless)                           |

---

## 6. Quick Reference Card

```
╔══════════════════════════════════════════════════════════════╗
║               KREDENSIAL TEST — QUICK REFERENCE              ║
╠══════════════════════════════════════════════════════════════╣
║  SUPERADMIN  superadmin@remediaide.app  remedi123            ║
║  TEACHER     guru@remediaide.app        demo123              ║
║  TEACHER     demo@remediaide.app        demo123  (legacy)    ║
║  PRINCIPAL   kepsek@remediaide.app      demo123              ║
║  TEACHER     guru2@remediaide.app       demo123  (SMAN 2)    ║
╠══════════════════════════════════════════════════════════════╣
║  PIN Sesi ACTIVE : 123456  (Test: Hukum Newton, SMAN 1)      ║
║  PIN Sesi LOCKED : 999999  (Untuk testing state machine)     ║
╠══════════════════════════════════════════════════════════════╣
║  Join Siswa   : /student/join                                ║
║  Dashboard    : /dashboard        (TEACHER/PRINCIPAL/SADMIN) ║
║  Kepsek       : /principal/overview              (PRINCIPAL) ║
║  Admin Panel  : /admin/dashboard              (SUPERADMIN)   ║
╚══════════════════════════════════════════════════════════════╝
```

---

*Dokumen ini di-generate dari `prisma/seed.ts`, `src/middleware.ts`, dan `src/auth.config.ts`. Update dokumen ini jika ada perubahan pada seed data atau konfigurasi autentikasi.*
