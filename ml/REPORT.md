# Laporan Teknis — RemediAide 2.0

CAC Machine Learning Solution Challenge 2026 · Babak penyisihan

Semua angka di laporan ini diambil dari `reports/RESULTS.md` atau dari tabel sumber di `reports/tables/`. Setiap
angka diberi path sumber. Angka **CV** berasal dari validasi silang pada 80% siswa. Angka **test** berasal dari 20% siswa
Eedi yang dikunci sejak awal dan dibuka sekali saja (19 Nov 2026, segel `reports/TEST_OPENED.json`). MAP tidak punya
fold test yang dikunci, jadi semua angka Lapis 2 adalah CV.

---

## 1. Pendahuluan dan rumusan masalah  *(Perumusan masalah, 15%)*

### 1.1 Latar belakang
Hasil belajar matematika Indonesia stagnan. Pada PISA 2025, hanya 17% siswa mencapai minimal Level 2 (OECD 65%),
sama dengan 2022 [1]. Rapor Pendidikan 2025 mencatat capaian kompetensi minimum numerasi SD 59,45%, SMP 70,81%,
SMA 67,14%, dan SMK 60,22% [2]. Remediasi yang tepat sasaran butuh dua hal: tahu **siapa** yang belum paham dan
**miskonsepsi apa** yang dimilikinya.

Alat diagnosis yang banyak dipakai guru dan peneliti Indonesia adalah **Certainty of Response Index (CRI)** [3]. CRI
memetakan setiap jawaban ke kuadran 2×2 (benar/salah × yakin/tidak yakin): *Paham*, *Tebakan beruntung*,
*Miskonsepsi*, *Tidak paham*. RemediAide v1, aplikasi web kami sebelumnya, memakai aturan ini apa adanya.
Penerapan model CRI langsung pada skor mentah diketahui bisa menghasilkan kesimpulan yang tidak akurat [4].
Aturan tetap ini punya tiga titik buta:

1. **Jebakan jawaban benar.** Siswa yang menjawab benar dengan nalar keliru otomatis dinyatakan "Paham".
2. **Miskonsepsi tanpa nama.** Aturan tidak menyebut miskonsepsi mana yang dimiliki siswa.
3. **Tidak tahu kapan dirinya salah.** Aturan tidak punya ukuran ketidakpastian, jadi tidak bisa menyerahkan kasus
   sulit ke guru.

### 1.2 Rumusan masalah dan pertanyaan riset
Seberapa sering aturan CRI salah mengelompokkan siswa, dan bisakah ML (a) mengurangi kesalahan itu, (b) memberi nama
miskonsepsi, termasuk pada jawaban benar, dan (c) tahu kapan harus menyerahkan keputusan ke guru?

| RQ | Pertanyaan | Eksperimen |
| --- | --- | --- |
| RQ0 | Seberapa sering aturan v1 salah mengelompokkan? | E1 |
| RQ1 | Sinyal apa (keyakinan, opsi, riwayat, waktu) yang menambah daya prediksi? | E2 |
| RQ2 | Bisakah alasan siswa menangkap jebakan jawaban benar, juga dalam Bahasa Indonesia? | E3, E4 |
| RQ3 | Apakah model tahu batasnya (kalibrasi, conformal, selective prediction)? | E5 |
| RQ4 | Apa dampaknya bagi guru, dan apakah dampaknya merata antarkelompok siswa? | E8, E6 |

### 1.3 SDG
- **SDG 4.1:** hasil belajar matematika. Ini tujuan utama.
- **SDG 10.2:** inklusi. Fairness diukur per kelompok, bukan diasumsikan.
- **SDG 4.c:** waktu guru. Hanya kasus ragu yang diserahkan ke guru.

---

## 2. Data  *(Pengolahan & kualitas data, 20%)*

