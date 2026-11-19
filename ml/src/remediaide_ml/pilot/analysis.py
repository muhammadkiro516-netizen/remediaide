"""T73-T75: pilot ingest, validation and analysis (06_PILOT_PROTOCOL §5-6). Runs as soon as the pilot CSVs exist.

Inputs
  export   research CSV from the app (`/api/sessions/:id/export/research`, columns RESEARCH_COLUMNS)
  labels   two teacher copies of labeling_sheet.xlsx (kode_label filled independently)
  preds    model predictions per (student_key, question_id) — produced by predict_rows() from the export
Outputs (real data only): reports/pilot/*. Synthetic runs are written to runs/<ts>_pilot_synthetic/ and stamped
SINTETIS; they are tests of the code, never results.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import cohen_kappa_score, f1_score, roc_auc_score

from remediaide_ml.seed import GLOBAL_SEED

RESEARCH_COLUMNS = ["student_key", "session_id", "question_id", "chosen_option", "is_correct", "cri", "response_time_ms",
                    "tau_min_ms", "explanation", "answered_at", "consent"]
NON_MISCONCEPTION = {"BENAR", "TIDAK_JELAS"}
PII_PATTERNS = {"email": r"[\w.+-]+@[\w-]+\.[\w.]+", "phone": r"(?:\+62|08)\d{8,12}", "nis": r"\bNIS\b|\bNISN\b"}


# ------------------------------------------------------------------ validation
def validate_export(df: pd.DataFrame, instrument: dict) -> dict:
    """Schema + privacy checks. Returns a report; `ok` is False if any hard check fails."""
    qids = {str(i["map_question_id"]) for i in instrument["items"]}
    expl_q = {str(i["map_question_id"]) for i in instrument["items"] if i["require_explanation"]}
    rep: dict = {"n_rows": len(df), "errors": [], "warnings": []}
    if list(df.columns) != RESEARCH_COLUMNS:
        rep["errors"].append(f"kolom tidak sesuai skema: {list(df.columns)}")
        rep["ok"] = False
        return rep
    checks = {
        "student_key bukan hex 24": ~df.student_key.astype(str).str.fullmatch(r"[0-9a-f]{24}"),
        "question_id di luar instrumen": ~df.question_id.astype(str).isin(qids),
        "chosen_option bukan A-D": ~df.chosen_option.astype(str).isin(list("ABCD")),
        "cri di luar 0..5": ~pd.to_numeric(df.cri, errors="coerce").between(0, 5),
        "response_time_ms <= 0": ~(pd.to_numeric(df.response_time_ms, errors="coerce") > 0),
        "consent bukan true": ~df.consent.astype(str).str.lower().eq("true"),
        "alasan > 280 karakter": df.explanation.fillna("").astype(str).str.len() > 280,
    }
    for name, bad in checks.items():
        if bad.any():
            rep["errors"].append(f"{name}: {int(bad.sum())} baris")
    dup = df.duplicated(["student_key", "question_id"]).sum()
    if dup:
        rep["errors"].append(f"duplikat (student_key, question_id): {int(dup)}")
    text = df.explanation.fillna("").astype(str)
    for name, pat in PII_PATTERNS.items():
        hit = text.str.contains(pat, regex=True, flags=re.I)
        if hit.any():
            rep["errors"].append(f"kemungkinan data pribadi ({name}) di alasan: {int(hit.sum())} baris — hapus sebelum analisis")
    has_expl = text.str.len() > 0
    rep["n_students"] = int(df.student_key.nunique())
    rep["n_explanations"] = int(has_expl.sum())
    rep["explanations_outside_key_questions"] = int((has_expl & ~df.question_id.astype(str).isin(expl_q)).sum())
    per = df.groupby("student_key").question_id.nunique()
    if (per < len(qids)).any():
        rep["warnings"].append(f"{int((per < len(qids)).sum())} siswa tidak menjawab semua soal")
    rep["ok"] = not rep["errors"]
    return rep


# ------------------------------------------------------------------ labeling sheets
def row_id(df: pd.DataFrame) -> pd.Series:
    return df.student_key.astype(str).str[:10] + "-" + df.question_id.astype(str)


def labeling_sample(df: pd.DataFrame, n_practice: int = 20, n_core: int = 200, seed: int = GLOBAL_SEED) -> pd.DataFrame:
    """Rows with an explanation, stratified by (question, correct): practice rows first, then core rows."""
    d = df[df.explanation.fillna("").astype(str).str.len() > 0].copy()
    d["id_baris"] = row_id(d)
    rng = np.random.default_rng(seed)
    d = d.iloc[rng.permutation(len(d))]
    d["_stratum"] = d.question_id.astype(str) + "|" + d.is_correct.astype(str)
    d["_rank"] = d.groupby("_stratum").cumcount()
    d = d.sort_values(["_rank", "_stratum"], kind="mergesort")  # round-robin over strata
    n = min(len(d), n_practice + n_core)
    out = d.head(n).copy()
    out["jenis"] = ["latihan"] * min(n, n_practice) + ["inti"] * max(0, n - n_practice)
    return out.drop(columns=["_stratum", "_rank"])


def fill_sheet(template: Path, sample: pd.DataFrame, instrument: dict, out: Path, seed: int) -> None:
    """Copy of the labeling sheet for one teacher; core rows shuffled per teacher (practice rows stay first)."""
    from openpyxl import load_workbook

    items = {str(i["map_question_id"]): i for i in instrument["items"]}
    rng = np.random.default_rng(seed)
    prac, core = sample[sample.jenis == "latihan"], sample[sample.jenis == "inti"]
    rows = pd.concat([prac, core.iloc[rng.permutation(len(core))]])
    wb = load_workbook(template)
    ws = wb["Label"]
    for r, x in enumerate(rows.itertuples(), 2):
        it = items[str(x.question_id)]
        opt = next(o["text_id"] for o in it["options"] if o["key"] == x.chosen_option)
        vals = {2: x.jenis, 3: int(x.question_id), 4: it["stem_id"], 5: f"{x.chosen_option}. {opt}",
                6: "ya" if str(x.is_correct).lower() == "true" else "tidak", 7: x.explanation, 10: x.id_baris}
        for c, v in vals.items():
            ws.cell(r, c, v)
    out.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out)


def read_labels(path: Path) -> pd.DataFrame:
    x = pd.read_excel(path, sheet_name="Label", dtype=str)
    x = x[x.id_baris.notna()].copy()
    x["kode"] = x.kode_label.fillna("").str.split(" — ").str[0].str.strip()
    return x[["id_baris", "jenis", "map_question_id", "kode", "catatan"]]


# ------------------------------------------------------------------ E9
def _boot(stat, n: int, clusters: np.ndarray, n_boot: int, seed: int = GLOBAL_SEED) -> tuple[float, float]:
    rng = np.random.default_rng(seed)
    uniq = np.unique(clusters)
    idx = {u: np.where(clusters == u)[0] for u in uniq}
    vals = []
    for _ in range(n_boot):
        r = np.concatenate([idx[u] for u in rng.choice(uniq, len(uniq))])
        try:
            v = stat(r)
        except ValueError:
            continue
        if np.isfinite(v):
            vals.append(v)
    return (float(np.quantile(vals, .025)), float(np.quantile(vals, .975))) if vals else (np.nan, np.nan)


def e9_agreement(a: pd.DataFrame, b: pd.DataFrame, n_boot: int = 1000) -> dict:
    """Cohen's kappa teacher A vs B on core rows (practice rows excluded), CI by student clusters."""
    m = a.merge(b, on="id_baris", suffixes=("_a", "_b"))
    m = m[(m.jenis_a == "inti") & (m.kode_a != "") & (m.kode_b != "")]
    ka, kb = m.kode_a.to_numpy(), m.kode_b.to_numpy()
    cl = m.id_baris.str.split("-").str[0].to_numpy()
    k = cohen_kappa_score(ka, kb)
    lo, hi = _boot(lambda r: cohen_kappa_score(ka[r], kb[r]), len(m), cl, n_boot)
    bin_a, bin_b = ~np.isin(ka, list(NON_MISCONCEPTION)), ~np.isin(kb, list(NON_MISCONCEPTION))
    kb_ = cohen_kappa_score(bin_a, bin_b)
    per_q = {q: float(cohen_kappa_score(g.kode_a, g.kode_b)) if g.kode_a.nunique() + g.kode_b.nunique() > 2 else None
             for q, g in m.groupby("map_question_id_a")}
    return {"n_core_rows": int(len(m)), "kappa_codes": float(k), "kappa_codes_ci": [lo, hi],
            "kappa_misconception_vs_not": float(kb_), "raw_agreement": float((ka == kb).mean()),
            "target": "kappa >= 0,61 (Landis & Koch 'substantial'; 06 §5)", "per_question": per_q}


