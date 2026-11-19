"""T20 / E1 (development): audit of the v1 CRI rule (B0) on Eedi CV users. Test users are NOT read.

B0 predicts future quadrant = current quadrant (D-05). Rows: current confidence present and a 4-class
future-quadrant label. Binary view: B0 says "needs remediation" iff current answer is wrong (M or T).

Outputs: reports/tables/E1_b0_cv.csv, reports/tables/E1_b0_cv_confusion.csv,
         reports/figures/E1_confusion_b0_cv.png, runs/<ts>_e1_b0/metrics.json
"""

from __future__ import annotations

import json

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

from remediaide_ml.data.splits import TEST
from remediaide_ml.eval import stats as S
from remediaide_ml.paths import FIGURES, PROCESSED, TABLES, run_dir

Q = ["P", "L", "M", "T"]
Q_ID = {"P": "Paham", "L": "Tebakan beruntung", "M": "Miskonsepsi", "T": "Tidak paham"}


def main() -> None:
    f = pd.read_parquet(PROCESSED / "eedi_features_b.parquet",
                        columns=["UserId", "has_conf", "quadrant_b0", "fut_quadrant", "needs_remediation", "IsCorrect"])
    sp = pd.read_parquet(PROCESSED / "eedi_splits.parquet")
    f = f.merge(sp, on="UserId", validate="many_to_one")
    f = f[f.fold != TEST]  # development: CV users only
    n_cv = len(f)
    d = f[f.has_conf & f.fut_quadrant.notna()].copy()
    y, p = d.fut_quadrant.astype(str).to_numpy(), d.quadrant_b0.astype(str).to_numpy()
    _, counts = S.cluster_confusion_counts(y, p, d.UserId.to_numpy(), Q)
    cm = counts.sum(axis=0)
    mis = S.bootstrap_confusion_metric(counts, S.cm_misgroup)
    mf1 = S.bootstrap_confusion_metric(counts, S.cm_macro_f1)
    iP, iM = Q.index("P"), Q.index("M")
    # story numbers: B0 "Paham" that are not mastered next (future M or T); B0 "Miskonsepsi" that are mastered (P or L)
    def p_not_mastered_given_b0_P(c):
        col = c[:, iP]               # rows: true future quadrant; column: predicted P
        return float(col[[2, 3]].sum() / col.sum())

    def p_mastered_given_b0_M(c):
        col = c[:, iM]
        return float(col[[0, 1]].sum() / col.sum())

    s1 = S.bootstrap_confusion_metric(counts, p_not_mastered_given_b0_P)
    s2 = S.bootstrap_confusion_metric(counts, p_mastered_given_b0_M)

    # binary needs_remediation on all rows with a binary label (confidence not required)
    b = f[f.needs_remediation.notna()]
    yb = b.needs_remediation.astype(int).to_numpy()
    pb = (b.IsCorrect == 0).astype(int).to_numpy()
    _, cb = S.cluster_confusion_counts(yb, pb, b.UserId.to_numpy(), [0, 1])
    berr = S.bootstrap_confusion_metric(cb, S.cm_misgroup)

    res = {"n_rows_cv_users": int(n_cv), "n_rows_e1": int(len(d)), "n_users_e1": int(d.UserId.nunique()),
           "misgroup_rate_4class": mis, "macro_f1_4class": mf1,
           "pct_b0_paham_not_mastered_next": s1, "pct_b0_miskonsepsi_mastered_next": s2,
           "binary_needs_remediation_error": berr, "n_rows_binary": int(len(b)),
           "ci": "95% cluster bootstrap over UserId, 1000 reps"}
    run = run_dir("e1_b0")
    run.mkdir(parents=True, exist_ok=True)
    (run / "metrics.json").write_text(json.dumps(res, indent=2))

    TABLES.mkdir(parents=True, exist_ok=True)
    rows = []
    for name, r in [("tingkat salah kelompok (4 kelas)", mis), ("macro-F1 (4 kelas)", mf1),
                    ("% 'Paham' B0 yang belum tuntas berikutnya", s1), ("% 'Miskonsepsi' B0 yang tuntas berikutnya", s2),
                    ("error biner butuh_remediasi", berr)]:
        rows.append({"metrik": name, "nilai": r["point"], "ci_lo": r["lo"], "ci_hi": r["hi"], "split": "CV (80% siswa)",
                     "n_baris": len(b) if "biner" in name else len(d), "run": run.name})
    pd.DataFrame(rows).to_csv(TABLES / "E1_b0_cv.csv", index=False)
    pd.DataFrame(cm, index=[f"masa_depan_{q}" for q in Q], columns=[f"b0_{q}" for q in Q]).to_csv(
        TABLES / "E1_b0_cv_confusion.csv")

    FIGURES.mkdir(parents=True, exist_ok=True)
    norm = cm / cm.sum(axis=1, keepdims=True)
    fig, ax = plt.subplots(figsize=(6, 5))
    im = ax.imshow(norm, cmap="Blues", vmin=0, vmax=1)
    for i in range(4):
        for j in range(4):
            ax.text(j, i, f"{norm[i, j]:.2f}\n(n={cm[i, j]:,})", ha="center", va="center", fontsize=8,
                    color="white" if norm[i, j] > 0.5 else "black")
    ax.set_xticks(range(4), [Q_ID[q] for q in Q], rotation=20)
    ax.set_yticks(range(4), [Q_ID[q] for q in Q])
    ax.set_xlabel("Kuadran menurut aturan CRI v1 (B0, saat ini)")
    ax.set_ylabel("Kuadran masa depan (3 percobaan berikutnya)")
    ax.set_title("E1 (CV): aturan CRI vs kuadran masa depan\n(dinormalisasi per baris)")
    fig.colorbar(im, ax=ax, fraction=0.046)
    fig.tight_layout()
    fig.savefig(FIGURES / "E1_confusion_b0_cv.png", dpi=200)
    print(json.dumps(res, indent=2))


if __name__ == "__main__":
    main()
