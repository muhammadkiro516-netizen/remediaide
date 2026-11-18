"""Eedi loader tests on a synthetic fixture (never real data)."""

import pandas as pd

from remediaide_ml.cri_rule import confidence_to_cri
from remediaide_ml.data.eedi import clean, confidence_to_cri_vec


def _raw():
    train = pd.DataFrame({
        "QuestionId": [10, 11, 10, 10, 11, 11],
        "UserId":     [1, 1, 1, 2, 2, 2],
        "AnswerId":   [100, 101, 102, 103, 104, 104],      # 104 duplicated -> dropped
        "IsCorrect":  [1, 0, 1, 0, 1, 1],
        "CorrectAnswer": [2, 3, 2, 2, 1, 1],
        "AnswerValue":   [2, 1, 2, 4, 1, 1],
    })
    # add one inconsistent row (IsCorrect says 1 but answer differs)
    train.loc[len(train)] = [10, 3, 105, 1, 2, 3]
    answer = pd.DataFrame({
        "AnswerId": [100, 101, 102, 103, 104, 105],
        "DateAnswered": ["2020-01-03 10:00", "2020-01-01 09:00", "2020-01-05 10:00", "2020-02-01", "2020-01-01", "2020-01-01"],
        "Confidence": [75.0, None, 50.0, 49.0, 100.0, 0.0],
        "GroupId": [1] * 6, "QuizId": [7] * 6, "SchemeOfWorkId": [3] * 6,
    })
    question = pd.DataFrame({"QuestionId": [10, 11], "SubjectId": ["[3, 71, 98, 209]", "[3, 49]"]})
    student = pd.DataFrame({"UserId": [1, 2, 3], "Gender": [1, 2, 0], "DateOfBirth": ["2008-01-01", None, None],
                            "PremiumPupil": [0.0, 1.0, None]})
    subject = pd.DataFrame({"SubjectId": [3, 71, 98, 209, 49], "Name": list("abcde"),
                            "ParentId": [None, 3, 71, 98, 3], "Level": [0, 1, 2, 3, 1]})
    return {"train": train, "answer": answer, "question": question, "student": student, "subject": subject}


def test_vector_cri_matches_scalar_b0():
    vals = pd.Series([0, 9, 10, 29, 30, 49, 50, 69, 70, 89, 90, 100, None, -5, 120], dtype="float64")
    vec = confidence_to_cri_vec(vals)
    for v, c in zip(vals, vec, strict=True):
        exp = confidence_to_cri(None if pd.isna(v) else v)
        assert (pd.isna(c) and exp is None) or int(c) == exp


def test_clean_drops_dups_and_inconsistent():
    df, rep = clean(_raw())
    assert rep["n_dup_answerid_dropped"] == 1
    assert rep["n_inconsistent_iscorrect_dropped"] == 1
    assert len(df) == 5 and set(df.UserId) == {1, 2}


def test_order_attempts_kc():
    df, _ = clean(_raw())
    u1 = df[df.UserId == 1]
    assert u1.AnswerId.tolist() == [101, 100, 102]          # sorted by DateAnswered
    assert u1.attempt_no.tolist() == [1, 1, 2]              # Q10 answered twice
    assert u1.seq_pos.tolist() == [0, 1, 2]
    assert df.set_index("QuestionId").kc.groupby(level=0).first().to_dict() == {10: 209, 11: 49}
    assert int(df[df.QuestionId == 10].kc_l2.iloc[0]) == 98


def test_cri_and_missing_conf():
    df, _ = clean(_raw())
    d = df.set_index("AnswerId")
    assert int(d.loc[100, "cri"]) == 4 and int(d.loc[102, "cri"]) == 3 and int(d.loc[103, "cri"]) == 2
    assert pd.isna(d.loc[101, "cri"]) and not d.loc[101, "has_conf"]
