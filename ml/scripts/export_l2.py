"""T43: production L2 artefact (D-19) = TF-IDF+LR (C=10, chosen in T30) refit on all MAP rows (English template).

  python scripts/export_l2.py
Temperature comes from the CV OOF calibration part (models/l3_conformal_v1.json, run l3_production.py first).
Also copies the mDeBERTa fold-0 model (D-19, Indonesian input) to models/l2_mdeberta_v1/ when --mdeberta is given. Candidates from all rows.
Outputs models/l2_tfidf_v1.joblib (git-ignored) and models/misconception_dictionary.json (label -> Indonesian text).
"""
import argparse
import json
import shutil
from pathlib import Path

import joblib
import pandas as pd

from remediaide_ml.data.map import build_candidates
from remediaide_ml.l2.tfidf import TfidfLR, build_text
from remediaide_ml.paths import INTERIM, MODELS, TABLES
from remediaide_ml.seed import GLOBAL_SEED

ap = argparse.ArgumentParser()
ap.add_argument("--mdeberta", type=Path, default=None, help="kaggle_output/model_target_fold0")
a = ap.parse_args()
m = pd.read_parquet(INTERIM / "map.parquet")
params = json.loads((MODELS / "l3_conformal_v1.json").read_text())  # from scripts/l3_production.py
model = TfidfLR(C=10.0, seed=GLOBAL_SEED).fit(build_text(m, "en"), m.target.to_numpy())
MODELS.mkdir(parents=True, exist_ok=True)
joblib.dump({"model": model, "candidates": build_candidates(m), "temperature": params["l2_tfidf"]["temperature"],
             "C": 10.0, "n_rows": len(m), "decision": "D-19"}, MODELS / "l2_tfidf_v1.joblib", compress=3)
d = pd.read_csv(TABLES / "map_misconception_dictionary.csv")
(MODELS / "misconception_dictionary.json").write_text(
    json.dumps(dict(zip(d.label, d.deskripsi_id, strict=True)), indent=1, ensure_ascii=False))
print("ok", len(m), "rows,", len(model.classes_), "classes")
if a.mdeberta:
    dst = MODELS / "l2_mdeberta_v1"
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(a.mdeberta, dst)
    (dst / "provenance.json").write_text(json.dumps({"source": str(a.mdeberta), "trained_on": "MAP fold_random != 0 (80%)",
                                                      "decision": "D-19 (ii)", "temperature": params["l2_mdeberta"]["temperature"]}))
    print("copied mDeBERTa ->", dst)
