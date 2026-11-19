"""Judge-facing evidence (Bagian B). Never reads test predictions: test numbers are copied from existing tables only.

  python scripts/story_evidence.py [--n-boot 1000] [--only headline figure l2gap errors]
headline  derived arithmetic on published TEST numbers (E8_impact.csv, L1_test.csv, E5_test.json):
          absolute and relative reduction of misgrouping, deferral, kept-case misgrouping
          -> reports/tables/headline.json
figure    "aturan v1 vs ML" on TEST metrics with their published CIs (L1_test.csv)
          -> reports/figures/E8_v1_vs_ml.png
l2gap     why TF-IDF wins in English (CV MAP): macro-F1 category3 under the random split (derived from the target OOF)
          vs the leave-questions-out split, and exact-duplicate explanations between validation and training rows of
          the same question -> reports/tables/L2_split_gap_cv.csv, reports/tables/L2_overlap_cv.csv
errors    error analysis (CV only): L1 CO-KT OOF per KC / history length / current confidence vs B0 (aggregates only,
          Eedi licence), L2 TF-IDF OOF: 10 representative MAP errors (MIT text) + per question
          -> reports/tables/EA_l1_per_kc_cv.csv, EA_l1_buckets_cv.csv, EA_l1_confusion_cv.csv,
             EA_l2_examples_cv.csv, EA_l2_per_question_cv.csv
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import re

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from remediaide_ml.eval import metrics as M
from remediaide_ml.eval.stats import cluster_bootstrap_ci
from remediaide_ml.paths import FIGURES, INTERIM, ML_ROOT, PROCESSED, RAW, TABLES
from remediaide_ml.seed import GLOBAL_SEED, set_seed

CAT3 = ["Correct", "Misconception", "Neither"]
QN = {0: "Paham", 1: "Tebakan beruntung", 2: "Miskonsepsi", 3: "Tidak paham"}  # y4 order P, L, M, T
TFIDF = ML_ROOT / "runs/20261118-2131_l2_tfidf/oof_target.parquet"
MDEB = ML_ROOT / "runs/20261118-2202_l2_mdeberta_kaggle/kaggle_output"
COKT_OOF = ML_ROOT / "runs/20261118-2202_cokt_kaggle/oof_b_ens5.parquet"

_spec = importlib.util.spec_from_file_location("e3", ML_ROOT / "scripts" / "e3_true_misconception.py")
e3 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(e3)


def headline() -> None:
    e8 = pd.read_csv(TABLES / "E8_impact.csv").set_index("metrik").nilai
    lt = pd.read_csv(TABLES / "L1_test.csv").query("framing == 'b' and metric == 'misgroup'").set_index("model")
    b0, ml = float(e8["b0_misgroup"]), float(e8["ml_misgroup"])
    lo, hi = json.loads(e8["ml_minus_b0_misgroup_ci"])
    kept, b0k = float(e8["ml_misgroup_kept"]), float(e8["b0_misgroup_on_kept"])
    out = {
        "source": ["reports/tables/E8_impact.csv", "reports/tables/L1_test.csv", "reports/tables/E5_test.json"],
        "split": "test (20% siswa Eedi, dibuka sekali di T46; tidak dihitung ulang)",
        "n_rows": int(e8["n_eval_rows"]), "n_users": int(e8["n_eval_users"]),
        "b0_misgroup": b0, "b0_misgroup_ci": [float(lt.loc["B0", "ci_lo"]), float(lt.loc["B0", "ci_hi"])],
        "ml_misgroup": ml, "ml_misgroup_ci": [float(lt.loc["CO-KT", "ci_lo"]), float(lt.loc["CO-KT", "ci_hi"])],
        "abs_diff_ml_minus_b0": ml - b0, "abs_diff_ci": [lo, hi],
        "abs_diff_points": 100 * (ml - b0), "abs_diff_points_ci": [100 * lo, 100 * hi],
        "rel_reduction": (b0 - ml) / b0,
        "rel_reduction_approx_ci": [-hi / b0, -lo / b0],
        "rel_reduction_ci_note": "aproksimasi: CI selisih absolut dibagi titik B0 (B0 dianggap tetap); bukan bootstrap rasio",
        "defer_rate": float(e8["defer_rate"]), "kept_share": 1 - float(e8["defer_rate"]),
        "ml_misgroup_kept": kept, "b0_misgroup_on_kept": b0k,
        "kept_abs_diff_ml_minus_b0": kept - b0k, "kept_rel_reduction_vs_b0": (b0k - kept) / b0k,
        "kept_rel_reduction_vs_ml_all": (ml - kept) / ml,
        "errors_caught_by_defer": float(e8["errors_caught_by_defer"]),
        "teacher_reviews_per_class_32x15": float(e8["teacher_reviews_per_class_32x15"]),
        "kept_ci_note": "E8_impact.csv tidak memuat CI untuk salah kelompok kasus yang tidak diserahkan",
    }
    (TABLES / "headline.json").write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=1))


def figure() -> None:
    t = pd.read_csv(TABLES / "L1_test.csv")
    e8 = pd.read_csv(TABLES / "E8_impact.csv").set_index("metrik").nilai
    models = [("B0", "Aturan v1 (B0)", "#9E9E9E"), ("B1b", "Regresi logistik (B1b)", "#B0BEC5"),
              ("LightGBM", "LightGBM (B2)", "#64B5F6"), ("CO-KT", "RemediAide 2.0 (CO-KT)", "#1565C0")]
    panels = [("misgroup", "Salah kelompok (lebih rendah lebih baik)"), ("macro_f1", "Macro-F1 4 kuadran"),
              ("auc_needs_remediation", "AUC butuh remediasi")]
    fig, axes = plt.subplots(1, 3, figsize=(13, 4.2))
    for ax, (metric, title) in zip(axes, panels, strict=True):
        d = t[(t.framing == "b") & (t.metric == metric)].set_index("model")
        for i, (m, _label, color) in enumerate(models):
            v, lo, hi = d.loc[m, ["value", "ci_lo", "ci_hi"]]
            ax.bar(i, v, color=color, width=0.7)
            ax.errorbar(i, v, yerr=[[v - lo], [hi - v]], color="black", capsize=4, lw=1.2)
            ax.text(i, hi + 0.008, f"{v:.3f}", ha="center", fontsize=8)
        if metric == "misgroup":
            k = float(e8["ml_misgroup_kept"])
            ax.bar(4, k, color="#0D47A1", width=0.7, hatch="//", edgecolor="white")
            ax.text(4, k + 0.008, f"{k:.3f}*", ha="center", fontsize=8)
        n = 5 if metric == "misgroup" else 4
        labels = [m[1] for m in models] + (["2.0, kasus tidak diserahkan*"] if metric == "misgroup" else [])
        ax.set_xticks(range(n), labels, rotation=30, ha="right", fontsize=8)
        ax.set_title(title, fontsize=10)
        ax.set_ylim(0, max(0.9, ax.get_ylim()[1]))
    axes[0].set_ylabel("Nilai di test (CI 95% bootstrap siswa)")
    fig.suptitle("Aturan CRI v1 vs ML pada siswa test yang sama (n = 58.963 kasus; AUC: 226.432 baris)", fontsize=11)
    fig.text(0.01, 0.005, f"* {1 - float(e8['defer_rate']):.1%} kasus yang tidak diserahkan ke guru (defer {float(e8['defer_rate']):.1%}); "
             f"aturan v1 pada kasus yang sama {float(e8['b0_misgroup_on_kept']):.3f}; tanpa CI (tidak ada di E8_impact.csv). "
             "Sumber: reports/tables/L1_test.csv, E8_impact.csv", fontsize=7)
    fig.tight_layout(rect=(0, 0.03, 1, 0.95))
    fig.savefig(FIGURES / "E8_v1_vs_ml.png", dpi=200)
    print("-> figures/E8_v1_vs_ml.png")


def _map_frame() -> pd.DataFrame:
    m = pd.read_parquet(INTERIM / "map.parquet").sort_values("row_id").reset_index(drop=True)
    sp = pd.read_parquet(PROCESSED / "map_splits.parquet")
    return m.merge(sp[["row_id", "fold_random", "fold_question"]], on="row_id", validate="one_to_one")


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", "", str(s).lower())).strip()


def l2gap(n_boot: int) -> None:
    m = _map_frame()
    y3 = m.category3.to_numpy()
    q = m.QuestionId.to_numpy()
    rows = np.arange(len(m))
    out = []
    preds_random = {}
    for name, src in (("B0 TF-IDF+LR", TFIDF), ("M1 mDeBERTa-v3-base", MDEB)):
        P, cls = e3.load_oof(src, m)
        top = cls[P.argmax(1)]
        p3 = np.array([t.split(":")[0].split("_", 1)[1] for t in top])
        preds_random[name] = (P, cls, p3)
        ci = cluster_bootstrap_ci(lambda r, p3=p3: M.macro_f1(y3[r], p3[r], labels=CAT3), (rows,), q, n_boot=n_boot)
        out.append({"model": name, "split": "acak (5-fold, soal yang sama ada di latih)", "metric": "macro-F1 category3",
                    "value": ci["point"], "ci_lo": ci["lo"], "ci_hi": ci["hi"], "n": len(m), "ci_unit": "soal (15 klaster)",
                    "sumber_prediksi": "OOF target, argmax → kategori (dihitung di sini)"})
    lq = pd.read_csv(TABLES / "L2_cv.csv").query("metric == 'macro-F1 category3' and model != 'selisih mDeBERTa − TF-IDF'")
    for _, r in lq.iterrows():
        out.append({"model": r.model, "split": "per soal (5-fold, soal validasi tidak pernah dilihat)",
                    "metric": "macro-F1 category3", "value": r.value, "ci_lo": r.ci_lo, "ci_hi": r.ci_hi, "n": int(r.n),
                    "ci_unit": "soal (15 klaster)", "sumber_prediksi": "disalin dari L2_cv.csv"})
    df = pd.DataFrame(out)
    for name in ("B0 TF-IDF+LR", "M1 mDeBERTa-v3-base"):
        a = df[(df.model == name)].value.to_numpy()
        df.loc[len(df)] = {"model": name, "split": "selisih per soal − acak", "metric": "macro-F1 category3",
                           "value": a[1] - a[0], "ci_lo": None, "ci_hi": None, "n": len(m), "ci_unit": None,
                           "sumber_prediksi": "baris di atas"}
    df.to_csv(TABLES / "L2_split_gap_cv.csv", index=False)
    print(df.round(4).to_string())
    # exact duplicate explanations (same question) between each validation fold and its training folds (random split)
    key = m.QuestionId.astype(str) + "|" + m.StudentExplanation.map(_norm)
    dup = np.zeros(len(m), bool)
    f = m.fold_random.to_numpy()
    for k in range(5):
        seen = set(key[f != k])
        dup[f == k] = key[f == k].isin(seen).to_numpy()
    y = m.target.to_numpy()
    rows_o = [{"ukuran": "porsi baris validasi (split acak) yang alasannya persis ada di baris latih soal yang sama",
               "nilai": float(dup.mean()), "n": len(m)}]
    for name, (P, cls, _) in preds_random.items():
        top3 = M.topk_from_proba(P, cls, 3)
        rr = np.array([M.map_at_k([t], [p]) for t, p in zip(y, top3, strict=True)])
        for flag, lab in ((True, "duplikat"), (False, "bukan duplikat")):
            rows_o.append({"ukuran": f"MAP@3 {name} pada baris {lab}", "nilai": float(rr[dup == flag].mean()),
                           "n": int((dup == flag).sum())})
    mp = {r["ukuran"]: r["nilai"] for r in rows_o}
    share = float(dup.mean())
    names = list(preds_random)
    d_dup = mp[f"MAP@3 {names[1]} pada baris duplikat"] - mp[f"MAP@3 {names[0]} pada baris duplikat"]
    d_non = mp[f"MAP@3 {names[1]} pada baris bukan duplikat"] - mp[f"MAP@3 {names[0]} pada baris bukan duplikat"]
    rows_o += [{"ukuran": "selisih MAP@3 mDeBERTa − TF-IDF, total (= kontribusi duplikat + bukan duplikat)",
                "nilai": share * d_dup + (1 - share) * d_non, "n": len(m)},
               {"ukuran": "kontribusi baris duplikat ke selisih (porsi × selisih)", "nilai": share * d_dup, "n": int(dup.sum())},
               {"ukuran": "kontribusi baris bukan duplikat ke selisih", "nilai": (1 - share) * d_non, "n": int((~dup).sum())}]
    rows_o.append({"ukuran": "split per soal: porsi baris validasi yang soalnya ada di latih", "nilai": 0.0, "n": len(m)})
    pd.DataFrame(rows_o).to_csv(TABLES / "L2_overlap_cv.csv", index=False)
    print(pd.DataFrame(rows_o).round(4).to_string())


def errors(n_boot: int) -> None:
    # ---------------- L1 (CO-KT CV OOF, E1 rows), aggregates only
    o = pd.read_parquet(COKT_OOF)
    meta = pd.read_parquet(PROCESSED / "eedi_features_b.parquet",
                           columns=["AnswerId", "kc", "n_prev_kc", "cur_cri", "cur_correct", "quadrant_b0"])
    o = o.drop(columns=[c for c in ("kc",) if c in o]).merge(meta, on="AnswerId", how="left", validate="one_to_one")
    o = o[o.e1_row & (o.y4 >= 0)].copy()
    P = o[["p4_P", "p4_L", "p4_M", "p4_T"]].to_numpy(float)
    o["pred"] = P.argmax(1)
    o["b0"] = o.quadrant_b0.astype("object").map({"P": 0, "L": 1, "M": 2, "T": 3}).astype(int)
    o["err_ml"] = (o.pred != o.y4).astype(float)
    o["err_b0"] = (o.b0 != o.y4).astype(float)
    names = pd.read_csv(RAW / "eedi_neurips2020/data/metadata/subject_metadata.csv", encoding="utf-8-sig")
    names = names.set_index("SubjectId").Name
    g = o.groupby("kc").agg(n_baris=("err_ml", "size"), n_siswa=("UserId", "nunique"), salah_kelompok_cokt=("err_ml", "mean"),
                            salah_kelompok_b0=("err_b0", "mean"),
                            porsi_miskonsepsi_masa_depan=("y4", lambda s: float((s == 2).mean())),
                            miskonsepsi_diprediksi_paham=("pred", lambda s: 0.0)).reset_index()
    mp = o[o.y4 == 2].groupby("kc").pred.apply(lambda s: float((s == 0).mean()))
    g["miskonsepsi_diprediksi_paham"] = g.kc.map(mp)
    g["selisih_cokt_minus_b0"] = g.salah_kelompok_cokt - g.salah_kelompok_b0
    g["nama_kc"] = g.kc.astype(int).map(names)
    g = g[g.n_baris >= 1000].sort_values("salah_kelompok_cokt", ascending=False)
    g.to_csv(TABLES / "EA_l1_per_kc_cv.csv", index=False)
    summ = {"source": "runs/20261118-2202_cokt_kaggle/oof_b_ens5.parquet (CV OOF, baris E1)", "n_rows": int(len(o)),
            "n_kc_min_1000_rows": int(len(g)), "n_kc_cokt_better_than_b0": int((g.selisih_cokt_minus_b0 < 0).sum()),
            "kc_diff_min": float(g.selisih_cokt_minus_b0.min()), "kc_diff_max": float(g.selisih_cokt_minus_b0.max()),
            "kc_misgroup_cokt_min": float(g.salah_kelompok_cokt.min()), "kc_misgroup_cokt_max": float(g.salah_kelompok_cokt.max()),
            "misgroup_cokt": float(o.err_ml.mean()), "misgroup_b0": float(o.err_b0.mean()),
            "share_future_M_predicted_P": float((o[o.y4 == 2].pred == 0).mean()),
            "share_future_L_predicted_L": float((o[o.y4 == 1].pred == 1).mean()),
            "corr_kc_misgroup_vs_share_future_M": float(np.corrcoef(g.salah_kelompok_cokt, g.porsi_miskonsepsi_masa_depan)[0, 1])}
    (TABLES / "EA_l1_summary_cv.json").write_text(json.dumps(summ, indent=2))
    print(summ)
    print(g.head(12).round(4).to_string())
    b = []
    buckets = {"n_prev_kc (riwayat di KC)": pd.cut(o.n_prev_kc, [-1, 0, 4, 19, 10**6], labels=["0", "1–4", "5–19", "≥20"]),
               "keyakinan saat ini (CRI)": o.cur_cri.astype(int).astype(str),
               "jawaban saat ini": o.cur_correct.map({1: "benar", 0: "salah"}),
               "kuadran masa depan (label)": o.y4.map(QN)}
    for dim, col in buckets.items():
        for lvl, d in o.groupby(col, observed=True):
            b.append({"dimensi": dim, "level": str(lvl), "n_baris": len(d), "salah_kelompok_cokt": d.err_ml.mean(),
                      "salah_kelompok_b0": d.err_b0.mean(), "selisih_cokt_minus_b0": d.err_ml.mean() - d.err_b0.mean()})
    pd.DataFrame(b).to_csv(TABLES / "EA_l1_buckets_cv.csv", index=False)
    print(pd.DataFrame(b).round(4).to_string())
    cm = pd.crosstab(o.y4.map(QN), o.pred.map(QN), normalize="index").reindex(index=list(QN.values()),
                                                                             columns=list(QN.values()), fill_value=0)
    cm.index.name = "label_masa_depan \\ prediksi_cokt"
    cm.to_csv(TABLES / "EA_l1_confusion_cv.csv")
    print(cm.round(3))
    # ---------------- L2 (TF-IDF CV OOF, random split) — MAP text is MIT
    m = _map_frame()
    P, cls = e3.load_oof(TFIDF, m)
    top = cls[P.argmax(1)]
    ci = {c: i for i, c in enumerate(cls)}
    p_true = P[np.arange(len(m)), [ci[t] for t in m.target]]
    m["pred"], m["p_pred"], m["p_true"] = top, P.max(1), p_true
    m["true_cat"] = m.Category
    m["pred_cat"] = [t.split(":")[0] for t in top]
    wrong = m[m.pred != m.target].copy()

    def kind(r):
        if r.true_cat == "True_Misconception":
            return "1 jebakan jawaban benar terlewat"
        if r.true_cat.endswith("Misconception") and r.pred_cat.endswith("Misconception"):
            return "2 nama miskonsepsi tertukar"
        if r.true_cat.endswith("Misconception"):
            return "3 miskonsepsi dibaca Neither/Correct"
        if r.pred_cat.endswith("Misconception"):
            return "4 Neither/Correct dibaca miskonsepsi"
        return "5 Correct ↔ Neither"

    wrong["jenis_kesalahan"] = wrong.apply(kind, axis=1)
    quota = {"1 jebakan jawaban benar terlewat": 3, "2 nama miskonsepsi tertukar": 2,
             "3 miskonsepsi dibaca Neither/Correct": 2, "4 Neither/Correct dibaca miskonsepsi": 2, "5 Correct ↔ Neither": 1}
    rng = np.random.default_rng(GLOBAL_SEED)
    ex = []
    for k, n in quota.items():
        pool = wrong[wrong.jenis_kesalahan == k]
        ex.append(pool.iloc[rng.choice(len(pool), n, replace=False)])
    ex = pd.concat(ex)
    share = wrong.jenis_kesalahan.value_counts(normalize=True)
    ex["porsi_jenis_di_semua_kesalahan"] = ex.jenis_kesalahan.map(share)
    cols = ["jenis_kesalahan", "porsi_jenis_di_semua_kesalahan", "QuestionId", "QuestionText", "MC_Answer",
            "StudentExplanation", "target", "pred", "p_pred", "p_true", "row_id"]
    ex[cols].to_csv(TABLES / "EA_l2_examples_cv.csv", index=False)
    print(ex[cols[:2] + cols[5:10]].to_string(max_colwidth=60))
    rr_rows = []
    top3 = M.topk_from_proba(P, cls, 3)
    m["rr"] = [M.map_at_k([t], [p]) for t, p in zip(m.target, top3, strict=True)]
    m["hit1"] = (m.pred == m.target).astype(float)
    for qid, d in m.groupby("QuestionId"):
        rr_rows.append({"QuestionId": qid, "n": len(d), "map3_tfidf": d.rr.mean(), "akurasi_top1_tfidf": d.hit1.mean(),
                        "n_target": d.target.nunique(), "porsi_true_misconception": float((d.Category == "True_Misconception").mean()),
                        "kesalahan_terbanyak": d[d.hit1 == 0].apply(lambda r: f"{r.target} → {r.pred}", axis=1).value_counts().index[0]
                        if (d.hit1 == 0).any() else ""})
    pq = pd.DataFrame(rr_rows).sort_values("map3_tfidf")
    pq.to_csv(TABLES / "EA_l2_per_question_cv.csv", index=False)
    print(pq.round(4).to_string(max_colwidth=70))
    (TABLES / "EA_l2_error_types_cv.csv").write_text(
        share.rename_axis("jenis_kesalahan").rename("porsi_di_semua_kesalahan").to_frame()
        .assign(n=wrong.jenis_kesalahan.value_counts()).reset_index().to_csv(index=False))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n-boot", type=int, default=1000)
    ap.add_argument("--only", nargs="+", default=["headline", "figure", "l2gap", "errors"])
    a = ap.parse_args()
    set_seed()
    for k in a.only:
        {"headline": headline, "figure": figure, "l2gap": lambda: l2gap(a.n_boot), "errors": lambda: errors(a.n_boot)}[k]()


if __name__ == "__main__":
    main()
