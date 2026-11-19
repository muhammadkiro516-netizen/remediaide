# RESULTS — RemediAide 2.0 (CAC MLSC 2026)

Status: **final Tingkat S (test dibuka sekali, 19 Nov 2026 06:52–06:59, run `20261119-0652_final_eval`; segel
`ml/reports/TEST_OPENED.json`).** Setiap angka menunjuk ke file sumber di `ml/reports/`. Angka bertanda "CV" berasal
dari validasi silang 80% siswa; angka bertanda "test" dari 20% siswa Eedi yang dikunci sejak awal (D-04) dan tidak
pernah dipakai untuk melatih, memilih, atau mengkalibrasi model. MAP tidak punya fold test terkunci (D-06), sehingga
semua angka Lapis 2 adalah CV.

## 1. Ringkasan angka utama
**Kalimat utama** (sumber `tables/E8_impact.csv`, test):
"Aturan CRI v1 salah mengelompokkan **45,1%** kasus siswa–soal. RemediAide 2.0 menurunkannya menjadi **34,7%**
(selisih −10,3 poin [−10,9; −9,7]), dan **20,6%** kasus paling meragukan diserahkan ke guru; pada kasus yang tidak
diserahkan, salah kelompok tinggal **28,3%**."

| Angka kunci | Nilai | Sumber |
| --- | --- | --- |
| Salah kelompok aturan v1, B0 (test) | 0,451 [0,431–0,469] | `tables/E1_b0_test.csv` |
| Salah kelompok RemediAide 2.0, CO-KT (test) | 0,347 [0,330–0,366] | `tables/L1_test.csv`, `tables/E8_impact.csv` |
| Recall jebakan jawaban benar, L2 TF-IDF (CV MAP; B0 = 0) | 0,375 [0,329–0,422] | `tables/E3_true_misconception.csv` |
| Selisih MAP@3 EN → ID: mDeBERTa vs TF-IDF (CV MAP) | −0,016 vs −0,150 | `tables/E4_crosslingual.csv` |
| Cakupan conformal L1, target 90% (test) | 0,900 (ukuran himpunan 1,90) | `tables/E5_test.json` |

## 2. Data
Sumber: `tables/data_card_eedi.md`, `tables/data_card_map.md`, `tables/E0_eda_numbers.json`, `tables/E0_self_calibration.csv`.

- **Eedi NeurIPS 2020 Task 3&4**: 1.382.727 jawaban, 4.918 siswa, 948 soal, 57 KC (SubjectId terdalam), Sep 2019–Mei 2020.
- **MAP**: 36.696 alasan, 15 soal, 65 target (Category:Misconception), 35 label miskonsepsi.

**Lima temuan EDA**
1. **Siswa terlalu yakin, dan keyakinan tetap informatif.** Akurasi naik monoton dengan keyakinan: 0,335 (keyakinan 0)
   → 0,388 (25) → 0,484 (50) → 0,645 (75) → 0,733 (100), CI 95% per siswa di `tables/E0_self_calibration.csv`.
   Di keyakinan 100 masih 26,7% jawaban salah; di keyakinan 0 ("tebakan") akurasi di atas peluang 25%.
   Gambar: `figures/E0_self_calibration.png`. Ini dasar Lapis 3 (kalibrasi) dan motif "CRI yang dipelajari dari data".
2. **Keyakinan kosong 74,95% baris dan tidak acak.** 12,89% siswa tidak pernah mengisinya dan hanya 0,59% selalu mengisi.
   Akurasi baris berkeyakinan 0,622 vs tanpa keyakinan 0,509, sehingga E1 (yang butuh keyakinan) berlaku untuk
   subpopulasi yang lebih kuat. Gambar: `figures/E0_missingness.png`.
3. **Skala keyakinan diskret dan condong ke atas:** hanya {0, 25, 50, 75, 100}; 46,0% jawaban berkeyakinan memilih 100.
   Karena itu ambang v1 (CRI ≥ 3) = keyakinan ≥ 50 (D-03). Gambar: `figures/E0_confidence_distribution.png`.
4. **Riwayat panjang**: median 239 jawaban per siswa (p90 555), cukup untuk model sekuens (CO-KT, jendela 200).
   Gambar: `figures/E0_sequence_length.png`.
5. **Jebakan jawaban benar langka dan tidak merata:** True_Misconception 1,10% dari alasan MAP, 0%–5,37% per soal.
   Alasan pendek (median 16 kata untuk Correct, 13 Misconception, 11 Neither). Gambar: `figures/E0_map_categories.png`,
   `figures/E0_map_explanation_length.png`.

