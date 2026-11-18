# Requirements Document

## Introduction

Fitur **Exit Ticket** adalah halaman refleksi digital untuk siswa yang diakses melalui QR code yang tercetak di PDF LKPD-KK (Lembar Kerja Peserta Didik — Kerja Kelompok). Setelah siswa mengerjakan LKPD secara manual (tulis tangan), mereka men-scan QR code dengan HP untuk membuka halaman web refleksi, mengisi jawaban singkat, lalu men-submit. Data tersimpan ke database dan guru dapat melihat ringkasan submission di halaman results yang sudah ada.

Fitur ini juga mencakup perbaikan bug di PDF generator yang saat ini menggunakan env var yang salah (`NEXTAUTH_URL`) dan mengarah ke path yang salah (`/student/join`), sehingga QR code di PDF tidak berfungsi di lingkungan production.

### Alur Keseluruhan

1. Guru men-generate PDF LKPD → PDF berisi QR code yang meng-encode URL Exit Ticket unik per kelompok
2. Siswa mengerjakan LKPD kertas (tulis tangan)
3. Siswa men-scan QR code dengan HP → browser membuka halaman Exit Ticket
4. Siswa mengisi refleksi: teks bebas + skala keyakinan 0–5
5. Sistem menyimpan data ke database dan menonaktifkan token
6. Halaman konfirmasi ditampilkan
7. Guru melihat ringkasan jumlah submission di halaman results

---

## Glossary

- **Exit Ticket**: Halaman refleksi digital yang diisi siswa setelah mengerjakan LKPD-KK.
- **Exit_Ticket_Token**: Token unik kriptografis yang di-encode dalam QR code, mengidentifikasi kelompok + sesi tanpa memerlukan login. Token tidak bisa ditebak secara brute-force.
- **Exit_Ticket_Page**: Halaman web publik yang diakses siswa via URL yang mengandung Exit_Ticket_Token.
- **Exit_Ticket_Submission**: Record data refleksi yang disimpan ketika siswa men-submit Exit Ticket.
- **LKPD_Generator**: Modul backend di `src/app/api/sessions/[id]/lkpd/route.ts` yang men-generate PDF LKPD-KK.
- **PDF_Generator**: Library di `src/lib/pdf/lkpd-generator.ts` yang membangun konten PDF.
- **Kategori_Kognitif**: Salah satu dari lima status diagnosis: `PAHAM_KONSEP`, `MISKONSEPSI`, `LUCKY_GUESS`, `TIDAK_PAHAM`, atau `INSUFFICIENT_DATA`.
- **Pertanyaan_Refleksi**: Pertanyaan teks yang ditampilkan di Exit_Ticket_Page, kontennya ditentukan oleh Kategori_Kognitif kelompok.
- **Skala_Keyakinan**: Nilai integer 0–5 yang dimasukkan siswa, konsisten dengan mekanisme CRI yang digunakan di kuis (0 = "Menebak Sepenuhnya" hingga 5 = "Mutlak Yakin").
- **Remedial_Group**: Model database `RemedialGroup` yang mewakili satu kelompok siswa dengan Kategori_Kognitif yang sama dalam satu sesi.
- **Session**: Model database `SessionPin` yang mewakili satu sesi kuis yang sudah selesai.
- **Guru_Portal**: Halaman-halaman di `/dashboard/` yang hanya dapat diakses guru yang sudah login.
- **AUTH_URL**: Environment variable yang menyimpan base URL aplikasi untuk Auth.js v5 (bukan `NEXTAUTH_URL`).

---

## Requirements

### Requirement 1: Generate dan Simpan Exit Ticket Token

**User Story:** Sebagai guru, saya ingin QR code di PDF LKPD mengarah ke halaman Exit Ticket yang benar dengan token unik, sehingga siswa bisa langsung scan dan mengisi refleksi tanpa harus login.

#### Acceptance Criteria

