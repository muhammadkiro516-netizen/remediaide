# 03 — Spesifikasi Model dan Rencana Komputasi

## 0. Compute plan
Mesin pemilik: MacBook Air Apple Silicon, tanpa CUDA. `scripts/check_env.py` menulis `runs/env_report.json`
dengan rekomendasi penempatan.

| Pekerjaan | Tempat | Alasan |
| --- | --- | --- |
| Loader, cleaning, fitur, EDA, B0, B1, B2 LightGBM, Optuna, SHAP, kalibrasi, conformal, statistik | Lokal (CPU) | Tabular, ±1,4 juta baris, muat di RAM jika memakai dtype hemat (int32/float32, category) |
| Terjemahan opus-mt-en-id | Lokal (CPU/MPS) | Model kecil (±75M parameter) |
| M1 CO-KT transformer (5 seed) | **Kaggle GPU** | Puluhan epoch × 5 seed |
| L2 fine-tune mDeBERTa (5 fold × 2 split) | **Kaggle GPU** | Encoder base, 36k contoh |
| Smoke test semua model DL | Lokal, subset 1–2% data, 1 epoch | Menangkap bug sebelum menghabiskan kuota GPU |

**Alur Kaggle (T03, T23, T31):**
1. Auth: `kaggle competitions list -s map` harus sukses. Token lama memakai `~/.kaggle/kaggle.json` (chmod 600);
   token baru bisa lewat env `KAGGLE_API_TOKEN`. Jika gagal: baca `kaggle --help`/dokumen CLI dan pakai cara
   yang didukung versi terpasang. Kalau token belum ada → blocker M1.
2. Data ke Kaggle sebagai **dataset privat**:
   - `kaggle/datasets/remediaide-eedi-raw/`: zip Eedi asli tanpa modifikasi. Privat dan tidak dibagikan, jadi
     sesuai ND.
   - `kaggle/datasets/remediaide-processed/`: parquet olahan + splits (privat).
   - `kaggle/datasets/remediaide-ml-src/`: salinan `src/` + `configs/` (versi diperbarui tiap push kode).
   - Perintah: `kaggle datasets init -p <dir>` → isi `dataset-metadata.json` (`id: "<username>/<slug>"`, title,
     licenses) → `kaggle datasets create -p <dir> --dir-mode zip` (pertama kali) atau
     `kaggle datasets version -p <dir> -m "<pesan>" --dir-mode zip`.
   - Data MAP dipakai langsung lewat `competition_sources`.
3. Kernel: `kaggle/kernels/<slug>/` berisi `train.py` + `kernel-metadata.json`:
   ```json
   {"id": "<username>/<slug>", "title": "<Judul>", "code_file": "train.py", "language": "python",
    "kernel_type": "script", "is_private": true, "enable_gpu": true, "enable_internet": true,
    "dataset_sources": ["<username>/remediaide-processed", "<username>/remediaide-ml-src"],
    "competition_sources": ["map-charting-student-math-misunderstandings"], "kernel_sources": [], "model_sources": []}
   ```
   Di `train.py`: `sys.path.insert(0, "/kaggle/input/remediaide-ml-src/src")`, cetak `nvidia-smi`, set seed,
   tulis semua output ke `/kaggle/working/`.
4. `kaggle kernels push -p kaggle/kernels/<slug>`, cek `kaggle kernels status <username>/<slug>` tiap 5–10
   menit (jangan menunggu dengan sleep panjang dalam satu perintah), lalu
   `kaggle kernels output <username>/<slug> -p runs/<run_id>/kaggle_output`.
5. Catat kuota GPU yang terpakai di PROGRESS.md. Kuota gratis Kaggle sekitar 30 jam/minggu; target pemakaian ≤ 20 jam.

## 1. Lapis 1 — Pelacak Penguasaan

### B0 (selesai, `cri_rule.py`)
Kuadran saat ini = prediksi kuadran masa depan. Untuk framing (a), skor B0 = 1 jika kuadran ∈ {P, L}, selain itu 0.
AUC-nya dari skor ordinal P=3, L=2, T=1, M=0, dan bentuk ini didokumentasikan.

