"""T53 / 07 §3: every number in the judge-facing documents must come from reports/ (golden rule 1).

  python scripts/check_numbers.py [--verbose]
Documents: README.md, REPORT.md, MODEL_CARD.md, DATA_CARD.md. Sources: reports/RESULTS.md, reports/*.md,
reports/tables/* (csv/json/md), data/manifest.json, models/l3_conformal_v1.json, configs/base.yaml and the
protocol constants in scripts/number_whitelist.txt (each with a reason).
A document number with d decimals matches a source value v if round(v, d) == x, or as a percentage
(round(100 v, d) == x). Integers match exactly (Indonesian thousands separators allowed). URLs, code spans, paths,
citation markers [n] and section signs are ignored. Exit 1 if any number is unmatched.
"""

from __future__ import annotations

import argparse
import json
import re
import sys

from remediaide_ml.paths import ML_ROOT, MODELS, REPORTS, TABLES

DOCS = ["README.md", "REPORT.md", "MODEL_CARD.md", "DATA_CARD.md"]
NUM_DOC = re.compile(r"(?<![\w.,/#-])[-−+]?\d{1,3}(?:\.\d{3})+(?:,\d+)?(?![\w])|(?<![\w.,/#-])[-−+]?\d+(?:,\d+)?(?![\w])")
NUM_SRC = re.compile(r"-?\d+(?:\.\d+)?(?:e-?\d+)?")


def strip(text: str) -> str:
    text = re.sub(r"```.*?```", " ", text, flags=re.S)       # code blocks
    text = re.sub(r"`[^`]*`", " ", text)                      # code spans / paths
    text = re.sub(r"https?://\S+", " ", text)                 # URLs
    text = re.sub(r"\]\([^)]*\)", "] ", text)                 # markdown link targets
    text = re.sub(r"\[\d+\]", " ", text)                      # citation markers
    text = re.sub(r"arXiv:\S+|aclanthology \S+", " ", text)
    text = re.sub(r"\b(?:D|E|T|M|RQ|S|B|L|NT)-?\d+[a-z]?\b", " ", text)  # ids: D-18, E8, T47, RQ1, S3, B0, L2, NT10
    text = re.sub(r"§\s?\d+(?:\.\d+)?", " ", text)
    text = re.sub(r"\b\d+\.\d+(?:\.\d+)?\s", " ", text)       # heading numbers like 2.4
    text = re.sub(r"\b(?:19|20)\d{2}\b", " ", text)           # years
    text = re.sub(r"\b\d{1,2} (?:Jan|Feb|Mar|Apr|Mei|Jun|Jul|Agu|Sep|Okt|Nov|Des)\w*", " ", text)  # dates
    return text


def parse_doc_number(tok: str) -> tuple[float, int]:
    t = tok.replace("−", "-").replace("+", "")
    if re.fullmatch(r"-?\d{1,3}(?:\.\d{3})+(?:,\d+)?", t):
        t = t.replace(".", "")
    dec = len(t.split(",")[1]) if "," in t else 0
    return float(t.replace(",", ".")), dec


def source_values() -> list[float]:
    vals: list[float] = []
    files = [REPORTS / "RESULTS.md", *REPORTS.glob("*.md"), *TABLES.glob("*"), ML_ROOT / "data" / "manifest.json",
             MODELS / "l3_conformal_v1.json", ML_ROOT / "configs" / "base.yaml"]
    for f in files:
        if not f.is_file():
            continue
        txt = f.read_text(errors="ignore")
        if f.suffix == ".md":  # Indonesian formatting in markdown sources
            txt = re.sub(r"(\d)\.(\d{3})(?!\d)", r"\1\2", txt)
            txt = re.sub(r"(\d),(\d)", r"\1.\2", txt)
        else:
            txt = re.sub(r"(\d),(\d{3})(?!\d)", r"\1\2", txt)  # 1,382,727 in generated md/csv
        vals += [float(x) for x in NUM_SRC.findall(txt)]
    wl = ML_ROOT / "scripts" / "number_whitelist.txt"
    for line in wl.read_text().splitlines():
        if line.strip() and not line.startswith("#"):
            vals.append(float(line.split("#")[0].strip()))
    return vals


def build_index(vals) -> dict[int, set]:
    """dec -> set of rounded candidates (value, negation, x100 percentage)."""
    import math

    idx: dict[int, set] = {d: set() for d in range(0, 5)}
    for v in vals:
        if not math.isfinite(v) or abs(v) > 1e12:
            continue
        for cand in (v, -v, 100 * v, -100 * v):
            for d in range(1, 5):
                idx[d].add(round(cand, d))
            if abs(cand - round(cand)) < 1e-6:
                idx[0].add(round(cand))
    return idx


def matches(x: float, dec: int, idx) -> bool:
    return (round(x) in idx[0]) if dec == 0 else (round(x, dec) in idx[min(dec, 4)])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--verbose", action="store_true")
    a = ap.parse_args()
    vals = build_index(source_values())
    small = {0, 1, 2, 3, 4, 5}  # counts like "3 lapis", "5 seed", "2 lapis" are structural, not results
    bad = []
    for d in DOCS:
        p = ML_ROOT / d
        for ln, line in enumerate(strip(p.read_text()).splitlines(), 1):
            for tok in NUM_DOC.findall(line):
                x, dec = parse_doc_number(tok)
                if dec == 0 and abs(x) in small:
                    continue
                if not matches(x, dec, vals):
                    bad.append((d, ln, tok, line.strip()[:110]))
    for b in bad:
        print(f"{b[0]}:{b[1]}  {b[2]!r}  | {b[3]}")
    print(f"{len(bad)} number(s) without a source")
    (ML_ROOT / "runs").mkdir(exist_ok=True)
    (ML_ROOT / "runs" / "check_numbers.json").write_text(json.dumps(bad, indent=1, ensure_ascii=False))
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
