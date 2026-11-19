# LAPORAN REVIEW — RemediAide 2.0 (CAC MLSC 2026)

Disusun 19 Nov 2026 oleh Claude Code untuk ditinjau pihak luar (juri ML yang skeptis). Laporan ini **tidak mengubah kode
atau hasil apa pun** (versi 2: ditambah §7 "Pelengkap audit D-24" — empat butir spesifikasi yang terlewat, dihitung dari OOF CV saja dengan skrip baru `ml/scripts/gap_fill.py`, tanpa mengubah model/angka lama); semua angka disalin dari file di `ml/reports/` (path disebut di setiap tabel). Angka di tabel
ditampilkan 4 desimal (nilai < 1e-4 dalam notasi ilmiah); nilai presisi penuh ada di file sumber dan sebagian disalin
mentah di Lampiran D. Istilah: **CV** = validasi silang pada 80% siswa Eedi; **test** = 20% siswa Eedi yang dikunci
(D-04). MAP tidak punya fold test terkunci (D-06), sehingga semua angka Lapis 2 adalah CV.

## 0. Output perintah yang dijalankan ulang saat menyusun laporan


**`cd ml && make test`**
```
........................................................................ [ 80%]
.................                                                        [100%]
89 passed in 5.29s
```

**Tes leakage (`ml/tests/test_features_leakage.py`) + kausalitas CO-KT (`ml/tests/test_cokt.py`)**
```
tests/test_features_leakage.py::test_future_rows_do_not_change_past_features PASSED
tests/test_features_leakage.py::test_history_values_hand_check PASSED
tests/test_features_leakage.py::test_item_diff_oof_ignores_validation_labels PASSED
tests/test_features_leakage.py::test_oof_inner_folds_exclude_own_fold PASSED
tests/test_features_leakage.py::test_no_user_in_two_splits PASSED
tests/test_features_leakage.py::test_future_labels PASSED
tests/test_features_leakage.py::test_vector_quadrant_equals_b0_scalar PASSED
tests/test_cokt.py::test_sequences_windows_and_padding PASSED
tests/test_cokt.py::test_next_correct_is_causal PASSED
tests/test_cokt.py::test_training_smoke_loss_and_outputs PASSED
============================== 10 passed in 1.52s ==============================
```

**`npm test`** (di worktree `feat/ml-integration` = `main`)
```
 Test Files  45 passed (45)
      Tests  586 passed (586)
   Duration  1.65s (transform 1.44s, setup 0ms, import 2.61s, tests 4.59s, environment 1.37s)
```

**`git status`**
```
checkout utama, branch cac/ml:
M docs/cac/LAPORAN_REVIEW.md
worktree .worktrees/web, branch feat/ml-integration:
(bersih, tidak ada perubahan)
```

**`git log --oneline -40`** (branch `main`)
```
ad4bdfe merge cac/ml (D-24 pelengkap audit)
a2f668e D-24: pelengkap audit (CV saja) — B0 framing (a), LAC biner L1, akurasi opsi CO-KT, Gender 0/3; lisensi manifest
318000f merge cac/ml (LAPORAN_REVIEW)
b2578f9 docs: LAPORAN_REVIEW.md — laporan audit menyeluruh untuk juri
4096790 merge cac/ml (T47 freeze, T50-T53, lint)
6d39a77 T50-T53: paket submisi final + audit akhir; M9/M10 selesai (Vercel + GitHub)
ee74b97 T47: freeze Tingkat S — reproduksi clone segar lolos (0 di luar toleransi); lint ruff bersih
87c8b92 chore: sw.js hasil build, abaikan test-results/
8c734f8 merge main (riwayat GitHub)
f135e48 T68: peringatan 'jawaban terlalu cepat' (aturan v1 INVALID) di Mode AI perangkat
fc5b2ea merge: gabungkan riwayat GitHub (Initial commit dari Vercel, isi identik dengan snapshot v1)
d7389c0 docs: README root menunjuk ke RemediAide 2.0 (ml/); lock tanpa path lokal
777c2d2 merge cac/ml (Tingkat A, dokumen submisi)
680caa8 P6: tes e2e Playwright Mode AI (login guru -> Mode AI -> antrean -> umpan balik; 3 lulus), /metodologi publik, nomor soal di Mode AI
b300498 T63/T35: layanan ML bisa memakai L2 student ONNX int8 (RA_L2_MODEL=student) untuk hosting kecil; latensi 40x15 diukur
fac93d7 T35/E7 + T68 + T36: hasil Tingkat A di RESULTS/REPORT (student int8 118 MB, MAP@3 ID 0,834, 7,8 ms; L1 di browser; retrieval negatif)
2c225c8 T36: retrieval zero-shot e5 untuk soal baru — hasil negatif (EN 0,689 vs acak 0,669; ID 0,632); T25 dicatat tidak dijalankan + alasan
161eb9d Tingkat A: protokol D-22 (T36) dan D-23 (T35) dikunci; skrip retrieval, distilasi, E7, ekspor ONNX L1 (paritas T68)
c18bf06 T68: sw.js hasil build (cache ml-models)
1b2d127 T68: Mode AI di perangkat — L1 LightGBM ONNX + onnxruntime-web (WASM lokal, cache service worker), fitur TS setara Python (tes paritas), fallback saat layanan ML tidak tersedia
7ee8e96 T65: unduh LKPD per miskonsepsi bernama (POST /api/sessions/:id/lkpd-ml, generator LKPD yang ada)
424a970 progress: P5 draf + P6 selesai di feat/ml-integration
bc24589 T60/T64: uji e2e lokal (Postgres lokal + layanan ML asli): 12 ConceptDiagnosis + 18 MlDiagnosis; header migrasi dibersihkan
a8f4dcb T60: .env.example (tanpa nilai rahasia; ML_SERVICE_URL, ML_TIMEOUT_MS, RESEARCH_EXPORT_SALT)
510b5e2 T67: landing page — statistik bersumber (PISA 2025, Rapor Pendidikan 2025, hasil uji RemediAide 2.0), label v1 LIDM -> v2 CAC MLSC, bagian 'Mesin AI 3 Lapis', halaman /metodologi, link footer '#' dihapus
28e6639 T66: ekspor riset anonim (HMAC per sesi, consent wajib -> 403, tanpa kolom terlarang) + endpoint persetujuan riset + tes
c7aebe4 T65: Mode AI di dasbor hasil (antrean 'Perlu dicek guru', kelompok per miskonsepsi, diagnosis per siswa, umpan balik guru) + GET /api/sessions/:id/ml, POST /api/ml-feedback
9feb20c merge cac/ml (diagnose chosen_option_text)
d7cccb4 T64: diagnose menerima chosen_option_text (teks opsi untuk Lapis 2)
7e19075 T64: panggilan layanan ML dari compute.ts (HMAC student_key, timeout, fallback ke B0) + tes sukses/timeout/500/rusak
2d32b67 T62: alasan siswa opsional (maks 280, divalidasi) di portal kuis + API; toggle 'Minta alasan' per soal (PATCH /api/questions/:id)
277ca4e T61: migrasi ml_integration (Question.requireExplanation/mapQuestionId, Response.explanation, SessionPin.researchConsent, MlDiagnosis, MlFeedback) + init; tes privasi
56ebcfa chore: abaikan .worktrees/
1369a97 T50/T52: build_submission.py (repo remediaide-ml + paket dataset: MAP asli + terjemahan ID, skrip unduh Eedi), LICENSE MIT
cf8e8a2 T51: README, REPORT, MODEL_CARD, DATA_CARD (Bahasa Indonesia) + check_numbers.py (0 angka tanpa sumber), diagram arsitektur
0c63272 T50: notebook 02, 05, 06, 07 (tipis, dieksekusi)
ae0e50e T63: layanan FastAPI /health + /v1/diagnose, Dockerfile, tes kontrak; alasan SHAP hanya untuk jawaban terakhir per siswa (latensi 40x15: 0,6 s tanpa L2, 8,3 s dengan mDeBERTa)
f543218 T47: test_bundle di-skip bila artefak biner belum diekspor (ditemukan di clone segar)
f34f702 progress: reproduksi T47 berjalan
90dc466 T47: make all (data/l1/l2/l3/final), kaggle-outputs, data-raw, check_repro; run id kanonik
```

## 1. Ringkasan
- **Fase saat ini:** P5 (submisi) selesai secara teknis; P6 (web) selesai kecuali layanan ML penuh di hosting. Freeze
  Tingkat S (T47) dibuat 19 Nov 2026 (tag `freeze-tierS` → commit `f543218`). Tingkat B (pilot sekolah) belum dimulai.
- **Task Tingkat S:** 45 task bertanda [S] di `docs/cac/TASKS.md`; 43 bertanda [x], 2 belum (T54 [MANUAL] kirim,
  T69 deploy layanan ML). **43/45 = 95,6%.** Beberapa task [x] tidak memenuhi spesifikasi sepenuhnya — lihat §2 kolom "catatan".
- **Tiga hasil terkuat**
  1. Di test terkunci, salah kelompok turun dari 0,4505 (aturan v1, B0) ke 0,3474 (CO-KT), selisih
     −0,1031 [−0,1091; −0,0972], McNemar p Holm < 1e-300 (`L1_test.csv`, `L1_test_pairwise.csv`). Angka test
     konsisten dengan CV (CO-KT 0,3470 di CV, `L1_model_selection.csv`).
  2. Alasan berbahasa Indonesia (terjemahan mesin): mDeBERTa MAP@3 0,8945 vs TF-IDF 0,7656 pada baris yang sama,
     selisih +0,1289 [+0,1211; +0,1361] (`E4_crosslingual.csv`), dengan aturan pemilihan dikunci sebelum dihitung (D-19).
  3. Conformal LAC pada test: cakupan empiris 0,9003 untuk target 0,90 dengan parameter yang dikunci sebelum test
     (`E5_test.json`), dan seluruh pipeline direproduksi dari clone segar dengan 0 tabel di luar toleransi (T47).
- **Tiga kelemahan terbesar**
  1. **Label proxy.** "Kuadran masa depan" = 3 percobaan berikutnya di KC yang sama (D-05), bukan label guru. Belum ada
     validasi guru (E9/E10 belum dijalankan).
  2. **Kesenjangan fairness besar** di test: salah kelompok kuartil kemampuan 1 vs 4 = 0,5090 vs 0,1947 (selisih
     +0,3143 [+0,2833; +0,3445]); pupil premium +0,1211 [+0,0722; +0,1729]; perempuan vs laki-laki +0,0479 [+0,0047; +0,0927]
     (`E6_fairness.csv`). Model lebih buruk untuk kelompok rentan.
  3. **Domain dan bahasa.** Semua data dari Inggris/AS; bukti Indonesia hanya terjemahan mesin (QA: 20 dari 100 sampel
     kesalahan berat, `translation_qa.csv`). Di produk, soal aplikasi tidak ada di kosakata Eedi sehingga CO-KT kehilangan
     embedding soal/KC. Ditambah: kelas "Tebakan beruntung" nyaris tak pernah diprediksi (recall 0,050) dan 55,9% kasus
     yang di masa depan Miskonsepsi diprediksi Paham (`E1_cokt_test_per_class.csv`).


## 2. Status task (T00–T84)
Status: [x] selesai, [~] sebagian, [ ] belum, [!] terblokir. Kolom "catatan" menandai **⚠** bila task bertanda [x]
tetapi kriteria "Selesai jika" atau spesifikasinya tidak terpenuhi sepenuhnya.

| ID | Judul | Status | Bukti / output | Catatan |
| --- | --- | --- | --- | --- |
| T00 | Bootstrap repo | [x] | commit `9343aa9` (v1 snapshot), branch `cac/ml` | — |
| T01 | Lingkungan Python | [x] | `ml/requirements-lock.txt`, `make test` | uv + Python 3.12.16; libomp dipinjam dari torch (`make fix-libomp`), bukan Homebrew |
| T02 | Cek mesin | [x] | `ml/runs/env_report.json` | — |
| T03 | Kaggle CLI | [x] | kernel `avlsalmoon/*` | OAuth sempat kedaluwarsa (M1b), diperbarui |
| T04 | Cek aplikasi v1 | [x] | baseline Vitest (dicatat di PROGRESS) | — |
| T05 | Kunci keputusan | [x] | `docs/cac/DECISIONS.md` | — |
| T10 | Unduh Eedi | [x] | `ml/data/manifest.json` (sha256) | dari blob publik resmi |
| T11 | Unduh MAP | [x] | `ml/data/raw/map/LICENSE_NOTE.md` | ⚠ sumber = mirror HF `kaggle-map/data`, bukan `kaggle competitions download` (lihat §3) |
| T12 | Loader Eedi | [x] | `reports/tables/data_card_eedi.md` | — |
| T13 | Loader MAP | [x] | `data_card_map.md`, `map_misconception_dictionary.csv` | — |
| T14 | Fitur anti-leakage | [x] | `eedi_features_info.json` (51,0 s) | — |
| T15 | Split + evaluasi | [x] | `eedi_splits.parquet`, `map_splits.parquet` | — |
| T16 | EDA | [x] | `notebooks/01_eda.ipynb`, `figures/E0_*` | — |
| T20 | B0 + E1 (CV) | [x] | `E1_b0_cv.csv` | — |
| T21 | B1 | [x] | `L1_b0_b1_cv.csv` | B0 framing (a) (skor ordinal, 03 §1) **baru dihitung 19 Nov setelah test dibuka** (D-24, CV saja): `E1_b0_framing_a_cv.csv` |
| T22 | LightGBM + Optuna + E2 | [x] | `L1_lgbm_cv.csv`, `E2_ablation_cv.csv`, `figures/E2_ablation.png`, `L1_shap_beeswarm.png` | — |
| T23 | CO-KT | [x] | `L1_cokt_cv.csv`, `E2_cokt_ablation_cv.csv` | ⚠ early stopping CV memakai fold yang dinilai (optimistis) |
| T24 | Konsolidasi L1 | [x] | `models/l1_*`, `L1_cv_summary.csv`, notebook 03/04 | akurasi prediksi opsi: tabel `L1_cokt_option_cv.csv` ditambahkan (D-24, CV ensemble 5 seed); sebelumnya hanya di `metrics_full.json` (opt_acc rata-rata per seed 0,5592) |
| T25 | pyKT resmi [A] | [ ] | — | tidak dijalankan; alasan di TASKS |
| T30 | TF-IDF | [x] | `L2_b0_tfidf_cv.csv` | C terpilih di tepi grid (10 dan 0,3) |
| T31 | mDeBERTa | [x] | `L2_cv.csv` | ⚠ model yang disimpan = fold 0, bukan "fold terbaik" |
| T32 | Terjemahan + QA | [x] | `translation_card.md`, `translation_qa.csv` | QA dinilai oleh Claude Code, bukan penutur asli |
| T33 | E3 | [x] | `E3_true_misconception.csv`, `figures/E3_pr_curve.png` | CV saja |
| T34 | E4 | [x] | `E4_crosslingual.csv` | ⚠ spesifikasi: "test fold terjemahan"; dipakai fold 0 CV (MAP tidak punya fold test) |
| T35 | Distilasi + E7 [A] | [x] | `E7_efficiency.csv` | — |
| T36 | Retrieval [A] | [x] | `T36_retrieval.csv` | hasil negatif |
| T40 | Kalibrasi | [x] | `E5_l3_final_cv.json`, `figures/E5_reliability_*` | — |
| T41 | Conformal | [x] | `models/l3_conformal_v1.json` | ⚠ APS L2 cakupan 0,9504 (bukan ≈0,90); LAC biner L1 (03 §3) ditambahkan (D-24, CV saja): `E5_lac_binary_L1_cv.json` |
| T42 | Selective + titik operasi | [x] | `figures/E5_coverage_risk.png`, D-21 | titik D-09 tidak tercapai → fallback 20% |
| T43 | Fusi + hidden | [x] | `ml/src/remediaide_ml/l3/fusion.py`, `diagnose.py`, `tests/test_bundle.py` | stacking hanya kerangka (butuh label guru) |
| T44 | Pengaman | [x] | `guard/rapid_guess.py`, `tests/test_guard.py` | hanya data simulasi; tidak dilaporkan sebagai hasil |
| T45 | E6 + E8 | [x] | `E6_fairness_final_cv.csv`, `E8_impact_final_cv.csv` | Gender kode 0 ditambahkan (D-24, CV saja): `E6_fairness_gender_codes_cv.csv` |
| T46 | Buka test + RESULTS | [x] | `TEST_OPENED.json`, `RESULTS.md` | ⚠ E2/E3/E4 hanya CV (model ablation tidak disimpan; MAP tanpa test) |
| T47 | Freeze | [x] | tag `freeze-tierS`, `scratchpad/repro2/ml/runs/check_repro.json` | Tingkat A tidak termasuk `make all` |
| T50 | Repo submisi | [x] | `submission/remediaide-ml/` | repo GitHub yang dipakai = proyek penuh `remediaide`, bukan repo terpisah `remediaide-ml` |
| T51 | README/REPORT/kartu | [x] | `ml/README.md`, `ml/REPORT.md`, `ml/MODEL_CARD.md`, `ml/DATA_CARD.md` | `check_numbers.py`: 0 tanpa sumber |
| T52 | Paket dataset | [x] | `submission/remediaide-ml/data/` | ⚠ M6 (format dataset ke panitia) belum ditanyakan |
| T53 | Audit akhir | [x] | zip diuji (82 lulus, 7 skip) | — |
| T54 | Kirim [MANUAL] | [ ] | — | M15 (Salman) |
| T60 | App lokal | [x] | `scripts/e2e-ml.ts` | Postgres via `pgserver` (pip), bukan Docker/Homebrew |
| T61 | Migrasi Prisma | [x] | `prisma/migrations/2026111*` | migrasi dibuat dengan `prisma migrate diff`, bukan `migrate dev` |
| T62 | Alasan siswa | [x] | `src/lib/ml/explanation.ts` + tes | — |
| T63 | FastAPI | [x] | `ml/service/`, `ml/tests/test_service.py` | ⚠ latensi < 2 s 40×15 hanya terpenuhi tanpa L2 / dengan student; mDeBERTa 8,25 s (`E7_latency_service_cpu.json`) |
| T64 | Panggilan ML + fallback | [x] | `src/lib/ml/pipeline.ts` + tes | — |
| T65 | Mode AI | [x] | `MlModePanel.tsx`, `tests/e2e/ml-mode.spec.ts` (3 lulus, Chrome lokal) | — |
| T66 | Ekspor riset | [x] | `research-export.ts` + tes | — |
| T67 | Landing page | [x] | `src/app/page.tsx`, `/metodologi` | — |
| T68 | Mode offline [A] | [x] | `public/models/*.onnx`, tes paritas | ⚠ bukan offline sungguhan: butuh endpoint `/api/sessions/:id/ml-input` (jaringan); tanpa sinkronisasi; L2 tidak di browser |
| T69 | Deploy + uji HP | [~] | https://remediaide.vercel.app | web + DB Neon jalan; layanan ML Python **belum** di-hosting; uji dari HP oleh Salman (1 siswa), tidak tercatat formal |
| T70–T75 | Pilot (Tingkat B) | [ ] | — | belum dimulai; butuh izin sekolah/orang tua |
| T80–T84 | Bahan final (Tingkat B) | [ ] | — | belum dimulai |