### B1
- B1a: tingkat kesulitan soal OOF (rata-rata benar per soal di fold latih).
- B1b: logistic regression (sklearn, L2, C dicari di {0,01; 0,1; 1; 10}) pada `acc_prev_kc, log1p(n_prev_kc),
  item_diff_oof, kc_diff_oof` [+ `cur_correct, cur_cri` untuk framing (b)].

### B2 LightGBM
- Framing (a): biner. Framing (b): multiclass 4 kelas + biner `butuh_remediasi`.
- Optuna TPE 50 trial di fold 0 dengan seed tetap. Ruang pencarian: `num_leaves` 15–255, `learning_rate`
  0,02–0,2 (log), `min_child_samples` 20–500, `feature_fraction` 0,5–1, `bagging_fraction` 0,5–1
  (`bagging_freq` 1), `lambda_l2` 1e-3–10 (log). Early stopping 100 ronde.
- Parameter terbaik dipakai pada 5 fold. Ensemble 5 seed untuk ketidakpastian (T41).
- Ablation E2 (framing b): S0 `cur_correct` → S1 +`cur_cri` → S2 +riwayat benar → S3 +riwayat keyakinan →
  S4 +kesulitan soal/KC → S5 +fitur opsi → S6 +fitur waktu.
- SHAP TreeExplainer: global (beeswarm) + lokal (3 alasan teratas per prediksi, dengan nama fitur dalam
  Bahasa Indonesia, misalnya "salah 3× di topik ini dengan yakin tinggi").

### M1 CO-KT (Confidence & Option Knowledge Tracing), PyTorch
- Token interaksi pada langkah t = E_q[q] + E_kc[k] + E_corr[c] + E_opt[o] + E_cri[cri ∈ 0..5, 6 = kosong]
  + E_gap[bucket log jam sejak sebelumnya] + posisi.
- Encoder transformer kausal: d_model 128, 2 layer, 4 head, FFN 256, dropout 0,2, max_len 200.
  Sekuens panjang dipotong menjadi jendela 200 dengan stride 200, seperti protokol pyKT.
- Kepala prediksi:
  1. **next-correct:** query = E_q[q_{t+1}] + E_kc[k_{t+1}] meng-attend ke interaksi ≤ t (gaya SAKT) → sigmoid.
  2. **next-option:** 4 kelas, dari query yang sama.
  3. **future-quadrant** (framing b): pada t → 4 kelas (di-mask jika label tidak ada).
- Loss = BCE(next-correct) + 0,5·CE(next-option) + 0,5·CE(future-quadrant).
- AdamW lr 1e-3, wd 1e-5, batch 64 sekuens, ≤ 30 epoch, early stopping patience 3 pada AUC validasi,
  gradient clipping 1,0, 5 seed.
- Ablation: tanpa keyakinan (cri selalu token 6) dan tanpa opsi (E_opt dimatikan). Keduanya menjawab RQ1.
- Smoke test lokal: 1% siswa, 1 epoch, harus jalan < 5 menit dengan loss turun.

## 2. Lapis 2 — Pembaca Alasan
- Template input: `Soal: {QuestionText} [SEP] Jawaban: {MC_Answer} ({benar|salah}) [SEP] Alasan: {StudentExplanation}`.
  Untuk data Indonesia dipakai template yang sama dalam Bahasa Indonesia.
- **B0:** TF-IDF (word 1–2 gram + char 3–5 gram) + LogisticRegression (C dicari) dengan kandidat yang dibatasi.
- **M1:** `microsoft/mdeberta-v3-base` (multibahasa, lisensi MIT) untuk sequence classification atas semua
  target. Saat inferensi, logit di luar kandidat (QuestionId, prefiks benar/salah) di-mask -∞ (D-06).
  lr 2e-5, batch 16, 3 epoch, max_len 192, warmup 10%, weight decay 0,01. fp16 hanya jika tidak NaN;
  kalau NaN pakai fp32. Cadangan: `xlm-roberta-base`. OOF 5 fold disimpan.
