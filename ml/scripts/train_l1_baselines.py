"""T21: B1 baselines for Layer 1 on 5 CV folds (test users untouched). Also re-scores B0 on the same rows.

B1a: item difficulty OOF. (a) score = item_diff_oof; (b) multinomial LR on item_diff_oof (4-class) and LR (binary).
B1b: L2 logistic regression on acc_prev_kc, log1p(n_prev_kc), item_diff_oof, kc_diff_oof [+ cur_correct, cur_cri,
     cur_has_conf for (b)], C in {0.01, 0.1, 1, 10} chosen on fold 0 (03 §1).
Writes runs/<ts>_l1_b1/{oof.parquet, metrics.json, config.yaml} and reports/tables/L1_b0_b1_cv.csv.
"""

from __future__ import annotations

import datetime as dt
import json

import numpy as np
import pandas as pd
import yaml
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from remediaide_ml.eval import metrics as M
from remediaide_ml.eval import stats as S
from remediaide_ml.l1.common import QUAD, iter_folds, load, quad_labels
from remediaide_ml.paths import TABLES, run_dir
from remediaide_ml.seed import set_seed

C_GRID = [0.01, 0.1, 1.0, 10.0]


def log(m):
    print(f"[{dt.datetime.now():%H:%M:%S}] {m}", flush=True)


def design(d: pd.DataFrame, framing: str, which: str) -> np.ndarray:
    if which == "B1a":
        X = d[["item_diff_oof"]].to_numpy(float)
    else:
        cols = {"acc_prev_kc": d.acc_prev_kc.fillna(d.item_diff_oof), "log_n_prev_kc": np.log1p(d.n_prev_kc),
                "item_diff_oof": d.item_diff_oof, "kc_diff_oof": d.kc_diff_oof}
        if framing == "b":
            cols |= {"cur_correct": d.cur_correct, "cur_cri": d.cur_cri.fillna(0), "cur_has_conf": d.cur_has_conf}
        X = pd.DataFrame(cols).to_numpy(float)
    return X


def lr(C):
    return make_pipeline(StandardScaler(), LogisticRegression(C=C, max_iter=1000))


def main():
    seed = set_seed()
    run = run_dir("l1_b1")
    run.mkdir(parents=True, exist_ok=True)
    res: dict = {}
    for framing in ("a", "b"):
        df = load(framing)
        if framing == "b":
            df = df[df.needs_remediation.notna()].reset_index(drop=True)
        y_bin = (df.IsCorrect if framing == "a" else df.needs_remediation).astype(int).to_numpy()
        y4 = quad_labels(df.fut_quadrant) if framing == "b" else None
        oof = {k: np.full(len(df), np.nan) for k in ("B1a_bin", "B1b_bin")}
        oof4 = {k: np.full((len(df), 4), np.nan) for k in ("B1a_4", "B1b_4")} if framing == "b" else {}
        best_c = {}
        for k, d, tr, va in iter_folds(df):
            for which in ("B1a", "B1b"):
                Xtr, Xva = design(d.iloc[tr], framing, which), design(d.iloc[va], framing, which)
                if framing == "a" and which == "B1a":
                    oof["B1a_bin"][va] = Xva[:, 0]
                    continue
                if k == 0:
                    scores = {}
                    for C in C_GRID:
                        m = lr(C).fit(Xtr, y_bin[tr])
                        scores[C] = M.auc(y_bin[va], m.predict_proba(Xva)[:, 1])
                    best_c[f"{which}_bin"] = max(scores, key=scores.get)
                    log(f"{framing} {which} bin C-scores fold0: {scores}")
                m = lr(best_c[f"{which}_bin"]).fit(Xtr, y_bin[tr])
                oof[f"{which}_bin"][va] = m.predict_proba(Xva)[:, 1]
                if framing == "b":
                    lab = y4[tr] >= 0
                    if k == 0:
                        scores = {}
                        for C in C_GRID:
                            m4 = lr(C).fit(Xtr[lab], y4[tr][lab])
                            v = y4[va] >= 0
                            scores[C] = M.macro_f1(y4[va][v], m4.predict(Xva[v]), labels=[0, 1, 2, 3])
                        best_c[f"{which}_4"] = max(scores, key=scores.get)
                        log(f"{framing} {which} 4-class C-scores fold0: {scores}")
                    m4 = lr(best_c[f"{which}_4"]).fit(Xtr[lab], y4[tr][lab])
                    oof4[f"{which}_4"][va] = m4.predict_proba(Xva)
            log(f"framing {framing} fold {k} done")
        users = df.UserId.to_numpy()
        r = {"best_C": best_c, "n_rows": len(df)}
        for name, s in oof.items():
            r[name] = {"auc": S.cluster_bootstrap_ci(M.auc, (y_bin, s), users, n_boot=200) | {"note": "200 reps (dev)"},
                       "auc_per_fold": [M.auc(y_bin[df.fold == k], s[df.fold == k]) for k in range(5)]}
        if framing == "b":
            # B0 on the same rows: binary = current answer wrong; 4-class = current quadrant (rows with cur conf)
            b0_bin = (df.IsCorrect == 0).astype(int).to_numpy()
            r["B0_bin"] = {"auc": S.cluster_bootstrap_ci(M.auc, (y_bin, b0_bin), users, n_boot=200)}
            e1 = (y4 >= 0) & df.has_conf.to_numpy()
            r["n_rows_e1"] = int(e1.sum())
            yb0 = quad_labels(df.quadrant_b0)
            for name, P in [("B0_4", None), *oof4.items()]:
                pred = yb0[e1] if P is None else P[e1].argmax(1)
                _, cnt = S.cluster_confusion_counts(y4[e1], pred, users[e1], [0, 1, 2, 3])
                r[name] = {"macro_f1": S.bootstrap_confusion_metric(cnt, S.cm_macro_f1, n_boot=1000),
                           "misgroup": S.bootstrap_confusion_metric(cnt, S.cm_misgroup, n_boot=1000)}
            o = pd.DataFrame({"AnswerId": df.AnswerId, "fold": df.fold, "y_bin": y_bin, "y4": y4, "e1_row": e1,
                              **{k: v for k, v in oof.items()},
                              **{f"{k}_{q}": v[:, i] for k, v in oof4.items() for i, q in enumerate(QUAD)}})
        else:
            o = pd.DataFrame({"AnswerId": df.AnswerId, "fold": df.fold, "y_bin": y_bin, **oof})
        o.to_parquet(run / f"oof_{framing}.parquet", index=False)
        res[framing] = r
        log(json.dumps(r, default=float)[:2000])
    (run / "metrics.json").write_text(json.dumps(res, indent=2, default=float))
    (run / "config.yaml").write_text(yaml.safe_dump({"task": "T21", "seed": seed, "c_grid": C_GRID}))
    rows = []
    for fr, r in res.items():
        for name, v in r.items():
            if not isinstance(v, dict) or name == "best_C":
                continue
            for metric, ci in v.items():
                if isinstance(ci, dict) and "point" in ci:
                    rows.append({"framing": fr, "model": name, "metric": metric, "value": ci["point"], "ci_lo": ci["lo"],
                                 "ci_hi": ci["hi"], "run": run.name})
    TABLES.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_csv(TABLES / "L1_b0_b1_cv.csv", index=False)
    log(f"done -> {run}")


if __name__ == "__main__":
    main()