## 3. Penyimpangan dari rencana
| # | Spesifikasi | Yang terjadi | Alasan | Dicatat di DECISIONS? |
| --- | --- | --- | --- | --- |
| 1 | 02 §2: MAP via `kaggle competitions download` | mirror HF `kaggle-map/data` rev `1996686…` | M1/M2 belum siap saat T11 | Tidak sebagai entri; dicatat di `LICENSE_NOTE.md` dan manifest. Teks basi "Kaggle page to be confirmed after M2" di `manifest.json` **sudah diperbaiki** (19 Nov, hanya kolom `license`; sha256 tidak berubah) |
| 2 | 02 §1: gambar Eedi boleh untuk demo | tidak dipakai sama sekali | paper melarang di luar kompetisi | Ya, D-17 |
| 3 | 02 §2: konflik prefiks | 18 baris dipertahankan + ditandai | tidak mengubah label benchmark | Ya, D-16 |
| 4 | 02 §6: calibration split MAP "per grup (soal)" | `calibration_groups(row_id)` = per baris | 15 soal terlalu sedikit untuk 20% per soal | **Tidak** |
| 5 | 03 §0: dataset Kaggle `remediaide-eedi-raw` + `competition_sources` MAP | hanya `remediaide-processed`, `remediaide-ml-src`, `remediaide-l2-teacher` (privat) | data olahan cukup; MAP dari HF | Tidak (D-11 hanya mewajibkan privat) |
| 6 | 03 §1: B0 framing (a) skor ordinal | terlewat; **dihitung belakangan** (CV saja, setelah test dibuka) | terlewat | Ya, D-24 |
| 7 | 03 §1: B1b (b) `cur_correct, cur_cri` | + `cur_has_conf` | konsisten dengan framing (b) | Tidak |
| 8 | 03 §1: early stopping CO-KT pada AUC validasi | di CV = fold yang dinilai; produksi = 10% siswa terpisah | desain awal; ditemukan saat T24 | Diungkap di RESULTS §5 dan REPORT §6; bukan entri DECISIONS |
| 9 | 03 §2: L2 untuk input Indonesia | TF-IDF (EN) vs mDeBERTa (ID) dipilih dengan aturan baru | produk berbahasa Indonesia | Ya, D-19 (dikunci sebelum E4 mDeBERTa), D-21(b) |
| 10 | 03 §2: model L2 "fold terbaik" | fold 0 | E4 memakai fold 0; tidak ada pemilihan fold | Tidak |
| 11 | 03 §3: LAC biner L1 | terlewat; **dihitung belakangan** (CV saja; tidak ada angka test) | terlewat | Ya, D-24 |
| 12 | 03 §3: kalibrasi NN = temperature | CO-KT memakai `TemperatureProb` (log-prob) | CO-KT ensemble mengeluarkan probabilitas | Disebut di `l3_eval.py`; bukan entri |
| 13 | 03 §3: ambang `hidden_misconception` "validasi" | F1-max grid pada baris kalibrasi | aturan tidak dirinci di spesifikasi | Ya, D-20 |
| 14 | D-09 titik operasi | tidak tercapai di model produksi → 20% | aturan fallback D-09 | Ya, D-21(a); catatan: OOF CV `l3_eval` menemukan 30% memenuhi, `e6_e8` tidak |
| 15 | 04 E2: DeLong + Holm antar tahap | dihitung untuk AUC biner (CV) | — | — |
| 16 | 04 E4: "test fold" | fold 0 CV | MAP tanpa fold test (D-06) | Disebut di RESULTS |
| 17 | 04 E5: `E5_coverage_risk.png`, `E5_reliability_L1/L2.png` | L1 dari test; L2 hanya versi `_final_cv` | MAP tanpa test | — |
| 18 | 05 §1: Prisma `migrate dev --name init` | `prisma migrate diff` (init + ml_integration), folder migrasi kini di-commit | tidak ada Postgres saat dibuat | Tidak (dicatat di `.gitignore`/PROGRESS) |
| 19 | 05 §9: mode offline penuh | L1 di browser, perlu jaringan ke app; tanpa L2, tanpa sinkronisasi | waktu; ukuran L2 student 118,3 MB | Tidak |
| 20 | 07 §1: repo terpisah `remediaide-ml` | repo proyek penuh `muhammadkiro516-netizen/remediaide`; paket `remediaide-ml` hanya sebagai zip | keputusan Salman | Tidak |
| 21 | T47: tenggat freeze 25 Nov | freeze 19 Nov | lebih cepat | — |
| 22 | 04: CI 95% bootstrap **1000** ulangan | CI AUC memakai **200** ulangan (kolom `ci_note` di `L1_test.csv`, `L1_lgbm_cv.csv`, `L1_b0_b1_cv.csv`); CI salah kelompok/macro-F1 1000 | biaya komputasi AUC per ulangan | **Tidak** |
| 23 | 04: resampling MAP per klaster QuestionId×siswa | per baris (MAP@3, E3, E4) dan per QuestionId (category3) | MAP tidak punya ID siswa | Disebut di `metrics.json` L2 (`ci_note`), bukan entri |
| 24 | 04 E6: Gender kode 0/3 dilaporkan bila n ≥ 200 | kode 0 **dihitung belakangan** (CV saja); kode 3 n < 200 → hanya jumlah | terlewat | Ya, D-24 |

**Entri DECISIONS baru sejak rencana awal (D-16 … D-24):** D-16 konflik prefiks MAP; D-17 gambar Eedi tidak dipakai;
D-18 CO-KT ens5 dipilih (vs LightGBM ens5); D-19 aturan pemilihan L2 + input Indonesia; D-20 ambang hidden
misconception; D-21 penerapan D-09 + D-19(ii); D-22 protokol T36; D-23 protokol T35; D-24 pelengkap audit (CV saja, setelah test dibuka). Isi lengkap di Lampiran B.


## 4. Data
### 4.1 Sumber persis
| file | sumber | dicatat | sha256 | ukuran (byte) |
| --- | --- | --- | --- | --- |
| `data/raw/map/train.csv` | https://huggingface.co/datasets/kaggle-map/data (revision 1996686e4be5de6de2f5c35bc683e93e | 2026-11-18T21:22:47 | `f347a34f62be3b1bc188b11290f5615b5bf050a7b7c3aeb21b1966feed7615a0` | 7936617 |
| `data/raw/map/test.csv` | https://huggingface.co/datasets/kaggle-map/data (revision 1996686e4be5de6de2f5c35bc683e93e | 2026-11-18T21:22:47 | `869589a08a46766b8ce9f08a18e393bb5316b119de2520ef1391faa51ad3d0c0` | 687 |
| `data/raw/map/sample_submission.csv` | https://huggingface.co/datasets/kaggle-map/data (revision 1996686e4be5de6de2f5c35bc683e93e | 2026-11-18T21:22:47 | `ebae55e3d11595b1e718ce0431ead92e4a53ea4346b5e4346fb9d0586524a5cd` | 240 |
| `data/raw/map/README.md` | https://huggingface.co/datasets/kaggle-map/data (revision 1996686e4be5de6de2f5c35bc683e93e | 2026-11-18T21:22:47 | `3e0e15fa0c5cc81675bd69af8eb469d128a725c1a7bfc71f03b7877b7b650567` | 21 |
| `data/raw/map/LICENSE_NOTE.md` | written by Claude Code (T11) + Kaggle Data tab text (M2) | 2026-11-18T21:52:02 | `9af6dcd2b73a378a937bd59f90e3ce8f169dd932f1df44800fa8d7b0ba36a2df` | 2621 |
| `data/raw/eedi_neurips2020/data.zip` | https://dqanonymousdata.blob.core.windows.net/neurips-public/data.zip (official Eedi NeurI | 2026-11-18T21:52:03 | `c7f01672360f1adeb3cf9507d72455d7be035bf897e4a167293e8938049800e1` | 656787242 |

*Sumber: `ml/data/manifest.json`.* Lisensi MAP: MIT — kartu HF `license: mit`, diskusi HF #2, dan teks tab Data Kaggle yang
disalin Salman pada M2 (`ml/data/raw/map/LICENSE_NOTE.md`). Teks MIT di Kaggle mencantumkan "Copyright (c) 2013 Mark Otto /
2017 Andrew Fong" (template generik); ini dicatat apa adanya. Eedi: CC BY-NC-ND 4.0.

### 4.2 Data card (disalin utuh dari file yang dihasilkan kode)


#### Data card — Eedi NeurIPS 2020, Task 3&4

Dihasilkan otomatis oleh `python -m remediaide_ml.data.eedi_card` dari `data/interim/eedi_t34.parquet`.
Lisensi: CC BY-NC-ND 4.0 (data olahan tidak dibagikan; hanya skrip).

##### Ringkasan
- Baris mentah train_task_3_4: 1,382,727; duplikat AnswerId dibuang: 0; tidak konsisten IsCorrect dibuang: 0
- Baris bersih: 1,382,727; siswa: 4,918; soal: 948; KC (SubjectId terdalam): 57; baris tanpa KC: 0
- Baris tanpa answer metadata: 0
- Rentang tanggal: 2019-09-06 14:05:00 s.d. 2020-05-01 08:33:00
- Akurasi rata-rata (IsCorrect): 0.5373
- **Confidence kosong: 74.95% baris**; per siswa median 90.53%, siswa tanpa confidence sama sekali: 12.89%
- Panjang sekuens per siswa: median 239, p90 555, maks 827
- Percobaan ulang (attempt_no > 1): 0.00% baris

##### Distribusi Confidence (baris yang terisi)

| Confidence | n | % | CRI (D-03) |
| ---: | ---: | ---: | ---: |
| 0 | 28,733 | 8.29% | 0 |
| 25 | 17,405 | 5.02% | 1 |
| 50 | 53,043 | 15.31% | 3 |
| 75 | 87,778 | 25.34% | 4 |
| 100 | 159,469 | 46.03% | 5 |

Nilai unik Confidence: 5

##### CRI dan kuadran B0 (baris berkeyakinan)

- P (benar, yakin): 199,120 (57.48%)
- L (benar, tidak yakin): 16,361 (4.72%)
- M (salah, yakin): 101,170 (29.20%)
- T (salah, tidak yakin): 29,777 (8.60%)

##### Atribut siswa (hanya untuk analisis fairness, bukan fitur)

| Gender | siswa | % |
| --- | ---: | ---: |
| 0 | 1,874 | 38.10% |
| 1 | 1,524 | 30.99% |
| 2 | 1,513 | 30.76% |
| 3 | 7 | 0.14% |

| PremiumPupil | siswa | % |
| --- | ---: | ---: |
| 0.0 | 1,512 | 30.74% |
| 1.0 | 601 | 12.22% |
| <NA> | 2,805 | 57.04% |

Kode Gender (panduan data Eedi): 0 tidak disebut, 1 perempuan, 2 laki-laki, 3 lainnya.

#### Data card — MAP (Charting Student Math Misunderstandings)

Dihasilkan otomatis oleh `python -m remediaide_ml.data.map_card` dari `data/interim/map.parquet`.

##### Ringkasan
- Baris: 36,696; soal: 15; target unik (Category:Misconception): 65
- Label miskonsepsi unik: 35 (pasangan soal×label: 39)
- Baris dengan konflik prefiks benar/salah vs jawaban (noise label, dipertahankan, ditandai `prefix_conflict`): 18 (0.049%)
- **True_Misconception (jebakan jawaban benar): 403 (1.10%)**
- Panjang alasan (kata): median 13, p90 26, maks 177

Catatan: paper dataset menyebut 27% alasan sintetis (parafrase Coedit-XL), tetapi file Kaggle tidak memberi penanda asli/sintetis, sehingga evaluasi terpisah tidak mungkin. Paper melaporkan 52.463 alasan; train.csv publik hanya memuat 36,696 baris (sisanya diduga test tersembunyi Kaggle).

##### Per kategori

| Category | n | % |
| --- | ---: | ---: |
| True_Correct | 14,802 | 40.34% |
| False_Misconception | 9,457 | 25.77% |
| False_Neither | 6,542 | 17.83% |
| True_Neither | 5,265 | 14.35% |
| True_Misconception | 403 | 1.10% |
| False_Correct | 227 | 0.62% |

##### Per soal

| QuestionId | n | % benar (MC) | % Misconception | % True_Misconception | label miskonsepsi |
| --- | ---: | ---: | ---: | ---: | --- |
| 31772 | 4,857 | 48.3% | 33.4% | 0.33% | Incomplete, WNB |
| 31774 | 3,115 | 61.6% | 20.4% | 0.64% | Mult, SwapDividend, FlipChange |
| 31777 | 2,809 | 64.0% | 13.9% | 0.00% | Wrong_Fraction, Incomplete, Irrelevant |
| 31778 | 3,640 | 48.4% | 39.1% | 3.46% | Additive, Irrelevant, WNB |
| 32829 | 2,156 | 79.6% | 12.6% | 0.05% | Not_variable, Adding_terms, Inverse_operation |
| 32833 | 3,105 | 51.6% | 36.2% | 0.35% | Duplication, Inversion, Wrong_Operation |
| 32835 | 2,332 | 71.8% | 17.1% | 0.81% | Whole_numbers_larger, Longer_is_bigger, Ignores_zeroes, Shorter_is_bigger |
| 33471 | 1,542 | 56.7% | 28.3% | 0.39% | Wrong_fraction, Incomplete |
| 33472 | 2,800 | 59.0% | 23.3% | 0.25% | Denominator-only_change, Adding_across, Incorrect_equivalent_fraction_addition |
| 33474 | 1,766 | 35.7% | 38.7% | 0.40% | Subtraction, Division |
| 76870 | 1,186 | 42.8% | 32.5% | 0.25% | Unknowable, Definition, Interior |
| 89443 | 3,054 | 45.6% | 28.0% | 5.37% | Positive, Tacking |
| 91695 | 2,610 | 59.3% | 25.5% | 0.73% | Wrong_term, Firstterm |
| 104665 | 673 | 73.8% | 17.7% | 0.59% | Multiplying_by_4, Base_rate |
| 109465 | 1,051 | 52.6% | 18.7% | 0.00% | Scale, Certainty |

