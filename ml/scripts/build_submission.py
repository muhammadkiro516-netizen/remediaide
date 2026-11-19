"""T50/T52: assemble the submission repo `remediaide-ml` (07_SUBMISSION.md §1, §5) from ml/.

  python scripts/build_submission.py [--out ../submission/remediaide-ml] [--zip]
Copies code, notebooks, reports, small model artefacts and the dataset package:
  data/original/map/        unmodified MAP train.csv + license note (MIT)
  data/derived/map_id/      our Indonesian translation (MIT derivative) as CSV
  data/download_eedi.sh     Eedi is CC BY-NC-ND 4.0: original archive is downloaded, processed data is never shipped
Large weights (LightGBM 25 models, mDeBERTa, TF-IDF) are not copied; models/README.md says how to regenerate them.
The output folder must not exist yet (nothing is deleted).
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import pandas as pd

from remediaide_ml.paths import ML_ROOT, PROCESSED, REPO_ROOT

TOP = ["README.md", "REPORT.md", "MODEL_CARD.md", "DATA_CARD.md", "LICENSE", "pyproject.toml", "Makefile"]
DIRS = ["configs", "src", "scripts", "notebooks", "service", "tests"]
IGNORE = shutil.ignore_patterns("__pycache__", "*.egg-info", ".ipynb_checkpoints", ".pytest_cache", "._*", ".DS_Store")
SMALL_MODELS = ["README.md", "l1_features_v1.json", "l1_calibrator_v1.joblib", "l1_bin_calibrator_v1.joblib",
                "l3_conformal_v1.json", "misconception_dictionary.json", "l2_candidates_v1.json"]

GITIGNORE = """.venv/
__pycache__/
*.egg-info/
.ipynb_checkpoints/
.pytest_cache/
data/raw/
data/interim/
data/processed/
data/pilot/
runs/*
!runs/.gitkeep
models/l1_lgbm_v1/
models/l2_mdeberta_v1/
models/l2_tfidf_v1.joblib
kaggle/kernels/*/kernel-metadata.json
.env
kaggle.json
"""

DATA_README = """# data/

| Folder / file | Isi | Lisensi |
| --- | --- | --- |
| `original/map/train.csv` | MAP train.csv asli, tanpa modifikasi (sha256 di `manifest.json`) | MIT (`original/map/LICENSE_NOTE.md`) |
| `derived/map_id/map_id.csv` | terjemahan Indonesia kolom soal, jawaban, alasan (opus-mt-en-id + QA, lihat `reports/translation_card.md`) | turunan MIT |
| `download_eedi.sh` | unduh arsip asli Eedi NeurIPS 2020 (657 MB) | CC BY-NC-ND 4.0 — data olahan **tidak** dibagikan |
| `download_map.sh` | unduh MAP via Kaggle CLI (alternatif dari `original/`) | MIT |
| `manifest.json` | sha256, ukuran, sumber, lisensi setiap file mentah | — |

Untuk menjalankan pipeline: `bash data/download_eedi.sh`, lalu salin `original/map/*` ke `raw/map/`
(atau `bash data/download_map.sh`), lalu `make all` dari root repo. Folder `raw/`, `interim/`, `processed/` dibuat
otomatis dan tidak di-commit.
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=REPO_ROOT / "submission" / "remediaide-ml")
    ap.add_argument("--zip", action="store_true")
    a = ap.parse_args()
    out = a.out
    if out.exists():
        raise SystemExit(f"{out} already exists; choose another --out (this script never deletes)")
    out.mkdir(parents=True)
    for f in TOP:
        shutil.copy2(ML_ROOT / f, out / f)
    for d in DIRS:
        shutil.copytree(ML_ROOT / d, out / d, ignore=IGNORE)
    # requirements lock without the local editable path
    lock = [ln for ln in (ML_ROOT / "requirements-lock.txt").read_text().splitlines()
            if not ln.startswith("-e ") and not ln.startswith("# Editable")]
    (out / "requirements-lock.txt").write_text("\n".join(lock) + "\n-e .\n")
    # kaggle kernels (code + metadata templates only)
    for k in sorted((ML_ROOT / "kaggle" / "kernels").iterdir()):
        if k.is_dir():
            (out / "kaggle" / "kernels" / k.name).mkdir(parents=True)
            for f in ("train.py", "kernel-metadata.template.json"):
                if (k / f).exists():
                    shutil.copy2(k / f, out / "kaggle" / "kernels" / k.name / f)
    # reports
    rep = out / "reports"
    rep.mkdir()
    for f in ("RESULTS.md", "translation_card.md", "TEST_OPENED.json"):
        shutil.copy2(ML_ROOT / "reports" / f, rep / f)
    shutil.copytree(ML_ROOT / "reports" / "tables", rep / "tables", ignore=IGNORE)
    shutil.copytree(ML_ROOT / "reports" / "figures", rep / "figures", ignore=IGNORE)
    # models: small artefacts + CO-KT production weights (13 MB) for verification
    mo = out / "models"
    (mo / "l1_cokt_v1").mkdir(parents=True)
    for f in SMALL_MODELS:
        shutil.copy2(ML_ROOT / "models" / f, mo / f)
    for p in (ML_ROOT / "models" / "l1_cokt_v1").iterdir():
        if p.suffix in (".pt", ".json"):
            shutil.copy2(p, mo / "l1_cokt_v1" / p.name)
    # docs: locked decisions + experiment protocol
    (out / "docs").mkdir()
    for f in ("DECISIONS.md", "04_EXPERIMENTS.md", "03_MODEL_SPEC.md", "02_DATA_SPEC.md"):
        shutil.copy2(REPO_ROOT / "docs" / "cac" / f, out / "docs" / f)
    # data package (T52)
    dd = out / "data"
    (dd / "original" / "map").mkdir(parents=True)
    for f in ("train.csv", "LICENSE_NOTE.md"):
        shutil.copy2(ML_ROOT / "data" / "raw" / "map" / f, dd / "original" / "map" / f)
    (dd / "derived" / "map_id").mkdir(parents=True)
    tr = pd.read_parquet(PROCESSED / "map_id.parquet")
    tr.to_csv(dd / "derived" / "map_id" / "map_id.csv", index=False)
    for f in ("manifest.json", "download_eedi.sh", "download_map.sh"):
        shutil.copy2(ML_ROOT / "data" / f, dd / f)
    (dd / "README.md").write_text(DATA_README)
    (out / "runs").mkdir()
    (out / "runs" / ".gitkeep").write_text("")
    (out / ".gitignore").write_text(GITIGNORE)
    size = sum(p.stat().st_size for p in out.rglob("*") if p.is_file())
    summary = {"out": str(out), "files": sum(1 for p in out.rglob("*") if p.is_file()), "size_mb": round(size / 1e6, 1),
               "map_id_rows": len(tr)}
    if a.zip:
        z = shutil.make_archive(str(out), "zip", root_dir=out.parent, base_dir=out.name)
        summary["zip"] = z
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
