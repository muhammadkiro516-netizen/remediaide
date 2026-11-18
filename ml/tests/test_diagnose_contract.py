"""Contract tests for diagnose() (05 §4) with dummy models — schema, determinism, L2 fallback, latency, 422."""

import time

import numpy as np
import pytest

from remediaide_ml.diagnose import Bundle, ValidationError, diagnose


class DummyL1:
    def predict_quadrant(self, X):
        p = np.tile([0.4, 0.1, 0.3, 0.2], (len(X), 1)).astype(float)
        p[:, 0] += 0.2 * X["cur_correct"].to_numpy()
        return p / p.sum(1, keepdims=True)

    def explain(self, X):
        return [[{"text": "jawaban saat ini benar", "impact": 0.3}, {"text": "akurasi di topik ini", "impact": 0.1}]
                for _ in range(len(X))]


class DummyL2:
    def predict(self, rows):
        n = len(rows)
        return {"cat3": np.tile([0.2, 0.7, 0.1], (n, 1)), "misc_label": np.array(["Longer_is_bigger"] * n, dtype=object),
                "misc_prob": np.full(n, 0.82), "p_true_misc": np.full(n, 0.6)}


def bundle(l2=True):
    return Bundle(l1=DummyL1(), l2=DummyL2() if l2 else None, lac_qhat=0.7, defer_threshold=0.55, hidden_threshold=0.5,
                  mastery_prior=0.6, misconception_dict={"Longer_is_bigger": "Menganggap bilangan lebih panjang lebih besar"})


def payload(n_students=2, n_items=3, expl=True):
    items = [{"question_id": f"q{j}", "kc_id": "dec", "correct_option": "A", "map_question_id": 32835 if j == 0 else None,
              "question_text": "Which number is the greatest?"} for j in range(n_items)]
    res = []
    for s in range(n_students):
        for j in range(n_items):
            res.append({"student_key": f"s{s}", "question_id": f"q{j}", "chosen_option": "A" if (s + j) % 2 else "B",
                        "is_correct": bool((s + j) % 2), "cri": (s + j) % 6, "response_time_ms": 9000, "tau_min_ms": 4000,
                        "explanation": "6.079 is longer so bigger" if expl else "",
                        "answered_at": f"2026-11-30T08:{10 + j:02d}:00Z"})
    return {"session_id": "x", "items": items, "responses": res}


def test_schema():
    r = diagnose(payload(), bundle())
    assert set(r) == {"model_version", "students", "latency_ms"}
    s = r["students"][0]
    assert set(s["summary"]) >= {"quadrant", "mastery_prob", "deferred", "reasons"}
    pq = s["per_question"][0]
    assert set(pq) == {"question_id", "quadrant_probs", "quadrant", "prediction_set", "rule_status", "misconception",
                       "hidden_misconception", "rapid_guess"}
    assert sum(pq["quadrant_probs"].values()) == pytest.approx(1, abs=1e-3)
    assert pq["quadrant"] in pq["prediction_set"]


def test_l2_only_for_map_items_and_fallback():
    r = diagnose(payload(), bundle())
    q0 = [p for p in r["students"][0]["per_question"] if p["question_id"] == "q0"][0]
    q1 = [p for p in r["students"][0]["per_question"] if p["question_id"] == "q1"][0]
    assert q0["misconception"]["label"] == "Longer_is_bigger" and q1["misconception"] is None
    r2 = diagnose(payload(), bundle(l2=False))
    assert all(p["misconception"] is None and not p["hidden_misconception"] for s in r2["students"] for p in s["per_question"])


def test_hidden_misconception_only_on_correct_answers():
    r = diagnose(payload(), bundle())
    for s in r["students"]:
        for p in s["per_question"]:
            if p["hidden_misconception"]:
                assert p["question_id"] == "q0" and p["rule_status"] in ("PAHAM_KONSEP", "LUCKY_GUESS")


def test_deterministic():
    a, b = diagnose(payload(), bundle()), diagnose(payload(), bundle())
    a.pop("latency_ms"), b.pop("latency_ms")
    assert a == b


def test_latency_40x15_cpu():
    t = time.perf_counter()
    diagnose(payload(n_students=40, n_items=15), bundle())
    assert time.perf_counter() - t < 2.0


def test_validation_422():
    p = payload()
    del p["responses"][0]["cri"]
    with pytest.raises(ValidationError):
        diagnose(p, bundle())
    p = payload()
    p["responses"][0]["question_id"] = "nope"
    with pytest.raises(ValidationError):
        diagnose(p, bundle())