### 2.1 Sumber
| Dataset | Ukuran | Lisensi | Peran |
| --- | --- | --- | --- |
| Eedi NeurIPS 2020 Task 3&4 [5] | 1.382.727 jawaban, 4.918 siswa, 948 soal, 57 konsep (SubjectId terdalam), Sep 2019–Mei 2020 | CC BY-NC-ND 4.0 | Lapis 1 |
| MAP — Charting Student Math Misunderstandings [6] | 36.696 alasan, 15 soal, 65 target `Category:Misconception`, 35 label | MIT | Lapis 2 |

Integritas data dicatat di `data/manifest.json` (sha256 dan sumber setiap file mentah). Kartu data lengkap ada di
`DATA_CARD.md`, `reports/tables/data_card_eedi.md`, dan `reports/tables/data_card_map.md`.

### 2.2 Kualitas data dan EDA
Lima temuan EDA (`reports/RESULTS.md` §2, notebook `01_eda`) yang memengaruhi desain:
1. **Siswa terlalu yakin, tetapi keyakinan tetap informatif.** Akurasi naik monoton dari 0,335 (keyakinan 0) ke
   0,733 (keyakinan 100). Ini menjadi dasar "CRI yang dipelajari" dan kalibrasi Lapis 3.
2. **Keyakinan kosong di 74,95% baris, dan kekosongan itu tidak acak.** Akurasi baris berkeyakinan 0,622, sedangkan
   baris tanpa keyakinan 0,509. Karena itu ketersediaan keyakinan dijadikan fitur, dan E1 dibatasi ke baris
   berkeyakinan.
3. **Skala keyakinan diskret:** hanya {0, 25, 50, 75, 100}, dan 46,0% jawaban berkeyakinan memilih 100. Konversi ke
   CRI dikunci di D-03 (`floor((c+10)/20)`), sehingga ambang kode v1 (CRI ≥ 3) setara keyakinan ≥ 50.
4. **Riwayat panjang:** median 239 jawaban per siswa. Panjang ini cukup untuk model sekuens (jendela 200).
5. **Jebakan jawaban benar langka:** True_Misconception hanya 1,10% dari alasan MAP.

### 2.3 Cleaning
- **Eedi:** tidak ada duplikat AnswerId, tidak ada IsCorrect yang tidak konsisten, dan tidak ada percobaan ulang.
  Urutan waktu per siswa memakai tie-break AnswerId.
- **MAP:** teks dinormalisasi NFKC (salinan teks asli disimpan). Ada 18 baris (0,049%) dengan prefiks True/False yang
  bertentangan dengan mayoritas, semuanya di satu soal. Baris itu **dipertahankan apa adanya** dan ditandai (D-16);
  label benchmark tidak diubah.

### 2.4 Feature engineering (Lapis 1)
Semua fitur hanya memakai **masa lalu siswa** (`src/remediaide_ml/features/history.py`):
- **Riwayat global dan per konsep:** jumlah dan akurasi sebelumnya, EWM akurasi (α = 0,3), rata-rata keyakinan,
  "terlalu yakin" (yakin tetapi salah), jumlah tiap kuadran CRI sebelumnya, kuadran terakhir, dan jeda waktu.
- **Jawaban saat ini:** benar/salah, CRI, ketersediaan keyakinan, dan kuadran B0.
- **Encoding target out-of-fold:** kesulitan soal, kesulitan konsep, dan porsi opsi salah yang dipilih.
  `src/remediaide_ml/features/encoding.py` membaca hanya label fold latih, dan baris latih memakai inner-OOF.

### 2.5 Label dan split anti-leakage
- **Label masa depan (D-05):** kuadran 3 percobaan berikutnya di konsep yang sama, dengan minimal 2 percobaan.
  Siswa dianggap tuntas jika akurasinya ≥ 2/3, dan yakin jika rata-rata CRI ≥ 3. B0 memprediksi kuadran masa depan =
  kuadran saat ini. Label ini bisa diuji tanpa label guru.
- **Split Eedi (D-04):** 20% siswa menjadi test yang dikunci. Sisanya dibagi GroupKFold(5) per siswa (protokol pyKT).
- **Split MAP (D-06):** StratifiedKFold(5) pada target (setara Kaggle) dan GroupKFold per soal untuk menguji
  generalisasi ke soal baru.
