# PROGRESS — log kerja Claude Code

Perbarui setelah setiap task. Entri terbaru di paling atas. Format:
`### YYYY-MM-DD HH:MM — Txx <judul> — [selesai|berjalan|terblokir]`, lalu isi: yang dikerjakan, file output,
angka kunci (dengan path sumbernya), masalah, dan langkah berikutnya.

## Status ringkas
- Fase aktif: P0
- Task berikutnya: T10→T12→T14→T15(Eedi)→T20→T21→T22 begitu unduhan Eedi selesai
- **Sedang berjalan (sesi 1, 22:10):** T22 LightGBM penuh (PID nohup, log `ml/runs/logs/l1_lgbm_full.log`);
  T32 terjemahan (`ml/runs/20261118-2129_translate_map/train.log`); Kaggle `avlsalmoon/remediaide-cokt` dan
  `avlsalmoon/remediaide-l2-mdeberta` (unduh output: `kaggle kernels output avlsalmoon/<k> -p runs/<id>/kaggle_output`).
- **Kode siap, menunggu hasil di atas:** `scripts/l3_eval.py` (T40–T42; uji coba `tables/E5_l3_dev_b1.json`),
  `src/remediaide_ml/diagnose.py` (T43, 6 tes kontrak), `l1/explain.py` (T24), `l3/*` (7 tes).
- Hari tersisa menuju submit internal (Jum 27 Nov): 9 (hari ke-1)
- Kuota GPU Kaggle terpakai minggu ini: 1 j 46 m / 30 j (dicek Salman 18 Nov ~22:55, 2 kernel paralel = 2 j kuota per jam)

## Langkah lanjut untuk sesi berikutnya (`/lanjut`) — diperbarui 19 Nov 07:10
T46 selesai: test Eedi **sudah dibuka** (segel `ml/reports/TEST_OPENED.json`). Jangan jalankan ulang `final_eval.py`
kecuali bug kode (pakai `--rerun-reason`, tercatat di segel). Tidak ada proses berjalan.
0. **BERJALAN (19 Nov ±07:25): reproduksi T47** — `scratchpad/repro.sh` (PID 25362): clone segar → venv dari
   `requirements-lock.txt` → salin data mentah + output Kaggle → `make test` → `make all` → `make check-repro`.
   Log: `/private/tmp/claude-501/-Users-salmonella-Downloads-remediaide-main/7d6cbfb3-3e97-4e56-89d6-e1261a24f4b2/scratchpad/repro.log`
   (perkiraan 4–5 jam: terjemahan ±45 m, LightGBM ±2 j 10 m). Selesai jika log berisi `REPRO_DONE` dan check-repro 0 gagal.
   Jika scratchpad terhapus (reboot), jalankan ulang skrip yang sama (isinya: lihat commit T47 / langkah di atas).
1. **T47 freeze** (tenggat Rab 25 Nov 23:59): `make all` dari data mentah (GPU = output Kaggle tersimpan), bandingkan
   dengan RESULTS (toleransi 07 §6), tag `freeze-tierS`. Periksa dulu target Makefile mencakup skrip baru
   (export_l1/l2, l3_production, cokt_oof_export, l2_eval, e4_combine, final_eval).
2. Lalu P5: T50 (susun repo submisi), T51 (README + REPORT + kartu model/data), T52 (paket dataset, cek M6), T53 audit.
3. P6 web setelah submisi aman.

## Blocker (butuh Salman)
- ~~M1b login Kaggle~~ beres (19 Nov pagi; Kaggle CLI bisa dipakai lagi).
- M2 opsional: klik persetujuan aturan MAP.
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

### 2026-11-19 07:10 — T46 buka test (sekali) + RESULTS.md — selesai
- `ml/scripts/final_eval.py` di-commit (3888665) **sebelum** test dibuka; dry-run memakai siswa kalibrasi (2 bug kecil
  diperbaiki saat dry-run, sebelum test). Run test `ml/runs/20261119-0652_final_eval/` (±7 menit, satu kali).
- Test (773 siswa berlabel, 58.963 baris E1): salah kelompok B0 **0,451** [0,431–0,469] → CO-KT **0,347** [0,330–0,366],
  selisih [−0,109; −0,097]; LightGBM 0,362, B1b 0,401. Defer 20,6% → sisa 0,283; cakupan LAC 0,900.
  AUC (a) CO-KT 0,796 vs LightGBM 0,795. Sumber `ml/reports/tables/L1_test.csv`, `E8_impact.csv`, `E5_test.json`.
- E6 test: kesenjangan Gender (salah kelompok +0,048 [+0,005; +0,093]) muncul di test (tidak di CV); PremiumPupil dan
  kuartil kemampuan tetap besar. ECE L1 sesudah kalibrasi tidak membaik di test (0,0063 → 0,0068) — dilaporkan apa adanya.
