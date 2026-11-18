"""E2 figure: cumulative signal ablation (LightGBM, framing b) with CI whiskers. Source: reports/tables/E2_ablation_cv.csv."""
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

from remediaide_ml.paths import FIGURES, TABLES

d = pd.read_csv(TABLES / "E2_ablation_cv.csv")
lab = {"S0_cur_correct": "S0 benar/salah", "S1_keyakinan": "+ keyakinan", "S2_riwayat_benar": "+ riwayat benar",
       "S3_riwayat_keyakinan": "+ riwayat keyakinan", "S4_kesulitan": "+ kesulitan soal/topik", "S5_opsi": "+ opsi",
       "S6_waktu": "+ waktu"}
x = [lab[t] for t in d.tahap]
fig, axes = plt.subplots(1, 2, figsize=(11, 4.2))
for ax, (col, name) in zip(axes, [("macro_f1", "Macro-F1 kuadran masa depan (baris E1)"),
                                  ("auc_bin", "AUC butuh remediasi")], strict=True):
    ax.errorbar(range(len(d)), d[col], yerr=[d[col] - d[col + "_lo"], d[col + "_hi"] - d[col]], fmt="o-", capsize=4)
    ax.set_xticks(range(len(d)), x, rotation=35, ha="right")
    ax.set_ylabel(name)
    ax.grid(alpha=.3)
e1 = pd.read_csv(TABLES / "E1_b0_cv.csv")
b0_f1 = float(e1.loc[e1.metrik.str.startswith("macro-F1"), "nilai"].iloc[0])
axes[0].axhline(b0_f1, color="#C44E52", ls=":", label=f"aturan CRI v1 (B0) = {b0_f1:.3f}")
axes[0].legend()
fig.suptitle("E2 (CV): sumbangan tiap sinyal, LightGBM kumulatif S0→S6 (CI 95% bootstrap per siswa)")
fig.tight_layout()
fig.savefig(FIGURES / "E2_ablation.png", dpi=200)
print("ok")
