"""T68 (Tingkat A): L1 LightGBM (fold-0 models, seed 20261118) -> ONNX for in-browser inference, plus a parity fixture
for the TypeScript feature code (web: src/lib/ml/features.ts).

  python scripts/export_l1_onnx.py [--web-dir ../.worktrees/web]
Outputs: models/l1_onnx_v1/{l1_b4.onnx, l1_bbin.onnx, features.json}, reports/tables/T68_onnx_parity.json and, with
--web-dir, copies the models to <web>/public/models/ and the fixture to <web>/src/lib/ml/__tests__/fixtures/l1_features.json.
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

from remediaide_ml.diagnose import _frame
from remediaide_ml.features.history import add_history_features
from remediaide_ml.paths import ML_ROOT, MODELS, TABLES

sys.path.insert(0, str(ML_ROOT / "tests"))


def payload():
    """Deterministic mixed session: 6 students x 8 questions over 3 KCs, varied correctness/confidence/time."""
    rng = np.random.default_rng(20261118)
    items = [{"question_id": f"q{j}", "kc_id": f"kc{j % 3}", "correct_option": "A", "map_question_id": None,
              "question_text": "x"} for j in range(8)]
    res = []
    for s in range(6):
        t = 0
        for j in range(8):
            t += int(rng.integers(20, 400))
            ok = bool(rng.random() < 0.55)
            res.append({"student_key": f"s{s}", "question_id": f"q{j}", "chosen_option": "A" if ok else "BCD"[j % 3],
                        "is_correct": ok, "cri": int(rng.integers(0, 6)), "response_time_ms": 9000, "tau_min_ms": 4000,
                        "explanation": "", "answered_at": f"2026-11-30T{8 + t // 3600:02d}:{(t // 60) % 60:02d}:{t % 60:02d}Z"})
    return {"session_id": "fixture", "items": items, "responses": res}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--web-dir", type=Path, default=None)
    a = ap.parse_args()
    import onnxruntime as ort
    from onnxmltools import convert_lightgbm
    from onnxmltools.convert.common.data_types import FloatTensorType

    info = json.loads((MODELS / "l1_features_v1.json").read_text())
    feats = info["features"]
    out = MODELS / "l1_onnx_v1"
    out.mkdir(parents=True, exist_ok=True)
    p = payload()
    f = add_history_features(_frame(p))
    f["item_diff_oof"], f["kc_diff_oof"], f["cur_option_share_oof"] = 0.54, 0.54, 0.0
    X = f[feats].astype("float32").to_numpy()
    parity = {}
    preds = {}
    for task in ("b4", "bbin"):
        booster = lgb.Booster(model_file=str(MODELS / "l1_lgbm_v1" / f"model_{task}_fold0.txt"))
        onx = convert_lightgbm(booster, initial_types=[("input", FloatTensorType([None, len(feats)]))], target_opset=15,
                               zipmap=False)
        path = out / f"l1_{task}.onnx"
        path.write_bytes(onx.SerializeToString())
        sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        o = sess.run(None, {"input": X})
        p_onnx = np.asarray(o[1], dtype=float)
        p_lgb = booster.predict(pd.DataFrame(X, columns=feats))
        if task == "bbin":
            p_lgb = np.column_stack([1 - p_lgb, p_lgb])
        parity[task] = {"max_abs_diff": float(np.abs(p_onnx - p_lgb).max()), "size_mb": round(path.stat().st_size / 1e6, 1),
                        "n_rows": len(X)}
        preds[task] = p_lgb.tolist()
    (out / "features.json").write_text(json.dumps({"features": feats, "defaults": {"item_diff_oof": 0.54, "kc_diff_oof": 0.54,
                                                                                    "cur_option_share_oof": 0.0},
                                                   "classes_b4": ["P", "L", "M", "T"], "source": "model_*_fold0.txt"}, indent=1))
    (TABLES / "T68_onnx_parity.json").write_text(json.dumps(parity, indent=2))
    fx = {"payload": p, "features": feats,
          "rows": [{"student_key": r.UserId, "question_id": r.QuestionId,
                    "x": [None if pd.isna(v) else float(v) for v in r[feats].astype("float64")]} for _, r in f.iterrows()],
          "p_b4": preds["b4"], "p_bbin": preds["bbin"]}
    if a.web_dir:
        (a.web_dir / "public" / "models").mkdir(parents=True, exist_ok=True)
        for t in ("b4", "bbin"):
            shutil.copy2(out / f"l1_{t}.onnx", a.web_dir / "public" / "models" / f"l1_{t}.onnx")
        shutil.copy2(out / "features.json", a.web_dir / "public" / "models" / "l1_features.json")
        fxd = a.web_dir / "src" / "lib" / "ml" / "__tests__" / "fixtures"
        fxd.mkdir(parents=True, exist_ok=True)
        (fxd / "l1_features.json").write_text(json.dumps(fx))
    print(json.dumps(parity, indent=1))


if __name__ == "__main__":
    main()
