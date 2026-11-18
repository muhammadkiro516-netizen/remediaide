# Bugfix Requirements Document

## Introduction

Dokumen ini mencakup 8 item bugfix/perbaikan untuk aplikasi Remedi (Next.js 14, Prisma, NextAuth, PostgreSQL). Semua perbaikan bersifat incremental — tidak menyentuh sistem auth, middleware, RBAC, atau koneksi database yang sudah berjalan stabil di production. Setiap klausul dianalisis berdasarkan kode aktual yang ditemukan di codebase.

---

## Bug Analysis

### Current Behavior (Defect)

**Bug 1 — Opsi Jawaban Pilihan Ganda Hanya Numerik**

1.1 WHEN guru membuat soal pilihan ganda THEN sistem mengisi opsi jawaban (A/B/C/D) hanya dengan nilai numerik hasil `String(correctAnswer)` dan `String(distractor)` dari variant-generator

1.2 WHEN soal membutuhkan opsi berupa teks atau kalimat Bahasa Indonesia THEN sistem tidak menyediakan mekanisme input opsi teks bebas

1.3 WHEN guru mencoba membuat template soal tanpa variabel numerik `[min..max]` THEN sistem menolak template karena parser mensyaratkan format numerik wajib

**Bug 2 — Error Saat Klik "Lihat Varian"**

1.4 WHEN guru mengklik "Lihat Varian" pada soal yang belum memiliki varian tersimpan THEN sistem menampilkan pesan "Belum ada varian" yang ambigu tanpa penjelasan cara generate ulang

1.5 WHEN fetch `/api/questions/[id]/variants` mengembalikan error non-200 THEN komponen VariantPreview menampilkan string error mentah tanpa tombol retry dan tanpa panduan tindak lanjut

**Bug 3 — Tidak Ada Tombol Hapus Paket Soal**

1.6 WHEN guru membuka halaman `/dashboard/tests` THEN sistem tidak menampilkan tombol atau opsi Hapus di kartu paket soal manapun

1.7 WHEN `prisma.test.delete` dieksekusi pada test yang memiliki Question dan SessionPin terkait THEN database menolak dengan foreign key constraint error yang dikembalikan sebagai `INTERNAL_ERROR` 500

**Bug 4 — Belum Ada Upload CSV untuk Paket Soal**

1.8 WHEN guru ingin membuat banyak soal sekaligus untuk satu paket soal THEN sistem tidak menyediakan fitur import massal; guru harus mengisi form satu soal per satu soal

1.9 WHEN guru mencari tombol import CSV di halaman soal THEN tidak ada endpoint API maupun komponen UI untuk menangani file CSV soal

**Bug 5 — Kelas Tidak Bisa Dihapus**

1.10 WHEN guru mengklik Hapus pada kelas yang memiliki siswa terdaftar THEN `prisma.class.delete` gagal karena foreign key constraint, dikembalikan sebagai `INTERNAL_ERROR` 500 generik

1.11 WHEN `handleDeleteClass()` di ClassCard menerima response `success: false` dari API THEN komponen tidak menampilkan pesan error ke pengguna karena tidak ada error handling di callback

**Bug 6 — Tidak Ada Tombol Back di Dashboard Guru**

1.12 WHEN guru berhasil login THEN sistem menggunakan `window.location.href = destination` yang menyebabkan entry history baru sehingga tombol Back browser mengarah ke halaman login

1.13 WHEN guru berada di halaman `/dashboard/tests/[testId]/questions` THEN tidak ada tombol "Kembali ke Paket Soal" atau breadcrumb navigasi yang eksplisit

**Bug 7 — Harus Double-Click di Portal Siswa**

1.14 WHEN siswa mengklik "Masuk" di Step 2 dan fetch `POST /api/student/join` gagal karena error jaringan sementara THEN sistem menampilkan pesan error dan membiarkan siswa mengklik ulang tanpa retry otomatis

1.15 WHEN `signIn("student-pin")` berhasil namun `router.push` dipanggil sebelum session cookie ter-set THEN quiz page tidak dapat membaca session dan siswa mengalami error

**Bug 8 — Portal Siswa Menampilkan Semua Siswa Lintas Kelas**

1.16 WHEN siswa memasukkan PIN sesi yang valid THEN query `prisma.student.findMany` menggunakan `where: { schoolId }` tanpa filter `classId`, sehingga seluruh siswa di sekolah tersebut dari semua kelas ditampilkan

