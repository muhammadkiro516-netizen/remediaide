# REVIEW_INDEX — tautan bukti RemediAide 2.0

Semua tautan memakai commit **`9933006`** (`9933006f98070ab41cc38c470d7d66118103561d`) di branch `main` (= `feat/ml-integration`), supaya isi yang dibaca
reviewer tidak berubah. File ini sendiri ditambahkan pada commit sesudahnya; isi berkas lain identik.

## Dokumen utama
| Berkas | Isi |
| --- | --- |
| [README.md](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/README.md) | halaman depan repo: angka utama, cara menjalankan, struktur |
| [ml/REPORT.md](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/ml/REPORT.md) | laporan teknis, bab dipetakan ke 5 kriteria penilaian |
| [ml/reports/RESULTS.md](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/ml/reports/RESULTS.md) | semua hasil E1–E8 dengan CI dan path sumber |
| [docs/cac/LAPORAN_REVIEW.md](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/docs/cac/LAPORAN_REVIEW.md) | audit lengkap v5: penyimpangan, yang belum, risiko |
| [docs/cac/AUDIT_2026-11-20.md](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/docs/cac/AUDIT_2026-11-20.md) | hasil /verifikasi 20 Nov |
| [ml/MODEL_CARD.md](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/ml/MODEL_CARD.md) | kartu model |
| [ml/DATA_CARD.md](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/ml/DATA_CARD.md) | kartu data |
| [docs/cac/DECISIONS.md](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/docs/cac/DECISIONS.md) | keputusan terkunci D-01 s.d. D-28 |
| [docs/cac/SECURITY_NOTES.md](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/docs/cac/SECURITY_NOTES.md) | pemindaian rahasia + tindakan keamanan |
| [docs/cac/MANUAL_ACTIONS.md](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/docs/cac/MANUAL_ACTIONS.md) | tindakan manual pemilik repo (M16 keamanan, M17 HF Space) |

