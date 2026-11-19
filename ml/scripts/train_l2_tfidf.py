"""T30: Layer-2 B0 TF-IDF baseline, 5-fold CV on both MAP splits.

Usage (from ml/):  .venv/bin/python scripts/train_l2_tfidf.py [--c-grid 0.3 1 3 10] [--quick]
Writes runs/<ts>_l2_tfidf/{config.yaml, metrics.json, oof_target.parquet, oof_category3.parquet}
and reports/tables/L2_b0_tfidf_cv.csv. The locked test set concept for MAP = CV folds (D-06).
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import time

import numpy as np
import pandas as pd
import yaml

from remediaide_ml.data.map import build_candidates
from remediaide_ml.eval import metrics as M
from remediaide_ml.eval.stats import cluster_bootstrap_ci
from remediaide_ml.l2.tfidf import TfidfLR, apply_mask, build_text, candidate_mask
from remediaide_ml.paths import INTERIM, PROCESSED, TABLES, run_dir
from remediaide_ml.seed import set_seed

CAT3 = ["Correct", "Misconception", "Neither"]


def log(msg: str) -> None:
    print(f"[{dt.datetime.now():%H:%M:%S}] {msg}", flush=True)


def run_target_fold(df, text, tr, va, C, seed):
    m = TfidfLR(C=C, seed=seed).fit(text[tr], df.target.values[tr])
    cands = build_candidates(df.iloc[tr])
    p = apply_mask(m.predict_proba(text[va]), candidate_mask(df.iloc[va], m.classes_, cands))
    return m.classes_, p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--c-grid", type=float, nargs="+", default=[0.3, 1.0, 3.0, 10.0])
    ap.add_argument("--quick", action="store_true", help="smoke test on 3000 rows")
    a = ap.parse_args()
    seed = set_seed()
    df = pd.read_parquet(INTERIM / "map.parquet")
    spl = pd.read_parquet(PROCESSED / "map_splits.parquet")
    df = df.merge(spl[["row_id", "fold_random", "fold_question"]], on="row_id", validate="one_to_one")
    if a.quick:
        df = df.sample(3000, random_state=seed).reset_index(drop=True)
    text = build_text(df).to_numpy()
    run = run_dir(f"l2_tfidf{'_quick' if a.quick else ''}")
    run.mkdir(parents=True, exist_ok=True)
    cfg = {"task": "T30", "model": "tfidf(word1-2,char_wb3-5)+LR", "c_grid": a.c_grid, "seed": seed,
           "c_selection": "fold 0 validation (random split: MAP@3; question split: macro-F1)", "n_rows": len(df)}

    # ---- task 1: target, random split
    f = df.fold_random.to_numpy()
    t0 = time.time()
    c_scores = {}
    for C in a.c_grid:
        tr, va = np.where(f != 0)[0], np.where(f == 0)[0]
        classes, p = run_target_fold(df, text, tr, va, C, seed)
        c_scores[C] = M.map_at_k(df.target.values[va], M.topk_from_proba(p, classes, 3))
        log(f"target C={C}: fold0 MAP@3={c_scores[C]:.4f}")
    best_c = max(c_scores, key=c_scores.get)
    classes_all = np.sort(df.target.unique())
    oof = np.zeros((len(df), len(classes_all)))
    for k in range(5):
        tr, va = np.where(f != k)[0], np.where(f == k)[0]
        classes, p = run_target_fold(df, text, tr, va, best_c, seed)
        col = np.searchsorted(classes_all, classes)
        oof[np.ix_(va, col)] = p
        log(f"target fold {k} done ({time.time() - t0:.0f}s)")
    top3 = M.topk_from_proba(oof, classes_all, 3)
    y = df.target.values
    per_fold = [M.map_at_k(y[f == k], [top3[i] for i in np.where(f == k)[0]]) for k in range(5)]
    rows = np.arange(len(df))
    ci = cluster_bootstrap_ci(lambda r: M.map_at_k(y[r], [top3[i] for i in r]), (rows,), rows, n_boot=1000)
    # E3 view: True_Misconception detection from the target model
    is_tm = (df.Category == "True_Misconception").to_numpy()
    top1 = classes_all[oof.argmax(axis=1)]
    pred_tm = np.char.startswith(top1.astype(str), "True_Misconception")
    res_target = {"best_C": best_c, "fold0_C_scores": c_scores, "map3_oof": ci["point"], "map3_ci": [ci["lo"], ci["hi"]],
                  "map3_per_fold": per_fold, "map3_fold_mean": float(np.mean(per_fold)), "map3_fold_std": float(np.std(per_fold)),
                  "top1_acc": float(np.mean(top1 == y)),
                  "true_misc_recall_top1": float(pred_tm[is_tm].mean()),
                  "true_misc_precision_top1": float(is_tm[pred_tm].mean()) if pred_tm.any() else float("nan"),
                  "true_misc_n": int(is_tm.sum())}
    log(f"target: {json.dumps(res_target)}")
    oof_df = pd.DataFrame(oof, columns=classes_all)
    oof_df.insert(0, "row_id", df.row_id.values)
    oof_df.insert(1, "fold", f)
    oof_df.to_parquet(run / "oof_target.parquet", index=False)

    # ---- task 2: category3, leave-questions-out
    g = df.fold_question.to_numpy()
    y3 = df.category3.to_numpy()
    c3_scores = {}
    for C in a.c_grid:
        tr, va = np.where(g != 0)[0], np.where(g == 0)[0]
        m = TfidfLR(C=C, seed=seed).fit(text[tr], y3[tr])
        c3_scores[C] = M.macro_f1(y3[va], m.clf.classes_[m.predict_proba(text[va]).argmax(1)], labels=CAT3)
        log(f"category3 C={C}: fold0 macro-F1={c3_scores[C]:.4f}")
    best_c3 = max(c3_scores, key=c3_scores.get)
    oof3 = np.zeros((len(df), 3))
    for k in range(5):
        tr, va = np.where(g != k)[0], np.where(g == k)[0]
        m = TfidfLR(C=best_c3, seed=seed).fit(text[tr], y3[tr])
        p = m.predict_proba(text[va])
        oof3[np.ix_(va, np.searchsorted(CAT3, m.clf.classes_))] = p
        log(f"category3 fold {k} done")
    pred3 = np.array(CAT3)[oof3.argmax(1)]
    per_fold3 = [M.macro_f1(y3[g == k], pred3[g == k], labels=CAT3) for k in range(5)]
    ci3 = cluster_bootstrap_ci(lambda r: M.macro_f1(y3[r], pred3[r], labels=CAT3), (rows,), rows, n_boot=1000)
    ciq = cluster_bootstrap_ci(lambda r: M.macro_f1(y3[r], pred3[r], labels=CAT3), (rows,), df.QuestionId.to_numpy(),
                               n_boot=1000)
    res_c3 = {"best_C": best_c3, "fold0_C_scores": c3_scores, "macro_f1_oof": ci3["point"], "macro_f1_ci_row": [ci3["lo"], ci3["hi"]],
              "macro_f1_ci_question_cluster": [ciq["lo"], ciq["hi"]], "macro_f1_per_fold": per_fold3,
              "recall_per_class": M.per_class_recall(y3, pred3, labels=CAT3), "accuracy": float(np.mean(pred3 == y3))}
    log(f"category3: {json.dumps(res_c3)}")
    o3 = pd.DataFrame(oof3, columns=CAT3)
    o3.insert(0, "row_id", df.row_id.values)
    o3.insert(1, "fold", g)
    o3.to_parquet(run / "oof_category3.parquet", index=False)

    metrics = {"target_random_split": res_target, "category3_question_split": res_c3,
               "ci_note": "bootstrap 1000x; MAP has no student id, so rows are resampled (and QuestionId clusters for category3)"}
    (run / "metrics.json").write_text(json.dumps(metrics, indent=2))
    (run / "config.yaml").write_text(yaml.safe_dump(cfg, sort_keys=False))
    if not a.quick:
        TABLES.mkdir(parents=True, exist_ok=True)
        pd.DataFrame([
            {"model": "B0 TF-IDF+LR", "split": "random (5-fold)", "metric": "MAP@3", "value": res_target["map3_oof"],
             "ci_lo": ci["lo"], "ci_hi": ci["hi"], "fold_std": res_target["map3_fold_std"], "C": best_c, "run": run.name},
            {"model": "B0 TF-IDF+LR", "split": "random (5-fold)", "metric": "recall True_Misconception (top1)",
             "value": res_target["true_misc_recall_top1"], "ci_lo": None, "ci_hi": None, "fold_std": None, "C": best_c, "run": run.name},
            {"model": "B0 TF-IDF+LR", "split": "per soal (5-fold, 3 soal/fold)", "metric": "macro-F1 category3",
             "value": res_c3["macro_f1_oof"], "ci_lo": ci3["lo"], "ci_hi": ci3["hi"], "fold_std": float(np.std(per_fold3)),
             "C": best_c3, "run": run.name},
        ]).to_csv(TABLES / "L2_b0_tfidf_cv.csv", index=False)
    log(f"done -> {run}")


if __name__ == "__main__":
    main()
