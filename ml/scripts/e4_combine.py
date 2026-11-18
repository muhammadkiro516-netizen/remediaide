"""T34: combine E4 tables (TF-IDF, mDeBERTa) + paired model difference on Indonesian input (D-19 ii).

  python scripts/e4_combine.py   (after e4_crosslingual.py --tfidf and --model ...)
Output: reports/tables/E4_crosslingual.csv
"""
import numpy as np
import pandas as pd

from remediaide_ml.eval import metrics as M
from remediaide_ml.paths import RUNS, TABLES
from remediaide_ml.seed import GLOBAL_SEED

CAT3 = ["Correct", "Misconception", "Neither"]
parts = []
for tag, name in (("tfidf", "B0 TF-IDF+LR"), ("mdeberta", "M1 mDeBERTa-v3-base")):
    t = pd.read_csv(TABLES / f"E4_crosslingual_{tag}.csv")
    t["model"] = name
    parts.append(t)
a = pd.read_parquet(RUNS / "e4" / "rows_mdeberta.parquet").set_index("row_id")
b = pd.read_parquet(RUNS / "e4" / "rows_tfidf.parquet").set_index("row_id").loc[a.index]
from remediaide_ml.paths import INTERIM

y3 = pd.read_parquet(INTERIM / "map.parquet", columns=["row_id", "category3"]).set_index("row_id").loc[a.index, "category3"].to_numpy()
rng = np.random.default_rng(GLOBAL_SEED)
n = len(a)
dm, df1 = [], []
for _ in range(1000):
    i = rng.integers(0, n, n)
    dm.append(a.rr_id.to_numpy()[i].mean() - b.rr_id.to_numpy()[i].mean())
    df1.append(M.macro_f1(y3[i], a.pred3_id.to_numpy()[i], labels=CAT3) - M.macro_f1(y3[i], b.pred3_id.to_numpy()[i], labels=CAT3))
rows = [{"metric": "MAP@3 (input ID)", "model": "selisih mDeBERTa − TF-IDF", "selisih": a.rr_id.mean() - b.rr_id.mean(),
         "ci_lo": float(np.quantile(dm, .025)), "ci_hi": float(np.quantile(dm, .975)), "n": n},
        {"metric": "macro-F1 category3 (input ID)", "model": "selisih mDeBERTa − TF-IDF",
         "selisih": M.macro_f1(y3, a.pred3_id, labels=CAT3) - M.macro_f1(y3, b.pred3_id, labels=CAT3),
         "ci_lo": float(np.quantile(df1, .025)), "ci_hi": float(np.quantile(df1, .975)), "n": n}]
out = pd.concat(parts + [pd.DataFrame(rows)], ignore_index=True)
out.to_csv(TABLES / "E4_crosslingual.csv", index=False)
print(out.drop(columns=["catatan"], errors="ignore").round(4).to_string())
