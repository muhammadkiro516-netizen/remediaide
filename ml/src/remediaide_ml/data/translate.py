"""EN -> ID machine translation of MAP with math protection (docs/cac/02_DATA_SPEC.md §3, D-08, T32).

Math spans (LaTeX \\( ... \\), \\frac{a}{b}, a/b, decimals, integers, simple expressions) are replaced by
placeholders before translation and restored afterwards. Placeholders look like "ZQX0Z".
Text is sentence-split before translation (Marian drops trailing sentences of long inputs).

Run: python -m remediaide_ml.data.translate [--limit N] [--device mps|cpu]
Output: data/processed/map_id.parquet (row_id + *_id columns + placeholder diagnostics).
"""

from __future__ import annotations

import argparse
import re
import time

import pandas as pd

from remediaide_ml.paths import INTERIM, PROCESSED

MODEL_NAME = "Helsinki-NLP/opus-mt-en-id"

# Only spans Marian tends to break are protected: LaTeX and slash fractions. Plain numbers and simple
# expressions are copied reliably by the model and are checked afterwards (digit multiset check).
# Spans glued to letters ("2y", "8th") are left alone: placeholders inside words get mangled.
_MATH = re.compile(
    r"\\\(.*?\\\)"                                       # \( ... \)
    r"|\\frac\{[^{}]*\}\{[^{}]*\}"                         # \frac{a}{b}
    r"|\$[^$]+\$"                                          # $...$
    r"|(?<![A-Za-z\d])-?\d+(?:\.\d+)?\s*/\s*-?\d+(?:\.\d+)?(?![A-Za-z\d])"  # 3/5, 1 / 3
)
_SENT = re.compile(r"(?<=[.!?])\s+(?=\S)")
_DIGITS = re.compile(r"\d+(?:\.\d+)?")


def _digits(t: str) -> list[str]:
    """Number multiset, with Indonesian decimal comma normalised (0,6 == 0.6)."""
    return sorted(_DIGITS.findall(re.sub(r"(?<=\d),(?=\d)", ".", t)))
_PH = "ZQX{}Z"
_PH_RE = re.compile(r"Z\s*Q\s*X\s*(\d+)\s*Z", re.IGNORECASE)


def protect(text: str) -> tuple[str, list[str]]:
    spans: list[str] = []

    def sub(m: re.Match) -> str:
        spans.append(m.group(0))
        return _PH.format(len(spans) - 1)

    return _MATH.sub(sub, text), spans


def restore(text: str, spans: list[str]) -> tuple[str, int]:
    """Put spans back. Returns (text, n_missing) where n_missing = placeholders lost by the MT model."""
    found: set[int] = set()

    def sub(m: re.Match) -> str:
        i = int(m.group(1))
        if i < len(spans):
            found.add(i)
            return spans[i]
        return m.group(0)

    out = _PH_RE.sub(sub, text)
    return out, len(spans) - len(found)