1. WHEN guru meminta generate PDF LKPD untuk satu Remedial_Group, THE LKPD_Generator SHALL membuat satu Exit_Ticket_Token baru yang dihasilkan dari paling sedikit 32 byte entropi acak menggunakan fungsi kriptografis (`crypto.randomBytes` atau setara), menghasilkan string token dengan panjang minimal 32 karakter.
2. WHEN Exit_Ticket_Token berhasil dibuat, THE LKPD_Generator SHALL memverifikasi bahwa token tersebut belum ada di database (unik), lalu menyimpannya dengan referensi ke `sessionPinId` dan `remedialGroupId` yang sesuai.
3. THE LKPD_Generator SHALL mengatur status awal Exit_Ticket_Token sebagai `UNUSED`.
4. WHEN Exit_Ticket_Token disimpan, THE LKPD_Generator SHALL membuat QR URL dengan format `{BASE_URL}/exit-ticket/{token}` di mana `BASE_URL` diambil dari `process.env.AUTH_URL`.
5. IF `process.env.AUTH_URL` tidak tersedia atau kosong, THEN THE LKPD_Generator SHALL menggunakan fallback URL `https://remediaide.app`.
6. WHEN QR URL berhasil dibuat, THE LKPD_Generator SHALL menyematkan URL tersebut ke dalam QR code yang dicetak di PDF LKPD-KK.
7. IF penyimpanan token ke database gagal, THEN THE LKPD_Generator SHALL mengembalikan error dan tidak melanjutkan proses generate PDF.

---

### Requirement 2: Fix Bug QR URL di PDF Generator

**User Story:** Sebagai guru, saya ingin QR code yang dicetak di PDF selalu mengarah ke URL yang benar di lingkungan production, sehingga siswa tidak mendapatkan halaman error saat scan.

#### Acceptance Criteria

1. THE LKPD_Generator SHALL membaca base URL dari `process.env.AUTH_URL` (bukan `process.env.NEXTAUTH_URL`).
2. WHEN LKPD_Generator membangun QR URL, THE LKPD_Generator SHALL menggunakan path `/exit-ticket/{token}` — di mana `{token}` adalah string token Exit_Ticket_Token yang baru dibuat — bukan path `/student/join` atau path lainnya.
3. IF `process.env.AUTH_URL` berisi trailing slash, THEN THE LKPD_Generator SHALL menormalkan URL sehingga tidak ada double slash pada path yang dihasilkan (contoh: `https://app.com/` + `/exit-ticket/abc` → `https://app.com/exit-ticket/abc`).
4. THE LKPD_Generator SHALL memvalidasi bahwa URL yang dihasilkan dimulai dengan `http://` atau `https://` sebelum menyematkannya ke QR code.
5. IF `process.env.AUTH_URL` tidak tersedia atau kosong, THEN THE LKPD_Generator SHALL menggunakan `https://remediaide.app` sebagai base URL fallback dan mencatat peringatan ke console server.

---

### Requirement 3: Tampilkan Halaman Exit Ticket Sesuai Kategori

**User Story:** Sebagai siswa, saya ingin melihat halaman refleksi yang relevan dengan hasil diagnosis saya, sehingga saya dapat merenungkan proses belajar saya dengan lebih tepat sasaran.

#### Acceptance Criteria

1. WHEN siswa membuka URL `/exit-ticket/{token}` dengan Exit_Ticket_Token yang valid dan berstatus `UNUSED`, THE Exit_Ticket_Page SHALL menampilkan Pertanyaan_Refleksi yang sesuai dengan Kategori_Kognitif kelompok tersebut.
2. THE Exit_Ticket_Page SHALL menampilkan Pertanyaan_Refleksi berikut berdasarkan Kategori_Kognitif:
   - `PAHAM_KONSEP` → "Coba jelaskan dengan kata-katamu sendiri, apa yang membuatmu yakin dengan jawabanmu?"
   - `MISKONSEPSI` → "Apa yang berubah dari pemahamanmu setelah mengerjakan LKPD ini? Bagian mana yang tadinya kamu pikir benar, ternyata berbeda?"
   - `LUCKY_GUESS` → "Coba jelaskan lagi alasan jawabanmu sekarang, setelah mengerjakan LKPD ini — apakah alasanmu berubah?"
   - `TIDAK_PAHAM` → "Bagian mana dari topik ini yang masih paling membingungkan buatmu?"
   - `INSUFFICIENT_DATA` → "Ceritakan bagaimana proses kamu mengerjakan soal tadi — apa yang kamu lakukan saat menemui soal yang sulit?"