- **Tes leakage:** `tests/test_features_leakage.py` menguji bahwa mengubah masa depan tidak mengubah fitur, bahwa
  encoding tidak membaca label validasi, dan bahwa tidak ada siswa yang muncul di dua split. Tes kausalitas CO-KT ada di
  `tests/test_cokt.py`.

### 2.6 Terjemahan Indonesia dan QA (D-08)
Seluruh MAP diterjemahkan dengan opus-mt-en-id (Apache-2.0), plus empat pengaman:
- placeholder untuk ekspresi matematika;
- pemecahan teks per kalimat;
- pengulangan segmen yang placeholder-nya hilang;
- penjaga halusinasi.

QA manual dilakukan pada 100 sampel berstrata: 46 baik, 34 kesalahan kecil, dan **20 kesalahan berat**
(`reports/translation_card.md`, `reports/tables/translation_qa.csv`). Terjemahan ini hanya dipakai untuk uji lintas
bahasa (E4). Kami tidak menyajikannya sebagai tulisan asli siswa.

---

## 3. Metode  *(Implementasi ML, 25%)*

### 3.1 Lapis 1 — Pelacak Penguasaan (dua framing, D-12)
- **Framing (a):** knowledge tracing standar, yaitu peluang benar pada soal berikutnya. Framing ini dipakai untuk
  pembanding literatur.
- **Framing (b):** diagnosis kuadran masa depan, dalam 4 kelas dan versi biner `butuh_remediasi`. Framing ini dipakai
  untuk produk.

| Model | Isi | Kode |
| --- | --- | --- |
| B0 | aturan v1 apa adanya; setara `engine.ts` (27 tes kesetaraan dari fixture TypeScript) | `cri_rule.py`, `features/history.py::b0_quadrant` |
| B1a / B1b | regresi logistik (kesulitan soal saja / + riwayat konsep + keyakinan saat ini) | `scripts/train_l1_baselines.py` |
| B2 | LightGBM, 23 fitur, Optuna TPE 50 trial per tugas, 5 seed × 5 fold | `l1/lgbm.py`, `scripts/train_l1_lgbm*.py` |
| **M1 CO-KT** | transformer encoder kausal (2 lapis, d = 128, 4 head). Embedding: soal, konsep, benar/salah, **opsi**, **CRI**, jeda waktu, posisi. Tiga kepala: benar berikutnya (atensi gaya SAKT), opsi berikutnya, kuadran masa depan. Loss gabungan dengan bobot 1 : 0,5 : 0,5. | `l1/cokt.py`, `kaggle/kernels/cokt*/` |

**Pemilihan model (D-15 → D-18):** model dipilih dari CV dan tidak pernah dari test.
- CO-KT ensemble 5 seed vs LightGBM ensemble 5 seed pada 217.480 baris yang sama:
  - salah kelompok 0,347 vs 0,358, selisih −0,011 [−0,013; −0,009];
  - macro-F1 0,480 vs 0,465.
  - Sumber: `reports/tables/L1_model_selection.csv`.
- Keduanya tidak seri, jadi CO-KT dipilih.
- LightGBM tetap dipakai sebagai **model penjelas** (tiga alasan SHAP berbahasa Indonesia, `l1/explain.py`) dan
  sebagai cadangan. Jadi alasan yang ditampilkan menjelaskan LightGBM, bukan CO-KT. Hal ini kami ungkap terbuka.

**Model produksi CO-KT** (`scripts/train_cokt_final.py`):
- dilatih pada 70% siswa CV;
- early stopping memakai 10% siswa CV;
- 20% siswa CV tidak disentuh dan dipakai untuk mengkalibrasi Lapis 3.

### 3.2 Lapis 2 — Pembaca Alasan
| Model | Isi |
| --- | --- |
| B0 TF-IDF+LR | n-gram kata 1–2 + karakter 3–5; C dipilih di fold 0 (target: C = 10) |
| M1 mDeBERTa-v3-base | fine-tune 3 epoch, lr 2e-5, batch 16, max_len 192, fp16 di GPU Kaggle. Input: soal, jawaban, benar/salah, alasan |