## 3. Eksperimen

### E1 — Audit aturan CRI
- **Pertanyaan:** seberapa sering aturan v1 salah mengelompokkan siswa?
- **Setup:** label kuadran masa depan (3 percobaan berikutnya di KC yang sama, minimal 2; D-05); baris dengan keyakinan.
  B0 = kode v1 apa adanya (D-02). Test: 58.963 baris, 773 siswa berlabel.
- **Hasil test (`tables/E1_b0_test.csv`, gambar `figures/E1_confusion_b0.png`):**

| Metrik | CV (`tables/E1_b0_cv.csv`) | Test |
| --- | --- | --- |
| Salah kelompok 4 kelas | 0,450 [0,440–0,459] | **0,451 [0,431–0,469]** |
| Macro-F1 4 kelas | 0,412 [0,403–0,419] | 0,392 [0,380–0,403] |
| "Paham" menurut B0 yang belum tuntas berikutnya | 0,282 [0,270–0,294] | **0,278 [0,257–0,300]** |
| "Miskonsepsi" menurut B0 yang tuntas berikutnya | 0,507 [0,495–0,519] | 0,524 [0,504–0,544] |
| Error biner `butuh_remediasi` | — | 0,367 [0,359–0,376] |

- **Interpretasi:** hampir satu dari dua kasus dikelompokkan berbeda dari kondisi siswa tiga soal berikutnya. Lebih dari
  seperempat siswa yang dinyatakan "Paham" ternyata belum tuntas, sehingga tidak mendapat remediasi.
- **Keterbatasan:** label proxy (bukan label guru). Sebagian "Miskonsepsi → tuntas" adalah pembelajaran setelah umpan
  balik Eedi, bukan kesalahan aturan.

### E2 — Nilai tiap sinyal (CV)
- **Setup:** LightGBM framing (b), tahap S0→S6 (`tables/E2_ablation_cv.csv`, `figures/E2_ablation.png`). CO-KT penuh
  (5 seed) vs tanpa keyakinan / tanpa opsi (3 seed) (`tables/E2_cokt_ablation_cv.csv`). Model per tahap tidak disimpan,
  sehingga E2 hanya dilaporkan pada CV.

| Tahap (kumulatif) | Macro-F1 | Salah kelompok | AUC butuh_remediasi |
| --- | --- | --- | --- |
| S0 benar/salah saat ini | 0,178 | 0,447 | 0,631 |
| S1 + keyakinan | 0,291 | 0,427 | 0,652 |
| S2 + riwayat benar | 0,400 | 0,388 | 0,778 |
| S3 + riwayat keyakinan | 0,440 | 0,378 | 0,777 |
| S4 + kesulitan soal/KC | 0,462 | 0,361 | 0,797 |
| S5 + opsi jawaban | 0,463 | 0,361 | 0,798 |
| S6 + waktu | 0,465 | 0,359 | 0,800 |

- **Interpretasi:** riwayat dan keyakinan menyumbang paling besar. Pada CO-KT, menghapus keyakinan menurunkan macro-F1
  kuadran 0,158 [0,146–0,171]; menghapus opsi hanya 0,002 [0,000–0,004]. Keyakinan bernilai bukan sebagai aturan
  ambang tetap, tetapi sebagai sinyal yang dipelajari bersama riwayat.
- **Keterbatasan:** ablation CO-KT memakai 3 seed vs 5 seed untuk model penuh.

### E3 — Jebakan jawaban benar (CV MAP)
- **Setup:** kelas positif True_Misconception (403 baris, 1,10%); skor = jumlah probabilitas target True_Misconception.
- **Hasil (`tables/E3_true_misconception.csv`, `figures/E3_pr_curve.png`):** B0 recall 0 (desain: benar + yakin =
  Paham). TF-IDF recall 0,375 [0,329–0,422], presisi 0,821, PR-AUC 0,582. mDeBERTa recall 0,323 [0,277–0,367], presisi
  0,807, PR-AUC 0,549.
- **Antrean guru (`tables/E3_queue_cv.csv`):** pada ambang D-20, penanda `hidden_misconception` menangkap 50,0%
  (TF-IDF) dan 51,2% (mDeBERTa) kasus positif di 80% baris evaluasi, sambil menandai hanya 1,4–1,7% jawaban benar.