- `ml/reports/RESULTS.md` lengkap (tanpa placeholder), termasuk kalimat utama.

### 2026-11-19 06:45 — T24, T31, T33, T34, T40–T43, T45 — selesai
- **T24:** CO-KT produksi `scripts/train_cokt_final.py` (kernel `avlsalmoon/remediaide-cokt-final`, ±6 menit GPU, 5 seed):
  latih pada 70% siswa CV, early stopping 10%, kalibrasi 20% (tidak disentuh training). AUC early-stop per seed 0,781–0,783
  (`ml/runs/20261119-0620_cokt_final_kaggle/kaggle_output/report_seed*.json`). Bobot → `ml/models/l1_cokt_v1/`;
  LightGBM penjelas/fallback → `ml/models/l1_lgbm_v1/`; `ml/reports/tables/L1_cv_summary.csv`; notebook 03/04 dieksekusi.
  **Keterbatasan yang harus diungkap:** OOF CV CO-KT (T23) memakai early stopping pada fold validasi yang sama
  (best_val_auc = auc_next) → angka CV CO-KT sedikit optimistis; evaluasi test T46 memakai model produksi yang bebas bias ini.
- **T31:** `ml/reports/tables/L2_cv.csv`. mDeBERTa MAP@3 0,912 [0,910–0,914] vs TF-IDF 0,916 (selisih −0,004 [−0,005; −0,002]);
  category3 per soal 0,637 [0,584–0,685] vs 0,611 (+0,026 [−0,035; +0,078], seri). GPU ±5 × 33 menit × 2 tugas. → D-19.
- **T33:** `ml/reports/tables/E3_true_misconception.csv`: recall True_Misconception TF-IDF 0,375, mDeBERTa 0,323 [0,277–0,367],
  presisi 0,807; B0 0.
- **T34:** `ml/reports/tables/E4_crosslingual.csv`: input Indonesia (terjemahan mesin) MAP@3 mDeBERTa 0,895 (−0,016 dari EN)
  vs TF-IDF 0,766 (−0,150); selisih model +0,129 [+0,121; +0,136] → D-21(b): mDeBERTa untuk input Indonesia.
- **T40–T42:** `scripts/l3_eval.py --tag final_cv` (CO-KT OOF + temperature, 03 §3): ECE L1 0,0050→0,0037; LAC cakupan 0,890,
  ukuran himpunan 1,87; L2 ECE 0,025→0,010, APS cakupan 0,950 (`ml/reports/tables/E5_l3_final_cv.json`, gambar E5_*_final_cv).
  Parameter produksi `scripts/l3_production.py` → `ml/models/l3_conformal_v1.json`, `ml/reports/tables/L3_production_params.json` (D-20, D-21).
- **T43:** `src/remediaide_ml/bundle.py` (`load_bundle`) memasang artefak nyata ke `diagnose()`; bug padding untuk soal di luar
  kosakata Eedi diperbaiki (masker eksplisit, tes kesetaraan). `tests/test_bundle.py`; 84+ tes lulus. Latensi ±0,1–0,2 s/sesi kecil di CPU.
  Keterbatasan: soal aplikasi tidak ada di kosakata Eedi → CO-KT hanya memakai urutan benar/salah, opsi, keyakinan, jeda waktu.
- **T45:** `scripts/e6_e8.py --calib temperature --tag final_cv` → `ml/reports/tables/E6_fairness_final_cv.csv`, `E8_impact_final_cv.csv`:
  salah kelompok B0 0,448 vs ML 0,345 (selisih [−0,107; −0,100]); defer 20% → sisa 0,282, 35% kesalahan tertangkap,
  ±96 kasus/kelas 32×15. Kesenjangan besar antar kuartil kemampuan dan PremiumPupil (lihat tabel); Gender CI memuat 0 untuk AUC/ECE.

### 2026-11-19 00:50 — T24 keputusan model L1 (D-18) — sebagian
- LightGBM ensemble 5 seed (parameter Optuna T22, tanpa tuning ulang): `ml/runs/20261118-2205_l1_lgbm/oof_b_ens5.parquet`,
  model `models_seed<s>_*`. Macro-F1 E1 0,465, salah kelompok 0,358 (sumber `ml/reports/tables/L1_model_selection.csv`).
- CO-KT ens5 vs LightGBM ens5 pada baris sama: salah kelompok −0,011 [−0,013; −0,009], macro-F1 +0,014 [+0,011; +0,018] → D-18.
- Sisa T24: ekspor artefak ke `models/` (CO-KT bobot ada di Kaggle output? kernel hanya menyimpan OOF — **perlu latih ulang CO-KT
  produksi** pada seluruh siswa CV untuk 5 seed, atau 1 seed jika kuota terbatas; catat), notebook 03/04.

