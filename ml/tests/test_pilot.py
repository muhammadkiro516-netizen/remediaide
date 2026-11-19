"""T70-T75: pilot instrument + analysis code (synthetic data only; no pilot data exists in the repo)."""

import json

import numpy as np
import pandas as pd
import pytest

from remediaide_ml.paths import REPO_ROOT
from remediaide_ml.pilot import analysis as A

PILOT = REPO_ROOT / "docs" / "cac" / "pilot"


@pytest.fixture(scope="module")
def inst():
    return json.loads((PILOT / "instrument_map_id.json").read_text())


def test_instrument_shape(inst):
    items = inst["items"]
    assert len(items) == 15
    assert len({i["map_question_id"] for i in items}) == 15
    for it in items:
        assert [o["key"] for o in it["options"]] == list("ABCD")
        assert sum(o["is_correct"] for o in it["options"]) == 1
        assert it["correct_key"] == next(o["key"] for o in it["options"] if o["is_correct"])
        assert it["stem_id"] and "\\(" not in it["stem_id"]  # plain text, no LaTeX
        if it["figure"]:
            assert (PILOT / "figures" / it["figure"]).read_text().startswith("<svg")
            assert it["needs_teacher_check"]
    assert sum(i["require_explanation"] for i in items) == 5


def test_validate_export(inst):
    ex = A.synthetic_export(inst, n_students=10)
    assert A.validate_export(ex, inst)["ok"]
    bad = ex.copy()
    bad.loc[0, "explanation"] = "hubungi saya di siswa@contoh.com"
    assert not A.validate_export(bad, inst)["ok"]
    assert not A.validate_export(ex.drop(columns=["consent"]), inst)["ok"]
    dup = pd.concat([ex, ex.head(1)])
    assert any("duplikat" in e for e in A.validate_export(dup, inst)["errors"])


def test_labeling_sample_and_sheet_roundtrip(inst, tmp_path):
    pytest.importorskip("openpyxl")
    ex = A.synthetic_export(inst, n_students=60)
    s = A.labeling_sample(ex)
    assert len(s) == 220 and (s.jenis == "latihan").sum() == 20
    assert s.id_baris.is_unique
    out = tmp_path / "guru_A.xlsx"
    A.fill_sheet(PILOT / "labeling_sheet.xlsx", s, inst, out, seed=1)
    from openpyxl import load_workbook

    wb = load_workbook(out)
    ws = wb["Label"]
    for r in range(2, 222):
        ws.cell(r, 8, "BENAR — Benar dengan nalar benar")
    wb.save(out)
    lab = A.read_labels(out)
    assert len(lab) == 220 and set(lab.kode) == {"BENAR"}
    assert set(lab.id_baris) == set(s.id_baris)


def test_e9_agreement_perfect_and_consensus(inst):
    ex = A.synthetic_export(inst, n_students=60)
    s = A.labeling_sample(ex)
    codes = {str(i["map_question_id"]): ["BENAR", "TIDAK_JELAS", "LAIN", "X"] for i in inst["items"]}
    la = A.synthetic_labels(s, codes, agree=1.0, seed=1)
    r = A.e9_agreement(la, la.copy(), n_boot=50)
    assert r["kappa_codes"] == pytest.approx(1.0) and r["n_core_rows"] == 200
    assert len(A.consensus(la, la.copy())) == 200


class _StubL1:
    def predict_quadrant(self, X):
        p = np.full((len(X), 4), 0.25)
        return p

    def explain(self, X):
        return [[] for _ in range(len(X))]


class _StubL2:
    def predict(self, rows):
        n = len(rows)
        return {"cat3": np.tile([0.5, 0.3, 0.2], (n, 1)), "misc_label": np.array(["NA"] * n, dtype=object),
                "misc_prob": np.zeros(n), "p_true_misc": np.zeros(n)}


def test_predict_rows_and_fusion(inst):
    from remediaide_ml.diagnose import Bundle

    ex = A.synthetic_export(inst, n_students=12)
    b = Bundle(l1=_StubL1(), l2=_StubL2(), lac_qhat=0.8, defer_threshold=0.5, hidden_threshold=0.2, mastery_prior=0.5)
    p = A.predict_rows(ex, inst, b)
    assert len(p) == len(ex)
    assert np.allclose(p.p1_notmastered, 0.5)
    has = p.has_explanation.to_numpy()
    assert has.sum() == (ex.explanation.str.len() > 0).sum()
    # with p2(Correct) = 0.5 and prior 0.5, the naive-Bayes fusion leaves L1 unchanged
    assert np.allclose(p.fused_notmastered[has], 0.5)


def test_guard_real_runs(inst):
    pytest.importorskip("sklearn")
    ex = A.synthetic_export(inst, n_students=40)
    g = A.guard_real(ex, inst)
    names = {r["method"] for r in g["evaluation"]}
    assert {"NT10", "GMM", "τmin B0 (aplikasi)", "2,5 kata/detik"} <= names
