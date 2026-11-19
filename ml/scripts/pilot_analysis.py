"""T73-T75 pilot pipeline. Runs as soon as the pilot files exist in ml/data/pilot/ (never committed).

  python scripts/pilot_analysis.py validate --export data/pilot/remediaide_riset.csv
  python scripts/pilot_analysis.py sheets   --export data/pilot/remediaide_riset.csv     # -> data/pilot/labeling_guru_A/B.xlsx
  python scripts/pilot_analysis.py analyze  --export data/pilot/remediaide_riset.csv \
         --labels-a data/pilot/labeling_guru_A.xlsx --labels-b data/pilot/labeling_guru_B.xlsx [--resolved data/pilot/konsensus.csv]
  python scripts/pilot_analysis.py synthetic                                             # code test only, SINTETIS
Real outputs go to reports/pilot/ (aggregates only, no explanations). The synthetic mode writes to
runs/<ts>_pilot_synthetic/ with a SINTETIS banner and is never copied to reports/.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from remediaide_ml.paths import ML_ROOT, REPO_ROOT, REPORTS, TABLES, run_dir
from remediaide_ml.pilot import analysis as A

PILOT_DOCS = REPO_ROOT / "docs" / "cac" / "pilot"
PILOT_DATA = ML_ROOT / "data" / "pilot"
BANNER = "SINTETIS — uji kode saja, BUKAN hasil pilot. Jangan dikutip di laporan."


def instrument() -> dict:
    return json.loads((PILOT_DOCS / "instrument_map_id.json").read_text())


def read_export(path: Path) -> pd.DataFrame:
    return pd.read_csv(path, dtype={"student_key": str, "session_id": str, "question_id": str}, keep_default_na=False)


def cmd_validate(a):
    rep = A.validate_export(read_export(a.export), instrument())
    print(json.dumps(rep, indent=2, ensure_ascii=False))
    return 0 if rep["ok"] else 1


def cmd_sheets(a, export=None, out_dir: Path = PILOT_DATA):
    inst = instrument()
    export = export if export is not None else read_export(a.export)
    sample = A.labeling_sample(export)
    for who, seed in (("A", 1), ("B", 2)):
        A.fill_sheet(PILOT_DOCS / "labeling_sheet.xlsx", sample, inst, out_dir / f"labeling_guru_{who}.xlsx", seed)
    print(f"{len(sample)} baris ({(sample.jenis == 'latihan').sum()} latihan) -> {out_dir}/labeling_guru_A.xlsx, _B.xlsx")
    return sample


def analyze(export, la, lb, resolved, preds, out: Path, synthetic: bool):
    inst = instrument()
    dictionary = pd.read_csv(TABLES / "map_misconception_dictionary.csv")
    res = {"banner": BANNER if synthetic else "data pilot nyata", "validation": A.validate_export(export, inst),
           "e9_teacher_teacher": A.e9_agreement(la, lb)}
    gold = A.consensus(la, lb, resolved)
    res["n_consensus"] = int(len(gold))
    res["e9_model_teacher"] = A.model_vs_teacher(preds, gold, set(dictionary.label))
    fv = A.fusion_validation(preds, gold)
    res["fusion_validation"] = fv.to_dict(orient="records")
    res["guard_real_time"] = A.guard_real(export, inst)
    A.write_json(res, out / "pilot_results.json")
    fv.to_csv(out / "pilot_fusion_validation.csv", index=False)
    (out / "README.md").write_text(f"# Hasil pilot\n\n{res['banner']}\n\nSumber: `scripts/pilot_analysis.py`.\n")
    print(json.dumps({k: v for k, v in res.items() if k != "guard_real_time"}, indent=1, ensure_ascii=False, default=float)[:3000])
    return res


def cmd_analyze(a):
    from remediaide_ml.bundle import load_bundle

    export = read_export(a.export)
    rep = A.validate_export(export, instrument())
    if not rep["ok"]:
        print(json.dumps(rep, indent=2, ensure_ascii=False))
        raise SystemExit("validasi gagal; perbaiki data dulu")
    la, lb = A.read_labels(a.labels_a), A.read_labels(a.labels_b)
    resolved = pd.read_csv(a.resolved, dtype=str) if a.resolved else None
    preds = A.predict_rows(export, instrument(), load_bundle(l2_lang="id"))
    analyze(export, la, lb, resolved, preds, REPORTS / "pilot", synthetic=False)


def cmd_synthetic(_a):
    """End-to-end code test with fake data and a stub model. Output is stamped SINTETIS and kept in runs/."""
    import numpy as np

    out = run_dir("pilot_synthetic")
    out.mkdir(parents=True, exist_ok=True)
    (out / "SINTETIS.txt").write_text(BANNER + "\n")
    inst = instrument()
    export = A.synthetic_export(inst)
    export.to_csv(out / "export_sintetis.csv", index=False)
    sample = cmd_sheets(None, export=export, out_dir=out)
    dictionary = pd.read_csv(TABLES / "map_misconception_dictionary.csv")
    codes = {str(i["map_question_id"]): dictionary[dictionary.question_ids.astype(str) == str(i["map_question_id"])].label.tolist()
             + ["BENAR", "TIDAK_JELAS", "LAIN"] for i in inst["items"]}
    la = A.synthetic_labels(sample, codes, 0.8, 1)
    lb = A.synthetic_labels(sample, codes, 0.8, 1)  # same base draw -> agreement ~ 0.8^2
    rng = np.random.default_rng(3)
    preds = export[["student_key", "question_id", "cri"]].copy()
    preds["is_correct"] = export.is_correct.astype(int)
    preds["p1_M"] = rng.uniform(0, 0.5, len(preds))
    preds["p1_notmastered"] = np.clip(preds.p1_M + rng.uniform(0, 0.4, len(preds)), 0, 1)
    has = export.explanation.str.len() > 0
    preds["has_explanation"] = has
    preds["p2_correct"] = np.where(has, rng.uniform(0, 1, len(preds)), np.nan)
    preds["fused_notmastered"] = np.where(has, (preds.p1_notmastered + 1 - preds.p2_correct) / 2, preds.p1_notmastered)
    preds["l2_label"] = None
    analyze(export, la, lb, None, preds, out, synthetic=True)
    print(f"-> {out} ({BANNER})")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("validate", "sheets", "analyze"):
        p = sub.add_parser(name)
        p.add_argument("--export", type=Path, required=True)
        if name == "analyze":
            p.add_argument("--labels-a", type=Path, required=True)
            p.add_argument("--labels-b", type=Path, required=True)
            p.add_argument("--resolved", type=Path)
    sub.add_parser("synthetic")
    a = ap.parse_args()
    {"validate": cmd_validate, "sheets": cmd_sheets, "analyze": cmd_analyze, "synthetic": cmd_synthetic}[a.cmd](a)


if __name__ == "__main__":
    main()
