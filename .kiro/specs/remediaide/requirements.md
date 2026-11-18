# Requirements Document

**Project:** RemediAide

## Introduction

RemediAide adalah aplikasi web/PWA yang mengotomasi diagnosis status kognitif siswa pasca-asesmen sumatif menggunakan Certainty of Response Index (CRI), dan menghasilkan preskripsi remediasi pedagogis terdiferensiasi. Sistem menyelesaikan tiga gap kritis: (1) Numeric Blind Spot — skor numerik tidak membedakan miskonsepsi, ketidaktahuan total, atau kecerobohan teknis; (2) Time-Motion Constraint — analisis butir soal manual memakan 180–240 menit per kelas; (3) SOP yang rusak — guru melakukan tes ulang identik tanpa intervensi perbaikan.

Seluruh klasifikasi status kognitif berbasis Rule-Based Deterministic Decision Support System (Zero-LLM untuk Diagnosis). Sistem tunduk pada UU No. 27 Tahun 2022 tentang Perlindungan Data Pribadi dengan prinsip Privacy by Design.

**Landasan Teoretis:**
- Certainty of Response Index (Hasan, Bagayoko & Kelley, 1999)
- Cognitive Conflict Theory (Posner et al., 1982)
- Generative Learning untuk kelompok Tidak Paham
- Konteks pilot: materi KPK/FPB matematika SD

---

## Glossary

- **RemediAide**: Sistem aplikasi web/PWA yang menjadi subjek dokumen ini.
- **CRI (Certainty of Response Index)**: Indeks keyakinan responden terhadap jawabannya, diukur pada skala 0–5.
- **Status Kognitif**: Salah satu dari empat kategori hasil diagnosis: Paham Konsep, Lucky Guess, Miskonsepsi, Tidak Paham.
- **Diagnostic Engine**: Komponen inti RemediAide yang mengklasifikasikan status kognitif secara deterministik berbasis aturan.
- **Exit Ticket**: Sesi asesmen singkat dengan batas waktu server-side yang digunakan untuk mengumpulkan respons siswa.
- **Item Isomorfik**: Butir soal dengan struktur logis identik tetapi nilai numerik, konteks, dan urutan opsi diacak per siswa.
- **ItemVariant**: Representasi satu varian spesifik dari sebuah butir soal dalam Item Pool isomorfik.
- **LKPD-KK**: Lembar Kerja Peserta Didik — Kelompok Kognitif; dokumen PDF yang berisi instruksi remediasi terdiferensiasi per kelompok status kognitif.
- **Live Heatmap**: Visualisasi real-time distribusi status kognitif seluruh siswa dalam satu sesi kelas.
- **τ_min**: Ambang Waktu Baca Logis minimum — waktu terpendek yang dapat diterima untuk membaca dan menjawab satu butir soal.
- **I_i (Indeks Integritas Respons)**: Skor yang menggabungkan ketepatan jawaban, nilai CRI, dan waktu respons untuk mendeteksi jawaban tidak valid.
- **Majority Voting**: Metode agregasi multi-butir yang menentukan status kognitif final berdasarkan status yang paling sering muncul dari k=3 butir isomorfik.
- **Precedency Rule**: Aturan tie-breaking dalam Majority Voting: jika dua status kognitif mendapat suara sama, Miskonsepsi > Lucky Guess > Tidak Paham > Paham Konsep.
- **Auto-Wipe**: Mekanisme penghapusan otomatis matriks respons mentah setelah siklus remediasi selesai.
- **CalibrationStatus**: Status kalibrasi ItemVariant: `expert_estimated` → `calibrating` → `validated`.
- **Guru**: Pengguna dengan peran pengajar yang mengelola sesi, membuat soal, dan mengakses analitik.
- **Siswa**: Pengguna yang mengikuti Exit Ticket melalui antarmuka PWA mobile-friendly dengan PIN sesi.
- **Kepala Sekolah**: Pengguna dengan akses baca terhadap dashboard agregat tingkat sekolah.
- **Tenant**: Satu unit sekolah yang diidentifikasi oleh `school_id` dalam arsitektur Shared-Schema Multi-Tenancy.
- **SUS**: System Usability Scale — metrik ketergunaan standar dengan skor 0–100.
- **PIN Sesi**: Kode identifikasi sementara yang digunakan siswa untuk login ke Exit Ticket tanpa memerlukan akun permanen.
- **SSE**: Server-Sent Events — mekanisme streaming data satu arah dari server ke klien.
- **BullMQ**: Pustaka antrian pekerjaan berbasis Redis yang digunakan untuk penjadwalan presisi detik.
- **PWA**: Progressive Web App — aplikasi web yang dapat diinstal dan mendukung offline-first caching.
- **WCAG 2.1 AA**: Web Content Accessibility Guidelines versi 2.1 tingkat AA — standar aksesibilitas web minimum yang diadopsi sistem ini.

---

## Requirements

---

### Requirement 1: Manajemen Sesi Exit Ticket

**User Story:** Sebagai Guru, saya ingin membuat dan mengendalikan sesi Exit Ticket dengan batas waktu otomatis, agar siswa dapat mengerjakan asesmen dalam jendela waktu yang terkontrol secara server-side.

#### Acceptance Criteria

1. THE RemediAide SHALL mengelola state sesi Exit Ticket melalui mesin negara dengan tiga keadaan: `LOCKED`, `ACTIVE`, dan `CLOSED`.
2. WHEN Guru mengaktifkan sesi Exit Ticket, THE RemediAide SHALL mengubah state sesi dari `LOCKED` ke `ACTIVE` dan mencatat waktu mulai (`started_at`) dengan presisi milidetik.
3. WHILE state sesi adalah `ACTIVE`, THE RemediAide SHALL memperbarui countdown timer pada antarmuka Guru setiap satu detik.
4. WHEN durasi sesi telah mencapai 900 detik sejak `started_at`, THE RemediAide SHALL mengubah state sesi secara otomatis dari `ACTIVE` ke `CLOSED` melalui BullMQ job yang dijadwalkan.
5. WHEN state sesi menjadi `CLOSED`, THE RemediAide SHALL menolak setiap submisi respons baru dari Siswa dengan kode HTTP 409.
6. IF state sesi adalah `LOCKED` atau `CLOSED`, THEN THE RemediAide SHALL menampilkan pesan status yang sesuai kepada Siswa tanpa mengekspos detail sesi lainnya.
7. THE RemediAide SHALL memastikan transisi state sesi (`LOCKED` → `ACTIVE` → `CLOSED`) bersifat satu arah dan tidak dapat dibalik secara programatik.
8. WHERE fitur PIN Conditional Fallback diaktifkan oleh Guru, THE RemediAide SHALL memungkinkan Siswa yang koneksinya terputus untuk melanjutkan sesi yang sama menggunakan PIN sesi yang valid selama state masih `ACTIVE`.

