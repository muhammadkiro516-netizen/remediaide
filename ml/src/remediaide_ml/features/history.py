"""Layer-1 history features, strictly past-only (docs/cac/02_DATA_SPEC.md §4, T14).

Input: interim Eedi frame sorted by (UserId, DateAnswered, AnswerId) — as written by data/eedi.py.
All features for row t use rows < t of the same student (framing a). Framing (b) adds the signals of
row t itself (cur_*), which the teacher already sees after the answer.

Fold-dependent encodings (item/KC difficulty, option popularity) live in features/encoding.py and are
computed per CV fold, never here.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from remediaide_ml.cri_rule import CRI_HIGH_THRESHOLD

QUADRANTS = ("P", "L", "M", "T")  # Paham, Lucky guess, Miskonsepsi, Tidak paham (B0 quadrants)
Q_CODE = {q: i for i, q in enumerate(QUADRANTS)}
EWM_ALPHA = 0.3


def b0_quadrant(is_correct: pd.Series, cri: pd.Series) -> pd.Series:
    """Vectorised cri_rule.classify_quadrant -> 'P'/'L'/'M'/'T'; <NA> where confidence is missing."""
    high = (cri.astype("float32") >= CRI_HIGH_THRESHOLD).fillna(False).to_numpy(bool)
    corr = is_correct.astype(bool).to_numpy()
    q = np.select([corr & high, corr & ~high, ~corr & high, ~corr & ~high], list(QUADRANTS), default="")
    out = pd.Series(q, index=is_correct.index, dtype="object")
    out[cri.isna().to_numpy()] = pd.NA
    return out.astype("string")


def _shifted_cumsum(x: pd.Series, keys: list[pd.Series]) -> pd.Series:
    """Sum of x over strictly earlier rows of the same group."""
    return x.groupby(keys, sort=False).cumsum() - x


def add_history_features(df: pd.DataFrame) -> pd.DataFrame:
    """Return a copy of df with past-only features (framing a) and cur_* signals (framing b)."""
    d = df.copy()
    u = d["UserId"]
    uk = [d["UserId"], d["kc"]]
    y = d["IsCorrect"].astype("float32")
    has = d["has_conf"].astype(bool)
    cri = d["cri"].astype("float32")
    cri0 = cri.fillna(0.0)

    # --- correctness history
    d["n_prev"] = d.groupby(u, sort=False).cumcount().astype("int32")
    d["acc_prev"] = (_shifted_cumsum(y, [u]) / d["n_prev"].replace(0, np.nan)).astype("float32")
    d["n_prev_kc"] = d.groupby(uk, sort=False).cumcount().astype("int32")
    d["acc_prev_kc"] = (_shifted_cumsum(y, uk) / d["n_prev_kc"].replace(0, np.nan)).astype("float32")
    # EWM of correctness in KC including row t, then shifted by one within group -> strictly past
    ewm_incl = y.groupby(uk, sort=False).transform(lambda s: s.ewm(alpha=EWM_ALPHA, adjust=True).mean())
    d["ewm_acc_kc"] = ewm_incl.groupby(uk, sort=False).shift(1).astype("float32")

    # --- confidence history (only rows that have confidence)
    hasf = has.astype("float32")
    n_conf = _shifted_cumsum(hasf, [u])
    n_conf_kc = _shifted_cumsum(hasf, uk)
    d["conf_mean_prev"] = (_shifted_cumsum(cri0 * hasf, [u]) / n_conf.replace(0, np.nan)).astype("float32")
    d["conf_mean_prev_kc"] = (_shifted_cumsum(cri0 * hasf, uk) / n_conf_kc.replace(0, np.nan)).astype("float32")
    over = (cri0 / 5.0 - y) * hasf
    d["overconf_prev"] = (_shifted_cumsum(over, [u]) / n_conf.replace(0, np.nan)).astype("float32")

    # --- B0 quadrant history in KC
    quad = b0_quadrant(d["IsCorrect"], d["cri"])
    for q in QUADRANTS:
        ind = (quad == q).fillna(False).astype("int32")
        d[f"cnt_{q}_kc"] = _shifted_cumsum(ind, uk).astype("int32")
    qcode = quad.map(Q_CODE).astype("float32")  # NaN when no confidence
    # last known quadrant before t in the KC (forward-fill within group, then shift)
    last = qcode.groupby(uk, sort=False).ffill()
    d["last_quadrant_kc"] = last.groupby(uk, sort=False).shift(1).astype("float32")

    # --- time
    t = d["DateAnswered"]
    d["hours_since_prev"] = (t - t.groupby(u, sort=False).shift(1)).dt.total_seconds().div(3600).astype("float32")
    d["hours_since_prev_kc"] = (t - t.groupby(uk, sort=False).shift(1)).dt.total_seconds().div(3600).astype("float32")

    # --- framing (b): current signals
    d["cur_correct"] = d["IsCorrect"].astype("int8")
    d["cur_cri"] = cri
    d["cur_has_conf"] = has.astype("int8")
    d["cur_quadrant_b0"] = qcode
    d["quadrant_b0"] = quad
    return d


FEATURES_A = ["n_prev", "acc_prev", "n_prev_kc", "acc_prev_kc", "ewm_acc_kc", "conf_mean_prev", "conf_mean_prev_kc",
              "overconf_prev", "cnt_P_kc", "cnt_L_kc", "cnt_M_kc", "cnt_T_kc", "last_quadrant_kc", "hours_since_prev",
              "hours_since_prev_kc", "attempt_no"]
FEATURES_B_CUR = ["cur_correct", "cur_cri", "cur_has_conf", "cur_quadrant_b0"]
# fold-dependent (features/encoding.py)
FEATURES_OOF = ["item_diff_oof", "kc_diff_oof"]
FEATURES_B_OOF = ["cur_option_share_oof"]
