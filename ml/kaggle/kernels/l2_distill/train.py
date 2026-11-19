"""Kaggle GPU kernel: T35 distillation mDeBERTa -> Multilingual-MiniLM (D-23)."""
import glob
import os
import subprocess
import sys

SRC = glob.glob("/kaggle/input/**/remediaide_ml/__init__.py", recursive=True)
ROOT = os.path.dirname(os.path.dirname(SRC[0]))
print(subprocess.run(["nvidia-smi"], capture_output=True, text=True).stdout)
data_dir = os.path.dirname(glob.glob("/kaggle/input/**/map_id.parquet", recursive=True)[0])
teacher = os.path.dirname(glob.glob("/kaggle/input/**/teacher/oof_target_fold0.parquet", recursive=True)[0])
script = glob.glob("/kaggle/input/**/scripts/t35_distill.py", recursive=True)[0]
cmd = [sys.executable, script, "--teacher", teacher, "--data-dir", data_dir, "--out", "/kaggle/working"]
print(" ".join(cmd), flush=True)
subprocess.run(cmd, check=True, env=dict(os.environ, PYTHONPATH=ROOT))
print("DONE")
