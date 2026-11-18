# PROGRESS — log kerja Claude Code

Perbarui setelah setiap task. Entri terbaru di paling atas. Format:
`### YYYY-MM-DD HH:MM — Txx <judul> — [selesai|berjalan|terblokir]`, lalu isi: yang dikerjakan, file output,
angka kunci (dengan path sumbernya), masalah, dan langkah berikutnya.

## Status ringkas
- Fase aktif: P0
- Task berikutnya: T10→T12→T14→T15(Eedi)→T20→T21→T22 begitu unduhan Eedi selesai
- **Sedang berjalan (sesi 1):** unduh Eedi `ml/data/raw/eedi_neurips2020/data.zip` (657 MB, blob resmi
  dqanonymousdata); T32 terjemahan penuh (`ml/runs/*_translate_map/train.log`); T30 TF-IDF penuh
  (`ml/runs/logs/l2_tfidf_full.log`); smoke mDeBERTa CPU (`ml/runs/logs/l2_mdeberta_smoke_cpu.log`).
- **Kode siap, menunggu data Eedi:** `data/eedi.py` (+`--extract`), `data/eedi_card.py`, `scripts/build_features.py`,
  `data/splits.py eedi`, `scripts/e1_b0.py`, `scripts/train_l1_baselines.py`, `scripts/train_l1_lgbm.py`.
- **Menunggu M1:** `scripts/kaggle_prepare.py --user <u>` lalu push `kaggle/kernels/l2_mdeberta`.
- Hari tersisa menuju submit internal (Jum 27 Nov): 9
- Kuota GPU Kaggle terpakai minggu ini: 0 jam

## Blocker (butuh Salman)
- **M1** token Kaggle → memblokir T03, T23, T31. (M2: lisensi MIT sudah dikonfirmasi; persetujuan aturan cukup bila tombol sudah diklik.)
- Pertanyaan T00: apakah ada remote GitHub lama yang ingin dihubungkan? (tidak akan push tanpa izin)

## Angka kunci terbaru
_(belum ada — jangan diisi tanpa path sumber)_

## Pemahaman awal (sesi 1, 18 Nov)
1. Tujuan: v1 (aturan CRI 2×2, `engine.ts`) → RemediAide 2.0 = 3 lapis ML + Pengaman, submit Jum 27 Nov (batas 28 Nov).
2. L1 Pelacak Penguasaan (Eedi T3&4): B0 aturan v1 → B1 → LightGBM → CO-KT; dua framing (a) KT next-correct, (b) kuadran masa depan.
3. L2 Pembaca Alasan (MAP): TF-IDF → mDeBERTa (Kaggle GPU); split acak (MAP@3) + per soal (`category3`); E3 jebakan jawaban benar, E4 terjemahan Indonesia.
4. L3: kalibrasi, conformal α=0,1, selective prediction (titik operasi D-09 dari validasi), fusi naive-Bayes.
5. Pengaman (tebakan cepat) hanya diuji simulasi; tidak dilaporkan sebelum data pilot.
6. Aturan keras: tanpa angka karangan, keputusan dikunci di DECISIONS, anti-leakage + tes, data tidak masuk git, B0 tidak diubah.
7. Test set dibuka sekali di T46; freeze Tingkat S Rab 25 Nov 23:59.
8. Lokal: tabular + terjemahan + smoke test; Kaggle GPU: CO-KT dan mDeBERTa.
9. Web (P6) baru setelah submisi aman, branch `feat/ml-integration`, fallback ke `engine.ts`.
10. Bobot nilai: Implementasi ML 25%, Data 20%, Evaluasi 20%, Inovasi 20%, Masalah 15%.

**Risiko terbesar:** (1) unduhan Eedi otomatis gagal → seluruh P2 tertahan (butuh M3); (2) token Kaggle/aturan MAP
(M1/M2) terlambat → L2 dan CO-KT tertahan, padahal jadwal L2 hanya 2 hari; (3) label kuadran masa depan bergantung
pada confidence yang banyak kosong — porsi baris yang bisa dievaluasi bisa kecil; (4) RAM MacBook Air saat fitur
±1,4 juta baris × SHAP/Optuna; (5) jadwal 9 hari sangat padat, sehingga freeze 25 Nov harus dipatuhi.

## Log

### 2026-11-18 — T20 B0 di Eedi + E1 (pengembangan, CV) — selesai
- `scripts/e1_b0.py` → `ml/reports/tables/E1_b0_cv.csv`, `E1_b0_cv_confusion.csv`, `ml/reports/figures/E1_confusion_b0_cv.png`.
  Hanya siswa CV (test 984 siswa tidak disentuh). Baris E1: 217.480 (3.054 siswa).
- Angka (CI 95% bootstrap per UserId, sumber `ml/reports/tables/E1_b0_cv.csv`): salah kelompok 4 kelas **0,450 [0,440–0,459]**;
  macro-F1 0,412 [0,403–0,419]; "Paham" B0 belum tuntas berikutnya **0,282 [0,270–0,294]**; "Miskonsepsi" B0 tuntas
  berikutnya 0,507 [0,495–0,519]; error biner butuh_remediasi 0,367 [0,363–0,370] (912.731 baris).
