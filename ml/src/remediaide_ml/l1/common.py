"""Shared Layer-1 data plumbing: load processed features + splits, add fold-safe encodings per CV fold.

Framing (a): target IsCorrect from past-only features (all rows of CV users).
Framing (b): 4-class future quadrant (rows with a 4-class label) and binary needs_remediation.
E1-comparable evaluation rows for (b) = rows with current confidence AND a 4-class label (same rows as B0).
Test users (fold == -1) are excluded unless include_test=True (only scripts/final_eval.py does that).
"""

from __future__ import annotations

from collections.abc import Iterator

import numpy as np
import pandas as pd

from remediaide_ml.data.splits import TEST
from remediaide_ml.features.encoding import add_fold_encodings
from remediaide_ml.features.history import FEATURES_A, FEATURES_B_CUR, FEATURES_B_OOF, FEATURES_OOF
from remediaide_ml.paths import PROCESSED

QUAD = ["P", "L", "M", "T"]
FEAT_A = FEATURES_A + FEATURES_OOF
FEAT_B = FEATURES_A + FEATURES_OOF + FEATURES_B_CUR + FEATURES_B_OOF


def load(framing: str, include_test: bool = False, columns: list[str] | None = None) -> pd.DataFrame:
    f = pd.read_parquet(PROCESSED / f"eedi_features_{framing}.parquet", columns=columns)
    sp = pd.read_parquet(PROCESSED / "eedi_splits.parquet")
    f = f.merge(sp, on="UserId", how="left", validate="many_to_one")
    if not include_test:
        f = f[f.fold != TEST].reset_index(drop=True)
    return f


def iter_folds(df: pd.DataFrame, folds=range(5)) -> Iterator[tuple[int, pd.DataFrame, np.ndarray, np.ndarray]]:
    """Yield (k, df_with_encodings, train_idx, valid_idx). Encodings use only training-fold labels."""
    fold = df["fold"].to_numpy()
    for k in folds:
        train_mask = (fold != k) & (fold != TEST)
        d = add_fold_encodings(df, train_mask, fold)
        yield k, d, np.where(train_mask)[0], np.where(fold == k)[0]


def quad_labels(s: pd.Series) -> np.ndarray:
    """'P','L','M','T' -> 0..3 (NaN -> -1)."""
    m = {q: i for i, q in enumerate(QUAD)}
    return s.astype("object").map(m).fillna(-1).astype(int).to_numpy()
