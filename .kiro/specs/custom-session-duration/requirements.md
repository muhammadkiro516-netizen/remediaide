# Requirements Document

## Introduction

Fitur ini menambahkan dua kemampuan baru pada dialog pembuatan paket soal (`CreateTestDialog`) di halaman `/dashboard/tests`:

1. **Preset cepat** — dua tombol preset baru: 2 menit dan 3 menit, untuk kebutuhan testing/demo.
2. **Durasi custom** — opsi "Custom" yang, ketika dipilih, menampilkan input angka manual (1–180 menit, hanya bilangan bulat).

Selain perubahan UI, fitur ini juga memperbaiki bug konsistensi: saat ini auto-close sesi di-hardcode ke 900.000 ms (15 menit) tanpa mempedulikan nilai `durationSeconds` yang sesungguhnya tersimpan di database. Dengan fitur ini, semua preset (lama, baru, maupun custom) harus menghasilkan perilaku auto-expire yang konsisten.

## Glossary

- **Duration_Selector**: Komponen UI di `CreateTestDialog` yang menampilkan grid tombol preset dan opsi Custom.
- **Preset_Button**: Tombol dalam grid yang mewakili durasi tetap dalam satuan menit (mis. 2, 3, 10, 15, 20, 30, 45, 60).
- **Custom_Input**: Field input angka yang muncul ketika pengguna memilih opsi "Custom" di Duration_Selector.
- **Auto_Close_Job**: Job BullMQ (`session-auto-close`) yang menutup sesi secara otomatis setelah durasi habis.
- **durationSeconds**: Kolom integer di tabel `tests` (Prisma schema) yang menyimpan durasi paket soal dalam satuan detik.
- **Activate_Route**: API endpoint `POST /api/sessions/:id/activate` yang memulai sesi dan menjadwalkan Auto_Close_Job.
- **Teacher**: Pengguna dengan role `TEACHER` atau `PRINCIPAL` yang membuat paket soal dan sesi.

---

## Requirements

### Requirement 1: Preset Durasi Cepat (2 dan 3 Menit)

**User Story:** Sebagai seorang Teacher, saya ingin memilih preset durasi 2 menit atau 3 menit saat membuat paket soal, agar saya bisa dengan cepat melakukan demo atau pengujian sistem tanpa menunggu lama.

#### Acceptance Criteria

1. THE Duration_Selector SHALL menampilkan tombol preset untuk durasi 2 menit (120 detik) dan 3 menit (180 detik) di dalam grid yang sama dengan preset yang sudah ada, dan tombol-tombol tersebut SHALL terlihat oleh semua pengguna tanpa memandang role.
2. THE Duration_Selector SHALL membedakan preset 2 menit dan 3 menit secara visual dari preset lainnya — misalnya dengan badge atau label tambahan (contoh: "⚡ Demo") — sehingga guru yang berniat membuat sesi ujian sungguhan tidak terkecoh memilihnya.
3. WHEN Teacher memilih preset 2 menit, THE Duration_Selector SHALL menandai tombol 2 menit sebagai aktif (visual terpilih) dan tidak ada tombol preset lain yang tampil aktif secara bersamaan, serta menetapkan nilai durasi internal menjadi 120 detik.
4. WHEN Teacher memilih preset 3 menit, THE Duration_Selector SHALL menandai tombol 3 menit sebagai aktif (visual terpilih) dan tidak ada tombol preset lain yang tampil aktif secara bersamaan, serta menetapkan nilai durasi internal menjadi 180 detik.
5. THE Duration_Selector SHALL menampilkan seluruh preset dalam urutan menaik: 2, 3, 10, 15, 20, 30, 45, 60 menit, dan Custom.
6. WHEN Teacher menyimpan paket soal dengan preset 2 menit terpilih, THE System SHALL berhasil menyimpan paket soal tersebut ke database dengan nilai `durationSeconds` sebesar 120.
7. WHEN Teacher menyimpan paket soal dengan preset 3 menit terpilih, THE System SHALL berhasil menyimpan paket soal tersebut ke database dengan nilai `durationSeconds` sebesar 180.
8. IF Teacher gagal menyimpan paket soal dengan preset 2 atau 3 menit karena kesalahan server, THEN THE System SHALL menampilkan pesan error yang diterima dari API kepada Teacher.

