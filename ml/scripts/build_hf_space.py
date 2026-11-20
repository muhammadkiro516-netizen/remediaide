"""Assemble the Hugging Face Space repo for the ML service (docs/cac/MANUAL_ACTIONS.md M17).

  python scripts/build_hf_space.py [--out ../submission/hf_space]
Copies src/, service/, pyproject.toml, requirements-lock.txt and the production models that the Space needs
(L2 = mDeBERTa for Indonesian input, D-27; student ONNX left out), writes the Space README/Dockerfile at the root and a .gitattributes for
Git LFS, then prints the size. The output folder is git-ignored (submission/).
"""

from __future__ import annotations

import argparse
import json
import shutil

from remediaide_ml.paths import ML_ROOT, MODELS, REPO_ROOT

MODEL_FILES = ["l1_cokt_v1", "l1_lgbm_v1", "l1_features_v1.json", "l1_calibrator_v1.joblib", "l1_bin_calibrator_v1.joblib",
               "l2_mdeberta_v1", "l2_tfidf_v1.joblib", "l2_candidates_v1.json", "l3_conformal_v1.json",
               "misconception_dictionary.json", "README.md"]
LFS = ["*.pt", "*.onnx", "*.joblib", "*.bin", "*.safetensors", "*.model", "models/l1_lgbm_v1/*.txt", "tokenizer.json"]


def size(p) -> int:
    return sum(f.stat().st_size for f in p.rglob("*") if f.is_file()) if p.is_dir() else p.stat().st_size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(REPO_ROOT / "submission" / "hf_space"))
    a = ap.parse_args()
    out = __import__("pathlib").Path(a.out)
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    ign = shutil.ignore_patterns("__pycache__", "*.pyc", "hf_space")
    shutil.copytree(ML_ROOT / "src", out / "src", ignore=ign)
    shutil.copytree(ML_ROOT / "service", out / "service", ignore=ign)
    for f in ("pyproject.toml", "requirements-lock.txt"):
        shutil.copy2(ML_ROOT / f, out / f)
    shutil.copy2(ML_ROOT / "service" / "hf_space" / "Dockerfile", out / "Dockerfile")
    shutil.copy2(ML_ROOT / "service" / "hf_space" / "README.md", out / "README.md")
    (out / ".gitattributes").write_text("".join(f"{p} filter=lfs diff=lfs merge=lfs -text\n" for p in LFS))
    (out / "models").mkdir()
    sizes = {}
    missing = []
    for m in MODEL_FILES:
        src = MODELS / m
        if not src.exists():
            missing.append(m)
            continue
        (shutil.copytree if src.is_dir() else shutil.copy2)(src, out / "models" / m)
        sizes[m] = round(size(src) / 1e6, 1)
    total = round(size(out) / 1e6, 1)
    print(json.dumps({"out": str(out), "models_MB": sizes, "missing": missing, "total_MB": total}, indent=1))
    if missing:
        raise SystemExit(f"model hilang: {missing} (lihat models/README.md)")


if __name__ == "__main__":
    main()