- **Masking kandidat (D-06):** output dibatasi ke target yang pernah muncul untuk pasangan (soal, benar/salah) di data latih.
- **Bug yang ditemukan dan diperbaiki:** transformers 5 memuat checkpoint fp16, sehingga AdamW pada bobot fp16
  menghasilkan NaN. Solusinya memuat model dalam fp32 dan memakai autocast hanya di CUDA.
- **Pemilihan (D-19, D-21):**
  - Pada CV bahasa Inggris, mDeBERTa tidak lebih baik dari TF-IDF. MAP@3 0,912 vs 0,916, dan category3 seri
    (`reports/tables/L2_cv.csv`).
  - Untuk input Inggris, kami memakai TF-IDF.
  - Untuk input Indonesia, aturan pemilihan dikunci **sebelum** E4 mDeBERTa dihitung. Berdasarkan aturan itu,
    mDeBERTa dipilih.

### 3.3 Lapis 3 — Pengambil Keputusan
- **Kalibrasi:** temperature scaling untuk jaringan saraf (03 §3); isotonic tersedia untuk LightGBM.
- **Fusi:** produk naive-Bayes antara p_L1(kuadran) dan p_L2(Correct) yang dipetakan ke "tuntas", lalu dinormalisasi.
  Fusi ini tidak butuh label. Kerangka stacking disiapkan untuk label guru dari pilot.
- **Conformal (α = 0,1):** LAC untuk L1 dan APS untuk L2.
- **Selective prediction:** skor ragu = 1 − max p.
  - Titik operasi D-09: defer terkecil yang menurunkan salah kelompok ≥ 25% (maksimal 30%), dengan fallback 20%.
  - Pada model produksi, tidak ada titik yang memenuhi syarat itu, jadi dipakai fallback **20%** (D-21).
- **`hidden_misconception`:** p(True_Misconception) ≥ ambang dengan F1 maksimum di validasi (D-20). Kasus ini selalu
  masuk antrean guru.

### 3.4 Pengaman dan layanan
- **Pengaman tebakan cepat:** NT10/20/30, GMM per soal, dan τmin B0 (`guard/rapid_guess.py`). Modul ini hanya diuji
  dengan data simulasi dan tidak dilaporkan sebagai hasil, karena Eedi tidak menyediakan waktu respons.
- **`diagnose()`** (`src/remediaide_ml/diagnose.py`) adalah fungsi murni dan deterministik. Fungsi ini selalu
  mengembalikan status aturan v1 untuk pembanding.
- **Layanan FastAPI** `service/app.py`: `GET /health` dan `POST /v1/diagnose`. Layanan ini tidak menyimpan data
  siswa dan tidak me-log teks alasan.

### 3.5 Compute dan reproduksibilitas
- **CPU lokal:** MacBook Air Apple Silicon, tanpa GPU NVIDIA. Dipakai untuk tabular, terjemahan, dan evaluasi.
- **GPU Kaggle:** dipakai untuk CO-KT dan mDeBERTa (D-14). Rinciannya (`reports/tables/compute_summary.csv`):
  - mDeBERTa: 166,5 + 166,3 menit;
  - CO-KT CV penuh: 37,1 menit;
  - CO-KT produksi: 5,5 menit.
- **Reproduksi:**
  - Seed global 20261118, dan ensemble memakai seed {20261118, 1, 2, 3, 4}.
  - `make all` mereproduksi semua tabel dari data mentah. `make check-repro` membandingkannya dengan tabel di repo.
  - Semua keputusan dikunci di `docs/DECISIONS.md` sebelum hasil terkait dilihat.

---

## 4. Hasil  *(Evaluasi model, 20%)*
Format setiap eksperimen beserta CI lengkapnya ada di `reports/RESULTS.md`. Ringkasan:

