"""T24: production CO-KT (D-18). Trains on CV users only, one model per seed, and saves weights.

  python scripts/train_cokt_final.py --seeds 20261118 1 2 3 4 --out <dir> [--data-dir D] [--frac 0.01 --epochs 1]
User roles (test users = fold -1 are never trained on):
  calibration users = calibration_groups(CV users)  (20%, same subset l3_eval uses) -> untouched, for L3 fitting;
  early-stop users  = 10% of the remaining CV users (seed + 11)                    -> early stopping only;
  training users    = the rest.
Outputs per seed: cokt_final_seed<s>.pt (state_dict + cfg + vocabularies), pred_cal_seed<s>.parquet (calibration
users), pred_test_seed<s>.parquet (test users; SEALED: read only by scripts/final_eval.py at T46), report_seed<s>.json.
Question/KC vocabularies come from CV users only; unseen ids map to 0 (padding/unknown).
"""

from __future__ import annotations

import argparse
import json
import time
from dataclasses import asdict
from pathlib import Path

import numpy as np
import pandas as pd

from remediaide_ml.data.splits import calibration_groups
from remediaide_ml.l1.cokt import CoktConfig, build_sequences, predict, train_eval, vocabularies
from remediaide_ml.seed import GLOBAL_SEED


def log(m):
    print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


def user_roles(sp: pd.DataFrame) -> dict:
    cv = np.sort(sp.loc[sp.fold >= 0, "UserId"].unique())
    cal = cv[calibration_groups(cv)]
    rest = np.setdiff1d(cv, cal)
    rng = np.random.default_rng(GLOBAL_SEED + 11)
    es = rng.choice(rest, size=max(1, int(round(0.10 * len(rest)))), replace=False)
    tr = np.setdiff1d(rest, es)
    test = np.sort(sp.loc[sp.fold < 0, "UserId"].unique())
    return {"train": tr, "early_stop": np.sort(es), "calibration": cal, "test": test}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, nargs="+", default=[20261118, 1, 2, 3, 4])
    ap.add_argument("--frac", type=float, default=1.0, help="fraction of users (smoke tests)")
    ap.add_argument("--epochs", type=int, default=None)
    ap.add_argument("--data-dir", type=Path, default=None)
    ap.add_argument("--device", default=None)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()
    import torch

    from remediaide_ml.paths import PROCESSED

    dd = a.data_dir or PROCESSED
    cols = ["UserId", "QuestionId", "AnswerId", "kc", "seq_pos", "AnswerValue", "IsCorrect", "cri", "has_conf",
            "hours_since_prev", "fut_quadrant"]
    df = pd.read_parquet(dd / "eedi_features_b.parquet", columns=cols)
    sp = pd.read_parquet(dd / "eedi_splits.parquet")
    roles = user_roles(sp)
    if a.frac < 1:
        rng = np.random.default_rng(0)
        roles = {k: rng.choice(v, max(5, int(len(v) * a.frac)), replace=False) for k, v in roles.items()}
        df = df[df.UserId.isin(np.concatenate(list(roles.values())))]
    cv_users = np.concatenate([roles["train"], roles["early_stop"], roles["calibration"]])
    assert not set(cv_users) & set(roles["test"]), "test users leaked into CV roles"
    qv, kv = vocabularies(df[df.UserId.isin(cv_users)])
    seq = build_sequences(df, qv, kv, max_len=200)
    role_of = {u: r for r, us in roles.items() for u in us}
    wrole = np.array([role_of.get(u, "none") for u in seq["user"]])
    idx = {r: np.where(wrole == r)[0] for r in roles}
    dev = a.device or ("cuda" if torch.cuda.is_available() else "cpu")
    cfg = CoktConfig()
    a.out.mkdir(parents=True, exist_ok=True)
    (a.out / "roles.json").write_text(json.dumps({k: [int(x) for x in v] for k, v in roles.items()}))
    log(f"windows: " + ", ".join(f"{r} {len(i):,}" for r, i in idx.items()) + f"; device {dev}")
    for s in a.seeds:
        t0 = time.time()
        _, rep, model = train_eval(seq, idx["train"], idx["early_stop"], len(qv), len(kv), cfg, seed=s, device=dev,
                                   max_epochs=a.epochs, log=log)
        torch.save({"state_dict": {k: v.cpu() for k, v in model.state_dict().items()}, "cfg": asdict(cfg),
                    "q_vocab": {int(k): v for k, v in qv.items()}, "kc_vocab": {float(k): v for k, v in kv.items()},
                    "seed": s}, a.out / f"cokt_final_seed{s}.pt")
        predict(model, seq, idx["calibration"], cfg, torch.device(dev)).to_parquet(a.out / f"pred_cal_seed{s}.parquet",
                                                                                  index=False)
        predict(model, seq, idx["test"], cfg, torch.device(dev)).to_parquet(a.out / f"pred_test_seed{s}.parquet",
                                                                           index=False)
        rep |= {"sec": round(time.time() - t0, 1), "n_windows": {r: int(len(i)) for r, i in idx.items()}}
        (a.out / f"report_seed{s}.json").write_text(json.dumps(rep, indent=2, default=float))
        log(f"seed {s}: best early-stop AUC {rep['best_val_auc']:.4f} ({rep['sec']}s)")
    log("DONE")


if __name__ == "__main__":
    main()