3. THE Exit_Ticket_Page SHALL menampilkan form yang terdiri dari: (a) textarea untuk jawaban teks bebas dengan batas maksimal 1000 karakter, dan (b) Skala_Keyakinan berupa pilihan nilai 0–5 dengan label deskriptif.
4. THE Exit_Ticket_Page SHALL menampilkan label deskriptif untuk setiap nilai Skala_Keyakinan, konsisten dengan label CRI yang digunakan di kuis: 0 = "Menebak Sepenuhnya", 1 = "Sangat Tidak Yakin", 2 = "Tidak Yakin", 3 = "Yakin", 4 = "Sangat Yakin", 5 = "Mutlak Yakin".
5. THE Exit_Ticket_Page SHALL menggunakan warna latar belakang, teks heading, dan tombol submit yang konsisten dengan warna Kategori_Kognitif yang digunakan di PDF LKPD-KK (misalnya: MISKONSEPSI menggunakan warna merah yang sama dengan yang tercetak di PDF).
6. THE Exit_Ticket_Page SHALL menampilkan nama topik pembelajaran yang diambil dari data sesi yang terkait dengan token.
7. THE Exit_Ticket_Page SHALL dapat diakses tanpa memerlukan session login (halaman publik).
8. IF token valid tetapi data sesi atau kelompok terkait tidak ditemukan di database, THEN THE Exit_Ticket_Page SHALL menampilkan halaman error dengan pesan "Data refleksi tidak ditemukan. Hubungi gurumu." dan tidak menampilkan form.

---

### Requirement 4: Validasi Token Akses

**User Story:** Sebagai perancang sistem, saya ingin token Exit Ticket divalidasi sebelum form ditampilkan, sehingga akses tidak sah atau token yang sudah terpakai dapat ditolak dengan tepat.

#### Acceptance Criteria

1. WHEN siswa membuka URL `/exit-ticket/{token}` dengan token yang tidak ditemukan di database, THE Exit_Ticket_Page SHALL menampilkan halaman error dengan pesan "Link ini tidak valid atau sudah tidak berlaku."
2. WHEN siswa membuka URL `/exit-ticket/{token}` dengan token yang berstatus `USED`, THE Exit_Ticket_Page SHALL menampilkan halaman konfirmasi statis (tanpa form) yang menyatakan "Refleksimu sudah tercatat sebelumnya. Terima kasih!" dan tidak menampilkan form refleksi.
3. IF token di URL memiliki panjang di luar rentang 8–128 karakter atau mengandung karakter selain alfanumerik dan tanda hubung, THEN THE Exit_Ticket_Page SHALL merender halaman 404 (not found).
4. THE Exit_Ticket_Page SHALL tidak mengekspos data internal sistem apapun — termasuk `id`, `sessionPinId`, `schoolId`, `remedialGroupId`, `studentId`, nama siswa, atau jawaban kuis — dalam konten HTML, respons JSON, atau pesan error yang diterima browser siswa.
5. IF token di URL valid secara format tetapi sudah melampaui batas waktu validitas (misalnya token dibuat lebih dari 30 hari yang lalu), THEN THE Exit_Ticket_Page SHALL memperlakukan token tersebut seperti token tidak ditemukan dan menampilkan pesan "Link ini tidak valid atau sudah tidak berlaku."

---

### Requirement 5: Submit dan Simpan Data Refleksi

**User Story:** Sebagai siswa, saya ingin submit refleksi saya dan mendapat konfirmasi bahwa data sudah tersimpan, sehingga saya tahu proses selesai dengan sukses.

#### Acceptance Criteria