### 4.1 E1 — aturan v1 salah mengelompokkan hampir separuh kasus (test)
| Metrik | Nilai test [CI 95%] |
| --- | --- |
| Salah kelompok 4 kelas | **0,451** [0,431–0,469] |
| "Paham" menurut v1 yang belum tuntas berikutnya | **0,278** [0,257–0,300] |
| "Miskonsepsi" menurut v1 yang tuntas berikutnya | 0,524 [0,504–0,544] |

Sumber: `reports/tables/E1_b0_test.csv`. Gambar: `reports/figures/E1_confusion_b0.png`.

### 4.2 Lapis 1 di test — semua model, siswa yang sama
| Model | Salah kelompok | Macro-F1 (4 kelas) | AUC butuh_remediasi | AUC benar berikutnya |
| --- | --- | --- | --- | --- |
| B0 aturan v1 | 0,451 | 0,392 | 0,631 | — |
| B1a | 0,429 | 0,182 | 0,558 | 0,677 |
| B1b | 0,401 | 0,360 | 0,734 | 0,747 |
| B2 LightGBM (25 model) | 0,362 | 0,433 | 0,794 | 0,795 |
| **M1 CO-KT (5 seed)** | **0,347** [0,330–0,366] | **0,445** | **0,801** | **0,796** |

Sumber: `reports/tables/L1_test.csv`.

- **CO-KT − B0:** salah kelompok −0,103 [−0,109; −0,097].
- **CO-KT − LightGBM:** salah kelompok −0,014 [−0,018; −0,011].
- **Uji signifikansi:** McNemar dan DeLong setelah koreksi Holm, semua p < 0,001 (`reports/tables/L1_test_pairwise.csv`).
- **Pembanding literatur (framing a):** AKT 0,8033 dan simpleKT 0,8035 pada split pyKT [7]. Protokol kami berbeda
  (split per siswa dengan test terkunci; CO-KT juga melatih dua kepala lain), jadi angkanya tidak setara langsung.
- **Interpretasi lokal:** SHAP beeswarm ada di `reports/figures/L1_shap_beeswarm.png`. Fitur teratas adalah
  "terlalu yakin" sebelumnya dan akurasi sebelumnya (notebook `03`).

### 4.3 E2 — sinyal yang penting (CV)
- **LightGBM tahap S0 → S6** (`reports/tables/E2_ablation_cv.csv`, kenaikan per tahap di `reports/tables/E2_ablation_increments_cv.csv`): macro-F1 naik dari 0,178 menjadi 0,465.
  - Kenaikan terbesar dari riwayat (S2: +0,109) dan keyakinan (S1: +0,113; S3: +0,040).
  - Opsi jawaban hampir tidak menambah (+0,001).
- **CO-KT** (`reports/tables/E2_cokt_ablation_cv.csv`):
  - tanpa keyakinan, macro-F1 kuadran turun **0,158** [0,146–0,171];
  - tanpa opsi, turun 0,002 [0,000–0,004].
- **Kesimpulan RQ1:** keyakinan adalah sinyal paling bernilai, asalkan *dipelajari* bersama riwayat dan tidak dipakai
  sebagai ambang tetap.

### 4.4 E3 — jebakan jawaban benar (CV MAP)
Kelas positif: 403 alasan True_Misconception.

| Model | Recall | Presisi | PR-AUC |
| --- | --- | --- | --- |
| Aturan v1 | 0 (benar + yakin selalu "Paham") | — | — |
| TF-IDF+LR | **0,375** [0,329–0,422] | 0,821 | 0,582 |
| mDeBERTa | 0,323 [0,277–0,367] | 0,807 | 0,549 |

Sumber: `reports/tables/E3_true_misconception.csv`.

- **Antrean guru** (`reports/tables/E3_queue_cv.csv`): pada ambang produksi, penanda `hidden_misconception`
  menangkap 50,0% (TF-IDF) dan 51,2% (mDeBERTa) kasus positif, sambil menandai hanya 1,4–1,7% jawaban benar.
