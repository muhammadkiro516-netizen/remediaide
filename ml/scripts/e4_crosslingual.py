"""T34 / E4: does L2 work on Indonesian explanations? Zero-shot: model trained on English (fold 0 training rows),
evaluated on fold-0 validation rows in English and in machine-translated Indonesian (same rows -> paired CI).

  python scripts/e4_crosslingual.py --model runs/<id>/kaggle_output/model_target_fold0 [--device cpu]
Needs data/processed/map_id.parquet (T32). Metrics: MAP@3 (target), macro-F1 category3 (derived from target probs),
recall True_Misconception. Difference ID - EN with paired row bootstrap (1000).
Output: reports/tables/E4_crosslingual.csv.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import numpy as np
import pandas as pd

from remediaide_ml.data.map import build_candidates
from remediaide_ml.eval import metrics as M
from remediaide_ml.l2.tfidf import build_text, candidate_mask
from remediaide_ml.paths import INTERIM, PROCESSED, TABLES

CAT3 = ["Correct", "Misconception", "Neither"]


def predict(model_dir: Path, texts: list[str], device: str, bs: int = 32) -> np.ndarray:
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    tok = AutoTokenizer.from_pretrained(model_dir)
    model = AutoModelForSequenceClassification.from_pretrained(model_dir, dtype=torch.float32).to(device).eval()
    out = []
    with torch.no_grad():
        for i in range(0, len(texts), bs):
            e = tok(texts[i:i + bs], truncation=True, max_length=192, padding=True, return_tensors="pt").to(device)
            out.append(model(**e).logits.float().cpu().numpy())
    return np.concatenate(out)


def metrics_from_logits(L, classes, df, mask):
    L = np.where(mask, L, -np.inf)
    P = np.exp(L - L.max(1, keepdims=True))
    P /= P.sum(1, keepdims=True)
    top3 = M.topk_from_proba(P, classes, 3)
    rr = np.array([M.map_at_k([t], [p]) for t, p in zip(df.target, top3, strict=True)])
    cat = np.array([c.split(":")[0].split("_", 1)[1] for c in classes])
    P3 = np.column_stack([P[:, cat == c].sum(1) for c in CAT3])
    pred3 = np.array(CAT3)[P3.argmax(1)]
    tm_pred = np.char.startswith(classes[P.argmax(1)].astype(str), "True_Misconception")
    return rr, pred3, tm_pred


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", type=Path, required=True)
    ap.add_argument("--device", default=os.environ.get("RA_DEVICE", "cpu"))
    ap.add_argument("--limit", type=int, default=None)
    a = ap.parse_args()
    m = pd.read_parquet(INTERIM / "map.parquet")
    sp = pd.read_parquet(PROCESSED / "map_splits.parquet")
    tr_id = pd.read_parquet(PROCESSED / "map_id.parquet")
    m = m.merge(sp[["row_id", "fold_random"]], on="row_id").merge(tr_id, on="row_id")
    va = m[m.fold_random == 0].reset_index(drop=True)
    if a.limit:
        va = va.head(a.limit)
    classes = np.array(json.loads((a.model / "classes.json").read_text()))
    mask = candidate_mask(va, classes, build_candidates(m[m.fold_random != 0]))
    txt_en = build_text(va, "en").tolist()
    # Indonesian: translated question/answer/explanation, Indonesian template (03 §2)
    txt_id = build_text(va, "id", cols=("QuestionText_id", "MC_Answer_id", "StudentExplanation_id")).tolist()
    res = {}
    per = {}
    for lang, txt in (("en", txt_en), ("id", txt_id)):
        L = predict(a.model, txt, a.device)
        rr, pred3, tm = metrics_from_logits(L, classes, va, mask)
        per[lang] = (rr, pred3, tm)
        is_tm = (va.Category == "True_Misconception").to_numpy()
        res[lang] = {"map3": float(rr.mean()), "macro_f1_cat3": M.macro_f1(va.category3, pred3, labels=CAT3),
                     "recall_true_misc": float(tm[is_tm].mean()) if is_tm.any() else None, "n": len(va)}
    rng = np.random.default_rng(20261118)
    n = len(va)
    d_map, d_f1 = [], []
    for _ in range(1000):
        i = rng.integers(0, n, n)
        d_map.append(per["id"][0][i].mean() - per["en"][0][i].mean())
        d_f1.append(M.macro_f1(va.category3.to_numpy()[i], per["id"][1][i], labels=CAT3)
                    - M.macro_f1(va.category3.to_numpy()[i], per["en"][1][i], labels=CAT3))
    rows = []
    for metric, key, boots in (("MAP@3", "map3", d_map), ("macro-F1 category3", "macro_f1_cat3", d_f1),
                               ("recall True_Misconception", "recall_true_misc", None)):
        en, idv = res["en"][key], res["id"][key]
        row = {"metric": metric, "EN": en, "ID": idv, "selisih_ID_minus_EN": None if en is None or idv is None else idv - en}
        if boots is not None:
            row |= {"ci_lo": float(np.quantile(boots, .025)), "ci_hi": float(np.quantile(boots, .975))}
        rows.append(row | {"n": n, "model": str(a.model), "catatan": "terjemahan mesin opus-mt-en-id, bukan tulisan asli siswa"})
    TABLES.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_csv(TABLES / "E4_crosslingual.csv", index=False)
    print(json.dumps(rows, indent=2, default=float))


if __name__ == "__main__":
    main()
