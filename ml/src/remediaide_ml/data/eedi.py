"""Eedi NeurIPS 2020 Task 3&4 loader + cleaning (docs/cac/02_DATA_SPEC.md §1, T12).

load_raw()      -> dict of raw DataFrames (train, answer, question, student, subject)
clean(...)      -> (interim DataFrame, report dict). Pure: no I/O, used by tests with synthetic fixtures.
build_interim() -> writes data/interim/eedi_t34.parquet and returns the report.
"""

from __future__ import annotations

import ast
import json
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

from remediaide_ml.cri_rule import CRI_HIGH_THRESHOLD
from remediaide_ml.paths import INTERIM, RAW_EEDI

FILES = {
    "train": "train_data/train_task_3_4.csv",
    "answer": "metadata/answer_metadata_task_3_4.csv",
    "question": "metadata/question_metadata_task_3_4.csv",
    "student": "metadata/student_metadata_task_3_4.csv",
    "subject": "metadata/subject_metadata.csv",
}


def find_root(raw_dir: Path = RAW_EEDI) -> Path:
    """Directory that contains train_data/ and metadata/ (the zip may add a top-level folder)."""
    for p in [raw_dir, *sorted(raw_dir.rglob("*"))]:
        if p.is_dir() and (p / FILES["train"]).exists():
            return p
    raise FileNotFoundError(f"{FILES['train']} not found under {raw_dir}")


def extract_zip(raw_dir: Path = RAW_EEDI) -> None:
    """Extract only the Task 3&4 files + subject metadata (images and task 1&2 are skipped)."""
    zp = raw_dir / "data.zip"
    with zipfile.ZipFile(zp) as z:
        wanted = [n for n in z.namelist() if any(n.endswith(f) for f in FILES.values())]
        for n in wanted:
            z.extract(n, raw_dir)


def load_raw(raw_dir: Path = RAW_EEDI) -> dict[str, pd.DataFrame]:
    root = find_root(raw_dir)
    return {k: pd.read_csv(root / v) for k, v in FILES.items()}


def confidence_to_cri_vec(conf: pd.Series) -> pd.Series:
    """Vectorised cri_rule.confidence_to_cri (half-up, D-03). NaN stays <NA>."""
    c = conf.astype("float64").clip(0, 100)
    cri = np.minimum(5, np.floor((c + 10) / 20))
    return pd.Series(cri, index=conf.index).astype("Int8")


def _deepest_subject(subject_lists: pd.Series, subject: pd.DataFrame) -> tuple[pd.Series, pd.Series]:
    level = dict(zip(subject.SubjectId, subject.Level, strict=True))
    parent = dict(zip(subject.SubjectId, subject.ParentId, strict=True))

    def deepest(lst):
        known = [s for s in lst if s in level]
        if not known:
            return np.nan
        # deepest level; ties -> the last listed (Eedi lists subjects root -> leaf)
        best = max(level[s] for s in known)
        return [s for s in known if level[s] == best][-1]

    kc = subject_lists.map(deepest)
    kc_l2 = kc.map(lambda s: parent.get(s, np.nan) if pd.notna(s) else np.nan)
    return kc, kc_l2


