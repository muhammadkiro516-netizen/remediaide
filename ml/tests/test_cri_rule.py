"""Parity tests: Python B0 must match the TypeScript v1 engine exactly.

The fixture tests/fixtures/ts_parity_cases.json was produced by running
src/lib/diagnostic/engine.ts (vitest) on deterministic random inputs.
Do not regenerate it with Python code.
"""

import json
from pathlib import Path

import pytest

from remediaide_ml.cri_rule import (
    DiagnosisResult,
    ResponseInput,
    aggregate_majority_voting,
    calculate_integrity_index,
    calculate_tau_min_seconds,
    classify_per_item,
    classify_quadrant,
    compute_dominant_status,
    confidence_to_cri,
    count_words,
)

FIX = json.loads((Path(__file__).parent / "fixtures" / "ts_parity_cases.json").read_text())


@pytest.mark.parametrize("case", FIX["words"])
def test_count_words_and_tau_match_ts(case):
    assert count_words(case["text"]) == case["words"]
    assert calculate_tau_min_seconds(case["words"]) == case["tau"]


def test_per_item_matches_ts():
    for case in FIX["items"]:
        i = case["input"]
        inp = ResponseInput(i["itemId"], i["isCorrect"], i["criValue"], i["responseTimeMs"], i["tauMinMs"])
        r = classify_per_item(inp)
        assert r.status == case["status"], case
        assert r.is_below_threshold == case["below"], case
        assert calculate_integrity_index(inp) == pytest.approx(case["ii"], abs=1e-12), case


def test_aggregation_matches_ts():
    for case in FIX["aggs"]:
        rs = [DiagnosisResult(f"x{k}", s, 0.0, False) for k, s in enumerate(case["statuses"])]
        a = aggregate_majority_voting(rs)
        assert a.final_status == case["final"], case
        assert a.tiebreaker_applied == case["tie"], case
        assert a.valid_item_count == case["valid"], case


def test_quadrant_consistent_with_per_item_when_time_ok():
    for correct in (True, False):
        for cri in range(6):
            inp = ResponseInput("q", correct, cri, 10_000, 1_000)
            assert classify_quadrant(correct, cri) == classify_per_item(inp).status


def test_dominant_status_precedence():
    assert compute_dominant_status([]) == "INSUFFICIENT_DATA"
    assert compute_dominant_status(["PAHAM_KONSEP", "MISKONSEPSI"]) == "MISKONSEPSI"
    assert compute_dominant_status(["PAHAM_KONSEP", "PAHAM_KONSEP", "LUCKY_GUESS"]) == "PAHAM_KONSEP"
    assert compute_dominant_status(["INSUFFICIENT_DATA", "INSUFFICIENT_DATA", "TIDAK_PAHAM"]) == "INSUFFICIENT_DATA"
    assert compute_dominant_status(["INSUFFICIENT_DATA", "TIDAK_PAHAM"]) == "TIDAK_PAHAM"


@pytest.mark.parametrize(
    "conf,expected",
    [(0, 0), (9, 0), (10, 1), (29, 1), (30, 2), (49, 2), (50, 3), (69, 3), (70, 4), (89, 4), (90, 5), (100, 5), (None, None)],
)
def test_confidence_to_cri(conf, expected):
    assert confidence_to_cri(conf) == expected


def test_threshold_equivalence_with_proposal_rule():
    # cri_int >= 3  <=>  conf/20 >= 2.5  for every integer confidence 0..100
    for c in range(101):
        assert (confidence_to_cri(c) >= 3) == (c / 20 >= 2.5)
