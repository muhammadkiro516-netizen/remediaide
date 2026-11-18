"""MAP (Charting Student Math Misunderstandings) loader + cleaning (docs/cac/02_DATA_SPEC.md §2, T13).

Outputs
* data/interim/map.parquet            cleaned rows (original text kept in *_raw columns)
* data/interim/map_candidates.json     {"<QuestionId>|<True|False>": [target, ...]}  (D-06)
"""

from __future__ import annotations

import json
import unicodedata
from pathlib import Path

import pandas as pd

from remediaide_ml.paths import INTERIM, RAW_MAP

CATEGORIES = ("True_Correct", "True_Neither", "True_Misconception", "False_Correct", "False_Neither", "False_Misconception")
CATEGORY3 = ("Correct", "Neither", "Misconception")
TEXT_COLS = ("QuestionText", "MC_Answer", "StudentExplanation")


def normalise_text(s) -> str:
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return ""
    return " ".join(unicodedata.normalize("NFKC", str(s)).split())


def load_raw(path: Path | None = None) -> pd.DataFrame:
    return pd.read_csv(path or RAW_MAP / "train.csv")


def clean(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Return (clean_df, report). Pure function: no I/O."""
    expected = {"row_id", "QuestionId", "QuestionText", "MC_Answer", "StudentExplanation", "Category", "Misconception"}
    missing = expected - set(df.columns)
    if missing:
        raise ValueError(f"MAP columns missing: {sorted(missing)}")
    out = df.copy()
    for c in TEXT_COLS:
        out[f"{c}_raw"] = out[c]
        out[c] = out[c].map(normalise_text)
    bad_cat = ~out["Category"].isin(CATEGORIES)
    if bad_cat.any():
        raise ValueError(f"unknown Category values: {sorted(out.loc[bad_cat, 'Category'].unique())}")
    out["is_correct_answer"] = out["Category"].str.startswith("True_")
    out["category3"] = out["Category"].str.split("_", n=1).str[1]
    out["misconception"] = out["Misconception"].fillna("NA").astype(str).str.strip()
    out["target"] = out["Category"] + ":" + out["misconception"]
    out["prefix"] = out["is_correct_answer"].map({True: "True", False: "False"})

    # consistency: every (QuestionId, MC_Answer) must map to a single correctness prefix
    # (majority prefix per pair wins; minority rows are flagged as label noise, kept, and reported)
    per_ans = out.groupby(["QuestionId", "MC_Answer"])["is_correct_answer"].nunique()
    inconsistent_pairs = per_ans[per_ans > 1]
    majority = out.groupby(["QuestionId", "MC_Answer"])["is_correct_answer"].transform(lambda s: s.mean() >= 0.5)
    out["prefix_conflict"] = out["is_correct_answer"] != majority
    n_inconsistent_rows = int(out["prefix_conflict"].sum())
    # misconception must be NA iff category is not *_Misconception
    is_mis = out["category3"].eq("Misconception")
    label_mismatch = int(((out["misconception"] == "NA") == is_mis).sum())

    out["n_words_expl"] = out["StudentExplanation"].str.split().str.len().fillna(0).astype("int32")
    report = {
        "n_rows": int(len(out)),
        "n_questions": int(out["QuestionId"].nunique()),
        "n_targets": int(out["target"].nunique()),
        "n_misconception_labels": int(out.loc[is_mis, "misconception"].nunique()),
        "n_inconsistent_answer_pairs": int(len(inconsistent_pairs)),
        "n_rows_prefix_conflict": n_inconsistent_rows,
        "n_misconception_label_mismatch": label_mismatch,
        "n_empty_explanation": int((out["StudentExplanation"] == "").sum()),
    }
    cols = ["row_id", "QuestionId", *TEXT_COLS, "Category", "category3", "misconception", "target", "prefix",
            "is_correct_answer", "prefix_conflict", "n_words_expl", *[f"{c}_raw" for c in TEXT_COLS]]
    return out[cols].reset_index(drop=True), report


def build_candidates(df: pd.DataFrame) -> dict[str, list[str]]:
    """Targets ever observed for (QuestionId, correctness prefix). Used to mask model outputs (D-06)."""
    g = df.groupby(["QuestionId", "prefix"])["target"].agg(lambda s: sorted(set(s)))
    return {f"{q}|{p}": v for (q, p), v in g.items()}


def build_interim(raw_path: Path | None = None, out_dir: Path = INTERIM) -> dict:
    df, report = clean(load_raw(raw_path))
    out_dir.mkdir(parents=True, exist_ok=True)
    df.to_parquet(out_dir / "map.parquet", index=False)
    cands = build_candidates(df)
    (out_dir / "map_candidates.json").write_text(json.dumps(cands, indent=1))
    report["n_candidate_keys"] = len(cands)
    report["max_candidates"] = max(len(v) for v in cands.values())
    return report


if __name__ == "__main__":
    print(json.dumps(build_interim(), indent=2))
