"""D-26: post-seal analyses requested by an external review. Test is NOT reopened.

  python scripts/postseal_cv.py [--n-boot 1000]
1. Per-quadrant recall.
   TEST: arithmetic on the stored confusion matrices only (E1_confusion_test.csv = B0, E1_confusion_cokt_test.csv = CO-KT).
   CV:   B0, B1b, LightGBM (ens5) and CO-KT (ens5) OOF on the same E1 rows, user-cluster bootstrap CI.
   -> reports/tables/E1_recall_per_class_test.csv, E1_recall_per_class_cv.csv, E1_correct_by_class_test.csv
2a. Share of future-Misconception cases missed by CO-KT that the 20% defer queue catches (CV).
2b. "Misconception priority" mode: argmax(p_k * w_k), w_M chosen on the calibration users by the D-26 rule, evaluated on
    the separate evaluation users with paired user-cluster bootstrap vs B0.
   -> reports/tables/E5_postseal_defer_misconception_cv.json, E8_misconception_priority_cv.csv,
      E8_misconception_priority_grid_cv.csv
All outputs are labelled "pasca-segel, CV" (D-26) and never replace the headline or the production model.
"""

from __future__ import annotations

import argparse
import json

import numpy as np
import pandas as pd

from remediaide_ml.data.splits import calibration_groups
from remediaide_ml.l1.common import quad_labels
from remediaide_ml.l3.calibration import TemperatureProb
from remediaide_ml.l3.selective import doubt_max_prob, threshold_for_rate
from remediaide_ml.paths import ML_ROOT, PROCESSED, TABLES
from remediaide_ml.seed import GLOBAL_SEED, set_seed

QUAD = ["Paham", "Tebakan beruntung", "Miskonsepsi", "Tidak paham"]  # y4 order P, L, M, T
LABEL = "pasca-segel, CV (D-26)"
W_GRID = np.round(np.arange(1.0, 3.0001, 0.1), 1)


# ------------------------------------------------------------------ metrics on confusion counts
def recall(c, k):
    return float(c[k, k] / c[k].sum())


def misgroup(c):
    return float(1 - np.trace(c) / c.sum())


def macro_f1(c):
    f = []
    for k in range(4):
        tp, fp, fn = c[k, k], c[:, k].sum() - c[k, k], c[k].sum() - c[k, k]
        f.append(0.0 if tp == 0 else 2 * tp / (2 * tp + fp + fn))
    return float(np.mean(f))


def per_user_counts(y, pred, users):
    uniq, inv = np.unique(users, return_inverse=True)
    out = np.zeros((len(uniq), 4, 4))
    np.add.at(out, (inv, y, pred), 1)
    return out


class PairedBoot:
    """Multinomial user weights shared by every model -> paired CIs for metrics and differences."""

    def __init__(self, n_users, n_boot, seed=GLOBAL_SEED):
        rng = np.random.default_rng(seed)
        self.w = rng.multinomial(n_users, np.full(n_users, 1 / n_users), size=n_boot).astype(float)

    def cms(self, counts):
        return np.einsum("bu,uij->bij", self.w, counts)

    def ci(self, f, counts, ref=None):
        a = np.array([f(c) for c in self.cms(counts)])
        if ref is not None:
            a = a - np.array([f(c) for c in self.cms(ref)])
        return float(np.quantile(a, .025)), float(np.quantile(a, .975))


# ------------------------------------------------------------------ 1. recall per class
def recall_test() -> None:
    rows, corr = [], []
    for model, f in (("B0 aturan v1", "E1_confusion_test.csv"), ("M1 CO-KT", "E1_confusion_cokt_test.csv")):
        c = pd.read_csv(TABLES / f, index_col=0).to_numpy(float)
        for k, q in enumerate(QUAD):
            rows.append({"model": model, "kuadran_masa_depan": q, "recall": recall(c, k), "benar": int(c[k, k]),
                         "n": int(c[k].sum()), "sumber": f})
        corr.append(np.diag(c))
    pd.DataFrame(rows).to_csv(TABLES / "E1_recall_per_class_test.csv", index=False)
    d = corr[1] - corr[0]
    tot = float(d.sum())
    pd.DataFrame({"kuadran_masa_depan": QUAD, "benar_b0": corr[0].astype(int), "benar_cokt": corr[1].astype(int),
                  "tambahan_benar_cokt_minus_b0": d.astype(int), "porsi_dari_total_tambahan": d / tot,
                  "catatan": "test; dihitung dari confusion matrix tersimpan (D-26), tanpa inferensi baru"}
                 ).to_csv(TABLES / "E1_correct_by_class_test.csv", index=False)
    print(pd.DataFrame(rows).round(4).to_string())


