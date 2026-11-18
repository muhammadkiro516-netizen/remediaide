"""Locked data splits (docs/cac/02_DATA_SPEC.md §6, DECISIONS D-04, D-06).

Eedi: 20% of UserId -> locked test; remaining users -> GroupKFold(5, shuffled, seeded) by UserId.
      Robustness: for test users, last 20% of each timeline flagged `test_temporal`.
MAP : (i) StratifiedKFold(5) on `target` ("fold_random"); (ii) GroupKFold(5) by QuestionId ("fold_question").
Calibration split: 20% of groups inside each training fold set (see calibration_groups()).
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.model_selection import GroupKFold, StratifiedKFold

from remediaide_ml.paths import INTERIM, PROCESSED
from remediaide_ml.seed import GLOBAL_SEED

TEST = -1  # fold id for the locked Eedi test users


def eedi_user_splits(user_ids, test_frac: float = 0.20, n_folds: int = 5, seed: int = GLOBAL_SEED) -> pd.DataFrame:
    """UserId -> fold (0..n_folds-1) or TEST (-1). Deterministic given the set of users and seed."""
    users = np.sort(pd.unique(np.asarray(user_ids)))
    rng = np.random.default_rng(seed)
    perm = rng.permutation(len(users))
    n_test = int(round(test_frac * len(users)))
    fold = np.empty(len(users), dtype=np.int8)
    fold[perm[:n_test]] = TEST
    rest = perm[n_test:]
    gkf = GroupKFold(n_splits=n_folds, shuffle=True, random_state=seed)
    for k, (_, va) in enumerate(gkf.split(rest, groups=users[rest])):
        fold[rest[va]] = k
    return pd.DataFrame({"UserId": users, "fold": fold})


def temporal_test_flag(df: pd.DataFrame, frac: float = 0.20) -> pd.Series:
    """True for the last `frac` of each user's interactions (df must be time-sorted within user)."""
    pos = df.groupby("UserId").cumcount()
    n = df.groupby("UserId")["UserId"].transform("size")
    return pos >= np.ceil((1 - frac) * n).astype(int)


def map_splits(df: pd.DataFrame, n_folds: int = 5, seed: int = GLOBAL_SEED) -> pd.DataFrame:
    """row_id -> fold_random (stratified on target) and fold_question (grouped by QuestionId)."""
    out = pd.DataFrame({"row_id": df["row_id"].values, "QuestionId": df["QuestionId"].values})
    out["fold_random"] = -1
    out["fold_question"] = -1
    skf = StratifiedKFold(n_splits=n_folds, shuffle=True, random_state=seed)
    import warnings

    with warnings.catch_warnings():  # rare targets (<n_folds members) trigger a sklearn warning; expected
        warnings.simplefilter("ignore", UserWarning)
        for k, (_, va) in enumerate(skf.split(df, df["target"])):
            out.loc[va, "fold_random"] = k
    gkf = GroupKFold(n_splits=n_folds, shuffle=True, random_state=seed)
    for k, (_, va) in enumerate(gkf.split(df, groups=df["QuestionId"])):
        out.loc[va, "fold_question"] = k
    return out.astype({"fold_random": "int8", "fold_question": "int8"})


def calibration_groups(groups, frac: float = 0.20, seed: int = GLOBAL_SEED) -> np.ndarray:
    """Boolean mask over rows: True if the row's group is in the calibration subset (group-level)."""
    groups = np.asarray(groups)
    uniq = np.sort(pd.unique(groups))
    rng = np.random.default_rng(seed + 7)
    cal = set(rng.choice(uniq, size=max(1, int(round(frac * len(uniq)))), replace=False).tolist())
    return np.isin(groups, list(cal))


def build_map_splits() -> pd.DataFrame:
    df = pd.read_parquet(INTERIM / "map.parquet")
    sp = map_splits(df)
    PROCESSED.mkdir(parents=True, exist_ok=True)
    sp.to_parquet(PROCESSED / "map_splits.parquet", index=False)
    return sp


def build_eedi_splits() -> pd.DataFrame:
    df = pd.read_parquet(INTERIM / "eedi_t34.parquet", columns=["UserId"])
    sp = eedi_user_splits(df["UserId"])
    PROCESSED.mkdir(parents=True, exist_ok=True)
    sp.to_parquet(PROCESSED / "eedi_splits.parquet", index=False)
    return sp


if __name__ == "__main__":
    import sys

    which = sys.argv[1:] or ["map", "eedi"]
    if "map" in which:
        sp = build_map_splits()
        print("MAP random folds:", sp.fold_random.value_counts().sort_index().to_dict())
        print("MAP question folds:", sp.groupby("fold_question").QuestionId.unique().map(sorted).to_dict())
    if "eedi" in which:
        sp = build_eedi_splits()
        print("Eedi users per fold:", sp.fold.value_counts().sort_index().to_dict())