---

### Requirement 2: Antarmuka Kuis Siswa dengan Slider CRI

**User Story:** Sebagai Siswa, saya ingin mengerjakan kuis dengan antarmuka yang sederhana di perangkat mobile, agar saya dapat menjawab soal dan menyatakan tingkat keyakinan saya tanpa hambatan teknis.

#### Acceptance Criteria

1. THE RemediAide SHALL menyediakan antarmuka kuis yang memenuhi standar WCAG 2.1 AA untuk kontras warna minimum.
2. WHEN Siswa membuka Exit Ticket dengan PIN sesi yang valid, THE RemediAide SHALL menampilkan butir soal isomorfik yang telah diacak numeriknya, konteksnya, dan urutan opsinya secara unik per Siswa.
3. THE RemediAide SHALL menampilkan slider CRI dengan rentang nilai integer 0 hingga 5 beserta deskripsi verbal untuk setiap nilai (0=Menebak Sepenuhnya, 1=Hampir Menebak, 2=Tidak Yakin, 3=Yakin, 4=Sangat Yakin, 5=Mutlak Yakin).
4. WHEN Siswa menekan tombol submit, THE RemediAide SHALL mencatat: identifikasi anonim Siswa, ID butir soal, pilihan jawaban, nilai CRI yang dipilih, dan timestamp respons dalam milidetik.
5. IF Siswa menekan tombol submit tanpa memilih jawaban atau menggeser slider CRI, THEN THE RemediAide SHALL menampilkan pesan validasi dan tidak memproses submisi.
6. THE RemediAide SHALL menyimpan status pengerjaan soal di local storage PWA sehingga WHEN koneksi pulih setelah terputus sementara, THE RemediAide SHALL memungkinkan Siswa melanjutkan dari posisi soal terakhir.
7. THE RemediAide SHALL merender antarmuka kuis yang dapat digunakan penuh pada viewport layar selebar 320 piksel ke atas.
8. WHEN Siswa telah menyerahkan jawaban untuk semua butir soal dalam satu sesi, THE RemediAide SHALL menampilkan halaman konfirmasi bahwa submisi berhasil, tanpa mengekspos status kognitif kepada Siswa.

---

### Requirement 3: Autentikasi dan Otorisasi Berbasis Peran

**User Story:** Sebagai Administrator Sistem, saya ingin setiap pengguna hanya dapat mengakses fitur yang sesuai perannya, agar integritas data dan privasi sesi terjaga.

#### Acceptance Criteria

1. THE RemediAide SHALL mendukung tiga peran pengguna: `STUDENT`, `TEACHER`, dan `PRINCIPAL`, dengan hak akses yang berbeda dan tidak tumpang tindih.
2. WHEN Guru mengakses sistem, THE RemediAide SHALL mengautentikasi Guru menggunakan mekanisme credentials berbasis session token yang aman (HTTP-only cookie, SameSite=Strict).
3. WHEN Siswa mengakses Exit Ticket, THE RemediAide SHALL mengautentikasi Siswa hanya menggunakan PIN sesi sementara tanpa memerlukan akun permanen.
4. IF Siswa mencoba mengakses rute dashboard analitik Guru, THEN THE RemediAide SHALL mengembalikan respons HTTP 403 tanpa mengekspos detail data.
5. IF Kepala Sekolah mencoba mengakses data kelas yang bukan milik sekolahnya, THEN THE RemediAide SHALL mengembalikan respons HTTP 403.
6. THE RemediAide SHALL mengisolasi data antar-Tenant secara otomatis melalui Prisma Client Extension yang menyuntikkan filter `school_id` pada setiap query database.
7. WHEN PIN sesi berakhir (state sesi `CLOSED`), THE RemediAide SHALL menginvalidasi token sesi Siswa yang bersangkutan secara otomatis.
8. THE RemediAide SHALL membatasi upaya login Siswa menggunakan PIN yang salah dengan penundaan eksponensial dimulai dari 1 detik setelah 3 kegagalan berturut-turut pada satu perangkat.

---

### Requirement 4: Diagnostic Engine — Kalkulasi Ambang Waktu Baca Logis (τ_min)

**User Story:** Sebagai Diagnostic Engine, saya ingin menghitung ambang waktu baca logis minimum per butir soal, agar respons yang dikirim terlalu cepat dapat diidentifikasi sebagai tidak valid sebelum memasuki kalkulasi CRI.

#### Acceptance Criteria

1. THE Diagnostic_Engine SHALL menghitung τ_min untuk setiap butir soal menggunakan formula: `τ_min,i = L_i / v`, di mana `L_i` adalah jumlah kata dalam teks butir soal (termasuk pilihan jawaban) dan `v` = 150 kata/menit dikonversi ke kata/detik (v = 2.5 kata/detik).
2. THE Diagnostic_Engine SHALL menghitung `L_i` dengan menghitung token kata yang dipisahkan spasi pada teks soal yang telah dinormalisasi (huruf kecil, tanda baca dihapus).
3. WHEN τ_min,i dihitung, THE Diagnostic_Engine SHALL membulatkan hasilnya ke atas ke bilangan bulat detik terdekat (ceiling function).
4. THE Diagnostic_Engine SHALL menyimpan nilai τ_min sebagai atribut dari entitas ItemVariant dan merecalculate saat teks soal diperbarui.
5. IF waktu respons Siswa untuk butir soal i lebih kecil dari τ_min,i, THEN THE Diagnostic_Engine SHALL menandai respons tersebut dengan flag `BELOW_THRESHOLD` sebelum kalkulasi I_i.

---

### Requirement 5: Diagnostic Engine — Kalkulasi Indeks Integritas Respons (I_i)

**User Story:** Sebagai Diagnostic Engine, saya ingin menghitung indeks integritas setiap respons dengan memperhitungkan ketepatan jawaban, nilai CRI, dan waktu respons, agar respons yang anomali dapat dideteksi dan tidak mengkontaminasi diagnosis status kognitif.

