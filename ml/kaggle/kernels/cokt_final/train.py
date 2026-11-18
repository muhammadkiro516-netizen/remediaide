"""Kaggle GPU kernel: production CO-KT, 5 seeds, weights saved (T24, D-18)."""
import glob
import os
import subprocess
import sys

SRC = glob.glob("/kaggle/input/**/remediaide_ml/__init__.py", recursive=True)
ROOT = os.path.dirname(os.path.dirname(SRC[0]))
print(subprocess.run(["nvidia-smi"], capture_output=True, text=True).stdout)
data_dir = os.path.dirname(glob.glob("/kaggle/input/**/eedi_features_b.parquet", recursive=True)[0])
script = glob.glob("/kaggle/input/**/scripts/train_cokt_final.py", recursive=True)[0]
env = dict(os.environ, PYTHONPATH=ROOT)
cmd = [sys.executable, script, "--seeds", "20261118", "1", "2", "3", "4", "--data-dir", data_dir, "--out", "/kaggle/working"]
print(" ".join(cmd), flush=True)
subprocess.run(cmd, check=True, env=env)
print("DONE")
