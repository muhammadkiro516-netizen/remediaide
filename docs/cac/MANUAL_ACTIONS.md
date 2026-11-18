# MANUAL_ACTIONS — yang hanya bisa dikerjakan Salman

Claude Code mengerjakan semua hal lainnya. Kerjakan item ini, centang, lalu ketik di Claude Code:
`M<n> sudah selesai`.

## Hari ini (Rab 18 Nov) — supaya pekerjaan teknis tidak terhenti
- [ ] **M1. Token Kaggle**
  1. Buat atau login akun di kaggle.com, lalu verifikasi nomor HP (Settings → Phone verification). Ini syarat GPU.
  2. Settings → API → **Create New Token**.
  3. Jika yang terunduh `kaggle.json`: pindahkan ke `~/.kaggle/kaggle.json`, lalu jalankan
     `chmod 600 ~/.kaggle/kaggle.json` di Terminal.
     Jika yang tampil token teks: simpan sebagai variabel `KAGGLE_API_TOKEN` di `~/.zshrc`
     (`export KAGGLE_API_TOKEN=...`), lalu buka terminal baru.
  4. **Jangan** tempel token di chat atau commit ke git.
- [ ] **M2. Setujui aturan kompetisi MAP:** buka
  https://www.kaggle.com/competitions/map-charting-student-math-misunderstandings → tab Data/Rules →
  klik "I Understand and Accept" atau "Join". Sambil di sana, lihat tab Data dan catat lisensinya.
- [ ] **M3. (Hanya jika Claude Code minta)** unduh dataset Eedi manual dari
  https://eedi.com/projects/neurips-education-challenge (tombol "Download Eedi Dataset"), lalu taruh file zip
  di `ml/data/raw/eedi_neurips2020/`.
- [ ] **M4. Surat:** minta surat pengantar penelitian dari kampus ke SMA Advent Tanjung Barat. Tanyakan ke
  bagian akademik apakah uji coba kelas cukup dengan izin sekolah, atau perlu izin wali kota (Pergub DKI 47/2011).
- [ ] **M5. Sekolah:** hubungi SMA Advent Tanjung Barat. Minta 2–3 kelas X (30 menit per kelas) dan
  2 guru matematika sebagai pelabel (±2 jam total per guru).

## Minggu ini
- [ ] **M6. Panitia:** simpan bukti izin pemakaian konsep RemediAide. Minta rulebook revisi terbaru dan tanyakan
  format pengumpulan dataset (link, unggah, batas ukuran) dan apakah ada laporan wajib.
- [ ] **M7. (Untuk P6)** pasang Docker Desktop untuk Mac, atau izinkan Claude Code memasang PostgreSQL via Homebrew.
- [ ] **M8. (Cadangan GPU)** akun Google untuk Colab, jika kuota Kaggle habis.
- [ ] **M9. (Untuk deploy)** akun penyedia hosting layanan ML yang dipilih Claude Code di T69, dan akses Vercel project yang ada.
- [ ] **M10. GitHub:** buat repo kosong `remediaide-ml` (privat) atau izinkan Claude Code memakai `gh`
  (`gh auth login`).

## Saat izin pilot keluar
- [ ] **M11.** Cetak dan bagikan formulir persetujuan (`docs/cac/pilot/consent_form.pdf`), lalu kumpulkan.
- [ ] **M12.** Jalankan sesi pilot di kelas (Claude Code menyiapkan PIN dan panduan langkah demi langkah).
- [ ] **M13.** Serahkan `labeling_sheet.xlsx` ke 2 guru, lalu kumpulkan hasilnya.
- [ ] **M14.** Klik "Ekspor riset" di dasbor sebelum auto-wipe.

## Submisi
- [ ] **M15.** Kirim link repo/berkas lewat formulir panitia (Claude Code menyiapkan isinya), lalu simpan bukti kirim.