def cv_frame() -> pd.DataFrame:
    o = pd.read_parquet(ML_ROOT / "runs/20261118-2202_cokt_kaggle/oof_b_ens5.parquet")
    o = o[o.e1_row & (o.y4 >= 0)].copy()
    meta = pd.read_parquet(PROCESSED / "eedi_features_b.parquet", columns=["AnswerId", "quadrant_b0"])
    b1 = pd.read_parquet(ML_ROOT / "runs/20261118-2156_l1_b1/oof_b.parquet",
                         columns=["AnswerId", "B1b_4_P", "B1b_4_L", "B1b_4_M", "B1b_4_T"])
    lg = pd.read_parquet(ML_ROOT / "runs/20261118-2205_l1_lgbm/oof_b_ens5.parquet",
                         columns=["AnswerId", "p4_P", "p4_L", "p4_M", "p4_T"]).rename(columns=lambda c: c.replace("p4_", "lg_"))
    o = o.merge(meta, on="AnswerId", validate="one_to_one").merge(b1, on="AnswerId", validate="one_to_one")
    o = o.merge(lg, on="AnswerId", validate="one_to_one").reset_index(drop=True)
    return o


def recall_cv(o, n_boot) -> None:
    y = o.y4.to_numpy()
    preds = {"B0 aturan v1": quad_labels(o.quadrant_b0),
             "B1b regresi logistik": o[["B1b_4_P", "B1b_4_L", "B1b_4_M", "B1b_4_T"]].to_numpy().argmax(1),
             "B2 LightGBM (ens5)": o[["lg_P", "lg_L", "lg_M", "lg_T"]].to_numpy().argmax(1),
             "M1 CO-KT (ens5)": o[["p4_P", "p4_L", "p4_M", "p4_T"]].to_numpy().argmax(1)}
    users = o.UserId.to_numpy()
    pb = PairedBoot(len(np.unique(users)), n_boot)
    rows = []
    for name, p in preds.items():
        cnt = per_user_counts(y, p, users)
        c = cnt.sum(0)
        for k, q in enumerate(QUAD):
            lo, hi = pb.ci(lambda m, k=k: recall(m, k), cnt)
            rows.append({"model": name, "kuadran_masa_depan": q, "recall": recall(c, k), "ci_lo": lo, "ci_hi": hi,
                         "n": int(c[k].sum()), "label": LABEL})
    pd.DataFrame(rows).to_csv(TABLES / "E1_recall_per_class_cv.csv", index=False)
    print(pd.DataFrame(rows).round(4).to_string())


