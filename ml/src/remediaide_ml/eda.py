"""EDA figures (T16). Every number shown is computed here from interim data; figures go to reports/figures/E0_*.png.

Called by notebooks/01_eda.ipynb. `run_all()` returns a dict of key numbers used for RESULTS.md §2.
"""

from __future__ import annotations

import json

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from remediaide_ml.paths import FIGURES, INTERIM, TABLES

DPI = 200


def _save(fig, name: str) -> str:
    FIGURES.mkdir(parents=True, exist_ok=True)
    p = FIGURES / f"E0_{name}.png"
    fig.tight_layout()
    fig.savefig(p, dpi=DPI)
    plt.close(fig)
    return str(p)


def eedi_figures(df: pd.DataFrame) -> dict:
    out: dict = {}
    c = df[df.has_conf]
    # 1. confidence distribution
    vc = c.Confidence.value_counts(normalize=True).sort_index()
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.bar(vc.index.astype(int).astype(str), vc.values * 100, color="#4C72B0")
    ax.set_xlabel("Keyakinan yang dilaporkan siswa (0–100)")
    ax.set_ylabel("Persentase jawaban berkeyakinan (%)")
    ax.set_title(f"Distribusi keyakinan (Eedi T3&4, n={len(c):,})")
    _save(fig, "confidence_distribution")
    out["conf_share"] = {int(k): round(float(v), 4) for k, v in vc.items()}

    # 2. self-calibration: accuracy vs confidence, CI by student cluster bootstrap (200 reps)
    rng = np.random.default_rng(20261118)
    g = c.groupby(["Confidence", "UserId"]).IsCorrect.agg(["sum", "count"]).reset_index()
    rows = []
    for v, s in g.groupby("Confidence"):
        acc = s["sum"].sum() / s["count"].sum()
        boots = []
        n = len(s)
        for _ in range(200):
            w = rng.multinomial(n, np.full(n, 1 / n))
            boots.append((w * s["sum"].to_numpy()).sum() / (w * s["count"].to_numpy()).sum())
        rows.append({"confidence": int(v), "accuracy": acc, "lo": np.quantile(boots, .025), "hi": np.quantile(boots, .975),
                     "n": int(s["count"].sum())})
    cal = pd.DataFrame(rows)
    TABLES.mkdir(parents=True, exist_ok=True)
    cal.to_csv(TABLES / "E0_self_calibration.csv", index=False)
    fig, ax = plt.subplots(figsize=(5.5, 4.5))
    ax.plot([0, 100], [0, 1], "--", color="gray", label="kalibrasi sempurna")
    ax.errorbar(cal.confidence, cal.accuracy, yerr=[cal.accuracy - cal.lo, cal.hi - cal.accuracy], fmt="o-", capsize=4,
                label="akurasi aktual (CI 95%)")
    ax.axvline(50, color="#C44E52", lw=1, ls=":", label="ambang CRI v1 (≥ 50 ⇔ CRI ≥ 3)")
    ax.set_xlabel("Keyakinan yang dilaporkan siswa")
    ax.set_ylabel("Proporsi jawaban benar")
    ax.set_ylim(0, 1)
    ax.set_title("Kalibrasi diri siswa (Eedi T3&4)")
    ax.legend(fontsize=8, loc="upper left")
    _save(fig, "self_calibration")
    out["self_calibration"] = cal.round(4).to_dict("records")

    # 3. missingness per student
    miss = 1 - df.groupby("UserId").has_conf.mean()
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.hist(miss * 100, bins=40, color="#55A868")
    ax.set_xlabel("Persentase jawaban tanpa keyakinan per siswa (%)")
    ax.set_ylabel("Jumlah siswa")
    ax.set_title(f"Keyakinan kosong: {1 - df.has_conf.mean():.1%} dari seluruh jawaban")
    _save(fig, "missingness")
    out["conf_missing_rows"] = round(float(1 - df.has_conf.mean()), 4)
    out["students_never_conf"] = round(float((miss == 1).mean()), 4)
    out["students_always_conf"] = round(float((miss == 0).mean()), 4)
    # does missingness relate to accuracy?
    out["acc_with_conf"] = round(float(df[df.has_conf].IsCorrect.mean()), 4)
    out["acc_without_conf"] = round(float(df[~df.has_conf].IsCorrect.mean()), 4)

    # 4. sequence length
    seq = df.groupby("UserId").size()
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.hist(seq, bins=50, color="#8172B2")
    ax.axvline(seq.median(), color="k", ls="--", label=f"median {seq.median():.0f}")
    ax.set_xlabel("Jumlah jawaban per siswa")
    ax.set_ylabel("Jumlah siswa")
    ax.set_title("Panjang riwayat per siswa (Eedi T3&4)")
    ax.legend()
    _save(fig, "sequence_length")
    out["seq_median"], out["seq_p90"] = float(seq.median()), float(seq.quantile(.9))
    return out


def map_figures(m: pd.DataFrame) -> dict:
    out: dict = {}
    ct = pd.crosstab(m.QuestionId, m.Category, normalize="index") * 100
    order = ["True_Correct", "True_Neither", "True_Misconception", "False_Correct", "False_Neither", "False_Misconception"]
    ct = ct[[c for c in order if c in ct]]
    fig, ax = plt.subplots(figsize=(9, 4.5))
    bottom = np.zeros(len(ct))
    colors = ["#2E7D32", "#81C784", "#F9A825", "#90CAF9", "#BDBDBD", "#C62828"]
    for c, col in zip(ct.columns, colors, strict=False):
        ax.bar(ct.index.astype(str), ct[c].values, bottom=bottom, label=c, color=col)
        bottom += ct[c].values
    ax.set_xlabel("ID soal MAP")
    ax.set_ylabel("Persentase alasan (%)")
    ax.set_title("Kategori alasan per soal (MAP)")
    ax.legend(fontsize=7, ncol=3, loc="lower center", bbox_to_anchor=(0.5, -0.42))
    plt.setp(ax.get_xticklabels(), rotation=45)
    _save(fig, "map_categories")
    tm = m.groupby("QuestionId").Category.apply(lambda s: (s == "True_Misconception").mean())
    out["true_misc_share_range"] = [round(float(tm.min()), 4), round(float(tm.max()), 4)]
    out["true_misc_share_all"] = round(float((m.Category == "True_Misconception").mean()), 4)

    fig, ax = plt.subplots(figsize=(6, 4))
    for c3, col in [("Correct", "#2E7D32"), ("Neither", "#9E9E9E"), ("Misconception", "#C62828")]:
        ax.hist(m[m.category3 == c3].n_words_expl.clip(upper=60), bins=30, alpha=.55, label=c3, color=col, density=True)
    ax.set_xlabel("Panjang alasan (kata, dipotong di 60)")
    ax.set_ylabel("Kepadatan")
    ax.set_title("Panjang alasan siswa per kategori (MAP)")
    ax.legend()
    _save(fig, "map_explanation_length")
    out["expl_len_median_by_cat3"] = m.groupby("category3").n_words_expl.median().to_dict()
    return out


def run_all() -> dict:
    df = pd.read_parquet(INTERIM / "eedi_t34.parquet", columns=["UserId", "IsCorrect", "Confidence", "has_conf"])
    m = pd.read_parquet(INTERIM / "map.parquet")
    res = {"eedi": eedi_figures(df), "map": map_figures(m)}
    (TABLES / "E0_eda_numbers.json").write_text(json.dumps(res, indent=2, default=float))
    return res
