"""Kaggle GPU kernel: CO-KT full (5 seeds) + ablations no_conf / no_option (3 seeds). T23."""
import glob
import os
import subprocess
import sys

SRC = glob.glob("/kaggle/input/**/remediaide_ml/__init__.py", recursive=True)
ROOT = os.path.dirname(os.path.dirname(SRC[0]))
sys.path.insert(0, ROOT)
print(subprocess.run(["nvidia-smi"], capture_output=True, text=True).stdout)
data_dir = os.path.dirname(glob.glob("/kaggle/input/**/eedi_features_b.parquet", recursive=True)[0])
script = glob.glob("/kaggle/input/**/scripts/train_cokt.py", recursive=True)[0]
env = dict(os.environ, PYTHONPATH=ROOT)
plan = os.environ.get("RA_PLAN", "full:20261118,1,2,3,4;no_conf:20261118,1,2;no_option:20261118,1,2")
for item in plan.split(";"):
    variant, seeds = item.split(":")
    cmd = [sys.executable, script, "--variant", variant, "--seeds", *seeds.split(","), "--data-dir", data_dir,
           "--out", "/kaggle/working"]
    print(" ".join(cmd), flush=True)
    subprocess.run(cmd, check=True, env=env)
print("DONE")
