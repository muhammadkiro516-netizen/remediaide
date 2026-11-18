"""Data card for MAP (T13) -> reports/tables/data_card_map.md. Numbers computed from data/interim/map.parquet."""

from __future__ import annotations

import json

import pandas as pd

from remediaide_ml.paths import INTERIM, TABLES


def build_card() -> str:
    df = pd.read_parquet(INTERIM / "map.parquet")
    n = len(df)
    lines = ["# Data card — MAP (Charting Student Math Misunderstandings)", "",
             "Dihasilkan otomatis oleh `python -m remediaide_ml.data.map_card` dari `data/interim/map.parquet`.", "",
             "## Ringkasan",
             f"- Baris: {n:,}; soal: {df.QuestionId.nunique()}; target unik (Category:Misconception): {df.target.nunique()}",
             f"- Label miskonsepsi unik: {df.loc[df.category3.eq('Misconception'), 'misconception'].nunique()} "
             f"(pasangan soal×label: {df.loc[df.category3.eq('Misconception'), ['QuestionId', 'misconception']].drop_duplicates().shape[0]})",
             f"- Baris dengan konflik prefiks benar/salah vs jawaban (noise label, dipertahankan, ditandai `prefix_conflict`): "
             f"{int(df.prefix_conflict.sum())} ({df.prefix_conflict.mean():.3%})",
             f"- **True_Misconception (jebakan jawaban benar): {int((df.Category == 'True_Misconception').sum()):,} "
             f"({(df.Category == 'True_Misconception').mean():.2%})**",
             f"- Panjang alasan (kata): median {df.n_words_expl.median():.0f}, p90 {df.n_words_expl.quantile(.9):.0f}, "
             f"maks {df.n_words_expl.max()}", "",
             "Catatan: paper dataset menyebut 27% alasan sintetis (parafrase Coedit-XL), tetapi file Kaggle tidak memberi "
             "penanda asli/sintetis, sehingga evaluasi terpisah tidak mungkin. Paper melaporkan 52.463 alasan; train.csv publik hanya memuat "
             f"{n:,} baris (sisanya diduga test tersembunyi Kaggle).", "",
             "## Per kategori", "", "| Category | n | % |", "| --- | ---: | ---: |"]
    for c, k in df.Category.value_counts().items():
        lines.append(f"| {c} | {k:,} | {k / n:.2%} |")
    lines += ["", "## Per soal", "", "| QuestionId | n | % benar (MC) | % Misconception | % True_Misconception | label miskonsepsi |",
              "| --- | ---: | ---: | ---: | ---: | --- |"]
    for q, s in df.groupby("QuestionId"):
        labs = ", ".join(s.loc[s.category3.eq("Misconception"), "misconception"].value_counts().index)
        lines.append(f"| {q} | {len(s):,} | {s.is_correct_answer.mean():.1%} | {s.category3.eq('Misconception').mean():.1%} | "
                     f"{s.Category.eq('True_Misconception').mean():.2%} | {labs} |")
    lines += ["", "## Contoh per kategori (baris pertama per kategori, row_id terkecil)", ""]
    for c in sorted(df.Category.unique()):
        r = df[df.Category == c].sort_values("row_id").iloc[0]
        lines.append(f"- **{c}** (Q{r.QuestionId}, jawaban `{r.MC_Answer}`, label `{r.misconception}`): "
                     f"\"{r.StudentExplanation[:160]}\"")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    TABLES.mkdir(parents=True, exist_ok=True)
    (TABLES / "data_card_map.md").write_text(build_card())
    cands = json.loads((INTERIM / "map_candidates.json").read_text())
    print("written; candidate keys:", len(cands))