##### Contoh per kategori (baris pertama per kategori, row_id terkecil)

- **False_Correct** (Q31772, jawaban `\( \frac{3}{6} \)`, label `NA`): "Because 3 of 9 are not shaded as a simplified fraction it would be 1 3rd"
- **False_Misconception** (Q31772, jawaban `\( \frac{3}{6} \)`, label `WNB`): "3 IS SHADED AND 6 IS NOT"
- **False_Neither** (Q31772, jawaban `\( \frac{3}{6} \)`, label `NA`): "! simplefined it and that was what i got"
- **True_Correct** (Q31772, jawaban `\( \frac{1}{3} \)`, label `NA`): "0ne third is equal to tree nineth"
- **True_Misconception** (Q31772, jawaban `\( \frac{1}{3} \)`, label `Incomplete`): "3 out of 9 parts aren't shaded."
- **True_Neither** (Q31772, jawaban `\( \frac{1}{3} \)`, label `NA`): "1 3rd is half of 3 6th, so it is simplee to understand."

### 4.3 Verifikasi kolom dan PremiumPupil
Dari DECISIONS (catatan verifikasi): kolom answer_metadata = `AnswerId, DateAnswered, Confidence, GroupId, QuizId,
SchemeOfWorkId` (tidak ada UserId; kunci join AnswerId). PremiumPupil (arXiv 2007.12061 §2.3): "Whether the student is
eligible for free school meals or pupil premium due to being financially disadvantaged". Gender: 0 tidak disebut, 1
perempuan, 2 laki-laki, 3 lainnya. Kolom MAP persis `row_id, QuestionId, QuestionText, MC_Answer, StudentExplanation,
Category, Misconception`.

### 4.4 Baris yang dibuang saat cleaning
| kunci | nilai |
| --- | --- |
| n_train_raw | 1382727 |
| n_dup_answerid_dropped | 0 |
| n_inconsistent_iscorrect_dropped | 0 |
| n_missing_answer_meta | 0 |
| n_rows | 1382727 |
| n_users | 4918 |
| n_questions | 948 |
| n_kc | 57 |
| n_rows_missing_kc | 0 |

*Sumber: `ml/data/interim/eedi_t34_report.json`*

Eedi: 0 baris dibuang (duplikat AnswerId 0, IsCorrect tidak konsisten 0, tanpa metadata 0). MAP: 0 baris dibuang; 18
baris konflik prefiks ditandai, tidak dibuang (`data_card_map.md`, D-16). Untuk label framing (b), **243564**
baris dikeluarkan karena < 2 percobaan masa depan (`ml/data/processed/eedi_features_info.json`).

### 4.5 Ukuran split dan bukti tidak bocor (dihitung ulang saat menyusun laporan, hanya membaca data)
```
Eedi siswa per fold (-1 = test): {-1: 984, 0: 787, 1: 787, 2: 787, 3: 787, 4: 786}
Eedi baris per fold: {-1: 275070, 0: 219581, 1: 220948, 2: 228358, 3: 218617, 4: 220153}
Eedi baris E1 per fold: {-1: 58963, 0: 43857, 1: 45857, 2: 44538, 3: 39230, 4: 43998}
UserId di >1 fold: 0 | UserId duplikat: 0
MAP baris fold_random: {0: 7340, 1: 7339, 2: 7339, 3: 7339, 4: 7339}
MAP baris fold_question: {0: 7500, 1: 9453, 2: 6254, 3: 4469, 4: 9020}
MAP soal per fold_question: {0: [np.int64(31777), np.int64(31778), np.int64(109465)], 1: [np.int64(31772), np.int64(33471), np.int64(89443)], 2: [np.int64(32829), np.int64(32835), np.int64(33474)], 3: [np.int64(76870), np.int64(91695), np.int64(104665)], 4: [np.int64(31774), np.int64(32833), np.int64(33472)]}
QuestionId di >1 fold_question: 0
```
- Tidak ada UserId di lebih dari satu fold Eedi (termasuk fold −1 = test); tes `test_no_user_in_two_splits` lulus.
- MAP split per soal: tidak ada QuestionId di lebih dari satu fold, 3 soal per fold.
- MAP split acak (StratifiedKFold pada target) **sengaja** memakai QuestionId yang sama di train/validasi (setara Kaggle,
  D-06); skor MAP@3 split acak karena itu optimistis untuk soal baru.


## 5. Fitur dan label
- **Framing (a)** (next-correct), 18 fitur (`FEAT_A` = `FEATURES_A` + `FEATURES_OOF`, `ml/src/remediaide_ml/l1/common.py`):
  n_prev, acc_prev, n_prev_kc, acc_prev_kc, ewm_acc_kc, conf_mean_prev, conf_mean_prev_kc, overconf_prev, cnt_P_kc,
  cnt_L_kc, cnt_M_kc, cnt_T_kc, last_quadrant_kc, hours_since_prev, hours_since_prev_kc, attempt_no, item_diff_oof, kc_diff_oof.
- **Framing (b)**, 23 fitur (`ALL_B`, `ml/models/l1_features_v1.json`): framing (a) + cur_correct, cur_cri, cur_has_conf,
  cur_quadrant_b0, cur_option_share_oof.
- **CO-KT** memakai token (soal, KC, benar/salah, opsi, CRI 0–5 + 6=kosong, bucket jeda, posisi), bukan fitur tabular.
- **Label kuadran masa depan (D-05):** 3 percobaan berikutnya di KC yang sama, minimal 2; tuntas = fut_acc ≥ 2/3; yakin =
  rata-rata CRI ≥ 3 (hanya baris berkeyakinan). Biner `needs_remediation` = belum tuntas.
- **Cakupan label** (`eedi_features_info.json`): baris total 1382727; berlabel biner 1139163;
  berlabel kuadran 335216; berlabel kuadran + keyakinan saat ini (baris E1) 276443;
  dikeluarkan (< 2 masa depan) 243564. Jadi 243564 baris
  tanpa label biner dan 1047511 baris tanpa label kuadran. Distribusi kuadran masa
  depan: {'P': 0.5383, 'M': 0.2743, 'T': 0.1154, 'L': 0.072}.
- **Tiga tes leakage wajib** (02 §4) — semua lulus (§0): (1) `test_future_rows_do_not_change_past_features`,
  (2) `test_item_diff_oof_ignores_validation_labels` (+ `test_oof_inner_folds_exclude_own_fold`), (3) `test_no_user_in_two_splits`.
  Tambahan: `test_next_correct_is_causal` (CO-KT tidak melihat masa depan).


## 6. Model
| Model | Hiperparameter final | Tempat, durasi, seed/fold | Artefak |
| --- | --- | --- | --- |
| B0 aturan v1 | `cri >= 3`, τmin; port `engine.ts` (27 tes kesetaraan) | lokal | `ml/src/remediaide_ml/cri_rule.py` |
| B1a | (a) skor = item_diff_oof; (b) LR C=0,01 | lokal, 5 fold | `ml/runs/20261118-2156_l1_b1/` |
| B1b | LR (StandardScaler) C: (a) 0,1; (b) biner 0,01, 4 kelas 1,0 (grid 0,01–10 di fold 0) | lokal, 5 fold | idem (`metrics.json`) |
| B2 LightGBM (a) | {'num_leaves': 220, 'learning_rate': 0.021903013362545163, 'min_child_samples': 83, 'feature_fraction': 0.8807179013658453, 'bagging_fraction': 0.8331957280851062, 'lambda_l2': 0.812160585522554} | lokal, Optuna 50 trial fold 0, 5 fold, 1 seed | `runs/20261118-2205_l1_lgbm/model_a_fold*.txt` |
| B2 LightGBM (b) 4 kelas | {'num_leaves': 86, 'learning_rate': 0.02074584533666422, 'min_child_samples': 175, 'feature_fraction': 0.6031922382268423, 'bagging_fraction': 0.7327321961954333, 'lambda_l2': 6.418090769750681} | lokal, Optuna 50 trial, 5 fold × 5 seed | `model_b4_*`, `models_seed*_b4_*`, `ml/models/l1_lgbm_v1/` |
| B2 LightGBM (b) biner | {'num_leaves': 246, 'learning_rate': 0.023117824281225084, 'min_child_samples': 82, 'feature_fraction': 0.886920473149483, 'bagging_fraction': 0.9118121427231385, 'lambda_l2': 9.13678437550214} | idem | `model_bbin_*` |
| M1 CO-KT | d=128, 2 lapis, 4 head, FFN 256, dropout 0,2, jendela 200, AdamW 1e-3, wd 1e-5, batch 64, ≤30 epoch, patience 3, clip 1,0, loss 1:0,5:0,5 | Kaggle GPU; CV 5 seed × 5 fold (37,1 menit); ablation 3 seed (21,4 + 19,6 menit); produksi 5 seed (5,5 menit) | `ml/models/l1_cokt_v1/*.pt` |
| L2 TF-IDF+LR | kata 1–2 + char 3–5; C = 10 (target), 0,3 (category3) — keduanya di tepi grid | lokal | `ml/models/l2_tfidf_v1.joblib` |
| L2 mDeBERTa-v3-base | lr 2e-5, batch 16, 3 epoch, max_len 192, warmup 0,1, wd 0,01, fp16 | Kaggle GPU; 5 fold × 2 tugas (166,5 + 166,3 menit) | `ml/models/l2_mdeberta_v1/` (fold 0) |
| L2 MiniLM student [A] | KD T=2, α 0,5, 3 epoch, lr 5e-5, batch 32 | Kaggle GPU (361,6 s); ONNX int8 | `ml/models/l2_student_v1/` |
| L1 ONNX [A] | LightGBM fold 0 b4/bbin → ONNX | lokal | `ml/models/l1_onnx_v1/`, `public/models/` |
| L3 | temperature L1 = 1,0126, L2 TF-IDF = 1,2019, mDeBERTa = 1,4125; LAC qhat 0,8371; ambang ragu 0,5254; hidden 0,20 / 0,25 | lokal | `ml/models/l3_conformal_v1.json` |

*Durasi GPU: `ml/reports/tables/compute_summary.csv` (jumlah `train_sec`/`sec`, tanpa overhead kernel). Parameter
LightGBM: `ml/runs/20261118-2205_l1_lgbm/metrics.json`. L3: `ml/reports/tables/L3_production_params.json`.*

**Kernel Kaggle** (semua privat, akun `avlsalmoon`; dari `kaggle kernels list --mine`):
```
ref                                title                   author      lastRunTime                 totalVotes  
---------------------------------  ----------------------  ----------  --------------------------  ----------  
avlsalmoon/remediaide-l2-distill   remediaide-l2-distill   avlsalmoon  2026-11-19 00:45:13.707000           0  
avlsalmoon/remediaide-cokt-final   remediaide-cokt-final   avlsalmoon  2026-11-18 23:16:32.297000           0  
avlsalmoon/remediaide-cokt         remediaide-cokt         avlsalmoon  2026-11-18 15:02:41.400000           0  
avlsalmoon/remediaide-l2-mdeberta  remediaide-l2-mdeberta  avlsalmoon  2026-11-18 15:02:38.513000           0  
```
Masalah yang ditemui: (1) mDeBERTa NaN — akar masalah transformers 5 memuat checkpoint fp16, AdamW pada bobot fp16 →
diperbaiki dengan `dtype=torch.float32` (semua fold `nan_fallback: False`, `metrics_target.json`); (2) token OAuth Kaggle
kedaluwarsa saat menunggu mDeBERTa (M1b); (3) tidak ada OOM. Nomor versi kernel tidak dicatat terpisah. Variabilitas:
CO-KT 25 run CV (5 seed × 5 fold) AUC next-correct 0,7787–0,7944, sd 0,0047; macro-F1 kuadran 0,4319–0,4772, epoch 12–15
(`runs/20261118-2202_cokt_kaggle/kaggle_output/metrics_full.json`); LightGBM (a) AUC per fold 0,7824–0,7963 (`metrics.json`).


## 7. Hasil eksperimen E1–E10
**Test set Eedi:** dibuka **satu kali secara resmi** pada 19 Nov 2026 06:52–06:59 (run `20261119-0652_final_eval`;
`ml/reports/TEST_OPENED.json` mencatat 1 run, `rerun_reason: null`). Kode evaluasi di-commit sebelumnya (`3888665`), dan
dua dry-run sebelumnya memakai siswa kalibrasi, bukan test. **Pengungkapan tambahan:** reproduksi T47 di clone segar
menjalankan `final_eval.py` sekali lagi pada test dengan model yang sama (`--rerun-reason "reproduction (make all, T47)"`,
11:06–11:14) dan menghasilkan tabel identik; run itu tercatat di segel milik clone, bukan di repo utama. Tidak ada model,
ambang, atau keputusan yang diubah setelah test dibuka.

### E1 — Audit aturan CRI (selesai; CV + test)


| metrik | nilai | ci_lo | ci_hi | n_baris |
| --- | --- | --- | --- | --- |
| tingkat salah kelompok (4 kelas) | 0.4501 | 0.4404 | 0.4593 | 217480 |
| macro-F1 (4 kelas) | 0.4116 | 0.4034 | 0.4193 | 217480 |
| % 'Paham' B0 yang belum tuntas berikutnya | 0.2819 | 0.2705 | 0.2940 | 217480 |
| % 'Miskonsepsi' B0 yang tuntas berikutnya | 0.5069 | 0.4953 | 0.5186 | 217480 |
| error biner butuh_remediasi | 0.3667 | 0.3629 | 0.3704 | 912731 |

*Sumber: `ml/reports/tables/E1_b0_cv.csv`*

| metrik | nilai | ci_lo | ci_hi | n_baris |
| --- | --- | --- | --- | --- |
| tingkat salah kelompok (4 kelas) | 0.4505 | 0.4314 | 0.4693 | 58963 |
| macro-F1 (4 kelas) | 0.3917 | 0.3799 | 0.4026 | 58963 |
| % 'Paham' B0 yang belum tuntas berikutnya | 0.2775 | 0.2568 | 0.2997 | 58963 |
| % 'Miskonsepsi' B0 yang tuntas berikutnya | 0.5240 | 0.5041 | 0.5443 | 58963 |
| error biner butuh_remediasi | 0.3672 | 0.3588 | 0.3755 | 226432 |

*Sumber: `ml/reports/tables/E1_b0_test.csv`*

Gambar: `ml/reports/figures/E1_confusion_b0.png` (test), `E1_confusion_b0_cv.png` (CV).

