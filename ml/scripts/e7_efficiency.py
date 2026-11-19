"""T35 / E7 (Tingkat A, D-23): ONNX export + dynamic int8 quantisation of the distilled student; size, CPU latency,
and MAP@3 FP32 vs int8 on the E4 fold-0 rows (EN and ID).

  python scripts/e7_efficiency.py --student runs/<id>_l2_distill_kaggle/kaggle_output/student_model
Outputs: reports/tables/E7_efficiency.csv, models/l2_student_v1/{model_int8.onnx, tokenizer, classes.json}.
"""
from __future__ import annotations

import argparse
import json
import shutil
import time
from pathlib import Path

import numpy as np
import pandas as pd

from remediaide_ml.data.map import build_candidates
from remediaide_ml.eval import metrics as M
from remediaide_ml.l2.tfidf import build_text, candidate_mask
from remediaide_ml.paths import INTERIM, MODELS, PROCESSED, RUNS, TABLES

MDEB = RUNS / "20261118-2202_l2_mdeberta_kaggle" / "kaggle_output" / "model_target_fold0"


def dir_mb(p: Path) -> float:
    files = [p] if p.is_file() else [f for f in p.rglob("*") if f.is_file()]
    return round(sum(f.stat().st_size for f in files) / 1e6, 1)


def map3(L, classes, va, mask):
    L = np.where(mask, L, -np.inf)
    P = np.exp(L - L.max(1, keepdims=True))
    top3 = M.topk_from_proba(P / P.sum(1, keepdims=True), classes, 3)
    return float(np.mean([M.map_at_k([t], [p]) for t, p in zip(va.target.to_numpy(), top3, strict=True)]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--student", type=Path, required=True)
    ap.add_argument("--n-latency", type=int, default=200)
    a = ap.parse_args()
    import onnxruntime as ort
    import torch
    from onnxruntime.quantization import QuantType, quantize_dynamic
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    out = MODELS / "l2_student_v1"
    out.mkdir(parents=True, exist_ok=True)
    tok = AutoTokenizer.from_pretrained(a.student)
    model = AutoModelForSequenceClassification.from_pretrained(a.student, dtype=torch.float32).eval()
    classes = np.array(json.loads((a.student / "classes.json").read_text()))
    ex = tok(["contoh"], return_tensors="pt")
    fp32 = out / "model_fp32.onnx"
    torch.onnx.export(model, (ex["input_ids"], ex["attention_mask"]), str(fp32), input_names=["input_ids", "attention_mask"],
                      output_names=["logits"], dynamic_axes={"input_ids": {0: "b", 1: "t"}, "attention_mask": {0: "b", 1: "t"},
                                                             "logits": {0: "b"}}, opset_version=17, dynamo=False)
    int8 = out / "model_int8.onnx"
    quantize_dynamic(str(fp32), str(int8), weight_type=QuantType.QInt8)
    tok.save_pretrained(out)
    shutil.copy2(a.student / "classes.json", out / "classes.json")

    m = pd.read_parquet(INTERIM / "map.parquet").merge(pd.read_parquet(PROCESSED / "map_splits.parquet")[["row_id", "fold_random"]],
                                                       on="row_id").merge(pd.read_parquet(PROCESSED / "map_id.parquet"), on="row_id")
    va = m[m.fold_random == 0].reset_index(drop=True)
    mask = candidate_mask(va, classes, build_candidates(m[m.fold_random != 0]))
    texts = {"EN": build_text(va, "en").tolist(),
             "ID": build_text(va, "id", cols=("QuestionText_id", "MC_Answer_id", "StudentExplanation_id")).tolist()}
    so = ort.SessionOptions()
    so.intra_op_num_threads = 4
    sessions = {"fp32": ort.InferenceSession(str(fp32), so, providers=["CPUExecutionProvider"]),
                "int8": ort.InferenceSession(str(int8), so, providers=["CPUExecutionProvider"])}

    def run(sess, txts, bs=64):
        L = []
        for i in range(0, len(txts), bs):
            e = tok(txts[i:i + bs], truncation=True, max_length=192, padding=True, return_tensors="np")
            L.append(sess.run(["logits"], {"input_ids": e["input_ids"].astype(np.int64),
                                           "attention_mask": e["attention_mask"].astype(np.int64)})[0])
        return np.concatenate(L)

    rows = []
    for name, sess in sessions.items():
        res = {"model": f"MiniLM-L12 student ONNX {name}", "ukuran_MB": dir_mb(fp32 if name == "fp32" else int8)}
        for lang, txt in texts.items():
            res[f"map3_{lang}"] = map3(run(sess, txt), classes, va, mask)
        lat = []
        for t in texts["ID"][: a.n_latency]:
            e = tok([t], truncation=True, max_length=192, return_tensors="np")
            t0 = time.perf_counter()
            sess.run(["logits"], {"input_ids": e["input_ids"].astype(np.int64), "attention_mask": e["attention_mask"].astype(np.int64)})
            lat.append((time.perf_counter() - t0) * 1000)
        res |= {"latensi_p50_ms": float(np.percentile(lat, 50)), "latensi_p95_ms": float(np.percentile(lat, 95))}
        rows.append(res)
    e4 = pd.read_csv(TABLES / "E4_crosslingual_mdeberta.csv").set_index("metric")
    rows.insert(0, {"model": "mDeBERTa-v3-base teacher (PyTorch, fold 0)", "ukuran_MB": dir_mb(MDEB),
                    "map3_EN": float(e4.loc["MAP@3", "EN"]), "map3_ID": float(e4.loc["MAP@3", "ID"]),
                    "latensi_p50_ms": None, "latensi_p95_ms": None})
    df = pd.DataFrame(rows)
    df["catatan"] = "fold 0 MAP (7.340 baris), input ID = terjemahan mesin; latensi batch 1, CPU laptop, 4 thread"
    TABLES.mkdir(parents=True, exist_ok=True)
    df.to_csv(TABLES / "E7_efficiency.csv", index=False)
    fp32.unlink()  # keep only the int8 artefact
    print(df.round(4).to_string())


if __name__ == "__main__":
    main()
