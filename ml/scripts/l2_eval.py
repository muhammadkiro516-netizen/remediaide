"""T31: evaluate M1 mDeBERTa (Kaggle OOF) against B0 TF-IDF on identical MAP rows (CV only).

  python scripts/l2_eval.py --enc runs/20261118-2202_l2_mdeberta_kaggle/kaggle_output --tfidf runs/20261118-2131_l2_tfidf
Task 1 (random split): MAP@3 with candidate masking (candidates from each fold's training rows), row bootstrap CI and
paired difference. Task 2 (leave-questions-out): macro-F1 category3, CI with QuestionId-cluster bootstrap, paired
difference by question clusters. MAP has no student id, so rows/questions are the resampling units.
Output: reports/tables/L2_cv.csv (+ metrics json in the encoder run folder).
"""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path

import numpy as np
import pandas as pd

from remediaide_ml.eval import metrics as M
from remediaide_ml.eval.stats import cluster_bootstrap_ci
from remediaide_ml.paths import INTERIM, ML_ROOT, PROCESSED, TABLES
from remediaide_ml.seed import GLOBAL_SEED

CAT3 = ["Correct", "Misconception", "Neither"]
_spec = importlib.util.spec_from_file_location("e3", ML_ROOT / "scripts" / "e3_true_misconception.py")
e3 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(e3)


def rr_at3(P, classes, y):
    top3 = M.topk_from_proba(P, classes, 3)
    return np.array([M.map_at_k([t], [p]) for t, p in zip(y, top3, strict=True)])


def cat3_enc(d: Path, m: pd.DataFrame) -> np.ndarray:
    o = pd.concat([pd.read_parquet(p) for p in sorted(d.glob("oof_category3_fold*.parquet"))]).set_index("row_id")
    o = o.loc[m.row_id]
    L = o[[f"logit::{c}" for c in CAT3]].to_numpy(float)
    return np.array(CAT3)[L.argmax(1)]


def paired_cluster_diff(fa, fb, clusters, n_boot=1000):
    rng = np.random.default_rng(GLOBAL_SEED)
    uniq = np.unique(clusters)
    idx = {u: np.where(clusters == u)[0] for u in uniq}
    out = []
    for _ in range(n_boot):
        r = np.concatenate([idx[u] for u in rng.choice(uniq, len(uniq))])
        out.append(fa(r) - fb(r))
    return float(np.quantile(out, .025)), float(np.quantile(out, .975))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--enc", type=Path, required=True)
    ap.add_argument("--tfidf", type=Path, required=True)
    a = ap.parse_args()
    m = pd.read_parquet(INTERIM / "map.parquet").sort_values("row_id").reset_index(drop=True)
    sp = pd.read_parquet(PROCESSED / "map_splits.parquet")
    m = m.merge(sp[["row_id", "fold_random", "fold_question"]], on="row_id", validate="one_to_one")
    y = m.target.to_numpy()
    rows_out, res = [], {}

    # ---- task 1: MAP@3 (random split)
    Pe, ce = e3.load_oof(a.enc, m)
    Pt, ct = e3.load_oof(a.tfidf / "oof_target.parquet", m)
    rr_e, rr_t = rr_at3(Pe, ce, y), rr_at3(Pt, ct, y)
    rows = np.arange(len(m))
    f = m.fold_random.to_numpy()
    for name, rr in (("M1 mDeBERTa-v3-base", rr_e), ("B0 TF-IDF+LR", rr_t)):
        ci = cluster_bootstrap_ci(lambda r, rr=rr: rr[r].mean(), (rows,), rows, n_boot=1000)
        per = [rr[f == k].mean() for k in range(5)]
        rows_out.append({"model": name, "split": "random (5-fold)", "metric": "MAP@3", "value": ci["point"],
                         "ci_lo": ci["lo"], "ci_hi": ci["hi"], "fold_std": float(np.std(per)), "n": len(m)})
        res[f"{name}_map3_per_fold"] = per
    lo, hi = paired_cluster_diff(lambda r: rr_e[r].mean(), lambda r: rr_t[r].mean(), rows)
    rows_out.append({"model": "selisih mDeBERTa − TF-IDF", "split": "random (5-fold)", "metric": "MAP@3",
                     "value": rr_e.mean() - rr_t.mean(), "ci_lo": lo, "ci_hi": hi, "n": len(m)})

    # ---- task 2: category3 macro-F1 (leave-questions-out)
    y3 = m.category3.to_numpy()
    pe3 = cat3_enc(a.enc, m)
    o3 = pd.read_parquet(a.tfidf / "oof_category3.parquet").set_index("row_id").loc[m.row_id]
    pt3 = np.array(CAT3)[o3[CAT3].to_numpy().argmax(1)]
    q = m.QuestionId.to_numpy()
    g = m.fold_question.to_numpy()
    for name, p3 in (("M1 mDeBERTa-v3-base", pe3), ("B0 TF-IDF+LR", pt3)):
        ci = cluster_bootstrap_ci(lambda r, p3=p3: M.macro_f1(y3[r], p3[r], labels=CAT3), (rows,), q, n_boot=1000)
        per = [M.macro_f1(y3[g == k], p3[g == k], labels=CAT3) for k in range(5)]
        rows_out.append({"model": name, "split": "per soal (5-fold, 3 soal/fold)", "metric": "macro-F1 category3",
                         "value": ci["point"], "ci_lo": ci["lo"], "ci_hi": ci["hi"], "fold_std": float(np.std(per)),
                         "n": len(m), "ci_unit": "soal (15 klaster)"})
        res[f"{name}_cat3_per_fold"] = per
        res[f"{name}_cat3_recall"] = M.per_class_recall(y3, p3, labels=CAT3)
    lo, hi = paired_cluster_diff(lambda r: M.macro_f1(y3[r], pe3[r], labels=CAT3),
                                 lambda r: M.macro_f1(y3[r], pt3[r], labels=CAT3), q)
    rows_out.append({"model": "selisih mDeBERTa − TF-IDF", "split": "per soal (5-fold, 3 soal/fold)",
                     "metric": "macro-F1 category3", "value": M.macro_f1(y3, pe3, labels=CAT3) - M.macro_f1(y3, pt3, labels=CAT3),
                     "ci_lo": lo, "ci_hi": hi, "n": len(m), "ci_unit": "soal (15 klaster)"})
    TABLES.mkdir(parents=True, exist_ok=True)
    out = pd.DataFrame(rows_out)
    out.to_csv(TABLES / "L2_cv.csv", index=False)
    (a.enc.parent / "eval.json").write_text(json.dumps(res, indent=2, default=float))
    print(out.round(4).to_string())
    print(json.dumps(res, indent=1, default=float))


if __name__ == "__main__":
    main()
