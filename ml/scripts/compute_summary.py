"""Compute budget table for REPORT (from stored run metadata): reports/tables/compute_summary.csv."""
import json

import pandas as pd

from remediaide_ml.paths import RUNS, TABLES

rows = []
m = RUNS / "20261118-2202_l2_mdeberta_kaggle" / "kaggle_output"
for task in ("target", "category3"):
    d = json.loads((m / f"metrics_{task}.json").read_text())
    rows.append({"komponen": f"mDeBERTa-v3-base, {task}, 5 fold", "perangkat": "GPU Kaggle",
                 "menit": round(sum(v["train_sec"] for v in d["folds"].values()) / 60, 1), "sumber": f"metrics_{task}.json"})
c = RUNS / "20261118-2202_cokt_kaggle" / "kaggle_output"
for v in ("full", "no_conf", "no_option"):
    d = json.loads((c / f"metrics_{v}.json").read_text())
    rows.append({"komponen": f"CO-KT CV {v}, {len({k.split('_')[0] for k in d})} seed x 5 fold", "perangkat": "GPU Kaggle",
                 "menit": round(sum(x["sec"] for x in d.values()) / 60, 1), "sumber": f"metrics_{v}.json"})
f = RUNS / "20261119-0620_cokt_final_kaggle" / "kaggle_output"
rows.append({"komponen": "CO-KT produksi, 5 seed", "perangkat": "GPU Kaggle",
             "menit": round(sum(json.loads(p.read_text())["sec"] for p in f.glob("report_seed*.json")) / 60, 1),
             "sumber": "report_seed*.json"})
out = pd.DataFrame(rows)
out.to_csv(TABLES / "compute_summary.csv", index=False)
print(out.to_string())
