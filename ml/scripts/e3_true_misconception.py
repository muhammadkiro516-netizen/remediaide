"""T33 / E3: can L2 catch students who are right for the wrong reason (True_Misconception)? CV OOF, MAP random split.

  python scripts/e3_true_misconception.py --oof "B0 TF-IDF=runs/<tfidf>/oof_target.parquet" ["M1 mDeBERTa=runs/<id>/kaggle_output"]
An OOF source is a parquet with probability columns named by target, or a folder with oof_target_fold*.parquet
(encoder logits, masked to candidates and softmaxed here). B0 (v1 rule) recall is 0 by design: a correct answer with
high confidence is always "Paham". Score for the positive class = sum of probabilities of True_Misconception:* targets.
Outputs reports/tables/E3_true_misconception.csv and reports/figures/E3_pr_curve.png.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, precision_recall_curve

from remediaide_ml.data.map import build_candidates
from remediaide_ml.eval.stats import cluster_bootstrap_ci
from remediaide_ml.l2.tfidf import candidate_mask
from remediaide_ml.paths import FIGURES, INTERIM, PROCESSED, TABLES


def load_oof(src: Path, m: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    """Return (row-aligned prob matrix, classes) for the rows of m (sorted by row_id)."""
    if src.is_dir():
        parts = [pd.read_parquet(p) for p in sorted(src.glob("oof_target_fold*.parquet"))]
        o = pd.concat(parts)
        lc = [c for c in o.columns if c.startswith("logit::")]
        classes = np.array([c.split("::", 1)[1] for c in lc])
        o = o.set_index("row_id").loc[m.row_id]
        L = o[lc].to_numpy(float)
        sp = pd.read_parquet(PROCESSED / "map_splits.parquet").set_index("row_id").loc[m.row_id]
        fold = sp.fold_random.to_numpy()
        mask = np.zeros_like(L, dtype=bool)
        for k in np.unique(fold):  # candidates from the training folds of each validation fold
            va = fold == k
            mask[va] = candidate_mask(m[va], classes, build_candidates(m[~va]))
        L = np.where(mask, L, -np.inf)
        P = np.exp(L - L.max(1, keepdims=True))
        return P / P.sum(1, keepdims=True), classes
    o = pd.read_parquet(src).set_index("row_id").loc[m.row_id]
    classes = np.array([c for c in o.columns if ":" in c])
    return o[classes].to_numpy(float), classes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--oof", nargs="+", required=True, help='"Name=path" pairs')
    a = ap.parse_args()
    m = pd.read_parquet(INTERIM / "map.parquet").sort_values("row_id").reset_index(drop=True)
    y = (m.Category == "True_Misconception").to_numpy()
    rows_idx = np.arange(len(m))
    res = [{"model": "B0 aturan CRI v1", "recall": 0.0, "precision": None, "f1": 0.0, "pr_auc": None, "n_pos": int(y.sum()),
            "note": "benar + yakin selalu 'Paham' (desain)"}]
    fig, ax = plt.subplots(figsize=(5.5, 4.5))
    for spec in a.oof:
        name, path = spec.split("=", 1)
        P, classes = load_oof(Path(path), m)
        tm = np.char.startswith(classes.astype(str), "True_Misconception")
        score = P[:, tm].sum(1)
        top1_tm = tm[P.argmax(1)]

        def rec(r):
            return float(top1_tm[r][y[r]].mean())

        def prec(r):
            return float(y[r][top1_tm[r]].mean()) if top1_tm[r].any() else np.nan

        r_ci = cluster_bootstrap_ci(rec, (rows_idx,), rows_idx, n_boot=1000)
        p_ci = cluster_bootstrap_ci(prec, (rows_idx,), rows_idx, n_boot=1000)
        f1 = 2 * r_ci["point"] * p_ci["point"] / (r_ci["point"] + p_ci["point"]) if r_ci["point"] + p_ci["point"] > 0 else 0
        ap_ = average_precision_score(y, score)
        res.append({"model": name, "recall": r_ci["point"], "recall_lo": r_ci["lo"], "recall_hi": r_ci["hi"],
                    "precision": p_ci["point"], "precision_lo": p_ci["lo"], "precision_hi": p_ci["hi"], "f1": f1,
                    "pr_auc": ap_, "n_pos": int(y.sum()), "source": path})
        pr, rc, _ = precision_recall_curve(y, score)
        ax.plot(rc, pr, label=f"{name} (PR-AUC {ap_:.3f})")
    ax.axhline(y.mean(), color="gray", ls=":", label=f"prevalensi {y.mean():.1%}")
    ax.set_xlabel("Recall (siswa benar tapi nalarnya keliru yang tertangkap)")
    ax.set_ylabel("Presisi")
    ax.set_title("E3: jebakan jawaban benar (MAP, CV acak)")
    ax.legend(fontsize=8)
    fig.tight_layout()
    FIGURES.mkdir(parents=True, exist_ok=True)
    fig.savefig(FIGURES / "E3_pr_curve.png", dpi=200)
    pd.DataFrame(res).to_csv(TABLES / "E3_true_misconception.csv", index=False)
    print(json.dumps(res, indent=2, default=float))


if __name__ == "__main__":
    main()
