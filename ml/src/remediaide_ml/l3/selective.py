"""Selective prediction / deferral to the teacher (03 §3, T42, DECISIONS D-09).

doubt score = 1 - max p (default). Coverage-risk curve on a defer grid. Operating point rule D-09 (validation only):
the smallest defer rate whose residual misgrouping is >= 25% lower (relative) than with no deferral, at most 30%;
if none qualifies, 20%.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

DEFER_GRID = (0.0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30)


def doubt_max_prob(P) -> np.ndarray:
    return 1 - np.asarray(P).max(axis=1)


def defer_mask(doubt: np.ndarray, rate: float) -> np.ndarray:
    """Defer the `rate` fraction with the highest doubt (stable ties by index)."""
    n = len(doubt)
    k = int(round(rate * n))
    m = np.zeros(n, dtype=bool)
    if k > 0:
        m[np.argsort(-doubt, kind="stable")[:k]] = True
    return m


def threshold_for_rate(doubt_val: np.ndarray, rate: float) -> float:
    """Doubt threshold on validation that defers `rate`; apply as `doubt >= thr` on new data."""
    if rate <= 0:
        return float("inf")
    return float(np.quantile(doubt_val, 1 - rate))


def coverage_risk(error: np.ndarray, doubt: np.ndarray, grid=DEFER_GRID) -> pd.DataFrame:
    error = np.asarray(error, bool)
    rows = []
    base = error.mean()
    for r in grid:
        m = defer_mask(doubt, r)
        keep = ~m
        risk = error[keep].mean() if keep.any() else np.nan
        rows.append({"defer_rate": r, "coverage": float(keep.mean()), "risk": float(risk),
                     "relative_reduction": float(1 - risk / base) if base > 0 else 0.0,
                     "errors_caught_share": float(error[m].sum() / max(1, error.sum()))})
    return pd.DataFrame(rows)


def choose_operating_point(curve: pd.DataFrame, min_rel_reduction: float = 0.25, max_defer: float = 0.30,
                           fallback: float = 0.20) -> dict:
    ok = curve[(curve.defer_rate > 0) & (curve.defer_rate <= max_defer + 1e-12) &
               (curve.relative_reduction >= min_rel_reduction - 1e-12)]
    if len(ok):
        r = float(ok.defer_rate.min())
        return {"defer_rate": r, "rule": "smallest defer with >= 25% relative reduction (D-09)"}
    return {"defer_rate": fallback, "rule": "no grid point met 25% reduction within 30% -> fallback 20% (D-09)"}