### 2026-11-18 23:55 — T22 B2 LightGBM + Optuna + E2 — selesai
- Run `ml/runs/20261118-2205_l1_lgbm/` (±1 j 49 m lokal): Optuna 50 trial × 3 (a, b 4 kelas, b biner) di fold 0, 5 fold,
  model fold tersimpan, OOF `oof_a.parquet`, `oof_b.parquet`. Tabel `ml/reports/tables/L1_lgbm_cv.csv`, `E2_ablation_cv.csv`;
  gambar `ml/reports/figures/E2_ablation.png`, `L1_shap_beeswarm.png`.
- (a) AUC **0,789 [0,786–0,793]**. (b) baris E1: macro-F1 **0,465 [0,453–0,477]**, salah kelompok **0,359 [0,349–0,368]**;
  AUC butuh_remediasi **0,800 [0,796–0,804]** (B0 0,633, B1b 0,736).
- E2 (macro-F1 / AUC biner): S0 0,178/0,631 → S1 +keyakinan 0,291/0,652 → S2 +riwayat 0,400/0,778 → S3 +riwayat keyakinan
  0,440/**0,777** → S4 +kesulitan 0,462/0,797 → S5 +opsi 0,463/0,798 → S6 +waktu 0,465/0,800. DeLong berurutan (Holm)
  semua p < 1e-30; **S3 menurunkan AUC biner sedikit (−0,001) meski menaikkan macro-F1** — dilaporkan apa adanya.
- SHAP: fitur teratas untuk kelas Miskonsepsi masa depan = kecenderungan terlalu yakin, akurasi sebelumnya, kemudahan topik.
- Perbandingan baris sama (`ml/reports/tables/L1_cokt_cv.csv`): CO-KT ensemble lebih baik di (b) (0,480 / 0,347) dan (a) (+0,004).
  Pemilihan model produksi di T24 (D-15).

### 2026-11-18 23:35 — T23 M1 CO-KT — selesai
- Kernel `avlsalmoon/remediaide-cokt` COMPLETE (55 run: full 5 seed, no_conf 3, no_option 3; rata-rata 89 s/run, ±80 menit GPU,
  13,9 epoch rata-rata). Output `ml/runs/20261118-2202_cokt_kaggle/kaggle_output/` (550 MB, tidak di-commit).
- Evaluasi `scripts/cokt_eval.py` → `ml/reports/tables/L1_cokt_cv.csv`, `E2_cokt_ablation_cv.csv`, `runs/20261118-2202_cokt_kaggle/eval.json`.
- (a) next-correct AUC, ensemble 5 seed, 1.100.165 baris: **0,794 [0,790–0,797]**; LightGBM (a, 1 seed) pada baris yang
  sama 0,790 → selisih +0,004, DeLong p ≈ 4e-106 (efek kecil; catatan: ensemble vs model tunggal).
- (b) kuadran masa depan pada 217.480 baris E1: macro-F1 **0,480 [0,469–0,490]**, salah kelompok **0,347 [0,338–0,356]**
  vs B0 0,412 / 0,450.
- Ablation: tanpa keyakinan → macro-F1 kuadran turun **0,158 [0,146–0,171]**, AUC turun 0,002; tanpa opsi → macro-F1
  turun 0,002 [0,000–0,004], AUC turun 0,0035. Keyakinan = sinyal terpenting untuk diagnosis (RQ1).

### 2026-11-18 — T34 E4 lintas bahasa — sebagian (baseline TF-IDF)
- `scripts/e4_crosslingual.py --tfidf` → `ml/reports/tables/E4_crosslingual_tfidf.csv` (fold 0, n=7.340, paired bootstrap 1000).
- TF-IDF (dilatih EN): MAP@3 0,916 → 0,766 (selisih **−0,150 [−0,158; −0,143]**); macro-F1 category3 0,839 → 0,631
  (−0,208 [−0,221; −0,196]); recall True_Misconception 0,342 → 0,013.
- Menunggu model mDeBERTa fold 0 dari kernel Kaggle untuk baris M1.

### 2026-11-18 — T33 E3 — sebagian (B0 + TF-IDF)
- `ml/reports/tables/E3_true_misconception.csv`, `ml/reports/figures/E3_pr_curve.png`. B0 recall 0 (desain);
  TF-IDF recall **0,375 [0,329–0,422]**, presisi 0,821 [0,760–0,874], PR-AUC 0,582. Menunggu mDeBERTa.

### 2026-11-18 — T32 Terjemahan Indonesia + QA — selesai
- `data/processed/map_id.parquet` lengkap (36.696 baris); 35.668 alasan unik dalam 2.744 s (MPS).
- Diagnostik: angka tidak cocok 845 (2,4%), tidak berubah 246, halusinasi (sumber dipertahankan) 18.
- QA manual 100 sampel berstrata → `ml/reports/tables/translation_qa.csv`, kartu `ml/reports/translation_card.md`:
  **baik 46, kecil 34, berat 20**; angka rusak 7. Opsi soal peluang salah makna ("Unlikely" → "Tidak mungkin").
- Konsekuensi: E4 = ketahanan terhadap terjemahan mesin, bukan tulisan asli; instrumen pilot diterjemahkan manual.

### 2026-11-18 — T30 B0 TF-IDF (L2) — selesai
- Run `ml/runs/20261118-2131_l2_tfidf/` (OOF `oof_target.parquet`, `oof_category3.parquet`), tabel `ml/reports/tables/L2_b0_tfidf_cv.csv`.
- Split acak, target 65 kelas + masking kandidat dari fold latih: **MAP@3 0,916 [0,914–0,918]** (std antarfold 0,002),
  akurasi top-1 0,841. True_Misconception top-1: recall **0,375**, presisi 0,821 (n=403).
- Split per soal (3 soal/fold), `category3`: **macro-F1 0,611** [0,606–0,616 per baris; 0,542–0,674 kluster soal];
  per fold 0,713/0,568/0,593/0,468/0,609; recall Correct 0,863, Neither 0,626, Misconception 0,349.
  → Jarak generalisasi besar ke soal baru (alasan utama E3/E4 dan T36).
- C terbaik (fold 0): target 10 (ujung atas grid {0,3;1;3;10}), category3 0,3 (ujung bawah). Grid tidak diubah; dicatat.
- CI MAP: bootstrap per baris (tidak ada ID siswa di MAP publik).

### 2026-11-18 — T16 EDA — selesai
- `src/remediaide_ml/eda.py` + `ml/notebooks/01_eda.ipynb` (dieksekusi bersih). Gambar `ml/reports/figures/E0_*.png` (6),
  angka `ml/reports/tables/E0_eda_numbers.json`, `E0_self_calibration.csv`. Lima temuan di `ml/reports/RESULTS.md` §2.
- Kunci: akurasi naik 0,335→0,733 dari keyakinan 0→100 (overconfident); keyakinan kosong tidak acak
  (akurasi 0,622 berkeyakinan vs 0,509 tanpa).

### 2026-11-18 — T21 B1 baselines — selesai
- Run `ml/runs/20261118-2156_l1_b1/` (OOF `oof_a.parquet`, `oof_b.parquet`), tabel `ml/reports/tables/L1_b0_b1_cv.csv`.
- (a) next-correct AUC: B1a 0,673 [0,670–0,676]; B1b 0,744 [0,741–0,747].
- (b) butuh_remediasi AUC (912.731 baris): B0 0,633 [0,629–0,636]; B1a 0,558; B1b 0,736 [0,731–0,740].
- (b) 4 kelas pada baris E1: B0 macro-F1 0,412 / salah kelompok 0,450 (sama dengan T20 — konsisten);
  B1b macro-F1 0,379 [0,371–0,386], salah kelompok **0,404 [0,393–0,414]**. Argmax LR condong ke kelas mayoritas →
  salah kelompok turun tetapi macro-F1 juga turun. Dilaporkan apa adanya.
- C terbaik di fold 0: B1a 0,01, B1b biner 0,01, B1b 4 kelas 1,0. Dua di ujung bawah grid 03 §1 (grid tidak diubah).
- CI dari 200 replikasi bootstrap untuk AUC (pengembangan); hasil final T46 memakai 1000.

### 2026-11-18 22:03 — T23 + T31 dikirim ke Kaggle GPU — berjalan
- Dataset privat: `avlsalmoon/remediaide-ml-src` (src+configs+scripts), `avlsalmoon/remediaide-processed`
  (map, map_splits, map_candidates, eedi_features_a/b, eedi_splits; privat sesuai D-11).
- Kernel `avlsalmoon/remediaide-cokt` (full 5 seed; no_conf, no_option 3 seed) dan `avlsalmoon/remediaide-l2-mdeberta`
  (target 5 fold + category3 5 fold) RUNNING sejak 22:02. Watcher: `ml/scripts/kaggle_watch.sh`.
- Smoke lokal: CO-KT 2% siswa 3 epoch, loss 2,16→1,93; mDeBERTa 200 contoh 20 step CPU fp32, loss 3,30→3,06, tanpa NaN.

### 2026-11-18 — T03 Kaggle CLI — selesai
- M1 selesai: `kaggle auth login` (akun `avlsalmoon`). `kaggle competitions list -s map` sukses.
  File MAP diambil dari mirror HF (T11), jadi daftar file kompetisi tidak diperlukan.

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
