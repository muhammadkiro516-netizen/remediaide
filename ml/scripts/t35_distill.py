"""T35 (Tingkat A, D-23): distil mDeBERTa (teacher OOF logits) into Multilingual-MiniLM-L12-H384.

  python scripts/t35_distill.py --teacher <dir with oof_target_fold*.parquet> --out <dir> [--data-dir D] [--limit N --epochs 1]
Trains on fold_random != 0 (English), evaluates fold 0 in English and Indonesian (map_id), saves HF model + classes.json.
"""
from __future__ import annotations

import argparse
import json
import math
import time
from pathlib import Path

import numpy as np
import pandas as pd

STUDENT = "microsoft/Multilingual-MiniLM-L12-H384"
TOKENIZER = "xlm-roberta-base"


def log(m):
    print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--teacher", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--data-dir", type=Path, default=None)
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--device", default=None)
    a = ap.parse_args()
    import torch
    import torch.nn.functional as F
    from transformers import AutoModelForSequenceClassification, AutoTokenizer, get_linear_schedule_with_warmup

    from remediaide_ml.data.map import build_candidates
    from remediaide_ml.eval import metrics as M
    from remediaide_ml.l2.tfidf import build_text, candidate_mask
    from remediaide_ml.paths import INTERIM, PROCESSED

    torch.manual_seed(20261118)
    dev = a.device or ("cuda" if torch.cuda.is_available() else "cpu")
    dd = a.data_dir
    m = pd.read_parquet((dd or INTERIM) / "map.parquet")
    sp = pd.read_parquet((dd or PROCESSED) / "map_splits.parquet")
    tr_id = pd.read_parquet((dd or PROCESSED) / "map_id.parquet")
    m = m.merge(sp[["row_id", "fold_random"]], on="row_id").merge(tr_id, on="row_id").sort_values("row_id").reset_index(drop=True)
    T = pd.concat([pd.read_parquet(p) for p in sorted(a.teacher.glob("oof_target_fold*.parquet"))]).set_index("row_id").loc[m.row_id]
    lc = [c for c in T.columns if c.startswith("logit::")]
    classes = np.array([c.split("::", 1)[1] for c in lc])
    TL = T[lc].to_numpy(np.float32)
    fold = m.fold_random.to_numpy()
    mask = np.zeros_like(TL, dtype=bool)
    for k in np.unique(fold):
        va = fold == k
        mask[va] = candidate_mask(m[va], classes, build_candidates(m[~va]))
    y = np.searchsorted(classes, m.target.to_numpy())
    tr = np.where(fold != 0)[0]
    va = np.where(fold == 0)[0]
    if a.limit:
        rng = np.random.default_rng(0)
        tr, va = rng.choice(tr, a.limit, replace=False), rng.choice(va, max(50, a.limit // 4), replace=False)
    txt_en = build_text(m, "en").to_numpy()
    txt_id = build_text(m, "id", cols=("QuestionText_id", "MC_Answer_id", "StudentExplanation_id")).to_numpy()
    tok = AutoTokenizer.from_pretrained(TOKENIZER)
    model = AutoModelForSequenceClassification.from_pretrained(STUDENT, num_labels=len(classes), dtype=torch.float32).to(dev)
    opt = torch.optim.AdamW(model.parameters(), lr=5e-5, weight_decay=0.01)
    bs, steps = 32, math.ceil(len(tr) / 32) * a.epochs
    sch = get_linear_schedule_with_warmup(opt, int(0.1 * steps), steps)
    scaler_ok = dev == "cuda"
    tlog = np.where(mask, TL, -1e4)
    t0 = time.time()
    for ep in range(a.epochs):
        model.train()
        perm = np.random.default_rng(ep).permutation(tr)
        for i in range(0, len(perm), bs):
            b = perm[i:i + bs]
            e = tok(list(txt_en[b]), truncation=True, max_length=192, padding=True, return_tensors="pt").to(dev)
            with torch.autocast("cuda", dtype=torch.float16, enabled=scaler_ok):
                logits = model(**e).logits.float()
            mk = torch.as_tensor(mask[b], device=dev)
            logits = logits.masked_fill(~mk, -1e4)
            yt = torch.as_tensor(y[b], device=dev)
            tt = torch.as_tensor(tlog[b], device=dev)
            loss = 0.5 * F.cross_entropy(logits, yt) + 0.5 * 4.0 * F.kl_div(
                F.log_softmax(logits / 2.0, -1), F.softmax(tt / 2.0, -1), reduction="batchmean")
            opt.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            sch.step()
        log(f"epoch {ep} done, last loss {float(loss):.4f} ({time.time() - t0:.0f}s)")

    def evaluate(txt):
        model.eval()
        out = []
        with torch.no_grad():
            for i in range(0, len(va), 128):
                b = va[i:i + 128]
                e = tok(list(txt[b]), truncation=True, max_length=192, padding=True, return_tensors="pt").to(dev)
                out.append(model(**e).logits.float().cpu().numpy())
        L = np.where(mask[va], np.concatenate(out), -np.inf)
        P = np.exp(L - L.max(1, keepdims=True))
        top3 = M.topk_from_proba(P / P.sum(1, keepdims=True), classes, 3)
        return float(np.mean([M.map_at_k([t], [p]) for t, p in zip(m.target.to_numpy()[va], top3, strict=True)]))

    res = {"map3_en_fold0": evaluate(txt_en), "map3_id_fold0": evaluate(txt_id), "n_train": len(tr), "n_eval": len(va),
           "train_sec": round(time.time() - t0, 1), "student": STUDENT, "epochs": a.epochs, "device": dev}
    log(json.dumps(res))
    a.out.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(a.out / "student_model")
    tok.save_pretrained(a.out / "student_model")
    (a.out / "student_model" / "classes.json").write_text(json.dumps(classes.tolist()))
    (a.out / "metrics_distill.json").write_text(json.dumps(res, indent=2))


if __name__ == "__main__":
    main()
