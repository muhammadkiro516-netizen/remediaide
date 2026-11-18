"""T23 evaluation of CO-KT Kaggle outputs (CV only) against LightGBM on identical rows.

  python scripts/cokt_eval.py --cokt runs/<id>_cokt_kaggle/kaggle_output --lgbm runs/<lgbm_run>
Seed ensembles = mean of probabilities across seeds. Framing (a): next-correct AUC on rows where CO-KT has a
prediction (every interaction except the first of each 200-window), paired DeLong vs LightGBM (a) on the same rows.
Framing (b): 4-class future quadrant on E1 rows (current confidence + 4-class label), macro-F1 and misgrouping with
user-cluster bootstrap. Ablations (no_conf, no_option) vs full on the same rows.
Outputs reports/tables/L1_cokt_cv.csv and reports/tables/E2_cokt_ablation_cv.csv.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from remediaide_ml.eval import metrics as M
from remediaide_ml.eval import stats as S
from remediaide_ml.paths import PROCESSED, TABLES

PQ = ["pq_P", "pq_L", "pq_M", "pq_T"]


def ensemble(d: Path, variant: str) -> tuple[pd.DataFrame, int]:
    files = sorted(d.glob(f"oof_{variant}_seed*.parquet"))
    parts = []
    for f in files:
        o = pd.read_parquet(f, columns=["AnswerId", "p_next", "y_next", *PQ, "y_quad"])
        parts.append(o.groupby("AnswerId").first())
    cat = pd.concat(parts, keys=range(len(parts)))
    ens = cat.groupby(level="AnswerId").mean(numeric_only=True)
    return ens, len(files)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cokt", type=Path, required=True)
    ap.add_argument("--lgbm", type=Path, default=None)
    ap.add_argument("--n-boot", type=int, default=1000)
    a = ap.parse_args()
    meta = pd.read_parquet(PROCESSED / "eedi_features_b.parquet",
                           columns=["AnswerId", "UserId", "IsCorrect", "has_conf", "fut_quadrant", "quadrant_b0"])
    ens = {}
    nseeds = {}
    for v in ("full", "no_conf", "no_option"):
        ens[v], nseeds[v] = ensemble(a.cokt, v)
    base = ens["full"].join(meta.set_index("AnswerId"), how="inner")
    out_rows, abl_rows = [], []

    # ---- framing (a)
    ra = base.dropna(subset=["p_next"])
    ya = ra.IsCorrect.astype(int).to_numpy()
    users = ra.UserId.to_numpy()
    ci = S.cluster_bootstrap_ci(M.auc, (ya, ra.p_next.to_numpy()), users, n_boot=200)
    res = {"cokt_full_auc_a": ci, "n_rows_a": len(ra), "seeds": nseeds}
    out_rows.append({"framing": "a", "model": f"M1 CO-KT (ensemble {nseeds['full']} seed)", "metric": "auc",
                     "value": ci["point"], "ci_lo": ci["lo"], "ci_hi": ci["hi"], "n_rows": len(ra)})
    if a.lgbm:
        la = pd.read_parquet(a.lgbm / "oof_a.parquet").set_index("AnswerId")
        j = ra.join(la[["p"]], how="inner")
        dl = S.delong_test(j.IsCorrect.astype(int), j.p_next, j.p)
        res["delong_cokt_vs_lgbm_a"] = dl
        out_rows.append({"framing": "a", "model": "B2 LightGBM (baris yang sama)", "metric": "auc", "value": dl["auc_b"],
                         "ci_lo": None, "ci_hi": None, "n_rows": len(j),
                         "note": f"DeLong CO-KT - LightGBM = {dl['diff']:+.4f}, p = {dl['p']:.3g}"})
    for v in ("no_conf", "no_option"):
        jv = ra.join(ens[v][["p_next"]].rename(columns={"p_next": "pv"}), how="inner")
        dl = S.delong_test(jv.IsCorrect.astype(int), jv.p_next, jv.pv)
        abl_rows.append({"perbandingan": f"full vs {v}", "metric": "AUC next-correct", "full": dl["auc_a"], "ablasi": dl["auc_b"],
                         "selisih_full_minus_ablasi": dl["diff"], "p_delong": dl["p"], "n_rows": len(jv)})

    # ---- framing (b): E1 rows
    rb = base[base.has_conf & base.fut_quadrant.notna() & base.pq_P.notna()]
    qmap = {"P": 0, "L": 1, "M": 2, "T": 3}
    yb = rb.fut_quadrant.astype(str).map(qmap).to_numpy()
    ub = rb.UserId.to_numpy()

    def quad_metrics(P):
        _, cnt = S.cluster_confusion_counts(yb, P.argmax(1), ub, [0, 1, 2, 3])
        return (S.bootstrap_confusion_metric(cnt, S.cm_macro_f1, n_boot=a.n_boot),
                S.bootstrap_confusion_metric(cnt, S.cm_misgroup, n_boot=a.n_boot), cnt)

    mf1, mis, cnt_full = quad_metrics(rb[PQ].to_numpy())
    b0 = rb.quadrant_b0.astype(str).map(qmap).to_numpy()
    _, cnt_b0 = S.cluster_confusion_counts(yb, b0, ub, [0, 1, 2, 3])
    res |= {"n_rows_e1": len(rb), "cokt_full_macro_f1": mf1, "cokt_full_misgroup": mis,
            "b0_same_rows_macro_f1": S.cm_macro_f1(cnt_b0.sum(0)), "b0_same_rows_misgroup": S.cm_misgroup(cnt_b0.sum(0))}
    for metric, ci in (("macro_f1", mf1), ("misgroup", mis)):
        out_rows.append({"framing": "b", "model": f"M1 CO-KT (ensemble {nseeds['full']} seed)", "metric": metric,
                         "value": ci["point"], "ci_lo": ci["lo"], "ci_hi": ci["hi"], "n_rows": len(rb)})
    out_rows.append({"framing": "b", "model": "B0 aturan v1 (baris yang sama)", "metric": "macro_f1",
                     "value": res["b0_same_rows_macro_f1"], "n_rows": len(rb)})
    out_rows.append({"framing": "b", "model": "B0 aturan v1 (baris yang sama)", "metric": "misgroup",
                     "value": res["b0_same_rows_misgroup"], "n_rows": len(rb)})
    if a.lgbm and (a.lgbm / "oof_b.parquet").exists():
        lb = pd.read_parquet(a.lgbm / "oof_b.parquet").set_index("AnswerId")
        jl = rb.join(lb[["p4_P", "p4_L", "p4_M", "p4_T"]], how="inner")
        _, cnt_l = S.cluster_confusion_counts(jl.fut_quadrant.astype(str).map(qmap).to_numpy(),
                                              jl[["p4_P", "p4_L", "p4_M", "p4_T"]].to_numpy().argmax(1), jl.UserId.to_numpy(),
                                              [0, 1, 2, 3])
        res["lgbm_same_rows_macro_f1"] = S.cm_macro_f1(cnt_l.sum(0))
        res["lgbm_same_rows_misgroup"] = S.cm_misgroup(cnt_l.sum(0))
        out_rows.append({"framing": "b", "model": "B2 LightGBM (baris yang sama)", "metric": "macro_f1",
                         "value": res["lgbm_same_rows_macro_f1"], "n_rows": len(jl)})
        out_rows.append({"framing": "b", "model": "B2 LightGBM (baris yang sama)", "metric": "misgroup",
                         "value": res["lgbm_same_rows_misgroup"], "n_rows": len(jl)})
    for v in ("no_conf", "no_option"):
        jv = rb.join(ens[v][PQ].add_suffix("_v"), how="inner")
        f_full, _, _ = quad_metrics(jv[PQ].to_numpy()) if len(jv) == len(rb) else (None, None, None)
        _, cnt_v = S.cluster_confusion_counts(jv.fut_quadrant.astype(str).map(qmap).to_numpy(),
                                              jv[[c + "_v" for c in PQ]].to_numpy().argmax(1), jv.UserId.to_numpy(), [0, 1, 2, 3])
        # paired user-bootstrap difference of macro-F1 (full - ablation)
        _, cnt_f = S.cluster_confusion_counts(jv.fut_quadrant.astype(str).map(qmap).to_numpy(), jv[PQ].to_numpy().argmax(1),
                                              jv.UserId.to_numpy(), [0, 1, 2, 3])
        rng = np.random.default_rng(20261118)
        n = cnt_f.shape[0]
        diffs = []
        ff, fv = cnt_f.reshape(n, -1).astype(float), cnt_v.reshape(n, -1).astype(float)
        for _ in range(a.n_boot):
            w = rng.multinomial(n, np.full(n, 1 / n))
            diffs.append(S.cm_macro_f1((w @ ff).reshape(4, 4)) - S.cm_macro_f1((w @ fv).reshape(4, 4)))
        abl_rows.append({"perbandingan": f"full vs {v}", "metric": "macro-F1 kuadran (baris E1)",
                         "full": S.cm_macro_f1(cnt_f.sum(0)), "ablasi": S.cm_macro_f1(cnt_v.sum(0)),
                         "selisih_full_minus_ablasi": S.cm_macro_f1(cnt_f.sum(0)) - S.cm_macro_f1(cnt_v.sum(0)),
                         "ci_lo": float(np.quantile(diffs, .025)), "ci_hi": float(np.quantile(diffs, .975)), "n_rows": len(jv)})
    TABLES.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(out_rows).to_csv(TABLES / "L1_cokt_cv.csv", index=False)
    pd.DataFrame(abl_rows).to_csv(TABLES / "E2_cokt_ablation_cv.csv", index=False)
    (a.cokt.parent / "eval.json").write_text(json.dumps(res, indent=2, default=float))
    print(pd.DataFrame(out_rows).round(4).to_string())
    print(pd.DataFrame(abl_rows).round(4).to_string())


if __name__ == "__main__":
    main()
