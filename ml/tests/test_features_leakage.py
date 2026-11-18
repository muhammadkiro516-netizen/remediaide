"""Mandatory leakage tests (docs/cac/02_DATA_SPEC.md §4) + label checks, on synthetic data only."""

import numpy as np
import pandas as pd
import pytest

from remediaide_ml.data.splits import TEST, eedi_user_splits
from remediaide_ml.features.encoding import add_fold_encodings, oof_encode
from remediaide_ml.features.history import FEATURES_A, add_history_features
from remediaide_ml.features.labels import add_future_labels


def synth(n_users=40, n_rows=30, seed=0) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows = []
    for u in range(n_users):
        t0 = pd.Timestamp("2020-01-01") + pd.Timedelta(days=int(rng.integers(0, 30)))
        for i in range(n_rows):
            q = int(rng.integers(0, 12))
            corr = int(rng.random() < 0.6)
            conf = float(rng.choice([0, 25, 50, 75, 100])) if rng.random() < 0.7 else np.nan
            rows.append({"UserId": u, "QuestionId": q, "AnswerId": u * 1000 + i, "kc": q % 4,
                         "DateAnswered": t0 + pd.Timedelta(hours=i * 3 + float(rng.random())),
                         "IsCorrect": corr, "AnswerValue": int(rng.integers(1, 5)), "Confidence": conf})
    d = pd.DataFrame(rows).sort_values(["UserId", "DateAnswered", "AnswerId"]).reset_index(drop=True)
    d["has_conf"] = d["Confidence"].notna()
    d["cri"] = np.minimum(5, np.floor((d["Confidence"] + 10) / 20)).astype("Int8")
    d["attempt_no"] = d.groupby(["UserId", "QuestionId"]).cumcount() + 1
    return d


def test_future_rows_do_not_change_past_features():
    """Leakage test 1: dropping or shuffling a student's future rows leaves earlier features unchanged."""
    d = synth()
    full = add_history_features(d)
    cut = 15
    keep = d.groupby("UserId").cumcount() < cut
    trunc = add_history_features(d[keep].reset_index(drop=True))
    a = full[keep.to_numpy()].reset_index(drop=True)[FEATURES_A]
    pd.testing.assert_frame_equal(a, trunc[FEATURES_A], check_dtype=False)
    # scramble outcomes/confidence of future rows -> past features identical
    d2 = d.copy()
    fut = ~keep
    rng = np.random.default_rng(1)
    d2.loc[fut, "IsCorrect"] = rng.integers(0, 2, fut.sum())
    d2.loc[fut, "cri"] = pd.array(rng.integers(0, 6, fut.sum()), dtype="Int8")
    f2 = add_history_features(d2)
    pd.testing.assert_frame_equal(full.loc[keep, FEATURES_A], f2.loc[keep, FEATURES_A], check_dtype=False)


def test_history_values_hand_check():
    d = synth(n_users=1, n_rows=6, seed=3)
    f = add_history_features(d)
    y = d.IsCorrect.to_numpy().astype(float)
    assert f.n_prev.tolist() == list(range(6))
    assert np.isnan(f.acc_prev.iloc[0])
    for t in range(1, 6):
        assert f.acc_prev.iloc[t] == pytest.approx(y[:t].mean())
    # KC-level accuracy uses only earlier rows of the same KC
    for t in range(6):
        prev = d.iloc[:t]
        prev = prev[prev.kc == d.kc.iloc[t]]
        if len(prev):
            assert f.acc_prev_kc.iloc[t] == pytest.approx(prev.IsCorrect.mean())
        else:
            assert np.isnan(f.acc_prev_kc.iloc[t])


def test_item_diff_oof_ignores_validation_labels():
    """Leakage test 2: item_diff_oof on validation rows does not use validation rows."""
    d = synth()
    sp = eedi_user_splits(d.UserId, test_frac=0.2, n_folds=5)
    fold = d.UserId.map(dict(zip(sp.UserId, sp.fold, strict=True))).to_numpy()
    k = 0
    train = (fold != k) & (fold != TEST)
    e1 = add_fold_encodings(d, train, fold)
    d2 = d.copy()
    d2.loc[~train, "IsCorrect"] = 1 - d2.loc[~train, "IsCorrect"]          # flip all non-train labels
    d2.loc[~train, "AnswerValue"] = 1
    e2 = add_fold_encodings(d2, train, fold)
    for c in ("item_diff_oof", "kc_diff_oof"):
        np.testing.assert_allclose(e1.loc[~train, c], e2.loc[~train, c])
        np.testing.assert_allclose(e1.loc[train, c], e2.loc[train, c])


def test_oof_inner_folds_exclude_own_fold():
    d = pd.DataFrame({"QuestionId": [1, 1, 1, 1], "y": [1.0, 1.0, 0.0, 0.0]})
    inner = np.array([0, 0, 1, 1])
    v = oof_encode(d, ["QuestionId"], d.y, np.ones(4, bool), inner, prior=0.0)
    assert v.tolist() == [0.0, 0.0, 1.0, 1.0]  # fold-0 rows see only fold-1 labels and vice versa


def test_no_user_in_two_splits():
    """Leakage test 3: a UserId is never in more than one fold / test."""
    sp = eedi_user_splits(np.arange(1000), test_frac=0.2, n_folds=5)
    assert sp.UserId.is_unique
    assert (sp.fold == TEST).sum() == 200
    assert set(sp.fold.unique()) == {TEST, 0, 1, 2, 3, 4}
    # deterministic
    pd.testing.assert_frame_equal(sp, eedi_user_splits(np.arange(1000), test_frac=0.2, n_folds=5))


def test_future_labels():
    d = pd.DataFrame({"UserId": [1] * 5, "kc": [7] * 5, "IsCorrect": [0, 1, 1, 0, 1],
                      "cri": pd.array([1, 4, 5, None, 2], dtype="Int8"),
                      "has_conf": [True, True, True, False, True]})
    lab = add_future_labels(d, k=3, min_future=2)
    # row0 window rows1-3: acc 2/3 -> mastered; conf mean(4,5)=4.5 -> P
    assert lab.fut_quadrant.iloc[0] == "P" and lab.needs_remediation.iloc[0] == 0
    # row2 window rows3-4: acc 1/2 -> not mastered; conf 2 -> T
    assert lab.fut_quadrant.iloc[2] == "T" and lab.needs_remediation.iloc[2] == 1
    # row3 window row4 only -> no label
    assert pd.isna(lab.fut_quadrant.iloc[3]) and pd.isna(lab.needs_remediation.iloc[3])
    assert lab.n_future.tolist() == [3, 3, 2, 1, 0]


def test_vector_quadrant_equals_b0_scalar():
    from remediaide_ml.cri_rule import classify_quadrant
    from remediaide_ml.features.history import b0_quadrant

    name = {"PAHAM_KONSEP": "P", "LUCKY_GUESS": "L", "MISKONSEPSI": "M", "TIDAK_PAHAM": "T"}
    corr = pd.Series([c for c in (0, 1) for _ in range(6)])
    cri = pd.Series(list(range(6)) * 2, dtype="Int8")
    v = b0_quadrant(corr, cri)
    for c, r, q in zip(corr, cri, v, strict=True):
        assert name[classify_quadrant(bool(c), int(r))] == q
    assert pd.isna(b0_quadrant(pd.Series([1]), pd.Series([None], dtype="Int8")).iloc[0])
