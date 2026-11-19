"""Audit gap-fill (LAPORAN_REVIEW §14 item 5): spec items that were never computed. CV only; test users untouched.

  python scripts/gap_fill.py [--n-boot 1000] [--only b0a lac opt gender]
Nothing here trains, selects or re-calibrates a production model; every input is an existing CV OOF file.
  b0a    03 §1: B0 under framing (a). Score = last known B0 quadrant of the student in the same KC before t,
         ordinal P=3, L=2, T=1, M=0 (and binary {P, L} = 1) -> AUC for IsCorrect at t. Rows without a previous
         quadrant in the KC have no B0 score; reported on the subset that has one (+ a variant with all rows, missing
         = 1.5). B1b (a) and LightGBM (a) OOF on the same rows, paired DeLong vs B0 ordinal.
         -> reports/tables/E1_b0_framing_a_cv.csv
  lac    03 §3: binary LAC for L1 (needs_remediation). CO-KT 5-seed CV OOF p_bin (oof_b_ens5, as l3_eval --tag final_cv), same 20 % calibration users as
         l3_eval / e6_e8, temperature scaling on [1-p, p] fitted on the calibration part (as e6_e8 --calib
         temperature), LAC alpha 0.10 fitted on the calibration part, coverage on the evaluation part.
         -> reports/tables/E5_lac_binary_L1_cv.json
  opt    T24: accuracy of the CO-KT next-option head (5-seed mean of p_opt*). Baselines: uniform; per-question most
         chosen option from training folds only (OOF). Also on wrong answers: which distractor.
         -> reports/tables/L1_cokt_option_cv.csv
  gender 04 E6: Gender codes 0/3 "reported separately if n >= 200". Same pipeline as e6_e8 --tag final_cv; values
         per code with user-bootstrap CI and differences 0-1, 0-2. Code 3 is counted only.
         -> reports/tables/E6_fairness_gender_codes_cv.csv, reports/tables/E6_gender_counts.json
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import time

import numpy as np
import pandas as pd

from remediaide_ml.data.splits import TEST, calibration_groups
from remediaide_ml.eval import metrics as M
from remediaide_ml.eval import stats as S
from remediaide_ml.l3.calibration import TemperatureProb
from remediaide_ml.l3.conformal import LAC, avg_set_size, coverage
from remediaide_ml.paths import ML_ROOT, PROCESSED, TABLES
from remediaide_ml.seed import GLOBAL_SEED, set_seed

COKT_CV = ML_ROOT / "runs/20261118-2202_cokt_kaggle"
B1_RUN = ML_ROOT / "runs/20261118-2156_l1_b1"
LGBM_RUN = ML_ROOT / "runs/20261118-2205_l1_lgbm"
ORD = {0: 3.0, 1: 2.0, 3: 1.0, 2: 0.0}  # history.Q_CODE P=0 L=1 M=2 T=3 -> ordinal P=3 L=2 T=1 M=0


def log(m):
    print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


def boot_mean_ci(hit: np.ndarray, users: np.ndarray, n_boot: int, seed: int = GLOBAL_SEED) -> dict:
    """Row-level mean with a user-cluster bootstrap (multinomial weights on per-user sums)."""
    g = pd.DataFrame({"u": users, "h": hit.astype(float)}).groupby("u").h.agg(["sum", "count"])
    s, c = g["sum"].to_numpy(), g["count"].to_numpy()
    rng = np.random.default_rng(seed)
    w = rng.multinomial(len(c), np.full(len(c), 1 / len(c)), size=n_boot)
    v = (w @ s) / (w @ c)
    return {"point": float(s.sum() / c.sum()), "lo": float(np.quantile(v, .025)), "hi": float(np.quantile(v, .975))}


def row(**kw):
    return kw


# ---------------------------------------------------------------- b0a
def b0_framing_a(n_boot: int) -> None:
    f = pd.read_parquet(PROCESSED / "eedi_features_a.parquet", columns=["AnswerId", "UserId", "IsCorrect", "last_quadrant_kc"])
    sp = pd.read_parquet(PROCESSED / "eedi_splits.parquet")
    f = f.merge(sp, on="UserId", validate="many_to_one")
    f = f[f.fold != TEST]
    b1 = pd.read_parquet(B1_RUN / "oof_a.parquet", columns=["AnswerId", "B1b_bin"])
    lg = pd.read_parquet(LGBM_RUN / "oof_a.parquet", columns=["AnswerId", "p"])
    d = f.merge(b1, on="AnswerId", validate="one_to_one").merge(lg, on="AnswerId", validate="one_to_one")
    d["b0_ord"] = d.last_quadrant_kc.map(ORD)
    d["b0_bin"] = d.last_quadrant_kc.isin([0, 1]).astype(float)
    sub = d[d.b0_ord.notna()].reset_index(drop=True)
    y, u = sub.IsCorrect.astype(int).to_numpy(), sub.UserId.to_numpy()
    rows = []
    note = f"CV 5 fold, baris dengan kuadran B0 sebelumnya di KC yang sama; CI bootstrap klaster siswa {n_boot}x"
    for name, col in (("B0 (a) skor ordinal P=3,L=2,T=1,M=0", "b0_ord"), ("B0 (a) biner {P,L}=1", "b0_bin"),
                      ("B1b (a) LR", "B1b_bin"), ("B2 LightGBM (a)", "p")):
        ci = S.cluster_bootstrap_ci(M.auc, (y, sub[col].to_numpy()), u, n_boot=n_boot)
        dl = S.delong_test(y, sub[col].to_numpy(), sub.b0_ord.to_numpy()) if col != "b0_ord" else {}
        rows.append(row(model=name, metrik="auc", nilai=ci["point"], ci_lo=ci["lo"], ci_hi=ci["hi"], n_baris=len(sub),
                        n_siswa=int(sub.UserId.nunique()), delong_vs_b0_ord_p=dl.get("p"), catatan=note))
        log(f"{name}: {ci}")
    ya, sa = d.IsCorrect.astype(int).to_numpy(), d.b0_ord.fillna(1.5).to_numpy()
    ci = S.cluster_bootstrap_ci(M.auc, (ya, sa), d.UserId.to_numpy(), n_boot=n_boot)
    rows.append(row(model="B0 (a) skor ordinal, semua baris (tanpa kuadran sebelumnya = 1,5)", metrik="auc",
                    nilai=ci["point"], ci_lo=ci["lo"], ci_hi=ci["hi"], n_baris=len(d), n_siswa=int(d.UserId.nunique()),
                    delong_vs_b0_ord_p=None, catatan=f"CV 5 fold, semua baris; CI bootstrap klaster siswa {n_boot}x"))
    rows.append(row(model="cakupan skor B0 (a)", metrik="porsi baris dengan kuadran sebelumnya", nilai=len(sub) / len(d),
                    ci_lo=None, ci_hi=None, n_baris=len(d), n_siswa=int(d.UserId.nunique()), delong_vs_b0_ord_p=None,
                    catatan="baris CV framing (a)"))
    pd.DataFrame(rows).to_csv(TABLES / "E1_b0_framing_a_cv.csv", index=False)
    log("-> E1_b0_framing_a_cv.csv")


# ---------------------------------------------------------------- lac
def lac_binary() -> None:
    o = pd.read_parquet(COKT_CV / "oof_b_ens5.parquet", columns=["AnswerId", "UserId", "y_bin", "p_bin"])
    o = o[o.y_bin.notna()].reset_index(drop=True)
    cal = calibration_groups(o.UserId.to_numpy())
    pb = o.p_bin.to_numpy(float)
    P = np.column_stack([1 - pb, pb])
    y = o.y_bin.to_numpy().astype(int)
    t = TemperatureProb().fit(P[cal], y[cal])
    Pc = t.predict(P)
    lac = LAC(0.10).fit(Pc[cal], y[cal])
    Se = lac.predict_set(Pc[~cal])
    ye = y[~cal]
    size = Se.sum(1)
    res = {"source": str((COKT_CV / "oof_b_ens5.parquet").relative_to(ML_ROOT)), "alpha": 0.10, "target_coverage": 0.90,
           "calibrator": "temperature on [1-p, p] (calibration users)", "temperature": t.T,
           "n_cal_rows": int(cal.sum()), "n_eval_rows": int((~cal).sum()),
           "n_cal_users": int(o.UserId[cal].nunique()), "n_eval_users": int(o.UserId[~cal].nunique()),
           "lac_qhat": lac.qhat, "coverage": coverage(Se, ye), "avg_set_size": avg_set_size(Se),
           "singleton_share": float((size == 1).mean()), "both_classes_share": float((size == 2).mean()),
           "coverage_class0_no_remediation": float(Se[ye == 0, 0].mean()),
           "coverage_class1_needs_remediation": float(Se[ye == 1, 1].mean()),
           "singleton_accuracy": float((Se[size == 1].argmax(1) == ye[size == 1]).mean()),
           "ece_before": M.ece(ye, P[~cal]), "ece_after": M.ece(ye, Pc[~cal]),
           "note": "CV only (CO-KT CV OOF runs/20261118-2202_cokt_kaggle, 5 seeds, same file as l3_eval final_cv); test not used. Empty sets are filled with argmax (conformal.LAC)."}
    (TABLES / "E5_lac_binary_L1_cv.json").write_text(json.dumps(res, indent=2, default=float))
    log(f"-> E5_lac_binary_L1_cv.json {res}")


# ---------------------------------------------------------------- opt
def option_accuracy(n_boot: int) -> None:
    po = [f"p_opt{i}" for i in range(4)]
    parts = [pd.read_parquet(f, columns=["AnswerId", *po, "y_opt"]).groupby("AnswerId").first()
             for f in sorted(COKT_CV.joinpath("kaggle_output").glob("oof_full_seed*.parquet"))]
    ens = pd.concat(parts, keys=range(len(parts))).groupby(level="AnswerId").mean()
    ens = ens.dropna(subset=po)  # first step of each 200-window has no next-option prediction
    meta = pd.read_parquet(PROCESSED / "eedi_features_a.parquet",
                           columns=["AnswerId", "UserId", "QuestionId", "AnswerValue", "CorrectAnswer"])
    sp = pd.read_parquet(PROCESSED / "eedi_splits.parquet")
    meta = meta.merge(sp, on="UserId", validate="many_to_one")
    meta = meta[meta.fold != TEST]
    d = ens.join(meta.set_index("AnswerId"), how="inner").reset_index()
    d["y"] = (d.AnswerValue.astype(int) - 1).clip(0, 3)
    assert (d.y == d.y_opt).all(), "y_opt != AnswerValue - 1"
    d["corr_opt"] = (d.CorrectAnswer.astype(int) - 1).clip(0, 3)
    P = d[po].to_numpy(float, copy=True)
    P /= P.sum(1, keepdims=True)
    # per-question option counts from training folds only (OOF)
    allm = meta.assign(o=(meta.AnswerValue.astype(int) - 1).clip(0, 3))
    maj = np.full(len(d), -1)
    maj_wrong = np.full(len(d), -1)
    fold = d.fold.to_numpy()
    for k in range(5):
        tr = allm[allm.fold != k]
        cnt = tr.groupby(["QuestionId", "o"]).size().unstack(fill_value=0).reindex(columns=range(4), fill_value=0)
        va = fold == k
        q = d.QuestionId.to_numpy()[va]
        C = cnt.reindex(q).to_numpy(float)
        seen = ~np.isnan(C).any(1)
        C = np.nan_to_num(C)
        m = C.argmax(1)
        m[~seen] = d["corr_opt"].to_numpy()[va][~seen]  # unseen question: fall back to the correct option
        maj[va] = m
        Cw = C.copy()
        Cw[np.arange(len(Cw)), d["corr_opt"].to_numpy()[va]] = -1
        maj_wrong[va] = Cw.argmax(1)
    y, u = d.y.to_numpy(), d.UserId.to_numpy()
    top = np.argsort(-P, 1)
    wrong = y != d["corr_opt"].to_numpy()
    Pw = P.copy()
    Pw[np.arange(len(Pw)), d["corr_opt"].to_numpy()] = -1
    cokt_wrong = Pw.argmax(1)
    rows = []

    def add(model, metric, hit, mask, note):
        ci = boot_mean_ci(hit[mask], u[mask], n_boot)
        rows.append(row(model=model, metrik=metric, nilai=ci["point"], ci_lo=ci["lo"], ci_hi=ci["hi"],
                        n_baris=int(mask.sum()), n_siswa=int(pd.unique(u[mask]).size), catatan=note))
        log(f"{model} {metric}: {ci}")

    allr = np.ones(len(d), bool)
    nb = f"CV 5 fold, ensemble {len(parts)} seed CO-KT (OOF CV); CI bootstrap klaster siswa {n_boot}x"
    add("CO-KT kepala opsi berikutnya", "akurasi top-1 opsi", top[:, 0] == y, allr, nb)
    add("CO-KT kepala opsi berikutnya", "akurasi top-2 opsi", (top[:, 0] == y) | (top[:, 1] == y), allr, nb)
    add("acuan: opsi terbanyak per soal (fold latih)", "akurasi top-1 opsi", maj == y, allr, "OOF per fold; soal tak dikenal -> kunci jawaban")
    add("acuan: acak seragam", "akurasi top-1 opsi (harapan)", np.full(len(d), 0.25), allr, "1/4")
    add("CO-KT kepala opsi berikutnya", "akurasi pengecoh (baris jawaban salah, argmax di 3 opsi salah)",
        cokt_wrong == y, wrong, nb)
    add("acuan: pengecoh terbanyak per soal (fold latih)", "akurasi pengecoh (baris jawaban salah)", maj_wrong == y, wrong,
        "OOF per fold")
    add("acuan: acak di 3 pengecoh", "akurasi pengecoh (harapan)", np.full(len(d), 1 / 3), wrong, "1/3")
    rows.append(row(model="CO-KT kepala opsi berikutnya", metrik="log loss opsi", nilai=M.logloss(y, P, labels=[0, 1, 2, 3]),
                    ci_lo=None, ci_hi=None, n_baris=len(d), n_siswa=int(pd.unique(u).size), catatan=nb))
    pd.DataFrame(rows).to_csv(TABLES / "L1_cokt_option_cv.csv", index=False)
    log("-> L1_cokt_option_cv.csv")


# ---------------------------------------------------------------- gender
def gender_codes(n_boot: int) -> None:
    spec = importlib.util.spec_from_file_location("e6", ML_ROOT / "scripts" / "e6_e8.py")
    e6 = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(e6)
    from remediaide_ml.l3.selective import choose_operating_point, coverage_risk, doubt_max_prob, threshold_for_rate

    # identical preparation to e6_e8.py --oof runs/20261118-2202_cokt_kaggle/oof_b_ens5.parquet --calib temperature
    o = pd.read_parquet(COKT_CV / "oof_b_ens5.parquet")
    meta = pd.read_parquet(PROCESSED / "eedi_features_b.parquet",
                           columns=["AnswerId", "UserId", "Gender", "PremiumPupil", "IsCorrect", "quadrant_b0"])
    o = o.drop(columns=["UserId"]).merge(meta, on="AnswerId", how="left", validate="one_to_one")
    cal = calibration_groups(o.UserId.to_numpy())
    P = o[["p4_P", "p4_L", "p4_M", "p4_T"]].to_numpy(float, copy=True)
    P /= P.sum(1, keepdims=True)
    lab = (o.y4 >= 0).to_numpy()
    iso4 = TemperatureProb().fit(P[cal & lab], o.y4.to_numpy()[cal & lab])
    Pc = iso4.predict(P)
    pb = o.p_bin.to_numpy(float, copy=True)
    isob = TemperatureProb().fit(np.column_stack([1 - pb, pb])[cal], o.y_bin.to_numpy()[cal].astype(int))
    o["c_bin"] = isob.predict(np.column_stack([1 - pb, pb]))[:, 1]
    o["doubt"] = doubt_max_prob(Pc)
    o["pred4"] = Pc.argmax(1)
    calrows = cal & lab & o.e1_row.to_numpy()
    curve = coverage_risk(o.pred4.to_numpy()[calrows] != o.y4.to_numpy()[calrows], o.doubt.to_numpy()[calrows])
    thr = threshold_for_rate(o.doubt.to_numpy()[calrows], choose_operating_point(curve)["defer_rate"])
    o["deferred"] = o.doubt >= thr
    evb = o[~cal & o.y_bin.notna()].copy()
    evb["e1"] = lab[~cal] & o.e1_row.to_numpy()[~cal]

    mets = {"AUC butuh_remediasi": lambda d: M.auc(d.y_bin.astype(int), d.c_bin),
            "ECE": lambda d: M.ece(d.y_bin.astype(int), d.c_bin),
            "salah kelompok": lambda d: M.misgroup_rate(d[d.e1].y4, d[d.e1].pred4),
            "tingkat defer": lambda d: float(d[d.e1].deferred.mean())}
    ref = pd.read_csv(TABLES / "E6_fairness_final_cv.csv").query("atribut == 'Gender'").set_index("metrik")
    for mname, f in mets.items():  # sanity: reproduce the published Gender 1 vs 2 values exactly
        assert np.isclose(f(evb[evb.Gender == 1]), ref.loc[mname, "nilai_a"], rtol=0, atol=1e-12), mname
        assert np.isclose(f(evb[evb.Gender == 2]), ref.loc[mname, "nilai_b"], rtol=0, atol=1e-12), mname
    log("reproduced E6_fairness_final_cv Gender 1 vs 2 values exactly")
    names = {0: "tidak disebut (0)", 1: "perempuan (1)", 2: "laki-laki (2)", 3: "lainnya (3)"}
    rows = []
    for ga, gb in ((0, 1), (0, 2)):
        for mname, f in mets.items():
            va, vb = f(evb[evb.Gender == ga]), f(evb[evb.Gender == gb])
            lo, hi = e6.user_boot_diff(evb, f, ga, gb, "Gender", n_boot=n_boot)
            rows.append({"atribut": "Gender", "kelompok_a": names[ga], "kelompok_b": names[gb], "metrik": mname,
                         "nilai_a": va, "nilai_b": vb, "selisih_a_minus_b": va - vb, "ci_lo": lo, "ci_hi": hi,
                         "ci_memuat_0": lo <= 0 <= hi, "n_siswa_a": int(evb[evb.Gender == ga].UserId.nunique()),
                         "n_siswa_b": int(evb[evb.Gender == gb].UserId.nunique())})
            log(f"{ga} vs {gb} {mname}: {va:.4f} {vb:.4f} [{lo:.4f}, {hi:.4f}]")
    pd.DataFrame(rows).to_csv(TABLES / "E6_fairness_gender_codes_cv.csv", index=False)
    # counts only (no predictions are read for test users)
    st = pd.read_parquet(PROCESSED / "eedi_features_b.parquet", columns=["UserId", "Gender"]).drop_duplicates("UserId")
    st = st.merge(pd.read_parquet(PROCESSED / "eedi_splits.parquet"), on="UserId", validate="one_to_one")
    cnt = {"cv_users": {int(k): int(v) for k, v in st[st.fold != TEST].Gender.value_counts().sort_index().items()},
           "test_users": {int(k): int(v) for k, v in st[st.fold == TEST].Gender.value_counts().sort_index().items()},
           "cv_eval_users_e6": {int(k): int(v) for k, v in evb.drop_duplicates("UserId").Gender.value_counts().sort_index().items()},
           "rule": "04 E6: codes 0/3 reported separately if n >= 200 (CV evaluation users). Code 3 below threshold -> count only.",
           "test_note": "Test users counted from metadata only; no test predictions read (test opened once at T46)."}
    (TABLES / "E6_gender_counts.json").write_text(json.dumps(cnt, indent=2))
    log(f"-> E6_fairness_gender_codes_cv.csv, E6_gender_counts.json {cnt}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n-boot", type=int, default=1000)
    ap.add_argument("--only", nargs="+", default=["b0a", "lac", "opt", "gender"])
    a = ap.parse_args()
    set_seed()
    TABLES.mkdir(parents=True, exist_ok=True)
    for k in a.only:
        log(f"start {k}")
        {"b0a": lambda: b0_framing_a(a.n_boot), "lac": lac_binary, "opt": lambda: option_accuracy(a.n_boot),
         "gender": lambda: gender_codes(a.n_boot)}[k]()
    log("DONE")


if __name__ == "__main__":
    main()
