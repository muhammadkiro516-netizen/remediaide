"""Public dataset "RemediAide MAP-ID": MAP (MIT) + our Indonesian machine translation, for Hugging Face.

  python scripts/build_map_id_dataset.py [--out ../submission/hf_dataset_map_id] [--repo <user>/remediaide-map-id]
Files: train_id.csv (original MAP columns, unchanged, + Indonesian columns + automatic quality flags),
misconception_dictionary.csv (EN/ID), translation_qa.csv (100-sample manual QA), README.md (dataset card).
No Eedi data is included. The output folder is git-ignored (submission/).
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import pandas as pd

from remediaide_ml.paths import ML_ROOT, PROCESSED, REPO_ROOT, TABLES

FLAGS = ["digits_ok", "unchanged", "n_retry", "hallucination"]


def card(n_rows: int, n_q: int, qa: pd.Series, repo: str) -> str:
    return f"""---
license: mit
language:
- en
- id
task_categories:
- text-classification
tags:
- education
- mathematics
- misconceptions
- indonesian
- machine-translation
pretty_name: RemediAide MAP-ID (MAP terjemahan Bahasa Indonesia)
size_categories:
- 10K<n<100K
---

# RemediAide MAP-ID

Terjemahan Bahasa Indonesia dari dataset **MAP — Charting Student Math Misunderstandings** ({n_rows:,} alasan siswa,
{n_q} soal), dibuat untuk RemediAide 2.0 (CAC Machine Learning Solution Challenge 2026).

> **Peringatan.** Kolom `*_id` adalah **terjemahan mesin** (opus-mt-en-id), bukan tulisan asli siswa Indonesia. Pada QA
> manual 100 sampel berstrata: **{qa.get('ok', 0)} baik, {qa.get('minor', 0)} kesalahan kecil, {qa.get('major', 0)} kesalahan berat**
> (`translation_qa.csv`). Jangan memakai dataset ini sebagai bukti kinerja pada tulisan asli siswa Indonesia.

## Asal dan lisensi
- Data asli: *MAP — Charting Student Math Misunderstandings*, The Learning Agency LLC dan Vanderbilt University, Kaggle
  2025, lisensi **MIT** (https://www.kaggle.com/competitions/map-charting-student-math-misunderstandings; mirror
  https://huggingface.co/datasets/kaggle-map/data). Paper: Rittle-Johnson dkk. (2025), AIME-Con WIP
  (https://aclanthology.org/2025.aimecon-wip.3.pdf).
- Terjemahan ini: turunan, lisensi **MIT**. Model terjemahan Helsinki-NLP/opus-mt-en-id (Apache-2.0).
- Tidak memuat data Eedi atau data siswa Indonesia.

## Berkas
| Berkas | Isi |
| --- | --- |
| `train_id.csv` | kolom asli MAP **tanpa perubahan** (`row_id, QuestionId, QuestionText, MC_Answer, StudentExplanation, Category, Misconception`) + `QuestionText_id`, `MC_Answer_id`, `StudentExplanation_id` + penanda kualitas otomatis per kolom (`*_digits_ok`: semua angka terjaga; `*_unchanged`: teks tidak berubah; `*_n_retry`: jumlah ulang segmen; `*_hallucination`: penjaga halusinasi aktif) |
| `misconception_dictionary.csv` | 39 pasangan (label, soal) dengan topik dan deskripsi miskonsepsi EN/ID, beserta sumbernya |
| `translation_qa.csv` | QA manual 100 sampel: tingkat (ok/minor/major = baik/kecil/berat), jenis kesalahan, catatan |

## Metode terjemahan
opus-mt-en-id dengan empat pengaman: placeholder untuk ekspresi matematika (LaTeX, pecahan, angka), pemecahan per
kalimat, pengulangan segmen yang placeholder-nya hilang, dan penjaga halusinasi. Kode:
https://github.com/muhammadkiro516-netizen/remediaide (`ml/src/remediaide_ml/data/translate.py`, keputusan D-08).

## Cara mengutip
```
Tim RemediAide (Muhammad Salman Al Farisi, Lubna Maryam, Muhammad Farel Rizky). 2026.
RemediAide MAP-ID: terjemahan Bahasa Indonesia dari MAP — Charting Student Math Misunderstandings.
https://huggingface.co/datasets/{repo}
```
Kutip juga dataset asli MAP dan Rittle-Johnson dkk. (2025).
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=REPO_ROOT / "submission" / "hf_dataset_map_id")
    ap.add_argument("--repo", default="<username>/remediaide-map-id")
    a = ap.parse_args()
    raw = pd.read_csv(ML_ROOT / "data" / "raw" / "map" / "train.csv")
    tr = pd.read_parquet(PROCESSED / "map_id.parquet")
    keep = ["row_id"] + [f"{c}_{s}" for c in ("QuestionText", "MC_Answer", "StudentExplanation") for s in ["id", *FLAGS]]
    d = raw.merge(tr[keep], on="row_id", how="left", validate="one_to_one")
    assert d.StudentExplanation_id.notna().all(), "missing translations"
    assert len(d) == len(raw)
    if a.out.exists():
        shutil.rmtree(a.out)
    a.out.mkdir(parents=True)
    d.to_csv(a.out / "train_id.csv", index=False)
    shutil.copy2(TABLES / "map_misconception_dictionary.csv", a.out / "misconception_dictionary.csv")
    qa = pd.read_csv(TABLES / "translation_qa.csv")
    qa.to_csv(a.out / "translation_qa.csv", index=False)
    counts = qa.tingkat.value_counts().to_dict()
    (a.out / "README.md").write_text(card(len(d), d.QuestionId.nunique(), pd.Series(counts), a.repo))
    print({"out": str(a.out), "rows": len(d), "questions": int(d.QuestionId.nunique()), "qa": counts,
           "dictionary_rows": int(len(pd.read_csv(a.out / "misconception_dictionary.csv"))),
           "MB": round(sum(f.stat().st_size for f in a.out.iterdir()) / 1e6, 1)})


if __name__ == "__main__":
    main()
