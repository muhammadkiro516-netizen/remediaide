# TASKS — daftar kerja berurutan untuk Claude Code

Legenda: `[ ]` belum, `[~]` berjalan, `[x]` selesai, `[!]` terblokir (tulis alasannya).
**[S]**/**[A]**/**[B]** = tingkat lingkup. **[MANUAL]** = menunggu tindakan Salman (lihat MANUAL_ACTIONS.md).
Ambil task `[ ]` pertama yang dependensinya `[x]`. Jika terblokir, lompat ke task lain yang bisa dikerjakan.
Semua path ML relatif terhadap `ml/`.

---

## P0 — Setup (Rab 18 – Kam 19 Nov)

- [x] **T00 [S] Bootstrap repo**
  - Pastikan di root repo RemediAide (`~/Downloads/remediaide-main`, berisi package.json).
  - **Folder ini berasal dari zip dan belum menjadi repo git.** Jika `git rev-parse` gagal:
    1. `git init -b main`.
    2. Commit pertama **hanya berisi kode v1**, tanpa `CLAUDE.md`, `.claude/`, `docs/cac/`, `ml/`, dan
       `MULAI_DI_SINI.md`. Pesannya: `v1: RemediAide LIDM 2026 (snapshot dari zip)`. Commit ini menjadi bukti
       pemisah antara v1 dan pekerjaan baru.
    3. Buat branch `cac/ml`, lalu commit paket rencana: `T00: paket rencana RemediAide 2.0`.
  - Jika sudah repo git: buat branch `cac/ml` dari branch utama.
  - Pastikan `.gitignore` root mengabaikan `.env*.local`, `node_modules`, `ml/.venv`, dan `ml/data/` (aturan
    rinci ada di `ml/.gitignore`). Pastikan juga `__MACOSX/` dan `.DS_Store` diabaikan.
  - Tanyakan ke Salman apakah ada remote GitHub lama yang ingin dihubungkan. Jangan push tanpa izin.
  - Baca seluruh `docs/cac/*.md` sekali. Tulis ringkasan pemahaman 10 baris di PROGRESS.md.
  - Selesai jika: commit v1 + branch `cac/ml` + commit T00 ada (`git log --oneline` menunjukkan keduanya).

- [x] **T01 [S] Lingkungan Python** — dep: T00
  - `cd ml && make setup`. Jika python3.12 tidak ada: `brew install python@3.12` (atau pakai `uv`).
  - Jika `import lightgbm` gagal karena libomp → `brew install libomp`, lalu ulangi.
  - Torch untuk macOS arm64 dari pip standar (MPS). Jangan pasang CUDA build.
  - Selesai jika: `make test` lulus (27 tes B0) dan `requirements-lock.txt` ter-commit.

- [x] **T02 [S] Cek mesin** — dep: T01
  - `make env` → `runs/env_report.json`. Catat RAM, MPS, dan placement di PROGRESS.md.
  - Jika RAM < 16 GB: semua pandas memakai dtype hemat dan parquet, serta baca kolom seperlunya.
  - Selesai jika: env_report.json ada dan placement tercatat.

- [x] **T03 [S] Kaggle CLI** — dep: T01 · butuh **M1**, **M2**
  - **[!] 18 Nov: belum terautentikasi, menunggu M1/M2.**
  - `kaggle competitions list -s map-charting`. Gagal → tandai `[!]`, tulis blocker M1/M2, lanjut T10.
  - Sukses → `kaggle competitions files -c map-charting-student-math-misunderstandings`, lalu catat daftar file.
  - Selesai jika: autentikasi sukses dan daftar file MAP tercatat.

- [x] **T04 [S] Cek aplikasi v1 (tanpa DB)** — dep: T00
  - `npm ci` lalu jalankan tes modul murni (`npx vitest run src/lib/diagnostic src/lib/template src/lib/exit-ticket`).
    Tes yang butuh Prisma client boleh gagal sebelum `prisma generate`; jalankan `npx prisma generate` dulu.
  - Selesai jika: jumlah tes lulus/gagal tercatat sebagai baseline untuk P6.

- [x] **T05 [S] Kunci keputusan** — dep: T00
  - Baca DECISIONS.md D-01…D-15. Jika ada yang mustahil dijalankan secara teknis, tambahkan entri revisi
    beserta alasannya. Jangan diam-diam berbeda.
  - Selesai jika: DECISIONS ditinjau dan catatannya ada di PROGRESS.

