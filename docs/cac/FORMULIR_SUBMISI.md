# Isi formulir submisi penyisihan CAC MLSC 2026 (siap salin)

Kolom formulir resmi belum diketahui (rulebook revisi belum ada, lihat `docs/cac/CEK_RULEBOOK.md`). Sesuaikan urutan
dengan formulir. **Jangan menempel password di dokumen ini.**

**Nama tim:** RemediAide

**Anggota:** Muhammad Salman Al Farisi (ketua), Lubna Maryam (anggota), Muhammad Farel Rizky (anggota)

**Judul:** RemediAide 2.0 — Diagnosis Miskonsepsi Matematika Berbasis Machine Learning yang Menandai Kasus Ragu untuk Guru

**SDG:** SDG 4.1 (hasil belajar), SDG 10.2 (inklusi), SDG 4.c (waktu guru)

**Ringkasan (±100 kata):**
> Aturan CRI yang banyak dipakai guru untuk mendiagnosis siswa salah mengelompokkan 45,1% kasus pada data uji Eedi.
> RemediAide 2.0 menggantinya dengan tiga lapis machine learning: transformer knowledge tracing yang membaca riwayat
> jawaban dan keyakinan siswa, pembaca alasan satu kalimat yang menamai miskonsepsi (juga untuk alasan berbahasa
> Indonesia), serta lapis keputusan dengan kalibrasi dan conformal prediction yang menyerahkan kasus paling meragukan ke
> guru. Pada siswa uji yang dikunci, salah kelompok turun menjadi 34,7%; pada kasus yang tidak diserahkan menjadi 28,3%.
> Model dipasang di aplikasi web, dengan aturan lama sebagai cadangan, dan seluruh eksperimen dapat direproduksi.

**Repositori (source code):** https://github.com/muhammadkiro516-netizen/remediaide

**Rilis penyisihan (zip kode):** [ISI: URL GitHub Release v1.0-cac-penyisihan]

**Dataset:**
- Eedi NeurIPS 2020 (CC BY-NC-ND 4.0): tidak dibagikan ulang sesuai lisensi; skrip unduh + sha256 di `ml/data/`.
- MAP (MIT) + terjemahan Indonesia kami (MAP-ID): https://www.kaggle.com/datasets/avlsalmoon/remediaide-map-id

**Aplikasi web:** https://remediaide.vercel.app

**Akun juri (hanya-baca, data demo sintetis):** email `juri@remediaide.id` · password: lihat
`~/Desktop/RAHASIA_password_juri.txt` (salin ke formulir, jangan ke dokumen lain) · PIN kelas demo siswa: [ISI: PIN]

**Notebook 5 menit (Colab, tanpa GPU/login):**
https://colab.research.google.com/github/muhammadkiro516-netizen/remediaide/blob/main/ml/notebooks/00_demo_cepat.ipynb

**Video demo 2 menit:** [ISI: URL video]

**Catatan orisinalitas (disarankan dicantumkan bila formulir punya kolom catatan):**
> Seluruh komponen machine learning, data olahan, eksperimen, dan laporan dibuat baru untuk CAC MLSC 2026 mulai
> 18 November 2026. Aplikasi web dasar (versi 1, aturan CRI tanpa ML) adalah karya tim sebelumnya dan dipakai sebagai
> baseline serta wadah integrasi.