1. WHEN siswa mengisi textarea dengan teks minimal 1 karakter dan maksimal 1000 karakter, memilih nilai Skala_Keyakinan antara 0–5 (inklusif), lalu menekan tombol submit, THE Exit_Ticket_Page SHALL mengirimkan data ke endpoint API dengan payload berisi token, teks refleksi, dan nilai Skala_Keyakinan.
2. WHILE request pengiriman data sedang berlangsung, THE Exit_Ticket_Page SHALL menonaktifkan tombol submit dan menampilkan indikator loading untuk mencegah double-submit.
3. IF siswa menekan submit tanpa mengisi textarea (kosong atau hanya spasi), THEN THE Exit_Ticket_Page SHALL menampilkan pesan validasi "Jawaban tidak boleh kosong" di bawah textarea dan tidak mengirimkan request ke server.
4. IF siswa menekan submit tanpa memilih Skala_Keyakinan, THEN THE Exit_Ticket_Page SHALL menampilkan pesan validasi "Pilih dulu tingkat keyakinanmu" di bawah komponen Skala_Keyakinan dan tidak mengirimkan request ke server.
5. WHEN data refleksi diterima oleh API dengan token yang valid dan berstatus `UNUSED`, THE Exit_Ticket_API SHALL menyimpan Exit_Ticket_Submission ke database yang berisi: referensi ke Exit_Ticket_Token, teks refleksi (maksimal 1000 karakter), nilai Skala_Keyakinan (integer 0–5), dan timestamp submission.
6. WHEN Exit_Ticket_Submission berhasil disimpan, THE Exit_Ticket_API SHALL mengubah status Exit_Ticket_Token menjadi `USED` dalam satu transaksi database yang sama.
7. WHEN Exit_Ticket_Submission berhasil disimpan, THE Exit_Ticket_API SHALL merespons dengan HTTP 200 dan body JSON `{ "success": true }`.
8. WHEN Exit_Ticket_API berhasil merespons dengan status 200, THE Exit_Ticket_Page SHALL menampilkan halaman konfirmasi dengan pesan "Terima kasih, refleksimu sudah tersimpan!"
9. IF Exit_Ticket_API menerima request submit dengan token yang sudah berstatus `USED`, THEN THE Exit_Ticket_API SHALL merespons dengan HTTP 409 (Conflict) dan body JSON `{ "error": "TOKEN_ALREADY_USED" }`.
10. WHEN Exit_Ticket_API menerima request submit dengan token yang tidak ditemukan, THE Exit_Ticket_API SHALL merespons dengan HTTP 404 dan body JSON `{ "error": "TOKEN_NOT_FOUND" }`.
11. IF Exit_Ticket_API merespons dengan status selain 200, THEN THE Exit_Ticket_Page SHALL menampilkan pesan error "Terjadi kesalahan, coba lagi." dan mengaktifkan kembali tombol submit.

---

### Requirement 6: Keamanan Token

**User Story:** Sebagai pengelola sistem, saya ingin token Exit Ticket tidak bisa ditebak atau diakses oleh siswa yang tidak bersangkutan, sehingga integritas data refleksi terjaga.

#### Acceptance Criteria

1. THE LKPD_Generator SHALL menghasilkan Exit_Ticket_Token menggunakan fungsi kriptografis (`crypto.randomBytes` atau setara) dengan entropi minimal 128 bit (16 byte), di-encode sebagai string heksadesimal atau base64url.
2. THE Exit_Ticket_API SHALL memvalidasi token menggunakan exact-match lookup di database — tidak boleh ada logika prefix-matching, regex-matching, atau pola lain yang bisa dieksploitasi untuk enumerasi.
3. THE Exit_Ticket_API SHALL membatasi rate akses endpoint `/exit-ticket/{token}` dan API submit maksimal 20 request per menit per IP address untuk mencegah enumeration attack dan brute-force.
4. THE Exit_Ticket_Token SHALL hanya digunakan untuk mengidentifikasi Kategori_Kognitif dan nama topik kelompok — respons API tidak boleh menyertakan nama siswa, anonymous label, jawaban kuis individual, atau data identitas apapun.

---

### Requirement 7: Integrasi Ringkasan di Halaman Results Guru

**User Story:** Sebagai guru, saya ingin melihat berapa banyak Exit Ticket yang sudah disubmit per kelompok di halaman results yang sudah ada, sehingga saya bisa memantau partisipasi siswa tanpa harus membuka halaman baru.

#### Acceptance Criteria