- **Pembanding literatur:** BERT 57,4% (arXiv 2606.23205) pada set dan split berbeda; tidak dapat dibandingkan langsung.
- **Keterbatasan:** kelas sangat langka; CI lebar; MAP tanpa fold test terkunci.

### E4 — Lintas bahasa (CV MAP, fold 0)
- **Setup:** model dilatih pada alasan bahasa Inggris (fold ≠ 0), dievaluasi pada fold 0 asli dan terjemahan mesin
  opus-mt-en-id (D-08), baris yang sama (7.340).
- **Hasil (`tables/E4_crosslingual.csv`):**

| Model | MAP@3 EN | MAP@3 ID | Selisih ID − EN | Macro-F1 category3 ID | Recall True_Misc. ID |
| --- | --- | --- | --- | --- | --- |
| TF-IDF+LR | 0,916 | 0,766 | −0,150 [−0,158; −0,143] | 0,631 | 0,013 |
| mDeBERTa-v3-base | 0,911 | **0,895** | **−0,016 [−0,020; −0,013]** | 0,812 | 0,203 |

- Selisih mDeBERTa − TF-IDF pada input Indonesia: MAP@3 +0,129 [+0,121; +0,136]; macro-F1 category3 +0,181 [+0,168; +0,194].
- **Interpretasi:** pada bahasa Inggris kedua model setara (bahkan TF-IDF sedikit unggul, `tables/L2_cv.csv`), tetapi
  hanya encoder multibahasa yang bertahan saat alasan berbahasa Indonesia. Karena itu L2 untuk input Indonesia =
  mDeBERTa (aturan dikunci sebelum E4 mDeBERTa dihitung, D-19/D-21).
- **Catatan wajib:** terjemahan mesin bukan tulisan asli siswa Indonesia (QA 100 sampel: 20 kesalahan besar,
  `tables/translation_qa.csv`). Validasi native menyusul di pilot (E9).

### E5 — Tahu batas diri
- **L1 test (`tables/E5_test.json`, `figures/E5_coverage_risk.png`, `figures/E5_reliability_L1.png`; parameter produksi
  tanpa refit, D-21):** ECE kuadran 0,0063 sebelum → 0,0068 sesudah temperature (CO-KT sudah terkalibrasi baik;
  kalibrasi tidak memperbaiki di test). Conformal LAC α = 0,1: cakupan **0,900**, ukuran himpunan rata-rata 1,90,
  29,6% himpunan berisi satu kuadran. Defer pada ambang produksi: 20,6% kasus; salah kelompok sisa 0,283 (dari 0,347,
  turun 18,5% relatif — di bawah target 25% D-09, sesuai fallback 20%). Kurva coverage–risk: `tables/E5_coverage_risk_L1_test.csv`.
- **L2 CV (`tables/E5_l3_final_cv.json`, `figures/E5_reliability_L2_final_cv.png`):** TF-IDF ECE 0,025 → 0,010
  (temperature 1,20); APS cakupan 0,950 (target 0,90; over-coverage karena skor diskret), ukuran himpunan 1,90.
- **Pembanding literatur:** Mitton dkk. 2025 (+1,9–2,4 AUC pada coverage 80%); metrik berbeda.

### E6 — Fairness (test)
- **Setup:** Gender (1 perempuan vs 2 laki-laki), PremiumPupil (1 vs 0), kuartil kemampuan (Q1 vs Q4). Atribut tidak
  pernah menjadi fitur (D-13). CI bootstrap siswa per kelompok (`tables/E6_fairness.csv`).

| Kelompok | Salah kelompok a vs b | Selisih [CI] | AUC butuh_remediasi a vs b | Tingkat defer a vs b |
| --- | --- | --- | --- | --- |
| Perempuan vs laki-laki | 0,374 vs 0,326 | +0,048 [+0,005; +0,093] | 0,793 vs 0,800 (CI memuat 0) | 0,237 vs 0,170 |
| Pupil premium vs bukan | 0,449 vs 0,328 | +0,121 [+0,072; +0,173] | 0,733 vs 0,804 | 0,293 vs 0,177 |
| Kuartil 1 vs kuartil 4 | 0,509 vs 0,195 | +0,314 [+0,283; +0,345] | 0,638 vs 0,798 | 0,448 vs 0,059 |