## P1 — Data (Kam 19 – Jum 20 Nov) · spesifikasi: 02_DATA_SPEC.md

- [x] **T10 [S] Unduh Eedi 2020** — dep: T01
  - Ikuti 02 §1 (curl halaman → cari href unduhan). Simpan ke `data/raw/eedi_neurips2020/`, ekstrak,
    hitung sha256, dan tulis `data/manifest.json`.
  - Gagal mendapat link → `[!]` + blocker M3. Kerjakan T13 jika MAP tersedia.
  - Selesai jika: kelima file Task 3&4 ada dan jumlah baris train_task_3_4 tercatat (harapan ±1,38 juta).

- [x] **T11 [S] Unduh MAP** — dep: T03 (atau cadangan HF)
  - `kaggle competitions download -c map-charting-student-math-misunderstandings -p data/raw/map && unzip`.
    Cadangan: `datasets.load_dataset("kaggle-map/data")` disimpan ke parquet.
  - Catat lisensi di `data/raw/map/LICENSE_NOTE.md` dan update DECISIONS (catatan verifikasi).
  - Selesai jika: train.csv terbaca, kolom diverifikasi, jumlah baris tercatat.

- [x] **T12 [S] Loader + cleaning Eedi** — dep: T10
  - `src/remediaide_ml/data/eedi.py`: `load_raw()`, `build_interim()` sesuai 02 §1 → `data/interim/eedi_t34.parquet`.
  - Tes `tests/test_eedi_loader.py` pada fixture kecil sintetis (tidak memakai data asli).
  - Data card → `reports/tables/data_card_eedi.md`, lalu isi catatan verifikasi DECISIONS (kolom, PremiumPupil,
    % confidence kosong).
  - Selesai jika: parquet ada, tes lulus, data card terisi angka nyata.

- [x] **T13 [S] Loader + cleaning MAP** — dep: T11
  - `src/remediaide_ml/data/map.py` → `data/interim/map.parquet`, kandidat per soal, kamus miskonsepsi
    (`reports/tables/map_misconception_dictionary.csv`, deskripsi dari tabel di paper Rittle-Johnson 2025,
    dengan terjemahan Indonesia manual).
  - Data card → `reports/tables/data_card_map.md`. Tes dengan fixture sintetis.
  - Selesai jika: parquet + kamus + data card ada dan tes lulus.

- [x] **T14 [S] Fitur L1 anti-leakage** — dep: T12
  - `src/remediaide_ml/features/history.py` (framing a dan b, 02 §4) dan `labels.py` (kuadran masa depan, 02 §5).
    Implementasi vektor (groupby + shift/cumsum), tanpa loop per baris.
  - `tests/test_features_leakage.py` dengan tiga tes wajib di 02 §4.
  - Selesai jika: `data/processed/eedi_features_{a,b}.parquet` ada, tes leakage lulus, dan waktu build tercatat.

- [x] **T15 [S] Split + utilitas evaluasi** — dep: T12, T13
  - `src/remediaide_ml/data/splits.py` (02 §6) → `data/processed/{eedi,map}_splits.parquet`.
  - `src/remediaide_ml/eval/metrics.py`: auc, logloss, brier, ece, map_at_k, macro_f1, per-class recall,
    cohen_kappa, misgroup_rate. `eval/stats.py`: cluster bootstrap CI, fast DeLong (paired), McNemar
    (statsmodels), Holm.
  - Tes: bandingkan dengan sklearn; DeLong vs kasus buku teks; MAP@3 vs contoh manual.
  - Selesai jika: semua tes lulus dan split tersimpan (cek tidak ada UserId/QuestionId yang bocor antar split).

- [x] **T16 [S] EDA** — dep: T14, T13
  - `notebooks/01_eda.ipynb` memanggil modul. Gambar: distribusi confidence, **kalibrasi diri siswa**
    (akurasi vs confidence per bin, sumbu Bahasa Indonesia), missingness, panjang sekuens, kategori MAP per
    soal, panjang alasan. Simpan ke `reports/figures/E0_*.png`.
  - Selesai jika: notebook berjalan bersih dan 5 temuan EDA tertulis di RESULTS.md §2.

## P2 — Lapis 1 (Jum 20 – Min 22 Nov) · spesifikasi: 03 §1, 04 E1/E2