- **Pembanding literatur:** BERT 57,4% [8], pada data dan split yang berbeda.

### 4.5 E4 — alasan berbahasa Indonesia (CV MAP, fold 0)
| Model | MAP@3 EN | MAP@3 ID | Selisih |
| --- | --- | --- | --- |
| TF-IDF+LR | 0,916 | 0,766 | −0,150 [−0,158; −0,143] |
| mDeBERTa-v3-base | 0,911 | **0,895** | **−0,016** [−0,020; −0,013] |

Sumber: `reports/tables/E4_crosslingual.csv`.

- Selisih model pada input Indonesia: MAP@3 +0,129 [+0,121; +0,136].
- Di bahasa Inggris kedua model setara. Hanya encoder multibahasa yang bertahan ketika alasannya berbahasa Indonesia.
- Ini dasar pemilihan L2 untuk produk Indonesia.

### 4.6 E5 — tahu batas diri (test, parameter produksi tanpa refit)
- **Cakupan conformal LAC:** **0,900** untuk target 0,90. Ukuran himpunan rata-rata 1,90, dan 29,6% himpunan berisi
  satu kuadran.
- **ECE:** 0,0063 sebelum kalibrasi, 0,0068 sesudahnya. CO-KT sudah terkalibrasi baik, dan temperature scaling tidak
  membantu di test. Hasil ini dilaporkan apa adanya.
- **Defer:** 20,6% kasus diserahkan. Salah kelompok sisa turun dari 0,347 menjadi 0,283.
- Sumber: `reports/tables/E5_test.json`, `reports/figures/E5_coverage_risk.png`, `reports/figures/E5_reliability_L1.png`.

### 4.7 E8 — dampak bagi guru (simulasi test)
| | Nilai |
| --- | --- |
| Salah kelompok aturan v1 | 0,451 |
| Salah kelompok RemediAide 2.0 | 0,347 |
| Kasus diserahkan ke guru | 20,6% (±99 kasus per kelas 32 siswa × 15 soal) |
| Salah kelompok pada kasus yang tidak diserahkan | 0,283 (aturan v1 pada kasus yang sama: 0,392) |
| Kesalahan model yang tertangkap antrean | 35,3% |

Sumber: `reports/tables/E8_impact.csv`.

### 4.8 E6 — fairness (test): kesenjangan nyata, tidak disembunyikan
| Kelompok (a vs b) | Salah kelompok | Selisih [CI] |
| --- | --- | --- |
| Perempuan vs laki-laki | 0,374 vs 0,326 | +0,048 [+0,005; +0,093] |
| Pupil premium vs bukan | 0,449 vs 0,328 | +0,121 [+0,072; +0,173] |
| Kuartil kemampuan 1 vs 4 | 0,509 vs 0,195 | +0,314 [+0,283; +0,345] |

Sumber: `reports/tables/E6_fairness.csv`.

- Atribut-atribut ini tidak pernah dipakai sebagai fitur (D-13).
- Aturan v1 timpang pada kelompok yang sama: pupil premium +0,095, kuartil 1 +0,307. RemediAide 2.0 lebih akurat
  dari aturan v1 di setiap kelompok, tetapi kesenjangannya tidak hilang.
- Kesenjangan Gender hanya terlihat di test, tidak di CV.
- Mitigasi saat ini: kelompok rentan lebih sering masuk antrean guru (tingkat defer pupil premium 0,293 vs 0,177).

### 4.9 Robustness dan analisis error
- **Temporal** (`reports/tables/robustness_temporal_test.csv`): pada 20% interaksi terakhir tiap siswa, semua model
  memburuk (B0 0,484, LightGBM 0,411, CO-KT 0,389), tetapi urutannya tetap.