- **Keterbatasan wajib di laporan:** label kuadran masa depan adalah proxy. Sebagian "Miskonsepsi → tuntas" berasal dari
  pembelajaran setelah umpan balik Eedi, bukan semata kesalahan aturan. Dibahas di RESULTS §E1.

### 2026-11-18 — T15 Split + utilitas evaluasi — selesai
- `data/processed/eedi_splits.parquet`: test 984 siswa; fold 0–4: 787/787/787/787/786 siswa. UserId unik (dicek).
- `data/processed/map_splits.parquet`: random 5 fold (7.339–7.340 baris), per soal 5 fold × 3 soal; tiap soal di satu fold (dicek).
- `eval/metrics.py`, `eval/stats.py` (+ bootstrap konfusi per kluster cepat): 12 tes lulus (sklearn, DeLong brute-force, MAP@3 manual).

### 2026-11-18 — T14 Fitur L1 anti-leakage — selesai
- `scripts/build_features.py` → `data/processed/eedi_features_{a,b}.parquet` dalam **51 detik**, puncak memori 1,27 GB
  (`data/processed/eedi_features_info.json`). Label biner: 1.139.163 baris; label kuadran 4 kelas: 335.216; dengan
  confidence saat ini: 276.443; dikeluarkan (< 2 percobaan berikutnya di KC): 243.564.
- Distribusi kuadran masa depan: P 53,8%, M 27,4%, T 11,5%, L 7,2%.
- Tes `tests/test_features_leakage.py` (8) lulus, termasuk tiga tes wajib 02 §4.

### 2026-11-18 — T31 temuan teknis — mDeBERTa NaN
- transformers 5.23 memuat bobot sesuai dtype checkpoint (mdeberta-v3-base = fp16). AdamW pada bobot fp16 → NaN setelah
  1 langkah (SGD aman, gradien finite). Perbaikan: `dtype=torch.float32` saat load; fp16 hanya lewat autocast di CUDA.

### 2026-11-18 — T12 Loader + cleaning Eedi — selesai
- `data/interim/eedi_t34.parquet` (1.382.727 baris, 4.918 siswa, 948 soal, 57 KC). Data card `ml/reports/tables/data_card_eedi.md`.
- **Confidence kosong 74,95% baris**; nilai Confidence hanya {0,25,50,75,100}. Baris berkeyakinan: 346.428.
  Kuadran B0 (baris berkeyakinan): P 57,48%, M 29,20%, T 8,60%, L 4,72%.
- PremiumPupil = berhak makan siang gratis/pupil premium (arXiv 2007.12061 §2.3), kosong untuk 57% siswa.
- D-17: gambar soal Eedi tidak boleh dipakai di luar kompetisi NeurIPS → tidak dipakai untuk demo.
- Tes `tests/test_eedi_loader.py` (4, sintetis) lulus.

### 2026-11-18 — T10 Unduh Eedi 2020 — selesai
- Halaman eedi.com/projects/neurips-education-challenge 404. Dipakai blob resmi publik
  `https://dqanonymousdata.blob.core.windows.net/neurips-public/data.zip` (656.787.242 byte, Last-Modified 19 Nov 2020),
  sha256 `c7f01672…` di `ml/data/manifest.json`. M3 tidak diperlukan.

### 2026-11-18 — T44 Modul Pengaman — selesai (simulasi saja, bukan hasil)
- `src/remediaide_ml/guard/rapid_guess.py`: NT10/20/30, GMM 2 komponen per soal (pooled per bucket kata bila < 30 respons),
  τmin B0, `evaluate_flags` (flag rate, akurasi flagged vs unflagged), `agreement` (kappa antarmetode), `simulate`.
- `tests/test_guard.py` 4 tes lulus pada data simulasi. **Tidak dilaporkan sebagai hasil** sampai data pilot ada.

### 2026-11-18 — T13 Loader + cleaning MAP — selesai
- `src/remediaide_ml/data/map.py` → `data/interim/map.parquet` + `data/interim/map_candidates.json` (30 kunci soal×prefiks, maks 6 kandidat).
- Kamus `reports/tables/map_misconception_dictionary.csv`: 39 pasangan (soal, label), deskripsi EN dari Tabel 1
  Rittle-Johnson dkk. 2025 (hlm. 22–23) + terjemahan ID manual. Cocok 100% dengan pasangan di data (diassert).
  Beda penamaan: data `Subtraction`/`Positive` = paper [Subtracts]/[Two negatives is positive].
- Data card `reports/tables/data_card_map.md`: True_Misconception **403 (1,10%)**, 18 baris `prefix_conflict` (D-16),
  median panjang alasan 13 kata. Paper: 52.463 alasan (38.095 asli + 14.368 sintetis), 24% dikode ganda, kappa 0,70–0,90;
  train.csv publik = 36.696 baris, tanpa penanda sintetis.
