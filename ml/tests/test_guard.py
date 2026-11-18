"""Guard module on simulated data only (not a reported result)."""

import numpy as np

from remediaide_ml.guard.rapid_guess import (
    agreement,
    evaluate_flags,
    flag,
    gmm_thresholds,
    nt_thresholds,
    simulate,
    tau_min_b0_ms,
)


def test_nt_threshold_is_pct_of_mean():
    d = simulate(n_items=3, n_students=50)
    thr = nt_thresholds(d, 0.10)
    np.testing.assert_allclose(thr.values, d.groupby("item_id").rt_ms.mean().values * 0.10)


def test_gmm_recovers_simulated_guesses():
    d = simulate(guess_rate=0.15, seed=1)
    f = flag(d, gmm_thresholds(d))
    tg = d.true_guess.astype(bool)
    recall = (f & tg).sum() / tg.sum()
    precision = (f & tg).sum() / max(1, f.sum())
    assert recall > 0.9 and precision > 0.9
    ev = evaluate_flags(d, {"gmm": f})
    assert abs(ev.acc_flagged.iloc[0] - 0.25) < 0.08     # flagged ~ chance accuracy


def test_small_items_pooled_and_b0_tau():
    d = simulate(n_items=4, n_students=10)                 # < 30 per item -> pooled by word bucket
    thr = gmm_thresholds(d, min_n=30)
    assert set(thr.index) == set(range(4))
    assert tau_min_b0_ms(d.n_words.head(1)).iloc[0] == int(np.ceil(d.n_words.iloc[0] / 2.5)) * 1000


def test_agreement_matrix_symmetric():
    d = simulate(n_items=5, n_students=100)
    fl = {"nt10": flag(d, nt_thresholds(d, .1)), "nt30": flag(d, nt_thresholds(d, .3)), "gmm": flag(d, gmm_thresholds(d))}
    m = agreement(fl)
    np.testing.assert_allclose(m.values, m.values.T)
    assert (np.diag(m.values) == 1).all()