### Lapis 1 — semua model pada siswa test (baseline di samping model)
| framing | model | metric | value | ci_lo | ci_hi | n_rows | ci_note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| b | B0 | macro_f1 | 0.3917 | 0.3799 | 0.4026 | 58963 | 1000 klaster siswa |
| b | B0 | misgroup | 0.4505 | 0.4314 | 0.4693 | 58963 | 1000 klaster siswa |
| b | B0 | auc_needs_remediation | 0.6313 | 0.6249 | 0.6374 | 226432 | 200 klaster siswa |
| b | B1a | macro_f1 | 0.1818 | 0.1758 | 0.1870 | 58963 | 1000 klaster siswa |
| b | B1a | misgroup | 0.4288 | 0.4025 | 0.4577 | 58963 | 1000 klaster siswa |
| b | B1a | auc_needs_remediation | 0.5576 | 0.5542 | 0.5610 | 226432 | 200 klaster siswa |
| b | B1b | macro_f1 | 0.3602 | 0.3497 | 0.3702 | 58963 | 1000 klaster siswa |
| b | B1b | misgroup | 0.4006 | 0.3796 | 0.4220 | 58963 | 1000 klaster siswa |
| b | B1b | auc_needs_remediation | 0.7341 | 0.7252 | 0.7426 | 226432 | 200 klaster siswa |
| b | LightGBM | macro_f1 | 0.4333 | 0.4167 | 0.4501 | 58963 | 1000 klaster siswa |
| b | LightGBM | misgroup | 0.3615 | 0.3426 | 0.3800 | 58963 | 1000 klaster siswa |
| b | LightGBM | auc_needs_remediation | 0.7943 | 0.7858 | 0.8026 | 226432 | 200 klaster siswa |
| b | CO-KT | macro_f1 | 0.4453 | 0.4316 | 0.4595 | 58963 | 1000 klaster siswa |
| b | CO-KT | misgroup | 0.3474 | 0.3295 | 0.3657 | 58963 | 1000 klaster siswa |
| b | CO-KT | auc_needs_remediation | 0.8009 | 0.7926 | 0.8087 | 226432 | 200 klaster siswa |
| a | B1a | auc_next_correct | 0.6768 | 0.6710 | 0.6836 | 273217 | 200 klaster siswa; baris dengan prediksi CO-KT |
| a | B1b | auc_next_correct | 0.7469 | 0.7400 | 0.7525 | 273217 | 200 klaster siswa; baris dengan prediksi CO-KT |
| a | LightGBM | auc_next_correct | 0.7945 | 0.7863 | 0.8013 | 273217 | 200 klaster siswa; baris dengan prediksi CO-KT |
| a | CO-KT | auc_next_correct | 0.7963 | 0.7880 | 0.8028 | 273217 | 200 klaster siswa; baris dengan prediksi CO-KT |

*Sumber: `ml/reports/tables/L1_test.csv`*

**Uji signifikansi (test):** McNemar (benar/salah kuadran) dan DeLong (AUC), koreksi Holm dalam tiap keluarga. Nilai 0,0 di file = underflow (p < 1e-300).

| perbandingan | selisih_salah_kelompok | ci_lo | ci_hi | p_mcnemar | selisih_auc_butuh_remediasi | p_delong | p_mcnemar_holm | p_delong_holm | selisih_auc_next_correct |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CO-KT vs B0 | -0.1031 | -0.1091 | -0.0972 | 0.0000 | 0.1697 | 0.0000 | 0.0000 | 0.0000 | — |
| CO-KT vs B1b | -0.0532 | -0.0586 | -0.0479 | 2.737e-204 | 0.0668 | 0.0000 | 8.211e-204 | 0.0000 | — |
| CO-KT vs LightGBM | -0.0141 | -0.0176 | -0.0106 | 4.865e-22 | 0.0066 | 9.325e-35 | 4.865e-22 | 1.865e-34 | — |
| (a) CO-KT vs B1b | — | — | — | — | — | 0.0000 | — | 0.0000 | 0.0493 |
| (a) CO-KT vs LightGBM | — | — | — | — | — | 2.074e-06 | — | 2.074e-06 | 0.0017 |

*Sumber: `ml/reports/tables/L1_test_pairwise.csv`*

**Pemilihan model di CV (D-18):**

| metrik | cokt | lgbm | selisih_cokt_minus_lgbm | ci_lo | ci_hi | seri | n_baris | n_siswa |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| salah kelompok | 0.3470 | 0.3583 | -0.0112 | -0.0129 | -0.0095 | False | 217480 | 3054 |
| macro-F1 | 0.4798 | 0.4654 | 0.0144 | 0.0105 | 0.0183 | False | 217480 | 3054 |

*Sumber: `ml/reports/tables/L1_model_selection.csv`*

### E2 — Nilai tiap sinyal (selesai; **CV saja**, model ablation tidak disimpan)
| tahap | macro_f1 | macro_f1_lo | macro_f1_hi | misgroup | misgroup_lo | misgroup_hi | auc_bin | auc_bin_lo | auc_bin_hi | delong_p_vs_prev | delong_p_holm |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S0_cur_correct | 0.1781 | 0.1751 | 0.1812 | 0.4467 | 0.4318 | 0.4612 | 0.6309 | 0.6257 | 0.6358 | — | — |
| S1_keyakinan | 0.2913 | 0.2847 | 0.2979 | 0.4275 | 0.4150 | 0.4395 | 0.6517 | 0.6466 | 0.6561 | 0.0000 | 0.0000 |
| S2_riwayat_benar | 0.4002 | 0.3919 | 0.4085 | 0.3879 | 0.3771 | 0.3977 | 0.7776 | 0.7732 | 0.7818 | 0.0000 | 0.0000 |
| S3_riwayat_keyakinan | 0.4398 | 0.4272 | 0.4514 | 0.3776 | 0.3674 | 0.3873 | 0.7765 | 0.7718 | 0.7806 | 9.395e-41 | 1.879e-40 |
| S4_kesulitan | 0.4620 | 0.4505 | 0.4733 | 0.3614 | 0.3515 | 0.3704 | 0.7970 | 0.7926 | 0.8003 | 0.0000 | 0.0000 |
| S5_opsi | 0.4629 | 0.4511 | 0.4743 | 0.3611 | 0.3513 | 0.3699 | 0.7976 | 0.7933 | 0.8009 | 8.878e-33 | 8.878e-33 |
| S6_waktu | 0.4647 | 0.4531 | 0.4765 | 0.3593 | 0.3493 | 0.3684 | 0.8004 | 0.7962 | 0.8037 | 1.831e-222 | 5.494e-222 |

*Sumber: `ml/reports/tables/E2_ablation_cv.csv`*

Catatan: S3 menurunkan AUC biner (0,7777 → 0,7765) walau DeLong signifikan — penurunan, bukan kenaikan. Gambar `figures/E2_ablation.png`.

| perbandingan | metric | full | ablasi | selisih_full_minus_ablasi | p_delong | n_rows | ci_lo | ci_hi |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| full vs no_conf | AUC next-correct | 0.7936 | 0.7916 | 0.0020 | 7.747e-140 | 1100165 | — | — |
| full vs no_option | AUC next-correct | 0.7936 | 0.7901 | 0.0035 | 0.0000 | 1100165 | — | — |
| full vs no_conf | macro-F1 kuadran (baris E1) | 0.4798 | 0.3214 | 0.1584 | — | 217480 | 0.1458 | 0.1709 |
| full vs no_option | macro-F1 kuadran (baris E1) | 0.4798 | 0.4775 | 0.0023 | — | 217480 | 0.0001 | 0.0044 |

*Sumber: `ml/reports/tables/E2_cokt_ablation_cv.csv`*

Catatan: model penuh 5 seed, ablation 3 seed.

### E3 — Jebakan jawaban benar (selesai; CV MAP)
| model | recall | recall_lo | recall_hi | precision | precision_lo | precision_hi | f1 | pr_auc | n_pos |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B0 aturan CRI v1 | 0.0000 | — | — | — | — | — | 0.0000 | — | 403 |
| B0 TF-IDF | 0.3747 | 0.3294 | 0.4216 | 0.8207 | 0.7602 | 0.8736 | 0.5145 | 0.5819 | 403 |
| M1 mDeBERTa | 0.3226 | 0.2766 | 0.3673 | 0.8075 | 0.7450 | 0.8679 | 0.4610 | 0.5490 | 403 |

*Sumber: `ml/reports/tables/E3_true_misconception.csv`*

| model | ambang | n_positif | positif_masuk_antrean | recall_antrean | presisi_antrean | porsi_jawaban_benar_ditandai | split |
| --- | --- | --- | --- | --- | --- | --- | --- |
| tfidf | 0.2000 | 322 | 161 | 0.5000 | 0.6940 | 0.0141 | CV MAP, 80% baris evaluasi (bukan kalibrasi) |
| mdeberta | 0.2500 | 322 | 165 | 0.5124 | 0.5749 | 0.0174 | CV MAP, 80% baris evaluasi (bukan kalibrasi) |

*Sumber: `ml/reports/tables/E3_queue_cv.csv`*

Gambar `figures/E3_pr_curve.png`. Tidak ada uji signifikansi TF-IDF vs mDeBERTa untuk E3 (CI tumpang tindih).

### Lapis 2 — CV MAP
| model | split | metric | value | ci_lo | ci_hi | fold_std | n | ci_unit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M1 mDeBERTa-v3-base | random (5-fold) | MAP@3 | 0.9123 | 0.9101 | 0.9145 | 0.0020 | 36696 | — |
| B0 TF-IDF+LR | random (5-fold) | MAP@3 | 0.9159 | 0.9140 | 0.9179 | 0.0021 | 36696 | — |
| selisih mDeBERTa − TF-IDF | random (5-fold) | MAP@3 | -0.0036 | -0.0055 | -0.0017 | — | 36696 | — |
| M1 mDeBERTa-v3-base | per soal (5-fold, 3 soal/fold) | macro-F1 category3 | 0.6375 | 0.5839 | 0.6849 | 0.0668 | 36696 | soal (15 klaster) |
| B0 TF-IDF+LR | per soal (5-fold, 3 soal/fold) | macro-F1 category3 | 0.6112 | 0.5422 | 0.6740 | 0.0786 | 36696 | soal (15 klaster) |
| selisih mDeBERTa − TF-IDF | per soal (5-fold, 3 soal/fold) | macro-F1 category3 | 0.0263 | -0.0347 | 0.0781 | — | 36696 | soal (15 klaster) |

*Sumber: `ml/reports/tables/L2_cv.csv`*

### E4 — Lintas bahasa (selesai; CV MAP fold 0, terjemahan mesin)
| model | metric | EN | ID | selisih_ID_minus_EN | selisih | ci_lo | ci_hi | n |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B0 TF-IDF+LR | MAP@3 | 0.9159 | 0.7656 | -0.1503 | — | -0.1579 | -0.1428 | 7340 |
| B0 TF-IDF+LR | macro-F1 category3 | 0.8390 | 0.6308 | -0.2082 | — | -0.2208 | -0.1962 | 7340 |
| B0 TF-IDF+LR | recall True_Misconception | 0.3418 | 0.0127 | -0.3291 | — | — | — | 7340 |
| M1 mDeBERTa-v3-base | MAP@3 | 0.9110 | 0.8945 | -0.0165 | — | -0.0203 | -0.0129 | 7340 |
| M1 mDeBERTa-v3-base | macro-F1 category3 | 0.8437 | 0.8118 | -0.0319 | — | -0.0397 | -0.0244 | 7340 |
| M1 mDeBERTa-v3-base | recall True_Misconception | 0.3038 | 0.2025 | -0.1013 | — | — | — | 7340 |
| selisih mDeBERTa − TF-IDF | MAP@3 (input ID) | — | — | — | 0.1289 | 0.1211 | 0.1361 | 7340 |
| selisih mDeBERTa − TF-IDF | macro-F1 category3 (input ID) | — | — | — | 0.1810 | 0.1680 | 0.1939 | 7340 |

*Sumber: `ml/reports/tables/E4_crosslingual.csv`*

### E5 — Tahu batas diri (selesai; L1 test, L2 CV)
| kunci | nilai |
| --- | --- |
| ece_before | 0.0063 |
| ece_after | 0.0068 |
| lac_coverage | 0.9003 |
| lac_avg_set_size | 1.8976 |
| lac_singleton_share | 0.2956 |
| defer_rate_at_production_threshold | 0.2056 |
| production_defer_target | {"defer_rate": 0.2, "rule": "no grid point met 25% reduction within 30% -> fallback 20% (D-09)"} |
| misgroup_no_defer | 0.3474 |
| misgroup_kept | 0.2831 |
| ece_bin_needs_remediation | 0.0156 |
| n_rows | 58963 |

*Sumber: `ml/reports/tables/E5_test.json`*

Kurva coverage–risk test: `E5_coverage_risk_L1_test.csv`, `figures/E5_coverage_risk.png`, `figures/E5_reliability_L1.png`.

**CV (OOF):**

| kunci | nilai |
| --- | --- |
| L1.calibrator | temperature |
| L1.temperature | 0.9724 |
| L1.n_cal | 45645 |
| L1.n_eval | 171835 |
| L1.ece_before | 0.0050 |
| L1.ece_after | 0.0037 |
| L1.macro_f1_after | 0.4816 |
| L1.misgroup_after | 0.3515 |
| L1.lac_qhat | 0.8294 |
| L1.coverage | 0.8903 |
| L1.avg_set_size | 1.8667 |
| L1.singleton_share | 0.2907 |
| L1.operating_point | {"defer_rate": 0.3, "rule": "smallest defer with >= 25% relative reduction (D-09)"} |
| L1.doubt_threshold | 0.4562 |
| L1.eval_defer_rate_at_threshold | 0.3326 |
| L1.eval_misgroup_kept | 0.2496 |
| L2.temperature | 1.2019 |
| L2.ece_before | 0.0254 |
| L2.ece_after | 0.0096 |
| L2.aps_qhat | 0.9942 |
| L2.coverage | 0.9504 |
| L2.avg_set_size | 1.8965 |
| L2.map3_eval | 0.9164 |

*Sumber: `ml/reports/tables/E5_l3_final_cv.json`*

### E6 — Fairness (selesai; test + CV)
| atribut | kelompok_a | kelompok_b | metrik | nilai_a | nilai_b | selisih_a_minus_b | ci_lo | ci_hi | ci_memuat_0 | n_siswa_a | n_siswa_b |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Gender | perempuan | laki-laki | AUC butuh_remediasi | 0.7934 | 0.8004 | -0.0069 | -0.0322 | 0.0159 | True | 294 | 303 |
| Gender | perempuan | laki-laki | ECE | 0.0237 | 0.0329 | -0.0092 | -0.0187 | 0.0027 | True | 294 | 303 |
| Gender | perempuan | laki-laki | salah kelompok | 0.3744 | 0.3265 | 0.0479 | 0.0047 | 0.0927 | False | 294 | 303 |
| Gender | perempuan | laki-laki | tingkat defer | 0.2367 | 0.1698 | 0.0669 | 0.0107 | 0.1239 | False | 294 | 303 |
| PremiumPupil | pupil premium | bukan | AUC butuh_remediasi | 0.7330 | 0.8043 | -0.0712 | -0.0957 | -0.0489 | False | 107 | 308 |
| PremiumPupil | pupil premium | bukan | ECE | 0.0509 | 0.0185 | 0.0324 | 0.0182 | 0.0445 | False | 107 | 308 |
| PremiumPupil | pupil premium | bukan | salah kelompok | 0.4489 | 0.3278 | 0.1211 | 0.0722 | 0.1729 | False | 107 | 308 |
| PremiumPupil | pupil premium | bukan | tingkat defer | 0.2927 | 0.1765 | 0.1162 | 0.0286 | 0.2116 | False | 107 | 308 |
| ability_q | kuartil 1 | kuartil 4 | AUC butuh_remediasi | 0.6383 | 0.7976 | -0.1594 | -0.1789 | -0.1389 | False | 246 | 246 |
| ability_q | kuartil 1 | kuartil 4 | ECE | 0.0925 | 0.0264 | 0.0661 | 0.0594 | 0.0737 | False | 246 | 246 |
| ability_q | kuartil 1 | kuartil 4 | salah kelompok | 0.5090 | 0.1947 | 0.3143 | 0.2833 | 0.3445 | False | 246 | 246 |
| ability_q | kuartil 1 | kuartil 4 | tingkat defer | 0.4483 | 0.0591 | 0.3892 | 0.3372 | 0.4354 | False | 246 | 246 |
| PremiumPupil | pupil premium | bukan | salah kelompok (B0 aturan v1, pembanding) | 0.5263 | 0.4316 | 0.0947 | 0.0364 | 0.1494 | False | 107 | 308 |
| ability_q | kuartil 1 | kuartil 4 | salah kelompok (B0 aturan v1, pembanding) | 0.6011 | 0.2939 | 0.3072 | 0.2735 | 0.3420 | False | 246 | 246 |

*Sumber: `ml/reports/tables/E6_fairness.csv`*

Versi CV: `E6_fairness_final_cv.csv`. Gender kode 0 (n ≥ 200) dilaporkan terpisah di bagian "Pelengkap audit D-24" di bawah (CV saja); kode 3 n < 200.

### E7 — Efisiensi (Tingkat A, selesai; CV MAP fold 0)
| model | ukuran_MB | map3_EN | map3_ID | latensi_p50_ms | latensi_p95_ms |
| --- | --- | --- | --- | --- | --- |
| mDeBERTa-v3-base teacher (PyTorch, fold 0) | 1131.5000 | 0.9110 | 0.8945 | — | — |
| MiniLM-L12 student ONNX fp32 | 471.0000 | 0.8591 | 0.8354 | 8.1363 | 10.2000 |
| MiniLM-L12 student ONNX int8 | 118.3000 | 0.8599 | 0.8336 | 7.7759 | 9.1677 |