- Tes `tests/test_map_loader.py` (5 tes, fixture sintetis) lulus.

### 2026-11-18 — T11 Unduh MAP — selesai (via cadangan HF)
- Kaggle belum terautentikasi → mirror HF `kaggle-map/data` rev `1996686e…`. train.csv 36.696 baris × 7 kolom; sha256 di `data/manifest.json`.
- Lisensi: MIT (kartu HF + diskusi HF #2) → `data/raw/map/LICENSE_NOTE.md`. Verifikasi halaman Kaggle tertunda M2.

### 2026-11-18 — T03 Kaggle CLI — terblokir (M1, M2)
- `kaggle` 2.2.5 terpasang di `ml/.venv/bin/`. `kaggle competitions list -s map-charting` → "Authentication required".
- Menunggu M1 (disarankan `ml/.venv/bin/kaggle auth login`) dan M2. T11/T23/T31 ikut tertahan; T11 dicoba lewat cadangan HF.

### 2026-11-18 — T02 Cek mesin — selesai
- `runs/env_report.json`: macOS 27.2.1 arm64 (Apple M5), 10 CPU, **RAM 17,2 GB** (16 GiB), disk bebas 364,8 GB,
  **MPS = true**, CUDA = false. torch 2.15.0, lightgbm 4.7.0, transformers 5.23.0, pandas 3.1.1.
- Placement: data/EDA/LightGBM/kalibrasi lokal; CO-KT dan encoder L2 di Kaggle GPU; opus-mt lokal (CPU/MPS).
- RAM 16 GiB → pandas memakai dtype hemat (int32/float32/category), parquet, baca kolom seperlunya.

### 2026-11-18 — T01 Lingkungan Python — selesai
- Tidak ada python3.12/Homebrew di mesin. Python 3.12.16 dipasang lewat `uv` (pip install di `ml/.bootstrap/`,
  lalu `uv python install 3.12` → `~/.local/bin/python3.12`). `make setup` dijalankan dengan `PATH=~/.local/bin:$PATH`.
- `import lightgbm` gagal (libomp). Tanpa Homebrew: target baru `make fix-libomp` menambah rpath ke `torch/lib/libomp.dylib`
  + codesign ad-hoc. LightGBM 4.7.0 jalan.
- `make test`: **27 passed** (B0 parity). `requirements-lock.txt` (189 paket) ter-commit.

### 2026-11-18 — T05 Kunci keputusan — selesai
- D-01…D-15 ditinjau; tidak ada yang mustahil secara teknis, jadi tidak ada revisi.
- Hal yang diverifikasi saat data ada (bukan revisi): (1) D-03: nilai Confidence Eedi yang sebenarnya muncul
  (diskret atau kontinu) dan hasil pemetaannya ke CRI; (2) D-05: jendela masa depan tanpa satu pun confidence →
  `fut_conf` tak terdefinisi, jadi baris dikeluarkan dari evaluasi kuadran 4 kelas (tetap dipakai untuk biner
  `butuh_remediasi`). Jumlahnya dilaporkan di data card. Ini interpretasi langsung 02 §5, bukan aturan baru.
- D-13: arti PremiumPupil diverifikasi di T12.

### 2026-11-18 — T04 Cek aplikasi v1 (tanpa DB) — selesai
- `npm ci` (Node v26.13.1, npm 11.20.0) sukses. npm 11 memblokir install-scripts (prisma, fsevents, msgpackr);
  `npx prisma generate` tetap jalan.
- Tes modul murni (`src/lib/diagnostic src/lib/template src/lib/exit-ticket`): **9 file, 117 tes lulus, 0 gagal**
  (01_CONTEXT menyebut 123; angka yang benar di mesin ini 117).
- `npm test` (vitest run) penuh: **38 file, 561 tes lulus, 0 gagal**. Ini baseline P6.

### 2026-11-18 — T00 Bootstrap repo — selesai
- `git init -b main`; commit `v1: RemediAide LIDM 2026 (snapshot dari zip)` hanya berisi kode v1 (.gitignore asli).
- Branch `cac/ml`; `.gitignore` root ditambah `__MACOSX/`, `._*`, `ml/.venv/`, `ml/data/{raw,interim,processed,pilot}/`.
- git user lokal repo diset (Salman). Belum ada remote — perlu konfirmasi Salman (lihat Blocker).
- Berikutnya: T01.

### 2026-11-18 — T-1 Paket rencana dipasang — selesai
- Dokumen `docs/cac/*`, `CLAUDE.md`, `.claude/commands/*`, dan kerangka `ml/` ditambahkan.
- `ml/src/remediaide_ml/cri_rule.py` (B0) + `ml/tests/test_cri_rule.py`: 27 tes kesetaraan terhadap
  fixture dari `engine.ts` lulus di lingkungan perencana. Jalankan ulang di T01.
- Berikutnya: T00.