---

### Requirement 2: Input Durasi Custom

**User Story:** Sebagai seorang Teacher, saya ingin memasukkan durasi sembarang antara 1 hingga 180 menit, agar saya bisa menyesuaikan waktu ujian dengan kebutuhan spesifik kelas saya.

#### Acceptance Criteria

1. THE Duration_Selector SHALL menampilkan tombol berlabel "Custom" sebagai pilihan terakhir di grid preset.
2. WHEN Teacher memilih tombol Custom, THE Duration_Selector SHALL menampilkan Custom_Input berupa field angka dengan placeholder yang menunjukkan rentang yang valid (1–180).
3. WHEN Teacher memilih tombol Custom, THE Duration_Selector SHALL menandai tombol Custom sebagai aktif (visual terpilih), tidak ada Preset_Button lain yang tampil aktif secara bersamaan, dan Custom_Input menjadi terlihat serta dapat diisi.
4. WHEN Teacher memasukkan bilangan bulat positif N (1 ≤ N ≤ 180) pada Custom_Input, THE Duration_Selector SHALL menetapkan nilai durasi internal menjadi N × 60 detik.
5. IF Teacher memasukkan nilai di bawah 1 pada Custom_Input, THEN THE Duration_Selector SHALL menampilkan pesan validasi "Minimal 1 menit" dan menonaktifkan tombol submit form.
6. IF Teacher memasukkan nilai di atas 180 pada Custom_Input, THEN THE Duration_Selector SHALL menampilkan pesan validasi "Maksimal 180 menit (3 jam)" dan menonaktifkan tombol submit form.
7. IF Teacher memasukkan nilai desimal pada Custom_Input, THEN THE Duration_Selector SHALL secara otomatis membulatkan nilai ke bilangan bulat terdekat sebelum menetapkan durasi, sehingga nilai yang tersimpan selalu berupa bilangan bulat.
8. IF Teacher memasukkan karakter non-numerik pada Custom_Input, THEN THE Duration_Selector SHALL memperlakukan kondisi tersebut setara dengan input kosong: menonaktifkan tombol submit form dan tidak menetapkan nilai durasi internal.
9. WHILE tombol Custom aktif dan Custom_Input kosong atau berisi nilai non-numerik, THE Duration_Selector SHALL menonaktifkan tombol submit form.
10. WHEN Teacher beralih dari pilihan Custom ke salah satu Preset_Button, THE Duration_Selector SHALL menyembunyikan Custom_Input dan menetapkan durasi internal sesuai nilai preset yang dipilih.

---

### Requirement 3: Validasi Sisi Server untuk durationSeconds

**User Story:** Sebagai seorang Teacher, saya ingin mendapatkan pesan error yang jelas jika nilai durasi yang dikirim tidak valid, agar data yang tersimpan di database selalu dalam rentang yang aman.

#### Acceptance Criteria

1. IF API `POST /api/tests` menerima `durationSeconds` kurang dari 60, THEN THE System SHALL mengembalikan respons error dengan kode `VALIDATION_ERROR` dan status HTTP 422.
2. IF API `POST /api/tests` menerima `durationSeconds` lebih dari 10800 (180 menit), THEN THE System SHALL mengembalikan respons error dengan kode `VALIDATION_ERROR` dan status HTTP 422.
3. IF API `POST /api/tests` menerima `durationSeconds` yang bukan bilangan bulat (mis. 90.5), THEN THE System SHALL mengembalikan respons error dengan kode `VALIDATION_ERROR` dan status HTTP 422.
4. IF API `POST /api/tests` menerima `durationSeconds` yang bukan nilai numerik (mis. string "abc" atau null), THEN THE System SHALL mengembalikan respons error dengan kode `VALIDATION_ERROR` dan status HTTP 422.
5. WHEN API `POST /api/tests` menerima `durationSeconds` yang valid (bilangan bulat antara 60 dan 10800 inklusif), THE System SHALL menyimpan nilai persis yang dikirim ke kolom `duration_seconds` di tabel `tests`.
6. IF `durationSeconds` tidak disertakan dalam request body, THEN THE System SHALL menggunakan nilai default 900 (15 menit).