- **Error utama** (`reports/tables/E1_cokt_test_per_class.csv`, `reports/figures/E1_confusion_cokt.png`). Recall per
  kelas: Paham 0,886, Tebakan beruntung 0,05, Miskonsepsi 0,368, Tidak paham 0,452.
  - Kelas *Tebakan beruntung* (tuntas tetapi tidak yakin) hampir tidak pernah diprediksi.
  - Kesalahan paling berbahaya: 55,9% kasus yang di masa depan *Miskonsepsi* diprediksi *Paham* (8.626 dari 15.440).
    Model melihat siswa yang yakin dan sering benar, tetapi tiga soal berikutnya salah dengan yakin.
  - Inilah alasan Lapis 2 (membaca alasan) dan antrean guru diperlukan: riwayat jawaban saja tidak cukup untuk
    menangkap miskonsepsi yang belum muncul.
- **Pola CV → test:** angka test konsisten dengan CV. Salah kelompok CO-KT 0,347 di CV dan 0,347 di test
  (`reports/tables/L1_cv_summary.csv`, `reports/tables/L1_test.csv`).

---

## 5. Inovasi dan dampak  *(Inovasi & dampak, 20%)*
1. **CRI yang dipelajari.** Aturan 2×2 diganti model yang belajar dari keyakinan, riwayat, dan pilihan jawaban.
   Salah kelompok turun 10,3 poin di siswa yang belum pernah dilihat model.
2. **Diagnosis bernama, termasuk pada jawaban benar.** Lapis 2 menamai miskonsepsi dari satu kalimat alasan (35 label
   dengan deskripsi Indonesia, `reports/tables/map_misconception_dictionary.csv`). Lapis ini juga menangkap sebagian
   siswa "benar tapi nalar keliru", yang tidak mungkin ditangkap aturan v1.
3. **Model yang tahu batasnya.** Himpunan prediksi conformal dengan cakupan 0,900 sesuai target, dan kasus ragu
   diserahkan ke guru. Guru tetap memegang keputusan untuk sekitar seperlima kasus.
4. **Siap untuk Indonesia.** Alasan berbahasa Indonesia ditangani mDeBERTa dengan penurunan MAP@3 hanya 0,016 dari
   bahasa Inggris.
5. **Siap diimplementasikan.**
   - `POST /v1/diagnose` bisa dipanggil dari aplikasi web RemediAide, dengan fallback ke aturan v1 bila layanan mati.
   - Latensi untuk satu kelas 40 siswa × 15 soal di CPU laptop (`reports/tables/E7_latency_service_cpu.json`):
     0,59 detik tanpa L2, dan 8,25 detik dengan mDeBERTa untuk 600 alasan.
6. **Privasi:** layanan tidak menyimpan data siswa. Data pilot anonim, dengan persetujuan orang tua (UU PDP Pasal 25).

**Alur kelas:**
1. Siswa menjawab soal pilihan ganda, mengisi keyakinan 0–5, dan menulis alasan satu kalimat.
2. RemediAide 2.0 mengelompokkan siswa per konsep dan menamai miskonsepsinya.
3. Kasus ragu dan "benar tapi nalar keliru" masuk panel **"Perlu dicek guru"**.
4. Guru menyetujui atau mengubah. Umpan balik guru disimpan sebagai label untuk Lapis 3 stacking di pilot.

---

## 6. Keterbatasan dan rencana lanjut
**Keterbatasan:**
- Label kuadran masa depan adalah proxy, bukan label guru. Sebagian perubahan "Miskonsepsi → tuntas" adalah
  pembelajaran setelah umpan balik Eedi.
- Keyakinan kosong tidak acak, jadi E1 dan E8 berlaku untuk subpopulasi yang mengisi keyakinan.
- Angka CV CO-KT sedikit optimistis, karena early stopping memakai fold validasi yang dinilai. Angka test memakai model
  produksi yang bebas bias ini.
- Alasan SHAP berasal dari LightGBM (model penjelas), bukan dari CO-KT.
- Soal di aplikasi tidak ada di kosakata Eedi. Untuk soal tersebut, CO-KT hanya memakai urutan benar/salah, opsi,
  keyakinan, dan jeda waktu.
- MAP tidak punya fold test yang dikunci. Sekitar 27% alasan MAP sintetis tanpa penanda, dan ID soal sama antara
  train dan validasi.