- **Split per soal:** tugas `category3` (Correct/Neither/Misconception) dengan input yang sama. Inilah
  generalisasi ke soal yang belum pernah dilihat.
- **E3 jebakan jawaban benar:** recall, presisi, dan F1 kelas True_Misconception. Laporkan juga berapa yang
  ditandai "perlu dicek guru" oleh L3.
- **E4 lintas bahasa:** M1 (dilatih bahasa Inggris) dievaluasi zero-shot pada test fold terjemahan.
  Opsional: translate-train (latih pada train terjemahan) sebagai pembanding.
- **Tingkat A, M2:** LLM kecil + LoRA (misalnya Qwen2.5-1.5B-Instruct; cek lisensi model). Hanya jika kuota
  dan waktu cukup.
- **Tingkat A, distilasi:** `microsoft/Multilingual-MiniLM-L12-H384` (MIT) belajar dari soft label M1,
  diekspor ke ONNX int8. Ukur ukuran (MB), latensi CPU, dan penurunan MAP@3 (E7).
- **Tingkat A, retrieval:** multilingual-e5-base, kemiripan alasan ↔ deskripsi miskonsepsi milik soal
  tersebut, untuk soal baru dengan rubrik guru.

## 3. Lapis 3 — Pengambil Keputusan
- **Kalibrasi:** isotonic untuk LightGBM, temperature scaling untuk jaringan saraf. Dipasang di calibration
  split, dan ECE dilaporkan sebelum dan sesudah. Reliability diagram per lapis.
- **Conformal:** split conformal. LAC untuk L1 (4 kelas dan biner), APS untuk L2. α = 0,1. Laporkan cakupan
  empiris pada test dan rata-rata ukuran himpunan.
- **Selective prediction:** skor ragu = 1 − max p (alternatif: ukuran himpunan conformal > 1, atau varians
  ensemble). Kurva coverage-risk untuk defer ∈ {0, 5, …, 30%}. Titik operasi dipilih di validasi (D-09).
- **Fusi (validasi di pilot):**
  - (i) Produk naive-Bayes antara p_L1(kuadran) dan p_L2(kategori) yang dipetakan ke kuadran, lalu dinormalisasi.
  - (ii) Stacking logistic (L2-regularized) dengan label emas guru, dinilai dengan CV.
  - Pilih (i) jika (ii) tidak lebih baik secara signifikan, karena lebih sederhana dan tidak butuh label.
- **Penanda khusus:** `hidden_misconception = (L2 memprediksi True_Misconception dengan p ≥ ambang validasi)`.
  Ini selalu masuk antrean guru.

## 4. Pengaman — Detektor Tebakan Cepat
- NT10: ambang_i = 0,10 × rata-rata waktu respons soal i. Uji juga NT20 dan NT30.
- GMM 2 komponen pada log waktu per soal (minimal 30 respons; jika kurang, gabungkan per kelompok jumlah kata).
  Ambangnya adalah titik di mana posterior komponen cepat = 0,5.
- Pembanding: τmin B0 = ceil(kata/2,5) detik.
- Evaluasi tanpa label: akurasi respons yang ditandai (tebakan murni ≈ 25% untuk 4 opsi), porsi yang ditandai,
  dan kesepakatan antarmetode. Sebelum data pilot ada, modul diuji dengan data simulasi dan tidak dilaporkan
  sebagai hasil.

## 5. Pemilihan model dan artefak
- Pilih berdasarkan rata-rata metrik CV (validasi). Kalau seri, pilih yang lebih sederhana. **Test set dibuka
  sekali** di T46. Semua kandidat dievaluasi pada test di run yang sama.
- Artefak produksi di `models/`: `l1_lgbm_v1.joblib` + `l1_features_v1.json` + `l1_calibrator_v1.joblib`;
  `l2_mdeberta_v1/` (format HF) + `l2_candidates_v1.json`; `l3_conformal_v1.json`; `model_card.md`.
  Model besar disimpan di Kaggle Models atau dataset privat, sedangkan `models/README.md` mencatat cara mengambilnya.
