"""Fold-safe target encodings for Layer 1 (02 §4: item_diff_oof, kc_diff_oof, cur_option_share_oof).

oof_encode(): for rows in the *training* set the value comes from the other training folds (inner OOF);
for rows outside it (validation / test) the value comes from all training rows. Validation/test labels
are never read. Smoothed toward the global training mean with `prior` pseudo-counts.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def _smoothed_mean(keys: pd.DataFrame, y: pd.Series, prior: float, global_mean: float) -> pd.Series:
    g = y.groupby([keys[c] for c in keys.columns]).agg(["sum", "count"])
    return (g["sum"] + prior * global_mean) / (g["count"] + prior)


def oof_encode(df: pd.DataFrame, key_cols: list[str], target: pd.Series, train_mask: np.ndarray,
               inner_fold: np.ndarray, prior: float = 20.0) -> np.ndarray:
    """Mean of `target` by key_cols. Only rows with train_mask=True (and non-NaN target) are read."""
    train_mask = np.asarray(train_mask, bool)
    target = pd.Series(np.asarray(target, dtype="float64"), index=df.index)
    keys = df[key_cols]
    out = np.full(len(df), np.nan)
    tr_idx = np.where(train_mask & target.notna().to_numpy())[0]
    gm = float(target.iloc[tr_idx].mean()) if len(tr_idx) else np.nan

    def apply(src_idx, dst_idx):
        if len(dst_idx) == 0:
            return
        m = _smoothed_mean(keys.iloc[src_idx], target.iloc[src_idx], prior, gm)
        dst_keys = pd.MultiIndex.from_frame(keys.iloc[dst_idx]) if len(key_cols) > 1 else keys.iloc[dst_idx][key_cols[0]]
        vals = m.reindex(dst_keys).to_numpy(dtype="float64")
        out[dst_idx] = np.where(np.isnan(vals), gm, vals)

    # validation / test rows: all training rows
    apply(tr_idx, np.where(~train_mask)[0])
    # training rows: inner OOF over the training folds
    inner = np.asarray(inner_fold)
    for f in np.unique(inner[train_mask]):
        src = tr_idx[inner[tr_idx] != f]
        dst = np.where(train_mask & (inner == f))[0]
        apply(src, dst)
    return out.astype("float32")


def add_fold_encodings(df: pd.DataFrame, train_mask: np.ndarray, inner_fold: np.ndarray) -> pd.DataFrame:
    """item_diff_oof, kc_diff_oof (P(correct)) and cur_option_share_oof (share of the chosen option among
    wrong answers to the question; NaN-free: 0 for correct answers)."""
    d = df.copy()
    y = d["IsCorrect"].astype("float64")
    d["item_diff_oof"] = oof_encode(d, ["QuestionId"], y, train_mask, inner_fold)
    d["kc_diff_oof"] = oof_encode(d, ["kc"], y, train_mask, inner_fold)
    # P(option o | question q, wrong) : encode indicator "row chose o" among wrong rows of (q)
    wrong = d["IsCorrect"].eq(0).to_numpy()
    share = np.zeros(len(d), dtype="float32")
    # for each option value o, encode 1[AnswerValue==o] over wrong rows by QuestionId, then pick chosen option
    for o in sorted(d["AnswerValue"].dropna().unique()):
        t = pd.Series(np.where(wrong, (d["AnswerValue"] == o).astype(float), np.nan), index=d.index)
        enc = oof_encode(d, ["QuestionId"], t, train_mask, inner_fold, prior=5.0)
        pick = wrong & (d["AnswerValue"] == o).to_numpy()
        share[pick] = enc[pick]
    d["cur_option_share_oof"] = share
    return d
