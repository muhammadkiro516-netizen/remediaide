"""Layer 2 M1: multilingual encoder fine-tune (microsoft/mdeberta-v3-base) for MAP (03 §2, T31).

Tasks
* target    : 65-way Category:Misconception on the random split; at inference logits outside the
              (QuestionId, prefix) candidates of the training fold are masked to -inf (D-06). Metric MAP@3.
* category3 : Correct/Misconception/Neither on the leave-questions-out split. Metric macro-F1.

Runs on Kaggle GPU (fp16 autocast; automatic fallback to fp32 if a NaN loss appears) and locally on
MPS/CPU for smoke tests. Saves OOF logits per fold so the L3 calibration can use them.

CLI (from ml/ or a Kaggle kernel):
  python -m remediaide_ml.l2.encoder --task target --folds 0 1 2 3 4 --out runs/<id>
  python -m remediaide_ml.l2.encoder --task target --folds 0 --subset 200 --max-steps 20 --out runs/smoke   (smoke)
"""

from __future__ import annotations

import argparse
import json
import math
import time
from pathlib import Path

import numpy as np
import pandas as pd

from remediaide_ml.data.map import build_candidates
from remediaide_ml.eval import metrics as M
from remediaide_ml.l2.tfidf import build_text, candidate_mask
from remediaide_ml.seed import set_seed

CAT3 = ["Correct", "Misconception", "Neither"]
DEFAULTS = {"model_name": "microsoft/mdeberta-v3-base", "lr": 2e-5, "batch_size": 16, "epochs": 3, "max_len": 192,
            "warmup": 0.10, "weight_decay": 0.01, "fp16": True}


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def pick_device():
    """CUDA > MPS > CPU, overridable with RA_DEVICE. Note: DeBERTa-v3 on MPS produced NaN losses (18 Nov),
    so local smoke tests use RA_DEVICE=cpu."""
    import os

    import torch

    if os.environ.get("RA_DEVICE"):
        return torch.device(os.environ["RA_DEVICE"])
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


class _DS:
    def __init__(self, enc, labels):
        self.enc, self.labels = enc, labels

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, i):
        item = {k: v[i] for k, v in self.enc.items()}
        item["labels"] = self.labels[i]
        return item


def train_fold(df: pd.DataFrame, text: np.ndarray, y: np.ndarray, tr: np.ndarray, va: np.ndarray, n_labels: int,
               cfg: dict, seed: int, max_steps: int | None = None) -> tuple[np.ndarray, dict]:
    """Fine-tune on tr, return logits on va and a small training report."""
    import torch
    from torch.utils.data import DataLoader
    from transformers import AutoModelForSequenceClassification, AutoTokenizer, get_linear_schedule_with_warmup

    set_seed(seed)
    dev = pick_device()
    tok = AutoTokenizer.from_pretrained(cfg["model_name"])
    model = AutoModelForSequenceClassification.from_pretrained(cfg["model_name"], num_labels=n_labels).to(dev)

    def enc(idx):
        e = tok(list(text[idx]), truncation=True, max_length=cfg["max_len"], padding="max_length", return_tensors="pt")
        return _DS({k: v for k, v in e.items()}, torch.tensor(y[idx], dtype=torch.long))

    g = torch.Generator().manual_seed(seed)
    dl = DataLoader(enc(tr), batch_size=cfg["batch_size"], shuffle=True, generator=g)
    steps_total = max_steps or cfg["epochs"] * len(dl)
    opt = torch.optim.AdamW(model.parameters(), lr=cfg["lr"], weight_decay=cfg["weight_decay"])
    sch = get_linear_schedule_with_warmup(opt, int(cfg["warmup"] * steps_total), steps_total)
    use_amp = bool(cfg["fp16"]) and dev.type == "cuda"
    scaler = torch.amp.GradScaler("cuda", enabled=use_amp)
    rep = {"device": dev.type, "fp16": use_amp, "nan_fallback": False, "steps": 0, "losses": []}
    model.train()
    step = 0
    t0 = time.time()
    done = False
    for _ep in range(math.ceil(steps_total / len(dl))):
        for batch in dl:
            batch = {k: v.to(dev) for k, v in batch.items()}
            with torch.autocast(device_type="cuda", dtype=torch.float16, enabled=use_amp):
                loss = model(**batch).loss
            if not torch.isfinite(loss):
                if use_amp:  # D: fp16 NaN -> switch to fp32 for the rest of the run (logged)
                    use_amp = False
                    rep["nan_fallback"] = True
                    scaler = torch.amp.GradScaler("cuda", enabled=False)
                    opt.zero_grad(set_to_none=True)
                    log("non-finite loss under fp16 -> continuing in fp32")
                    continue
                raise FloatingPointError("non-finite loss in fp32")
            opt.zero_grad(set_to_none=True)
            scaler.scale(loss).backward()
            scaler.unscale_(opt)
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            scaler.step(opt)
            scaler.update()
            sch.step()
            step += 1
            if step % 50 == 0 or step == 1 or step == steps_total:
                rep["losses"].append([step, float(loss.item())])
                log(f"step {step}/{steps_total} loss {loss.item():.4f} ({time.time() - t0:.0f}s)")
            if step >= steps_total:
                done = True
                break
        if done:
            break
    rep["steps"] = step
    rep["train_sec"] = round(time.time() - t0, 1)
    model.eval()
    out = []
    dl_va = DataLoader(enc(va), batch_size=cfg["batch_size"] * 2)
    with torch.no_grad():
        for batch in dl_va:
            batch = {k: v.to(dev) for k, v in batch.items() if k != "labels"}
            with torch.autocast(device_type="cuda", dtype=torch.float16, enabled=use_amp):
                out.append(model(**batch).logits.float().cpu().numpy())
    return np.concatenate(out), rep | {"model": model, "tokenizer": tok}


