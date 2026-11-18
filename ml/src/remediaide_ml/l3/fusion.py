"""Layer 3 fusion of L1 (quadrant) and L2 (explanation) evidence (03 §3, T43).

(i) Naive-Bayes product (no labels needed). L2 speaks to the *mastery* axis only: p_L2(Correct) is evidence for
    "mastered" (P, L); p_L2(Misconception) + p_L2(Neither) for "not mastered" (M, T). With a mastery prior pi
    (from training data), p(q | both) ∝ p_L1(q) * [p_L2(m(q)) / prior(m(q))]. The confidence axis comes from L1.
(ii) Stacking: L2-regularised logistic regression on [log p_L1, p_L2] fitted on teacher gold labels (pilot, E9).
     Choose (i) unless (ii) is significantly better (03 §3).
hidden_misconception: answer correct and p_L2(True_Misconception) >= validation threshold -> always to the teacher.
"""

from __future__ import annotations

import numpy as np
from sklearn.linear_model import LogisticRegression

QUAD = ("P", "L", "M", "T")
MASTERED = np.array([True, True, False, False])


def naive_bayes_fusion(p_l1: np.ndarray, p_l2_cat3: np.ndarray | None, mastery_prior: float,
                       cat3_order=("Correct", "Misconception", "Neither")) -> np.ndarray:
    """p_l1: (n, 4) over P,L,M,T. p_l2_cat3: (n, 3) or None / NaN rows (no explanation) -> L1 unchanged."""
    p1 = np.asarray(p_l1, float)
    if p_l2_cat3 is None:
        return p1 / p1.sum(axis=1, keepdims=True)
    p2 = np.asarray(p_l2_cat3, float)
    i_c = list(cat3_order).index("Correct")
    pm = p2[:, i_c]
    lik_m = pm / mastery_prior
    lik_n = (1 - pm) / (1 - mastery_prior)
    lik = np.where(MASTERED[None, :], lik_m[:, None], lik_n[:, None])
    lik = np.where(np.isnan(lik), 1.0, lik)
    out = p1 * lik
    s = out.sum(axis=1, keepdims=True)
    return np.where(s > 0, out / np.where(s > 0, s, 1), p1)


class StackingFusion:
    """Activated only when teacher gold labels exist (pilot). Features: log p_L1 (4) + p_L2 cat3 (3) + has_expl."""

    def __init__(self, C: float = 1.0):
        self.clf = LogisticRegression(C=C, max_iter=2000)

    @staticmethod
    def _x(p_l1, p_l2):
        p1 = np.log(np.clip(np.asarray(p_l1, float), 1e-6, 1))
        if p_l2 is None:
            p2 = np.full((len(p1), 3), np.nan)
        else:
            p2 = np.asarray(p_l2, float)
        has = (~np.isnan(p2).any(axis=1)).astype(float)[:, None]
        return np.hstack([p1, np.nan_to_num(p2, nan=0.0), has])

    def fit(self, p_l1, p_l2, y):
        self.clf.fit(self._x(p_l1, p_l2), np.asarray(y))
        return self

    def predict_proba(self, p_l1, p_l2):
        P = np.zeros((len(p_l1), 4))
        P[:, self.clf.classes_] = self.clf.predict_proba(self._x(p_l1, p_l2))
        return P


def hidden_misconception(is_correct: np.ndarray, p_true_misc: np.ndarray, threshold: float) -> np.ndarray:
    p = np.nan_to_num(np.asarray(p_true_misc, float), nan=0.0)
    return np.asarray(is_correct, bool) & (p >= threshold)
