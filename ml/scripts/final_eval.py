"""T46: open the Eedi test set ONCE and evaluate every selected model + baseline with frozen parameters.

  python scripts/final_eval.py --dry-run     # code check: calibration users stand in for test, nothing goes to reports/
  python scripts/final_eval.py               # the one real run (refuses to run twice; see --rerun-reason)
Nothing is fitted on test users. Frozen inputs:
  L1 CO-KT production (D-18): runs/20261119-0620_cokt_final_kaggle/kaggle_output/pred_test_seed*.parquet (5 seeds),
     models/l1_calibrator_v1.joblib, models/l1_bin_calibrator_v1.joblib, models/l3_conformal_v1.json (D-21).
  L1 LightGBM ensemble: 5 seeds x 5 fold models (runs/20261118-2205_l1_lgbm); framing (a): 5 fold models.
  B1a/B1b: refit on all CV users with the C chosen in T21 (runs/20261118-2156_l1_b1/metrics.json).
  B0: v1 rule (quadrant_b0). Target encodings for test rows come from all CV users' labels only.
MAP has no locked test fold (D-06): L2 results stay CV (reports/tables/L2_cv.csv, E3, E4); this script adds the
E3 teacher-queue view at the production hidden threshold on the CV evaluation rows.
Outputs (real run): reports/tables/{E1_b0_test.csv, E1_confusion_test.csv, L1_test.csv, L1_test_pairwise.csv,
E5_test.json, E5_coverage_risk_L1_test.csv, E6_fairness.csv, E8_impact.csv, robustness_temporal_test.csv,
E3_queue_cv.csv}, figures E1_confusion_b0.png, E1_confusion_cokt.png, E5_coverage_risk.png, E5_reliability_L1.png,
and reports/TEST_OPENED.json (seal).
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import importlib.util
import json
from pathlib import Path

import joblib
import lightgbm as lgb
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from remediaide_ml.data.splits import TEST
from remediaide_ml.eval import metrics as M
from remediaide_ml.eval import stats as S
from remediaide_ml.features.encoding import add_fold_encodings
from remediaide_ml.l1.common import FEAT_A, QUAD, load, quad_labels
from remediaide_ml.l1.lgbm import ALL_B
from remediaide_ml.l3.conformal import LAC, avg_set_size, coverage
from remediaide_ml.l3.selective import coverage_risk, doubt_max_prob
from remediaide_ml.paths import FIGURES, INTERIM, ML_ROOT, MODELS, PROCESSED, REPORTS, RUNS, TABLES
from remediaide_ml.seed import GLOBAL_SEED

COKT_DIR = RUNS / "20261119-0620_cokt_final_kaggle" / "kaggle_output"
LGBM_DIR = RUNS / "20261118-2205_l1_lgbm"
B1_RUN = RUNS / "20261118-2156_l1_b1"
SEEDS = [20261118, 1, 2, 3, 4]
PQ = ["pq_P", "pq_L", "pq_M", "pq_T"]
Q_ID = {"P": "Paham", "L": "Tebakan beruntung", "M": "Miskonsepsi", "T": "Tidak paham"}
SEAL = REPORTS / "TEST_OPENED.json"


def _script(name):
    spec = importlib.util.spec_from_file_location(name, ML_ROOT / "scripts" / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


b1 = _script("train_l1_baselines")
e3 = _script("e3_true_misconception")
e68 = _script("e6_e8")


def log(m):
    print(f"[{dt.datetime.now():%H:%M:%S}] {m}", flush=True)


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()[:16]


# ----------------------------------------------------------------------------------------------- inputs
def cokt_preds(pattern: str) -> pd.DataFrame:
    parts = []
    for s in SEEDS:
        o = pd.read_parquet(COKT_DIR / pattern.format(s=s), columns=["AnswerId", "p_next", *PQ])
        parts.append(o.groupby("AnswerId").first())
    return pd.concat(parts, keys=range(len(parts))).groupby(level="AnswerId").mean()


def lgbm_files(task: str) -> list[Path]:
    out = []
    for s in SEEDS:
        for k in range(5):
            out.append(LGBM_DIR / (f"model_{task}_fold{k}.txt" if s == 20261118 else f"models_seed{s}_{task}_fold{k}.txt"))
    return out


def lgbm_predict(files: list[Path], X: pd.DataFrame) -> np.ndarray:
    preds = []
    for f in files:
        b = lgb.Booster(model_file=str(f))
        preds.append(b.predict(X[b.feature_name()]))
    return np.mean(preds, axis=0)


# ----------------------------------------------------------------------------------------------- helpers
def quad_ci(y, pred, users, n_boot=1000):
    _, cnt = S.cluster_confusion_counts(y, pred, users, [0, 1, 2, 3])
    return (S.bootstrap_confusion_metric(cnt, S.cm_macro_f1, n_boot=n_boot),
            S.bootstrap_confusion_metric(cnt, S.cm_misgroup, n_boot=n_boot), cnt)


def paired_err_diff(err_a, err_b, users, n_boot=1000):
    """User-cluster bootstrap CI of mean(err_a) - mean(err_b) (rows weighted equally)."""
    g = pd.DataFrame({"u": users, "a": err_a, "b": err_b}).groupby("u").agg(["sum", "count"])
    sa, sb, n = g[("a", "sum")].to_numpy(), g[("b", "sum")].to_numpy(), g[("a", "count")].to_numpy()
    rng = np.random.default_rng(GLOBAL_SEED)
    d = []
    for _ in range(n_boot):
        w = rng.multinomial(len(n), np.full(len(n), 1 / len(n)))
        d.append((w @ sa - w @ sb) / (w @ n))
    return float(np.quantile(d, .025)), float(np.quantile(d, .975))


def confusion_fig(cm, path, title, xlabel):
    norm = cm / cm.sum(axis=1, keepdims=True)
    fig, ax = plt.subplots(figsize=(6, 5))
    im = ax.imshow(norm, cmap="Blues", vmin=0, vmax=1)
    for i in range(4):
        for j in range(4):
            ax.text(j, i, f"{norm[i, j]:.2f}\n(n={int(cm[i, j]):,})", ha="center", va="center", fontsize=8,
                    color="white" if norm[i, j] > 0.5 else "black")
    ax.set_xticks(range(4), [Q_ID[q] for q in QUAD], rotation=20)
    ax.set_yticks(range(4), [Q_ID[q] for q in QUAD])
    ax.set_xlabel(xlabel)
    ax.set_ylabel("Kuadran masa depan (3 percobaan berikutnya)")
    ax.set_title(title)
    fig.colorbar(im, ax=ax, fraction=0.046)
    fig.tight_layout()
    fig.savefig(path, dpi=200)
    plt.close(fig)


def reliability_fig(y, P_before, P_after, path, title):
    fig, ax = plt.subplots(figsize=(5.5, 4.5))
    ax.plot([0, 1], [0, 1], "--", color="gray")
    for P, lab in ((P_before, "sebelum kalibrasi"), (P_after, "sesudah temperature")):
        conf, hit = P.max(1), (P.argmax(1) == y).astype(float)
        edges = np.linspace(0, 1, 16)
        idx = np.clip(np.digitize(conf, edges[1:-1], right=True), 0, 14)
        xs = [conf[idx == b].mean() for b in range(15) if (idx == b).sum() >= 30]
        ys = [hit[idx == b].mean() for b in range(15) if (idx == b).sum() >= 30]
        ax.plot(xs, ys, "o-", label=f"{lab} (ECE {M.ece(y, P):.3f})")
    ax.set_xlabel("Keyakinan model (prob. tertinggi)")
    ax.set_ylabel("Akurasi aktual")
    ax.set_title(title)
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(path, dpi=200)
    plt.close(fig)


# ----------------------------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--rerun-reason", default=None, help="only for a documented code-bug rerun (logged in the seal)")
    ap.add_argument("--n-boot", type=int, default=1000)
    a = ap.parse_args()
    if not a.dry_run and SEAL.exists() and not a.rerun_reason:
        raise SystemExit(f"test already opened ({SEAL}); pass --rerun-reason '<bug fixed>' to rerun (logged)")
    run = RUNS / f"{dt.datetime.now():%Y%m%d-%H%M}_final_eval{'_dryrun' if a.dry_run else ''}"
    run.mkdir(parents=True, exist_ok=True)
    tab = run / "tables" if a.dry_run else TABLES
    fig = run / "figures" if a.dry_run else FIGURES
    tab.mkdir(parents=True, exist_ok=True)
    fig.mkdir(parents=True, exist_ok=True)
    nb = a.n_boot
    conf = json.loads((MODELS / "l3_conformal_v1.json").read_text())
    roles = json.loads((COKT_DIR / "roles.json").read_text())
    pattern = "pred_cal_seed{s}.parquet" if a.dry_run else "pred_test_seed{s}.parquet"
    eval_users = set(roles["calibration"] if a.dry_run else roles["test"])
    log(f"{'DRY RUN (calibration users as stand-in)' if a.dry_run else 'REAL TEST RUN'}: {len(eval_users)} users")

    # ---------------- framing (b) frame + encodings from CV labels only
    fb = load("b", include_test=True)
    is_ev = fb.UserId.isin(eval_users).to_numpy()
    train_mask = (fb.fold.to_numpy() != TEST) & ~is_ev
    d = add_fold_encodings(fb, train_mask, fb.fold.to_numpy())
    trn = d[train_mask & d.needs_remediation.notna().to_numpy()].reset_index(drop=True)
    ev = d[is_ev & d.needs_remediation.notna().to_numpy()].reset_index(drop=True)
    log(f"(b) eval rows {len(ev):,}, users {ev.UserId.nunique():,}")
    y4 = quad_labels(ev.fut_quadrant)
    yb = ev.needs_remediation.astype(int).to_numpy()
    e1 = (y4 >= 0) & ev.has_conf.to_numpy()
    users = ev.UserId.to_numpy()

    # B1 (refit on all CV rows, T21 C values)
    bestC = json.loads((B1_RUN / "metrics.json").read_text())
    probs4, probsb = {}, {}
    y4_tr = quad_labels(trn.fut_quadrant)
    ybtr = trn.needs_remediation.astype(int).to_numpy()
    for which in ("B1a", "B1b"):
        Xtr, Xev = b1.design(trn, "b", which), b1.design(ev, "b", which)
        probsb[which] = b1.lr(bestC["b"]["best_C"][f"{which}_bin"]).fit(Xtr, ybtr).predict_proba(Xev)[:, 1]
        lab = y4_tr >= 0
        probs4[which] = b1.lr(bestC["b"]["best_C"][f"{which}_4"]).fit(Xtr[lab], y4_tr[lab]).predict_proba(Xev)
    log("B1 done")
    cache = RUNS / "final_eval_dryrun_cache.npz"
    if a.dry_run and cache.exists():  # dry-run only: reuse LightGBM predictions between code-check iterations
        z = np.load(cache)
        probs4["LightGBM"], probsb["LightGBM"] = z["p4"], z["pb"]
    else:
        probs4["LightGBM"] = lgbm_predict(lgbm_files("b4"), ev[ALL_B])
        probsb["LightGBM"] = lgbm_predict(lgbm_files("bbin"), ev[ALL_B])
        if a.dry_run:
            np.savez(cache, p4=probs4["LightGBM"], pb=probsb["LightGBM"])
    log("LightGBM (b) done")
    ck = cokt_preds(pattern)
    cj = ev[["AnswerId"]].join(ck, on="AnswerId")
    assert cj.pq_P.notna().all(), "CO-KT prediction missing for some eval rows"
    P_raw = cj[PQ].to_numpy(float, copy=True)
    P_raw /= P_raw.sum(1, keepdims=True)
    cal4 = joblib.load(MODELS / "l1_calibrator_v1.joblib")
    calb = joblib.load(MODELS / "l1_bin_calibrator_v1.joblib")
    P_c = cal4.predict(P_raw)
    pb_raw = P_raw[:, 2] + P_raw[:, 3]
    probs4["CO-KT"] = P_c
    probsb["CO-KT"] = calb.predict(np.column_stack([1 - pb_raw, pb_raw]))[:, 1]
    probsb["B0"] = (ev.IsCorrect == 0).astype(float).to_numpy()
    preds4 = {"B0": quad_labels(ev.quadrant_b0)} | {k: v.argmax(1) for k, v in probs4.items()}

    # ---------------- E1 (B0 on test) + L1 table (b)
    rows, pair_rows, res = [], [], {"mode": "dry-run" if a.dry_run else "test", "n_users": len(eval_users)}
    ye, ue = y4[e1], users[e1]
    cms = {}
    for name in ("B0", "B1a", "B1b", "LightGBM", "CO-KT"):
        mf1, mis, cnt = quad_ci(ye, preds4[name][e1], ue, nb)
        cms[name] = cnt.sum(0)
        aucb = S.cluster_bootstrap_ci(M.auc, (yb, probsb[name]), users, n_boot=200)
        for metric, ci in (("macro_f1", mf1), ("misgroup", mis), ("auc_needs_remediation", aucb)):
            rows.append({"framing": "b", "model": name, "metric": metric, "value": ci["point"], "ci_lo": ci["lo"],
                         "ci_hi": ci["hi"], "n_rows": int(e1.sum()) if metric != "auc_needs_remediation" else len(ev),
                         "ci_note": "1000 klaster siswa" if metric != "auc_needs_remediation" else "200 klaster siswa"})
    # E1 story numbers
    _, cntb0 = S.cluster_confusion_counts(ye, preds4["B0"][e1], ue, [0, 1, 2, 3])
    s1 = S.bootstrap_confusion_metric(cntb0, lambda c: float(c[[2, 3], 0].sum() / c[:, 0].sum()), n_boot=nb)
    s2 = S.bootstrap_confusion_metric(cntb0, lambda c: float(c[[0, 1], 2].sum() / c[:, 2].sum()), n_boot=nb)
    _, cbin = S.cluster_confusion_counts(yb, probsb["B0"].astype(int), users, [0, 1])
    berr = S.bootstrap_confusion_metric(cbin, S.cm_misgroup, n_boot=nb)
    b0mf1, b0mis = [r for r in rows if r["model"] == "B0" and r["metric"] in ("macro_f1", "misgroup")]
    e1_rows = [("tingkat salah kelompok (4 kelas)", b0mis), ("macro-F1 (4 kelas)", b0mf1)]
    e1_tab = [{"metrik": n, "nilai": r["value"], "ci_lo": r["ci_lo"], "ci_hi": r["ci_hi"], "n_baris": int(e1.sum())} for n, r in e1_rows]
    for n, ci, nr in (("% 'Paham' B0 yang belum tuntas berikutnya", s1, int(e1.sum())),
                      ("% 'Miskonsepsi' B0 yang tuntas berikutnya", s2, int(e1.sum())),
                      ("error biner butuh_remediasi", berr, len(ev))):
        e1_tab.append({"metrik": n, "nilai": ci["point"], "ci_lo": ci["lo"], "ci_hi": ci["hi"], "n_baris": nr})
    pd.DataFrame(e1_tab).assign(split="test (20% siswa)" if not a.dry_run else "dry-run").to_csv(tab / "E1_b0_test.csv", index=False)
    pd.DataFrame(cms["B0"], index=[f"masa_depan_{q}" for q in QUAD], columns=[f"b0_{q}" for q in QUAD]).to_csv(
        tab / "E1_confusion_test.csv")
    pd.DataFrame(cms["CO-KT"], index=[f"masa_depan_{q}" for q in QUAD], columns=[f"cokt_{q}" for q in QUAD]).to_csv(
        tab / "E1_confusion_cokt_test.csv")
    confusion_fig(cms["B0"], fig / "E1_confusion_b0.png", "E1 (test): aturan CRI v1 vs kuadran masa depan\n(dinormalisasi per baris)",
                  "Kuadran menurut aturan CRI v1 (B0, saat ini)")
    confusion_fig(cms["CO-KT"], fig / "E1_confusion_cokt.png", "E1 (test): RemediAide 2.0 (CO-KT) vs kuadran masa depan\n(dinormalisasi per baris)",
                  "Kuadran prediksi CO-KT (terkalibrasi)")
    # pairwise: CO-KT vs each other model on E1 rows (misgrouping), McNemar + Holm; DeLong on binary AUC
    err = {k: (preds4[k][e1] != ye).astype(float) for k in preds4}
    ps, tmp = [], []
    for other in ("B0", "B1b", "LightGBM"):
        lo, hi = paired_err_diff(err["CO-KT"], err[other], ue, nb)
        mc = S.mcnemar_test(ye, preds4["CO-KT"][e1], preds4[other][e1])
        dl = S.delong_test(yb, probsb["CO-KT"], probsb[other])
        tmp.append({"perbandingan": f"CO-KT vs {other}", "selisih_salah_kelompok": err["CO-KT"].mean() - err[other].mean(),
                    "ci_lo": lo, "ci_hi": hi, "p_mcnemar": mc["p"], "selisih_auc_butuh_remediasi": dl["diff"],
                    "p_delong": dl["p"]})
        ps += [mc["p"], dl["p"]]
    adj = S.holm(ps)
    for i, r in enumerate(tmp):
        r["p_mcnemar_holm"], r["p_delong_holm"] = float(adj[2 * i]), float(adj[2 * i + 1])
        pair_rows.append(r)
    log("(b) metrics done")

    # ---------------- framing (a): next-correct AUC
    fa = load("a", include_test=True)
    is_ev_a = fa.UserId.isin(eval_users).to_numpy()
    tm_a = (fa.fold.to_numpy() != TEST) & ~is_ev_a
    da = add_fold_encodings(fa, tm_a, fa.fold.to_numpy())
    eva = da[is_ev_a].reset_index(drop=True)
    tra = da[tm_a].reset_index(drop=True)
    ya = eva.IsCorrect.astype(int).to_numpy()
    pa = {"B1a": eva.item_diff_oof.to_numpy(float)}
    pa["B1b"] = b1.lr(bestC["a"]["best_C"]["B1b_bin"]).fit(b1.design(tra, "a", "B1b"), tra.IsCorrect.astype(int)).predict_proba(
        b1.design(eva, "a", "B1b"))[:, 1]
    pa["LightGBM"] = lgbm_predict([LGBM_DIR / f"model_a_fold{k}.txt" for k in range(5)], eva[FEAT_A])
    pa["CO-KT"] = eva[["AnswerId"]].join(ck[["p_next"]], on="AnswerId").p_next.to_numpy(float)
    ok = ~np.isnan(pa["CO-KT"])
    ua = eva.UserId.to_numpy()
    for name, s in pa.items():
        ci = S.cluster_bootstrap_ci(M.auc, (ya[ok], s[ok]), ua[ok], n_boot=200)
        rows.append({"framing": "a", "model": name, "metric": "auc_next_correct", "value": ci["point"], "ci_lo": ci["lo"],
                     "ci_hi": ci["hi"], "n_rows": int(ok.sum()), "ci_note": "200 klaster siswa; baris dengan prediksi CO-KT"})
    ps, tmp = [], []
    for other in ("B1b", "LightGBM"):
        dl = S.delong_test(ya[ok], pa["CO-KT"][ok], pa[other][ok])
        tmp.append({"perbandingan": f"(a) CO-KT vs {other}", "selisih_auc_next_correct": dl["diff"], "p_delong": dl["p"]})
        ps.append(dl["p"])
    for r, p in zip(tmp, S.holm(ps), strict=True):
        pair_rows.append(r | {"p_delong_holm": float(p)})
    pd.DataFrame(rows).to_csv(tab / "L1_test.csv", index=False)
    pd.DataFrame(pair_rows).to_csv(tab / "L1_test_pairwise.csv", index=False)
    log("(a) done")

    # ---------------- E5 on test (production parameters, no refit)
    lac = LAC(conf["alpha"])
    lac.qhat = conf["l1_lac_qhat"]
    Pe = P_c[e1]
    Sset = lac.predict_set(Pe)
    doubt = doubt_max_prob(Pe)
    deferred = doubt >= conf["l1_doubt_threshold"]
    curve = coverage_risk(Pe.argmax(1) != ye, doubt)
    curve.to_csv(tab / "E5_coverage_risk_L1_test.csv", index=False)
    e5 = {"ece_before": M.ece(ye, P_raw[e1]), "ece_after": M.ece(ye, Pe), "lac_coverage": coverage(Sset, ye),
          "lac_avg_set_size": avg_set_size(Sset), "lac_singleton_share": float((Sset.sum(1) == 1).mean()),
          "defer_rate_at_production_threshold": float(deferred.mean()), "production_defer_target": conf["l1_operating_point"],
          "misgroup_no_defer": float((Pe.argmax(1) != ye).mean()), "misgroup_kept": float((Pe.argmax(1) != ye)[~deferred].mean()),
          "ece_bin_needs_remediation": M.ece(yb, np.column_stack([1 - probsb["CO-KT"], probsb["CO-KT"]])),
          "n_rows": int(e1.sum())}
    res["E5"] = e5
    (tab / "E5_test.json").write_text(json.dumps(e5, indent=2, default=float))
    f5, ax = plt.subplots(figsize=(5.5, 4.5))
    ax.plot(curve.defer_rate * 100, curve.risk, "o-", label="CO-KT (test)")
    ax.axhline(err["B0"].mean(), color="gray", ls="--", label="aturan v1 (B0), tanpa defer")
    ax.axvline(conf["l1_operating_point"]["defer_rate"] * 100, color="#C44E52", ls=":", label="titik operasi D-21 (20%)")
    ax.set_xlabel("Persentase kasus diserahkan ke guru (%)")
    ax.set_ylabel("Tingkat salah kelompok pada sisa kasus")
    ax.set_title("E5 coverage–risk L1 (test)")
    ax.legend(fontsize=8)
    f5.tight_layout()
    f5.savefig(fig / "E5_coverage_risk.png", dpi=200)
    plt.close(f5)
    reliability_fig(ye, P_raw[e1], Pe, fig / "E5_reliability_L1.png", "Reliability L1 kuadran masa depan (test)")

    # ---------------- E8 on test
    b0p = preds4["B0"][e1]
    ml = Pe.argmax(1)
    kept = ~deferred
    e8 = {"n_eval_rows": int(e1.sum()), "n_eval_users": int(len(np.unique(ue))), "b0_misgroup": M.misgroup_rate(ye, b0p),
          "ml_misgroup": M.misgroup_rate(ye, ml), "defer_rate": float(deferred.mean()),
          "ml_misgroup_kept": M.misgroup_rate(ye[kept], ml[kept]), "b0_misgroup_on_kept": M.misgroup_rate(ye[kept], b0p[kept]),
          "errors_caught_by_defer": float(((ml != ye) & deferred).sum() / max(1, (ml != ye).sum())),
          "ml_minus_b0_misgroup_ci": list(paired_err_diff(err["CO-KT"], err["B0"], ue, nb))}
    e8["teacher_reviews_per_class_32x15"] = round(32 * 15 * e8["defer_rate"], 1)
    # kept-only ML vs B0 on all rows: system error if deferred cases are corrected by the teacher (upper bound)
    e8["system_misgroup_if_teacher_fixes_deferred"] = float(((ml != ye) & kept).mean())
    res["E8"] = e8
    pd.DataFrame([{"metrik": k, "nilai": json.dumps(v) if isinstance(v, list | dict) else v} for k, v in e8.items()]).to_csv(
        tab / "E8_impact.csv", index=False)

    # ---------------- E6 on test (groups never model features, D-13)
    meta = pd.read_parquet(PROCESSED / "eedi_features_b.parquet", columns=["AnswerId", "Gender", "PremiumPupil"])
    g = ev[["AnswerId", "UserId", "IsCorrect"]].merge(meta, on="AnswerId", how="left", validate="one_to_one")
    g["y_bin"], g["c_bin"], g["e1"] = yb, probsb["CO-KT"], e1
    g["y4"], g["pred4"] = y4, P_c.argmax(1)
    g["deferred"] = doubt_max_prob(P_c) >= conf["l1_doubt_threshold"]
    acc_u = g.groupby("UserId").IsCorrect.mean()
    g["ability_q"] = g.UserId.map(pd.qcut(acc_u, 4, labels=["Q1 rendah", "Q2", "Q3", "Q4 tinggi"])).astype(str)
    fns = {"AUC butuh_remediasi": lambda x: M.auc(x.y_bin.astype(int), x.c_bin), "ECE": lambda x: M.ece(x.y_bin.astype(int), x.c_bin),
           "salah kelompok": lambda x: M.misgroup_rate(x[x.e1].y4, x[x.e1].pred4), "tingkat defer": lambda x: float(x[x.e1].deferred.mean())}
    e6 = []
    for col, ga, gb, na, nb_ in (("Gender", 1, 2, "perempuan", "laki-laki"), ("PremiumPupil", 1.0, 0.0, "pupil premium", "bukan"),
                                 ("ability_q", "Q1 rendah", "Q4 tinggi", "kuartil 1", "kuartil 4")):
        for mname, f in fns.items():
            va_, vb_ = f(g[g[col] == ga]), f(g[g[col] == gb])
            lo, hi = e68.user_boot_diff(g, f, ga, gb, col, n_boot=nb)
            e6.append({"atribut": col, "kelompok_a": na, "kelompok_b": nb_, "metrik": mname, "nilai_a": va_, "nilai_b": vb_,
                       "selisih_a_minus_b": va_ - vb_, "ci_lo": lo, "ci_hi": hi, "ci_memuat_0": lo <= 0 <= hi,
                       "n_siswa_a": int(g[g[col] == ga].UserId.nunique()), "n_siswa_b": int(g[g[col] == gb].UserId.nunique())})
    # B0 fairness gap on the same groups (misgrouping), for context
    g["pred_b0"] = preds4["B0"]
    for col, ga, gb, na, nb_ in (("PremiumPupil", 1.0, 0.0, "pupil premium", "bukan"), ("ability_q", "Q1 rendah", "Q4 tinggi", "kuartil 1", "kuartil 4")):
        f = lambda x: M.misgroup_rate(x[x.e1].y4, x[x.e1].pred_b0)  # noqa: E731
        va_, vb_ = f(g[g[col] == ga]), f(g[g[col] == gb])
        lo, hi = e68.user_boot_diff(g, f, ga, gb, col, n_boot=nb)
        e6.append({"atribut": col, "kelompok_a": na, "kelompok_b": nb_, "metrik": "salah kelompok (B0 aturan v1, pembanding)",
                   "nilai_a": va_, "nilai_b": vb_, "selisih_a_minus_b": va_ - vb_, "ci_lo": lo, "ci_hi": hi, "ci_memuat_0": lo <= 0 <= hi,
                   "n_siswa_a": int(g[g[col] == ga].UserId.nunique()), "n_siswa_b": int(g[g[col] == gb].UserId.nunique())})
    pd.DataFrame(e6).to_csv(tab / "E6_fairness.csv", index=False)
    log("E5/E6/E8 done")

    # ---------------- robustness: last 20% of each eval user's interactions (temporal)
    pos = ev.groupby("UserId").seq_pos.rank(method="first") - 1
    n_u = ev.groupby("UserId").seq_pos.transform("size")
    late = (pos >= np.ceil(0.8 * n_u)).to_numpy() & e1
    rob = []
    for name in ("B0", "LightGBM", "CO-KT"):
        mf1, mis, _ = quad_ci(y4[late], preds4[name][late], users[late], nb)
        rob += [{"subset": "20% interaksi terakhir per siswa", "model": name, "metric": m, "value": c["point"], "ci_lo": c["lo"],
                 "ci_hi": c["hi"], "n_rows": int(late.sum())} for m, c in (("macro_f1", mf1), ("misgroup", mis))]
    pd.DataFrame(rob).to_csv(tab / "robustness_temporal_test.csv", index=False)

    # ---------------- E3 teacher-queue view (MAP CV evaluation rows; MAP has no test fold)
    m = pd.read_parquet(INTERIM / "map.parquet").sort_values("row_id").reset_index(drop=True)
    sp = pd.read_parquet(PROCESSED / "map_splits.parquet")
    m = m.merge(sp[["row_id", "fold_random"]], on="row_id", validate="one_to_one")
    from remediaide_ml.data.splits import calibration_groups

    cal = calibration_groups(m.row_id.to_numpy())
    q3 = []
    for name, src in (("tfidf", RUNS / "20261118-2131_l2_tfidf" / "oof_target.parquet"),
                      ("mdeberta", RUNS / "20261118-2202_l2_mdeberta_kaggle" / "kaggle_output")):
        P2, cls = e3.load_oof(src, m)
        T = conf[f"l2_{name}"]["temperature"]
        L = np.log(np.clip(P2, 1e-12, 1)) / T
        Pt = np.exp(L - L.max(1, keepdims=True))
        Pt /= Pt.sum(1, keepdims=True)
        tmc = np.char.startswith(cls.astype(str), "True_Misconception")
        flag = (Pt[:, tmc].sum(1) >= conf[f"l2_{name}"]["hidden_threshold"]) & m.target.str.startswith("True_").to_numpy()
        pos_ = (m.Category == "True_Misconception").to_numpy()
        evm = ~cal
        q3.append({"model": name, "ambang": conf[f"l2_{name}"]["hidden_threshold"], "n_positif": int((pos_ & evm).sum()),
                   "positif_masuk_antrean": int((flag & pos_ & evm).sum()), "recall_antrean": float(flag[pos_ & evm].mean()),
                   "presisi_antrean": float(pos_[flag & evm].mean()) if (flag & evm).any() else None,
                   "porsi_jawaban_benar_ditandai": float(flag[evm & m.target.str.startswith("True_").to_numpy()].mean()),
                   "split": "CV MAP, 80% baris evaluasi (bukan kalibrasi)"})
    pd.DataFrame(q3).to_csv(tab / "E3_queue_cv.csv", index=False)

    # ---------------- seal
    res["inputs"] = {p.name: sha(p) for p in sorted(COKT_DIR.glob(pattern.replace("{s}", "*")))}
    res["inputs"] |= {"l3_conformal_v1.json": sha(MODELS / "l3_conformal_v1.json"),
                      "l1_calibrator_v1.joblib": sha(MODELS / "l1_calibrator_v1.joblib")}
    (run / "metrics.json").write_text(json.dumps(res, indent=2, default=float))
    if not a.dry_run:
        prev = json.loads(SEAL.read_text()) if SEAL.exists() else {"runs": []}
        prev["runs"].append({"opened_at": dt.datetime.now().isoformat(timespec="seconds"), "run": run.name,
                             "rerun_reason": a.rerun_reason, "inputs": res["inputs"]})
        SEAL.write_text(json.dumps(prev, indent=2))
    print(pd.DataFrame(rows).round(4).to_string())
    print(pd.DataFrame(pair_rows).round(4).to_string())
    print(json.dumps({"E5": e5, "E8": e8}, indent=1, default=float))
    log(f"done -> {run}")


if __name__ == "__main__":
    main()
