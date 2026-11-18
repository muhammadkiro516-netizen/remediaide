"""Layer 3 on synthetic data: calibration improves ECE, conformal covers ~1-alpha, D-09 rule, fusion normalised."""

import numpy as np
import pandas as pd
import pytest

from remediaide_ml.eval.metrics import ece
from remediaide_ml.l3.calibration import IsotonicBinary, IsotonicMulticlass, Temperature
from remediaide_ml.l3.conformal import APS, LAC, avg_set_size, coverage
from remediaide_ml.l3.fusion import StackingFusion, hidden_misconception, naive_bayes_fusion
from remediaide_ml.l3.selective import choose_operating_point, coverage_risk, defer_mask, doubt_max_prob

rng = np.random.default_rng(0)


def _multiclass(n=6000, K=4, temp=3.0):
    logits = rng.normal(0, 1, (n, K)) * 2
    p_true = np.exp(logits) / np.exp(logits).sum(1, keepdims=True)
    y = np.array([rng.choice(K, p=p) for p in p_true])
    over = np.exp(logits * temp) / np.exp(logits * temp).sum(1, keepdims=True)  # overconfident model
    return logits * temp, over, y


def test_isotonic_binary_reduces_ece():
    p_true = rng.random(8000)
    y = (rng.random(8000) < p_true).astype(int)
    p_model = p_true ** 3
    cal = IsotonicBinary().fit(p_model[:4000], y[:4000])
    assert ece(y[4000:], cal.predict(p_model[4000:])) < ece(y[4000:], p_model[4000:]) / 2


def test_temperature_and_isotonic_multiclass():
    L, P, y = _multiclass()
    t = Temperature().fit(L[:3000], y[:3000])
    assert t.T > 1.5                               # recovers the over-sharpening
    assert ece(y[3000:], t.predict(L[3000:])) < ece(y[3000:], P[3000:])
    iso = IsotonicMulticlass().fit(P[:3000], y[:3000])
    Q = iso.predict(P[3000:])
    np.testing.assert_allclose(Q.sum(1), 1, rtol=1e-6)


@pytest.mark.parametrize("cls", [LAC, APS])
def test_conformal_coverage(cls):
    L, P, y = _multiclass(n=10000, temp=1.0)
    c = cls(alpha=0.1).fit(P[:5000], y[:5000])
    S = c.predict_set(P[5000:])
    cov = coverage(S, y[5000:])
    assert 0.88 <= cov <= 0.93
    assert S.any(axis=1).all()
    assert 1 <= avg_set_size(S) <= 4


def test_selective_and_d09_rule():
    p = rng.random((5000, 4))
    p /= p.sum(1, keepdims=True)
    y = p.argmax(1).copy()
    doubt = doubt_max_prob(p)
    err_prob = np.clip(doubt * 1.5, 0, 1)
    error = rng.random(5000) < err_prob
    curve = coverage_risk(error, doubt)
    assert curve.risk.iloc[0] == pytest.approx(error.mean())
    assert curve.risk.is_monotonic_decreasing or curve.risk.iloc[-1] < curve.risk.iloc[0]
    assert defer_mask(doubt, 0.2).mean() == pytest.approx(0.2)
    op = choose_operating_point(pd.DataFrame({"defer_rate": [0, .05, .1, .15, .2, .25, .3],
                                              "relative_reduction": [0, .1, .2, .26, .3, .4, .5]}))
    assert op["defer_rate"] == 0.15
    op2 = choose_operating_point(pd.DataFrame({"defer_rate": [0, .1, .3], "relative_reduction": [0, .1, .2]}))
    assert op2["defer_rate"] == 0.20


def test_naive_bayes_fusion():
    p1 = np.array([[0.25, 0.25, 0.25, 0.25], [0.7, 0.1, 0.1, 0.1]])
    p2 = np.array([[0.9, 0.05, 0.05], [np.nan, np.nan, np.nan]])
    f = naive_bayes_fusion(p1, p2, mastery_prior=0.5)
    np.testing.assert_allclose(f.sum(1), 1)
    assert f[0, :2].sum() == pytest.approx(0.9)            # uniform L1 -> mastery follows L2
    np.testing.assert_allclose(f[1], p1[1])                # no explanation -> L1 unchanged
    # neutral L2 (equal to prior) leaves L1 unchanged
    g = naive_bayes_fusion(p1[1:], np.array([[0.5, 0.25, 0.25]]), mastery_prior=0.5)
    np.testing.assert_allclose(g[0], p1[1])


def test_stacking_and_hidden_flag():
    p1 = rng.dirichlet(np.ones(4), 400)
    p2 = rng.dirichlet(np.ones(3), 400)
    y = p1.argmax(1)
    st = StackingFusion().fit(p1, p2, y)
    P = st.predict_proba(p1, None)
    np.testing.assert_allclose(P.sum(1), 1)
    h = hidden_misconception(np.array([1, 1, 0]), np.array([0.6, 0.2, 0.9]), 0.5)
    assert h.tolist() == [True, False, False]
