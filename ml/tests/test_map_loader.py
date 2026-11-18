"""MAP loader tests on a tiny synthetic fixture (never real data)."""

import pandas as pd
import pytest

from remediaide_ml.data.map import build_candidates, clean, normalise_text


def _fixture() -> pd.DataFrame:
    rows = [
        (0, 1, "Q one", "\\( 6 \\)", "because  it is   6", "True_Correct", None),
        (1, 1, "Q one", "\\( 6 \\)", "I halved it", "True_Misconception", "Halve"),
        (2, 1, "Q one", "\\( 9 \\)", "added 3", "False_Misconception", "Additive"),
        (3, 1, "Q one", "\\( 9 \\)", "dunno", "False_Neither", None),
        (4, 1, "Q one", "\\( 9 \\)", "it is right", "True_Neither", None),   # label noise: 9 is wrong
        (5, 2, "Q two", "Likely", "close to 1", "True_Correct", None),
    ]
    return pd.DataFrame(rows, columns=["row_id", "QuestionId", "QuestionText", "MC_Answer", "StudentExplanation",
                                       "Category", "Misconception"])


def test_normalise_text():
    assert normalise_text("  a  b\n c ") == "a b c"
    assert normalise_text(None) == ""
    assert normalise_text(float("nan")) == ""


def test_clean_columns_and_targets():
    df, rep = clean(_fixture())
    assert df.loc[0, "StudentExplanation"] == "because it is 6"
    assert df.loc[0, "StudentExplanation_raw"] == "because  it is   6"
    assert df.loc[1, "target"] == "True_Misconception:Halve"
    assert df.loc[0, "target"] == "True_Correct:NA"
    assert list(df.category3[:4]) == ["Correct", "Misconception", "Misconception", "Neither"]
    assert rep["n_rows"] == 6 and rep["n_questions"] == 2
    assert rep["n_misconception_label_mismatch"] == 0


def test_prefix_conflict_flags_minority_only():
    df, rep = clean(_fixture())
    assert rep["n_inconsistent_answer_pairs"] == 1
    assert rep["n_rows_prefix_conflict"] == 1
    assert df.prefix_conflict.tolist() == [False, False, False, False, True, False]


def test_candidates_by_question_and_prefix():
    df, _ = clean(_fixture())
    c = build_candidates(df)
    assert c["1|True"] == ["True_Correct:NA", "True_Misconception:Halve", "True_Neither:NA"]
    assert c["1|False"] == ["False_Misconception:Additive", "False_Neither:NA"]
    assert c["2|True"] == ["True_Correct:NA"]


def test_unknown_category_raises():
    f = _fixture()
    f.loc[0, "Category"] = "Weird"
    with pytest.raises(ValueError):
        clean(f)
