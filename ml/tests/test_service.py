"""T63: FastAPI service contract (skipped when production artefacts are not exported)."""
import importlib.util
import time

import pytest

from .test_bundle import needs_models
from .test_diagnose_contract import payload

fastapi = pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402


def client(monkeypatch, l2="1", lang="en"):
    from service import app as svc

    monkeypatch.setenv("RA_L2", l2)
    monkeypatch.setenv("RA_L2_LANG", lang)
    svc._state.clear()
    return TestClient(svc.app)


@needs_models
def test_health_and_schema(monkeypatch):
    c = client(monkeypatch)
    h = c.get("/health").json()
    expected_l1 = "CoktL1" if importlib.util.find_spec("torch") else "LgbmL1"  # LightGBM fallback without [dl]
    assert h["status"] == "ok" and h["loaded"]["l1"] == expected_l1
    r = c.post("/v1/diagnose", json=payload(2, 3))
    assert r.status_code == 200
    s = r.json()["students"][0]
    assert set(s["per_question"][0]) >= {"question_id", "quadrant_probs", "quadrant", "prediction_set", "rule_status",
                                          "misconception", "hidden_misconception", "rapid_guess"}
    assert set(s["summary"]) >= {"quadrant", "mastery_prob", "deferred", "rule_status", "reasons"}


@needs_models
def test_422_on_incomplete_input(monkeypatch):
    c = client(monkeypatch)
    p = payload(1, 2)
    del p["responses"][0]["cri"]
    assert c.post("/v1/diagnose", json=p).status_code == 422


@needs_models
def test_latency_40x15_without_explanations(monkeypatch):
    c = client(monkeypatch)
    c.post("/v1/diagnose", json=payload(2, 2))  # warm-up
    t = time.perf_counter()
    r = c.post("/v1/diagnose", json=payload(40, 15, expl=False))
    assert r.status_code == 200 and time.perf_counter() - t < 2.0


@needs_models
def test_fallback_without_l2(monkeypatch):
    c = client(monkeypatch, l2="0")
    assert c.get("/health").json()["loaded"]["l2"] is None
    r = c.post("/v1/diagnose", json=payload(2, 3))
    assert r.status_code == 200
    assert all(q["misconception"] is None for s in r.json()["students"] for q in s["per_question"])


@needs_models
def test_deterministic(monkeypatch):
    c = client(monkeypatch)
    a, b = c.post("/v1/diagnose", json=payload(3, 4)).json(), c.post("/v1/diagnose", json=payload(3, 4)).json()
    assert a["students"] == b["students"]
