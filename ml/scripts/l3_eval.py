"""T40-T42 (development, CV only): calibration, conformal and selective prediction on OOF predictions.

  python scripts/l3_eval.py --l1-oof runs/<lgbm>/oof_b.parquet --l1-cols p4_P p4_L p4_M p4_T \
                            --l2-oof runs/<l2>/oof_target.parquet [--tag lgbm] [--write-models]
Protocol: CV users (Eedi) / rows (MAP) are split by group into a calibration part (20%, splits.calibration_groups)
and an evaluation part (80%). Calibrators and conformal thresholds are fitted on the calibration part only.
Outputs reports/tables/E5_*.csv, reports/figures/E5_*.png and (with --write-models) models/l3_conformal_v1.json.
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

from remediaide_ml.data.splits import calibration_groups
from remediaide_ml.eval import metrics as M
from remediaide_ml.l3.calibration import IsotonicMulticlass, Temperature, TemperatureProb
from remediaide_ml.l3.conformal import APS, LAC, avg_set_size, coverage
from remediaide_ml.l3.selective import choose_operating_point, coverage_risk, doubt_max_prob, threshold_for_rate
from remediaide_ml.paths import FIGURES, INTERIM, MODELS, TABLES

QN = {"P": "Paham", "L": "Tebakan beruntung", "M": "Miskonsepsi", "T": "Tidak paham"}


def reliability(ax, y, P, label, n_bins=15):
    conf = P.max(1)
    hit = (P.argmax(1) == y).astype(float)
    edges = np.linspace(0, 1, n_bins + 1)
    idx = np.clip(np.digitize(conf, edges[1:-1], right=True), 0, n_bins - 1)
    xs, ys = [], []
    for b in range(n_bins):
        m = idx == b
        if m.sum() >= 30:
            xs.append(conf[m].mean())
            ys.append(hit[m].mean())
    ax.plot(xs, ys, "o-", label=f"{label} (ECE {M.ece(y, P):.3f})")


def l1_block(path: Path, cols: list[str], tag: str, out: dict, write_models: bool, calib: str = "isotonic"):
    o = pd.read_parquet(path)
    if "UserId" not in o:
        from remediaide_ml.paths import PROCESSED

        ids = pd.read_parquet(PROCESSED / "eedi_features_b.parquet", columns=["AnswerId", "UserId"])
        o = o.merge(ids, on="AnswerId", how="left", validate="one_to_one")
    o = o[o.e1_row & (o.y4 >= 0)].reset_index(drop=True)
    P = o[cols].to_numpy(float)
    P = P / P.sum(1, keepdims=True)
    y = o.y4.to_numpy()
    cal = calibration_groups(o.UserId.to_numpy())
    # 03 §3: isotonic for LightGBM, temperature scaling for neural networks (CO-KT)
    iso = (TemperatureProb() if calib == "temperature" else IsotonicMulticlass()).fit(P[cal], y[cal])
    Pe, ye = P[~cal], y[~cal]
    Pc = iso.predict(Pe)
    res = {"calibrator": calib, "temperature": getattr(iso, "T", None), "n_cal": int(cal.sum()), "n_eval": int((~cal).sum()), "ece_before": M.ece(ye, Pe), "ece_after": M.ece(ye, Pc),
           "macro_f1_after": M.macro_f1(ye, Pc.argmax(1), labels=[0, 1, 2, 3]),
           "misgroup_after": M.misgroup_rate(ye, Pc.argmax(1))}
    lac = LAC(0.10).fit(iso.predict(P[cal]), y[cal])
    S = lac.predict_set(Pc)
    res |= {"lac_qhat": lac.qhat, "coverage": coverage(S, ye), "avg_set_size": avg_set_size(S),
            "singleton_share": float((S.sum(1) == 1).mean())}
    # selective prediction: errors of the argmax quadrant vs doubt; operating point (D-09) on the calibration part
    Pcal = iso.predict(P[cal])
    curve_cal = coverage_risk(Pcal.argmax(1) != y[cal], doubt_max_prob(Pcal))
    op = choose_operating_point(curve_cal)
    thr = threshold_for_rate(doubt_max_prob(Pcal), op["defer_rate"])
    curve = coverage_risk(Pc.argmax(1) != ye, doubt_max_prob(Pc))
    deferred = doubt_max_prob(Pc) >= thr
    res |= {"operating_point": op, "doubt_threshold": thr, "eval_defer_rate_at_threshold": float(deferred.mean()),
            "eval_misgroup_kept": float((Pc.argmax(1) != ye)[~deferred].mean())}
    curve.to_csv(TABLES / f"E5_coverage_risk_L1_{tag}.csv", index=False)
    fig, ax = plt.subplots(figsize=(5.5, 4.5))
    ax.plot([0, 1], [0, 1], "--", color="gray")
    reliability(ax, ye, Pe, "sebelum kalibrasi")
    reliability(ax, ye, Pc, f"sesudah {'temperature' if calib == 'temperature' else 'isotonic'}")
    ax.set_xlabel("Keyakinan model (prob. tertinggi)")
    ax.set_ylabel("Akurasi aktual")
    ax.set_title(f"Reliability L1 kuadran masa depan ({tag}, CV)")
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(FIGURES / f"E5_reliability_L1_{tag}.png", dpi=200)
    plt.close(fig)
    out["L1"] = res
    if write_models:
        MODELS.mkdir(parents=True, exist_ok=True)
        import joblib

        joblib.dump(iso, MODELS / "l1_calibrator_v1.joblib")
    return curve


def l2_block(path: Path, tag: str, out: dict):
    o = pd.read_parquet(path)
    m = pd.read_parquet(INTERIM / "map.parquet", columns=["row_id", "target", "QuestionId", "Category"])
    o = o.merge(m, on="row_id")
    cls = [c for c in o.columns if ":" in c and not c.startswith("logit::")]
    if cls:
        P = o[cls].to_numpy(float)
        L = np.log(np.clip(P, 1e-12, 1))
    else:  # encoder OOF logits
        lc = [c for c in o.columns if c.startswith("logit::")]
        cls = [c.split("::", 1)[1] for c in lc]
        L = o[lc].to_numpy(float)
        P = np.exp(L - L.max(1, keepdims=True))
        P /= P.sum(1, keepdims=True)
    y = np.searchsorted(np.array(cls), o.target.to_numpy())
    cal = calibration_groups(o.row_id.to_numpy())
    t = Temperature().fit(L[cal], y[cal])
    Pc = t.predict(L[~cal])
    ye = y[~cal]
    aps = APS(0.10).fit(t.predict(L[cal]), y[cal])
    S = aps.predict_set(Pc)
    res = {"temperature": t.T, "ece_before": M.ece(ye, P[~cal]), "ece_after": M.ece(ye, Pc), "aps_qhat": aps.qhat,
           "coverage": coverage(S, ye), "avg_set_size": avg_set_size(S),
           "map3_eval": M.map_at_k(o.target.to_numpy()[~cal], M.topk_from_proba(Pc, cls, 3))}
    fig, ax = plt.subplots(figsize=(5.5, 4.5))
    ax.plot([0, 1], [0, 1], "--", color="gray")
    reliability(ax, ye, P[~cal], "sebelum kalibrasi")
    reliability(ax, ye, Pc, f"sesudah temperature (T={t.T:.2f})")
    ax.set_xlabel("Keyakinan model (prob. tertinggi)")
    ax.set_ylabel("Akurasi aktual")
    ax.set_title(f"Reliability L2 target MAP ({tag}, CV)")
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(FIGURES / f"E5_reliability_L2_{tag}.png", dpi=200)
    plt.close(fig)
    out["L2"] = res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--l1-oof", type=Path)
    ap.add_argument("--l1-cols", nargs=4, default=["p4_P", "p4_L", "p4_M", "p4_T"])
    ap.add_argument("--l2-oof", type=Path)
    ap.add_argument("--tag", default="dev")
    ap.add_argument("--l1-calib", choices=["isotonic", "temperature"], default="isotonic")
    ap.add_argument("--write-models", action="store_true")
    a = ap.parse_args()
    TABLES.mkdir(parents=True, exist_ok=True)
    FIGURES.mkdir(parents=True, exist_ok=True)
    out: dict = {"tag": a.tag, "l1_oof": str(a.l1_oof), "l2_oof": str(a.l2_oof)}
    curve = l1_block(a.l1_oof, a.l1_cols, a.tag, out, a.write_models, a.l1_calib) if a.l1_oof else None
    if a.l2_oof:
        l2_block(a.l2_oof, a.tag, out)
    if curve is not None:
        fig, ax = plt.subplots(figsize=(5.5, 4.5))
        ax.plot(curve.defer_rate * 100, curve.risk, "o-")
        op = out["L1"]["operating_point"]["defer_rate"]
        ax.axvline(op * 100, color="#C44E52", ls=":", label=f"titik operasi D-09 ({op:.0%})")
        ax.set_xlabel("Persentase kasus diserahkan ke guru (%)")
        ax.set_ylabel("Tingkat salah kelompok pada sisa kasus")
        ax.set_title(f"E5 coverage–risk L1 ({a.tag}, CV)")
        ax.legend()
        fig.tight_layout()
        fig.savefig(FIGURES / f"E5_coverage_risk_{a.tag}.png", dpi=200)
        plt.close(fig)
    (TABLES / f"E5_l3_{a.tag}.json").write_text(json.dumps(out, indent=2, default=float))
    if a.write_models and "L1" in out:
        conf = {"alpha": 0.10, "l1_lac_qhat": out["L1"]["lac_qhat"], "l1_doubt_threshold": out["L1"]["doubt_threshold"],
                "l1_operating_point": out["L1"]["operating_point"]}
        if "L2" in out:
            conf |= {"l2_aps_qhat": out["L2"]["aps_qhat"], "l2_temperature": out["L2"]["temperature"]}
        (MODELS / "l3_conformal_v1.json").write_text(json.dumps(conf, indent=2))
    print(json.dumps(out, indent=2, default=float))


if __name__ == "__main__":
    main()
