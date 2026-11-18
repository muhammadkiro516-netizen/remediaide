# 06 — Protokol Pilot RemediAide-ID (fase P7)

Tujuan: dataset Indonesia pertama milik tim yang memuat lima sinyal sekaligus, untuk validasi fusi tiga lapis,
modul Pengaman, E9 (kesepakatan model–guru), dan nantinya E10.

## 1. Desain
- Lokasi: SMA Advent Tanjung Barat (sekolah mitra). Peserta: 2–3 kelas X (target 60–90 siswa).
- Instrumen: **15 soal MAP** diterjemahkan ke Bahasa Indonesia. Soalnya sama dengan data MAP, jadi kode
  miskonsepsinya bisa langsung dipakai. Di SMA, ini berfungsi sebagai diagnosis konsep prasyarat (CP Fase C–D,
  Keputusan Kepala BSKAP 046/H/KR/2025).
- Per soal: pilih jawaban → slider keyakinan 0–5 → (pada 5 soal kunci) alasan satu kalimat. Waktu tercatat otomatis.
- Soal kunci yang meminta alasan (dipilih karena variasi miskonsepsinya tinggi): besaran desimal,
  menjumlah pecahan, mengurangi bilangan negatif, mencari y, pecahan × bilangan bulat. Final ditetapkan di
  T70, berdasarkan distribusi kategori di MAP.
- Durasi: 30 menit per kelas (5 menit penjelasan, 20 menit mengerjakan, 5 menit penutup).
- Hasil yang diharapkan: 900–1.350 respons dan 300–450 alasan.

## 2. Menyiapkan instrumen (T70, dikerjakan Claude Code)
1. Ambil teks 15 soal dan himpunan opsi dari data MAP. Opsi = nilai unik MC_Answer per QuestionId. Verifikasi
   ada tepat 4 opsi dan tandai yang benar dari prefiks True_.
2. Terjemahkan dengan opus-mt-en-id lalu perbaiki manual (bahasa soal harus natural untuk siswa SMA). Simpan
   teks Inggris di sampingnya.
3. Soal yang bergantung pada gambar (misalnya representasi pecahan dengan bangun diarsir) digambar ulang
   sebagai SVG sederhana sesuai deskripsi soal, lalu ditandai untuk dicek guru.
4. Masukkan ke aplikasi sebagai satu Test (template tanpa variabel), set `mapQuestionId` dan
   `requireExplanation`. τmin dari jumlah kata Bahasa Indonesia (otomatis oleh v1).
5. Tes kering: Claude Code menjalankan sesi uji dengan 3 akun siswa dummy, lalu memastikan ekspor riset
   menghasilkan CSV sesuai skema.

## 3. Izin dan etika (dikerjakan pemilik, lihat MANUAL_ACTIONS)
- Surat pengantar kampus ke kepala sekolah.
- Persetujuan orang tua/wali tertulis (UU PDP Pasal 25), ditambah persetujuan siswa (assent) sebelum sesi.
- Siswa yang tidak setuju tetap boleh mengerjakan sebagai latihan kelas, tetapi datanya **tidak diekspor**.
  Teknisnya: sesi riset terpisah, atau penanda per siswa.
- Tidak ada nama atau NIS dalam data riset. Data hanya disimpan di laptop tim (folder `ml/data/pilot/`,
  terenkripsi FileVault), tidak di-commit, tidak diunggah ke layanan pihak ketiga, dan tidak dipakai untuk
  melatih model publik tanpa izin tambahan.
- Hasil tidak memengaruhi nilai rapor siswa.

## 4. Templat formulir persetujuan orang tua/wali
> **Permohonan Persetujuan Keikutsertaan dalam Uji Coba Aplikasi Pembelajaran RemediAide**
>
> Yth. Bapak/Ibu Orang Tua/Wali dari ____________________ (kelas ____)
>
> Tim mahasiswa Universitas Pancasila sedang menguji aplikasi RemediAide, yang membantu guru mengenali
> kesalahan konsep matematika siswa supaya remediasi lebih tepat sasaran. Kegiatan ini bekerja sama dengan
> SMA Advent Tanjung Barat.
>
> **Kegiatan:** siswa mengerjakan 15 soal pilihan ganda di HP selama sekitar 20 menit pada jam pelajaran
> matematika, menggeser tingkat keyakinan untuk tiap jawaban, dan menulis alasan singkat pada 5 soal.
>
> **Data yang dicatat:** jawaban, tingkat keyakinan, lama mengerjakan tiap soal, dan alasan tertulis.
> **Tidak dicatat:** nama, NIS, nomor HP, foto, atau lokasi. Data disimpan dengan kode acak, hanya dipakai
> untuk penelitian dan pengembangan aplikasi ini, dan dihapus paling lambat [tanggal].
>
> **Hak Bapak/Ibu dan anak:** keikutsertaan sukarela. Bapak/Ibu atau anak boleh menolak atau berhenti kapan
> saja tanpa konsekuensi apa pun, dan hasilnya tidak memengaruhi nilai. Permintaan penghapusan data bisa
> diajukan ke kontak di bawah.
>
> **Kontak:** [nama ketua tim], [email/HP], dosen pendamping [nama].
>
> ☐ Saya **setuju** anak saya ikut serta dan datanya dipakai sesuai keterangan di atas.
> ☐ Saya **tidak setuju**.
>
> Nama orang tua/wali: ______________ Tanda tangan: ______________ Tanggal: ________

Claude Code membuat versi siap cetak (PDF A4, 1 halaman) di `docs/cac/pilot/consent_form.pdf` beserta
lembar informasi untuk guru.

## 5. Label emas dari guru (E9)
- Dua guru matematika melabeli secara **independen** tanpa melihat label model atau label guru lain.
- Sampel: 200 alasan, diambil berstrata per soal dan per kategori jawaban (benar/salah).
- Rubrik per soal: kode miskonsepsi dari kamus MAP (Bahasa Indonesia), ditambah "Benar dengan nalar benar",
  "Tidak jelas/tidak cukup informasi", dan "Miskonsepsi lain (tulis)".
- Format kerja: spreadsheet (`docs/cac/pilot/labeling_sheet.xlsx`) dengan dropdown per baris berisi soal,
  jawaban siswa, alasan, dan pilihan kode. Satu sheet panduan berisi definisi dan contoh tiap kode.
- Kalibrasi: 20 contoh latihan bersama sebelum melabeli 200 sampel inti. Contoh latihan tidak dihitung.
- Analisis: kappa guru–guru. Target ≥ 0,61 (substantial menurut Landis & Koch); MAP sendiri mencapai
  0,70–0,90. Ketidaksepakatan diselesaikan lewat diskusi → label konsensus.

## 6. Setelah sesi (T73–T75)
1. Guru menekan "Ekspor riset" sebelum auto-wipe. File CSV disalin ke `ml/data/pilot/`.
2. Claude Code memvalidasi skema, menghitung statistik, lalu menjalankan L1/L2/L3 + Pengaman.
3. Hasil: E9, akurasi fusi, ambang Pengaman vs 2,5 kata/detik, dan data card pilot.