- **Temuan (CI tidak memuat 0):** model lebih sering salah untuk siswa pupil premium, siswa berkemampuan rendah, dan —
  di test, tidak di CV — siswa perempuan. Aturan v1 juga timpang pada kelompok yang sama (pupil premium 0,526 vs 0,432, selisih +0,095;
  kuartil 1 0,601 vs 0,294, selisih +0,307), dan RemediAide 2.0 lebih akurat dari B0 di setiap kelompok, tetapi kesenjangannya tidak
  hilang. Mitigasi yang sudah ada: kasus ragu (lebih banyak di kelompok rentan) masuk antrean guru.
- **Keterbatasan:** tidak ada klaim "adil". PremiumPupil adalah proxy sosial-ekonomi Inggris, bukan konteks Indonesia.

### E7 — Ringan untuk offline (Tingkat A, CV MAP fold 0; D-23)
- **Setup:** student Multilingual-MiniLM-L12 didistilasi dari mDeBERTa (logit OOF) pada fold ≠ 0, diekspor ke ONNX dan
  dikuantisasi int8 (`tables/E7_efficiency.csv`). Latensi: batch 1, CPU laptop, 4 thread, 200 alasan.

| Model | Ukuran | MAP@3 EN | MAP@3 ID | Latensi p50 / p95 |
| --- | --- | --- | --- | --- |
| mDeBERTa-v3-base (teacher) | 1131,5 MB | 0,911 | 0,895 | — |
| MiniLM student ONNX fp32 | 471,0 MB | 0,859 | 0,835 | 8,1 / 10,2 ms |
| MiniLM student ONNX int8 | **118,3 MB** | **0,860** | **0,834** | **7,8 / 9,2 ms** |

- **Interpretasi:** model 10× lebih kecil kehilangan 0,061 MAP@3 pada input Indonesia, tetapi tetap jauh di atas TF-IDF
  (0,766, `tables/E4_crosslingual.csv`). Kuantisasi int8 hampir tanpa penurunan.
- **Lapis 1 di perangkat (T68):** LightGBM fold 0 diekspor ke ONNX (14,1 + 14,9 MB) dan dijalankan di browser
  (onnxruntime-web). Selisih probabilitas maksimum terhadap LightGBM 0,0046 (`tables/T68_onnx_parity.json`); fitur
  TypeScript setara Python (tes paritas web).
- **Keterbatasan:** student 118 MB masih terlalu besar untuk diunduh di browser HP; mode perangkat saat ini L1 saja.

### T36 — Retrieval untuk soal baru (Tingkat A, D-22): hasil negatif
- **Setup:** multilingual-e5-base zero-shot, alasan ↔ deskripsi miskonsepsi soal itu (2–4 kandidat), 9.860 baris
  kategori Misconception, CI klaster soal (`tables/T36_retrieval.csv`).
- **Hasil:** MAP@3 EN 0,689 [0,615–0,771] vs acak 0,669 [0,625–0,714]; ID 0,632 [0,573–0,705] (di bawah acak).
  Acuan "label terbanyak soal" 0,857.
- **Interpretasi:** kemiripan kalimat umum tidak cukup untuk membedakan miskonsepsi dalam satu soal. Untuk soal baru,
  guru tetap perlu memberi contoh berlabel; pendekatan ini **tidak** dipakai di produk.

### E8 — Dampak bagi guru (simulasi, test)
- **Setup:** L1 CO-KT + L3 pada titik operasi produksi (D-21). 58.963 kasus, 773 siswa (`tables/E8_impact.csv`).

| Metrik | Nilai |
| --- | --- |
| Salah kelompok B0 | 0,451 |
| Salah kelompok RemediAide 2.0 (tanpa defer) | 0,347 (selisih [−0,109; −0,097]) |
| Kasus diserahkan ke guru | 20,6% (±99 kasus per kelas 32 siswa × 15 soal) |
| Salah kelompok pada kasus yang tidak diserahkan | 0,283 (B0 pada kasus yang sama: 0,392) |
| Porsi kesalahan model yang tertangkap antrean guru | 35,3% |
| Batas atas sistem bila guru membetulkan semua kasus yang diserahkan | 0,225 |

- **Interpretasi:** guru tetap memegang keputusan untuk sekitar seperlima kasus, dan sisanya dikelompokkan jauh lebih
  akurat daripada aturan v1.
- **Keterbatasan:** simulasi pada label proxy; beban guru nyata dan akurasi guru belum diukur (E9).