# ------------------------------------------------------------------ 2. mitigation
def mitigation(o, n_boot) -> None:
    users = o.UserId.to_numpy()
    cal = calibration_groups(users)
    y = o.y4.to_numpy()
    P = o[["p4_P", "p4_L", "p4_M", "p4_T"]].to_numpy(float, copy=True)
    P /= P.sum(1, keepdims=True)
    t = TemperatureProb().fit(P[cal], y[cal])
    Pc = t.predict(P)
    b0 = quad_labels(o.quadrant_b0)
    # 2a: defer queue at 20% (threshold on calibration users)
    doubt = doubt_max_prob(Pc)
    thr = threshold_for_rate(doubt[cal], 0.20)
    ev = ~cal
    pred = Pc.argmax(1)
    deferred = doubt >= thr
    m = ev & (y == 2)
    missed = m & (pred != 2)
    res_a = {"label": LABEL, "source": "runs/20261118-2202_cokt_kaggle/oof_b_ens5.parquet", "temperature": t.T,
             "defer_threshold_doubt": thr, "defer_rate_eval": float(deferred[ev].mean()),
             "n_eval_future_misconception": int(m.sum()), "recall_misconception_cokt_eval": float((pred[m] == 2).mean()),
             "share_future_M_missed_by_model": float(missed.sum() / m.sum()),
             "share_of_missed_M_caught_by_defer": float(deferred[missed].mean()),
             "share_future_M_flagged_correct_or_deferred": float(((pred == 2) | deferred)[m].mean()),
             "recall_misconception_b0_eval": float((b0[m] == 2).mean()),
             "note": "Kasus yang diserahkan ke guru dianggap tertangkap hanya bila guru benar; akurasi guru belum diukur (E9)."}
    (TABLES / "E5_postseal_defer_misconception_cv.json").write_text(json.dumps(res_a, indent=2))
    print(json.dumps(res_a, indent=1))
    # 2b: misconception-priority weights, chosen on calibration users (D-26 rule)
    rec_b0_cal = float((b0[cal & (y == 2)] == 2).mean())
    grid = []
    for w in W_GRID:
        pw = (Pc * np.array([1.0, 1.0, w, 1.0])).argmax(1)
        cc = per_user_counts(y[cal], pw[cal], users[cal]).sum(0)
        grid.append({"w_M": float(w), "recall_M_kalibrasi": recall(cc, 2), "macro_f1_kalibrasi": macro_f1(cc),
                     "salah_kelompok_kalibrasi": misgroup(cc), "recall_M_b0_kalibrasi": rec_b0_cal})
    g = pd.DataFrame(grid)
    ok = g[g.recall_M_kalibrasi >= rec_b0_cal]
    w_sel = float(ok.w_M.min()) if len(ok) else float(W_GRID.max())
    g["terpilih"] = g.w_M == w_sel
    # descriptive trade-off on the evaluation users (NOT used for selection; the D-26 rule above uses calibration only)
    for i, w in enumerate(W_GRID):
        pwe = (Pc[~cal] * np.array([1.0, 1.0, w, 1.0])).argmax(1)
        ce = per_user_counts(y[~cal], pwe, users[~cal]).sum(0)
        g.loc[i, "recall_M_evaluasi_deskriptif"] = recall(ce, 2)
        g.loc[i, "macro_f1_evaluasi_deskriptif"] = macro_f1(ce)
        g.loc[i, "salah_kelompok_evaluasi_deskriptif"] = misgroup(ce)
    g["catatan"] = "kolom *_evaluasi_deskriptif hanya kurva trade-off; tidak dipakai untuk memilih w_M (D-26)"
    g.to_csv(TABLES / "E8_misconception_priority_grid_cv.csv", index=False)
    pw = (Pc * np.array([1.0, 1.0, w_sel, 1.0])).argmax(1)
    ye, ue = y[ev], users[ev]
    cnt = {"B0 aturan v1": per_user_counts(ye, b0[ev], ue), "M1 CO-KT (produksi, argmax)": per_user_counts(ye, pred[ev], ue),
           f"M1 CO-KT mode prioritas miskonsepsi (w_M = {w_sel:.1f})": per_user_counts(ye, pw[ev], ue)}
    pb = PairedBoot(len(np.unique(ue)), n_boot)
    rows = []
    for name, cu in cnt.items():
        c = cu.sum(0)
        for mname, f in (("recall Miskonsepsi", lambda m: recall(m, 2)), ("macro-F1", macro_f1), ("salah kelompok", misgroup)):
            lo, hi = pb.ci(f, cu)
            dlo, dhi = pb.ci(f, cu, ref=cnt["B0 aturan v1"]) if name != "B0 aturan v1" else (None, None)
            rows.append({"model": name, "metrik": mname, "nilai": f(c), "ci_lo": lo, "ci_hi": hi,
                         "selisih_vs_b0": f(c) - f(cnt["B0 aturan v1"].sum(0)) if name != "B0 aturan v1" else None,
                         "selisih_ci_lo": dlo, "selisih_ci_hi": dhi, "w_M": w_sel, "n_baris": int(c.sum()),
                         "n_siswa": int(len(np.unique(ue))), "label": LABEL + ", belum diuji di test"})
    pd.DataFrame(rows).to_csv(TABLES / "E8_misconception_priority_cv.csv", index=False)
    print(f"w_M terpilih {w_sel} (recall M B0 di kalibrasi {rec_b0_cal:.4f})")
    print(pd.DataFrame(rows).round(4).to_string())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n-boot", type=int, default=1000)
    a = ap.parse_args()
    set_seed()
    recall_test()
    o = cv_frame()
    recall_cv(o, a.n_boot)
    mitigation(o, a.n_boot)


if __name__ == "__main__":
    main()