*Sumber: `ml/reports/tables/E7_efficiency.csv`*

| kunci | nilai |
| --- | --- |
| tanpa_L2 | {"median_s": 0.59, "n_responses": 600, "n_explanations": 600} |
| L2_tfidf_en | {"median_s": 0.47, "n_responses": 600, "n_explanations": 600} |
| L2_mdeberta_id | {"median_s": 8.25, "n_responses": 600, "n_explanations": 600} |
| device | MacBook Air Apple Silicon CPU, bersamaan dengan job reproduksi T47 (beban CPU tinggi) |
| L2_student_onnx_int8_id | {"median_s": 1.87, "n_responses": 600, "n_explanations": 600} |

*Sumber: `ml/reports/tables/E7_latency_service_cpu.json`*

Paritas ONNX L1: {"b4": {"max_abs_diff": 0.004565950211421144, "size_mb": 14.1, "n_rows": 48}, "bbin": {"max_abs_diff": 0.0030031568352427707, "size_mb": 14.9, "n_rows": 48}} (`T68_onnx_parity.json`).

### E8 — Dampak guru (selesai; test + CV)
| metrik | nilai |
| --- | --- |
| n_eval_rows | 58963 |
| n_eval_users | 773 |
| b0_misgroup | 0.45051981751267745 |
| ml_misgroup | 0.34743822397096485 |
| defer_rate | 0.20560351406814442 |
| ml_misgroup_kept | 0.2831127241673783 |
| b0_misgroup_on_kept | 0.39225021349274125 |
| errors_caught_by_defer | 0.3526798789417163 |
| ml_minus_b0_misgroup_ci | [-0.10913394930335055, -0.097159542645712] |
| teacher_reviews_per_class_32x15 | 98.7 |
| system_misgroup_if_teacher_fixes_deferred | 0.22490375320116004 |

*Sumber: `ml/reports/tables/E8_impact.csv`*

Versi CV: `E8_impact_final_cv.csv`.

### Robustness temporal (test)
| subset | model | metric | value | ci_lo | ci_hi | n_rows |
| --- | --- | --- | --- | --- | --- | --- |
| 20% interaksi terakhir per siswa | B0 | macro_f1 | 0.3892 | 0.3619 | 0.4127 | 7102 |
| 20% interaksi terakhir per siswa | B0 | misgroup | 0.4841 | 0.4550 | 0.5133 | 7102 |
| 20% interaksi terakhir per siswa | LightGBM | macro_f1 | 0.4308 | 0.4055 | 0.4542 | 7102 |
| 20% interaksi terakhir per siswa | LightGBM | misgroup | 0.4112 | 0.3855 | 0.4389 | 7102 |
| 20% interaksi terakhir per siswa | CO-KT | macro_f1 | 0.4539 | 0.4231 | 0.4777 | 7102 |
| 20% interaksi terakhir per siswa | CO-KT | misgroup | 0.3888 | 0.3654 | 0.4150 | 7102 |

*Sumber: `ml/reports/tables/robustness_temporal_test.csv`*

### Error per kelas CO-KT (test)
| kuadran_masa_depan | n | recall | porsi_diprediksi_paham |
| --- | --- | --- | --- |
| Paham | 33682 | 0.8860 | 0.8860 |
| Tebakan beruntung | 3701 | 0.0500 | 0.5360 |
| Miskonsepsi | 15440 | 0.3680 | 0.5590 |
| Tidak paham | 6140 | 0.4520 | 0.2900 |

*Sumber: `ml/reports/tables/E1_cokt_test_per_class.csv`*

### T36 — Retrieval soal baru (Tingkat A, selesai, **hasil negatif**)
| bahasa | metrik | nilai | ci_lo | ci_hi | n_baris | n_soal |
| --- | --- | --- | --- | --- | --- | --- |
| EN | MAP@3 retrieval e5 | 0.6885 | 0.6149 | 0.7709 | 9860 | 15 |
| EN | top-1 retrieval e5 | 0.4322 | 0.3063 | 0.6032 | 9860 | 15 |
| EN | MAP@3 acak (harapan) | 0.6694 | 0.6252 | 0.7136 | 9860 | 15 |
| EN | MAP@3 label terbanyak soal (acuan atas) | 0.8572 | 0.8213 | 0.8958 | 9860 | 15 |
| EN | top-1 label terbanyak soal | 0.7258 | 0.6594 | 0.7980 | 9860 | 15 |
| ID | MAP@3 retrieval e5 | 0.6316 | 0.5729 | 0.7049 | 9860 | 15 |
| ID | top-1 retrieval e5 | 0.3164 | 0.2186 | 0.4381 | 9860 | 15 |
| ID | MAP@3 acak (harapan) | 0.6694 | 0.6235 | 0.7139 | 9860 | 15 |
| ID | MAP@3 label terbanyak soal (acuan atas) | 0.8572 | 0.8222 | 0.8916 | 9860 | 15 |
| ID | top-1 label terbanyak soal | 0.7258 | 0.6573 | 0.7967 | 9860 | 15 |

*Sumber: `ml/reports/tables/T36_retrieval.csv`*

### Pelengkap audit D-24 (ditambahkan 19 Nov setelah laporan versi 1; **CV saja**, test tidak dibuka lagi)
Empat butir spesifikasi yang terlewat, dihitung oleh `ml/scripts/gap_fill.py` (juga dipanggil `make l3`) dari file OOF CV yang
sudah ada. Tidak ada model, ambang, atau angka lama yang berubah. Karena dihitung **setelah** test dibuka, angka ini tidak
dipakai untuk keputusan apa pun (D-24). Log: `ml/runs/logs/gap_fill.log`.

**(1) B0 framing (a), 03 §1** — skor = kuadran B0 terakhir siswa di KC yang sama sebelum t (ordinal P=3, L=2, T=1, M=0; dan
biner {P, L} = 1), target = IsCorrect di t. Baris tanpa kuadran sebelumnya di KC tidak punya skor B0, jadi pembanding dihitung
pada subset yang sama; varian semua baris (nilai kosong = 1,5) disertakan. DeLong berpasangan vs B0 ordinal.
| model | metrik | nilai | ci_lo | ci_hi | n_baris | n_siswa | delong_vs_b0_ord_p | catatan |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B0 (a) skor ordinal P=3,L=2,T=1,M=0 | auc | 0.5972 | 0.5931 | 0.6019 | 415300 | 3414 | — | CV 5 fold, baris dengan kuadran B0 sebelumnya di KC yang sama; CI bootstrap klaster siswa 1000x |
| B0 (a) biner {P,L}=1 | auc | 0.5921 | 0.5881 | 0.5963 | 415300 | 3414 | 1.781e-71 | CV 5 fold, baris dengan kuadran B0 sebelumnya di KC yang sama; CI bootstrap klaster siswa 1000x |
| B1b (a) LR | auc | 0.7579 | 0.7544 | 0.7615 | 415300 | 3414 | 0.0000 | CV 5 fold, baris dengan kuadran B0 sebelumnya di KC yang sama; CI bootstrap klaster siswa 1000x |
| B2 LightGBM (a) | auc | 0.7998 | 0.7955 | 0.8042 | 415300 | 3414 | 0.0000 | CV 5 fold, baris dengan kuadran B0 sebelumnya di KC yang sama; CI bootstrap klaster siswa 1000x |
| B0 (a) skor ordinal, semua baris (tanpa kuadran sebelumnya = 1,5) | auc | 0.5629 | 0.5597 | 0.5664 | 1107657 | 3934 | — | CV 5 fold, semua baris; CI bootstrap klaster siswa 1000x |
| cakupan skor B0 (a) | porsi baris dengan kuadran sebelumnya | 0.3749 | — | — | 1107657 | 3934 | — | baris CV framing (a) |

*Sumber: `ml/reports/tables/E1_b0_framing_a_cv.csv`*

**(2) LAC biner L1 (butuh remediasi), 03 §3** — OOF CV CO-KT 5 seed, siswa kalibrasi 20% yang sama dengan `l3_eval`/`e6_e8`, temperature pada [1−p, p], α = 0,10.

| kunci | nilai |
| --- | --- |
| source | runs/20261118-2202_cokt_kaggle/oof_b_ens5.parquet |
| alpha | 0.1000 |
| target_coverage | 0.9000 |
| calibrator | temperature on [1-p, p] (calibration users) |
| temperature | 0.9481 |
| n_cal_rows | 192082 |
| n_eval_rows | 720649 |
| n_cal_users | 787 |
| n_eval_users | 3147 |
| lac_qhat | 0.6897 |
| coverage | 0.9011 |
| avg_set_size | 1.4374 |
| singleton_share | 0.5626 |
| both_classes_share | 0.4374 |
| coverage_class0_no_remediation | 0.8982 |
| coverage_class1_needs_remediation | 0.9040 |
| singleton_accuracy | 0.8241 |
| ece_before | 0.0184 |
| ece_after | 0.0143 |
| note | CV only (CO-KT CV OOF runs/20261118-2202_cokt_kaggle, 5 seeds, same file as l3_eval final_cv); test not used. Empty sets are filled with argmax (conformal.LAC). |

*Sumber: `ml/reports/tables/E5_lac_binary_L1_cv.json`*

Catatan: cakupan 0.9011 untuk target 0,90; 0.4374 baris mendapat himpunan berisi kedua kelas (= "tidak tahu"), jadi LAC biner jujur tetapi sering tidak informatif.

**(3) Akurasi kepala opsi CO-KT (T24)** — ensemble 5 seed OOF CV, dibandingkan acak dan opsi terbanyak per soal dari fold latih (OOF). Baris "pengecoh" = hanya jawaban salah, argmax di antara 3 opsi salah.

| model | metrik | nilai | ci_lo | ci_hi | n_baris | n_siswa | catatan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CO-KT kepala opsi berikutnya | akurasi top-1 opsi | 0.5652 | 0.5582 | 0.5721 | 1100165 | 3934 | CV 5 fold, ensemble 5 seed CO-KT (OOF CV); CI bootstrap klaster siswa 1000x |
| CO-KT kepala opsi berikutnya | akurasi top-2 opsi | 0.7682 | 0.7637 | 0.7727 | 1100165 | 3934 | CV 5 fold, ensemble 5 seed CO-KT (OOF CV); CI bootstrap klaster siswa 1000x |
| acuan: opsi terbanyak per soal (fold latih) | akurasi top-1 opsi | 0.5436 | 0.5365 | 0.5505 | 1100165 | 3934 | OOF per fold; soal tak dikenal -> kunci jawaban |
| acuan: acak seragam | akurasi top-1 opsi (harapan) | 0.2500 | 0.2500 | 0.2500 | 1100165 | 3934 | 1/4 |
| CO-KT kepala opsi berikutnya | akurasi pengecoh (baris jawaban salah, argmax di 3 opsi salah) | 0.4879 | 0.4843 | 0.4915 | 511238 | 3884 | CV 5 fold, ensemble 5 seed CO-KT (OOF CV); CI bootstrap klaster siswa 1000x |
| acuan: pengecoh terbanyak per soal (fold latih) | akurasi pengecoh (baris jawaban salah) | 0.4675 | 0.4640 | 0.4711 | 511238 | 3884 | OOF per fold |
| acuan: acak di 3 pengecoh | akurasi pengecoh (harapan) | 0.3333 | 0.3333 | 0.3333 | 511238 | 3884 | 1/3 |
| CO-KT kepala opsi berikutnya | log loss opsi | 1.0054 | — | — | 1100165 | 3934 | CV 5 fold, ensemble 5 seed CO-KT (OOF CV); CI bootstrap klaster siswa 1000x |

*Sumber: `ml/reports/tables/L1_cokt_option_cv.csv`*

**(4) Gender kode 0 (tidak disebut), 04 E6** — pipeline identik dengan `e6_e8.py --tag final_cv` (skrip memeriksa bahwa nilai Gender 1 vs 2 tereproduksi persis sebelum menghitung). Kode 3: 5 siswa evaluasi CV (< 200) → tidak dilaporkan.

| atribut | kelompok_a | kelompok_b | metrik | nilai_a | nilai_b | selisih_a_minus_b | ci_lo | ci_hi | ci_memuat_0 | n_siswa_a | n_siswa_b |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Gender | tidak disebut (0) | perempuan (1) | AUC butuh_remediasi | 0.8017 | 0.7986 | 0.0031 | -0.0080 | 0.0137 | True | 1199 | 969 |
| Gender | tidak disebut (0) | perempuan (1) | ECE | 0.0166 | 0.0223 | -0.0057 | -0.0114 | 0.0003 | True | 1199 | 969 |
| Gender | tidak disebut (0) | perempuan (1) | salah kelompok | 0.3364 | 0.3594 | -0.0229 | -0.0464 | 0.0009 | True | 1199 | 969 |
| Gender | tidak disebut (0) | perempuan (1) | tingkat defer | 0.1949 | 0.2170 | -0.0222 | -0.0539 | 0.0087 | True | 1199 | 969 |
| Gender | tidak disebut (0) | laki-laki (2) | AUC butuh_remediasi | 0.8017 | 0.8013 | 0.0004 | -0.0112 | 0.0118 | True | 1199 | 974 |
| Gender | tidak disebut (0) | laki-laki (2) | ECE | 0.0166 | 0.0267 | -0.0101 | -0.0160 | -0.0042 | False | 1199 | 974 |
| Gender | tidak disebut (0) | laki-laki (2) | salah kelompok | 0.3364 | 0.3371 | -0.0007 | -0.0267 | 0.0251 | True | 1199 | 974 |
| Gender | tidak disebut (0) | laki-laki (2) | tingkat defer | 0.1949 | 0.1890 | 0.0059 | -0.0270 | 0.0379 | True | 1199 | 974 |

*Sumber: `ml/reports/tables/E6_fairness_gender_codes_cv.csv`*

| kunci | nilai |
| --- | --- |
| cv_users | {"0": 1488, "1": 1230, "2": 1210, "3": 6} |
| test_users | {"0": 386, "1": 294, "2": 303, "3": 1} |
| cv_eval_users_e6 | {"0": 1199, "1": 969, "2": 974, "3": 5} |
| rule | 04 E6: codes 0/3 reported separately if n >= 200 (CV evaluation users). Code 3 below threshold -> count only. |
| test_note | Test users counted from metadata only; no test predictions read (test opened once at T46). |

*Sumber: `ml/reports/tables/E6_gender_counts.json`*

### E9, E10 — **belum dijalankan** (Tingkat B, butuh pilot sekolah).


## 8. Angka utama
> "Aturan CRI v1 salah mengelompokkan **0.4505** kasus siswa–soal. RemediAide 2.0 menurunkannya menjadi
> **0.3474** (selisih CI [-0.10913394930335055, -0.097159542645712]), dan **0.2056** kasus paling meragukan
> diserahkan ke guru; pada kasus yang tidak diserahkan salah kelompok **0.2831**."

Sumber: `ml/reports/tables/E8_impact.csv` (test, 58963 baris, 773 siswa berlabel). Cara hitung
(`ml/scripts/final_eval.py`): baris test dengan keyakinan saat ini + label kuadran masa depan; salah kelompok = P(kuadran
prediksi ≠ kuadran masa depan); ML = argmax probabilitas CO-KT ensemble 5 seed setelah temperature (parameter produksi,
tanpa refit); defer = 1 − max p ≥ 0,5254 (ambang dari siswa kalibrasi model produksi, D-21); CI = bootstrap klaster siswa
1000×. README/REPORT menulisnya dalam persen 1 desimal (45,1% / 34,7% / 20,6% / 28,3%).


