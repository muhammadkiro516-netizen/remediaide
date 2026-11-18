"""T24 / D-15: paired comparison CO-KT (seed ensemble) vs LightGBM on identical E1 rows (CV), user-cluster bootstrap.

Output: reports/tables/L1_model_selection.csv. Decision rule D-15: choose by CV; if the CI of the difference contains 0
(tie), choose the simpler model (LightGBM).
"""
import json

import numpy as np
import pandas as pd

from remediaide_ml.eval import stats as S
from remediaide_ml.paths import PROCESSED, RUNS, TABLES

COKT = RUNS / "20261118-2202_cokt_kaggle/kaggle_output"
LGBM = RUNS / "20261118-2205_l1_lgbm"
PQ = ["pq_P", "pq_L", "pq_M", "pq_T"]
q = {"P": 0, "L": 1, "M": 2, "T": 3}

parts = [pd.read_parquet(f, columns=["AnswerId", *PQ]).dropna().groupby("AnswerId").first()
         for f in sorted(COKT.glob("oof_full_seed*.parquet"))]
ck = pd.concat(parts, keys=range(len(parts))).groupby(level="AnswerId").mean()
lb = pd.read_parquet(LGBM / "oof_b.parquet").set_index("AnswerId")
meta = pd.read_parquet(PROCESSED / "eedi_features_b.parquet", columns=["AnswerId", "UserId", "has_conf", "fut_quadrant"]).set_index("AnswerId")
d = meta[meta.has_conf & meta.fut_quadrant.notna()].join(ck, how="inner").join(lb[["p4_P", "p4_L", "p4_M", "p4_T"]], how="inner")
y = d.fut_quadrant.astype(str).map(q).to_numpy()
pc = d[PQ].to_numpy().argmax(1)
pl = d[["p4_P", "p4_L", "p4_M", "p4_T"]].to_numpy().argmax(1)
u = d.UserId.to_numpy()
_, cc = S.cluster_confusion_counts(y, pc, u, [0, 1, 2, 3])
_, cl = S.cluster_confusion_counts(y, pl, u, [0, 1, 2, 3])
rng = np.random.default_rng(20261118)
n = cc.shape[0]
fc, fl = cc.reshape(n, -1).astype(float), cl.reshape(n, -1).astype(float)
dm, df1 = [], []
for _ in range(1000):
    w = rng.multinomial(n, np.full(n, 1 / n))
    a, b = (w @ fc).reshape(4, 4), (w @ fl).reshape(4, 4)
    dm.append(S.cm_misgroup(a) - S.cm_misgroup(b))
    df1.append(S.cm_macro_f1(a) - S.cm_macro_f1(b))
rows = []
for name, f, boots in (("salah kelompok", S.cm_misgroup, dm), ("macro-F1", S.cm_macro_f1, df1)):
    lo, hi = np.quantile(boots, [.025, .975])
    rows.append({"metrik": name, "cokt": f(cc.sum(0)), "lgbm": f(cl.sum(0)), "selisih_cokt_minus_lgbm": f(cc.sum(0)) - f(cl.sum(0)),
                 "ci_lo": lo, "ci_hi": hi, "seri": bool(lo <= 0 <= hi), "n_baris": len(d), "n_siswa": n,
                 "catatan": f"CO-KT ensemble {len(parts)} seed vs LightGBM 1 seed"})
pd.DataFrame(rows).to_csv(TABLES / "L1_model_selection.csv", index=False)
print(json.dumps(rows, indent=2, default=float))
