# Kartu Model — RemediAide 2.0 (`rmd2-cokt5`)

## Ringkasan
| | |
| --- | --- |
| Tujuan | Mengelompokkan siswa untuk remediasi matematika per konsep (Paham / Tebakan beruntung / Miskonsepsi / Tidak paham), menamai miskonsepsi dari alasan siswa, dan menyerahkan kasus ragu ke guru |
| Pengguna | Guru matematika SD–SMA melalui aplikasi web RemediAide |
| Keluaran | Probabilitas kuadran terkalibrasi, himpunan prediksi conformal (90%), label miskonsepsi + deskripsi Indonesia, penanda `hidden_misconception`, penanda `deferred`, 3 alasan, dan status aturan v1 sebagai pembanding |
| Versi | `rmd2-cokt5` (freeze Tingkat S, tag `freeze-tierS`, 19 Nov 2026). Lapis 1 CO-KT ensemble 5 seed; Lapis 2 TF-IDF+LR (EN) / mDeBERTa-v3-base (ID); Lapis 3 `models/l3_conformal_v1.json` |
| Keputusan terkunci | `docs/cac/DECISIONS.md` (D-15, D-18 sampai D-21; pelengkap audit D-24) |
| Pemilik / kontak | Salman (pemilik repo), lewat issue di repo GitHub |

## Data latih
- **Lapis 1:** Eedi NeurIPS 2020 Task 3&4, siswa CV saja. Model produksi dilatih pada 70% siswa CV, early stopping pada
  10%, dan kalibrasi pada 20%. Siswa test tidak pernah dipakai.
- **Lapis 2:** MAP. TF-IDF dilatih pada semua baris MAP; mDeBERTa adalah model fold 0 (80% baris). Bahasa Inggris saja.
- Rincian data ada di `DATA_CARD.md`.

## Metrik
### Test (`reports/tables/L1_test.csv`, `E5_test.json`, `E8_impact.csv`)
| Metrik | RemediAide 2.0 (CO-KT) | Aturan v1 (B0) | Baseline terkuat (LightGBM) |
| --- | --- | --- | --- |
| Salah kelompok 4 kelas | 0,347 [0,330–0,366] | 0,451 [0,431–0,469] | 0,362 [0,343–0,380] |
| Macro-F1 4 kelas | 0,445 [0,432–0,460] | 0,392 [0,380–0,403] | 0,433 [0,417–0,450] |
| AUC butuh_remediasi | 0,801 [0,793–0,809] | 0,631 | 0,794 |
| AUC benar berikutnya | 0,796 [0,788–0,803] | — | 0,795 (B1b 0,747) |
| Cakupan conformal (target 0,90) | 0,900; ukuran himpunan 1,90 | tidak ada himpunan | — |
| Defer pada ambang produksi | 20,6%; salah kelompok sisa 0,283 | 0% (aturan v1 pada kasus yang sama 0,392) | — |
| Penurunan karena defer | 18,5% (target D-09 ≥ 25%, **tidak tercapai**) | — | — |

### Lapis 2 (CV MAP; `L2_cv.csv`, `E3_true_misconception.csv`, `E4_crosslingual.csv`)
| Metrik | TF-IDF | mDeBERTa |
| --- | --- | --- |
| MAP@3 (EN, split acak) | 0,916 | 0,912 |
| Macro-F1 category3 (per soal, EN) | 0,611 | 0,637 |
| MAP@3 input Indonesia (terjemahan mesin) | 0,766 | 0,895 |
| Recall True_Misconception (EN; aturan v1 = 0) | 0,375 | 0,323 |

### Per kelompok (test; `reports/tables/E6_fairness.csv`)
| Kelompok | Salah kelompok | AUC butuh_remediasi | Tingkat defer |
| --- | --- | --- | --- |
| Perempuan / laki-laki | 0,374 / 0,326 | 0,793 / 0,800 | 0,237 / 0,170 |
| Pupil premium / bukan | 0,449 / 0,328 | 0,733 / 0,804 | 0,293 / 0,177 |
| Kuartil kemampuan 1 / 4 | 0,509 / 0,195 | 0,638 / 0,798 | 0,448 / 0,059 |