1.17 WHEN siswa memilih nama dari daftar yang tidak terfilter THEN sistem dapat menerima pemilihan siswa dari kelas yang berbeda, mengakibatkan data respons tercampur antar kelas

---

### Expected Behavior (Correct)

**Bug 1 — Opsi Jawaban Pilihan Ganda**

2.1 WHEN guru membuat soal pilihan ganda bertipe "Teks" THEN sistem SHALL menyediakan form input untuk mendefinisikan opsi A/B/C/D secara manual sebagai teks bebas

2.2 WHEN soal menggunakan placeholder dengan tipe "Teks" THEN sistem SHALL merender opsi dari daftar teks yang didefinisikan guru, bukan dari range numerik

2.3 WHEN soal bertipe "Numerik" dibuat seperti sebelumnya THEN sistem SHALL tetap men-generate opsi numerik secara otomatis melalui variant-generator yang ada

**Bug 2 — Error Saat Klik "Lihat Varian"**

2.4 WHEN soal belum memiliki varian (0 varian) THEN sistem SHALL menampilkan pesan informatif bahwa soal perlu disimpan ulang untuk men-generate varian

2.5 WHEN fetch `/api/questions/[id]/variants` gagal dengan error jaringan atau 5xx THEN sistem SHALL menampilkan pesan error deskriptif beserta tombol "Coba lagi" yang memicu fetch ulang

**Bug 3 — Hapus Paket Soal**

2.6 WHEN guru membuka halaman `/dashboard/tests` THEN sistem SHALL menampilkan tombol Hapus di setiap kartu paket soal

2.7 WHEN guru mengklik tombol Hapus THEN sistem SHALL menampilkan konfirmasi dua langkah sebelum mengeksekusi penghapusan

2.8 WHEN paket soal yang akan dihapus memiliki sesi aktif (`SessionPin.state = 'ACTIVE'`) THEN sistem SHALL menolak penghapusan dan menampilkan peringatan bahwa sesi sedang berlangsung

2.9 WHEN paket soal dihapus tanpa sesi aktif THEN sistem SHALL menghapus test beserta semua questions dan item variants terkait secara cascading (delete berurutan: variants → questions → sessions → test)

**Bug 4 — Upload CSV Paket Soal**

2.10 WHEN guru membuka halaman soal (`/dashboard/tests/[testId]/questions`) THEN sistem SHALL menampilkan tombol "Import CSV"

2.11 WHEN guru membuka dialog Import CSV THEN sistem SHALL menyediakan link download template CSV contoh dengan kolom: `nomor`, `teks_soal`, `tipe_jawaban`, `opsi_a`, `opsi_b`, `opsi_c`, `opsi_d`, `jawaban_benar`

2.12 WHEN file CSV diupload THEN sistem SHALL memvalidasi keberadaan kolom wajib dan format data sebelum menampilkan preview

2.13 WHEN validasi CSV berhasil THEN sistem SHALL menampilkan tabel preview seluruh baris dan tombol "Konfirmasi Import" untuk menyimpan ke database

**Bug 5 — Hapus Kelas**

2.14 WHEN guru mengklik Hapus pada kelas yang masih memiliki siswa terdaftar THEN sistem SHALL menampilkan pesan error deskriptif dengan jumlah siswa yang masih terdaftar

2.15 WHEN `DELETE /api/classes/:id` menemukan foreign key constraint THEN sistem SHALL mengembalikan `{ success: false, error: { code: 'CONSTRAINT_ERROR', message: '...' } }` dengan HTTP status 409

2.16 WHEN kelas tidak memiliki siswa maupun test terkait THEN sistem SHALL berhasil menghapus kelas dan memperbarui daftar di UI

**Bug 6 — Navigasi Back di Dashboard**

2.17 WHEN guru berada di halaman `QuestionsPage` THEN sistem SHALL menampilkan tombol "← Kembali ke Paket Soal" yang menavigasi ke `/dashboard/tests`

2.18 WHEN login berhasil THEN sistem SHALL menggunakan `router.push(destination)` sehingga browser history tetap terjaga dengan benar

**Bug 7 — Double-Click di Portal Siswa**