def run(df: pd.DataFrame, splits: pd.DataFrame, task: str, folds: list[int], out: Path, cfg: dict, seed: int,
        subset: int | None = None, max_steps: int | None = None, save_model_fold: int | None = None,
        lang: str = "en", text_cols: tuple[str, str, str] | None = None) -> dict:
    df = df.merge(splits[["row_id", "fold_random", "fold_question"]], on="row_id", validate="one_to_one")
    if subset:
        df = df.sample(subset, random_state=seed).reset_index(drop=True)
    text = build_text(df, lang=lang, cols=text_cols).to_numpy()
    if task == "target":
        classes = np.sort(df.target.unique())
        y = np.searchsorted(classes, df.target.to_numpy())
        fold = df.fold_random.to_numpy()
    else:
        classes = np.array(CAT3)
        y = np.searchsorted(classes, df.category3.to_numpy())
        fold = df.fold_question.to_numpy()
    out.mkdir(parents=True, exist_ok=True)
    reports = {}
    for k in folds:
        tr, va = np.where(fold != k)[0], np.where(fold == k)[0]
        log(f"{task} fold {k}: train {len(tr)} valid {len(va)}")
        logits, rep = train_fold(df, text, y, tr, va, len(classes), cfg, seed, max_steps)
        model, tok = rep.pop("model"), rep.pop("tokenizer")
        if task == "target":
            mask = candidate_mask(df.iloc[va], classes, build_candidates(df.iloc[tr]))
            masked = np.where(mask, logits, -np.inf)
            top3 = M.topk_from_proba(masked, classes, 3)
            rep["map3"] = M.map_at_k(df.target.to_numpy()[va], top3)
        else:
            pred = classes[logits.argmax(1)]
            rep["macro_f1"] = M.macro_f1(df.category3.to_numpy()[va], pred, labels=CAT3)
        log(f"fold {k}: {json.dumps({kk: v for kk, v in rep.items() if kk != 'losses'})}")
        reports[k] = rep
        o = pd.DataFrame(logits, columns=[f"logit::{c}" for c in classes])
        o.insert(0, "row_id", df.row_id.to_numpy()[va])
        o.insert(1, "fold", k)
        o.to_parquet(out / f"oof_{task}_fold{k}.parquet", index=False)
        if save_model_fold is not None and k == save_model_fold:
            model.save_pretrained(out / f"model_{task}_fold{k}")
            tok.save_pretrained(out / f"model_{task}_fold{k}")
            (out / f"model_{task}_fold{k}" / "classes.json").write_text(json.dumps(list(map(str, classes))))
        del model
    (out / f"metrics_{task}.json").write_text(json.dumps({"cfg": cfg, "seed": seed, "folds": reports}, indent=2, default=str))
    return reports


def main() -> None:
    from remediaide_ml.paths import INTERIM, PROCESSED

    ap = argparse.ArgumentParser()
    ap.add_argument("--task", choices=["target", "category3"], required=True)
    ap.add_argument("--folds", type=int, nargs="+", default=[0, 1, 2, 3, 4])
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--data", type=Path, default=INTERIM / "map.parquet")
    ap.add_argument("--splits", type=Path, default=PROCESSED / "map_splits.parquet")
    ap.add_argument("--subset", type=int, default=None)
    ap.add_argument("--max-steps", type=int, default=None)
    ap.add_argument("--save-model-fold", type=int, default=None)
    ap.add_argument("--model-name", default=DEFAULTS["model_name"])
    ap.add_argument("--fp32", action="store_true")
    ap.add_argument("--epochs", type=int, default=DEFAULTS["epochs"])
    a = ap.parse_args()
    cfg = DEFAULTS | {"model_name": a.model_name, "fp16": not a.fp32, "epochs": a.epochs}
    seed = set_seed()
    run(pd.read_parquet(a.data), pd.read_parquet(a.splits), a.task, a.folds, a.out, cfg, seed, a.subset, a.max_steps,
        a.save_model_fold)


if __name__ == "__main__":
    main()