### Robustness (test)
- **Model terbaik per framing di test (`tables/L1_test.csv`, `tables/L1_test_pairwise.csv`):** CO-KT unggul atas
  LightGBM ensemble dalam salah kelompok (−0,014 [−0,018; −0,011]) dan AUC butuh_remediasi (+0,007), konsisten dengan
  pemilihan di CV (D-18). Framing (a) AUC next-correct: CO-KT 0,796 [0,788–0,803], LightGBM 0,795, B1b 0,747, B1a 0,677
  (selisih CO-KT − LightGBM +0,002; DeLong p Holm < 0,001). Semua perbandingan CO-KT vs B0/B1b/LightGBM: McNemar dan
  DeLong p < 0,001 setelah Holm.
- **Temporal (`tables/robustness_temporal_test.csv`):** pada 20% interaksi terakhir tiap siswa test, salah kelompok
  B0 0,484, LightGBM 0,411, CO-KT 0,389 — semua model lebih buruk di akhir riwayat, urutan tetap sama.

### E9 — Kesepakatan model–guru
Tingkat B — menunggu pilot.

### E10 — Dampak belajar
Tingkat B — menunggu pilot.

## 4. Model terpilih per lapis
| Lapis | Model produksi | Keputusan | Hiperparameter | Artefak |
| --- | --- | --- | --- | --- |
| L1 kuadran | CO-KT (transformer 2 lapis, d=128, 4 head, dropout 0,2, jendela 200, AdamW lr 1e-3, batch 64, early stopping patience 3), ensemble 5 seed | D-15 → D-18 | `l1/cokt.py` `CoktConfig` | `models/l1_cokt_v1/` |
| L1 penjelas + fallback | LightGBM (Optuna 50 trial; 4 kelas: num_leaves 86, lr 0,021, min_child_samples 175; biner: num_leaves 246, lr 0,023) | D-18 | `runs/20261118-2205_l1_lgbm/metrics.json` | `models/l1_lgbm_v1/` |
| L2 input Inggris | TF-IDF (kata 1–2 + karakter 3–5) + regresi logistik C = 10, masking kandidat | D-19 | `scripts/train_l2_tfidf.py` | `models/l2_tfidf_v1.joblib` |
| L2 input Indonesia | mDeBERTa-v3-base (lr 2e-5, batch 16, 3 epoch, max_len 192, fp16 di GPU Kaggle) | D-21(b) | `kaggle_output/metrics_target.json` | `models/l2_mdeberta_v1/` |
| L3 | temperature (L1 T=1,01; L2 T=1,20/1,41), LAC/APS α=0,1, defer 20% (ambang ragu 0,525), fusi naive-Bayes, ambang hidden 0,20/0,25 | D-09, D-20, D-21 | `models/l3_conformal_v1.json` | `tables/L3_production_params.json` |
| Pengaman | NT10/GMM/τmin (diuji simulasi, tidak dilaporkan sebagai hasil) | 03 §4 | `guard/rapid_guess.py` | — |

## 5. Keterbatasan
- Label kuadran masa depan adalah proxy, bukan label guru; sebagian perubahan adalah pembelajaran setelah umpan balik.
- Keyakinan hilang tidak acak (temuan EDA 2): E1/E8 berlaku untuk subpopulasi yang mengisi keyakinan.
- Angka CV CO-KT (T23) sedikit optimistis karena early stopping memakai fold validasi yang dinilai; angka test memakai
  model produksi dengan early stopping pada siswa terpisah dan tidak memiliki bias ini.
- LightGBM sebagai penjelas berbeda dari CO-KT sebagai pemberi probabilitas; alasan SHAP menjelaskan model penjelas.
- Soal aplikasi tidak ada di kosakata Eedi: di produk, CO-KT hanya memakai urutan benar/salah, opsi, keyakinan, dan jeda.
- MAP: tidak ada fold test terkunci; 27% alasan sintetis tanpa penanda; ID soal sama di train/validasi (D-06).
- Terjemahan mesin bukan tulisan asli siswa Indonesia; mDeBERTa produksi adalah model fold 0 (80% data MAP).
- Kesenjangan fairness besar (E6) dan PremiumPupil bukan ukuran sosial-ekonomi Indonesia.
- Pengaman tebakan cepat belum divalidasi pada data nyata.

## 6. Lampiran
Versi library: `ml/requirements-lock.txt`. Hash data: `ml/data/manifest.json`. Run test: `ml/runs/20261119-0652_final_eval/metrics.json`
(hash input). Segel test: `ml/reports/TEST_OPENED.json`. Id run lain: kolom `run` di setiap tabel dan `PROGRESS.md`.
