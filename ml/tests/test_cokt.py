"""CO-KT smoke + causality tests on synthetic data (CPU, seconds)."""

import numpy as np
import pytest

torch = pytest.importorskip("torch")

from remediaide_ml.features.history import add_history_features  # noqa: E402
from remediaide_ml.features.labels import add_future_labels  # noqa: E402
from remediaide_ml.l1.cokt import CoktConfig, _model, build_sequences, train_eval, vocabularies  # noqa: E402
from tests.test_features_leakage import synth  # noqa: E402


def _data():
    d = synth(n_users=30, n_rows=40)
    d["seq_pos"] = d.groupby("UserId").cumcount()
    return add_future_labels(add_history_features(d))


def test_sequences_windows_and_padding():
    d = _data()
    qv, kv = vocabularies(d)
    s = build_sequences(d, qv, kv, max_len=16)
    assert s["q"].shape[1] == 16
    assert s["len"].sum() == len(d)
    assert (s["q"][:, 0] > 0).all()                      # windows start with a real token
    assert set(np.unique(s["cri"])) <= set(range(7))


def test_next_correct_is_causal():
    """Changing step t+1.. must not change the prediction for step t+1 (which may use only <= t)."""
    d = _data()
    qv, kv = vocabularies(d)
    s = build_sequences(d, qv, kv, max_len=20)
    cfg = CoktConfig(d_model=32, n_layers=1, n_heads=2, d_ff=64, dropout=0.0, max_len=20)
    m = _model(len(qv), len(kv), cfg).eval()
    b = {k: torch.as_tensor(s[k][:2]) for k in ("q", "kc", "corr", "opt", "cri", "gap", "quad")}
    lc1, _, lq1 = m(b)
    b2 = {k: v.clone() for k, v in b.items()}
    t = 8
    b2["corr"][:, t + 1:] = 1 - b2["corr"][:, t + 1:]
    b2["cri"][:, t + 1:] = 6
    lc2, _, lq2 = m(b2)
    # prediction index i targets step i+1 and may use steps <= i
    torch.testing.assert_close(lc1[:, : t + 1], lc2[:, : t + 1])
    torch.testing.assert_close(lq1[:, : t + 1], lq2[:, : t + 1])


def test_training_smoke_loss_and_outputs():
    d = _data()
    qv, kv = vocabularies(d)
    s = build_sequences(d, qv, kv, max_len=20)
    idx = np.arange(len(s["len"]))
    cfg = CoktConfig(d_model=32, n_layers=1, n_heads=2, d_ff=64, max_len=20, batch_size=8, patience=1)
    pred, rep, _ = train_eval(s, idx[: len(idx) * 3 // 4], idx[len(idx) * 3 // 4:], len(qv), len(kv), cfg, seed=0,
                              max_epochs=2, log=lambda m: None)
    assert len(rep["history"]) >= 1
    p = pred.dropna(subset=["p_next"])
    assert ((p.p_next > 0) & (p.p_next < 1)).all()
    q = pred.dropna(subset=["pq_P"])[[f"pq_{c}" for c in "PLMT"]].sum(axis=1)
    np.testing.assert_allclose(q, 1.0, rtol=1e-5)
