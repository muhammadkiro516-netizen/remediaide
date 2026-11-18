"""T40 prep: CO-KT 5-seed ensemble OOF in the L3 format (same rows/labels as LightGBM oof_b_ens5).

  python scripts/cokt_oof_export.py --cokt runs/20261118-2202_cokt_kaggle/kaggle_output \
      --like runs/20261118-2205_l1_lgbm/oof_b_ens5.parquet --out runs/20261118-2202_cokt_kaggle/oof_b_ens5.parquet
p4_* = mean over seeds of the quadrant head; p_bin (needs remediation = future not mastered) = p4_M + p4_T.
"""
import argparse
from pathlib import Path

import pandas as pd

from remediaide_ml.paths import ML_ROOT

import importlib.util

spec = importlib.util.spec_from_file_location("ce", ML_ROOT / "scripts" / "cokt_eval.py")
ce = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ce)

ap = argparse.ArgumentParser()
ap.add_argument("--cokt", type=Path, required=True)
ap.add_argument("--like", type=Path, required=True)
ap.add_argument("--out", type=Path, required=True)
a = ap.parse_args()
ens, n = ce.ensemble(a.cokt, "full")
like = pd.read_parquet(a.like, columns=["AnswerId", "UserId", "fold", "y4", "y_bin", "e1_row"])
p = ens[ce.PQ].rename(columns=lambda c: c.replace("pq_", "p4_"))
o = like.merge(p, left_on="AnswerId", right_index=True, how="left", validate="one_to_one")
miss = o.p4_P.isna().mean()
assert miss < 1e-3, f"{miss:.4%} rows without CO-KT prediction"
o = o.dropna(subset=["p4_P"])
o["p_bin"] = o.p4_M + o.p4_T
o.to_parquet(a.out, index=False)
print(f"{n} seeds, {len(o):,} rows (missing {miss:.4%}) -> {a.out}")
