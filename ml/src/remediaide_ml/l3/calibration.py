"""Layer 3 calibration (03 §3, T40): isotonic for trees (binary + one-vs-rest multiclass), temperature for logits."""

from __future__ import annotations

import numpy as np
from scipy.optimize import minimize_scalar
from scipy.special import log_softmax, softmax
from sklearn.isotonic import IsotonicRegression


class IsotonicBinary:
    def fit(self, p, y):
        self.iso = IsotonicRegression(out_of_bounds="clip", y_min=1e-6, y_max=1 - 1e-6).fit(np.asarray(p), np.asarray(y))
        return self

    def predict(self, p):
        return self.iso.predict(np.asarray(p))


class IsotonicMulticlass:
    """One-vs-rest isotonic per class, then renormalised. Rows that collapse to all zeros fall back to input."""

    def fit(self, P, y):
        P, y = np.asarray(P), np.asarray(y)
        self.isos = [IsotonicRegression(out_of_bounds="clip", y_min=1e-6, y_max=1).fit(P[:, k], (y == k).astype(float))
                     for k in range(P.shape[1])]
        return self

    def predict(self, P):
        P = np.asarray(P)
        Q = np.column_stack([iso.predict(P[:, k]) for k, iso in enumerate(self.isos)])
        s = Q.sum(axis=1, keepdims=True)
        return np.where(s > 0, Q / np.where(s > 0, s, 1), P)


class Temperature:
    """Single temperature T > 0 minimising NLL of softmax(logits / T). -inf logits (masked classes) stay masked."""

    def fit(self, logits, y):
        L, y = np.asarray(logits, float), np.asarray(y)

        def nll(logT):
            lp = log_softmax(L / np.exp(logT), axis=1)
            return -lp[np.arange(len(y)), y].mean()

        self.T = float(np.exp(minimize_scalar(nll, bounds=(-3, 3), method="bounded").x))
        return self

    def predict(self, logits):
        return softmax(np.asarray(logits, float) / self.T, axis=1)


class TemperatureProb(Temperature):
    """Temperature scaling for models that output probabilities (e.g. a seed-averaged neural ensemble):
    logits = log p. Same fit/predict interface as IsotonicMulticlass (input = probabilities)."""

    def fit(self, P, y):
        return super().fit(np.log(np.clip(np.asarray(P, float), 1e-12, 1)), y)

    def predict(self, P):
        return super().predict(np.log(np.clip(np.asarray(P, float), 1e-12, 1)))