- [x] **T20 [S] B0 di Eedi + E1 (pengembangan)** — dep: T14, T15
  - `classify_quadrant` pada baris berkeyakinan. Hitung E1 di fold CV (test **belum** disentuh).
  - Selesai jika: `reports/tables/E1_b0_cv.csv` dan confusion matrix CV ada.

- [x] **T21 [S] B1 baselines** — dep: T20
  - B1a dan B1b untuk framing (a) dan (b), 5 fold. Simpan OOF di `runs/<id>/oof.parquet`.
  - Selesai jika: tabel CV B0/B1 ada.

- [x] **T22 [S] B2 LightGBM + Optuna + E2** — dep: T21
  - `src/remediaide_ml/l1/lgbm.py`. Optuna 50 trial (fold 0), lalu 5 fold. Ablation S0–S6 (E2) pada framing (b).
  - Jalankan di background. Log ke `runs/<id>/train.log`.
  - Selesai jika: tabel E2 CV + gambar draft, model fold tersimpan, dan SHAP global
    (`reports/figures/L1_shap_beeswarm.png`).

- [x] **T23 [S] M1 CO-KT** — dep: T15, T03
  - `src/remediaide_ml/l1/cokt.py` (03 §1, M1) + `scripts/train_cokt.py`.
  - Smoke test lokal (1% siswa, 1 epoch) harus lulus sebelum push ke Kaggle.
  - Upload dataset privat (`remediaide-processed`, `remediaide-ml-src`), lalu buat kernel `kaggle/kernels/cokt/`.
    Jalankan penuh + ablation (tanpa keyakinan, tanpa opsi). Seed: 5 untuk penuh, 3 untuk ablation.
  - Unduh output ke `runs/<id>/kaggle_output/`. Catat jam GPU.
  - Selesai jika: metrik CV CO-KT (a) AUC dan (b) macro-F1 + ablation tercatat dengan CI.

- [x] **T24 [S] Konsolidasi L1** — dep: T22, T23
  - Pilih model produksi berdasarkan CV (D-15). Simpan artefak ke `models/` (03 §5). Fungsi `explain()` yang
    menghasilkan 3 alasan Bahasa Indonesia dari SHAP. Evaluasi akurasi prediksi opsi.
  - Selesai jika: `models/l1_*` ada, `reports/tables/L1_cv_summary.csv` ada, notebook 03/04 bersih.

- [ ] **T25 [A] Baseline pyKT resmi** — dep: T23
  - Di Kaggle, `pip install pykt-toolkit`, lalu jalankan DKT/AKT/simpleKT pada split yang sama (framing a).
    Jika instalasi bermasalah lebih dari 1 jam, hentikan dan catat.
  - Selesai jika: tabel pembanding resmi, atau catatan gagal beserta alasannya.

## P3 — Lapis 2 (Min 22 – Sel 24 Nov) · spesifikasi: 03 §2, 04 E3/E4

- [x] **T30 [S] B0 TF-IDF** — dep: T13, T15
  - Split random (MAP@3) dan per soal (`category3` macro-F1). OOF disimpan.
  - Selesai jika: tabel CV B0 L2 ada.

- [x] **T31 [S] M1 mDeBERTa di Kaggle** — dep: T30, T03
  - `src/remediaide_ml/l2/encoder.py` + `kaggle/kernels/l2_mdeberta/`. Smoke test lokal (200 contoh, 20 step).
  - 5 fold random (target, masking kandidat) + 5 fold per soal (`category3`). Simpan OOF logits.
    Cek NaN pada fp16; jika ada → fp32 dan catat di DECISIONS.
  - Selesai jika: MAP@3 CV dan macro-F1 per soal tercatat dengan CI, dan model fold terbaik tersimpan
    (Kaggle dataset privat atau HF private).

- [x] **T32 [S] Terjemahan Indonesia + QA** — dep: T13
  - `src/remediaide_ml/data/translate.py` (02 §3): placeholder matematika, opus-mt-en-id, dan tes pada 20 contoh.
  - Terjemahkan seluruh MAP (dipakai juga untuk instrumen pilot T70). Jalankan di background karena makan waktu.
  - QA 100 sampel → `reports/tables/translation_qa.csv` + `reports/translation_card.md`.
  - Selesai jika: `data/processed/map_id.parquet` lengkap dan tingkat kesalahan QA tercatat.