#### Acceptance Criteria

1. THE Diagnostic_Engine SHALL menghitung I_i menggunakan formula dengan komponen: skor kebenaran jawaban (`C_i` ∈ {0, 1}), nilai CRI yang dinormalisasi (`cri_i / 5`), dan rasio waktu respons terhadap τ_min (`t_i / τ_min,i`), dengan penalti asimetris berikut:
   - Jika jawaban benar dan CRI tinggi (≥3): `I_i = 1.0`
   - Jika jawaban benar dan CRI rendah (<3): `I_i = 0.6 + (cri_i / 5) * 0.4`
   - Jika jawaban salah dan CRI tinggi (≥3): `I_i = 0.0` (miskonsepsi kuat)
   - Jika jawaban salah dan CRI rendah (<3): `I_i = 0.3 + (cri_i / 5) * 0.3`
2. IF respons memiliki flag `BELOW_THRESHOLD`, THEN THE Diagnostic_Engine SHALL menggunakan nilai `I_i = 0.0` terlepas dari jawaban dan CRI Siswa.
3. THE Diagnostic_Engine SHALL menyimpan nilai I_i bersama flag validitas sebagai bagian dari record respons yang diproses, sebelum kalkulasi status kognitif per-butir.
4. THE Diagnostic_Engine SHALL memastikan I_i selalu berada dalam rentang [0.0, 1.0] untuk setiap respons yang diproses.

---

### Requirement 6: Diagnostic Engine — Klasifikasi Status Kognitif Per-Butir

**User Story:** Sebagai Diagnostic Engine, saya ingin mengklasifikasikan status kognitif Siswa untuk setiap butir soal menggunakan aturan deterministik berbasis CRI dan ketepatan jawaban, agar diagnosis bersifat konsisten dan dapat diaudit.

#### Acceptance Criteria

1. THE Diagnostic_Engine SHALL mengklasifikasikan status kognitif per-butir (`S_i`) menggunakan matriks aturan deterministik berikut tanpa melibatkan model machine learning atau LLM:

   | Jawaban | CRI | Status Kognitif |
   |---------|-----|-----------------|
   | Benar   | ≥ 3 | Paham Konsep    |
   | Benar   | < 3 | Lucky Guess     |
   | Salah   | ≥ 3 | Miskonsepsi     |
   | Salah   | < 3 | Tidak Paham     |

2. IF respons memiliki flag `BELOW_THRESHOLD` atau `I_i = 0.0`, THEN THE Diagnostic_Engine SHALL mengembalikan status kognitif `INVALID` untuk butir tersebut dan mengeksklusi butir tersebut dari agregasi Majority Voting.
3. THE Diagnostic_Engine SHALL mengklasifikasikan S_i secara idempoten: pemberian input yang sama (jawaban, CRI) pada kondisi threshold yang sama WAJIB selalu menghasilkan status kognitif yang sama.
4. WHEN S_i ditetapkan, THE Diagnostic_Engine SHALL menyimpan pasangan (item_id, student_anonymous_label, S_i, I_i, timestamp) sebagai record audit yang tidak dapat diubah.

---

### Requirement 7: Diagnostic Engine — Agregasi Multi-Butir dengan Majority Voting

**User Story:** Sebagai Diagnostic Engine, saya ingin menggabungkan status kognitif dari tiga butir isomorfik menjadi satu diagnosis final per-siswa, agar diagnosis lebih robust terhadap fluktuasi respons tunggal.

#### Acceptance Criteria

1. THE Diagnostic_Engine SHALL mengagregasi status kognitif dari k=3 butir isomorfik per konstruk konsep untuk menghasilkan Status Kognitif Final (`S_final`) menggunakan Majority Voting.
2. WHEN menghitung Majority Voting, THE Diagnostic_Engine SHALL menghitung frekuensi kemunculan setiap status kognitif valid (bukan `INVALID`) dari k butir yang tersedia dan menetapkan S_final sebagai status dengan frekuensi tertinggi.
3. IF terjadi tie (dua atau lebih status kognitif memiliki frekuensi yang sama), THEN THE Diagnostic_Engine SHALL menerapkan Precedency Rule dengan urutan prioritas: Miskonsepsi > Lucky_Guess > Tidak_Paham > Paham_Konsep.
4. IF jumlah butir valid yang tersedia kurang dari 2 (satu atau nol butir valid), THEN THE Diagnostic_Engine SHALL menetapkan S_final sebagai `INSUFFICIENT_DATA` dan menandai Siswa tersebut untuk verifikasi manual oleh Guru.
5. THE Diagnostic_Engine SHALL menyelesaikan kalkulasi S_final untuk seluruh Siswa dalam satu sesi dalam waktu maksimal 5 detik sejak state sesi berubah menjadi `CLOSED`.
6. THE Diagnostic_Engine SHALL mendokumentasikan jejak agregasi (voting tally per butir, hasil tie-breaking jika ada) sebagai bagian dari laporan analitik yang dapat diakses Guru.

---

### Requirement 8: Dashboard Analitik Guru

**User Story:** Sebagai Guru, saya ingin melihat hasil diagnosis dan distribusi status kognitif kelas saya dalam format yang mudah dipahami, agar saya dapat mengambil keputusan remediasi dengan cepat.

#### Acceptance Criteria

1. WHEN Guru mengakses dashboard setelah sesi `CLOSED`, THE RemediAide SHALL menampilkan ringkasan kelas yang mencakup: jumlah Siswa per status kognitif, persentase ketuntasan, dan daftar Siswa yang memerlukan verifikasi manual (`INSUFFICIENT_DATA`).
2. THE RemediAide SHALL menampilkan matriks respons kelas yang menunjukkan status kognitif per-Siswa per-butir soal dalam format tabel yang dapat diurutkan berdasarkan nama anonim, status, atau butir soal.
3. WHEN Guru menekan tombol "Generate Kelompok Remedial", THE RemediAide SHALL menghasilkan pengelompokan Siswa secara otomatis berdasarkan S_final dalam waktu maksimal 2 detik.
4. THE RemediAide SHALL menyediakan filter dashboard berdasarkan tanggal sesi, topik, dan status kognitif yang dapat dikombinasikan.
5. IF tidak ada sesi yang telah selesai untuk kelas yang dipilih, THEN THE RemediAide SHALL menampilkan pesan panduan untuk membuat sesi Exit Ticket baru, bukan halaman kosong.
6. THE RemediAide SHALL memungkinkan Guru mengekspor data ringkasan kelas dalam format CSV dengan kolom: anonymousLabel, S_final, per-butir S_i, timestamp sesi.

