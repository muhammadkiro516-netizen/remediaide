"""Prepare private Kaggle datasets + kernel metadata (03 §0). Needs Kaggle auth (M1).

  python scripts/kaggle_prepare.py --user <kaggle_username>
Creates kaggle/datasets/remediaide-ml-src/ (src + configs) and kaggle/datasets/remediaide-processed/
(MAP interim + splits; Eedi processed parquet if present — private only, D-11) and fills every
kaggle/kernels/*/kernel-metadata.template.json -> kernel-metadata.json. Then run:
  kaggle datasets create -p kaggle/datasets/<slug> --dir-mode zip   (first time; later: datasets version -m ...)
  kaggle kernels push -p kaggle/kernels/<name>
"""
import argparse
import json
import shutil

from remediaide_ml.paths import INTERIM, KAGGLE, ML_ROOT, PROCESSED

ap = argparse.ArgumentParser()
ap.add_argument("--user", required=True)
a = ap.parse_args()

ds = KAGGLE / "datasets"
src = ds / "remediaide-ml-src"
if src.exists():
    shutil.rmtree(src)
shutil.copytree(ML_ROOT / "src", src / "src", ignore=shutil.ignore_patterns("__pycache__", "*.egg-info"))
shutil.copytree(ML_ROOT / "configs", src / "configs")
proc = ds / "remediaide-processed"
proc.mkdir(parents=True, exist_ok=True)
for f in [INTERIM / "map.parquet", PROCESSED / "map_splits.parquet", PROCESSED / "eedi_features_b.parquet",
          PROCESSED / "eedi_features_a.parquet", PROCESSED / "eedi_splits.parquet", INTERIM / "map_candidates.json"]:
    if f.exists():
        shutil.copy(f, proc / f.name)
for d, title in [(src, "remediaide-ml-src"), (proc, "remediaide-processed")]:
    (d / "dataset-metadata.json").write_text(json.dumps(
        {"title": title, "id": f"{a.user}/{title}", "licenses": [{"name": "other"}]}, indent=1))
for t in KAGGLE.glob("kernels/*/kernel-metadata.template.json"):
    (t.parent / "kernel-metadata.json").write_text(t.read_text().replace("{USER}", a.user))
print("prepared", [p.name for p in proc.iterdir()])
