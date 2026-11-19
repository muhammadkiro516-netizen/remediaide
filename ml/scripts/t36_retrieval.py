"""T36 (Tingkat A, D-22): zero-shot misconception retrieval for new questions with multilingual-e5-base.

  python scripts/t36_retrieval.py [--device cpu] [--limit N]
Output: reports/tables/T36_retrieval.csv (+ per-question table reports/tables/T36_retrieval_per_question.csv).
"""
from __future__ import annotations

import argparse
import os

import numpy as np
import pandas as pd

from remediaide_ml.paths import INTERIM, PROCESSED, TABLES
from remediaide_ml.seed import GLOBAL_SEED

MODEL = "intfloat/multilingual-e5-base"


def embed(texts, tok, model, device, bs=64):
    import torch

    out = []
    with torch.no_grad():
        for i in range(0, len(texts), bs):
            e = tok(texts[i:i + bs], padding=True, truncation=True, max_length=192, return_tensors="pt").to(device)
            h = model(**e).last_hidden_state
            m = e["attention_mask"].unsqueeze(-1).float()
            v = (h * m).sum(1) / m.sum(1)
            out.append(torch.nn.functional.normalize(v, dim=-1).cpu().numpy())
    return np.concatenate(out)


def rr3(scores, cands, gold):
    order = [cands[i] for i in np.argsort(-scores)][:3]
    return 1.0 / (order.index(gold) + 1) if gold in order else 0.0, float(order[0] == gold)


def expected_random(k):  # expected MAP@3 when the gold is uniformly placed among k candidates
    return float(np.mean([1 / (r + 1) if r < 3 else 0 for r in range(k)]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--device", default=os.environ.get("RA_DEVICE", "cpu"))
    ap.add_argument("--limit", type=int, default=None)
    a = ap.parse_args()
    import torch
    from transformers import AutoModel, AutoTokenizer

    m = pd.read_parquet(INTERIM / "map.parquet").merge(pd.read_parquet(PROCESSED / "map_id.parquet"), on="row_id")
    ev = m[m.Category.str.endswith("Misconception")].reset_index(drop=True)
    if a.limit:
        ev = ev.sample(a.limit, random_state=GLOBAL_SEED).reset_index(drop=True)
    d = pd.read_csv(TABLES / "map_misconception_dictionary.csv")
    d["question_ids"] = d.question_ids.astype(str)
    cand = {int(q): g.reset_index(drop=True) for q, g in d.groupby("question_ids")}
    tok = AutoTokenizer.from_pretrained(MODEL)
    model = AutoModel.from_pretrained(MODEL, dtype=torch.float32).to(a.device).eval()
    rows = []
    for lang, ecol, dcol in (("EN", "StudentExplanation", "deskripsi_en"), ("ID", "StudentExplanation_id", "deskripsi_id")):
        q_emb = embed([f"query: {t}" for t in ev[ecol].astype(str)], tok, model, a.device)
        for qid, c in cand.items():
            p_emb = embed([f"passage: {t}" for t in c[dcol]], tok, model, a.device)
            idx = np.where(ev.QuestionId.to_numpy() == qid)[0]
            labels = c.label.tolist()
            majority = ev.iloc[idx].misconception.value_counts().index.tolist()
            for i in idx:
                gold = ev.misconception.iloc[i]
                r, t1 = rr3(q_emb[i] @ p_emb.T, labels, gold)
                maj_order = majority + [x for x in labels if x not in majority]
                mr = 1 / (maj_order[:3].index(gold) + 1) if gold in maj_order[:3] else 0.0
                rows.append({"lang": lang, "QuestionId": qid, "k": len(labels), "rr": r, "top1": t1,
                             "rr_random": expected_random(len(labels)), "rr_majority": mr, "top1_majority": float(maj_order[0] == gold)})
    r = pd.DataFrame(rows)
    rng = np.random.default_rng(GLOBAL_SEED)
    qs = r.QuestionId.unique()
    out = []
    for lang, g in r.groupby("lang"):
        by_q = {q: g[g.QuestionId == q] for q in qs}
        for col, name in (("rr", "MAP@3 retrieval e5"), ("top1", "top-1 retrieval e5"), ("rr_random", "MAP@3 acak (harapan)"),
                          ("rr_majority", "MAP@3 label terbanyak soal (acuan atas)"), ("top1_majority", "top-1 label terbanyak soal")):
            boots = [pd.concat([by_q[q] for q in rng.choice(qs, len(qs))])[col].mean() for _ in range(1000)]
            out.append({"bahasa": lang, "metrik": name, "nilai": g[col].mean(), "ci_lo": float(np.quantile(boots, .025)),
                        "ci_hi": float(np.quantile(boots, .975)), "n_baris": len(g), "n_soal": g.QuestionId.nunique()})
    TABLES.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(out).to_csv(TABLES / "T36_retrieval.csv", index=False)
    r.groupby(["lang", "QuestionId", "k"])[["rr", "top1", "rr_random", "rr_majority"]].mean().reset_index().to_csv(
        TABLES / "T36_retrieval_per_question.csv", index=False)
    print(pd.DataFrame(out).round(4).to_string())


if __name__ == "__main__":
    main()
