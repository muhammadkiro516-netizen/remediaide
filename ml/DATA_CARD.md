# Kartu Data — RemediAide 2.0

Kartu rinci yang dihasilkan otomatis: `reports/tables/data_card_eedi.md` dan `reports/tables/data_card_map.md`.
Checksum file mentah: `data/manifest.json`.

## 1. Komposisi
| | Eedi NeurIPS 2020 Task 3&4 | MAP (Charting Student Math Misunderstandings) | MAP terjemahan Indonesia |
| --- | --- | --- | --- |
| Isi | jawaban pilihan ganda (4 opsi) + keyakinan 0–100 + metadata siswa | soal + jawaban + alasan satu kalimat + label `Category:Misconception` | kolom soal, jawaban, alasan dalam Bahasa Indonesia |
| Ukuran | 1.382.727 jawaban, 4.918 siswa, 948 soal, 57 konsep | 36.696 alasan, 15 soal, 65 target, 35 label miskonsepsi | 36.696 baris |
| Periode | Sep 2019 – Mei 2020 | — | dibuat 18 Nov 2026 |
| Sumber | https://eedi.com/projects/neurips-education-challenge (arXiv:2007.12061) | https://www.kaggle.com/competitions/map-charting-student-math-misunderstandings | karya kami (`src/remediaide_ml/data/translate.py`) |
| Lisensi | **CC BY-NC-ND 4.0** | **MIT** (`data/raw/map/LICENSE_NOTE.md`) | turunan MIT; model terjemahan Apache-2.0 |
| Dalam submisi | skrip unduh + sha256 (arsip 657 MB; versi olahan **tidak** disertakan, sesuai ND) | `data/original/map/train.csv` asli | `data/derived/map_id/map_id.csv` |
| Publikasi terbuka | — | — | https://huggingface.co/datasets/avlfarizii/remediaide-map-id (cermin: https://www.kaggle.com/datasets/avlsalmoon/remediaide-map-id; MIT; + kamus 39 pasangan dan QA 100 sampel; `scripts/build_map_id_dataset.py`) |

## 2. Preprocessing
- **Eedi:**
  - Join jawaban dengan metadata jawaban (AnswerId), soal, dan siswa.
  - KC = SubjectId terdalam.
  - Urutan waktu per siswa memakai tie-break AnswerId.
  - Keyakinan diubah ke CRI 0–5 dengan `floor((c+10)/20)` (D-03).
  - Tidak ada baris yang dibuang: 0 duplikat dan 0 inkonsistensi.
- **MAP:**
  - Teks dinormalisasi NFKC (teks asli disimpan).
  - Target = `Category:Misconception`, ditambah `category3` (Correct / Misconception / Neither).
  - Kandidat target per (soal, benar/salah).
  - 18 baris dengan konflik prefiks ditandai, tidak diubah (D-16).
- **Terjemahan:** pelindung ekspresi matematika, pemecahan kalimat, dan penjaga halusinasi. QA manual 100 sampel:
  46 baik, 34 kesalahan kecil, 20 kesalahan berat (`reports/translation_card.md`).
- **Fitur dan label** hanya memakai masa lalu siswa. Encoding target out-of-fold. Split per siswa (Eedi) dan per soal
  (MAP). Diuji di `tests/test_features_leakage.py`.

## 2b. Split dan ukuran
- **Eedi (D-04):** 20% siswa test terkunci, sisanya GroupKFold(5) per siswa. Tidak ada siswa di dua split
  (`tests/test_features_leakage.py`). Baris berlabel framing (b) dan baris E1 per fold: `docs/cac/LAPORAN_REVIEW.md` §4.
- **Eedi, kode Gender per split (siswa)** (`reports/tables/E6_gender_counts.json`): CV 0: 1.488, 1: 1.230, 2: 1.210,
  3: 6; test 0: 386, 1: 294, 2: 303, 3: 1.
- **MAP (D-06):** StratifiedKFold(5) pada target dan GroupKFold per soal (3 soal per fold). Pada split acak, 8,83% baris
  validasi punya alasan yang persis sama dengan baris latih untuk soal yang sama (`reports/tables/L2_overlap_cv.csv`).

## 3. Bias dan kualitas yang diketahui
- **Data Inggris:** Eedi berasal dari sekolah di Inggris, dan MAP dari siswa AS. Kurikulum, bahasa, dan konteks
  berbeda dari Indonesia.
- **Keyakinan self-report:** keyakinan kosong di 74,95% baris, tidak acak (akurasi baris berkeyakinan 0,622 vs 0,509).
  Skalanya diskret ({0, 25, 50, 75, 100}), dan 46,0% jawaban berkeyakinan memilih 100.
- **Kategori langka:** True_Misconception hanya 1,10% alasan (403 baris), dengan sebaran 0% sampai 5,37% per soal.
- **Alasan sintetis:** paper MAP menyebut 27% alasan sintetis, tetapi file Kaggle tidak punya penandanya.
- **Atribut sensitif:** Gender (0 tidak disebut, 1 perempuan, 2 laki-laki, 3 lainnya) dan PremiumPupil (berhak makan
  gratis / pupil premium karena kurang mampu; arXiv:2007.12061 §2.3). Keduanya hanya dipakai untuk analisis fairness
  (E6) dan **tidak pernah** sebagai fitur (D-13).
- **Label proxy:** kuadran masa depan bukan label guru. Sebagian perubahan "Miskonsepsi → tuntas" bisa berasal dari
  pembelajaran setelah umpan balik Eedi.
- **Ketimpangan kelompok:** siswa pupil premium dan berkemampuan rendah punya error lebih tinggi, baik untuk aturan v1
  maupun model (E6). PremiumPupil kosong untuk 57,0% siswa dan merupakan ukuran sosial-ekonomi Inggris.

## 4. Privasi
- Data Eedi dan MAP sudah dianonimkan oleh penerbitnya. Kami tidak mencoba identifikasi ulang.
- Gambar soal Eedi tidak dipakai sama sekali (D-17). Gambar itu hanya boleh dipakai untuk kompetisi asli.
- Materi pilot (formulir persetujuan, lembar info guru, panduan sesi) ada di `docs/cac/pilot/`.
- Data pilot siswa Indonesia, bila ada:
  - anonim;
  - butuh persetujuan orang tua (UU PDP Pasal 25);
  - tidak pernah di-commit;
  - tidak pernah dikirim ke layanan pihak ketiga.
