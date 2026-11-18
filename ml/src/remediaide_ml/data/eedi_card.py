"""Data card for Eedi Task 3&4 (T12) -> reports/tables/data_card_eedi.md (numbers computed, never typed)."""

from __future__ import annotations

import json

import pandas as pd

from remediaide_ml.paths import INTERIM, TABLES


def build_card() -> str:
    df = pd.read_parquet(INTERIM / "eedi_t34.parquet")
    rep = json.loads((INTERIM / "eedi_t34_report.json").read_text())
    n = len(df)
    per_user_missing = 1 - df.groupby("UserId").has_conf.mean()
    seq = df.groupby("UserId").size()
    conf = df.Confidence.dropna()
    L = ["# Data card — Eedi NeurIPS 2020, Task 3&4", "",
         "Dihasilkan otomatis oleh `python -m remediaide_ml.data.eedi_card` dari `data/interim/eedi_t34.parquet`.",
         "Lisensi: CC BY-NC-ND 4.0 (data olahan tidak dibagikan; hanya skrip).", "",
         "## Ringkasan",
         f"- Baris mentah train_task_3_4: {rep['n_train_raw']:,}; duplikat AnswerId dibuang: {rep['n_dup_answerid_dropped']:,}; "
         f"tidak konsisten IsCorrect dibuang: {rep['n_inconsistent_iscorrect_dropped']:,}",
         f"- Baris bersih: {n:,}; siswa: {df.UserId.nunique():,}; soal: {df.QuestionId.nunique():,}; KC (SubjectId terdalam): "
         f"{df.kc.nunique():,}; baris tanpa KC: {int(df.kc.isna().sum()):,}",
         f"- Baris tanpa answer metadata: {rep['n_missing_answer_meta']:,}",
         f"- Rentang tanggal: {df.DateAnswered.min()} s.d. {df.DateAnswered.max()}",
         f"- Akurasi rata-rata (IsCorrect): {df.IsCorrect.mean():.4f}",
         f"- **Confidence kosong: {1 - df.has_conf.mean():.2%} baris**; per siswa median {per_user_missing.median():.2%}, "
         f"siswa tanpa confidence sama sekali: {(per_user_missing == 1).mean():.2%}",
         f"- Panjang sekuens per siswa: median {seq.median():.0f}, p90 {seq.quantile(.9):.0f}, maks {seq.max():,}",
         f"- Percobaan ulang (attempt_no > 1): {(df.attempt_no > 1).mean():.2%} baris", "",
         "## Distribusi Confidence (baris yang terisi)", "", "| Confidence | n | % | CRI (D-03) |", "| ---: | ---: | ---: | ---: |"]
    vc = conf.value_counts().sort_index()
    if len(vc) <= 25:
        for v, k in vc.items():
            L.append(f"| {v:g} | {k:,} | {k / len(conf):.2%} | {int(min(5, (v + 10) // 20))} |")
    else:
        for v, k in pd.cut(conf, [-0.1, 9.99, 29.99, 49.99, 69.99, 89.99, 100]).value_counts().sort_index().items():
            L.append(f"| {v} | {k:,} | {k / len(conf):.2%} | |")
    L += ["", f"Nilai unik Confidence: {conf.nunique()}", "", "## CRI dan kuadran B0 (baris berkeyakinan)", ""]
    sub = df[df.has_conf]
    hi = sub.cri >= 3
    c = sub.IsCorrect == 1
    for name, m in [("P (benar, yakin)", c & hi), ("L (benar, tidak yakin)", c & ~hi), ("M (salah, yakin)", ~c & hi),
                    ("T (salah, tidak yakin)", ~c & ~hi)]:
        L.append(f"- {name}: {int(m.sum()):,} ({m.mean():.2%})")
    L += ["", "## Atribut siswa (hanya untuk analisis fairness, bukan fitur)", "", "| Gender | siswa | % |", "| --- | ---: | ---: |"]
    st = df.drop_duplicates("UserId")
    for v, k in st.Gender.value_counts(dropna=False).sort_index().items():
        L.append(f"| {v} | {k:,} | {k / len(st):.2%} |")
    L += ["", "| PremiumPupil | siswa | % |", "| --- | ---: | ---: |"]
    for v, k in st.PremiumPupil.value_counts(dropna=False).sort_index().items():
        L.append(f"| {v} | {k:,} | {k / len(st):.2%} |")
    L += ["", "Kode Gender (panduan data Eedi): 0 tidak disebut, 1 perempuan, 2 laki-laki, 3 lainnya."]
    return "\n".join(L) + "\n"


if __name__ == "__main__":
    TABLES.mkdir(parents=True, exist_ok=True)
    (TABLES / "data_card_eedi.md").write_text(build_card())
    print("written", TABLES / "data_card_eedi.md")
