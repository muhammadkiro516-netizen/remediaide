"""T40-T43: production Layer 3 parameters for the models actually deployed (D-18, D-19, D-20).

  python scripts/l3_production.py --cokt-final runs/20261119-0620_cokt_final_kaggle/kaggle_output \
      --l2-oof runs/20261118-2131_l2_tfidf/oof_target.parquet
L1: the production CO-KT ensemble (5 seeds) predicted the calibration users, who were never used for training or
early stopping (scripts/train_cokt_final.py). On those users: temperature scaling (03 §3, neural net), LAC qhat
(alpha 0.1), D-09 operating point + doubt threshold, binary temperature for needs_remediation.
L2 (D-19: TF-IDF for English, mDeBERTa for Indonesian input): temperature + APS from the CV OOF calibration part
(l3_eval protocol); hidden-misconception threshold (D-20) = p(True_Misconception) maximising F1 on the CV OOF
calibration rows with a correct answer.
Test predictions (pred_test_*) are NOT read here.
Outputs: models/l1_calibrator_v1.joblib, models/l1_bin_calibrator_v1.joblib, models/l3_conformal_v1.json,
reports/tables/L3_production_params.json.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from remediaide_ml.data.splits import calibration_groups
from remediaide_ml.eval import metrics as M
from remediaide_ml.l3.calibration import Temperature, TemperatureProb
from remediaide_ml.l3.conformal import APS, LAC
from remediaide_ml.l3.selective import choose_operating_point, coverage_risk, doubt_max_prob, threshold_for_rate
from remediaide_ml.paths import INTERIM, ML_ROOT, MODELS, PROCESSED, TABLES

PQ = ["pq_P", "pq_L", "pq_M", "pq_T"]
_spec = importlib.util.spec_from_file_location("e3", ML_ROOT / "scripts" / "e3_true_misconception.py")
e3 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(e3)


def seed_mean(d: Path, pattern: str) -> pd.DataFrame:
    parts = [pd.read_parquet(f, columns=["AnswerId", *PQ]).dropna(subset=["pq_P"]).groupby("AnswerId").first()
             for f in sorted(d.glob(pattern))]
    assert len(parts) == 5, f"expected 5 seeds, found {len(parts)}"
    return pd.concat(parts, keys=range(len(parts))).groupby(level="AnswerId").mean()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cokt-final", type=Path, required=True)
    ap.add_argument("--l2-oof", type=Path, required=True, help="TF-IDF oof_target.parquet")
    ap.add_argument("--l2-enc", type=Path, default=None, help="mDeBERTa kaggle_output dir (oof_target_fold*.parquet)")
    a = ap.parse_args()
    out: dict = {"cokt_final": str(a.cokt_final), "l2_oof": str(a.l2_oof)}

    # ---- L1 on the production model's held-out calibration users
    p = seed_mean(a.cokt_final, "pred_cal_seed*.parquet")
    meta = pd.read_parquet(PROCESSED / "eedi_features_b.parquet",
                           columns=["AnswerId", "UserId", "has_conf", "fut_quadrant", "needs_remediation"]).set_index("AnswerId")
    d = p.join(meta, how="inner")
    roles = json.loads((a.cokt_final / "roles.json").read_text())
    assert set(d.UserId.unique()) <= set(roles["calibration"]), "non-calibration users in pred_cal"
    lab = d[d.has_conf & d.fut_quadrant.notna()]
    P = lab[PQ].to_numpy(float, copy=True)
    P /= P.sum(1, keepdims=True)
    y = lab.fut_quadrant.astype(str).map({"P": 0, "L": 1, "M": 2, "T": 3}).to_numpy()
    # half of the calibration users fit the calibrator, the other half reports its effect (honest ECE)
    half = calibration_groups(lab.UserId.to_numpy(), frac=0.5)
    t_chk = TemperatureProb().fit(P[half], y[half])
    out["L1_check_on_other_half"] = {"ece_before": M.ece(y[~half], P[~half]), "ece_after": M.ece(y[~half], t_chk.predict(P[~half])),
                                     "n_rows": int((~half).sum())}
    temp = TemperatureProb().fit(P, y)
    Pc = temp.predict(P)
    lac = LAC(0.10).fit(Pc, y)
    curve = coverage_risk(Pc.argmax(1) != y, doubt_max_prob(Pc))
    op = choose_operating_point(curve)
    thr = threshold_for_rate(doubt_max_prob(Pc), op["defer_rate"])
    out["L1"] = {"n_users": int(lab.UserId.nunique()), "n_rows": len(lab), "temperature": temp.T, "lac_qhat": lac.qhat,
                 "operating_point": op, "doubt_threshold": thr, "misgroup_no_defer": float((Pc.argmax(1) != y).mean()),
                 "coverage_risk": curve.to_dict(orient="records")}
    yb = d.needs_remediation.dropna()
    pb = d.loc[yb.index, "pq_M"] + d.loc[yb.index, "pq_T"]
    pb = (pb / d.loc[yb.index, PQ].sum(1)).to_numpy()
    tb = TemperatureProb().fit(np.column_stack([1 - pb, pb]), yb.astype(int).to_numpy())
    out["L1_bin"] = {"temperature": tb.T, "n_rows": len(yb), "mastery_prior": float(1 - yb.mean())}
    MODELS.mkdir(parents=True, exist_ok=True)
    joblib.dump(temp, MODELS / "l1_calibrator_v1.joblib")
    joblib.dump(tb, MODELS / "l1_bin_calibrator_v1.joblib")

    # ---- L2 (D-19): TF-IDF for English input, mDeBERTa for Indonesian input; CV OOF calibration part
    m = pd.read_parquet(INTERIM / "map.parquet").sort_values("row_id").reset_index(drop=True)
    sp = pd.read_parquet(PROCESSED / "map_splits.parquet")
    m = m.merge(sp[["row_id", "fold_random"]], on="row_id", validate="one_to_one")
    conf = {"alpha": 0.10, "l1_temperature": temp.T, "l1_lac_qhat": lac.qhat, "l1_doubt_threshold": thr,
            "l1_operating_point": op, "l1_bin_temperature": tb.T, "mastery_prior": out["L1_bin"]["mastery_prior"],
            "source": "scripts/l3_production.py (calibration users of the production CO-KT; CV OOF calibration rows for L2)"}
    for name, src in (("tfidf", a.l2_oof), ("mdeberta", a.l2_enc)):
        if src is None:
            continue
        P2, cls = e3.load_oof(src, m)  # candidate-masked probabilities, rows aligned with m
        L2 = np.log(np.clip(P2, 1e-12, 1))
        y2 = np.searchsorted(cls, m.target.to_numpy())
        cal = calibration_groups(m.row_id.to_numpy())
        t2 = Temperature().fit(L2[cal], y2[cal])
        aps = APS(0.10).fit(t2.predict(L2[cal]), y2[cal])
        # D-20 hidden-misconception threshold: F1-max on calibration rows whose answer is correct
        Pt = t2.predict(L2)
        tm = np.char.startswith(cls.astype(str), "True_Misconception")
        s_tm = Pt[:, tm].sum(1)
        sel = cal & m.target.str.startswith("True_").to_numpy()
        is_tm = (m.Category == "True_Misconception").to_numpy()[sel]
        grid = np.round(np.arange(0.05, 0.96, 0.05), 2)
        f1s = []
        for g in grid:
            pred = s_tm[sel] >= g
            f1s.append(2 * (pred & is_tm).sum() / max(1, pred.sum() + is_tm.sum()))
        h_thr = float(grid[int(np.argmax(f1s))])
        out[f"L2_{name}"] = {"temperature": t2.T, "aps_qhat": aps.qhat, "hidden_threshold": h_thr,
                             "hidden_f1_at_threshold": float(max(f1s)),
                             "hidden_f1_grid": dict(zip(grid.tolist(), [float(x) for x in f1s], strict=True)),
                             "n_cal_rows": int(cal.sum())}
        conf[f"l2_{name}"] = {"temperature": t2.T, "aps_qhat": aps.qhat, "hidden_threshold": h_thr}
    conf["l2_by_lang"] = {"en": "tfidf", "id": "mdeberta" if a.l2_enc else "tfidf"}
    conf["hidden_threshold"] = conf[f"l2_{conf['l2_by_lang']['id']}"]["hidden_threshold"]
    (MODELS / "l3_conformal_v1.json").write_text(json.dumps(conf, indent=2, default=float))
    (TABLES / "L3_production_params.json").write_text(json.dumps(out, indent=2, default=float))
    print(json.dumps({k: v for k, v in out.items()}, indent=1, default=float)[:3000])


if __name__ == "__main__":
    main()
