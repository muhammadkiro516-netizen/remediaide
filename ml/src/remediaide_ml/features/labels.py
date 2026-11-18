"""Future-quadrant proxy label (docs/cac/02_DATA_SPEC.md §5, DECISIONS D-05).

For row t in KC k: the next K=3 attempts of the same student in the same KC (at least 2 needed).
fut_acc  = mean correctness in the window; fut_conf = mean CRI over window rows that have confidence.
mastered = fut_acc >= 2/3; confident = fut_conf >= 3.
Quadrant P/L/M/T as in B0. `needs_remediation` (butuh_remediasi) = not mastered (defined without confidence).
Rows with < 2 future attempts: no label. Rows with a window but no confidence in it: binary label only.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from remediaide_ml.cri_rule import CRI_HIGH_THRESHOLD

MASTERY_THRESHOLD = 2 / 3


def add_future_labels(df: pd.DataFrame, k: int = 3, min_future: int = 2) -> pd.DataFrame:
    d = df.copy()
    uk = [d["UserId"], d["kc"]]
    y = d["IsCorrect"].astype("float32")
    has = d["has_conf"].astype(bool)
    cri = d["cri"].astype("float32").where(has)
    ys, cs = [], []
    g_y = y.groupby(uk, sort=False)
    g_c = cri.groupby(uk, sort=False)
    for j in range(1, k + 1):
        ys.append(g_y.shift(-j))
        cs.append(g_c.shift(-j))
    Y = pd.concat(ys, axis=1)
    C = pd.concat(cs, axis=1)
    n_fut = Y.notna().sum(axis=1)
    fut_acc = Y.mean(axis=1, skipna=True)
    fut_conf = C.mean(axis=1, skipna=True)
    ok = n_fut >= min_future
    d["n_future"] = n_fut.astype("int8")
    d["fut_acc"] = fut_acc.where(ok).astype("float32")
    d["fut_conf"] = fut_conf.where(ok).astype("float32")
    mastered = d["fut_acc"] >= MASTERY_THRESHOLD - 1e-9
    confident = d["fut_conf"] >= CRI_HIGH_THRESHOLD
    quad = np.select([mastered & confident, mastered & ~confident, ~mastered & confident, ~mastered & ~confident],
                     ["P", "L", "M", "T"], default="")
    lab4 = pd.Series(quad, index=d.index, dtype="object")
    lab4[~ok.to_numpy() | d["fut_conf"].isna().to_numpy()] = pd.NA
    d["fut_quadrant"] = lab4.astype("string")
    d["needs_remediation"] = (~mastered).astype("Int8").where(ok)
    return d
