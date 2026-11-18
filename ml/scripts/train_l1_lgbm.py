"""T22: LightGBM for Layer 1 — Optuna on fold 0, 5-fold CV, E2 ablation (framing b), SHAP.

  .venv/bin/python scripts/train_l1_lgbm.py --n-trials 50 [--stages all|none] [--quick]
Run in background (> 8 min). Writes runs/<ts>_l1_lgbm/ (config, train.log via stdout, metrics.json, oof_*.parquet,
fold models) and reports/tables/E2_ablation_cv.csv, reports/tables/L1_lgbm_cv.csv, reports/figures/L1_shap_beeswarm.png.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import time

import numpy as np
import pandas as pd
import yaml

from remediaide_ml.eval import metrics as M
from remediaide_ml.eval import stats as S
from remediaide_ml.l1.common import FEAT_A, QUAD, iter_folds, load, quad_labels
from remediaide_ml.l1.lgbm import ABLATION_STAGES, ALL_B, fit_predict, stage_features, tune
from remediaide_ml.paths import FIGURES, RUNS, TABLES
from remediaide_ml.seed import set_seed


def log(m):
    print(f"[{dt.datetime.now():%H:%M:%S}] {m}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n-trials", type=int, default=50)
    ap.add_argument("--stages", default="all")
    ap.add_argument("--quick", action="store_true", help="10%% of CV users, 3 trials, smoke only")
    ap.add_argument("--tune-frac", type=float, default=1.0, help="fraction of fold-0 training users used by Optuna")
    a = ap.parse_args()
    seed = set_seed()
    run = RUNS / f"{dt.datetime.now():%Y%m%d-%H%M}_l1_lgbm{'_quick' if a.quick else ''}"
    run.mkdir(parents=True, exist_ok=True)
    (run / "config.yaml").write_text(yaml.safe_dump(vars(a) | {"seed": seed, "task": "T22"}))
    n_trials = 3 if a.quick else a.n_trials
    metrics: dict = {}
    rng = np.random.default_rng(seed)

    def subsample_users(df, frac):
        u = df.UserId.unique()
        keep = set(rng.choice(u, int(len(u) * frac), replace=False))
        return df[df.UserId.isin(keep)].reset_index(drop=True)

    # ------------------------------------------------------------------ framing (a): next-correct (binary)
    t0 = time.time()
    dfa = load("a")
    if a.quick:
        dfa = subsample_users(dfa, 0.1)
    ya = dfa.IsCorrect.astype(int).to_numpy()
    oof_a = np.full(len(dfa), np.nan)
    params_a = None
    for k, d, tr, va in iter_folds(dfa):
        if params_a is None:
            trn = tr if a.tune_frac >= 1 else tr[np.isin(dfa.UserId.to_numpy()[tr],
                                                          rng.choice(dfa.UserId.to_numpy()[tr],
                                                                     int(a.tune_frac * len(np.unique(dfa.UserId.to_numpy()[tr]))),
                                                                     replace=False))]
            params_a, hist = tune(d.iloc[trn][FEAT_A], ya[trn], d.iloc[va][FEAT_A], ya[va], "binary", n_trials, seed, log)
            pd.DataFrame(hist).to_csv(run / "optuna_a.csv", index=False)
            log(f"(a) best params {params_a}")
        prob, booster = fit_predict(d.iloc[tr][FEAT_A], ya[tr], d.iloc[va][FEAT_A], ya[va], params_a, "binary", seed)
        oof_a[va] = prob
        booster.save_model(str(run / f"model_a_fold{k}.txt"))
        log(f"(a) fold {k}: AUC {M.auc(ya[va], prob):.4f} iters {booster.best_iteration} ({time.time() - t0:.0f}s)")
    ua = dfa.UserId.to_numpy()
    metrics["a"] = {"params": params_a, "auc": S.cluster_bootstrap_ci(M.auc, (ya, oof_a), ua, n_boot=200),
                    "auc_per_fold": [M.auc(ya[dfa.fold == k], oof_a[dfa.fold == k]) for k in range(5)],
                    "logloss": M.logloss(ya, oof_a), "brier": M.brier(ya, oof_a), "ece": M.ece(ya, oof_a)}
    pd.DataFrame({"AnswerId": dfa.AnswerId, "UserId": ua, "fold": dfa.fold, "y": ya, "p": oof_a}).to_parquet(
        run / "oof_a.parquet", index=False)
    log(f"(a) {json.dumps(metrics['a'], default=float)}")
    del dfa

    # ------------------------------------------------------------------ framing (b): 4-class + binary, ablation
    dfb = load("b")
    dfb = dfb[dfb.needs_remediation.notna()].reset_index(drop=True)
    if a.quick:
        dfb = subsample_users(dfb, 0.1)
    y4 = quad_labels(dfb.fut_quadrant)
    yb = dfb.needs_remediation.astype(int).to_numpy()
    e1 = (y4 >= 0) & dfb.has_conf.to_numpy()
    ub = dfb.UserId.to_numpy()
    stages = list(ABLATION_STAGES) if a.stages == "all" else ["S6_waktu"]
    oof4 = {s: np.full((len(dfb), 4), np.nan) for s in stages}
    oofb = {s: np.full(len(dfb), np.nan) for s in stages}
    params4 = paramsb = None
    shap_sample = None
    for k, d, tr, va in iter_folds(dfb):
        lab_tr, lab_va = tr[y4[tr] >= 0], va[y4[va] >= 0]
        if params4 is None:
            params4, h4 = tune(d.iloc[lab_tr][ALL_B], y4[lab_tr], d.iloc[lab_va][ALL_B], y4[lab_va], "multiclass", n_trials,
                               seed, log)
            paramsb, hb = tune(d.iloc[tr][ALL_B], yb[tr], d.iloc[va][ALL_B], yb[va], "binary", n_trials, seed, log)
            pd.DataFrame(h4).to_csv(run / "optuna_b4.csv", index=False)
            pd.DataFrame(hb).to_csv(run / "optuna_bbin.csv", index=False)
            log(f"(b) best params 4-class {params4} | binary {paramsb}")
        for s in stages:
            cols = stage_features(s)
            p4, bst4 = fit_predict(d.iloc[lab_tr][cols], y4[lab_tr], d.iloc[lab_va][cols], y4[lab_va], params4, "multiclass",
                                   seed)
            oof4[s][lab_va] = p4
            pb, bstb = fit_predict(d.iloc[tr][cols], yb[tr], d.iloc[va][cols], yb[va], paramsb, "binary", seed)
            oofb[s][va] = pb
            if s == stages[-1]:
                bst4.save_model(str(run / f"model_b4_fold{k}.txt"))
                bstb.save_model(str(run / f"model_bbin_fold{k}.txt"))
                if k == 0:
                    shap_sample = (bst4, d.iloc[lab_va][cols].sample(min(5000, len(lab_va)), random_state=seed))
            ev = e1[va]
            log(f"(b) fold {k} {s}: macroF1(E1 rows) {M.macro_f1(y4[va][ev], oof4[s][va][ev].argmax(1), labels=[0, 1, 2, 3]):.4f} "
                f"AUC bin {M.auc(yb[va], pb):.4f}")
    rows = []
    metrics["b"] = {"params_4class": params4, "params_binary": paramsb, "n_rows": len(dfb), "n_rows_e1": int(e1.sum())}
    for s in stages:
        _, cnt = S.cluster_confusion_counts(y4[e1], oof4[s][e1].argmax(1), ub[e1], [0, 1, 2, 3])
        mf1 = S.bootstrap_confusion_metric(cnt, S.cm_macro_f1)
        mis = S.bootstrap_confusion_metric(cnt, S.cm_misgroup)
        auc = S.cluster_bootstrap_ci(M.auc, (yb, oofb[s]), ub, n_boot=200)
        metrics["b"][s] = {"macro_f1": mf1, "misgroup": mis, "auc_bin": auc}
        rows.append({"tahap": s, "macro_f1": mf1["point"], "macro_f1_lo": mf1["lo"], "macro_f1_hi": mf1["hi"],
                     "misgroup": mis["point"], "misgroup_lo": mis["lo"], "misgroup_hi": mis["hi"],
                     "auc_bin": auc["point"], "auc_bin_lo": auc["lo"], "auc_bin_hi": auc["hi"], "run": run.name})
    # DeLong between consecutive stages (binary), Holm-corrected
    if len(stages) > 1:
        ps = [S.delong_test(yb, oofb[stages[i + 1]], oofb[stages[i]])["p"] for i in range(len(stages) - 1)]
        adj = S.holm(ps)
        for i in range(len(stages) - 1):
            rows[i + 1]["delong_p_vs_prev"] = ps[i]
            rows[i + 1]["delong_p_holm"] = adj[i]
    last = stages[-1]
    o = pd.DataFrame({"AnswerId": dfb.AnswerId, "UserId": ub, "fold": dfb.fold, "y4": y4, "y_bin": yb, "e1_row": e1,
                      "p_bin": oofb[last], **{f"p4_{q}": oof4[last][:, i] for i, q in enumerate(QUAD)}})
    for s in stages[:-1]:
        o[f"p_bin_{s}"] = oofb[s]
    o.to_parquet(run / "oof_b.parquet", index=False)
    (run / "metrics.json").write_text(json.dumps(metrics, indent=2, default=float))
    if not a.quick:
        TABLES.mkdir(parents=True, exist_ok=True)
        if len(stages) > 1:
            pd.DataFrame(rows).to_csv(TABLES / "E2_ablation_cv.csv", index=False)
        pd.DataFrame([
            {"framing": "a", "model": "B2 LightGBM", "metric": "auc", "value": metrics["a"]["auc"]["point"],
             "ci_lo": metrics["a"]["auc"]["lo"], "ci_hi": metrics["a"]["auc"]["hi"], "run": run.name},
            {"framing": "b", "model": "B2 LightGBM", "metric": "macro_f1", **_v(metrics["b"][last]["macro_f1"]), "run": run.name},
            {"framing": "b", "model": "B2 LightGBM", "metric": "misgroup", **_v(metrics["b"][last]["misgroup"]), "run": run.name},
            {"framing": "b", "model": "B2 LightGBM", "metric": "auc_bin", **_v(metrics["b"][last]["auc_bin"]), "run": run.name},
        ]).to_csv(TABLES / "L1_lgbm_cv.csv", index=False)
    if shap_sample is not None:
        _shap(*shap_sample, run, a.quick)
    log(f"done -> {run}")


def _v(ci):
    return {"value": ci["point"], "ci_lo": ci["lo"], "ci_hi": ci["hi"]}


FEATURE_NAMES_ID = {
    "cur_correct": "jawaban saat ini benar", "cur_cri": "keyakinan saat ini (CRI)", "cur_has_conf": "keyakinan diisi",
    "n_prev": "jumlah jawaban sebelumnya", "acc_prev": "akurasi sebelumnya", "n_prev_kc": "jumlah jawaban di topik ini",
    "acc_prev_kc": "akurasi di topik ini", "ewm_acc_kc": "akurasi terbaru di topik ini", "attempt_no": "percobaan ke-",
    "conf_mean_prev": "rata-rata keyakinan sebelumnya", "conf_mean_prev_kc": "rata-rata keyakinan di topik ini",
    "overconf_prev": "kecenderungan terlalu yakin", "cnt_P_kc": "jumlah 'Paham' di topik ini",
    "cnt_L_kc": "jumlah 'Tebakan beruntung' di topik ini", "cnt_M_kc": "jumlah 'Miskonsepsi' di topik ini",
    "cnt_T_kc": "jumlah 'Tidak paham' di topik ini", "last_quadrant_kc": "kuadran terakhir di topik ini",
    "cur_quadrant_b0": "kuadran aturan v1 saat ini", "item_diff_oof": "tingkat kemudahan soal", "kc_diff_oof": "tingkat kemudahan topik",
    "cur_option_share_oof": "popularitas opsi salah yang dipilih", "hours_since_prev": "jam sejak jawaban sebelumnya",
    "hours_since_prev_kc": "jam sejak jawaban terakhir di topik ini",
}


def _shap(booster, X, run, quick):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import shap

    sv = shap.TreeExplainer(booster).shap_values(X)
    sv = np.asarray(sv)
    # multiclass: (n, f, K) or list -> use class "M" (Miskonsepsi, index 2) for the beeswarm
    if sv.ndim == 3:
        sv_m = sv[:, :, 2] if sv.shape[1] == X.shape[1] else sv[2]
    else:
        sv_m = sv
    Xn = X.rename(columns=FEATURE_NAMES_ID)
    plt.figure()
    shap.summary_plot(sv_m, Xn, show=False, max_display=15)
    plt.title("SHAP L1 (LightGBM, framing b) — kelas Miskonsepsi masa depan")
    plt.xlabel("Nilai SHAP (dampak pada log-odds kelas Miskonsepsi)")
    plt.tight_layout()
    out = (run if quick else FIGURES) / "L1_shap_beeswarm.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(out, dpi=200, bbox_inches="tight")
    plt.close()


if __name__ == "__main__":
    main()
