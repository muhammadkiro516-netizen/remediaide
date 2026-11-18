"""T23: train CO-KT on the 5 CV folds (test users excluded) for one variant and a set of seeds.

  python scripts/train_cokt.py --variant full --seeds 20261118 1 2 3 4 --out <dir>
  python scripts/train_cokt.py --variant full --seeds 20261118 --frac 0.01 --epochs 1 --out runs/<id>_cokt_smoke  (local smoke)
Variants: full | no_conf | no_option. Input: data/processed/eedi_features_b.parquet + eedi_splits.parquet
(or --data-dir for Kaggle). Output: oof_<variant>_seed<s>.parquet, metrics_<variant>.json.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import pandas as pd

from remediaide_ml.l1.cokt import CoktConfig, build_sequences, train_eval, vocabularies


def log(m):
    print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", choices=["full", "no_conf", "no_option"], default="full")
    ap.add_argument("--seeds", type=int, nargs="+", default=[20261118])
    ap.add_argument("--folds", type=int, nargs="+", default=[0, 1, 2, 3, 4])
    ap.add_argument("--frac", type=float, default=1.0, help="fraction of CV users (smoke tests)")
    ap.add_argument("--epochs", type=int, default=None)
    ap.add_argument("--data-dir", type=Path, default=None)
    ap.add_argument("--device", default=None)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()
    import torch

    from remediaide_ml.eval.metrics import auc, macro_f1
    from remediaide_ml.paths import PROCESSED

    dd = a.data_dir or PROCESSED
    cols = ["UserId", "QuestionId", "AnswerId", "kc", "seq_pos", "AnswerValue", "IsCorrect", "cri", "has_conf",
            "hours_since_prev", "fut_quadrant"]
    df = pd.read_parquet(dd / "eedi_features_b.parquet", columns=cols)
    sp = pd.read_parquet(dd / "eedi_splits.parquet")
    df = df.merge(sp, on="UserId", validate="many_to_one")
    df = df[df.fold >= 0]
    if a.frac < 1:
        u = df.UserId.unique()
        keep = np.random.default_rng(0).choice(u, max(10, int(len(u) * a.frac)), replace=False)
        df = df[df.UserId.isin(keep)]
    qv, kv = vocabularies(df)
    seq = build_sequences(df, qv, kv, max_len=200)
    ufold = dict(zip(sp.UserId, sp.fold, strict=True))
    wfold = np.array([ufold[u] for u in seq["user"]])
    dev = a.device or ("cuda" if torch.cuda.is_available() else "cpu")
    cfg = CoktConfig(no_conf=a.variant == "no_conf", no_option=a.variant == "no_option")
    a.out.mkdir(parents=True, exist_ok=True)
    log(f"variant {a.variant}: {len(df):,} rows, {len(seq['len']):,} windows, device {dev}")
    rep_all = {}
    for s in a.seeds:
        preds = []
        for k in a.folds:
            t0 = time.time()
            tr, va = np.where(wfold != k)[0], np.where(wfold == k)[0]
            pred, rep, _ = train_eval(seq, tr, va, len(qv), len(kv), cfg, seed=s, device=dev, max_epochs=a.epochs, log=log)
            pred["fold"] = k
            preds.append(pred)
            pn = pred.dropna(subset=["p_next"])
            pq = pred[pred.y_quad >= 0]
            rep |= {"auc_next": auc(pn.y_next.astype(int), pn.p_next),
                    "opt_acc": float((pn[[f"p_opt{o}" for o in range(4)]].to_numpy().argmax(1) == pn.y_opt).mean()),
                    "quad_macro_f1": macro_f1(pq.y_quad.astype(int), pq[[f"pq_{c}" for c in "PLMT"]].to_numpy().argmax(1),
                                              labels=[0, 1, 2, 3]) if len(pq) else None,
                    "sec": round(time.time() - t0, 1), "n_params": pred.attrs.get("n_params")}
            rep_all[f"seed{s}_fold{k}"] = rep
            log(f"seed {s} fold {k}: AUC {rep['auc_next']:.4f} optAcc {rep['opt_acc']:.4f} quadF1 {rep['quad_macro_f1']} "
                f"({rep['sec']}s)")
        pd.concat(preds).to_parquet(a.out / f"oof_{a.variant}_seed{s}.parquet", index=False)
        (a.out / f"metrics_{a.variant}.json").write_text(json.dumps(rep_all, indent=2, default=float))
    log("DONE")


if __name__ == "__main__":
    main()
