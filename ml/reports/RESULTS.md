# RESULTS — RemediAide 2.0 (CAC MLSC 2026)

Status: **draf pengembangan (CV)**. Test set Eedi belum dibuka (dibuka sekali di T46). Setiap angka menunjuk ke file
sumber di `ml/reports/`. Placeholder `[Ex:...]` = belum dihitung.

## 1. Ringkasan angka utama
Kalimat utama (diisi di T46 dari `tables/E8_impact.csv`):
"Aturan CRI salah mengelompokkan [E8:B0_misgroup]% siswa. RemediAide 2.0 menurunkannya menjadi [E8:ML_misgroup]%,
dan [E8:defer]% kasus paling meragukan diserahkan ke guru."

| Angka kunci | Nilai | Sumber |
| --- | --- | --- |
| Salah kelompok aturan v1 (test) | [E1:B0_misgroup] | `tables/E1_b0_test.csv` |
| Salah kelompok RemediAide 2.0 (test) | [E8:ML_misgroup] | `tables/E8_impact.csv` |
| Recall jebakan jawaban benar (L2) | [E3:recall] | `tables/E3_true_misconception.csv` |
| Selisih MAP@3 EN → ID | [E4:delta] | `tables/E4_crosslingual.csv` |
| Cakupan conformal (target 90%) | [E5:coverage] | `tables/E5_conformal.csv` |

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
- **Setup:** label kuadran masa depan (3 percobaan berikutnya di KC yang sama, D-05), baris dengan keyakinan.
- **Hasil pengembangan (CV, 80% siswa; `tables/E1_b0_cv.csv`):** salah kelompok 4 kelas 0,450 [0,440–0,459];
  "Paham" yang belum tuntas berikutnya 0,282 [0,270–0,294]; "Miskonsepsi" yang tuntas berikutnya 0,507 [0,495–0,519].
  Hasil test: [E1:test].
- **Keterbatasan:** label proxy; sebagian perubahan "Miskonsepsi → tuntas" adalah pembelajaran setelah umpan balik.

### E2 — Nilai tiap sinyal
[E2: belum dijalankan — T22 berjalan]

### E3 — Jebakan jawaban benar
[E3: menunggu T31]

### E4 — Lintas bahasa
[E4: menunggu T31, T32]

### E5 — Tahu batas diri
Belum dijalankan — rencana (T40–T42).

### E6 — Fairness
Belum dijalankan — rencana (T45).

### E7 — Ringan untuk offline
Tingkat A — rencana.

### E8 — Dampak bagi guru (simulasi)
Belum dijalankan — rencana (T45).

### E9 — Kesepakatan model–guru
Tingkat B — menunggu pilot.

### E10 — Dampak belajar
Tingkat B — menunggu pilot.

## 4. Model terpilih per lapis
[diisi di T24/T46]

## 5. Keterbatasan
- Label kuadran masa depan adalah proxy, bukan label guru.
- Keyakinan hilang tidak acak (temuan EDA 2).
- MAP: 27% alasan sintetis tanpa penanda; ID soal test Kaggle sama dengan train (skor random split overoptimistis, D-06).
- Terjemahan mesin bukan tulisan asli siswa Indonesia.

## 6. Lampiran
Versi library: `ml/requirements-lock.txt`. Hash data: `ml/data/manifest.json`. Id run: kolom `run` di setiap tabel.
