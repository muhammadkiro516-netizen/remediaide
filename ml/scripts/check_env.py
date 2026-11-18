"""Environment check. Run: python scripts/check_env.py  (writes runs/env_report.json)

Decides where each training job should run (see docs/cac/03_MODEL_SPEC.md, "Compute plan").
"""

import json
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

report: dict = {
    "python": sys.version.split()[0],
    "platform": platform.platform(),
    "machine": platform.machine(),
    "cpu_count": os.cpu_count(),
}

try:
    import psutil  # optional

    report["ram_gb"] = round(psutil.virtual_memory().total / 1e9, 1)
except Exception:
    if sys.platform == "darwin":
        try:
            report["ram_gb"] = round(int(subprocess.check_output(["sysctl", "-n", "hw.memsize"])) / 1e9, 1)
        except Exception:
            report["ram_gb"] = None

report["disk_free_gb"] = round(shutil.disk_usage(Path.cwd()).free / 1e9, 1)

for mod in ("numpy", "pandas", "sklearn", "lightgbm", "optuna", "shap", "torch", "transformers"):
    try:
        m = __import__(mod)
        report[f"{mod}_version"] = getattr(m, "__version__", "ok")
    except Exception as e:  # noqa: BLE001
        report[f"{mod}_version"] = f"MISSING ({type(e).__name__}: {e})"[:160]

try:
    import torch

    report["cuda"] = torch.cuda.is_available()
    report["mps"] = bool(getattr(torch.backends, "mps", None) and torch.backends.mps.is_available())
except Exception:
    report["cuda"] = report["mps"] = False

kaggle_ok = shutil.which("kaggle") is not None
report["kaggle_cli"] = kaggle_ok
if kaggle_ok:
    try:
        out = subprocess.run(["kaggle", "competitions", "list", "-s", "map-charting"], capture_output=True, check=False,
                             text=True, timeout=60)
        report["kaggle_auth"] = out.returncode == 0
        report["kaggle_msg"] = (out.stdout or out.stderr)[:300]
    except Exception as e:  # noqa: BLE001
        report["kaggle_auth"] = False
        report["kaggle_msg"] = str(e)[:300]

# Placement rule (documented in 03_MODEL_SPEC.md):
heavy_local = bool(report.get("cuda"))
report["placement"] = {
    "data_prep_eda_lightgbm_calibration": "local",
    "l1_transformer_cokt": "local" if heavy_local else "kaggle_gpu",
    "l2_encoder_finetune": "local" if heavy_local else "kaggle_gpu",
    "translation_opus_mt": "local (cpu/mps ok)",
}

out_dir = Path(__file__).resolve().parents[1] / "runs"
out_dir.mkdir(exist_ok=True)
(out_dir / "env_report.json").write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