---

### Requirement 9: Live Heatmap Real-Time

**User Story:** Sebagai Guru, saya ingin melihat visualisasi real-time status pengerjaan dan distribusi respons kelas selama sesi berlangsung, agar saya dapat memantau progres tanpa harus menunggu sesi selesai.

#### Acceptance Criteria

1. WHILE state sesi adalah `ACTIVE`, THE RemediAide SHALL memperbarui Live Heatmap yang menampilkan status per-Siswa (Belum Submit, Submit Sebagian, Submit Semua) dengan latensi maksimal 30 detik dari waktu submisi Siswa.
2. THE RemediAide SHALL mengimplementasikan Live Heatmap menggunakan SSE sebagai mekanisme utama dan fallback polling HTTP setiap 5 detik jika koneksi SSE tidak tersedia.
3. WHEN Guru membuka halaman Live Heatmap, THE RemediAide SHALL menginisialisasi koneksi SSE dan menampilkan state terakhir yang tersimpan di server sebelum event update berikutnya tiba.
4. THE RemediAide SHALL merender Live Heatmap menggunakan kode warna: abu-abu (Belum Submit), kuning (Submit Sebagian), hijau (Submit Semua), merah (INSUFFICIENT_DATA setelah sesi CLOSED).
5. IF koneksi SSE terputus, THEN THE RemediAide SHALL secara otomatis mencoba reconnect dengan exponential backoff (1s, 2s, 4s, maks 30s) sebelum beralih ke fallback polling.
6. THE RemediAide SHALL memastikan Live Heatmap dapat menampilkan hingga 50 Siswa dalam satu viewport tanpa horizontal scrolling pada layar selebar 1024 piksel ke atas.
7. WHEN state sesi berubah menjadi `CLOSED`, THE RemediAide SHALL memperbarui Live Heatmap secara final dan menampilkan status kognitif ringkasan (bukan identitas individual Siswa) setelah kalkulasi S_final selesai.

---

### Requirement 10: Item Pool Isomorfik dan Question Builder

**User Story:** Sebagai Guru, saya ingin membuat butir soal isomorfik yang bervariasi secara numerik dan kontekstual, agar setiap Siswa mendapat soal yang berbeda namun setara secara kognitif, sehingga meminimalkan risiko saling menyalin jawaban.

#### Acceptance Criteria

1. THE RemediAide SHALL menyediakan antarmuka Question Builder yang memungkinkan Guru mendefinisikan satu template soal dengan placeholder numerik (`{{a}}`, `{{b}}`, `{{n}}`) dan rentang nilai yang diizinkan per placeholder.
2. WHEN Guru menyimpan template soal, THE RemediAide SHALL secara otomatis menghasilkan minimal 5 ItemVariant dengan nilai numerik berbeda yang memenuhi constraint relasional yang didefinisikan Guru (contoh: `a < b`, `KPK(a,b) ≤ 100`).
3. THE RemediAide SHALL memvalidasi bahwa setiap ItemVariant yang dihasilkan memiliki satu dan hanya satu jawaban benar sebelum disimpan.
4. WHEN Guru membuka pratinjau variant, THE RemediAide SHALL menampilkan rendering final teks soal dan semua pilihan jawaban untuk setiap ItemVariant yang dihasilkan.
5. THE RemediAide SHALL mengacak urutan pilihan jawaban per-ItemVariant per-Siswa pada waktu distribusi sesi, memastikan kunci jawaban tidak selalu berada pada posisi yang sama.
6. THE RemediAide SHALL menetapkan CalibrationStatus awal setiap ItemVariant baru sebagai `expert_estimated` dan memungkinkan Guru memperbarui status ke `calibrating` atau `validated` secara manual.
7. IF semua ItemVariant untuk satu template soal berstatus `expert_estimated`, THEN THE RemediAide SHALL menampilkan peringatan kuning pada antarmuka Question Builder bahwa soal belum terkalibrasi.
8. THE RemediAide SHALL menyimpan sejarah versi template soal sehingga ItemVariant yang digunakan dalam sesi yang telah selesai tidak berubah secara retroaktif.

---

### Requirement 11: Generator Kelompok Remedial dan Preskripsi Pedagogis

**User Story:** Sebagai Guru, saya ingin sistem secara otomatis mengelompokkan siswa berdasarkan status kognitif dan memberikan preskripsi strategi remediasi yang sesuai, agar saya dapat langsung bertindak tanpa perlu interpretasi manual.

#### Acceptance Criteria

1. THE RemediAide SHALL mengelompokkan Siswa ke dalam empat kelompok remedial berdasarkan S_final: Kelompok Paham_Konsep (pengayaan), Kelompok Lucky_Guess (pemantapan), Kelompok Miskonsepsi (konflik kognitif), dan Kelompok Tidak_Paham (pembelajaran generatif).
2. THE RemediAide SHALL menampilkan preskripsi strategi remediasi yang berbeda untuk setiap kelompok:
   - Paham Konsep: tugas pengayaan berbasis masalah terbuka
   - Lucky Guess: latihan soal isomorfik tambahan dengan umpan balik langsung
   - Miskonsepsi: aktivitas Cognitive Conflict berbasis Posner et al. (1982)
   - Tidak Paham: scaffolding Generative Learning berbasis manipulatif konkret
3. WHEN Guru memilih satu atau lebih kelompok remedial, THE RemediAide SHALL menghasilkan daftar anggota kelompok dengan anonymousLabel dan menampilkan instruksi remediasi yang relevan.
4. THE RemediAide SHALL memungkinkan Guru menyesuaikan anggota kelompok secara manual (memindahkan Siswa antar kelompok) sebelum mencetak LKPD-KK, dengan mencatat perubahan manual tersebut dalam log audit.
5. IF seorang Siswa memiliki S_final `INSUFFICIENT_DATA`, THEN THE RemediAide SHALL menempatkan Siswa tersebut di kelompok terpisah yang memerlukan observasi langsung Guru dan tidak mengikutsertakannya dalam LKPD-KK otomatis.

---

### Requirement 12: Generator PDF LKPD-KK dengan QR Code

