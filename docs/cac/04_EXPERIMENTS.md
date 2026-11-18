# 04 — Protokol Eksperimen E1–E10

Aturan umum:
- Semua angka dilaporkan dengan **CI 95% bootstrap** (1000 ulangan, resampling per kluster: UserId untuk
  Eedi, QuestionId×siswa untuk MAP, siswa untuk pilot).
- Perbandingan berpasangan: **DeLong** untuk AUC, **McNemar** untuk akurasi/klasifikasi berpasangan.
  Beberapa perbandingan dalam satu eksperimen dikoreksi Holm.
- Pengembangan memakai CV. **Test set dibuka sekali** di T46 untuk semua model sekaligus.
- Setiap eksperimen menghasilkan `reports/tables/E<n>_*.csv`, gambar `reports/figures/E<n>_*.png`, dan
  satu bagian di `reports/RESULTS.md` dengan format: pertanyaan → setup → hasil (tabel/angka + CI) →
  interpretasi satu paragraf → keterbatasan.

Definisi metrik (implementasi di `src/remediaide_ml/eval/metrics.py`, diuji terhadap sklearn bila tersedia):
- AUC, log loss, Brier: sklearn.
- **ECE:** 15 bin lebar sama, Σ (n_b/N)·|acc_b − conf_b|. Untuk multikelas pakai confidence top-1.
- **MAP@3:** per baris, 1/rank jika target ada di top-3 (rank 1..3), selain itu 0; dirata-rata. Sama dengan metrik Kaggle.
- **Macro-F1** dan recall per kelas: sklearn.
- **Cohen's kappa:** sklearn `cohen_kappa_score` (nominal, tanpa bobot).
- **Tingkat salah kelompok:** P(kuadran prediksi ≠ kuadran acuan).

---

## E1 — Audit aturan CRI (inti cerita)
**Pertanyaan:** seberapa sering aturan v1 salah mengelompokkan siswa?
**Data:** Eedi test (dan CV untuk pengembangan), baris dengan confidence, dan label kuadran masa depan (02 §5).
**Hasil yang dilaporkan:**
- Confusion matrix 4×4 (kuadran B0 saat ini vs kuadran masa depan), dinormalisasi per baris.
- Tingkat salah kelompok B0 (4 kelas) dan error biner `butuh_remediasi`.
- Dua angka cerita: % siswa berlabel "Paham" oleh B0 yang ternyata belum tuntas, dan % berlabel
  "Miskonsepsi" yang ternyata tuntas di percobaan berikutnya (slip).
**Gambar:** `E1_confusion_b0.png`.

## E2 — Nilai tiap sinyal (ablation)
**Pertanyaan (RQ1):** apakah keyakinan, opsi, riwayat, dan waktu menambah daya prediksi?
**Setup:** LightGBM framing (b) dengan tahap S0…S6 (03 §1). Ulangi untuk CO-KT: penuh vs tanpa keyakinan vs tanpa opsi.
**Metrik:** macro-F1 4 kelas, AUC biner `butuh_remediasi`, tingkat salah kelompok.
**Gambar:** `E2_ablation.png`, berupa bar kenaikan metrik per sinyal dengan whisker CI.
**Uji:** DeLong berpasangan antara tahap berurutan, dikoreksi Holm.

## E3 — Jebakan jawaban benar
**Pertanyaan:** bisakah L2 menangkap siswa yang benar tetapi nalarnya keliru?
**Data:** MAP. Kelas positif = True_Misconception.
**Metrik:** recall, presisi, F1, PR-AUC. Baseline B0 recall = 0 karena desainnya (benar + yakin = Paham).
Pembanding literatur: BERT 57,4% (arXiv 2606.23205). Sebutkan bahwa set data dan split-nya berbeda.
**Tambahan:** berapa kasus positif yang ikut tertangkap oleh antrean "perlu dicek guru" L3 pada tingkat defer yang dipilih.

## E4 — Lintas bahasa
**Pertanyaan:** apakah L2 bekerja pada alasan berbahasa Indonesia?
**Setup:** M1 dilatih bahasa Inggris, lalu dievaluasi pada test fold asli dan test fold terjemahan (zero-shot).
Opsional: translate-train.
**Metrik:** MAP@3, macro-F1 `category3`, recall True_Misconception. Laporkan selisihnya dengan CI.
**Catatan wajib:** terjemahan mesin bukan tulisan asli siswa Indonesia. Validasi native menyusul di pilot (E9).

## E5 — Tahu batas diri
**Pertanyaan:** apakah menyerahkan kasus ragu ke guru menaikkan akurasi sisanya, dan apakah conformal
menepati janjinya?
**Setup:** L1 framing (b) dan L2. Kurva coverage-risk untuk defer 0–30%. Conformal α = 0,1: cakupan
empiris dan ukuran himpunan.
**Gambar:** `E5_coverage_risk.png`, `E5_reliability_L1.png`, `E5_reliability_L2.png`.
**Pembanding literatur:** Mitton dkk. 2025 (+1,9–2,4 AUC pada coverage 80%).

## E6 — Fairness
**Kelompok:** Gender (1 vs 2; kode 0/3 dilaporkan terpisah jika n ≥ 200), PremiumPupil (0 vs 1, jika
artinya terverifikasi), kuartil kemampuan.
**Metrik per kelompok:** AUC, ECE, tingkat salah kelompok, tingkat defer. Selisih antarkelompok diberi CI.
**Kriteria:** tidak ada klaim "adil" tanpa angka. Selisih yang CI-nya tidak memuat 0 dilaporkan sebagai
temuan dan dibahas.

## E7 — Ringan untuk offline (Tingkat A)
Ukuran artefak (MB), latensi p50/p95 per prediksi di CPU laptop dan di browser (onnxruntime-web), serta
penurunan metrik setelah distilasi/kuantisasi.

## E8 — Dampak bagi guru (simulasi)
**Setup:** pada Eedi test, kelompokkan siswa per KC dengan B0 dan dengan RemediAide 2.0 (L1 + L3 pada
titik operasi terpilih).
**Hasil:**
- Tingkat salah kelompok B0 vs ML.
- Jumlah dan persentase kasus yang diserahkan ke guru.
- Salah kelompok pada kasus yang tidak diserahkan.
- Estimasi beban tinjauan guru per kelas 32 siswa × 15 soal.
**Kalimat utama** (template di 01_CONTEXT) diisi dari tabel ini.

## E9 — Kesepakatan model–guru (pilot, Tingkat B)
Dua guru melabeli secara independen ≥ 200 alasan dengan rubrik (06_PILOT_PROTOCOL). Laporkan kappa
guru–guru, kappa model–guru1, kappa model–guru2, dan kappa model–label konsensus. Hitung juga akurasi fusi
L3 terhadap label konsensus.

## E10 — Dampak belajar (final, Tingkat B)
Dua kelas: pengelompokan ML vs B0, dengan LKPD dan durasi yang sama. Ukurannya adalah skor Exit Ticket pada
soal isomorfik. Laporkan selisih, Hedges' g dengan CI, dan label "studi awal sampel kecil". Kedua kelas
tetap mendapat remediasi.

---

## Struktur `reports/RESULTS.md`
1. Ringkasan angka utama (kalimat utama dan 5 angka kunci, masing-masing dengan path tabel sumbernya)
2. Data (ringkasan data card)
3. E1 … E10 (format di atas; yang belum dijalankan ditulis "Belum dijalankan — rencana")
4. Model terpilih per lapis + hiperparameter
5. Keterbatasan
6. Lampiran: versi library (`requirements-lock.txt`), hash data, id run