2.19 WHEN fetch `POST /api/student/join` gagal dengan error jaringan (5xx / network error) THEN sistem SHALL melakukan retry otomatis maksimal 2 kali dengan jeda 500ms sebelum menampilkan error

2.20 WHEN `signIn("student-pin")` berhasil THEN sistem SHALL menunggu session aktif terkonfirmasi sebelum memanggil `router.push` ke quiz page

2.21 WHEN proses login siswa sedang berjalan THEN sistem SHALL menampilkan loading state yang jelas dan menonaktifkan semua tombol untuk mencegah double-submit

**Bug 8 — Filter Siswa di Portal**

2.22 WHEN siswa memasukkan PIN sesi yang valid THEN sistem SHALL mengambil `classId` dari relasi `SessionPin → Test → classId` dan memfilter daftar siswa hanya dari kelas tersebut

2.23 WHEN query daftar siswa dieksekusi di `/api/student/join` THEN sistem SHALL menggunakan `where: { schoolId: sessionPin.schoolId, classId: test.classId }` bukan hanya `where: { schoolId }`

---

### Unchanged Behavior (Regression Prevention)

**Bug 1**

3.1 WHEN soal menggunakan variabel numerik dengan format `varName[min..max]` THEN sistem SHALL CONTINUE TO generate varian numerik seperti sebelumnya

3.2 WHEN varian numerik tersimpan di database THEN sistem SHALL CONTINUE TO menyimpan dalam kolom `renderedOptions` (JSON) tanpa perubahan skema

**Bug 2**

3.3 WHEN varian berhasil dimuat (array tidak kosong) THEN sistem SHALL CONTINUE TO menampilkan tabel varian dengan kolom teks, opsi A–D, τ_min, dan status kalibrasi

3.4 WHEN guru mengklik "↺ Refresh" di VariantPreview THEN sistem SHALL CONTINUE TO melakukan fetch ulang dari API

**Bug 3**

3.5 WHEN guru mengklik "Kelola Soal" pada paket soal THEN sistem SHALL CONTINUE TO menavigasi ke `/dashboard/tests/[testId]/questions`

3.6 WHEN guru membuat paket soal baru via dialog THEN sistem SHALL CONTINUE TO menambahkan kartu baru ke daftar tanpa reload halaman

**Bug 4**

3.7 WHEN guru menambah soal via form manual (`QuestionFormPanel`) THEN sistem SHALL CONTINUE TO mem-parse template dan men-generate varian secara otomatis

3.8 WHEN API POST `/api/tests/[testId]/questions` dipanggil dengan templateText biasa THEN sistem SHALL CONTINUE TO berfungsi normal

**Bug 5**

3.9 WHEN guru mengklik tombol delete kelas dan belum konfirmasi THEN sistem SHALL CONTINUE TO menampilkan tombol "Konfirmasi" selama 3 detik (two-step confirm)

3.10 WHEN kelas berhasil dihapus THEN sistem SHALL CONTINUE TO memanggil `onDelete(cls.id)` untuk memperbarui state di ClassesPage

**Bug 6**

3.11 WHEN guru mengklik item navigasi di sidebar THEN sistem SHALL CONTINUE TO menavigasi ke halaman yang sesuai

3.12 WHEN guru mengklik "Keluar" THEN sistem SHALL CONTINUE TO memanggil `signOut({ callbackUrl: '/login' })`

**Bug 7**

3.13 WHEN siswa memasukkan PIN 6 digit dan mengklik "Lanjut" (Step 1) THEN sistem SHALL CONTINUE TO memanggil `POST /api/student/join` dengan `studentId: ""` dan menampilkan daftar siswa

3.14 WHEN rate limiting aktif THEN sistem SHALL CONTINUE TO menampilkan countdown timer dan menonaktifkan tombol submit

**Bug 8**

3.15 WHEN siswa memasukkan PIN yang tidak valid atau sesi tidak ACTIVE THEN sistem SHALL CONTINUE TO mengembalikan error generik tanpa mengekspos informasi sesi

3.16 WHEN `studentId` disertakan dalam request (Step 2) THEN sistem SHALL CONTINUE TO memverifikasi `student.schoolId === sessionPin.schoolId` sebelum mengautentikasi

3.17 WHEN daftar siswa berhasil dimuat THEN sistem SHALL CONTINUE TO menampilkan daftar dalam urutan `anonymousLabel` ascending
