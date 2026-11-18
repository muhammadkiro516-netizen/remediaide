# CLAUDE.md — RemediAide 2.0 untuk CAC Machine Learning Solution Challenge 2026

Kamu (Claude Code) adalah satu-satunya engineer proyek ini. Pemilik repo (Salman) hanya mengurus surat/izin
dan tindakan manual di `docs/cac/MANUAL_ACTIONS.md`. Semua pekerjaan teknis — dataset, training, evaluasi,
integrasi web, paket submisi — kamu kerjakan sendiri, task demi task, sampai selesai.

## Misi
Ubah RemediAide v1 (aturan CRI 2×2 tanpa ML, Next.js) menjadi **RemediAide 2.0**: mesin diagnosis miskonsepsi
3 lapis ML + 1 pengaman, dibuktikan dengan eksperimen yang jujur dan bisa direproduksi, lalu dipasang di web.

- **Batas submisi penyisihan: Sabtu 28 November 2026.** Target internal: submit Jumat 27 November.
- Wajib dikumpulkan: source code + dataset. 5 tim terbaik masuk final; TM final 30 November 2026.
- Bobot nilai: Implementasi ML 25%, Data 20%, Evaluasi 20%, Inovasi & Dampak 20%, Perumusan Masalah 15%.

## Urutan baca di awal SETIAP sesi (wajib, jangan lewati)
1. `CLAUDE.md` (file ini)
2. `docs/cac/PROGRESS.md` — apa yang sudah selesai, apa yang sedang berjalan, blocker
3. `docs/cac/TASKS.md` — ambil task `[ ]` pertama yang dependensinya sudah `[x]`
4. Spesifikasi yang dirujuk task itu (`docs/cac/0X_*.md`) dan `docs/cac/DECISIONS.md`

Konteks lomba & riset: `docs/cac/01_CONTEXT.md`. Rencana induk: `docs/cac/00_MASTER_PLAN.md`.

## Aturan emas (melanggar = merusak peluang menang)
1. **Jangan pernah mengarang angka.** Setiap angka di laporan/README/slide harus berasal dari file di
   `ml/reports/` yang dihasilkan kode. Belum ada angka → tulis placeholder `[E2:AUC]`, bukan tebakan.
2. **Jangan mengubah aturan setelah melihat hasil.** Split, metrik, ambang, dan seed dikunci di
   `docs/cac/DECISIONS.md` dan `ml/configs/base.yaml`. Perubahan hanya lewat entri DECISIONS baru beserta alasannya.
3. **Anti-leakage.** Fitur hanya dari masa lalu siswa; target encoding out-of-fold; split per siswa (Eedi) dan
   per soal (MAP). Setiap pipeline fitur punya unit test leakage.
4. **Data tidak pernah masuk git.** `ml/data/**` di-ignore. Lisensi: Eedi 2020 = CC BY-NC-ND 4.0 (jangan
   sebarkan versi modifikasi); MAP = cek di Kaggle (tercatat MIT). Data pilot siswa = anonim, butuh persetujuan
   orang tua (UU PDP Pasal 25), tidak pernah di-commit, tidak pernah dikirim ke layanan pihak ketiga.
5. **B0 = kode v1 apa adanya.** `ml/src/remediaide_ml/cri_rule.py` sudah identik dengan `engine.ts`
   (27 tes kesetaraan lulus). Jangan "memperbaiki" B0; kalau perlu varian, buat fungsi baru bernama lain.
6. **Jujur soal keterbatasan.** Jika model kalah dari baseline, laporkan. Jika eksperimen tidak sempat, tandai
   "rencana", jangan dihapus diam-diam.
7. **Jangan merusak aplikasi v1.** Perubahan Next.js hanya di fase P6, di branch `feat/ml-integration`,
   dengan fallback ke `engine.ts` bila layanan ML mati. Semua tes lama (`npm test`) harus tetap lulus.
8. **Selesaikan Tingkat S dulu** (lihat MASTER_PLAN). Tingkat A hanya jika Tingkat S beres dan waktunya ada.

## Cara kerja per task
1. Tandai task `[~]` di TASKS.md, tulis "mulai Txx" di PROGRESS.md.
2. Kerjakan. Kode → `ml/src/remediaide_ml/...`, notebook tipis yang memanggil modul → `ml/notebooks/NN_*.ipynb`.
3. Verifikasi kriteria "Selesai jika" pada task tersebut (jalankan tes/skrip, buka file output, cek angka).
4. Tandai `[x]`, catat di PROGRESS.md: hasil, file output, angka kunci (dengan path sumbernya), masalah.
5. Commit kecil dengan pesan `Txx: <ringkas>`. Jangan push ke remote tanpa diminta, kecuali task submisi.
6. Lanjut ke task berikutnya tanpa menunggu, kecuali task bertanda **[MANUAL]** atau ada blocker.

Jika blocker butuh pemilik repo (token, izin, klik di website): tulis di bagian "Blocker" PROGRESS.md dan
`MANUAL_ACTIONS.md`, beri tahu dengan jelas apa yang harus dia lakukan, lalu kerjakan task lain yang tidak
terblokir.

## Lingkungan
- Mesin pemilik: **MacBook Air Apple Silicon (arm64), tanpa GPU NVIDIA.** MPS mungkin tersedia; RAM terbatas.
- Python: `ml/.venv` (Python 3.12 diutamakan; 3.11–3.13 didukung). Semua perintah ML dijalankan dari folder `ml/`.
- Training berat (transformer CO-KT, fine-tune encoder Lapis 2) → **GPU Kaggle** lewat Kaggle CLI
  (`kaggle kernels push/status/output`). Lihat `docs/cac/03_MODEL_SPEC.md` bagian "Compute plan".
- **Proses > 8 menit jangan dijalankan foreground.** Jalankan di background (`nohup ... > runs/<id>/train.log 2>&1 &`
  atau fitur background Bash), simpan PID, cek log berkala. Batas waktu satu perintah Bash adalah 10 menit.
- LightGBM di macOS butuh OpenMP: jika `import lightgbm` gagal soal `libomp`, jalankan `brew install libomp`.
- Aplikasi web: Next.js 14 + Prisma + PostgreSQL + Redis (lihat README utama). Folder `prisma/migrations`
  memang tidak ada (di-gitignore); buat dengan `npx prisma migrate dev --name init` saat P6.

## Konvensi
- Kode, nama variabel, komentar: bahasa Inggris. Dokumen untuk juri (README submisi, laporan, kartu model): Bahasa Indonesia.
- Setiap run training: `ml/runs/<YYYYMMDD-HHMM>_<nama>/` berisi `config.yaml`, `train.log`, `metrics.json`,
  artefak model. Hasil final yang dipakai laporan disalin ke `ml/reports/` + dicatat di `ml/reports/RESULTS.md`.
- Gambar: `ml/reports/figures/E<n>_<nama>.png` (dpi 200, label sumbu Bahasa Indonesia).
- Tabel: `ml/reports/tables/E<n>_<nama>.csv` dan versi Markdown di RESULTS.md.
- Seed global 20261118 (`remediaide_ml.seed.set_seed`).

## Perintah slash yang tersedia
- `/mulai` — sesi pertama: setup lingkungan dan mulai dari T00.
- `/lanjut` — baca PROGRESS + TASKS, kerjakan task berikutnya sampai selesai, ulangi.
- `/status` — ringkasan progres, angka terbaru, blocker, sisa hari menuju 27/28 November.
- `/verifikasi` — audit kualitas: tes, leakage, reproduksibilitas, angka vs sumber, lisensi.
