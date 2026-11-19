# MANUAL_ACTIONS — yang hanya bisa dikerjakan Salman

Claude Code mengerjakan semua hal lainnya. Kerjakan item ini, centang, lalu ketik di Claude Code:
`M<n> sudah selesai`.

## Hari ini (Rab 18 Nov) — supaya pekerjaan teknis tidak terhenti
- [x] **M1. Token Kaggle** — selesai 18 Nov (OAuth, akun `avlsalmoon`)
  1. Buat atau login akun di kaggle.com, lalu verifikasi nomor HP (Settings → Phone verification). Ini syarat GPU.
  2. Settings → API → **Create New Token**.
  3. Jika yang terunduh `kaggle.json`: pindahkan ke `~/.kaggle/kaggle.json`, lalu jalankan
     `chmod 600 ~/.kaggle/kaggle.json` di Terminal.
     Jika yang tampil token teks: simpan sebagai variabel `KAGGLE_API_TOKEN` di `~/.zshrc`
     (`export KAGGLE_API_TOKEN=...`), lalu buka terminal baru.
  4. **Jangan** tempel token di chat atau commit ke git.
  5. **Cara termudah (Kaggle CLI 2.2.5 sudah terpasang di venv):** buka Terminal dan jalankan
     `~/Downloads/remediaide-main/ml/.venv/bin/kaggle auth login`. Ikuti login di browser. Kredensial
     tersimpan lokal; langkah 2–3 tidak perlu. Cek: `~/Downloads/remediaide-main/ml/.venv/bin/kaggle competitions list -s map`.
- [~] **M2. Setujui aturan kompetisi MAP:** — lisensi MIT dikonfirmasi 18 Nov; `userHasEntered` masih False (tidak memblokir, data MAP lewat dataset privat). buka
  https://www.kaggle.com/competitions/map-charting-student-math-misunderstandings → tab Data/Rules →
  klik "I Understand and Accept" atau "Join". Sambil di sana, lihat tab Data dan catat lisensinya.
- [x] **M3. (Tidak diperlukan — blob resmi terunduh otomatis)** unduh dataset Eedi manual dari
  https://eedi.com/projects/neurips-education-challenge (tombol "Download Eedi Dataset"), lalu taruh file zip
  di `ml/data/raw/eedi_neurips2020/`.
- [ ] **M4. Surat:** minta surat pengantar penelitian dari kampus ke SMA Advent Tanjung Barat. Tanyakan ke
  bagian akademik apakah uji coba kelas cukup dengan izin sekolah, atau perlu izin wali kota (Pergub DKI 47/2011).
- [ ] **M5. Sekolah:** hubungi SMA Advent Tanjung Barat. Minta 2–3 kelas X (30 menit per kelas) dan
  2 guru matematika sebagai pelabel (±2 jam total per guru).

## Mendesak (19 Nov)
- [ ] **M16. KEAMANAN — kerjakan paling dulu** (rinci: `docs/cac/SECURITY_NOTES.md`). Repo GitHub **publik**.
  1. **Cabut token GitHub** yang pernah ditempel di chat: github.com → Settings → Developer settings →
     Personal access tokens → pilih token itu → *Delete*. Untuk push berikutnya buat token baru (jangan tempel di chat).
  2. **Reset password Neon**: console.neon.tech → project → Branches → `main` → Roles → *Reset password*. Salin connection
     string baru → Vercel → project remediaide → Settings → Environment Variables → ganti `DATABASE_URL` (pooled) dan
     `DIRECT_URL` (direct) → Deployments → *Redeploy*.
  3. **Ganti password akun seed di produksi** (password lama `demo123`/`remedi123` terlihat publik di `prisma/seed.ts`):
     ```bash
     cd ~/Downloads/remediaide-main/.worktrees/web
     DATABASE_URL="<connection string Neon BARU>" SEED_PASSWORD="<min 12 karakter>" \
     SEED_SUPERADMIN_PASSWORD="<min 12 karakter, beda>" npx tsx scripts/rotate-seed-passwords.ts
     ```
     Hasil yang benar: `Password diganti: 4 akun demo, 1 akun superadmin.` Simpan password baru di password manager.
