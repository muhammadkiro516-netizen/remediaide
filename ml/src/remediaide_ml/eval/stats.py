"""Statistical inference utilities (docs/cac/04_EXPERIMENTS.md, "Aturan umum").

* cluster_bootstrap_ci: percentile CI, resampling whole clusters (UserId for Eedi).
* delong_test: fast DeLong (Sun & Xu 2014) for two correlated AUCs on the same rows.
* mcnemar_test: paired classification comparison (statsmodels exact/chi2).
* holm: Holm-Bonferroni step-down adjusted p-values.
"""

from __future__ import annotations

from collections.abc import Callable

import numpy as np
from scipy import stats as sps

from remediaide_ml.seed import GLOBAL_SEED


def cluster_bootstrap_ci(
    metric: Callable[..., float],
    arrays: tuple,
    clusters,
    n_boot: int = 1000,
    ci: float = 0.95,
    seed: int = GLOBAL_SEED,
) -> dict:
    """Bootstrap a metric by resampling clusters with replacement.

    metric(*resampled_arrays) -> float. `arrays` are aligned row-wise with `clusters`.
    Returns {"point", "lo", "hi", "n_boot_ok"}. Replicates where the metric fails (e.g. a single
    class for AUC) are skipped and counted.
    """
    arrays = tuple(np.asarray(a) for a in arrays)
    clusters = np.asarray(clusters)
    uniq, inv = np.unique(clusters, return_inverse=True)
    order = np.argsort(inv, kind="stable")
    counts = np.bincount(inv)
    starts = np.concatenate([[0], np.cumsum(counts)[:-1]])
    rng = np.random.default_rng(seed)
    point = float(metric(*arrays))
    vals = []
    for _ in range(n_boot):
        pick = rng.integers(0, len(uniq), len(uniq))
        idx = np.concatenate([order[starts[c] : starts[c] + counts[c]] for c in pick])
        try:
            v = float(metric(*(a[idx] for a in arrays)))
        except ValueError:
            continue
        if np.isfinite(v):
            vals.append(v)
    a = (1 - ci) / 2
    lo, hi = (np.quantile(vals, [a, 1 - a]) if vals else (np.nan, np.nan))
    return {"point": point, "lo": float(lo), "hi": float(hi), "n_boot_ok": len(vals)}


# ---------------------------------------------------------------- DeLong (fast, Sun & Xu 2014)
def _midrank(x: np.ndarray) -> np.ndarray:
    j = np.argsort(x, kind="mergesort")
    z = x[j]
    n = len(x)
    t = np.zeros(n)
    i = 0
    while i < n:
        k = i
        while k < n and z[k] == z[i]:
            k += 1
        t[i:k] = 0.5 * (i + k - 1) + 1
        i = k
    out = np.empty(n)
    out[j] = t
    return out


def _fast_delong(preds_sorted: np.ndarray, m: int):
    """preds_sorted: (k, n) with the m positives first. Returns (aucs, cov)."""
    n = preds_sorted.shape[1] - m
    pos = preds_sorted[:, :m]
    neg = preds_sorted[:, m:]
    k = preds_sorted.shape[0]
    tx = np.array([_midrank(pos[r]) for r in range(k)])
    ty = np.array([_midrank(neg[r]) for r in range(k)])
    tz = np.array([_midrank(preds_sorted[r]) for r in range(k)])
    aucs = tz[:, :m].sum(axis=1) / m / n - (m + 1.0) / 2.0 / n
    v01 = (tz[:, :m] - tx) / n
    v10 = 1.0 - (tz[:, m:] - ty) / m
    sx = np.atleast_2d(np.cov(v01))
    sy = np.atleast_2d(np.cov(v10))
    cov = sx / m + sy / n
    return aucs, cov


def delong_test(y_true, score_a, score_b) -> dict:
    """Two-sided paired DeLong test for AUC(a) vs AUC(b)."""
    y = np.asarray(y_true).astype(int)
    order = np.argsort(-y, kind="stable")  # positives first
    m = int(y.sum())
    preds = np.vstack([np.asarray(score_a, float), np.asarray(score_b, float)])[:, order]
    aucs, cov = _fast_delong(preds, m)
    diff = aucs[0] - aucs[1]
    var = cov[0, 0] + cov[1, 1] - 2 * cov[0, 1]
    z = diff / np.sqrt(var) if var > 0 else 0.0
    p = 2 * sps.norm.sf(abs(z))
    return {"auc_a": float(aucs[0]), "auc_b": float(aucs[1]), "diff": float(diff), "z": float(z), "p": float(p),
            "var_a": float(cov[0, 0]), "var_b": float(cov[1, 1])}


def delong_auc_var(y_true, score) -> tuple[float, float]:
    """AUC and its DeLong variance for a single score."""
    y = np.asarray(y_true).astype(int)
    order = np.argsort(-y, kind="stable")
    aucs, cov = _fast_delong(np.asarray(score, float)[order][None, :], int(y.sum()))
    return float(aucs[0]), float(cov[0, 0])


# ---------------------------------------------------------------- McNemar + Holm
def mcnemar_test(y_true, pred_a, pred_b, exact: bool | None = None) -> dict:
    """Paired test on correctness of two classifiers. exact=None -> exact if discordant < 25."""
    from statsmodels.stats.contingency_tables import mcnemar

    y = np.asarray(y_true)
    ca = np.asarray(pred_a) == y
    cb = np.asarray(pred_b) == y
    b = int(np.sum(ca & ~cb))
    c = int(np.sum(~ca & cb))
    table = [[int(np.sum(ca & cb)), b], [c, int(np.sum(~ca & ~cb))]]
    if exact is None:
        exact = (b + c) < 25
    res = mcnemar(table, exact=exact, correction=not exact)
    return {"a_only_correct": b, "b_only_correct": c, "statistic": float(res.statistic), "p": float(res.pvalue),
            "exact": bool(exact)}


def holm(pvalues) -> np.ndarray:
    """Holm-Bonferroni adjusted p-values (monotone, capped at 1)."""
    p = np.asarray(pvalues, float)
    m = len(p)
    order = np.argsort(p)
    adj = np.empty(m)
    running = 0.0
    for rank, i in enumerate(order):
        running = max(running, (m - rank) * p[i])
        adj[i] = min(1.0, running)
    return adj
