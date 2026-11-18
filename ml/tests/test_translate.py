"""Math protection for MT (no model needed)."""

from remediaide_ml.data.translate import _digits, protect, restore


def test_protect_latex_and_fractions_roundtrip():
    t = r"Calculate \( \frac{1}{2} \div 6 \) so 1/12 or 3 / 4 and \frac{2}{3}"
    p, spans = protect(t)
    assert spans == [r"\( \frac{1}{2} \div 6 \)", "1/12", "3 / 4", r"\frac{2}{3}"]
    assert "ZQX0Z" in p and "\\(" not in p
    out, miss = restore(p, spans)
    assert out == t and miss == 0


def test_glued_numbers_not_protected():
    p, spans = protect("2y means 2 times y and 1/8th")
    assert spans == []


def test_restore_tolerates_spacing_and_reports_missing():
    out, miss = restore("hasil Z QX 1 Z dan", ["a/b", "c/d"])
    assert out == "hasil c/d dan" and miss == 1


def test_digits_decimal_comma():
    assert _digits("0.6 dan 3") == _digits("0,6 and 3")