## 9. Perbandingan dengan literatur (01_CONTEXT §D)
| Rujukan | Angka rujukan | Kita | Perbedaan setup |
| --- | --- | --- | --- |
| pyKT NIPS34 AUC (arXiv 2302.06881) | DKT 0,7689; SAKT 0,7517; AKT 0,8033; simpleKT 0,8035; IEKT 0,8045 | CO-KT 0,7963 [0,7880–0,8028], LightGBM 0,7945 (test, framing a, `L1_test.csv`) | pyKT: preprocessing + split sekuens pyKT; kita: split per siswa + test terkunci, CO-KT multi-tugas, baris tanpa prediksi CO-KT dikeluarkan. Tidak setara langsung; pyKT resmi (T25) tidak dijalankan |
| MAP Kaggle MAP@3 | emas 0,94792 (Qwen3-32B); Qwen-3-4B 0,9472; GPT-5 tanpa fine-tune 0,8137 | TF-IDF 0,9159, mDeBERTa 0,9123 (CV acak, `L2_cv.csv`) | leaderboard = test tersembunyi Kaggle; kita = CV 5 fold pada train.csv; model jauh lebih kecil |
| Correct Answer Trap (arXiv 2606.23205) | BERT recall 57,4% (CI 44,5–69,4) | TF-IDF recall 0,3747 [0,3294–0,4216], mDeBERTa 0,3226 (`E3_true_misconception.csv`) | rujukan memakai data Eedi; kita MAP (1,10% positif); kita **lebih rendah** |
| Defer 20% (Mitton dkk. 2025, arXiv 2509.21514) | +1,9–2,4 poin AUC pada coverage 80% | defer 20,56%: salah kelompok 0,3474 → 0,2831 (`E5_test.json`) | metrik berbeda (salah kelompok, bukan AUC); AUC pada subset yang dipertahankan tidak dihitung |


## 10. Kalibrasi, conformal, fairness
- **L1 (test):** ECE kuadran sebelum 0.0063 → sesudah temperature 0.0068
  (**memburuk sedikit**); ECE biner butuh remediasi 0.0156. LAC cakupan
  0.9003, ukuran himpunan 1.8976, singleton 0.2956.
- **L1 (CV OOF):** ECE 0.0050 → 0.0037; cakupan 0.8903; ukuran 1.8667.
- **L2 TF-IDF (CV):** ECE 0.0254 → 0.0096 (T = 1.2019); APS cakupan
  0.9504 (over-coverage vs 0,90), ukuran 1.8965.
- **L1 LAC biner (CV, D-24):** cakupan 0.9011, ukuran himpunan 1.4374, singleton 0.5626 (`E5_lac_binary_L1_cv.json`; tidak ada angka test).
- **Fairness:** tabel lengkap di §7 E6 (`E6_fairness.csv`). Semua selisih salah kelompok (Gender, PremiumPupil, kuartil) CI
  tidak memuat 0 di test. Aturan v1 juga timpang pada kelompok yang sama (baris "B0 aturan v1, pembanding").


## 11. Hasil mengejutkan atau mencurigakan, dan cara memeriksanya
1. **Angka CV CO-KT optimistis.** `best_val_auc == auc_next` per fold di `metrics_full.json` → early stopping memakai fold
   yang dinilai. Pemeriksaan: model produksi dengan early stopping pada 10% siswa terpisah memberi AUC test 0,7963 (CV ens5
   0,7936) dan salah kelompok test 0,3474 (CV 0,3470) — tidak ada penurunan besar, bias kecil.
2. **TF-IDF mengalahkan mDeBERTa di MAP@3 bahasa Inggris** (0,9159 vs 0,9123, selisih CI tidak memuat 0). Diperiksa per
   fold (`L2_cv.csv` fold_std ≈ 0,002) — konsisten; diduga karena split acak memakai soal yang sama sehingga hafalan n-gram
   per soal kuat. Bukti pendukung: pada split per soal mDeBERTa lebih baik (0,6375 vs 0,6112, seri) dan pada bahasa
   Indonesia jauh lebih baik.
3. **MAP@3 tinggi (0,91–0,92)** — wajar untuk split acak (QuestionId sama di train/validasi, D-06), bukan leakage label;
   split per soal memberi macro-F1 category3 0,61–0,64 dengan CI lebar (15 klaster soal).
4. **B1a salah kelompok 0,4288 lebih baik dari B0 0,4505 walau macro-F1 0,1818** — B1a nyaris selalu memprediksi kelas
   mayoritas (Paham). Karena itu salah kelompok saja menyesatkan; macro-F1 selalu dilaporkan berdampingan.
5. **Kalibrasi tidak membantu di test** (ECE 0,0063 → 0,0068) — CO-KT sudah terkalibrasi baik; dilaporkan apa adanya.
6. **Titik operasi D-09 tidak stabil:** OOF CV `l3_eval` memenuhi 25% pada 30%, `e6_e8` dan model produksi tidak → fallback 20%.
   Reduksi relatif test 18,5% (< 25%).
7. **Kesenjangan Gender muncul di test, tidak di CV** (CV CI memuat 0, `E6_fairness_final_cv.csv`) — mungkin variasi sampel;
   dilaporkan sebagai temuan, bukan dibuang.
8. **Retrieval e5 di bawah acak untuk bahasa Indonesia** (0,6316 vs 0,6694) — hasil negatif, tidak dipakai di produk.
9. **Reproduksi identik byte-per-byte** (termasuk LightGBM + Optuna) — diperiksa bahwa tabel benar-benar ditulis ulang
   (mtime di clone 09:51–11:14, log `make all` lengkap); penjelasannya seed tetap dan algoritma deterministik.
10. **Dry-run `final_eval` memberi LightGBM lebih baik dari CO-KT** — karena siswa kalibrasi pengganti test ada di data latih
    LightGBM (sengaja, hanya uji kode); angka itu tidak dilaporkan di mana pun.
11. **Distribusi kuadran CV vs test stabil:** E1 test 0,4505 vs CV 0,4501.


## 12. Reproduksibilitas
- `make all` ada (`ml/Makefile`: data → l1 → l2 → l3 → final) beserta `make check-repro` (toleransi ±0,005; 07 §6).
- Dijalankan dari **clone segar + venv segar** (dari `requirements-lock.txt` via uv) dengan data mentah dan output Kaggle
  tersimpan disalin: `make test` 82 lulus + 2 di-skip (artefak biner belum ada) → `make all` 07:05:19–11:14:12 (**±4 jam 9 menit**,
  di laptop yang juga menjalankan pekerjaan lain) → `check-repro`: **0 file di luar toleransi; semua tabel identik**.
- Satu bug ditemukan dan diperbaiki sebelum reproduksi final: `test_bundle` tidak di-skip tanpa bobot (commit `f543218`).
- Tidak termasuk `make all`: bagian GPU (memakai output kernel tersimpan; kernel bisa dijalankan ulang dari `ml/kaggle/kernels/`),
  QA terjemahan manual, kamus miskonsepsi manual, tabel dev_b1, dan seluruh Tingkat A (T35/T36/T68/E7).
- Juri tidak bisa mengakses kernel/dataset Kaggle privat akun tim; mereka harus menjalankan kernel sendiri.


## 13. Submisi dan web
- **Repo:** https://github.com/muhammadkiro516-netizen/remediaide (proyek penuh; branch `main`, `cac/ml`,
  `feat/ml-integration`; tag `freeze-tierS`). Visibilitas (privat/publik) belum dicek terhadap rulebook.
- **Dokumen:** `ml/README.md`, `ml/REPORT.md`, `ml/MODEL_CARD.md`, `ml/DATA_CARD.md` (Bahasa Indonesia);
  `ml/scripts/check_numbers.py` → 0 angka tanpa sumber (dengan whitelist konstanta protokol `scripts/number_whitelist.txt`).
- **Paket dataset:** `submission/remediaide-ml.zip` 17.739.567 byte (MAP asli + terjemahan Indonesia, skrip unduh Eedi
  + sha256; data olahan Eedi tidak disertakan karena ND). Diekstrak dan diuji: 82 lulus, 7 di-skip.
- **Web (P6):** https://remediaide.vercel.app (Vercel + Neon Postgres, migrasi `init` + `ml_integration` diterapkan, seed
  demo). Fitur: alasan siswa (maks 280), toggle "Minta alasan", Mode AI (antrean "Perlu dicek guru", kelompok per
  miskonsepsi, LKPD per miskonsepsi, umpan balik guru), ekspor riset (consent → 403), landing page bersumber, `/metodologi`,
  Lapis 1 di browser (ONNX). 586 tes Vitest lulus; `next build` lulus; Playwright 3 lulus (lokal, Chrome).
- **Belum di web:** layanan ML Python tidak di-hosting → di produksi Mode AI hanya Lapis 1 di perangkat (tanpa CO-KT, tanpa L2,
  tanpa kalibrasi/conformal). Data demo di produksi hanya dari uji manual Salman (1 siswa).


## 14. Yang belum dan risiko
| Prioritas | Pekerjaan | Estimasi | Pemilik |
| --- | --- | --- | --- |
| 1 | Cabut token GitHub, reset password Neon (perbarui `DIRECT_URL`), ganti password akun seed demo/superadmin | 15 menit | Salman |
| 2 | Cek rulebook: repo publik atau dibagikan; tanya panitia format dataset (M6) | 30 menit | Salman |
| 3 | Kirim formulir panitia (M15/T54) + simpan bukti | 15 menit | Salman (Jum 27 Nov) |
| 4 | ~~Perbaiki catatan lisensi basi di `ml/data/manifest.json`~~ **selesai 19 Nov** | — | Claude Code |
| 5 | ~~Lengkapi kekurangan kecil: B0 framing (a), LAC biner, tabel akurasi opsi CO-KT, Gender kode 0/3~~ **selesai 19 Nov** (D-24, §7 "Pelengkap audit"; CV saja) | — | Claude Code |
| 6 | Hosting layanan ML (HF Spaces Docker, `RA_L2_MODEL=student`) + isi `ML_SERVICE_URL` | 2–3 jam | Claude Code + akun Salman |
| 7 | Bahan final T80–T84 (naskah demo, slide, tanya jawab) | 1 hari | setelah 30 Nov |
| 8 | Pilot T70–T75 (E9/E10) | minggu | butuh izin sekolah + persetujuan orang tua |

**Risiko:** juri menolak label proxy sebagai kebenaran; pertanyaan fairness; kernel Kaggle privat tidak bisa diakses juri;
password/token yang sempat ditempel di chat; akun demo dengan password seed publik di repo (`prisma/seed.ts`); demo
produksi tanpa layanan ML penuh; ketergantungan pada satu laptop.


## 15. Lampiran
### A. Isi lengkap `ml/reports/RESULTS.md`

#### RESULTS — RemediAide 2.0 (CAC MLSC 2026)

Status: **final Tingkat S (test dibuka sekali, 19 Nov 2026 06:52–06:59, run `20261119-0652_final_eval`; segel
`ml/reports/TEST_OPENED.json`).** Setiap angka menunjuk ke file sumber di `ml/reports/`. Angka bertanda "CV" berasal
dari validasi silang 80% siswa; angka bertanda "test" dari 20% siswa Eedi yang dikunci sejak awal (D-04) dan tidak
pernah dipakai untuk melatih, memilih, atau mengkalibrasi model. MAP tidak punya fold test terkunci (D-06), sehingga
semua angka Lapis 2 adalah CV.

##### 1. Ringkasan angka utama
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

##### 2. Data
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

##### 3. Eksperimen

###### E1 — Audit aturan CRI
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

###### E2 — Nilai tiap sinyal (CV)
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

###### E3 — Jebakan jawaban benar (CV MAP)
- **Setup:** kelas positif True_Misconception (403 baris, 1,10%); skor = jumlah probabilitas target True_Misconception.
- **Hasil (`tables/E3_true_misconception.csv`, `figures/E3_pr_curve.png`):** B0 recall 0 (desain: benar + yakin =
  Paham). TF-IDF recall 0,375 [0,329–0,422], presisi 0,821, PR-AUC 0,582. mDeBERTa recall 0,323 [0,277–0,367], presisi
  0,807, PR-AUC 0,549.
- **Antrean guru (`tables/E3_queue_cv.csv`):** pada ambang D-20, penanda `hidden_misconception` menangkap 50,0%
  (TF-IDF) dan 51,2% (mDeBERTa) kasus positif di 80% baris evaluasi, sambil menandai hanya 1,4–1,7% jawaban benar.
- **Pembanding literatur:** BERT 57,4% (arXiv 2606.23205) pada set dan split berbeda; tidak dapat dibandingkan langsung.
- **Keterbatasan:** kelas sangat langka; CI lebar; MAP tanpa fold test terkunci.

###### E4 — Lintas bahasa (CV MAP, fold 0)
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

###### E5 — Tahu batas diri
- **L1 test (`tables/E5_test.json`, `figures/E5_coverage_risk.png`, `figures/E5_reliability_L1.png`; parameter produksi
  tanpa refit, D-21):** ECE kuadran 0,0063 sebelum → 0,0068 sesudah temperature (CO-KT sudah terkalibrasi baik;
  kalibrasi tidak memperbaiki di test). Conformal LAC α = 0,1: cakupan **0,900**, ukuran himpunan rata-rata 1,90,
  29,6% himpunan berisi satu kuadran. Defer pada ambang produksi: 20,6% kasus; salah kelompok sisa 0,283 (dari 0,347,
  turun 18,5% relatif — di bawah target 25% D-09, sesuai fallback 20%). Kurva coverage–risk: `tables/E5_coverage_risk_L1_test.csv`.
- **L2 CV (`tables/E5_l3_final_cv.json`, `figures/E5_reliability_L2_final_cv.png`):** TF-IDF ECE 0,025 → 0,010
  (temperature 1,20); APS cakupan 0,950 (target 0,90; over-coverage karena skor diskret), ukuran himpunan 1,90.
- **Pembanding literatur:** Mitton dkk. 2025 (+1,9–2,4 AUC pada coverage 80%); metrik berbeda.

###### E6 — Fairness (test)
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

###### E7 — Ringan untuk offline (Tingkat A, CV MAP fold 0; D-23)
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

###### T36 — Retrieval untuk soal baru (Tingkat A, D-22): hasil negatif
- **Setup:** multilingual-e5-base zero-shot, alasan ↔ deskripsi miskonsepsi soal itu (2–4 kandidat), 9.860 baris
  kategori Misconception, CI klaster soal (`tables/T36_retrieval.csv`).
- **Hasil:** MAP@3 EN 0,689 [0,615–0,771] vs acak 0,669 [0,625–0,714]; ID 0,632 [0,573–0,705] (di bawah acak).
  Acuan "label terbanyak soal" 0,857.
- **Interpretasi:** kemiripan kalimat umum tidak cukup untuk membedakan miskonsepsi dalam satu soal. Untuk soal baru,
  guru tetap perlu memberi contoh berlabel; pendekatan ini **tidak** dipakai di produk.

###### E8 — Dampak bagi guru (simulasi, test)
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

###### Robustness (test)
- **Model terbaik per framing di test (`tables/L1_test.csv`, `tables/L1_test_pairwise.csv`):** CO-KT unggul atas
  LightGBM ensemble dalam salah kelompok (−0,014 [−0,018; −0,011]) dan AUC butuh_remediasi (+0,007), konsisten dengan
  pemilihan di CV (D-18). Framing (a) AUC next-correct: CO-KT 0,796 [0,788–0,803], LightGBM 0,795, B1b 0,747, B1a 0,677
  (selisih CO-KT − LightGBM +0,002; DeLong p Holm < 0,001). Semua perbandingan CO-KT vs B0/B1b/LightGBM: McNemar dan
  DeLong p < 0,001 setelah Holm.
- **Temporal (`tables/robustness_temporal_test.csv`):** pada 20% interaksi terakhir tiap siswa test, salah kelompok
  B0 0,484, LightGBM 0,411, CO-KT 0,389 — semua model lebih buruk di akhir riwayat, urutan tetap sama.

###### E9 — Kesepakatan model–guru
Tingkat B — menunggu pilot.

###### E10 — Dampak belajar
Tingkat B — menunggu pilot.

###### Pelengkap audit (D-24, CV saja; dihitung 19 Nov setelah test dibuka)
Empat butir spesifikasi yang terlewat, dihitung oleh `scripts/gap_fill.py` dari OOF CV yang sudah ada. Tidak ada model,
ambang, atau angka di atas yang berubah, dan angka ini tidak dipakai untuk keputusan apa pun.