def consensus(a: pd.DataFrame, b: pd.DataFrame, resolved: pd.DataFrame | None = None) -> pd.DataFrame:
    """Agreed codes; disagreements take the discussed code from `resolved` (id_baris, kode) when given, else dropped."""
    m = a.merge(b, on="id_baris", suffixes=("_a", "_b"))
    m["kode"] = np.where(m.kode_a == m.kode_b, m.kode_a, None)
    if resolved is not None:
        m = m.merge(resolved.rename(columns={"kode": "kode_r"}), on="id_baris", how="left")
        m["kode"] = m.kode.fillna(m.kode_r)
    return m[m.kode.notna() & (m.jenis_a == "inti")][["id_baris", "kode"]]


# ------------------------------------------------------------------ predictions
def predict_rows(export: pd.DataFrame, instrument: dict, bundle) -> pd.DataFrame:
    """Run L1, L2 and the naive-Bayes fusion on the pilot export (same code path as diagnose())."""
    from remediaide_ml.diagnose import _frame
    from remediaide_ml.features.history import add_history_features
    from remediaide_ml.l3.fusion import naive_bayes_fusion

    items = {str(i["map_question_id"]): i for i in instrument["items"]}
    payload = {"items": [{"question_id": q, "map_question_id": int(q), "question_text": it["stem_id"]}
                         for q, it in items.items()],
               "responses": [{"student_key": r.student_key, "question_id": str(r.question_id),
                              "chosen_option": r.chosen_option, "is_correct": str(r.is_correct).lower() == "true",
                              "cri": int(r.cri), "answered_at": r.answered_at, "response_time_ms": float(r.response_time_ms),
                              "tau_min_ms": float(r.tau_min_ms),
                              "explanation": r.explanation if isinstance(r.explanation, str) else "",
                              "chosen_option_text": next(o["text_id"] for o in items[str(r.question_id)]["options"]
                                                         if o["key"] == r.chosen_option)}
                             for r in export.itertuples()]}
    f = add_history_features(_frame(payload))
    f["item_diff_oof"], f["kc_diff_oof"], f["cur_option_share_oof"] = bundle.item_diff_default, bundle.kc_diff_default, 0.0
    p1 = bundle.l1.predict_quadrant(f)
    p2 = np.full((len(f), 3), np.nan)
    lab = np.array([None] * len(f), dtype=object)
    use = (f.explanation.str.len() > 0).to_numpy()
    if bundle.l2 is not None and use.any():
        out = bundle.l2.predict(f[use])
        p2[use], lab[use] = out["cat3"], out["misc_label"]
    fused = naive_bayes_fusion(p1, p2, bundle.mastery_prior)
    return pd.DataFrame({"student_key": f.UserId, "question_id": f.QuestionId.astype(str), "is_correct": f.IsCorrect,
                         "cri": f.cri.astype(int), "p1_M": p1[:, 2], "p1_notmastered": p1[:, 2] + p1[:, 3],
                         "p2_correct": p2[:, 0], "fused_notmastered": fused[:, 2] + fused[:, 3],
                         "l2_label": lab, "has_explanation": use})