- [x] **T33 [S] E3 jebakan jawaban benar** — dep: T31
  - Selesai jika: `reports/tables/E3_true_misconception.csv` (B0 vs B0-TFIDF vs M1) dan PR curve ada.

- [x] **T34 [S] E4 lintas bahasa** — dep: T31, T32
  - Inferensi M1 pada test fold terjemahan (kernel Kaggle atau lokal MPS jika muat).
  - Selesai jika: `reports/tables/E4_crosslingual.csv` ada beserta selisih dan CI.

- [ ] **T35 [A] Distilasi + ONNX + E7** — dep: T31
  - Student MiniLM multibahasa → ONNX int8. Ukur ukuran, latensi, dan penurunan metrik.
  - Selesai jika: `reports/tables/E7_efficiency.csv` ada.

- [ ] **T36 [A] Retrieval untuk soal baru** — dep: T31
  - multilingual-e5 (alasan ↔ deskripsi miskonsepsi soal tersebut) pada split per soal.
  - Selesai jika: MAP@3 retrieval per soal tercatat.

## P4 — Lapis 3 + evaluasi (Sel 24 – Rab 25 Nov) · spesifikasi: 03 §3–4, 04 E5–E8

- [x] **T40 [S] Kalibrasi** — dep: T24, T31
  - `src/remediaide_ml/l3/calibration.py`. ECE sebelum dan sesudah. Reliability diagram L1 & L2.
  - Selesai jika: gambar E5_reliability_* dan tabel ECE ada.

- [x] **T41 [S] Ensemble + conformal** — dep: T40
  - `l3/conformal.py` (LAC, APS). Cakupan empiris di CV. Simpan `models/l3_conformal_v1.json`.
  - Selesai jika: cakupan ≈ 90% (laporkan nilai sebenarnya) dan ukuran himpunan tercatat.

- [x] **T42 [S] Selective prediction + titik operasi (E5)** — dep: T41
  - Kurva coverage-risk. Titik operasi menurut aturan D-09, dihitung di validasi.
  - Selesai jika: `E5_coverage_risk.png` ada dan titik operasi dicatat di DECISIONS (sebagai hasil penerapan D-09, bukan revisi).

- [x] **T43 [S] Fusi L3 + `hidden_misconception`** — dep: T42
  - `l3/fusion.py`: produk naive-Bayes (siap tanpa label) + kerangka stacking (aktif saat label pilot ada).
    Tes pada data sintetis, termasuk bahwa probabilitas ternormalisasi.
  - Fungsi `diagnose(payload) -> response` sesuai kontrak 05 §4. Ini inti layanan.
  - Selesai jika: tes kontrak lulus dengan input contoh.

- [x] **T44 [S] Modul Pengaman** — dep: T15
  - `guard/rapid_guess.py`: NT10/20/30, GMM, dan pembanding τmin B0. Tes dengan data simulasi.
    **Tidak dilaporkan sebagai hasil** sebelum ada data pilot.
  - Selesai jika: tes lulus dan API siap dipakai.

- [x] **T45 [S] E6 fairness + E8 dampak** — dep: T42
  - Selesai jika: `E6_fairness.csv` dan `E8_impact.csv` versi CV ada.

- [x] **T46 [S] Buka test set (sekali) + RESULTS.md** — dep: T20–T24, T30–T34, T40–T45
  - Jalankan semua model terpilih + baseline pada test Eedi dan test fold MAP dalam satu skrip
    `scripts/final_eval.py`. Hitung E1, E2, E3, E4, E5, E6, E8 dengan CI dan uji signifikansi.
  - Isi `reports/RESULTS.md` sesuai format 04, **termasuk kalimat utama**.
  - Selesai jika: RESULTS.md lengkap, setiap angka menunjuk ke tabel sumber, dan gambar final tersedia.

- [ ] **T47 [S] FREEZE Tingkat S** — dep: T46 · tenggat Rab 25 Nov 23:59
  - `make all` dari data mentah (bagian GPU memakai output Kaggle yang tersimpan) lalu bandingkan dengan
    RESULTS (toleransi 07 §6). Tag git `freeze-tierS`.
  - Selesai jika: reproduksi lolos dan tag dibuat.

## P5 — Submisi (Kam 26 – Jum 27 Nov) · spesifikasi: 07_SUBMISSION.md

