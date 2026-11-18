"""T24 (per 03 §1): LightGBM 5-seed ensemble for framing (b) with the Optuna params of the T22 run (no re-tuning).

  python scripts/train_l1_lgbm_seeds.py --run runs/20261118-2205_l1_lgbm
Seed 20261118 is reused from the run's OOF; seeds 1-4 are trained here on the same 5 folds and full S6 feature set.
Writes <run>/oof_b_ens5.parquet (mean probabilities) and <run>/models_seed<s>_b4_fold<k>.txt / _bbin_.
"""
import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from remediaide_ml.l1.common import iter_folds, load, quad_labels
from remediaide_ml.l1.lgbm import ALL_B, fit_predict
from remediaide_ml.seed import ENSEMBLE_SEEDS

ap = argparse.ArgumentParser()
ap.add_argument("--run", type=Path, required=True)
a = ap.parse_args()
m = json.loads((a.run / "metrics.json").read_text())["b"]
p4, pb = m["params_4class"], m["params_binary"]
base = pd.read_parquet(a.run / "oof_b.parquet").set_index("AnswerId")
df = load("b")
df = df[df.needs_remediation.notna()].reset_index(drop=True)
y4 = quad_labels(df.fut_quadrant)
yb = df.needs_remediation.astype(int).to_numpy()
acc4 = {s: np.full((len(df), 4), np.nan) for s in ENSEMBLE_SEEDS[1:]}
accb = {s: np.full(len(df), np.nan) for s in ENSEMBLE_SEEDS[1:]}
for k, d, tr, va in iter_folds(df):
    ltr, lva = tr[y4[tr] >= 0], va[y4[va] >= 0]
    for s in ENSEMBLE_SEEDS[1:]:
        pr4, b4 = fit_predict(d.iloc[ltr][ALL_B], y4[ltr], d.iloc[lva][ALL_B], y4[lva], p4, "multiclass", s)
        acc4[s][lva] = pr4
        prb, bb = fit_predict(d.iloc[tr][ALL_B], yb[tr], d.iloc[va][ALL_B], yb[va], pb, "binary", s)
        accb[s][va] = prb
        b4.save_model(str(a.run / f"models_seed{s}_b4_fold{k}.txt"))
        bb.save_model(str(a.run / f"models_seed{s}_bbin_fold{k}.txt"))
        print(f"fold {k} seed {s} done", flush=True)
b = base.loc[df.AnswerId]
P4 = np.stack([b[["p4_P", "p4_L", "p4_M", "p4_T"]].to_numpy()] + [acc4[s] for s in acc4]).mean(0)
PB = np.stack([b.p_bin.to_numpy()] + [accb[s] for s in accb]).mean(0)
out = b.reset_index()[["AnswerId", "UserId", "fold", "y4", "y_bin", "e1_row"]].copy()
out[["p4_P", "p4_L", "p4_M", "p4_T"]] = P4
out["p_bin"] = PB
out.to_parquet(a.run / "oof_b_ens5.parquet", index=False)
print("DONE", len(out))