class Translator:
    def __init__(self, device: str | None = None, batch_size: int = 32, num_beams: int = 4):
        import torch
        from transformers import MarianMTModel, MarianTokenizer

        if device is None:
            device = "mps" if torch.backends.mps.is_available() else "cpu"
        self.device = device
        self.tok = MarianTokenizer.from_pretrained(MODEL_NAME)
        self.model = MarianMTModel.from_pretrained(MODEL_NAME).to(device).eval()
        self.batch_size = batch_size
        self.num_beams = num_beams
        self.torch = torch

    def _raw(self, texts: list[str], greedy: bool = False) -> list[str]:
        out: list[str] = []
        kw = {"num_beams": 1, "no_repeat_ngram_size": 3} if greedy else {"num_beams": self.num_beams}
        for i in range(0, len(texts), self.batch_size):
            batch = texts[i : i + self.batch_size]
            enc = self.tok(batch, return_tensors="pt", padding=True, truncation=True, max_length=256).to(self.device)
            limit = min(256, int(enc["input_ids"].shape[1] * 2) + 10)
            with self.torch.no_grad():
                gen = self.model.generate(**enc, max_new_tokens=limit, **kw)
            out.extend(self.tok.batch_decode(gen, skip_special_tokens=True))
        return out

    def translate(self, texts: list[str]) -> pd.DataFrame:
        """Sentence-split, protect, translate, restore; retry unprotected if placeholders are lost.

        Returns columns: src, out, n_spans, n_retry, hallucination, digits_ok, unchanged.
        """
        segs: list[tuple[int, str, list[str]]] = []  # (text index, protected segment, spans)
        for i, t in enumerate(texts):
            for seg in _SENT.split(t) if t else []:
                p, spans = protect(seg)
                segs.append((i, p, spans))
        need = [k for k, (_, p, _) in enumerate(segs) if re.sub(r"ZQX\d+Z|[\W\d_]", "", p)]
        mt = [p for _, p, _ in segs]
        if need:
            for k, r in zip(need, self._raw([segs[k][1] for k in need]), strict=True):
                mt[k] = r
        restored, missing = [], []
        for (_, _, spans), m in zip(segs, mt, strict=True):
            o, miss = restore(m, spans)
            restored.append(o)
            missing.append(miss)
        retry = [k for k, miss in enumerate(missing) if miss > 0]
        if retry:  # fall back to translating the unprotected segment
            unprot = [restore(segs[k][1], segs[k][2])[0] for k in retry]
            for k, r in zip(retry, self._raw(unprot), strict=True):
                restored[k] = r
                missing[k] = 0
        # hallucination guard: opus-mt-en-id sometimes emits long unrelated (religious-corpus) text
        def too_long(k: int) -> bool:
            src = restore(segs[k][1], segs[k][2])[0]
            return len(restored[k]) > 2.5 * len(src) + 20
        halluc = [k for k in range(len(segs)) if too_long(k)]
        hall_final: set[int] = set()
        if halluc:
            unprot = [restore(segs[k][1], segs[k][2])[0] for k in halluc]
            for k, r in zip(halluc, self._raw(unprot, greedy=True), strict=True):
                restored[k] = r
                if too_long(k):  # still broken: keep source text, flag it
                    restored[k] = unprot[halluc.index(k)]
                    hall_final.add(k)
        per_text: dict[int, list[str]] = {}
        n_sp: dict[int, int] = {}
        for (i, _, spans), o in zip(segs, restored, strict=True):
            per_text.setdefault(i, []).append(o)
            n_sp[i] = n_sp.get(i, 0) + len(spans)
        rows = []
        for i, t in enumerate(texts):
            o = " ".join(per_text.get(i, []))
            rows.append({"src": t, "out": o, "n_spans": n_sp.get(i, 0), "n_retry": 0, "hallucination": False,
                         "digits_ok": _digits(t) == _digits(o),
                         "unchanged": bool(re.search(r"[A-Za-z]{3}", t)) and o.strip().lower() == t.strip().lower()})
        for k in set(retry) | set(halluc):
            rows[segs[k][0]]["n_retry"] += 1
        for k in hall_final:
            rows[segs[k][0]]["hallucination"] = True
        return pd.DataFrame(rows)


def translate_map(limit: int | None = None, device: str | None = None) -> pd.DataFrame:
    df = pd.read_parquet(INTERIM / "map.parquet")
    if limit:
        df = df.head(limit)
    tr = Translator(device=device)
    out = pd.DataFrame({"row_id": df.row_id.values})
    diag = {}
    for col in ("QuestionText", "MC_Answer", "StudentExplanation"):
        uniq = pd.unique(df[col])
        t0 = time.time()
        res = tr.translate(list(uniq))
        print(f"{col}: {len(uniq)} unique strings in {time.time() - t0:.0f}s on {tr.device}", flush=True)
        m_out = dict(zip(uniq, res.out, strict=True))
        out[f"{col}_id"] = df[col].map(m_out).values
        for d in ("digits_ok", "unchanged", "n_retry", "hallucination"):
            out[f"{col}_{d}"] = df[col].map(dict(zip(uniq, res[d], strict=True))).values
        diag[col] = {"unique": len(uniq), "digits_mismatch": int((~res.digits_ok).sum()),
                     "unchanged": int(res.unchanged.sum()), "segments_retried": int(res.n_retry.sum()),
                     "hallucination_kept_source": int(res.hallucination.sum())}
    print("diagnostics:", diag)
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--device", default=None)
    a = ap.parse_args()
    res = translate_map(a.limit, a.device)
    PROCESSED.mkdir(parents=True, exist_ok=True)
    name = "map_id.parquet" if a.limit is None else f"map_id_head{a.limit}.parquet"
    res.to_parquet(PROCESSED / name, index=False)
    print("written", PROCESSED / name, len(res))