- [ ] **M1b. Login ulang Kaggle** (token OAuth kedaluwarsa): `~/Downloads/remediaide-main/ml/.venv/bin/kaggle auth login --force`.

- [ ] **M17. Hosting layanan ML di Hugging Face Spaces** (semua file sudah disiapkan; butuh akun HF Salman).
  Ukuran unggahan 393,3 MB (L2 = student ONNX; mDeBERTa 1,1 GB tidak ikut). Disarankan **Space privat**: bobot Lapis 1
  dilatih dari Eedi (CC BY-NC-ND), jadi jangan dipakai komersial.
  1. huggingface.co → New Space → nama `remediaide-ml`, SDK **Docker** (Blank), hardware **CPU basic**, visibilitas **Private**.
  2. Settings → Access Tokens → buat token **Write** (untuk unggah) dan token **Read** (untuk Vercel). Jangan tempel di chat.
  3. Di Terminal:
     ```bash
     cd ~/Downloads/remediaide-main/ml && .venv/bin/python scripts/build_hf_space.py
     cd ../submission/hf_space && git init -b main && git lfs install && git add . && git commit -m "RemediAide ML service"
     git remote add origin https://huggingface.co/spaces/<USERNAME_HF>/remediaide-ml
     git push -u origin main      # username = akun HF, password = token Write
     ```
     (Butuh `git lfs`: `brew install git-lfs` bila belum ada.) Tunggu build ±10–15 menit sampai status *Running*.
  4. Cek: `curl -H "Authorization: Bearer <token Read>" https://<USERNAME_HF>-remediaide-ml.hf.space/health` → `"status":"ok"`.
  5. Vercel → Settings → Environment Variables: `ML_SERVICE_URL=https://<USERNAME_HF>-remediaide-ml.hf.space`,
     `ML_SERVICE_TOKEN=<token Read>`, `ML_TIMEOUT_MS=15000` (Space gratis bisa tidur; panggilan pertama lambat),
     `RESEARCH_EXPORT_SALT` sudah ada. Lalu *Redeploy*.
  6. Ketik `M17 sudah selesai` agar Claude Code menguji end-to-end di produksi.
- [x] **M19. Nama lengkap tim** — selesai 20 Nov (Muhammad Salman Al Farisi, Lubna Maryam, Muhammad Farel Rizky) untuk README (`README.md` bagian Riwayat, `ml/README.md` §8): ganti `[nama lengkap]` untuk
  Salman (ketua), Luna, dan Farel. Cukup ketik nama lengkapnya ke Claude Code.
- [ ] **M18. Lisensi kode aplikasi web:** README lama menulis "Proprietary"; kode ML sudah MIT. Putuskan lisensi kode web
  (misalnya MIT) bila rulebook meminta kode terbuka.

## Minggu ini
- [ ] **M6. Panitia:** simpan bukti izin pemakaian konsep RemediAide. Minta rulebook revisi terbaru dan tanyakan
  format pengumpulan dataset (link, unggah, batas ukuran) dan apakah ada laporan wajib.
- [ ] **M7. (Untuk P6)** pasang Docker Desktop untuk Mac, atau izinkan Claude Code memasang PostgreSQL via Homebrew.
- [ ] **M8. (Cadangan GPU)** akun Google untuk Colab, jika kuota Kaggle habis.
- [x] **M9. (Untuk deploy)** akun penyedia hosting layanan ML yang dipilih Claude Code di T69, dan akses Vercel project yang ada.
- [x] **M10. GitHub:** buat repo kosong `remediaide-ml` (privat) atau izinkan Claude Code memakai `gh`
  (`gh auth login`).

## Saat izin pilot keluar
- [ ] **M11.** Cetak dan bagikan formulir persetujuan (`docs/cac/pilot/consent_form.pdf`), lalu kumpulkan.
- [ ] **M12.** Jalankan sesi pilot di kelas (Claude Code menyiapkan PIN dan panduan langkah demi langkah).
- [ ] **M13.** Serahkan `labeling_sheet.xlsx` ke 2 guru, lalu kumpulkan hasilnya.
- [ ] **M14.** Klik "Ekspor riset" di dasbor sebelum auto-wipe.

## Submisi
- [ ] **M15.** Kirim link repo/berkas lewat formulir panitia (Claude Code menyiapkan isinya), lalu simpan bukti kirim.
