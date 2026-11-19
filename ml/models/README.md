# Artefak model produksi (`ml/models/`)

File biner besar tidak masuk git. Cara membuat ulang atau mengambilnya:

| Artefak | Isi | Cara membuat / mengambil |
|---|---|---|
| `l1_features_v1.json` | urutan fitur + daftar file model LightGBM | `python scripts/export_l1.py --lgbm runs/20261118-2205_l1_lgbm` (masuk git) |
| `l1_lgbm_v1/` | 5 model fold LightGBM (seed 20261118) untuk kuadran 4 kelas (`b4`) dan biner (`bbin`); peran: **model penjelas (SHAP) + fallback** (D-18) | `python scripts/train_l1_lgbm.py` lalu `export_l1.py` |
| `l1_cokt_v1/` | bobot CO-KT produksi 5 seed (`cokt_final_seed<s>.pt`: state_dict + cfg + vocab); peran: **probabilitas kuadran L1** (D-18) | kernel Kaggle privat `remediaide-cokt-final` (`scripts/train_cokt_final.py`), unduh output lalu `export_l1.py --cokt-final <dir>` |
| `l1_calibrator_v1.joblib`, `l3_conformal_v1.json` | kalibrator isotonic + ambang conformal/defer | `python scripts/l3_eval.py ... --write-models` (T40–T42) |
| `l2_mdeberta_v1/` | encoder mDeBERTa-v3 (format HF) | kernel Kaggle privat `remediaide-l2-mdeberta` |

Model dilatih hanya pada siswa CV (80%); siswa test tidak pernah dipakai untuk melatih atau memilih model.
| `l2_student_v1/` | MiniLM-L12 student int8 ONNX (118 MB) — Lapis 2 ringan (Tingkat A, D-23) | kernel Kaggle `remediaide-l2-distill` (`scripts/t35_distill.py`), lalu `scripts/e7_efficiency.py` |
| `l1_onnx_v1/` | LightGBM fold 0 (b4, bbin) dalam ONNX untuk browser (T68) | `scripts/export_l1_onnx.py --web-dir <repo web>` |