| Butir | Hasil (CV) | Sumber |
| --- | --- | --- |
| B0 framing (a), skor ordinal kuadran terakhir di KC (03 §1) | AUC 0,5972 [0,5931–0,6019] pada 415.300 baris (37,49% baris CV punya kuadran sebelumnya); di baris yang sama B1b 0,7579, LightGBM 0,7998 (DeLong p < 1e-300) | `tables/E1_b0_framing_a_cv.csv` |
| LAC biner L1 butuh remediasi, α = 0,10 (03 §3) | cakupan 0,9011, ukuran himpunan 1,4374; 43,74% baris mendapat kedua kelas (tidak informatif) | `tables/E5_lac_binary_L1_cv.json` |
| Akurasi kepala opsi CO-KT (T24) | top-1 0,5652 [0,5582–0,5721] vs opsi terbanyak per soal 0,5436 [0,5365–0,5506], acak 0,25; pengecoh pada jawaban salah 0,4879 vs 0,4675 | `tables/L1_cokt_option_cv.csv` |
| Gender kode 0 (tidak disebut, 1.199 siswa evaluasi) vs 1 dan 2 (04 E6) | semua selisih salah kelompok/AUC/defer CI memuat 0; ECE kode 0 lebih rendah dari laki-laki (−0,0101 [−0,0160; −0,0042]). Kode 3: 5 siswa → tidak dilaporkan | `tables/E6_fairness_gender_codes_cv.csv`, `tables/E6_gender_counts.json` |

##### 4. Model terpilih per lapis
| Lapis | Model produksi | Keputusan | Hiperparameter | Artefak |
| --- | --- | --- | --- | --- |
| L1 kuadran | CO-KT (transformer 2 lapis, d=128, 4 head, dropout 0,2, jendela 200, AdamW lr 1e-3, batch 64, early stopping patience 3), ensemble 5 seed | D-15 → D-18 | `l1/cokt.py` `CoktConfig` | `models/l1_cokt_v1/` |
| L1 penjelas + fallback | LightGBM (Optuna 50 trial; 4 kelas: num_leaves 86, lr 0,021, min_child_samples 175; biner: num_leaves 246, lr 0,023) | D-18 | `runs/20261118-2205_l1_lgbm/metrics.json` | `models/l1_lgbm_v1/` |
| L2 input Inggris | TF-IDF (kata 1–2 + karakter 3–5) + regresi logistik C = 10, masking kandidat | D-19 | `scripts/train_l2_tfidf.py` | `models/l2_tfidf_v1.joblib` |
| L2 input Indonesia | mDeBERTa-v3-base (lr 2e-5, batch 16, 3 epoch, max_len 192, fp16 di GPU Kaggle) | D-21(b) | `kaggle_output/metrics_target.json` | `models/l2_mdeberta_v1/` |
| L3 | temperature (L1 T=1,01; L2 T=1,20/1,41), LAC/APS α=0,1, defer 20% (ambang ragu 0,525), fusi naive-Bayes, ambang hidden 0,20/0,25 | D-09, D-20, D-21 | `models/l3_conformal_v1.json` | `tables/L3_production_params.json` |
| Pengaman | NT10/GMM/τmin (diuji simulasi, tidak dilaporkan sebagai hasil) | 03 §4 | `guard/rapid_guess.py` | — |

##### 5. Keterbatasan
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

##### 6. Lampiran
Versi library: `ml/requirements-lock.txt`. Hash data: `ml/data/manifest.json`. Run test: `ml/runs/20261119-0652_final_eval/metrics.json`
(hash input). Segel test: `ml/reports/TEST_OPENED.json`. Id run lain: kolom `run` di setiap tabel dan `PROGRESS.md`.

### B. Isi lengkap `docs/cac/DECISIONS.md`

#### DECISIONS — keputusan yang dikunci (pre-registered)

Keputusan di bawah ini dikunci sebelum melihat hasil. Perubahan hanya boleh lewat entri baru
`D-xx (revisi D-yy)` yang berisi tanggal, alasan, dan dampaknya. Entri lama jangan dihapus.

| ID | Tanggal | Keputusan | Alasan |
| --- | --- | --- | --- |
| D-01 | 2026-11-18 | Seed global 20261118. Ensemble seed {20261118, 1, 2, 3, 4}. | Reproduksibilitas |
| D-02 | 2026-11-18 | **B0 = kode v1 apa adanya** (`engine.ts` + `compute.ts`), diport ke `cri_rule.py`. Kesetaraan dijamin 27 tes fixture yang dihasilkan dari TypeScript. | Pembanding harus aturan yang benar-benar dipakai di aplikasi |
| D-03 | 2026-11-18 | Confidence Eedi 0–100 → CRI integer dengan pembulatan half-up `floor((c+10)/20)`. Hasilnya cri ≥ 3 ⇔ c ≥ 50 ⇔ c/20 ≥ 2,5. Jadi ambang kode (≥3) dan ambang proposal (≥2,5) setara di data ini. | Menghilangkan ambiguitas 2,5 vs 3 |
| D-04 | 2026-11-18 | Split Eedi: 20% UserId = test terkunci. Sisanya GroupKFold(5) per UserId. Robustness: split temporal 20% terakhir per siswa test. | Protokol pyKT, anti-leakage antarsiswa |
| D-05 | 2026-11-18 | Label E1/framing (b) = **kuadran masa depan**: 3 percobaan berikutnya di KC yang sama (minimal 2). Tuntas = fut_acc ≥ 2/3; yakin = fut_cri_mean ≥ 3. B0 memprediksi kuadran masa depan = kuadran saat ini. | Definisi "salah kelompok" yang bisa diuji tanpa label guru |
| D-06 | 2026-11-18 | MAP: (i) StratifiedKFold(5) pada target, setara Kaggle; (ii) GroupKFold per QuestionId untuk `category3`. Output dibatasi kandidat (QuestionId, prefiks benar/salah). | Skor Kaggle overoptimistis karena ID soal sama; split per soal menguji generalisasi |
| D-07 | 2026-11-18 | Metrik utama: L1(a) AUC; L1(b) macro-F1 4 kelas + tingkat salah kelompok; L2 MAP@3 (random) dan macro-F1 `category3` (per soal); L3 ECE, cakupan conformal, kurva coverage-risk. | Sesuai literatur dan cerita utama |
| D-08 | 2026-11-18 | Terjemahan: Helsinki-NLP/opus-mt-en-id (Apache-2.0), dengan placeholder untuk ekspresi matematika, plus QA manual 100 sampel. | Reproduksibel, lisensi aman |
| D-09 | 2026-11-18 | Conformal α = 0,1. Titik operasi defer dipilih di validasi dengan aturan: defer terkecil yang menurunkan tingkat salah kelompok sisa ≥ 25% relatif terhadap tanpa defer, maksimal 30%. Jika tidak ada, 20%. | Dikunci supaya tidak dipilih setelah melihat test |
| D-10 | 2026-11-18 | Tingkat S dibekukan Rab 25 Nov 23:59. Test set dibuka sekali di T46. Submit Jum 27 Nov. | Tenggat 28 Nov |
| D-11 | 2026-11-18 | Data olahan Eedi tidak dibagikan (ND). Upload ke Kaggle hanya sebagai dataset privat. Data pilot tidak pernah keluar dari laptop tim. | Lisensi dan UU PDP |
| D-12 | 2026-11-18 | Dua framing L1: (a) KT standar untuk pembanding pyKT, (b) diagnostik kuadran masa depan untuk produk dan E1/E2/E8. | Benchmark yang adil dan produk yang relevan |
| D-13 | 2026-11-18 | Kelompok fairness: Gender (1 vs 2), PremiumPupil (jika artinya terverifikasi), kuartil kemampuan. Atribut ini tidak dipakai sebagai fitur model. | SDG 10, menghindari diskriminasi langsung |
| D-14 | 2026-11-18 | Training DL berat di GPU Kaggle. Lokal hanya untuk tabular dan smoke test. | MacBook Air tanpa CUDA |
| D-15 | 2026-11-18 | Model produksi L1 dipilih dari CV (bukan test). Kalau seri, pilih yang lebih sederhana. | Mencegah overfitting pada test |
| D-16 | 2026-11-18 | MAP: 18 baris (0,049%) dengan prefiks True/False yang bertentangan dengan mayoritas pasangan (QuestionId, MC_Answer) — semuanya di Q31778 — **dipertahankan apa adanya** dan ditandai `prefix_conflict`. Label resmi tidak diubah. Kandidat (D-06) memakai prefiks dari Category. | Tidak mengubah label benchmark. Dampaknya sangat kecil dan dilaporkan di data card |
| D-17 | 2026-11-18 | **Gambar soal Eedi (`images/`) tidak dipakai sama sekali**, termasuk untuk demo dan slide. Revisi 02 §1 yang menyebutnya "boleh dipakai untuk demo". Demo memakai soal MAP (teks, MIT) atau soal buatan tim. | Wang dkk. 2020 (arXiv 2007.12061) §2.2: "The question images have been shared solely for the purpose of this competition and must not be used for any other purpose." |
| D-18 | 2026-11-19 | **Penerapan D-15 (bukan revisi):** model produksi L1 untuk probabilitas kuadran = **CO-KT ensemble 5 seed**. Di CV (217.480 baris E1, keduanya ensemble 5 seed) CO-KT lebih baik dari LightGBM: salah kelompok 0,347 vs 0,358 (selisih −0,011 [−0,013; −0,009]), macro-F1 0,480 vs 0,465 (+0,014 [+0,011; +0,018]); tidak seri. Alasan lokal (SHAP) diambil dari LightGBM ensemble sebagai **model penjelas terpisah**; hal ini diungkap di laporan dan kartu model. LightGBM juga menjadi fallback L1 bila CO-KT tidak dimuat. | Sumber `ml/reports/tables/L1_model_selection.csv`. Keputusan dari CV, test belum dibuka |
| D-19 | 2026-11-19 | **Penerapan 03 §5 untuk L2 (bukan revisi) + aturan input Indonesia (dikunci sebelum E4 mDeBERTa dijalankan).** (i) Di CV bahasa Inggris, mDeBERTa-v3-base **tidak lebih baik** dari TF-IDF: MAP@3 0,912 vs 0,916 (selisih −0,004 [−0,005; −0,002]); macro-F1 `category3` per soal 0,637 vs 0,611 (+0,026 [−0,035; +0,078], seri). Untuk input berbahasa Inggris, L2 produksi = **TF-IDF+LR** (lebih baik di MAP@3, seri di `category3` → yang lebih sederhana). (ii) Produk menerima alasan berbahasa Indonesia, jadi L2 untuk input Indonesia dipilih dengan E4 (fold 0 validasi CV, terjemahan mesin, bukan test): model dengan MAP@3 ID lebih tinggi, dengan CI bootstrap berpasangan selisih yang tidak memuat 0; jika memuat 0 → TF-IDF. Aturan ini ditulis sebelum E4 mDeBERTa dihitung; hasil E4 TF-IDF sudah diketahui (0,766). | Sumber `ml/reports/tables/L2_cv.csv`. Mencegah pemilihan model setelah melihat hasil |
| D-20 | 2026-11-19 | **Ambang `hidden_misconception` (03 §3 "ambang validasi").** Ambang = nilai p(True_Misconception) pada grid {0,05; 0,10; …; 0,95} yang memaksimalkan F1 pada baris kalibrasi CV MAP (20% baris, `calibration_groups`) yang jawabannya benar, setelah temperature scaling. Hasil: TF-IDF 0,20; mDeBERTa 0,25 (dipakai untuk input Indonesia). | Sumber `ml/reports/tables/L3_production_params.json`. Dihitung di validasi, bukan test |
| D-21 | 2026-11-19 | **Penerapan D-09 dan D-19 (ii) (bukan revisi).** (a) Titik operasi defer produksi dihitung pada siswa kalibrasi model CO-KT produksi (1.540 jendela, 630 siswa dengan label kuadran; tidak dipakai untuk training maupun early stopping): tidak ada titik grid yang menurunkan salah kelompok ≥ 25% dalam 30% → **fallback 20%**, ambang ragu 0,525. (Catatan: pada OOF CV, `l3_eval` final_cv menemukan 30% memenuhi aturan, sedangkan `e6_e8` final_cv tidak; nilainya di sekitar batas 25%. Yang dipakai adalah nilai dari model produksi.) (b) E4 (fold 0 validasi, input Indonesia terjemahan mesin): MAP@3 mDeBERTa 0,895 vs TF-IDF 0,766, selisih +0,129 [+0,121; +0,136], CI tidak memuat 0 → **L2 untuk input Indonesia = mDeBERTa-v3-base** (model fold 0); input Inggris tetap TF-IDF; TF-IDF juga fallback bila encoder tidak tersedia. | Sumber `ml/reports/tables/L3_production_params.json`, `ml/reports/tables/E4_crosslingual.csv` |
| D-22 | 2026-11-19 | **Protokol T36 (Tingkat A, dikunci sebelum dijalankan).** Retrieval zero-shot untuk soal baru: intfloat/multilingual-e5-base (MIT), `query: <alasan>` vs `passage: <deskripsi miskonsepsi>` dari `map_misconception_dictionary.csv`, kandidat = label miskonsepsi soal itu saja (2–4). Baris evaluasi = semua baris kategori *_Misconception (tidak ada pelatihan, jadi setiap soal adalah "soal baru"). Metrik: MAP@3 dan akurasi top-1; pembanding: acak (nilai harapan eksak) dan "label terbanyak di soal itu" (acuan atas yang butuh data berlabel soal tersebut). Bahasa: EN↔EN dan ID (terjemahan mesin)↔ID. CI: bootstrap klaster soal (15), 1000×. Tidak memakai Eedi test. | Hasil dilaporkan apa adanya walau kalah dari pembanding |
| D-23 | 2026-11-19 | **Protokol T35 (Tingkat A, dikunci sebelum dijalankan).** Student `microsoft/Multilingual-MiniLM-L12-H384` (MIT, tokenizer xlm-roberta-base) dilatih pada baris MAP fold_random ≠ 0 (teks Inggris) dengan loss 0,5·CE(label) + 0,5·KL(teacher, T = 2); teacher = logit OOF mDeBERTa (masking kandidat), 3 epoch, lr 5e-5, batch 32, max_len 192, seed 20261118, GPU Kaggle. Evaluasi fold 0 (baris yang sama dengan E4): MAP@3 EN dan ID (terjemahan mesin), dibandingkan dengan teacher fold 0 di `E4_crosslingual.csv`. Ekspor ONNX + kuantisasi dinamis int8 (onnxruntime). E7: ukuran (MB), latensi p50/p95 per alasan di CPU laptop (batch 1, 200 alasan), dan selisih MAP@3 FP32 vs int8. Tidak ada pemilihan model berdasarkan hasil ini. | Untuk mode offline (T68); dilaporkan apa adanya |
| D-24 | 2026-11-19 | **Pelengkap audit (bukan revisi), dihitung setelah test dibuka di T46, hanya CV.** Empat butir spesifikasi yang terlewat dihitung dengan `ml/scripts/gap_fill.py` dari file OOF CV yang sudah ada, tanpa melatih, memilih, atau mengkalibrasi ulang model produksi: (1) B0 framing (a) 03 §1, skor = kuadran B0 terakhir siswa di KC yang sama sebelum t (ordinal P=3, L=2, T=1, M=0, dan biner {P, L}); baris tanpa kuadran sebelumnya tidak punya skor B0 → dilaporkan pada subset yang punya skor + varian semua baris (nilai kosong = 1,5); (2) LAC biner L1 03 §3 dengan siswa kalibrasi dan temperature yang sama seperti `e6_e8 --calib temperature`; (3) akurasi kepala opsi CO-KT (T24) dengan pembanding acak dan opsi terbanyak per soal dari fold latih; (4) Gender kode 0 (04 E6, n ≥ 200 di siswa evaluasi CV); kode 3 di bawah ambang → hanya dihitung jumlahnya. Untuk test hanya jumlah siswa per kode dari metadata; tidak ada prediksi test yang dibaca. Hasil tidak mengubah angka utama, model, atau ambang mana pun. | Menutup kekurangan yang diungkap di `LAPORAN_REVIEW.md` §3/§14; test tetap dibuka sekali |