# ------------------------------------------------------------------ fusion validation (teacher gold labels)
def fusion_validation(preds: pd.DataFrame, gold: pd.DataFrame, n_boot: int = 1000) -> pd.DataFrame:
    """Target: teacher says 'misconception' (code not in BENAR/TIDAK_JELAS; TIDAK_JELAS rows dropped).
    Scores: B0 rule (wrong + CRI >= 3, binary), L1 only, L2 only, naive-Bayes fusion (03 §3 (i)); AUC + F1@0.5."""
    p = preds.copy()
    p["id_baris"] = row_id(p)
    d = p.merge(gold, on="id_baris")
    d = d[d.kode != "TIDAK_JELAS"].reset_index(drop=True)
    y = (~d.kode.isin(list(NON_MISCONCEPTION))).astype(int).to_numpy()
    cl = d.student_key.to_numpy()
    scores = {"B0 aturan v1 (salah + CRI ≥ 3)": ((d.is_correct == 0) & (d.cri >= 3)).astype(float).to_numpy(),
              "L1 saja (p tidak tuntas)": d.p1_notmastered.to_numpy(),
              "L2 saja (1 − p Correct)": (1 - d.p2_correct).to_numpy(),
              "Fusi naive-Bayes": d.fused_notmastered.to_numpy()}
    rows = []
    for name, s in scores.items():
        ok = np.isfinite(s)
        yy, ss, cc = y[ok], s[ok], cl[ok]
        auc = roc_auc_score(yy, ss) if len(np.unique(yy)) == 2 else np.nan
        lo, hi = _boot(lambda r, yy=yy, ss=ss: roc_auc_score(yy[r], ss[r]), len(yy), cc, n_boot)
        rows.append({"model": name, "n": int(ok.sum()), "auc": auc, "auc_lo": lo, "auc_hi": hi,
                     "f1_at_0_5": f1_score(yy, ss >= 0.5)})
    return pd.DataFrame(rows)