**User Story:** Sebagai Guru, saya ingin mencetak Lembar Kerja Peserta Didik untuk setiap kelompok kognitif dalam format PDF yang siap cetak dan berisi QR code, agar distribusi materi remediasi dapat dilakukan secara fisik di kelas.

#### Acceptance Criteria

1. WHEN Guru meminta pembuatan LKPD-KK, THE RemediAide SHALL menghasilkan file PDF yang terpisah per kelompok kognitif, masing-masing berisi: judul kelompok, daftar anonymousLabel anggota, instruksi remediasi, dan soal latihan isomorfik.
2. THE RemediAide SHALL menyematkan QR code statis pada setiap halaman LKPD-KK yang, ketika dipindai, mengarahkan Siswa ke URL Exit Ticket sesi yang relevan.
3. THE RemediAide SHALL menghasilkan file PDF LKPD-KK dalam waktu maksimal 10 detik setelah Guru meminta pembuatan untuk satu kelas (≤40 Siswa).
4. THE RemediAide SHALL memastikan PDF LKPD-KK dapat dicetak pada kertas ukuran A4 dengan margin standar (2cm setiap sisi) tanpa konten terpotong.
5. THE RemediAide SHALL menyertakan metadata sesi (ID sesi, tanggal, nama Guru, topik materi) dalam header setiap halaman PDF LKPD-KK.
6. IF pembuatan PDF gagal karena error internal, THEN THE RemediAide SHALL menampilkan pesan error yang spesifik kepada Guru dan mencatat error ke sistem logging tanpa mengekspos stack trace ke antarmuka pengguna.

---

### Requirement 13: Mekanisme Auto-Wipe Data Respons Mentah

**User Story:** Sebagai Guru yang bertanggung jawab atas privasi data Siswa, saya ingin matriks respons mentah dihapus secara otomatis setelah siklus remediasi selesai, agar sistem mematuhi prinsip Privacy by Design dan UU PDP.

#### Acceptance Criteria

1. WHEN siklus remediasi selesai dan Guru mengkonfirmasi penyelesaian siklus melalui proses konfirmasi dua langkah, THE RemediAide SHALL menginisiasi penghapusan matriks respons mentah (jawaban individual per-butir, nilai CRI individual, timestamp respons individual) dari database.
2. THE RemediAide SHALL mengimplementasikan konfirmasi dua langkah Auto-Wipe: langkah pertama menampilkan ringkasan data yang akan dihapus dan meminta Guru memasukkan teks konfirmasi "HAPUS DATA RESPONS"; langkah kedua meminta konfirmasi akhir dalam dialog modal terpisah.
3. THE RemediAide SHALL mempertahankan data agregat (S_final per-Siswa, statistik kelas, anonymousLabel) setelah Auto-Wipe, sehingga laporan historis tetap dapat diakses.
4. WHEN Auto-Wipe selesai dieksekusi, THE RemediAide SHALL mencatat log audit yang mencakup: timestamp penghapusan, ID sesi, ID Guru yang mengkonfirmasi, dan jumlah record yang dihapus.
5. THE RemediAide SHALL menyelesaikan proses Auto-Wipe dalam waktu maksimal 30 detik untuk satu sesi dengan ≤40 Siswa dan ≤3 butir soal.
6. THE RemediAide SHALL memastikan sistem bersifat stateless per siklus remediasi: TIDAK ADA data identitas individual atau respons mentah yang tersisa dalam database setelah Auto-Wipe berhasil dieksekusi.
7. IF proses Auto-Wipe gagal pada pertengahan eksekusi, THEN THE RemediAide SHALL membatalkan seluruh penghapusan (rollback transaksi) dan menampilkan notifikasi kegagalan kepada Guru beserta instruksi untuk mencoba ulang.

---

### Requirement 14: Dashboard Agregat Kepala Sekolah

**User Story:** Sebagai Kepala Sekolah, saya ingin melihat ringkasan performa remediasi seluruh kelas di sekolah saya dalam satu dashboard, agar saya dapat memantau efektivitas pembelajaran tanpa mengakses data individual Siswa.

#### Acceptance Criteria

1. THE RemediAide SHALL menyediakan dashboard khusus Kepala Sekolah yang menampilkan data agregat tingkat sekolah: rata-rata persentase Paham Konsep per kelas, jumlah sesi yang telah selesai per bulan, dan tren perubahan antar siklus.
2. THE RemediAide SHALL memastikan dashboard Kepala Sekolah hanya menampilkan data agregat tanpa mengekspos anonymousLabel atau data respons individual Siswa.
3. IF Kepala Sekolah mencoba mengakses data sesi dari sekolah lain (beda `school_id`), THEN THE RemediAide SHALL mengembalikan HTTP 403 dan mencatat upaya akses tersebut ke log keamanan.
4. THE RemediAide SHALL menyediakan filter tanggal (rentang minggu, bulan, semester) pada dashboard Kepala Sekolah yang memperbarui tampilan data secara responsif dalam waktu maksimal 3 detik.
5. THE RemediAide SHALL menyediakan tampilan perbandingan antar kelas dalam sekolah yang sama, menampilkan distribusi status kognitif sebagai grafik batang bertumpuk (stacked bar chart) per kelas.

---

### Requirement 15: Performa, Skalabilitas, dan Ketergunaan Sistem

**User Story:** Sebagai Tim Pengembang, saya ingin sistem memenuhi target non-fungsional yang terukur, agar RemediAide dapat digunakan secara andal dalam kondisi kelas nyata dan ekspansi klaster sekolah.

#### Acceptance Criteria

1. THE RemediAide SHALL menangani beban 300 pengguna konkuren dengan P95 latency ≤200ms untuk endpoint submisi respons Siswa, diukur dengan load test berbasis HTTP.
2. THE RemediAide SHALL mencapai skor SUS (System Usability Scale) ≥ 78 berdasarkan evaluasi dengan minimal 5 partisipan representatif dari peran Guru pada pilot Fase I.
3. THE RemediAide SHALL memenuhi standar WCAG 2.1 AA untuk semua elemen antarmuka yang terekspos kepada pengguna, mencakup rasio kontras warna minimum 4.5:1 untuk teks normal dan 3:1 untuk teks besar.
4. THE RemediAide SHALL dapat diinstal sebagai PWA (memenuhi kriteria installability: HTTPS, manifest.json valid, service worker aktif) pada perangkat Android dan iOS.
5. THE RemediAide SHALL menyimpan asset statis PWA (HTML, CSS, JS, font, ikon) dalam cache service worker sehingga antarmuka kuis Siswa dapat dirender tanpa koneksi internet setelah instalasi pertama.
6. THE RemediAide SHALL memproses submisi respons tunggal Siswa (validasi, kalkulasi τ_min, penyimpanan ke database) dalam waktu maksimal 500ms di bawah beban normal (≤50 pengguna konkuren).
7. THE RemediAide SHALL mendukung arsitektur Shared-Schema Multi-Tenancy dengan isolasi data antar-Tenant melalui `school_id` discriminator, memungkinkan penambahan Tenant baru tanpa perubahan skema database.

