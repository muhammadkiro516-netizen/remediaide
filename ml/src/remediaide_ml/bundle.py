"""Load the production artefacts in models/ into a diagnose.Bundle (T43; D-18, D-19, D-20).

L1 = CO-KT ensemble (5 seeds, temperature-calibrated) for quadrant probabilities; LightGBM (5 fold models) is the
explainer (SHAP reasons) and the fallback when CO-KT weights are missing. L2 (D-19): mDeBERTa for Indonesian input,
TF-IDF+LR for English input and as fallback when the encoder is not available.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from remediaide_ml.diagnose import Bundle
from remediaide_ml.l1.cokt import CoktConfig, _model, build_sequences, predict
from remediaide_ml.l1.explain import explain
from remediaide_ml.paths import MODELS

PQ = ["pq_P", "pq_L", "pq_M", "pq_T"]


def _session_frame(X: pd.DataFrame) -> pd.DataFrame:
    """diagnose frame -> columns build_sequences needs. Unknown questions/KCs map to id 0 (unknown)."""
    d = X.copy()
    d["seq_pos"] = d.groupby("UserId").cumcount()
    d["kc"] = pd.to_numeric(d["kc"], errors="coerce")
    d["fut_quadrant"] = np.nan
    return d


class LgbmL1:
    def __init__(self, models_dir: Path = MODELS):
        import lightgbm as lgb

        info = json.loads((models_dir / "l1_features_v1.json").read_text())
        self.features = info["features"]
        d = models_dir / "l1_lgbm_v1"
        self.b4 = [lgb.Booster(model_file=str(d / f)) for f in info["models"]["b4"]]
        self.bbin = [lgb.Booster(model_file=str(d / f)) for f in info["models"]["bbin"]]

    def X(self, X: pd.DataFrame) -> pd.DataFrame:
        return X.reindex(columns=self.features).astype(float)

    def predict_quadrant(self, X: pd.DataFrame) -> np.ndarray:
        return np.mean([b.predict(self.X(X)) for b in self.b4], axis=0)

    def explain(self, X: pd.DataFrame) -> list[list[dict]]:
        # reasons for "needs remediation" from the first binary fold model (log-odds SHAP)
        return explain(self.bbin[0], self.X(X), k=3)


class CoktL1:
    def __init__(self, models_dir: Path = MODELS, explainer: LgbmL1 | None = None, device: str = "cpu"):
        import torch

        self.device = torch.device(device)
        self.nets, self.cfg = [], None
        for p in sorted((models_dir / "l1_cokt_v1").glob("cokt_final_seed*.pt")):
            ck = torch.load(p, map_location="cpu", weights_only=False)
            cfg = CoktConfig(**ck["cfg"])
            net = _model(len(ck["q_vocab"]), len(ck["kc_vocab"]), cfg)
            net.load_state_dict(ck["state_dict"])
            net.to(self.device).eval()
            self.nets.append(net)
            self.cfg, self.qv, self.kv = cfg, ck["q_vocab"], ck["kc_vocab"]
        if not self.nets:
            raise FileNotFoundError("no CO-KT weights in models/l1_cokt_v1")
        self.calibrator = joblib.load(models_dir / "l1_calibrator_v1.joblib")
        self.explainer = explainer

    def predict_quadrant(self, X: pd.DataFrame) -> np.ndarray:
        d = _session_frame(X)
        d["QuestionId"] = pd.to_numeric(d["QuestionId"], errors="coerce")
        seq = build_sequences(d, self.qv, self.kv, max_len=self.cfg.max_len)
        seq["pad"] = np.arange(self.cfg.max_len)[None, :] >= seq["len"][:, None]
        idx = np.arange(len(seq["len"]))
        P = []
        for net in self.nets:
            pr = predict(net, seq, idx, self.cfg, self.device).dropna(subset=["pq_P"]).groupby("AnswerId")[PQ].first()
            P.append(pr.reindex(X["AnswerId"].to_numpy())[PQ].to_numpy(float))
        P = np.mean(P, axis=0)
        P /= P.sum(1, keepdims=True)
        return self.calibrator.predict(P)

    def explain(self, X: pd.DataFrame) -> list[list[dict]]:
        return self.explainer.explain(X) if self.explainer else [[] for _ in range(len(X))]


def _l2_frame(rows: pd.DataFrame) -> pd.DataFrame:
    return pd.DataFrame({"QuestionText": rows["question_text"].astype(str).to_numpy(),
                         "MC_Answer": rows.get("chosen_option_text", rows["chosen_option"]).astype(str).to_numpy(),
                         "StudentExplanation": rows["explanation"].astype(str).to_numpy(),
                         "is_correct_answer": rows["IsCorrect"].astype(bool).to_numpy(),
                         "QuestionId": rows["map_question_id"].astype(int).astype(str).to_numpy(),
                         "prefix": np.where(rows["IsCorrect"].astype(bool), "True", "False")})


def _l2_outputs(L: np.ndarray, classes: np.ndarray, df: pd.DataFrame, candidates: dict, T: float) -> dict[str, np.ndarray]:
    from remediaide_ml.l2.tfidf import candidate_mask

    L = np.where(candidate_mask(df, classes, candidates), L / T, -np.inf)
    P = np.exp(L - L.max(1, keepdims=True))
    P /= P.sum(1, keepdims=True)
    cat = np.array([c.split(":")[0].split("_", 1)[1] for c in classes])
    cat3 = np.column_stack([P[:, cat == c].sum(1) for c in ("Correct", "Misconception", "Neither")])
    top = P.argmax(1)
    label = np.array([classes[i].split(":", 1)[1] for i in top], dtype=object)
    tm = np.char.startswith(classes.astype(str), "True_Misconception")
    return {"cat3": cat3, "misc_label": label, "misc_prob": P[np.arange(len(P)), top], "p_true_misc": P[:, tm].sum(1)}


class MdebertaL2:
    """Production L2 for Indonesian input (D-19 ii): mDeBERTa-v3-base fold-0 model, Indonesian template."""

    def __init__(self, models_dir: Path = MODELS, temperature: float = 1.0, lang: str = "id", device: str = "cpu"):
        import torch
        from transformers import AutoModelForSequenceClassification, AutoTokenizer

        from remediaide_ml.data.map import build_candidates
        from remediaide_ml.paths import INTERIM

        d = models_dir / "l2_mdeberta_v1"
        self.tok = AutoTokenizer.from_pretrained(d)
        self.net = AutoModelForSequenceClassification.from_pretrained(d, dtype=torch.float32).to(device).eval()
        self.classes = np.array(json.loads((d / "classes.json").read_text()))
        cpath = models_dir / "l2_candidates_v1.json"
        self.candidates = json.loads(cpath.read_text()) if cpath.exists() else build_candidates(pd.read_parquet(INTERIM / "map.parquet"))
        self.T, self.lang, self.device = temperature, lang, device

    def predict(self, rows: pd.DataFrame) -> dict[str, np.ndarray]:
        import torch

        from remediaide_ml.l2.tfidf import build_text

        df = _l2_frame(rows)
        texts = build_text(df, self.lang).tolist()
        out = []
        with torch.no_grad():
            for i in range(0, len(texts), 32):
                e = self.tok(texts[i:i + 32], truncation=True, max_length=192, padding=True, return_tensors="pt").to(self.device)
                out.append(self.net(**e).logits.float().cpu().numpy())
        return _l2_outputs(np.concatenate(out), self.classes, df, self.candidates, self.T)


class StudentOnnxL2:
    """Light Layer 2 for small hosts (Tingkat A, D-23): MiniLM student, ONNX int8, onnxruntime CPU. Not calibrated and
    no validated hidden-misconception threshold, so the hidden flag is disabled (threshold > 1) when this model is used."""

    def __init__(self, models_dir: Path = MODELS, lang: str = "id"):
        import onnxruntime as ort
        from transformers import AutoTokenizer

        from remediaide_ml.data.map import build_candidates
        from remediaide_ml.paths import INTERIM

        d = models_dir / "l2_student_v1"
        self.tok = AutoTokenizer.from_pretrained(d)
        self.sess = ort.InferenceSession(str(d / "model_int8.onnx"), providers=["CPUExecutionProvider"])
        self.classes = np.array(json.loads((d / "classes.json").read_text()))
        cpath = models_dir / "l2_candidates_v1.json"
        self.candidates = json.loads(cpath.read_text()) if cpath.exists() else build_candidates(pd.read_parquet(INTERIM / "map.parquet"))
        self.lang = lang

    def predict(self, rows: pd.DataFrame) -> dict[str, np.ndarray]:
        from remediaide_ml.l2.tfidf import build_text

        df = _l2_frame(rows)
        texts = build_text(df, self.lang).tolist()
        out = []
        for i in range(0, len(texts), 32):
            e = self.tok(texts[i:i + 32], truncation=True, max_length=192, padding=True, return_tensors="np")
            out.append(self.sess.run(["logits"], {"input_ids": e["input_ids"].astype(np.int64),
                                                  "attention_mask": e["attention_mask"].astype(np.int64)})[0])
        return _l2_outputs(np.concatenate(out), self.classes, df, self.candidates, 1.0)


class TfidfL2:
    """Production L2 (D-19): TF-IDF+LR trained on all MAP rows, candidate-masked, temperature-calibrated."""

    CAT3 = ("Correct", "Misconception", "Neither")

    def __init__(self, models_dir: Path = MODELS, lang: str = "en"):
        art = joblib.load(models_dir / "l2_tfidf_v1.joblib")
        self.model, self.candidates, self.T = art["model"], art["candidates"], art["temperature"]
        self.classes = np.asarray(self.model.classes_)
        self.lang = lang

    def predict(self, rows: pd.DataFrame) -> dict[str, np.ndarray]:
        from remediaide_ml.l2.tfidf import build_text

        df = _l2_frame(rows)
        L = np.log(np.clip(self.model.predict_proba(build_text(df, self.lang)), 1e-12, 1))
        return _l2_outputs(L, self.classes, df, self.candidates, self.T)


def load_bundle(models_dir: Path = MODELS, with_l2: bool = True, l2_lang: str = "en") -> Bundle:
    conf = json.loads((models_dir / "l3_conformal_v1.json").read_text())
    explainer = LgbmL1(models_dir)
    try:
        l1, version = CoktL1(models_dir, explainer), "rmd2-cokt5"
    except (FileNotFoundError, OSError):
        l1, version = explainer, "rmd2-lgbm-fallback"
    l2, l2_name = None, None
    if with_l2:
        want = os.environ.get("RA_L2_MODEL") or conf.get("l2_by_lang", {}).get(l2_lang, "tfidf")
        if want == "student" and (models_dir / "l2_student_v1" / "model_int8.onnx").exists():
            l2, l2_name = StudentOnnxL2(models_dir, l2_lang), "student"
        elif want in ("mdeberta", "student") and (models_dir / "l2_mdeberta_v1").exists():
            l2, l2_name = MdebertaL2(models_dir, conf["l2_mdeberta"]["temperature"], l2_lang), "mdeberta"
        elif (models_dir / "l2_tfidf_v1.joblib").exists():
            l2, l2_name = TfidfL2(models_dir, l2_lang), "tfidf"  # fallback (also for Indonesian input)
    if l2_name == "student":
        hidden = 1.01  # no validated threshold for the student -> flag disabled (documented in models/README.md)
    else:
        hidden = conf[f"l2_{l2_name}"]["hidden_threshold"] if l2_name else conf["hidden_threshold"]
    mdict = {}
    p = models_dir / "misconception_dictionary.json"
    if p.exists():
        mdict = json.loads(p.read_text())
    # when the fallback is active its LAC/defer thresholds are the CO-KT ones (documented limitation)
    return Bundle(l1=l1, l2=l2, lac_qhat=conf["l1_lac_qhat"], defer_threshold=conf["l1_doubt_threshold"],
                  hidden_threshold=hidden, mastery_prior=conf["mastery_prior"],
                  misconception_dict=mdict, model_version=f"{version}+l2-{l2_name or 'none'}")