- Terjemahan mesin punya 20% kesalahan berat pada QA, dan bukan tulisan asli siswa Indonesia. mDeBERTa produksi adalah
  model fold 0 (80% data MAP).
- Kesenjangan fairness besar. PremiumPupil adalah ukuran sosial-ekonomi Inggris.
- Pengaman tebakan cepat belum divalidasi pada data nyata.
- Model ini **tidak untuk** menentukan nilai rapor atau kenaikan kelas.

**Hasil tambahan (Tingkat A, `reports/RESULTS.md`):**
- **E7:** model student MiniLM int8 berukuran 118,3 MB, dengan MAP@3 Indonesia 0,834 dan latensi p50 7,8 ms di CPU
  laptop (`reports/tables/E7_efficiency.csv`).
- **T68:** Lapis 1 berjalan di browser guru (ONNX), dengan selisih probabilitas maksimum 0,0046 terhadap LightGBM
  (`reports/tables/T68_onnx_parity.json`).
- **T36:** retrieval zero-shot untuk soal baru tidak lebih baik dari acak, yaitu MAP@3 0,689 vs 0,669
  (`reports/tables/T36_retrieval.csv`). Hasil negatif ini dilaporkan apa adanya.

**Rencana lanjut (Tingkat A dan B):**
- Pilot sekolah: dua guru melabeli ≥ 200 alasan, lalu diukur kappa (E9).
- Studi dampak belajar dua kelas (E10).
- Lapis 2 di perangkat: student 118 MB masih perlu diperkecil untuk HP. Ini penting karena 86% sekolah belum punya
  internet tetap [9].
- Pendekatan lain untuk soal baru, misalnya few-shot dengan contoh guru, karena retrieval zero-shot gagal (T36).
- Mitigasi fairness, misalnya ambang defer per kelompok.

---

## Pustaka
1. OECD (2026). *PISA 2025 Results, Country Note Indonesia.* https://www.oecd.org/en/publications/pisa-2025-results-volume-i-country-notes_2d4ff9ea-en/indonesia_9c880f8a-en.html
2. Rapor Pendidikan 2025, numerasi. https://www.gebrak.id/?p=18182
3. Hasan, S., Bagayoko, D., & Kelley, E. L. (1999). Misconceptions and the Certainty of Response Index (CRI). *Physics Education*, 34(5). https://iopscience.iop.org/article/10.1088/0031-9120/34/5/304
4. Repositori Univ. Pretoria tentang penerapan model Hasan pada skor mentah. https://repository.up.ac.za/handle/2263/16658
5. Wang, Z. dkk. (2020). *Diagnostic Questions: The NeurIPS 2020 Education Challenge.* arXiv:2007.12061. https://eedi.com/projects/neurips-education-challenge
6. Rittle-Johnson, B. dkk. (2025). MAP/MIME dataset, AIME-Con WIP. https://aclanthology.org/2025.aimecon-wip.3.pdf ; Kaggle: https://www.kaggle.com/competitions/map-charting-student-math-misunderstandings
7. Liu, Z. dkk. (2023). *simpleKT.* arXiv:2302.06881. https://arxiv.org/pdf/2302.06881
8. arXiv:2606.23205 (jebakan jawaban benar di Eedi). https://arxiv.org/pdf/2606.23205
9. Komdigi (Jun 2025), akses internet sekolah. https://www.fortuneidn.com/tech/pemerintah-genjot-internet-100-mbps-di-sekolah-dan-puskesmas-00-6cmtl-glh57b
10. Mitton dkk. (2025), selective prediction pada knowledge tracing. https://arxiv.org/pdf/2509.21514
11. Helsinki-NLP opus-mt-en-id (Apache-2.0). https://huggingface.co/Helsinki-NLP/opus-mt-en-id
12. He, P. dkk. (2021). DeBERTaV3 / mDeBERTa-v3-base (MIT). https://huggingface.co/microsoft/mdeberta-v3-base
