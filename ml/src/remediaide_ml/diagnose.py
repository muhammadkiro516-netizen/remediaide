"""Core diagnosis function behind POST /v1/diagnose (docs/cac/05_INTEGRATION_SPEC.md §4, T43).

diagnose(payload, bundle) -> response dict. Pure function of the payload and loaded artefacts (deterministic).
* L1: history features are rebuilt from the session's own responses (time-ordered per student and KC).
* L2: only when the item has a `map_question_id` and the response has an explanation; otherwise skipped.
* L3: calibrated L1 probs -> naive-Bayes fusion with L2 -> conformal set -> defer if doubt >= threshold.
* rule_status: the v1 rule (B0, cri_rule.classify_per_item incl. tau_min) is always returned for comparison.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Protocol

import numpy as np
import pandas as pd

from remediaide_ml.cri_rule import ResponseInput, classify_per_item, compute_dominant_status
from remediaide_ml.features.history import add_history_features
from remediaide_ml.l3.fusion import QUAD, naive_bayes_fusion

QUAD_STATUS = {"P": "PAHAM_KONSEP", "L": "LUCKY_GUESS", "M": "MISKONSEPSI", "T": "TIDAK_PAHAM"}
OPTION_IDX = {"A": 1, "B": 2, "C": 3, "D": 4}


class ValidationError(ValueError):
    """Raised for incomplete input; the service maps it to HTTP 422."""


class L1Model(Protocol):
    def predict_quadrant(self, X: pd.DataFrame) -> np.ndarray: ...   # (n, 4) calibrated P,L,M,T
    def explain(self, X: pd.DataFrame) -> list[list[dict]]: ...      # per row: [{"text", "impact"}, ...]


class L2Model(Protocol):
    def predict(self, rows: pd.DataFrame) -> dict[str, np.ndarray]: ...  # {"cat3": (n,3), "misc_label": (n,), "misc_prob": (n,), "p_true_misc": (n,)}


@dataclass
class Bundle:
    l1: L1Model
    l2: L2Model | None
    lac_qhat: float                      # L1 conformal threshold (LAC)
    defer_threshold: float               # doubt (1 - max p) threshold from the D-09 operating point
    hidden_threshold: float              # p(True_Misconception) threshold
    mastery_prior: float                 # training share of mastered future quadrants (P+L)
    item_diff_default: float = 0.54      # training mean accuracy, used for unseen items
    kc_diff_default: float = 0.54
    misconception_dict: dict[str, str] = field(default_factory=dict)  # label -> Indonesian description
    model_version: str = "rmd2-dev"


REQUIRED_RESP = ("student_key", "question_id", "chosen_option", "is_correct", "cri", "answered_at")


def _validate(payload: dict) -> None:
    if not isinstance(payload, dict) or "items" not in payload or "responses" not in payload:
        raise ValidationError("payload harus berisi 'items' dan 'responses'")
    qids = {it.get("question_id") for it in payload["items"]}
    for i, r in enumerate(payload["responses"]):
        miss = [k for k in REQUIRED_RESP if r.get(k) is None]
        if miss:
            raise ValidationError(f"responses[{i}] tidak lengkap: {', '.join(miss)}")
        if r["question_id"] not in qids:
            raise ValidationError(f"responses[{i}].question_id tidak ada di items")
        if not (0 <= int(r["cri"]) <= 5):
            raise ValidationError(f"responses[{i}].cri harus 0..5")


def _frame(payload: dict) -> pd.DataFrame:
    items = {it["question_id"]: it for it in payload["items"]}
    rows = []
    for j, r in enumerate(payload["responses"]):
        it = items[r["question_id"]]
        rows.append({"UserId": r["student_key"], "QuestionId": r["question_id"], "AnswerId": j,
                     "kc": it.get("kc_id") or "__none__", "DateAnswered": pd.Timestamp(r["answered_at"]),
                     "IsCorrect": int(bool(r["is_correct"])), "AnswerValue": OPTION_IDX.get(str(r["chosen_option"]).upper(), 1),
                     "Confidence": float(r["cri"]) * 20, "has_conf": True, "cri": int(r["cri"]),
                     "attempt_no": 1, "response_time_ms": r.get("response_time_ms"), "tau_min_ms": r.get("tau_min_ms"),
                     "explanation": (r.get("explanation") or "").strip(), "map_question_id": it.get("map_question_id"),
                     "question_text": it.get("question_text") or "", "chosen_option": r["chosen_option"]})
    df = pd.DataFrame(rows)
    df["cri"] = df["cri"].astype("Int8")
    df = df.sort_values(["UserId", "DateAnswered", "AnswerId"], kind="mergesort").reset_index(drop=True)
    df["attempt_no"] = df.groupby(["UserId", "QuestionId"]).cumcount() + 1
    return df


def diagnose(payload: dict[str, Any], bundle: Bundle) -> dict[str, Any]:
    t0 = time.perf_counter()
    _validate(payload)
    if not payload["responses"]:
        return {"model_version": bundle.model_version, "students": [], "latency_ms": 0}
    df = _frame(payload)
    f = add_history_features(df)
    f["item_diff_oof"] = bundle.item_diff_default
    f["kc_diff_oof"] = bundle.kc_diff_default
    f["cur_option_share_oof"] = 0.0
    p1 = bundle.l1.predict_quadrant(f)
    reasons = bundle.l1.explain(f)

    # L2 where possible
    p2 = np.full((len(f), 3), np.nan)
    misc_label = np.array([None] * len(f), dtype=object)
    misc_prob = np.full(len(f), np.nan)
    p_tm = np.full(len(f), np.nan)
    use = f["map_question_id"].notna() & f["explanation"].str.len().gt(0)
    if bundle.l2 is not None and use.any():
        out = bundle.l2.predict(f[use])
        p2[use.to_numpy()] = out["cat3"]
        misc_label[use.to_numpy()] = out["misc_label"]
        misc_prob[use.to_numpy()] = out["misc_prob"]
        p_tm[use.to_numpy()] = out["p_true_misc"]

    fused = naive_bayes_fusion(p1, p2, bundle.mastery_prior)
    pred_set = fused >= 1 - bundle.lac_qhat
    pred_set[np.arange(len(f)), fused.argmax(1)] = True
    doubt = 1 - fused.max(1)
    hidden = f["IsCorrect"].astype(bool).to_numpy() & (np.nan_to_num(p_tm) >= bundle.hidden_threshold)

    students = []
    for sk, g in f.groupby("UserId", sort=True):
        per_q, rule_statuses = [], []
        for i in g.index:
            r = f.loc[i]
            rt, tau = r["response_time_ms"], r["tau_min_ms"]
            rule = classify_per_item(ResponseInput(str(r["QuestionId"]), bool(r["IsCorrect"]), int(r["cri"]),
                                                   float(rt) if rt is not None else 1e12,
                                                   float(tau) if tau is not None else 0.0)).status
            rule_statuses.append(rule)
            q = QUAD[int(fused[i].argmax())]
            mis = None
            if misc_label[i] is not None and not pd.isna(misc_label[i]) and misc_label[i] != "NA":
                lab = str(misc_label[i])
                mis = {"label": lab, "label_id": bundle.misconception_dict.get(lab, lab), "prob": round(float(misc_prob[i]), 4)}
            per_q.append({"question_id": r["QuestionId"],
                          "quadrant_probs": {QUAD_STATUS[k]: round(float(fused[i, j]), 4) for j, k in enumerate(QUAD)},
                          "quadrant": QUAD_STATUS[q],
                          "prediction_set": [QUAD_STATUS[k] for j, k in enumerate(QUAD) if pred_set[i, j]],
                          "rule_status": rule, "misconception": mis, "hidden_misconception": bool(hidden[i]),
                          "rapid_guess": rule == "INVALID"})
        gi = g.index.to_numpy()
        mean_p = fused[gi].mean(0)
        top = max(range(len(gi)), key=lambda k: max(reasons[gi[k]], key=lambda x: x["impact"])["impact"] if reasons[gi[k]] else 0)
        deferred = bool((doubt[gi] >= bundle.defer_threshold).any() or hidden[gi].any())
        students.append({"student_key": sk, "per_question": per_q,
                         "summary": {"quadrant": QUAD_STATUS[QUAD[int(mean_p.argmax())]],
                                     "mastery_prob": round(float(mean_p[:2].sum()), 4), "deferred": deferred,
                                     "rule_status": compute_dominant_status(rule_statuses),
                                     "reasons": reasons[gi[top]][:3]}})
    return {"model_version": bundle.model_version, "students": students,
            "latency_ms": int(round((time.perf_counter() - t0) * 1000))}