---

### Requirement 16: Keamanan Sesi dan Anti-Cheat

**User Story:** Sebagai Guru, saya ingin sistem mencegah kecurangan selama sesi Exit Ticket berlangsung, agar hasil diagnosis mencerminkan kemampuan kognitif Siswa yang sesungguhnya.

#### Acceptance Criteria

1. THE RemediAide SHALL mendistribusikan ItemVariant yang berbeda (nilai numerik berbeda) kepada setiap Siswa dalam satu sesi yang sama, sehingga minimal 80% Siswa menerima susunan soal yang unik jika jumlah Siswa ≤ jumlah ItemVariant yang tersedia.
2. THE RemediAide SHALL memvalidasi setiap submisi respons di sisi server dengan memeriksa bahwa: (a) item_id yang dikirim sesuai dengan ItemVariant yang ditugaskan ke Siswa tersebut, (b) state sesi masih `ACTIVE`, dan (c) Siswa belum pernah menyerahkan jawaban untuk item_id yang sama dalam sesi yang sama.
3. IF Siswa mengirimkan respons yang sama dua kali untuk item_id yang sama dalam satu sesi, THEN THE RemediAide SHALL menolak submisi kedua dengan HTTP 409 dan mencatat insiden ke log keamanan.
4. THE RemediAide SHALL memastikan kunci jawaban ItemVariant tidak pernah dikirimkan ke klien dalam bentuk apapun (tidak dalam HTML, JavaScript bundle, API response, maupun cookie).
5. WHEN Guru mengaktifkan fitur QR Code statis pada Exit Ticket, THE RemediAide SHALL menghasilkan QR code yang mengarah ke URL sesi dengan token acak satu-kali (nonce) yang hanya valid selama state sesi `ACTIVE`.

---

### Requirement 17: Parser dan Serialisasi Template Soal

**User Story:** Sebagai Sistem, saya ingin mem-parsing template soal isomorfik yang mengandung placeholder dan menghasilkan varian konkret, agar kalkulasi nilai numerik dan rendering teks soal bersifat deterministik dan dapat diverifikasi.

#### Acceptance Criteria

1. WHEN Guru menyimpan template soal, THE Template_Parser SHALL mem-parsing teks template yang mengandung placeholder `{{nama_variabel}}` menjadi representasi terstruktur (AST sederhana) yang memisahkan segmen teks statis dan segmen placeholder.
2. THE Template_Parser SHALL mengembalikan pesan error deskriptif jika template mengandung placeholder yang tidak didefinisikan dalam spesifikasi constraint variabel, atau constraint variabel yang mereferensikan variabel yang tidak ada dalam template.
3. THE Template_Renderer SHALL merender ItemVariant konkret dari hasil parsing template dengan nilai numerik yang diberikan dalam waktu maksimal 100ms per variant.
4. FOR ALL template soal yang valid, mem-parsing kemudian merender kemudian mem-parsing ulang hasil render WAJIB menghasilkan representasi terstruktur yang ekuivalen (round-trip property).
5. THE Template_Parser SHALL menolak template yang mengandung konstruksi yang berpotensi menimbulkan injection (HTML tags, script tags, karakter kontrol non-standar) dan mengembalikan pesan validasi yang spesifik.

---

### Requirement 18: Pretty Printer untuk Template Soal

**User Story:** Sebagai Sistem, saya ingin menghasilkan representasi teks yang dapat dibaca manusia dari struktur template soal internal, agar Guru dapat mengekspor dan berbagi template antar kelas atau sekolah dalam format standar.

#### Acceptance Criteria

1. THE Template_Pretty_Printer SHALL menghasilkan teks template soal dari representasi terstruktur (AST) yang mengandung placeholder, segmen teks statis, dan constraint variabel dalam format yang konsisten.
2. THE Template_Pretty_Printer SHALL memformat output dengan indentasi standar untuk pilihan jawaban (4 spasi per level) dan memisahkan setiap pilihan jawaban dengan newline.
3. THE Template_Pretty_Printer SHALL menyertakan komentar inline (dalam format `# komentar`) untuk menjelaskan constraint variabel yang kompleks (contoh: `# a < b, KPK(a,b) ≤ 100`).
4. FOR ALL template soal yang valid, mem-parsing kemudian pretty-printing kemudian mem-parsing ulang WAJIB menghasilkan representasi terstruktur yang ekuivalen dengan input awal (round-trip property).
5. THE Template_Pretty_Printer SHALL menghasilkan output yang dapat disalin langsung ke Question Builder tanpa memerlukan escape karakter tambahan atau modifikasi manual.

---

### Requirement 19: Mekanisme Fallback PIN Conditional

**User Story:** Sebagai Siswa, saya ingin dapat melanjutkan sesi kuis saya jika koneksi terputus sementara, agar kemajuan pengerjaan saya tidak hilang dan saya tidak perlu memulai dari awal.

#### Acceptance Criteria

1. WHERE fitur PIN Conditional Fallback diaktifkan oleh Guru pada sesi tertentu, THE RemediAide SHALL menyimpan state pengerjaan Siswa (butir soal mana yang sudah dijawab, nilai CRI yang dipilih) di server dengan session token yang terkait dengan PIN sesi.
2. WHEN Siswa login ulang menggunakan PIN sesi yang sama setelah koneksi terputus, THE RemediAide SHALL memulihkan state pengerjaan terakhir dan memungkinkan Siswa melanjutkan dari butir soal berikutnya yang belum dijawab.
3. THE RemediAide SHALL menolak pemulihan sesi jika state sesi sudah berubah menjadi `CLOSED` atau jika waktu sisa kurang dari 60 detik, dan menampilkan pesan peringatan kepada Siswa.
4. THE RemediAide SHALL membatasi pemulihan sesi menggunakan PIN yang sama maksimal 5 kali per-Siswa dalam satu sesi untuk mencegah penyalahgunaan PIN oleh pihak lain.
5. IF fitur PIN Conditional Fallback tidak diaktifkan pada sesi tertentu, THEN THE RemediAide SHALL menolak upaya login ulang dengan PIN yang sudah pernah digunakan dan mengembalikan HTTP 403.