Kesenjangan pada ketiga atribut signifikan secara statistik (CI selisih salah kelompok tidak memuat 0). Model **tidak**
dinyatakan adil.

| Pembanding per kelompok (test) | Selisih salah kelompok RemediAide 2.0 | Selisih aturan v1 |
| --- | --- | --- |
| Pupil premium − bukan | +0,121 [+0,072; +0,173] | +0,095 [+0,036; +0,149] |
| Kuartil 1 − kuartil 4 | +0,314 [+0,283; +0,345] | +0,307 [+0,273; +0,342] |

- RemediAide 2.0 lebih akurat dari aturan v1 di setiap kelompok, tetapi kesenjangannya tidak mengecil.
- Kesenjangan Gender (perempuan +0,048 [+0,005; +0,093]) hanya terlihat di test; di CV CI-nya memuat 0
  (`E6_fairness_final_cv.csv`).
- **Gender kode 0 (tidak disebut), CV** (`E6_fairness_gender_codes_cv.csv`, D-24): 1.199 siswa evaluasi. Selisih salah
  kelompok, AUC, dan tingkat defer terhadap kode 1 dan 2 semuanya memuat 0. Kode 3 hanya 5 siswa evaluasi (< 200), jadi
  tidak dilaporkan.

## Bias dan pola error yang diketahui (CV; `REPORT.md` §4.9)
- 49,1% kasus yang di masa depan *Miskonsepsi* diprediksi *Paham* (`EA_l1_summary_cv.json`): miskonsepsi yang belum
  muncul sulit dilihat dari riwayat saja.
- *Tebakan beruntung*: recall 0,091, dan pada kelas ini lebih buruk dari aturan v1 (salah kelompok 0,909 vs 0,829).
- Error lebih tinggi pada keyakinan rendah (CRI 1: 0,492) dan pada siswa berkemampuan rendah (E6).
- Lapis 2: separuh kesalahan TF-IDF adalah batas Correct ↔ Neither (50,9%); untuk soal baru, retrieval zero-shot gagal
  (T36), jadi soal baru butuh contoh berlabel dari guru.

## Batasan
- **Label proxy:** kuadran masa depan dari tiga percobaan berikutnya, bukan label guru. Kesepakatan dengan guru belum diukur.
- **Distribusi data:** data Inggris (Eedi, MAP). Soal aplikasi Indonesia tidak ada di kosakata model, sehingga CO-KT
  memakai urutan benar/salah, opsi, keyakinan, dan jeda saja.
- **Lintas bahasa:** kinerja pada alasan Indonesia diukur dengan terjemahan mesin; QA menemukan 20% kesalahan berat.
- **Penjelasan:** alasan SHAP berasal dari LightGBM, model penjelas terpisah yang setara akurasinya. Alasan ini bukan
  penjelasan internal CO-KT.
- **Kalibrasi:** di test, temperature scaling tidak menurunkan ECE (0,0063 → 0,0068).
- **Kelas langka:** kelas *Tebakan beruntung* nyaris tidak pernah diprediksi (recall 0,05, `E1_cokt_test_per_class.csv`).
- **Pengaman:** detektor tebakan cepat belum divalidasi.

## Penggunaan yang dianjurkan dan tidak dianjurkan
- **Dianjurkan:** membantu guru menyusun kelompok remediasi dan memilih soal tindak lanjut, dengan guru meninjau kasus
  ragu dan kasus `hidden_misconception`.
- **Tidak dianjurkan:**
  - menentukan nilai rapor, kenaikan kelas, atau seleksi;
  - membandingkan sekolah atau guru;
  - memakai output tanpa tinjauan guru untuk kasus `deferred`;
  - memakai atribut Gender atau PremiumPupil sebagai input.

## Etika dan privasi
- Layanan tidak menyimpan data siswa dan tidak me-log teks alasan.
- Data pilot harus anonim dan disertai persetujuan orang tua (UU PDP Pasal 25).
- Aturan v1 selalu dikembalikan untuk pembanding. Bila layanan ML mati, aplikasi memakai aturan v1.
