"""Kaggle GPU kernel: L2 mDeBERTa, 5-fold random (target) + 5-fold per question (category3). T31.

Inputs (private datasets): <user>/remediaide-ml-src (src/), <user>/remediaide-processed (map.parquet, map_splits.parquet).
Outputs in /kaggle/working/: oof_*_fold*.parquet, metrics_*.json, model_target_fold0/ (best fold kept later).
"""
import glob
import os
import subprocess
import sys

SRC = glob.glob("/kaggle/input/**/remediaide_ml/__init__.py", recursive=True)
sys.path.insert(0, os.path.dirname(os.path.dirname(SRC[0])))
print(subprocess.run(["nvidia-smi"], capture_output=True, text=True).stdout)

from pathlib import Path  # noqa: E402

import pandas as pd  # noqa: E402

from remediaide_ml.l2.encoder import DEFAULTS, run  # noqa: E402
from remediaide_ml.seed import set_seed  # noqa: E402

data = glob.glob("/kaggle/input/**/map.parquet", recursive=True)[0]
splits = glob.glob("/kaggle/input/**/map_splits.parquet", recursive=True)[0]
df, sp = pd.read_parquet(data), pd.read_parquet(splits)
out = Path("/kaggle/working")
seed = set_seed()
TASKS = os.environ.get("RA_TASKS", "target,category3").split(",")
for task in TASKS:
    run(df, sp, task, [0, 1, 2, 3, 4], out, DEFAULTS.copy(), seed, save_model_fold=0 if task == "target" else None)
print("DONE")