---

### Requirement 20: Logging, Monitoring, dan Observability

**User Story:** Sebagai Tim Ops, saya ingin sistem mencatat event-event kritis dan metrik performa secara terstruktur, agar kami dapat mendeteksi anomali dan melakukan debugging dengan cepat.

#### Acceptance Criteria

1. THE RemediAide SHALL mencatat log terstruktur dalam format JSON untuk setiap event berikut: pembuatan sesi, aktivasi sesi, transisi state sesi, submisi respons Siswa, kalkulasi S_final, Auto-Wipe, dan upaya akses yang ditolak (HTTP 403).
2. THE RemediAide SHALL menyertakan metadata berikut dalam setiap log entry: timestamp ISO 8601 dengan presisi milidetik, log level (DEBUG, INFO, WARN, ERROR), session_id atau request_id, user_role, dan school_id.
3. THE RemediAide SHALL mengukur dan menyimpan metrik performa berikut ke sistem monitoring: latensi P50/P95/P99 endpoint submisi respons, throughput request per detik, jumlah koneksi SSE aktif, dan durasi proses kalkulasi S_final per-sesi.
4. IF terjadi error internal (HTTP 500) pada endpoint apapun, THEN THE RemediAide SHALL mencatat stack trace lengkap, request payload (dengan field sensitif di-mask), dan context error ke sistem logging tanpa mengekspos informasi tersebut ke antarmuka pengguna.
5. THE RemediAide SHALL menyediakan endpoint health check (`/api/health`) yang mengembalikan status UP atau DOWN berdasarkan koneksi database, koneksi Redis, dan status BullMQ worker dalam waktu maksimal 2 detik.
6. THE RemediAide SHALL mencatat log audit setiap kali terjadi modifikasi manual oleh Guru terhadap: kelompok remedial (pemindahan Siswa), CalibrationStatus ItemVariant, dan penghapusan sesi.

---

### Requirement 21: Kalibrasi Evolusioner ItemVariant

**User Story:** Sebagai Tim Pengembang, saya ingin sistem dapat mengakumulasi data penggunaan ItemVariant untuk kalibrasi tingkat kesulitan, agar soal dapat ditandai sebagai `validated` setelah digunakan dalam jumlah sesi yang cukup.

#### Acceptance Criteria

1. THE RemediAide SHALL mencatat statistik penggunaan per-ItemVariant setiap kali digunakan dalam sesi: jumlah total Siswa yang menerima variant tersebut, distribusi jawaban per-pilihan, rata-rata CRI, rata-rata waktu respons, dan persentase respons valid (bukan `BELOW_THRESHOLD`).
2. WHEN ItemVariant telah digunakan dalam minimal 5 sesi dengan total ≥50 respons valid, THE RemediAide SHALL secara otomatis mengubah CalibrationStatus dari `expert_estimated` ke `calibrating`.
3. WHEN ItemVariant telah digunakan dalam minimal 10 sesi dengan total ≥100 respons valid DAN distribusi status kognitif hasil (S_i) menunjukkan pola yang konsisten (deviasi standar persentase per-status ≤15% antar sesi), THE RemediAide SHALL secara otomatis mengubah CalibrationStatus ke `validated`.
4. THE RemediAide SHALL memungkinkan Guru untuk melihat statistik kalibrasi per-ItemVariant melalui antarmuka Question Builder dan secara manual meng-override CalibrationStatus jika diperlukan.
5. IF ItemVariant memiliki persentase respons `BELOW_THRESHOLD` >40% dalam 3 sesi berturut-turut, THEN THE RemediAide SHALL menandai ItemVariant tersebut dengan flag `POTENTIAL_ISSUE` dan mengirim notifikasi kepada Guru untuk review konten soal.

---

## Correctness Properties for Property-Based Testing

Bagian ini mendefinisikan correctness properties yang WAJIB diuji menggunakan property-based testing (PBT) untuk memastikan sistem berperilaku benar di seluruh ruang input yang mungkin.

---

### Property 1: Invariants — Deterministic Classification (Diagnostic Engine)

**Property:** FOR ALL respons (jawaban, CRI) yang valid dan tidak memiliki flag `BELOW_THRESHOLD`, kalkulasi status kognitif per-butir (`S_i`) HARUS bersifat idempoten.

**Formula:**
```
∀ (jawaban, CRI) ∈ {(Benar|Salah) × [0..5]},
  classify(jawaban, CRI) = classify(jawaban, CRI)
```

**Implementation Guide:**
- Generator: respons dengan jawaban ∈ {true, false}, CRI ∈ [0, 1, 2, 3, 4, 5]
- Invariant: klasifikasi yang sama untuk input yang sama (dijalankan dua kali)
- Assertion: `classify(input) === classify(input)`

**Why PBT:** Fungsi klasifikasi adalah logika murni tanpa dependensi eksternal, dan 100 iterasi akan memverifikasi konsistensi di seluruh kombinasi (jawaban, CRI).

---

### Property 2: Round-Trip — Template Parser dan Pretty Printer

**Property:** FOR ALL template soal yang valid, proses `parse → pretty_print → parse` HARUS menghasilkan AST yang ekuivalen dengan input awal.

**Formula:**
```
∀ template_text yang valid,
  parse(pretty_print(parse(template_text))) ≡ parse(template_text)
```

**Implementation Guide:**
- Generator: teks template dengan placeholder `{{a}}`, `{{b}}`, constraint variabel valid
- Round-trip: `parse → pretty_print → parse`
- Assertion: AST hasil round-trip deep-equal dengan AST awal

**Why PBT:** Parser dan pretty printer adalah komponen krusial yang rentan bug. Round-trip property memastikan tidak ada kehilangan informasi atau transformasi tidak konsisten.

---

### Property 3: Metamorphic — Majority Voting Never Increases Uncertainty

**Property:** FOR ALL agregasi k=3 butir, jumlah status kognitif unik pada input HARUS ≥ jumlah status kognitif unik pada output (selalu 1 setelah Majority Voting dengan Precedency Rule).

