"""T47: compare regenerated reports/tables/* with the committed versions (git HEAD), tolerance 07 §6.

  python scripts/check_repro.py [--ref HEAD] [--tol 0.005]
Numbers in [-1, 1]-ish ranges: |a - b| <= tol. Larger floats: relative diff <= 1%. Integers (counts): equal.
Keys that are timings or paths are skipped. Output: runs/check_repro.json + a summary per file; exit 1 on failure.
"""

from __future__ import annotations

import argparse
import io
import json
import math
import subprocess
import sys

import pandas as pd

from remediaide_ml.paths import ML_ROOT, REPO_ROOT, RUNS, TABLES

SKIP_KEYS = ("sec", "latency", "run", "source", "path", "opened_at", "l1_oof", "l2_oof", "cokt_final", "model")


def git_show(rel: str, ref: str) -> str | None:
    r = subprocess.run(["git", "show", f"{ref}:{rel}"], cwd=REPO_ROOT, capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None


def flatten(obj, prefix=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from flatten(v, f"{prefix}.{k}" if prefix else str(k))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from flatten(v, f"{prefix}[{i}]")
    else:
        yield prefix, obj


def close(a, b, tol) -> bool:
    if isinstance(a, bool) or isinstance(b, bool):
        return a == b
    if isinstance(a, int | float) and isinstance(b, int | float):
        if isinstance(a, float) and isinstance(b, float) and math.isnan(a) and math.isnan(b):
            return True
        if float(a).is_integer() and float(b).is_integer() and abs(a) > 1:
            return a == b
        return abs(a - b) <= tol or abs(a - b) <= 0.01 * max(abs(a), abs(b))
    return a == b


def skip(key: str) -> bool:
    k = key.lower()
    return any(s in k for s in SKIP_KEYS)


def compare_csv(new: str, old: str, tol):
    a, b = pd.read_csv(io.StringIO(new)), pd.read_csv(io.StringIO(old))
    if a.shape != b.shape or list(a.columns) != list(b.columns):
        return [f"shape/columns differ: {a.shape} vs {b.shape}"]
    bad = []
    for c in a.columns:
        if skip(c):
            continue
        for i, (x, y) in enumerate(zip(a[c], b[c], strict=True)):
            if pd.isna(x) and pd.isna(y):
                continue
            try:
                xf, yf = float(x), float(y)
                ok = close(xf, yf, tol)
            except (TypeError, ValueError):
                ok = str(x) == str(y)
            if not ok:
                bad.append(f"row {i} {c}: {x} vs {y}")
    return bad


def compare_json(new: str, old: str, tol):
    a, b = dict(flatten(json.loads(new))), dict(flatten(json.loads(old)))
    bad = []
    for k in sorted(set(a) | set(b)):
        if skip(k):
            continue
        if k not in a or k not in b:
            bad.append(f"{k}: missing on one side")
        elif not close(a[k], b[k], tol):
            bad.append(f"{k}: {a[k]} vs {b[k]}")
    return bad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref", default="HEAD")
    ap.add_argument("--tol", type=float, default=0.005)
    a = ap.parse_args()
    out, n_fail = {}, 0
    for f in sorted(TABLES.iterdir()):
        if f.suffix not in (".csv", ".json"):
            continue
        rel = str(f.relative_to(REPO_ROOT))
        old = git_show(rel, a.ref)
        if old is None:
            out[f.name] = {"status": "new (not in ref)"}
            continue
        new = f.read_text()
        if new == old:
            out[f.name] = {"status": "identical"}
            continue
        bad = (compare_csv if f.suffix == ".csv" else compare_json)(new, old, a.tol)
        out[f.name] = {"status": "within tolerance" if not bad else "FAIL", "n_diff": len(bad), "examples": bad[:10]}
        n_fail += bool(bad)
    RUNS.mkdir(exist_ok=True)
    (RUNS / "check_repro.json").write_text(json.dumps(out, indent=2))
    for k, v in out.items():
        print(f"{v['status']:<18} {k}" + (f"  ({v['n_diff']} diff, e.g. {v['examples'][:2]})" if v.get("n_diff") else ""))
    print(f"{n_fail} file(s) outside tolerance; report: {RUNS / 'check_repro.json'} (ml root {ML_ROOT})")
    sys.exit(1 if n_fail else 0)


if __name__ == "__main__":
    main()
