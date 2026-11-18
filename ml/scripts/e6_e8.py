"""T45 (development, CV): E6 fairness and E8 teacher-impact simulation for Layer 1 + Layer 3.

  python scripts/e6_e8.py --oof runs/<lgbm>/oof_b.parquet --p4 p4_P p4_L p4_M p4_T --pbin p_bin --tag lgbm
Protocol (same as l3_eval): 20% of CV users = calibration part (isotonic + D-09 operating point), 80% = evaluation.
E8: on evaluation rows with a 4-class label, misgrouping of B0 vs ML, deferral at the D-09 point, misgrouping of
    the kept cases, teacher load per class of 32 students x 15 questions.
E6: per group (Gender 1 vs 2, PremiumPupil 0 vs 1, ability quartile): AUC (needs_remediation), ECE, misgrouping,
    defer rate; difference with user-cluster bootstrap CI (1000). Group attributes are never model features (D-13).
Outputs reports/tables/E6_fairness_<tag>.csv, reports/tables/E8_impact_<tag>.csv.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from remediaide_ml.data.splits import calibration_groups
from remediaide_ml.eval import metrics as M
from remediaide_ml.l1.common import quad_labels
from remediaide_ml.l3.calibration import IsotonicBinary, IsotonicMulticlass
from remediaide_ml.l3.selective import choose_operating_point, coverage_risk, doubt_max_prob, threshold_for_rate
from remediaide_ml.paths import PROCESSED, TABLES
from remediaide_ml.seed import GLOBAL_SEED


def user_boot_diff(df, metric, ga, gb, col, n_boot=1000, seed=GLOBAL_SEED):
    """Difference metric(group a) - metric(group b), resampling users within each group."""
    rng = np.random.default_rng(seed)
    out = []
    sub = {g: df[df[col] == g] for g in (ga, gb)}
    users = {g: sub[g].UserId.unique() for g in (ga, gb)}
    idx = {g: sub[g].groupby("UserId").indices for g in (ga, gb)}
    for _ in range(n_boot):
        vals = []
        for g in (ga, gb):
            pick = rng.choice(users[g], len(users[g]))
            rows = np.concatenate([idx[g][u] for u in pick])
            try:
                vals.append(metric(sub[g].iloc[rows]))
            except ValueError:
                vals.append(np.nan)
        out.append(vals[0] - vals[1])
    out = np.array(out, float)
    out = out[np.isfinite(out)]
    return float(np.quantile(out, .025)), float(np.quantile(out, .975))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--oof", type=Path, required=True)
    ap.add_argument("--p4", nargs=4, default=["p4_P", "p4_L", "p4_M", "p4_T"])
    ap.add_argument("--pbin", default="p_bin")
    ap.add_argument("--tag", default="dev")
    ap.add_argument("--n-boot", type=int, default=1000)
    a = ap.parse_args()
    o = pd.read_parquet(a.oof)
    meta = pd.read_parquet(PROCESSED / "eedi_features_b.parquet",
                           columns=["AnswerId", "UserId", "Gender", "PremiumPupil", "IsCorrect", "quadrant_b0"])
    o = o.drop(columns=[c for c in ("UserId",) if c in o]).merge(meta, on="AnswerId", how="left", validate="one_to_one")
    cal = calibration_groups(o.UserId.to_numpy())
    # ability quartile from each user's overall accuracy (grouping only)
    acc_u = o.groupby("UserId").IsCorrect.mean()
    o["ability_q"] = o.UserId.map(pd.qcut(acc_u, 4, labels=["Q1 rendah", "Q2", "Q3", "Q4 tinggi"])).astype(str)

    P = o[a.p4].to_numpy(float, copy=True)
    P /= P.sum(1, keepdims=True)
    lab = (o.y4 >= 0).to_numpy()
    iso4 = IsotonicMulticlass().fit(P[cal & lab], o.y4.to_numpy()[cal & lab])
    o[["c_P", "c_L", "c_M", "c_T"]] = iso4.predict(P)
    isob = IsotonicBinary().fit(o[a.pbin].to_numpy()[cal], o.y_bin.to_numpy()[cal])
    o["c_bin"] = isob.predict(o[a.pbin].to_numpy())
    Pc = o[["c_P", "c_L", "c_M", "c_T"]].to_numpy()
    o["doubt"] = doubt_max_prob(Pc)
    o["pred4"] = Pc.argmax(1)
    calrows = cal & lab & o.e1_row.to_numpy()
    curve = coverage_risk(o.pred4.to_numpy()[calrows] != o.y4.to_numpy()[calrows], o.doubt.to_numpy()[calrows])
    op = choose_operating_point(curve)
    thr = threshold_for_rate(o.doubt.to_numpy()[calrows], op["defer_rate"])
    o["deferred"] = o.doubt >= thr

    ev = o[~cal & lab & o.e1_row].copy()
    y = ev.y4.to_numpy()
    b0 = quad_labels(ev.quadrant_b0)
    ml = ev.pred4.to_numpy()
    kept = ~ev.deferred.to_numpy()
    e8 = {"n_eval_rows": len(ev), "n_eval_users": int(ev.UserId.nunique()), "operating_point": op, "doubt_threshold": thr,
          "b0_misgroup": M.misgroup_rate(y, b0), "ml_misgroup": M.misgroup_rate(y, ml),
          "defer_rate": float(ev.deferred.mean()), "ml_misgroup_kept": M.misgroup_rate(y[kept], ml[kept]),
          "b0_misgroup_on_kept": M.misgroup_rate(y[kept], b0[kept]),
          "errors_caught_by_defer": float(((ml != y) & ~kept).sum() / max(1, (ml != y).sum()))}
    e8["teacher_reviews_per_class_32x15"] = round(32 * 15 * e8["defer_rate"], 1)
    # user-cluster CI for the B0 vs ML gap
    ev["err_b0"] = (b0 != y).astype(float)
    ev["err_ml"] = (ml != y).astype(float)
    rng = np.random.default_rng(GLOBAL_SEED)
    g = ev.groupby("UserId")[["err_b0", "err_ml"]].agg(["sum", "count"])
    sb, sm, cnt = g[("err_b0", "sum")].to_numpy(), g[("err_ml", "sum")].to_numpy(), g[("err_b0", "count")].to_numpy()
    diffs = []
    for _ in range(a.n_boot):
        w = rng.multinomial(len(cnt), np.full(len(cnt), 1 / len(cnt)))
        diffs.append((w @ sm - w @ sb) / (w @ cnt))
    e8["ml_minus_b0_misgroup_ci"] = [float(np.quantile(diffs, .025)), float(np.quantile(diffs, .975))]
    TABLES.mkdir(parents=True, exist_ok=True)
    pd.DataFrame([{"metrik": k, "nilai": json.dumps(v) if isinstance(v, dict | list) else v} for k, v in e8.items()]).to_csv(
        TABLES / f"E8_impact_{a.tag}.csv", index=False)

    # ---- E6 fairness on evaluation users
    evb = o[~cal & o.y_bin.notna()].copy()
    evb["e1"] = lab[~cal] & o.e1_row.to_numpy()[~cal]

    def m_auc(d):
        return M.auc(d.y_bin.astype(int), d.c_bin)

    def m_ece(d):
        return M.ece(d.y_bin.astype(int), d.c_bin)

    def m_mis(d):
        d = d[d.e1]
        return M.misgroup_rate(d.y4, d.pred4)

    def m_def(d):
        return float(d[d.e1].deferred.mean())

    rows = []
    groups = [("Gender", 1, 2, "perempuan", "laki-laki"), ("PremiumPupil", 1.0, 0.0, "pupil premium", "bukan"),
              ("ability_q", "Q1 rendah", "Q4 tinggi", "kuartil 1", "kuartil 4")]
    for col, ga, gb, na, nb in groups:
        for mname, f in (("AUC butuh_remediasi", m_auc), ("ECE", m_ece), ("salah kelompok", m_mis), ("tingkat defer", m_def)):
            va, vb = f(evb[evb[col] == ga]), f(evb[evb[col] == gb])
            lo, hi = user_boot_diff(evb, f, ga, gb, col, n_boot=a.n_boot)
            rows.append({"atribut": col, "kelompok_a": na, "kelompok_b": nb, "metrik": mname, "nilai_a": va, "nilai_b": vb,
                         "selisih_a_minus_b": va - vb, "ci_lo": lo, "ci_hi": hi, "ci_memuat_0": lo <= 0 <= hi,
                         "n_siswa_a": int(evb[evb[col] == ga].UserId.nunique()),
                         "n_siswa_b": int(evb[evb[col] == gb].UserId.nunique())})
    pd.DataFrame(rows).to_csv(TABLES / f"E6_fairness_{a.tag}.csv", index=False)
    print(json.dumps(e8, indent=2, default=float))
    print(pd.DataFrame(rows)[["atribut", "metrik", "nilai_a", "nilai_b", "ci_lo", "ci_hi"]].round(4).to_string())


if __name__ == "__main__":
    main()
