"""Split conformal prediction (03 §3, T41). LAC for L1, APS for L2, alpha = 0.10 (D-09).

LAC (least ambiguous set-valued classifier): score = 1 - p_y; set = {k : p_k >= 1 - qhat}.
APS: score = sum of sorted probabilities up to and including the true class (non-randomised by default;
     randomised variant via `randomized=True` with a seeded generator).
qhat = the ceil((n + 1)(1 - alpha)) / n empirical quantile of calibration scores ("higher" interpolation).
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np


def _qhat(scores: np.ndarray, alpha: float) -> float:
    n = len(scores)
    level = min(1.0, math.ceil((n + 1) * (1 - alpha)) / n)
    return float(np.quantile(scores, level, method="higher"))


class LAC:
    def __init__(self, alpha: float = 0.10):
        self.alpha = alpha

    def fit(self, P, y):
        P, y = np.asarray(P), np.asarray(y)
        self.qhat = _qhat(1 - P[np.arange(len(y)), y], self.alpha)
        return self

    def predict_set(self, P) -> np.ndarray:
        """Boolean (n, K). Empty sets get the argmax class (never return an empty set to a teacher)."""
        P = np.asarray(P)
        S = P >= 1 - self.qhat
        empty = ~S.any(axis=1)
        S[empty, P[empty].argmax(axis=1)] = True
        return S

    def to_dict(self):
        return {"method": "LAC", "alpha": self.alpha, "qhat": self.qhat}


class APS:
    def __init__(self, alpha: float = 0.10, randomized: bool = False, seed: int = 20261118):
        self.alpha, self.randomized, self.seed = alpha, randomized, seed

    def _scores(self, P, y, u):
        order = np.argsort(-P, axis=1, kind="stable")
        Ps = np.take_along_axis(P, order, axis=1)
        cum = np.cumsum(Ps, axis=1)
        rank = np.argmax(order == y[:, None], axis=1)
        s = cum[np.arange(len(y)), rank]
        if self.randomized:
            s = s - u * Ps[np.arange(len(y)), rank]
        return s

    def fit(self, P, y):
        P, y = np.asarray(P, float), np.asarray(y)
        u = np.random.default_rng(self.seed).random(len(y))
        self.qhat = _qhat(self._scores(P, y, u), self.alpha)
        return self

    def predict_set(self, P) -> np.ndarray:
        P = np.asarray(P, float)
        order = np.argsort(-P, axis=1, kind="stable")
        Ps = np.take_along_axis(P, order, axis=1)
        cum = np.cumsum(Ps, axis=1)
        # class at sorted rank j is in the set iff its score (cumulative mass up to j) <= qhat, matching fit()
        include_sorted = cum <= self.qhat + 1e-12
        include_sorted[:, 0] = True
        S = np.zeros_like(P, dtype=bool)
        np.put_along_axis(S, order, include_sorted, axis=1)
        return S

    def to_dict(self):
        return {"method": "APS", "alpha": self.alpha, "qhat": self.qhat, "randomized": self.randomized}


def coverage(S: np.ndarray, y) -> float:
    y = np.asarray(y)
    return float(S[np.arange(len(y)), y].mean())


def avg_set_size(S: np.ndarray) -> float:
    return float(S.sum(axis=1).mean())


def save(path: Path, **objs) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({k: v.to_dict() for k, v in objs.items()}, indent=2))
