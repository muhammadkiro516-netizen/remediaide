"""Evaluation metrics (docs/cac/04_EXPERIMENTS.md, "Definisi metrik").

Thin wrappers over scikit-learn where a reference implementation exists, plus project-specific
metrics (ECE, MAP@k, misgrouping rate). All functions take plain array-likes and return floats/dicts.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
from sklearn import metrics as skm


def _arr(x) -> np.ndarray:
    return np.asarray(x)


def auc(y_true, y_score) -> float:
    return float(skm.roc_auc_score(_arr(y_true), _arr(y_score)))


def logloss(y_true, y_prob, labels=None) -> float:
    return float(skm.log_loss(_arr(y_true), _arr(y_prob), labels=labels))


def brier(y_true, y_prob) -> float:
    """Binary Brier score (y_prob = P(y=1))."""
    return float(skm.brier_score_loss(_arr(y_true), _arr(y_prob)))


def ece(y_true, y_prob, n_bins: int = 15) -> float:
    """Expected calibration error with equal-width bins.

    * Binary: y_prob is 1-D P(y=1); confidence = y_prob, accuracy = observed frequency of y=1
      (reliability-diagram form).
    * Multiclass: y_prob is (n, K); confidence = top-1 probability, accuracy = top-1 correct.
    ECE = sum_b (n_b / N) * |acc_b - conf_b|.
    """
    y_true = _arr(y_true)
    p = _arr(y_prob).astype(float)
    if p.ndim == 1:
        conf = p
        hit = (y_true == 1).astype(float)
    else:
        conf = p.max(axis=1)
        hit = (p.argmax(axis=1) == y_true).astype(float)
    edges = np.linspace(0.0, 1.0, n_bins + 1)
    # bin index in [0, n_bins-1]; conf == 1.0 goes into the last bin
    idx = np.clip(np.digitize(conf, edges[1:-1], right=True), 0, n_bins - 1)
    n = len(conf)
    total = 0.0
    for b in range(n_bins):
        m = idx == b
        if m.any():
            total += m.sum() / n * abs(hit[m].mean() - conf[m].mean())
    return float(total)


def map_at_k(y_true: Sequence, y_pred_ranked: Sequence[Sequence], k: int = 3) -> float:
    """Mean average precision @k with a single relevant label per row (Kaggle MAP@3).

    Score per row = 1/rank if the true label is among the first k predictions (first occurrence),
    else 0. Duplicated predictions are ignored after their first occurrence, as in the Kaggle metric.
    """
    scores = []
    for t, preds in zip(y_true, y_pred_ranked, strict=True):
        seen: list = []
        for p in preds:
            if p not in seen:
                seen.append(p)
            if len(seen) == k:
                break
        s = 0.0
        for r, p in enumerate(seen, start=1):
            if p == t:
                s = 1.0 / r
                break
        scores.append(s)
    return float(np.mean(scores)) if scores else float("nan")


def topk_from_proba(proba: np.ndarray, classes: Sequence, k: int = 3) -> list[list]:
    """Rank class labels by probability (descending, stable) and return the top k per row."""
    order = np.argsort(-np.asarray(proba), axis=1, kind="stable")[:, :k]
    classes = np.asarray(classes, dtype=object)
    return [list(classes[o]) for o in order]


def macro_f1(y_true, y_pred, labels=None) -> float:
    return float(skm.f1_score(_arr(y_true), _arr(y_pred), average="macro", labels=labels, zero_division=0))


def per_class_recall(y_true, y_pred, labels=None) -> dict:
    y_true, y_pred = _arr(y_true), _arr(y_pred)
    labels = list(labels) if labels is not None else sorted(set(y_true.tolist()) | set(y_pred.tolist()))
    r = skm.recall_score(y_true, y_pred, labels=labels, average=None, zero_division=0)
    return {lab: float(v) for lab, v in zip(labels, r, strict=True)}


def cohen_kappa(a, b) -> float:
    return float(skm.cohen_kappa_score(_arr(a), _arr(b)))


def misgroup_rate(y_ref, y_pred) -> float:
    """P(predicted group != reference group)."""
    y_ref, y_pred = _arr(y_ref), _arr(y_pred)
    return float(np.mean(y_ref != y_pred))