- [ ] **T50 [S] Susun repo submisi** — dep: T47
  - `submission/remediaide-ml/` sesuai struktur 07 §1 (salin dari `ml/`, bersihkan). Notebook 01–07 dijalankan.
  - Selesai jika: struktur lengkap dan notebook ber-output.

- [ ] **T51 [S] README + REPORT + kartu model/data** — dep: T50
  - Tulis sesuai 07 §2–4 dalam Bahasa Indonesia yang jelas. Diagram arsitektur dibuat sebagai PNG dengan matplotlib.
  - `scripts/check_numbers.py` lulus.
  - Selesai jika: keempat dokumen selesai dan pemeriksaan angka lulus.

- [ ] **T52 [S] Paket dataset** — dep: T50 · cek **M6**
  - Sesuai 07 §5 dan jawaban panitia soal format.
  - Selesai jika: `data/README.md` + skrip unduh + checksum ada, dan arsip asli/terjemahan disertakan bila diizinkan.

- [ ] **T53 [S] Audit akhir** — dep: T51, T52
  - Checklist 07 §6 lengkap: clone segar, venv segar, reproduksi, pemindaian rahasia, lisensi, paragraf riwayat v1.
  - Selesai jika: semua butir checklist `[x]` dengan bukti di PROGRESS.

- [ ] **T54 [S][MANUAL] Kirim** — dep: T53 · butuh **M10**, **M15**
  - Push ke GitHub `remediaide-ml`, buat zip cadangan, dan siapkan teks isian formulir panitia di
    `submission/FORM_TEXT.md`. Salman yang mengirim.
  - Selesai jika: Salman mengonfirmasi bukti kirim.

## P6 — Integrasi web (mulai Kam 26 Nov, setelah P5 aman) · spesifikasi: 05_INTEGRATION_SPEC.md

- [ ] **T60 [S] Jalankan aplikasi lokal** — dep: T04 · mungkin butuh **M7**
- [ ] **T61 [S] Migrasi Prisma `ml_integration`** — dep: T60
- [ ] **T62 [S] Input alasan di portal siswa** — dep: T61
- [ ] **T63 [S] Layanan FastAPI `ml/service/` + Dockerfile + tes** — dep: T43
- [ ] **T64 [S] Panggilan ML di compute.ts + fallback + tes** — dep: T61, T63
- [ ] **T65 [S] Mode AI, antrean guru, umpan balik guru** — dep: T64
- [ ] **T66 [S] Ekspor riset berbasis persetujuan** — dep: T61
- [ ] **T67 [S] Perbaikan landing page** — dep: T60
- [ ] **T68 [A] Mode offline ONNX** — dep: T65, T35
- [ ] **T69 [S] Deploy web + layanan ML, uji end-to-end dari HP** — dep: T65 · butuh **M9**
  - Setiap task P6 selesai jika: tes baru + seluruh `npm test` lulus, fitur diperiksa manual di browser
    (catat langkahnya), dan fallback tanpa layanan ML terbukti jalan.

## P7 — Pilot (saat izin keluar) · spesifikasi: 06_PILOT_PROTOCOL.md

- [ ] **T70 [B] Instrumen 15 soal Indonesia di aplikasi + tes kering** — dep: T32, T62, T66
- [ ] **T71 [B] PDF persetujuan + lembar info guru + `labeling_sheet.xlsx`** — dep: T13
- [ ] **T72 [B][MANUAL] Sesi kelas** — butuh M11, M12, M14
- [ ] **T73 [B] Ingest + validasi data pilot + data card pilot** — dep: T72
- [ ] **T74 [B][MANUAL] Label guru → E9 (kappa)** — butuh M13
- [ ] **T75 [B] Evaluasi pilot: fusi, Pengaman nyata, E9; desain E10** — dep: T73, T74

## P8 — Bahan final (setelah 30 Nov)

- [ ] **T80 [B] RESULTS v2 (dengan pilot) + freeze kedua**
- [ ] **T81 [B] Data demo + naskah demo 3 momen wow** (benar tapi nalar keliru, slider coverage, mode offline)
- [ ] **T82 [B] Paket gambar untuk slide/proposal + `docs/cac/NUMBERS_SHEET.md`** (setiap angka + sumbernya)
- [ ] **T83 [B] Storyboard video demo + skrip narasi**
- [ ] **T84 [B] Dokumen persiapan tanya jawab** (pertanyaan juri + jawaban + angka pendukung)