**Formula:**
```
∀ [S_1, S_2, S_3] ∈ {Paham, Lucky, Misko, Tidak}^3,
  |unique(output)| = 1 ≤ |unique(input)|
```

**Implementation Guide:**
- Generator: array 3 status kognitif, bisa memiliki duplikasi
- Metamorphic relation: output selalu tunggal (S_final)
- Assertion: `majority_vote([S1, S2, S3]).length === 1`

**Why PBT:** 100 iterasi akan menguji semua kemungkinan kombinasi tie dan normal voting.

---

### Property 4: Invariants — Item Pool Constraints Preservation

**Property:** FOR ALL ItemVariant yang dihasilkan dari satu template dengan constraint relasional (contoh: `a < b`), constraint tersebut HARUS terpenuhi untuk setiap variant.

**Formula:**
```
∀ ItemVariant v ∈ generate_variants(template, constraints),
  ∀ constraint c ∈ constraints,
    c(v.values) = true
```

**Implementation Guide:**
- Generator: template dengan constraint `a < b`, `KPK(a,b) ≤ 100`, rentang nilai [1..50]
- Invariant: setiap variant yang dihasilkan memenuhi semua constraint
- Assertion: `checkConstraints(variant.values, constraints) === true`

**Why PBT:** Generator variant adalah logika kombinatorik yang kompleks, dan 100 iterasi akan mendeteksi edge case di mana constraint dilanggar.

---

### Property 5: Round-Trip — Session State Machine Transitions

**Property:** FOR ALL urutan transisi state sesi yang valid, memutar balik transisi HARUS tidak mungkin (irreversible).

**Formula:**
```
∀ state ∈ {LOCKED, ACTIVE, CLOSED},
  IF transition(state, 'activate') = ACTIVE,
  THEN transition(ACTIVE, 'reverse') = UNDEFINED
```

**Implementation Guide:**
- Generator: urutan event {activate, timeout, manual_close}
- Invariant: state machine hanya menerima transisi maju
- Assertion: setiap upaya transisi mundur melempar error atau mengembalikan state yang sama

**Why PBT:** State machine adalah sumber bug klasik, dan property ini memastikan tidak ada transisi ilegal yang lolos.

---

### Property 6: Idempotence — Auto-Wipe Mechanism

**Property:** WHEN Auto-Wipe dijalankan dua kali berturut-turut pada sesi yang sama, hasil akhir HARUS identik (tidak ada error, data agregat tetap konsisten).

**Formula:**
```
∀ session_id,
  auto_wipe(session_id);
  auto_wipe(session_id);
  // Tidak ada error, data agregat tidak berubah
```

**Implementation Guide:**
- Setup: buat sesi dengan respons mentah
- Operation: jalankan `auto_wipe` dua kali
- Assertion: (1) tidak ada error pada eksekusi kedua, (2) data agregat identik setelah wipe pertama dan kedua

**Why PBT:** Idempotence memastikan sistem safe untuk retry dan tidak rusak jika operasi dijalankan berulang.

---

### Property 7: Confluence — ItemVariant Distribution Order Independence

**Property:** FOR ALL siswa dalam satu sesi, urutan distribusi ItemVariant TIDAK BOLEH mempengaruhi klasifikasi status kognitif final.

**Formula:**
```
∀ permutasi P dari distribusi ItemVariant ke Siswa,
  S_final(Siswa_X dengan distribusi P1) = S_final(Siswa_X dengan distribusi P2)
  // jika Siswa_X menjawab soal yang setara secara isomorfik
```

**Implementation Guide:**
- Generator: dua distribusi berbeda dari ItemVariant yang isomorfik ke siswa
- Property: S_final tidak berubah jika siswa menjawab dengan ketepatan dan CRI yang sama pada variant yang berbeda
- Assertion: `S_final(distribution1) === S_final(distribution2)`

**Why PBT:** Memastikan tidak ada bias berbasis urutan distribusi soal.

---

### Property 8: Error Conditions — Invalid Template Rejection

**Property:** FOR ALL template yang mengandung placeholder undefined atau constraint inkonsisten, parser HARUS menolak dengan pesan error yang deskriptif.

**Formula:**
```
∀ template_text dengan placeholder {{x}} tanpa definisi x,
  parse(template_text) = Error("Undefined variable: x")
```

**Implementation Guide:**
- Generator: template dengan berbagai jenis kesalahan (placeholder undefined, constraint sirkular, injection attempt)
- Property: parser selalu mengembalikan error spesifik, tidak crash
- Assertion: `result.isError() && result.message.includes("Undefined")`

**Why PBT:** 100 iterasi akan menguji berbagai kelas kesalahan input dan memastikan sistem robust terhadap input buruk.

---

### Property 9: Invariants — CRI Normalization Bounds

**Property:** FOR ALL nilai CRI input ∈ [0..5], hasil normalisasi HARUS dalam rentang [0.0, 1.0].

**Formula:**
```
∀ cri ∈ [0, 1, 2, 3, 4, 5],
  0.0 ≤ normalize(cri) ≤ 1.0
```

**Implementation Guide:**
- Generator: nilai CRI [0..5]
- Invariant: hasil normalisasi dalam [0.0, 1.0]
- Assertion: `normalized >= 0.0 && normalized <= 1.0`

**Why PBT:** Normalisasi sederhana tetapi krusial untuk kalkulasi I_i, dan property ini memverifikasi bounds tidak pernah dilanggar.

---

### Property 10: Metamorphic — Tenant Isolation in Query Results

**Property:** FOR ALL query database dengan `school_id` filter, hasil query TIDAK BOLEH mengandung record dari `school_id` yang berbeda.

**Formula:**
```
∀ query Q dengan filter school_id = X,
  ∀ record r ∈ execute(Q),
    r.school_id = X
```

**Implementation Guide:**
- Setup: database dengan data multi-tenant (school_id A, B, C)
- Generator: query dengan berbagai `school_id`
- Property: setiap hasil query hanya mengandung record dengan `school_id` yang sesuai
- Assertion: `results.every(r => r.school_id === target_school_id)`

**Why PBT:** Tenant isolation adalah requirement keamanan kritis, dan 100 iterasi dengan query berbeda akan memverifikasi tidak ada kebocoran data antar-tenant.

---

## End of Requirements Document
