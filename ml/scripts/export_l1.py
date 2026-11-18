"""T24: consolidate Layer 1 (D-18) -> models/ artefacts + reports/tables/L1_cv_summary.csv.

  python scripts/export_l1.py --lgbm runs/20261118-2205_l1_lgbm [--cokt-final runs/<id>_cokt_final_kaggle/kaggle_output]
- LightGBM explainer/fallback: the 5 fold models of seed 20261118 for framing (b) 4-class and binary are copied to
  models/l1_lgbm_v1/ (prediction = mean over folds); feature order in models/l1_features_v1.json.
- CO-KT production weights (5 seeds) copied to models/l1_cokt_v1/ when --cokt-final is given.
- L1_cv_summary.csv: one row per (framing, model, metric) from the CV tables already produced (no new numbers).
Large binaries are git-ignored; models/README.md says how to regenerate or fetch them.
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import lightgbm as lgb
import pandas as pd

from remediaide_ml.l1.lgbm import ALL_B
from remediaide_ml.paths import MODELS, TABLES


def summary() -> pd.DataFrame:
    rows = []
    b1 = pd.read_csv(TABLES / "L1_b0_b1_cv.csv")
    names = {"B0_bin": "B0 aturan v1", "B0_4": "B0 aturan v1", "B1a_bin": "B1a (akurasi saja)", "B1a_4": "B1a (akurasi saja)",
             "B1b_bin": "B1b (akurasi + keyakinan)", "B1b_4": "B1b (akurasi + keyakinan)"}
    for r in b1.itertuples():
        rows.append({"framing": r.framing, "model": names.get(r.model, r.model), "metric": r.metric, "value": r.value,
                     "ci_lo": r.ci_lo, "ci_hi": r.ci_hi, "sumber": "L1_b0_b1_cv.csv"})
    for r in pd.read_csv(TABLES / "L1_lgbm_cv.csv").itertuples():
        rows.append({"framing": r.framing, "model": "B2 LightGBM (1 seed)", "metric": r.metric, "value": r.value,
                     "ci_lo": r.ci_lo, "ci_hi": r.ci_hi, "sumber": "L1_lgbm_cv.csv"})
    ck = pd.read_csv(TABLES / "L1_cokt_cv.csv")
    for r in ck[ck.model.str.startswith("M1")].itertuples():
        rows.append({"framing": r.framing, "model": "M1 CO-KT (ensemble 5 seed)", "metric": r.metric, "value": r.value,
                     "ci_lo": r.ci_lo, "ci_hi": r.ci_hi, "sumber": "L1_cokt_cv.csv"})
    sel = pd.read_csv(TABLES / "L1_model_selection.csv")
    for r in sel.itertuples():
        metric = {"salah kelompok": "misgroup", "macro-F1": "macro_f1"}[r.metrik]
        rows.append({"framing": "b", "model": "B2 LightGBM (ensemble 5 seed)", "metric": metric, "value": r.lgbm,
                     "ci_lo": None, "ci_hi": None, "sumber": "L1_model_selection.csv"})
        rows.append({"framing": "b", "model": "selisih CO-KT − LightGBM (ensemble)", "metric": metric,
                     "value": r.selisih_cokt_minus_lgbm, "ci_lo": r.ci_lo, "ci_hi": r.ci_hi, "sumber": "L1_model_selection.csv"})
    out = pd.DataFrame(rows)
    out["produksi"] = out.model.eq("M1 CO-KT (ensemble 5 seed)")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lgbm", type=Path, required=True)
    ap.add_argument("--cokt-final", type=Path, default=None)
    a = ap.parse_args()
    dst = MODELS / "l1_lgbm_v1"
    dst.mkdir(parents=True, exist_ok=True)
    files = {}
    for task in ("b4", "bbin"):
        for k in range(5):
            src = a.lgbm / f"model_{task}_fold{k}.txt"
            shutil.copy2(src, dst / src.name)
            files.setdefault(task, []).append(src.name)
    order = lgb.Booster(model_file=str(dst / "model_b4_fold0.txt")).feature_name()
    assert set(order) == set(ALL_B), "exported model features differ from ALL_B"
    (MODELS / "l1_features_v1.json").write_text(json.dumps(
        {"features": order, "models": files, "source_run": a.lgbm.name, "seed": 20261118,
         "role": "explainer (SHAP) + fallback L1 (D-18)", "classes_b4": ["P", "L", "M", "T"]}, indent=2))
    if a.cokt_final:
        cd = MODELS / "l1_cokt_v1"
        cd.mkdir(parents=True, exist_ok=True)
        pts = sorted(a.cokt_final.glob("cokt_final_seed*.pt"))
        for p in pts:
            shutil.copy2(p, cd / p.name)
        (cd / "manifest.json").write_text(json.dumps(
            {"weights": [p.name for p in pts], "source": str(a.cokt_final), "role": "L1 quadrant probabilities (D-18)",
             "ensemble": "mean of seed probabilities"}, indent=2))
    TABLES.mkdir(parents=True, exist_ok=True)
    s = summary()
    s.to_csv(TABLES / "L1_cv_summary.csv", index=False)
    print(s.round(4).to_string())


if __name__ == "__main__":
    main()
