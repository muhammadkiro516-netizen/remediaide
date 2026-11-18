"""Single source of truth for project paths. Never hard-code paths elsewhere."""

from pathlib import Path

ML_ROOT = Path(__file__).resolve().parents[2]          # .../ml
REPO_ROOT = ML_ROOT.parent                              # repo root (Next.js app)

DATA = ML_ROOT / "data"
RAW = DATA / "raw"                  # original downloads, never modified, never committed
RAW_EEDI = RAW / "eedi_neurips2020"
RAW_MAP = RAW / "map"
INTERIM = DATA / "interim"          # cleaned/joined parquet
PROCESSED = DATA / "processed"      # model-ready tables, splits
PILOT = DATA / "pilot"              # anonymised local pilot exports (never committed)

RUNS = ML_ROOT / "runs"             # one folder per training run: config, logs, metrics, model
REPORTS = ML_ROOT / "reports"
FIGURES = REPORTS / "figures"
TABLES = REPORTS / "tables"
KAGGLE = ML_ROOT / "kaggle"         # kernel folders pushed with `kaggle kernels push`
MODELS = ML_ROOT / "models"         # exported production artefacts (joblib/onnx)


def ensure_dirs() -> None:
    for p in (RAW_EEDI, RAW_MAP, INTERIM, PROCESSED, PILOT, RUNS, FIGURES, TABLES, KAGGLE, MODELS):
        p.mkdir(parents=True, exist_ok=True)
