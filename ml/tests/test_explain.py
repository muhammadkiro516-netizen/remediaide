"""explain() returns k Indonesian reasons whose SHAP values add up with the bias to the raw margin."""

import lightgbm as lgb
import numpy as np
import pandas as pd

from remediaide_ml.l1.explain import _fmt, explain


def test_explain_multiclass_sums_and_format():
    rng = np.random.default_rng(0)
    X = pd.DataFrame({"cur_correct": rng.integers(0, 2, 600), "cur_cri": rng.integers(0, 6, 600).astype(float),
                      "cnt_M_kc": rng.integers(0, 5, 600), "acc_prev_kc": rng.random(600)})
    y = (X.cur_correct * 2 + (X.cur_cri >= 3)).to_numpy()
    b = lgb.train({"objective": "multiclass", "num_class": 4, "verbosity": -1, "seed": 0}, lgb.Dataset(X, y), 30)
    r = explain(b, X.head(5), k=3)
    assert len(r) == 5 and all(len(x) == 3 for x in r)
    raw = b.predict(X.head(5), raw_score=True)
    contrib = b.predict(X.head(5), pred_contrib=True).reshape(5, 4, 5)
    np.testing.assert_allclose(contrib.sum(-1), raw, rtol=1e-5)
    assert all(isinstance(x["text"], str) and x["text"] for row in r for x in row)


def test_fmt_phrases():
    assert _fmt("cnt_M_kc", 3) == "salah 3× di topik ini dengan keyakinan tinggi"
    assert _fmt("cur_correct", 0) == "jawaban saat ini salah"
    assert _fmt("acc_prev_kc", float("nan")) == "belum ada riwayat di topik ini"


def test_fmt_float32_nan():
    assert _fmt("acc_prev", np.float32("nan")) == "belum ada riwayat jawaban"
