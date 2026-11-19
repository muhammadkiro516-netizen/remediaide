"""T43: diagnose() on the real production artefacts (skipped when models/ is not populated)."""
import numpy as np
import pytest

from remediaide_ml.paths import MODELS

from .test_diagnose_contract import payload

# binary artefacts are git-ignored (models/README.md); skip on a fresh clone until `make l3` has exported them
needs_models = pytest.mark.skipif(not any((MODELS / "l1_cokt_v1").glob("*.pt"))
                                  or not (MODELS / "l1_lgbm_v1" / "model_b4_fold0.txt").exists()
                                  or not (MODELS / "l3_conformal_v1.json").exists(),
                                  reason="production artefacts not present")


@needs_models
def test_real_bundle_probabilities_valid():
    from remediaide_ml.bundle import load_bundle
    from remediaide_ml.diagnose import diagnose

    b = load_bundle()
    assert b.model_version.startswith("rmd2-cokt5")
    r = diagnose(payload(3, 4), b)
    for s in r["students"]:
        for q in s["per_question"]:
            p = np.array(list(q["quadrant_probs"].values()))
            assert np.isfinite(p).all() and abs(p.sum() - 1) < 1e-3
            assert q["quadrant"] in q["prediction_set"]
        assert len(s["summary"]["reasons"]) <= 3


@needs_models
def test_real_bundle_deterministic():
    from remediaide_ml.bundle import load_bundle
    from remediaide_ml.diagnose import diagnose

    b = load_bundle()
    a, c = diagnose(payload(2, 3), b), diagnose(payload(2, 3), b)
    assert [s["per_question"] for s in a["students"]] == [s["per_question"] for s in c["students"]]


def test_explicit_pad_equals_implicit_on_known_items():
    """Serving pad mask (len-based) must give the same predictions as the training rule (q == 0)."""
    import pandas as pd

    from remediaide_ml.l1.cokt import CoktConfig, _model, build_sequences, predict

    rng = np.random.default_rng(0)
    n = 60
    df = pd.DataFrame({"UserId": np.repeat([1, 2, 3], n // 3), "seq_pos": np.tile(np.arange(n // 3), 3),
                       "QuestionId": rng.integers(1, 10, n), "AnswerId": np.arange(n), "kc": rng.integers(1, 4, n).astype(float),
                       "IsCorrect": rng.integers(0, 2, n), "AnswerValue": rng.integers(1, 5, n), "cri": rng.integers(0, 6, n),
                       "hours_since_prev": rng.random(n), "fut_quadrant": np.nan})
    qv = {q: i + 1 for i, q in enumerate(range(1, 10))}
    kv = {float(k): k for k in (1, 2, 3)}
    cfg = CoktConfig(max_len=8)
    net = _model(len(qv), len(kv), cfg).eval()
    seq = build_sequences(df, qv, kv, max_len=8)
    idx = np.arange(len(seq["len"]))
    a = predict(net, seq, idx, cfg, "cpu").sort_values("AnswerId").reset_index(drop=True)
    seq["pad"] = np.arange(8)[None, :] >= seq["len"][:, None]
    b = predict(net, seq, idx, cfg, "cpu").sort_values("AnswerId").reset_index(drop=True)
    pd.testing.assert_frame_equal(a, b)