##### Catatan verifikasi data (diisi Claude Code saat T10–T13)
- [x] Nama dan kolom file Eedi sesuai 02_DATA_SPEC? **Ya.** Path di zip: `data/train_data/…`, `data/metadata/…`. Kolom answer_metadata: `AnswerId, DateAnswered, Confidence, GroupId, QuizId, SchemeOfWorkId` (kunci join AnswerId; tidak ada kolom UserId). 1.382.727 baris, 4.918 siswa, 948 soal, 57 KC terdalam. Tidak ada duplikat, tidak ada IsCorrect yang tidak konsisten, tidak ada percobaan ulang (attempt_no selalu 1). Confidence hanya {0,25,50,75,100} → CRI {0,1,3,4,5}.
- [x] Arti PremiumPupil terverifikasi dari paper? **Ya.** arXiv 2007.12061 §2.3: "PremiumPupil: Whether the student is eligible for free school meals or pupil premium due to being financially disadvantaged." Gender §2.3: "0 is unspecified, 1 is female, 2 is male and 3 is other." Confidence §2.4: "Percentage confidence score given for the answer. 0 means a random guess, 100 means total confidence." Catatan: PremiumPupil kosong untuk 57,0% siswa; analisis E6 hanya pada siswa yang terisi (0: 1.512, 1: 601).
- [x] Kolom MAP sesuai? **Ya**, persis `row_id, QuestionId, QuestionText, MC_Answer, StudentExplanation, Category, Misconception` (36.696 baris, 15 soal, 65 target, 35 label). Lisensi: **MIT** menurut kartu HF `kaggle-map/data` dan diskusi HF #2 (lihat `ml/data/raw/map/LICENSE_NOTE.md`). Tab Data Kaggle dicek Salman (M2): MIT, teks disalin ke LICENSE_NOTE.md.
- [x] Persentase confidence kosong di Eedi T3&4: **74,95% baris** (median per siswa 90,53%; 12,89% siswa tanpa confidence sama sekali). Sumber: `ml/reports/tables/data_card_eedi.md`.

### C. File di `ml/reports/tables/` (55) dan `ml/reports/figures/` (22)

**tables:** `.gitkeep`, `E0_eda_numbers.json`, `E0_self_calibration.csv`, `E1_b0_cv.csv`, `E1_b0_cv_confusion.csv`, `E1_b0_framing_a_cv.csv`, `E1_b0_test.csv`, `E1_cokt_test_per_class.csv`, `E1_confusion_cokt_test.csv`, `E1_confusion_test.csv`, `E2_ablation_cv.csv`, `E2_ablation_increments_cv.csv`, `E2_cokt_ablation_cv.csv`, `E3_queue_cv.csv`, `E3_true_misconception.csv`, `E4_crosslingual.csv`, `E4_crosslingual_mdeberta.csv`, `E4_crosslingual_tfidf.csv`, `E5_coverage_risk_L1_dev_b1.csv`, `E5_coverage_risk_L1_final_cv.csv`, `E5_coverage_risk_L1_test.csv`, `E5_l3_dev_b1.json`, `E5_l3_final_cv.json`, `E5_lac_binary_L1_cv.json`, `E5_test.json`, `E6_fairness.csv`, `E6_fairness_dev_b1.csv`, `E6_fairness_final_cv.csv`, `E6_fairness_gender_codes_cv.csv`, `E6_gender_counts.json`, `E7_efficiency.csv`, `E7_latency_service_cpu.json`, `E8_impact.csv`, `E8_impact_dev_b1.csv`, `E8_impact_final_cv.csv`, `L1_b0_b1_cv.csv`, `L1_cokt_cv.csv`, `L1_cokt_option_cv.csv`, `L1_cv_summary.csv`, `L1_lgbm_cv.csv`, `L1_model_selection.csv`, `L1_test.csv`, `L1_test_pairwise.csv`, `L2_b0_tfidf_cv.csv`, `L2_cv.csv`, `L3_production_params.json`, `T36_retrieval.csv`, `T36_retrieval_per_question.csv`, `T68_onnx_parity.json`, `compute_summary.csv`, `data_card_eedi.md`, `data_card_map.md`, `map_misconception_dictionary.csv`, `robustness_temporal_test.csv`, `translation_qa.csv`

**figures:** `.gitkeep`, `E0_confidence_distribution.png`, `E0_map_categories.png`, `E0_map_explanation_length.png`, `E0_missingness.png`, `E0_self_calibration.png`, `E0_sequence_length.png`, `E1_confusion_b0.png`, `E1_confusion_b0_cv.png`, `E1_confusion_cokt.png`, `E2_ablation.png`, `E3_pr_curve.png`, `E5_coverage_risk.png`, `E5_coverage_risk_dev_b1.png`, `E5_coverage_risk_final_cv.png`, `E5_reliability_L1.png`, `E5_reliability_L1_dev_b1.png`, `E5_reliability_L1_final_cv.png`, `E5_reliability_L2_dev_b1.png`, `E5_reliability_L2_final_cv.png`, `L1_shap_beeswarm.png`, `arsitektur.png`

### D. Salinan mentah (presisi penuh) tabel kunci

**L1_test.csv**
```
framing,model,metric,value,ci_lo,ci_hi,n_rows,ci_note
b,B0,macro_f1,0.39165256016375977,0.3798565057201543,0.4025690320410646,58963,1000 klaster siswa
b,B0,misgroup,0.45051981751267745,0.4314058295158637,0.4693469465572431,58963,1000 klaster siswa
b,B0,auc_needs_remediation,0.6312605348074924,0.6249357927677168,0.6374474937810761,226432,200 klaster siswa
b,B1a,macro_f1,0.18177991256948564,0.1758060931721933,0.18700594813936364,58963,1000 klaster siswa
b,B1a,misgroup,0.42876040907009483,0.40252555228823056,0.4577131479371643,58963,1000 klaster siswa
b,B1a,auc_needs_remediation,0.557552700148927,0.5541672615577481,0.5609890583749194,226432,200 klaster siswa
b,B1b,macro_f1,0.36023314648152877,0.3496607535189048,0.3701658415801542,58963,1000 klaster siswa
b,B1b,misgroup,0.40064107999932164,0.37957125738843683,0.4219688150517209,58963,1000 klaster siswa
b,B1b,auc_needs_remediation,0.7340860818543489,0.7252471985121307,0.7426200720583853,226432,200 klaster siswa
b,LightGBM,macro_f1,0.43328087291999645,0.4166629595214594,0.45014343263011547,58963,1000 klaster siswa
b,LightGBM,misgroup,0.361548767871377,0.342637842793434,0.37997970081631915,58963,1000 klaster siswa
b,LightGBM,auc_needs_remediation,0.7942984331395959,0.785763868326789,0.8025905080620004,226432,200 klaster siswa
b,CO-KT,macro_f1,0.44529844421194353,0.4315901464788193,0.4595018333885621,58963,1000 klaster siswa
b,CO-KT,misgroup,0.3474382239709648,0.3295495410993658,0.3657063001747214,58963,1000 klaster siswa
b,CO-KT,auc_needs_remediation,0.8009189958851743,0.7926084523756601,0.8086738531110799,226432,200 klaster siswa
a,B1a,auc_next_correct,0.6768393018460596,0.6709506505760279,0.6835915209183065,273217,200 klaster siswa; baris dengan prediksi CO-KT
a,B1b,auc_next_correct,0.7469234535347771,0.740011118050869,0.7525123969443541,273217,200 klaster siswa; baris dengan prediksi CO-KT
a,LightGBM,auc_next_correct,0.7945344855207211,0.7862863094441549,0.8013398686474749,273217,200 klaster siswa; baris dengan prediksi CO-KT
a,CO-KT,auc_next_correct,0.7962622671941377,0.7879989487759279,0.8028473035230375,273217,200 klaster siswa; baris dengan prediksi CO-KT
```

**L1_test_pairwise.csv**
```
perbandingan,selisih_salah_kelompok,ci_lo,ci_hi,p_mcnemar,selisih_auc_butuh_remediasi,p_delong,p_mcnemar_holm,p_delong_holm,selisih_auc_next_correct
CO-KT vs B0,-0.10308159354171259,-0.10913394930335055,-0.097159542645712,0.0,0.1696584610776819,0.0,0.0,0.0,
CO-KT vs B1b,-0.053202856028356726,-0.05860471615661095,-0.04794698355064453,2.7370296918025976e-204,0.0668329140308257,0.0,8.211089075407793e-204,0.0,
CO-KT vs LightGBM,-0.01411054390041211,-0.01761713258461055,-0.010550712404097478,4.865319687319217e-22,0.006620562745578651,9.324936703852413e-35,4.865319687319217e-22,1.8649873407704826e-34,
(a) CO-KT vs B1b,,,,,,0.0,,0.0,0.04933881365936088
(a) CO-KT vs LightGBM,,,,,,2.0736907927597464e-06,,2.0736907927597464e-06,0.0017277816734169171
```

**E1_b0_test.csv**
```
metrik,nilai,ci_lo,ci_hi,n_baris,split
tingkat salah kelompok (4 kelas),0.45051981751267745,0.4314058295158637,0.4693469465572431,58963,test (20% siswa)
macro-F1 (4 kelas),0.39165256016375977,0.3798565057201543,0.4025690320410646,58963,test (20% siswa)
% 'Paham' B0 yang belum tuntas berikutnya,0.27750966613044337,0.2568330619292642,0.2997204754882836,58963,test (20% siswa)
% 'Miskonsepsi' B0 yang tuntas berikutnya,0.5239560704803282,0.5040899299665569,0.5443361878171665,58963,test (20% siswa)
error biner butuh_remediasi,0.36723166336913515,0.3588173827589793,0.37553145768889223,226432,test (20% siswa)
```

**E8_impact.csv**
```
metrik,nilai
n_eval_rows,58963
n_eval_users,773
b0_misgroup,0.45051981751267745
ml_misgroup,0.34743822397096485
defer_rate,0.20560351406814442
ml_misgroup_kept,0.2831127241673783
b0_misgroup_on_kept,0.39225021349274125
errors_caught_by_defer,0.3526798789417163
ml_minus_b0_misgroup_ci,"[-0.10913394930335055, -0.097159542645712]"
teacher_reviews_per_class_32x15,98.7
system_misgroup_if_teacher_fixes_deferred,0.22490375320116004
```

**E6_fairness.csv**
```
atribut,kelompok_a,kelompok_b,metrik,nilai_a,nilai_b,selisih_a_minus_b,ci_lo,ci_hi,ci_memuat_0,n_siswa_a,n_siswa_b
Gender,perempuan,laki-laki,AUC butuh_remediasi,0.7934344265851278,0.8003526445381179,-0.006918217952990191,-0.032162642650786805,0.01589732821156141,True,294,303
Gender,perempuan,laki-laki,ECE,0.02366658815033886,0.03288168221791106,-0.009215094067572198,-0.018745125856413074,0.0027175174552260695,True,294,303
Gender,perempuan,laki-laki,salah kelompok,0.37439213381071984,0.3264860367153778,0.04790609709534205,0.004741099047196783,0.09274307153553595,False,294,303
Gender,perempuan,laki-laki,tingkat defer,0.23673382140757762,0.1698476259815903,0.06688619542598731,0.010663188602026896,0.12387534980052191,False,294,303
PremiumPupil,pupil premium,bukan,AUC butuh_remediasi,0.7330182275368754,0.8042588629943619,-0.07124063545748649,-0.0957332506054385,-0.048888626754113866,False,107,308
PremiumPupil,pupil premium,bukan,ECE,0.05093709056145225,0.018524495460474962,0.032412595100977284,0.018212825665395525,0.04449297359230775,False,107,308
PremiumPupil,pupil premium,bukan,salah kelompok,0.4489424607687059,0.3278215427813743,0.1211209179873316,0.07217178581229541,0.17294859190911957,False,107,308
PremiumPupil,pupil premium,bukan,tingkat defer,0.2926995678871958,0.17650729272287652,0.11619227516431929,0.028583848818651336,0.21159521335509268,False,107,308
ability_q,kuartil 1,kuartil 4,AUC butuh_remediasi,0.6382571670839947,0.7976453053079698,-0.15938813822397513,-0.1788501817023098,-0.138859513995341,False,246,246
ability_q,kuartil 1,kuartil 4,ECE,0.09249308410531257,0.026414718504666677,0.0660783656006459,0.059396811474812926,0.07367725301443569,False,246,246
ability_q,kuartil 1,kuartil 4,salah kelompok,0.5090024970429754,0.19470621556207837,0.31429628148089706,0.2833430371676397,0.34452378798116223,False,246,246
ability_q,kuartil 1,kuartil 4,tingkat defer,0.4482849257458273,0.059117359287295945,0.38916756645853134,0.3372104640458757,0.43544671960719983,False,246,246
PremiumPupil,pupil premium,bukan,"salah kelompok (B0 aturan v1, pembanding)",0.5262679099385945,0.4315965993292255,0.09467131060936901,0.036399465293405785,0.14942527427526947,False,107,308
ability_q,kuartil 1,kuartil 4,"salah kelompok (B0 aturan v1, pembanding)",0.6011302405046656,0.2938874298367578,0.30724281066790776,0.27346784417079556,0.3420231156930564,False,246,246
```

**E4_crosslingual.csv**
```
metric,EN,ID,selisih_ID_minus_EN,ci_lo,ci_hi,n,model,catatan,selisih
MAP@3,0.9159173478655767,0.7656448683015441,-0.15027247956403256,-0.1579263169845594,-0.14277815622161671,7340,B0 TF-IDF+LR,"terjemahan mesin opus-mt-en-id, bukan tulisan asli siswa",
macro-F1 category3,0.8390376956076606,0.6308255269982982,-0.20821216860936242,-0.22084627213571406,-0.19615553371529842,7340,B0 TF-IDF+LR,"terjemahan mesin opus-mt-en-id, bukan tulisan asli siswa",
recall True_Misconception,0.34177215189873417,0.012658227848101266,-0.3291139240506329,,,7340,B0 TF-IDF+LR,"terjemahan mesin opus-mt-en-id, bukan tulisan asli siswa",
MAP@3,0.9110127157129883,0.89452770208901,-0.01648501362397825,-0.020323001816530354,-0.012941076294277983,7340,M1 mDeBERTa-v3-base,"terjemahan mesin opus-mt-en-id, bukan tulisan asli siswa",
macro-F1 category3,0.8436701964878601,0.8117811805544237,-0.031889015933436404,-0.03965948783515115,-0.024365032334925405,7340,M1 mDeBERTa-v3-base,"terjemahan mesin opus-mt-en-id, bukan tulisan asli siswa",
recall True_Misconception,0.3037974683544304,0.20253164556962025,-0.10126582278481014,,,7340,M1 mDeBERTa-v3-base,"terjemahan mesin opus-mt-en-id, bukan tulisan asli siswa",
MAP@3 (input ID),,,,0.1210944595821981,0.1361495231607629,7340,selisih mDeBERTa − TF-IDF,,0.1288828337874659
macro-F1 category3 (input ID),,,,0.16801169385904577,0.19391403264925042,7340,selisih mDeBERTa − TF-IDF,,0.18095565355612553
```

**L2_cv.csv**
```
model,split,metric,value,ci_lo,ci_hi,fold_std,n,ci_unit
M1 mDeBERTa-v3-base,random (5-fold),MAP@3,0.9122838093161836,0.9100716018094616,0.9144686523508464,0.0019565130424788486,36696,
B0 TF-IDF+LR,random (5-fold),MAP@3,0.9159172661870504,0.9139866515878207,0.9179171435578808,0.0020970066462251535,36696,
selisih mDeBERTa − TF-IDF,random (5-fold),MAP@3,-0.0036334568708668025,-0.0054959441537680035,-0.0016937586294602628,,36696,
M1 mDeBERTa-v3-base,"per soal (5-fold, 3 soal/fold)",macro-F1 category3,0.6374931538366836,0.5838678277976769,0.684910892042141,0.06683192569786177,36696,soal (15 klaster)
B0 TF-IDF+LR,"per soal (5-fold, 3 soal/fold)",macro-F1 category3,0.6111698422028987,0.5421694563506536,0.6740347556268672,0.07855103593007821,36696,soal (15 klaster)
selisih mDeBERTa − TF-IDF,"per soal (5-fold, 3 soal/fold)",macro-F1 category3,0.026323311633784874,-0.03473958450288094,0.07810680818434268,,36696,soal (15 klaster)
```

### E. Versi library utama
```
fastapi==0.164.0
kaggle==2.2.5
lightgbm==4.7.0
numpy==2.5.5
onnx==1.23.2
onnxmltools==1.16.0
onnxruntime==1.32.0
optuna==5.1.0
pandas==3.1.1
pyarrow==26.0.1
scikit-learn==1.9.1
scipy==1.18.1
shap==0.54.1
statsmodels==0.15.0
torch==2.15.0
transformers==5.23.0
uvicorn==0.54.0
python 3.12.16 (ml/.venv)
next 14
react 18
@prisma/client ^6.10.1
prisma ^6.10.1
next-auth 5.0.0-beta.25
onnxruntime-web ^1.20.1
vitest ^4.1.10
@playwright/test ^1.48.0
```