## Perubahan versi 5 (putaran final)
| Bagian | Tautan |
| --- | --- |
| LAPORAN_REVIEW §0d (ringkasan v5) | [docs/cac/LAPORAN_REVIEW.md#L203](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/docs/cac/LAPORAN_REVIEW.md#L203) |
| DECISIONS D-27/D-28 (hosting layanan ML) | [docs/cac/DECISIONS.md#L35](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/docs/cac/DECISIONS.md#L35) |
| SECURITY_NOTES: rotasi password seed | [docs/cac/SECURITY_NOTES.md#L37](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/docs/cac/SECURITY_NOTES.md#L37) |
| CEK_RULEBOOK (syarat submisi) | [docs/cac/CEK_RULEBOOK.md#L18](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/docs/cac/CEK_RULEBOOK.md#L18) |
| FORMULIR_SUBMISI (teks siap salin) | [docs/cac/FORMULIR_SUBMISI.md#L6](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/docs/cac/FORMULIR_SUBMISI.md#L6) |
| NASKAH_VIDEO | [docs/cac/NASKAH_VIDEO.md#L7](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/docs/cac/NASKAH_VIDEO.md#L7) |
| README: GIF demo | [README.md#L18](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/README.md#L18) |
| seed kelas demo juri | [scripts/seed-demo-judge.ts#L50](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/scripts/seed-demo-judge.ts#L50) |
| tes e2e akun juri | [tests/e2e/judge.spec.ts#L14](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/tests/e2e/judge.spec.ts#L14) |
| dataset terbuka MAP-ID | https://huggingface.co/datasets/avlfarizii/remediaide-map-id (cermin https://www.kaggle.com/datasets/avlsalmoon/remediaide-map-id) |
| GitHub Release | https://github.com/muhammadkiro516-netizen/remediaide/releases/tag/v1.0-cac-penyisihan |

## Perubahan versi 4 (review eksternal, D-26)
| Bagian | Tautan |
| --- | --- |
| README: tabel recall per kuadran | [README.md#L91](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/README.md#L91) |
| README: kalimat pembanding B1b dan B1a | [README.md#L47](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/README.md#L47) |
| REPORT §4.2: recall per kuadran (test + CV) | [ml/REPORT.md#L258](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/ml/REPORT.md#L258) |
| REPORT §4.7: mitigasi miskonsepsi (defer + mode prioritas) | [ml/REPORT.md#L400](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/ml/REPORT.md#L400) |
| RESULTS E1: recall per kuadran | [ml/reports/RESULTS.md#L72](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/ml/reports/RESULTS.md#L72) |
| RESULTS: mitigasi miskonsepsi | [ml/reports/RESULTS.md#L228](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/ml/reports/RESULTS.md#L228) |
| DECISIONS D-26 (aturan dikunci sebelum dihitung) | [docs/cac/DECISIONS.md#L33](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/docs/cac/DECISIONS.md#L33) |
| LAPORAN_REVIEW §0c (ringkasan v4) | [docs/cac/LAPORAN_REVIEW.md#L118](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/docs/cac/LAPORAN_REVIEW.md#L118) |
| tes yang di-skip tanpa torch | [ml/tests/test_bundle.py#L47](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/ml/tests/test_bundle.py#L47) |
| TESTING_GUIDE tanpa password literal | [docs/TESTING_GUIDE.md#L11](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/docs/TESTING_GUIDE.md#L11) |
| tabel `E1_recall_per_class_test.csv` | [ml/reports/tables/E1_recall_per_class_test.csv](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/ml/reports/tables/E1_recall_per_class_test.csv) |
| tabel `E1_correct_by_class_test.csv` | [ml/reports/tables/E1_correct_by_class_test.csv](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/ml/reports/tables/E1_correct_by_class_test.csv) |
| tabel `E1_recall_per_class_cv.csv` | [ml/reports/tables/E1_recall_per_class_cv.csv](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/ml/reports/tables/E1_recall_per_class_cv.csv) |
| tabel `E5_postseal_defer_misconception_cv.json` | [ml/reports/tables/E5_postseal_defer_misconception_cv.json](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/ml/reports/tables/E5_postseal_defer_misconception_cv.json) |
| tabel `E8_misconception_priority_cv.csv` | [ml/reports/tables/E8_misconception_priority_cv.csv](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/ml/reports/tables/E8_misconception_priority_cv.csv) |
| tabel `E8_misconception_priority_grid_cv.csv` | [ml/reports/tables/E8_misconception_priority_grid_cv.csv](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/ml/reports/tables/E8_misconception_priority_grid_cv.csv) |
| tabel `headline.json` | [ml/reports/tables/headline.json](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/ml/reports/tables/headline.json) |
| skrip `postseal_cv.py` | [ml/scripts/postseal_cv.py](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/ml/scripts/postseal_cv.py) |

## Folder bukti
| Folder | Isi |
| --- | --- |
| [ml/reports/figures/](https://github.com/muhammadkiro516-netizen/remediaide/tree/9933006f98070ab41cc38c470d7d66118103561d/ml/reports/figures) | semua gambar (mis. [E8_v1_vs_ml.png](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/ml/reports/figures/E8_v1_vs_ml.png)) |
| [ml/reports/tables/](https://github.com/muhammadkiro516-netizen/remediaide/tree/9933006f98070ab41cc38c470d7d66118103561d/ml/reports/tables) | semua tabel sumber angka (mis. [headline.json](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/ml/reports/tables/headline.json)) |
| [ml/kaggle/evidence/](https://github.com/muhammadkiro516-netizen/remediaide/tree/9933006f98070ab41cc38c470d7d66118103561d/ml/kaggle/evidence) | log + metrik kernel GPU Kaggle (kernel privat) |
| [ml/kaggle/kernels/](https://github.com/muhammadkiro516-netizen/remediaide/tree/9933006f98070ab41cc38c470d7d66118103561d/ml/kaggle/kernels) | kode kernel Kaggle + metadata template |

## Pilot (Tingkat B; belum ada data siswa)
| Berkas | Isi |
| --- | --- |
| [docs/cac/pilot/PANDUAN_SESI.md](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/docs/cac/pilot/PANDUAN_SESI.md) | panduan sesi langkah demi langkah |
| [docs/cac/pilot/consent_form.pdf](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/docs/cac/pilot/consent_form.pdf) | formulir persetujuan orang tua/wali (A4, 1 halaman) |
| [docs/cac/pilot/figures/map-31772.svg](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/docs/cac/pilot/figures/map-31772.svg) | gambar soal digambar ulang (cek guru) |
| [docs/cac/pilot/figures/map-76870.svg](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/docs/cac/pilot/figures/map-76870.svg) | gambar soal digambar ulang (cek guru) |
| [docs/cac/pilot/figures/map-91695.svg](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/docs/cac/pilot/figures/map-91695.svg) | gambar soal digambar ulang (cek guru) |
| [docs/cac/pilot/instrument_map_id.json](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/docs/cac/pilot/instrument_map_id.json) | instrumen 15 soal (data) |
| [docs/cac/pilot/instrument_map_id.md](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/docs/cac/pilot/instrument_map_id.md) | instrumen 15 soal (untuk dibaca guru) |
| [docs/cac/pilot/labeling_sheet.xlsx](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/docs/cac/pilot/labeling_sheet.xlsx) | lembar pelabelan dengan dropdown rubrik |
| [docs/cac/pilot/teacher_info.pdf](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/docs/cac/pilot/teacher_info.pdf) | lembar informasi guru |

Skrip terkait: [ml/scripts/pilot_analysis.py](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/ml/scripts/pilot_analysis.py), [ml/scripts/pilot_materials.py](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/ml/scripts/pilot_materials.py), [scripts/seed-pilot-instrument.ts](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/scripts/seed-pilot-instrument.ts), [tests/e2e/pilot-dry-run.spec.ts](https://github.com/muhammadkiro516-netizen/remediaide/blob/9933006f98070ab41cc38c470d7d66118103561d/tests/e2e/pilot-dry-run.spec.ts).
