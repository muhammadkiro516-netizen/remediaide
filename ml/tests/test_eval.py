"""Metric/stat utilities vs references (sklearn, brute-force DeLong, hand-computed MAP@3)."""

import numpy as np
import pytest
from sklearn.metrics import f1_score, roc_auc_score

from remediaide_ml.eval import metrics as M
from remediaide_ml.eval import stats as S

rng = np.random.default_rng(0)


def test_auc_and_macro_f1_match_sklearn():
    y = rng.integers(0, 2, 300)
    s = y * 0.5 + rng.random(300)
    assert M.auc(y, s) == pytest.approx(roc_auc_score(y, s))
    yp = rng.integers(0, 3, 300)
    yt = rng.integers(0, 3, 300)
    assert M.macro_f1(yt, yp) == pytest.approx(f1_score(yt, yp, average="macro"))


def test_map_at_3_hand_examples():
    y = ["a", "b", "c", "d"]
    preds = [["a", "x", "y"], ["x", "b", "y"], ["x", "y", "c"], ["x", "y", "z"]]
    assert M.map_at_k(y, preds) == pytest.approx((1 + 0.5 + 1 / 3 + 0) / 4)
    # duplicates are collapsed (Kaggle behaviour): ["x","x","a"] -> rank of a is 2
    assert M.map_at_k(["a"], [["x", "x", "a"]]) == pytest.approx(0.5)


def test_topk_from_proba():
    p = np.array([[0.1, 0.7, 0.2], [0.5, 0.2, 0.3]])
    assert M.topk_from_proba(p, ["a", "b", "c"], 2) == [["b", "c"], ["a", "c"]]


def test_ece_perfect_and_bad():
    y = np.array([1, 0] * 500)
    assert M.ece(y, np.full(1000, 0.5)) == pytest.approx(0.0, abs=1e-12)
    assert M.ece(y, np.where(y == 1, 1.0, 0.0)) == pytest.approx(0.0, abs=1e-12)
    assert M.ece(np.ones(100), np.full(100, 0.6)) == pytest.approx(0.4)
    proba = np.array([[0.9, 0.1], [0.8, 0.2]])
    assert M.ece(np.array([0, 1]), proba) == pytest.approx(0.5 * 0.1 + 0.5 * 0.8)


def test_misgroup_rate():
    assert M.misgroup_rate(["P", "L", "M"], ["P", "M", "M"]) == pytest.approx(1 / 3)


def _brute_delong(y, a, b):
    """Original DeLong et al. (1988) structural components, O(m*n)."""
    def comps(s):
        pos, neg = s[y == 1], s[y == 0]
        psi = (pos[:, None] > neg[None, :]) + 0.5 * (pos[:, None] == neg[None, :])
        return psi.mean(), psi.mean(axis=1), psi.mean(axis=0)
    A, va, wa = comps(a)
    B, vb, wb = comps(b)
    m, n = (y == 1).sum(), (y == 0).sum()
    s10 = np.cov(np.vstack([va, vb]))
    s01 = np.cov(np.vstack([wa, wb]))
    cov = s10 / m + s01 / n
    return A, B, cov


def test_fast_delong_matches_bruteforce():
    y = rng.integers(0, 2, 400)
    a = np.round(y + rng.normal(0, 1, 400), 1)      # ties included
    b = np.round(0.5 * y + rng.normal(0, 1, 400), 1)
    A, B, cov = _brute_delong(y, a, b)
    r = S.delong_test(y, a, b)
    assert r["auc_a"] == pytest.approx(A) and r["auc_a"] == pytest.approx(roc_auc_score(y, a))
    assert r["auc_b"] == pytest.approx(B)
    assert r["var_a"] == pytest.approx(cov[0, 0])
    assert r["var_b"] == pytest.approx(cov[1, 1])
    z = (A - B) / np.sqrt(cov[0, 0] + cov[1, 1] - 2 * cov[0, 1])
    assert r["z"] == pytest.approx(z)


def test_delong_identical_scores_p1():
    y = rng.integers(0, 2, 200)
    s = rng.random(200)
    assert S.delong_test(y, s, s)["p"] == pytest.approx(1.0)


def test_holm():
    adj = S.holm([0.01, 0.04, 0.03])
    assert adj.tolist() == pytest.approx([0.03, 0.06, 0.06])


def test_mcnemar_counts():
    y = np.array([1, 1, 1, 0, 0, 0])
    a = np.array([1, 1, 1, 0, 0, 1])
    b = np.array([1, 0, 0, 0, 0, 0])
    r = S.mcnemar_test(y, a, b)
    assert r["a_only_correct"] == 2 and r["b_only_correct"] == 1 and r["exact"]


def test_cluster_bootstrap_ci_contains_point_and_is_deterministic():
    clusters = np.repeat(np.arange(100), 5)
    y = rng.integers(0, 2, 500)
    s = y + rng.normal(0, 1, 500)
    r1 = S.cluster_bootstrap_ci(M.auc, (y, s), clusters, n_boot=200)
    r2 = S.cluster_bootstrap_ci(M.auc, (y, s), clusters, n_boot=200)
    assert r1 == r2
    assert r1["lo"] <= r1["point"] <= r1["hi"]
    assert r1["n_boot_ok"] == 200


def test_confusion_bootstrap_point_matches_sklearn():
    from sklearn.metrics import f1_score

    y = rng.choice(list("PLMT"), 2000)
    p = np.where(rng.random(2000) < 0.6, y, rng.choice(list("PLMT"), 2000))
    cl = rng.integers(0, 150, 2000)
    _, counts = S.cluster_confusion_counts(y, p, cl, list("PLMT"))
    r = S.bootstrap_confusion_metric(counts, S.cm_macro_f1, n_boot=200)
    assert r["point"] == pytest.approx(f1_score(y, p, average="macro"))
    assert S.cm_misgroup(counts.sum(0)) == pytest.approx(np.mean(y != p))
    assert r["lo"] < r["point"] < r["hi"]