def clean(raw: dict[str, pd.DataFrame]) -> tuple[pd.DataFrame, dict]:
    tr, am, qm, sm, sub = (raw[k].copy() for k in ("train", "answer", "question", "student", "subject"))
    rep: dict = {"n_train_raw": int(len(tr)), "answer_meta_columns": list(am.columns)}

    # 1. exact AnswerId duplicates
    dup = tr.duplicated("AnswerId", keep="first")
    rep["n_dup_answerid_dropped"] = int(dup.sum())
    tr = tr[~dup]

    # 2. consistency IsCorrect == (AnswerValue == CorrectAnswer)
    bad = tr["IsCorrect"].astype(int) != (tr["AnswerValue"] == tr["CorrectAnswer"]).astype(int)
    rep["n_inconsistent_iscorrect_dropped"] = int(bad.sum())
    tr = tr[~bad]

    # 3. joins
    am = am.drop_duplicates("AnswerId")
    df = tr.merge(am, on="AnswerId", how="left", validate="one_to_one", suffixes=("", "_am"))
    rep["n_missing_answer_meta"] = int(df["DateAnswered"].isna().sum())
    qm = qm.copy()
    qm["subjects"] = qm["SubjectId"].map(lambda s: list(ast.literal_eval(s)) if isinstance(s, str) else [])
    qm["kc"], qm["kc_l2"] = _deepest_subject(qm["subjects"], sub)
    df = df.merge(qm[["QuestionId", "kc", "kc_l2", "subjects"]], on="QuestionId", how="left", validate="many_to_one")
    sm = sm.drop_duplicates("UserId")
    df = df.merge(sm, on="UserId", how="left", validate="many_to_one")

    # 4. ordering + attempts
    df["DateAnswered"] = pd.to_datetime(df["DateAnswered"], errors="coerce")
    df = df.sort_values(["UserId", "DateAnswered", "AnswerId"], kind="mergesort").reset_index(drop=True)
    df["attempt_no"] = (df.groupby(["UserId", "QuestionId"]).cumcount() + 1).astype("int16")
    df["seq_pos"] = df.groupby("UserId").cumcount().astype("int32")

    # 5. CRI
    df["has_conf"] = df["Confidence"].notna()
    df["cri"] = confidence_to_cri_vec(df["Confidence"])
    df["cri_high"] = (df["cri"] >= CRI_HIGH_THRESHOLD).astype("boolean").where(df["has_conf"])

    out = pd.DataFrame({
        "UserId": df.UserId.astype("int32"),
        "QuestionId": df.QuestionId.astype("int32"),
        "AnswerId": df.AnswerId.astype("int64"),
        "DateAnswered": df.DateAnswered,
        "IsCorrect": df.IsCorrect.astype("int8"),
        "AnswerValue": df.AnswerValue.astype("int8"),
        "CorrectAnswer": df.CorrectAnswer.astype("int8"),
        "Confidence": df.Confidence.astype("float32"),
        "has_conf": df.has_conf,
        "cri": df.cri,
        "kc": df.kc.astype("Int32"),
        "kc_l2": df.kc_l2.astype("Int32"),
        "QuizId": df.get("QuizId", pd.Series(pd.NA, index=df.index)).astype("Int32"),
        "GroupId": df.get("GroupId", pd.Series(pd.NA, index=df.index)).astype("Int32"),
        "SchemeOfWorkId": df.get("SchemeOfWorkId", pd.Series(pd.NA, index=df.index)).astype("Int32"),
        "Gender": df.Gender.astype("Int8"),
        "DateOfBirth": pd.to_datetime(df.DateOfBirth, errors="coerce"),
        "PremiumPupil": df.PremiumPupil.astype("Float32"),
        "attempt_no": df.attempt_no,
        "seq_pos": df.seq_pos,
    })
    rep.update({
        "n_rows": int(len(out)),
        "n_users": int(out.UserId.nunique()),
        "n_questions": int(out.QuestionId.nunique()),
        "n_kc": int(out.kc.nunique()),
        "n_rows_missing_kc": int(out.kc.isna().sum()),
        "pct_conf_missing": float(1 - out.has_conf.mean()),
    })
    return out, rep


def build_interim(raw_dir: Path = RAW_EEDI, out_dir: Path = INTERIM) -> dict:
    df, rep = clean(load_raw(raw_dir))
    out_dir.mkdir(parents=True, exist_ok=True)
    df.to_parquet(out_dir / "eedi_t34.parquet", index=False)
    (out_dir / "eedi_t34_report.json").write_text(json.dumps(rep, indent=2, default=str))
    return rep


if __name__ == "__main__":
    import sys

    if "--extract" in sys.argv:
        extract_zip()
    print(json.dumps(build_interim(), indent=2, default=str))
