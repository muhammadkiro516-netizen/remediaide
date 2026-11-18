"""Layer 2 baseline B0: TF-IDF (word 1-2 + char 3-5) + multinomial logistic regression (03 §2, T30).

Two tasks (D-06):
* "target"    : 65-way Category:Misconception, random StratifiedKFold, outputs masked to candidates of
                (QuestionId, correctness prefix) computed on the training fold only. Metric MAP@3.
* "category3" : Correct/Neither/Misconception, leave-questions-out GroupKFold. Metric macro-F1.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import scipy.sparse as sp
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression


def build_text(df: pd.DataFrame, lang: str = "en", cols: tuple[str, str, str] | None = None) -> pd.Series:
    """Model input template (03 §2). `cols` lets callers pass translated columns."""
    q, a, e = cols or ("QuestionText", "MC_Answer", "StudentExplanation")
    if lang == "id":
        ok = np.where(df["is_correct_answer"], "benar", "salah")
        return "Soal: " + df[q] + " [SEP] Jawaban: " + df[a] + " (" + ok + ") [SEP] Alasan: " + df[e]
    ok = np.where(df["is_correct_answer"], "correct", "incorrect")
    return "Question: " + df[q] + " [SEP] Answer: " + df[a] + " (" + ok + ") [SEP] Explanation: " + df[e]


class TfidfLR:
    def __init__(self, C: float = 1.0, max_iter: int = 2000, seed: int = 0):
        self.word = TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True, lowercase=True)
        self.char = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=3, sublinear_tf=True,
                                    lowercase=True, max_features=200_000)
        self.clf = LogisticRegression(C=C, max_iter=max_iter, random_state=seed)

    def _x(self, text: pd.Series, fit: bool):
        if fit:
            return sp.hstack([self.word.fit_transform(text), self.char.fit_transform(text)]).tocsr()
        return sp.hstack([self.word.transform(text), self.char.transform(text)]).tocsr()

    def fit(self, text: pd.Series, y) -> TfidfLR:
        self.clf.fit(self._x(text, True), np.asarray(y))
        self.classes_ = self.clf.classes_
        return self

    def predict_proba(self, text: pd.Series) -> np.ndarray:
        return self.clf.predict_proba(self._x(text, False))


def candidate_mask(df: pd.DataFrame, classes, candidates: dict[str, list[str]]) -> np.ndarray:
    """(n, K) boolean: class allowed for the row's (QuestionId, prefix). Unknown key -> all allowed."""
    idx = {c: i for i, c in enumerate(classes)}
    mask = np.zeros((len(df), len(classes)), dtype=bool)
    keys = (df["QuestionId"].astype(str) + "|" + df["prefix"]).to_numpy()
    for r, k in enumerate(keys):
        allowed = candidates.get(k)
        if allowed is None:
            mask[r] = True
        else:
            for c in allowed:
                if c in idx:
                    mask[r, idx[c]] = True
            if not mask[r].any():
                mask[r] = True
    return mask


def apply_mask(proba: np.ndarray, mask: np.ndarray) -> np.ndarray:
    p = np.where(mask, proba, 0.0)
    s = p.sum(axis=1, keepdims=True)
    return np.divide(p, s, out=np.full_like(p, 1.0 / p.shape[1]), where=s > 0)