1. WHEN guru membuka halaman results sesi di Guru_Portal, THE Results_Page SHALL menampilkan jumlah siswa yang sudah submit Exit Ticket untuk setiap Remedial_Group pada sesi tersebut, dalam format "X dari Y siswa sudah submit Exit Ticket" di dalam kartu kelompok yang sudah ada.
2. WHEN tidak ada submission Exit Ticket untuk suatu Remedial_Group, THE Results_Page SHALL menampilkan teks "Belum ada yang submit Exit Ticket" di dalam kartu kelompok tersebut.
3. THE Results_Page SHALL memuat data ringkasan Exit Ticket menggunakan query Prisma server-side yang sudah ada — tidak boleh menambahkan client-side fetch API call terpisah khusus untuk data ini.
4. WHILE halaman results sedang dimuat, THE Results_Page SHALL menampilkan skeleton placeholder (elemen `div` dengan class `animate-pulse`) sebagai indikator loading, konsisten dengan pola UI yang sudah ada di halaman tersebut.
5. IF sesi belum memiliki Remedial_Group (belum ada diagnosis), THEN THE Results_Page SHALL tidak menampilkan section ringkasan Exit Ticket sama sekali.

---

### Requirement 8: Skema Database untuk Exit Ticket

**User Story:** Sebagai developer, saya ingin skema database yang tepat untuk menyimpan token dan submission Exit Ticket, sehingga data dapat diquery dengan efisien dan integritas referensial terjaga.

#### Acceptance Criteria

1. THE Database SHALL memiliki model `ExitTicketToken` yang menyimpan: `id` (UUID, primary key), `token` (String unik, terindeks), `sessionPinId` (String, foreign key ke `SessionPin`), `remedialGroupId` (String, nullable, foreign key ke `RemedialGroup`), `schoolId` (String, foreign key ke `School`), `status` (enum `ExitTicketStatus`: `UNUSED` | `USED`), `createdAt` (DateTime), dan `usedAt` (DateTime, nullable).
2. THE Database SHALL memiliki model `ExitTicketSubmission` yang menyimpan: `id` (UUID, primary key), `exitTicketTokenId` (String, foreign key ke `ExitTicketToken`, unik — constraint one-to-one), `reflectionText` (String, maksimal 1000 karakter), `confidenceScore` (Int, rentang 0–5), `submittedAt` (DateTime), dan `schoolId` (String, foreign key ke `School`).
3. THE Database SHALL memiliki constraint `@@unique([token])` pada model `ExitTicketToken` untuk mencegah duplikasi token di level database.
4. THE Database SHALL memiliki constraint `@unique` pada field `exitTicketTokenId` di model `ExitTicketSubmission` untuk memastikan relasi one-to-one antara token dan submission.
5. THE Database SHALL memiliki index `@@index([sessionPinId])` pada model `ExitTicketToken` untuk mendukung query agregasi jumlah submission per sesi secara efisien.

---

### Requirement 9: Aksesibilitas dan Kompatibilitas Mobile

**User Story:** Sebagai siswa yang mengakses via HP setelah scan QR code, saya ingin halaman Exit Ticket mudah digunakan di layar kecil, sehingga saya bisa mengisi refleksi dengan nyaman.

#### Acceptance Criteria

1. WHEN Exit_Ticket_Page dirender pada viewport dengan lebar 320px, THE Exit_Ticket_Page SHALL menampilkan semua elemen (judul, pertanyaan, textarea, Skala_Keyakinan, tombol submit) tanpa horizontal scroll dan semua elemen dapat dioperasikan.
2. THE Exit_Ticket_Page SHALL memiliki ukuran font minimal 16px untuk elemen textarea untuk mencegah auto-zoom di browser iOS Safari.
3. THE Exit_Ticket_Page SHALL memiliki tinggi minimal 44px untuk semua elemen interaktif (tombol submit, pilihan Skala_Keyakinan) sesuai standar touch target WCAG 2.1 AA.
4. IF siswa mengakses Exit_Ticket_Page pada koneksi 3G lambat (simulasi throttling ~400kbps), THEN THE Exit_Ticket_Page SHALL mencapai Time to Interactive di bawah 5 detik.
5. WHEN JavaScript gagal dimuat atau dinonaktifkan, THE Exit_Ticket_Page SHALL menampilkan pesan fallback yang memberi tahu siswa bahwa halaman memerlukan JavaScript untuk berfungsi — bukan blank screen atau error yang tidak informatif.