def model_vs_teacher(preds: pd.DataFrame, gold: pd.DataFrame, dictionary_labels: set[str]) -> dict:
    """Kappa of the L2 label (mapped to rubric codes) vs teacher consensus."""
    p = preds[preds.has_explanation].copy()
    p["id_baris"] = row_id(p)
    d = p.merge(gold, on="id_baris")

    def code(r):
        if r.l2_label in dictionary_labels:
            return r.l2_label
        return "BENAR" if r.is_correct == 1 else "TIDAK_JELAS"

    m = d.apply(code, axis=1)
    return {"n": int(len(d)), "kappa_codes": float(cohen_kappa_score(d.kode, m)) if len(d) else None,
            "raw_agreement": float((d.kode == m).mean()) if len(d) else None}


# ------------------------------------------------------------------ guard with real response times
def guard_real(export: pd.DataFrame, instrument: dict) -> dict:
    from remediaide_ml.guard.rapid_guess import agreement, evaluate_flags, flag, gmm_thresholds, nt_thresholds

    items = {str(i["map_question_id"]): i for i in instrument["items"]}
    words = {q: len(re.findall(r"\w+", it["stem_id"] + " " + " ".join(o["text_id"] for o in it["options"])))
             for q, it in items.items()}
    d = pd.DataFrame({"item_id": export.question_id.astype(str), "rt_ms": export.response_time_ms.astype(float),
                      "is_correct": export.is_correct.astype(str).str.lower().eq("true").astype(int)})
    d["n_words"] = d.item_id.map(words)
    flags = {f"NT{p}": flag(d, nt_thresholds(d, p / 100)) for p in (10, 20, 30)}
    flags["GMM"] = flag(d, gmm_thresholds(d))
    flags["τmin B0 (aplikasi)"] = d.rt_ms < export.tau_min_ms.astype(float)
    flags["2,5 kata/detik"] = d.rt_ms < d.n_words / 2.5 * 1000
    ev = evaluate_flags(d, flags)
    return {"evaluation": ev.to_dict(orient="records"), "kappa_between_methods": agreement(flags).round(4).to_dict(),
            "note": "Tanpa label tebakan; akurasi jawaban yang ditandai mendekati 25% = indikasi tebakan (4 opsi)."}


# ------------------------------------------------------------------ synthetic data (tests only)
def synthetic_export(instrument: dict, n_students: int = 60, seed: int = 0) -> pd.DataFrame:
    """Fake export with the real schema. NEVER a result: student keys are random, answers simulated."""
    rng = np.random.default_rng(seed)
    rows = []
    t0 = pd.Timestamp("2026-12-01T08:00:00Z")
    for s in range(n_students):
        sk = "".join(rng.choice(list("0123456789abcdef"), 24))
        ability = rng.normal()
        for j, it in enumerate(instrument["items"]):
            guess = rng.random() < 0.08
            p = 0.25 if guess else 1 / (1 + np.exp(-(ability + 0.3)))
            correct = rng.random() < p
            key = it["correct_key"] if correct else rng.choice([o["key"] for o in it["options"] if not o["is_correct"]])
            expl = ""
            if it["require_explanation"]:
                expl = rng.choice(["karena dikali dulu baru dibagi", "saya menyamakan penyebutnya", "angkanya lebih besar",
                                   "tidak tahu", "karena hasilnya sama dengan soal sebelumnya"])
            rows.append({"student_key": sk, "session_id": "0" * 16, "question_id": str(it["map_question_id"]),
                         "chosen_option": key, "is_correct": bool(correct), "cri": int(rng.integers(0, 6)),
                         "response_time_ms": int(rng.uniform(800, 2500) if guess else rng.lognormal(np.log(25000), 0.4)),
                         "tau_min_ms": 8000, "explanation": expl,
                         "answered_at": (t0 + pd.Timedelta(seconds=60 * j + s)).isoformat(), "consent": True})
    return pd.DataFrame(rows, columns=RESEARCH_COLUMNS)


def synthetic_labels(sample: pd.DataFrame, codes_by_q: dict[str, list[str]], agree: float, seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    base = [rng.choice(codes_by_q[str(q)]) for q in sample.question_id]
    out = []
    for b, q in zip(base, sample.question_id, strict=True):
        out.append(b if rng.random() < agree else rng.choice(codes_by_q[str(q)]))
    return pd.DataFrame({"id_baris": sample.id_baris.to_numpy(), "jenis": sample.jenis.to_numpy(),
                         "map_question_id": sample.question_id.astype(str).to_numpy(), "kode": out, "catatan": ""})


def write_json(obj, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2, default=float))