---

### Requirement 4: Konsistensi Auto-Close Berdasarkan Durasi Aktual

**User Story:** Sebagai seorang Teacher, saya ingin sesi ujian ditutup otomatis tepat sesuai durasi paket soal yang dipilih (termasuk preset baru 2/3 menit dan custom), agar tidak ada sesi yang tetap aktif melampaui waktu yang ditentukan.

#### Acceptance Criteria

1. WHEN Activate_Route memproses permintaan aktivasi sesi, THE Activate_Route SHALL membaca nilai `durationSeconds` dari paket soal yang terhubung dengan sesi tersebut sebelum menjadwalkan Auto_Close_Job.
2. WHEN Activate_Route menjadwalkan Auto_Close_Job, THE Activate_Route SHALL menggunakan nilai milidetik yang dihitung dari `durationSeconds` paket soal sebagai delay, bukan nilai hardcode apapun.
3. WHEN Auto_Close_Job dieksekusi setelah delay, THE System SHALL menutup sesi dengan state `CLOSED` dan nilai `closedAt` yang merupakan timestamp server pada saat job dieksekusi (dengan toleransi ≤ 5 detik dari waktu eksekusi job).
4. WHEN Activate_Route mengambil data sesi dari database untuk keperluan penjadwalan Auto_Close_Job, THE Activate_Route SHALL menyertakan nilai `durationSeconds` dari paket soal terkait dalam query yang sama.
5. IF sesi sudah dalam state `CLOSED` ketika Auto_Close_Job dieksekusi, THEN THE System SHALL melewati operasi penutupan dan mengembalikan respons sukses tanpa modifikasi data.
6. IF nilai `durationSeconds` pada paket soal nol atau tidak ada ketika Auto_Close_Job dijadwalkan, THEN THE Activate_Route SHALL menggunakan nilai fallback 900 detik (15 menit) sebagai delay, sehingga sesi lama tetap dapat diaktifkan tanpa crash.

---

### Requirement 5: Kompatibilitas Mundur Preset Lama

**User Story:** Sebagai seorang Teacher, saya ingin preset durasi yang sudah ada (10, 15, 20, 30, 45, 60 menit) tetap berfungsi normal, agar alur kerja saya yang sudah ada tidak terganggu.

#### Acceptance Criteria

1. THE Duration_Selector SHALL menampilkan semua enam preset lama (10, 15, 20, 30, 45, 60 menit) dengan label dan nilai yang tidak berubah.
2. WHEN Teacher memilih salah satu dari enam preset lama, THE Duration_Selector SHALL menandai tombol preset yang dipilih sebagai aktif (visual terpilih), tidak ada tombol preset lain yang tampil aktif secara bersamaan, dan nilai durasi internal ditetapkan persis sesuai nilai preset tersebut dalam detik (mis. 10 menit = 600 detik).
3. THE System SHALL mempertahankan nilai default `durationSeconds: 900` (15 menit) ketika `CreateTestDialog` pertama kali dibuka.
4. WHEN paket soal dengan preset lama digunakan untuk sesi baru, THE Activate_Route SHALL menjadwalkan Auto_Close_Job dengan delay dalam milidetik yang sama persis dengan nilai `durationSeconds` paket soal tersebut dikalikan 1000 (mis. 900 detik → 900.000 ms).
