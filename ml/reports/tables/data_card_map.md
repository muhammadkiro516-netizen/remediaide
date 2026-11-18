# Data card — MAP (Charting Student Math Misunderstandings)

Dihasilkan otomatis oleh `python -m remediaide_ml.data.map_card` dari `data/interim/map.parquet`.

## Ringkasan
- Baris: 36,696; soal: 15; target unik (Category:Misconception): 65
- Label miskonsepsi unik: 35 (pasangan soal×label: 39)
- Baris dengan konflik prefiks benar/salah vs jawaban (noise label, dipertahankan, ditandai `prefix_conflict`): 18 (0.049%)
- **True_Misconception (jebakan jawaban benar): 403 (1.10%)**
- Panjang alasan (kata): median 13, p90 26, maks 177

Catatan: paper dataset menyebut 27% alasan sintetis (parafrase Coedit-XL), tetapi file Kaggle tidak memberi penanda asli/sintetis, sehingga evaluasi terpisah tidak mungkin. Paper melaporkan 52.463 alasan; train.csv publik hanya memuat 36,696 baris (sisanya diduga test tersembunyi Kaggle).

## Per kategori

| Category | n | % |
| --- | ---: | ---: |
| True_Correct | 14,802 | 40.34% |
| False_Misconception | 9,457 | 25.77% |
| False_Neither | 6,542 | 17.83% |
| True_Neither | 5,265 | 14.35% |
| True_Misconception | 403 | 1.10% |
| False_Correct | 227 | 0.62% |

## Per soal

| QuestionId | n | % benar (MC) | % Misconception | % True_Misconception | label miskonsepsi |
| --- | ---: | ---: | ---: | ---: | --- |
| 31772 | 4,857 | 48.3% | 33.4% | 0.33% | Incomplete, WNB |
| 31774 | 3,115 | 61.6% | 20.4% | 0.64% | Mult, SwapDividend, FlipChange |
| 31777 | 2,809 | 64.0% | 13.9% | 0.00% | Wrong_Fraction, Incomplete, Irrelevant |
| 31778 | 3,640 | 48.4% | 39.1% | 3.46% | Additive, Irrelevant, WNB |
| 32829 | 2,156 | 79.6% | 12.6% | 0.05% | Not_variable, Adding_terms, Inverse_operation |
| 32833 | 3,105 | 51.6% | 36.2% | 0.35% | Duplication, Inversion, Wrong_Operation |
| 32835 | 2,332 | 71.8% | 17.1% | 0.81% | Whole_numbers_larger, Longer_is_bigger, Ignores_zeroes, Shorter_is_bigger |
| 33471 | 1,542 | 56.7% | 28.3% | 0.39% | Wrong_fraction, Incomplete |
| 33472 | 2,800 | 59.0% | 23.3% | 0.25% | Denominator-only_change, Adding_across, Incorrect_equivalent_fraction_addition |
| 33474 | 1,766 | 35.7% | 38.7% | 0.40% | Subtraction, Division |
| 76870 | 1,186 | 42.8% | 32.5% | 0.25% | Unknowable, Definition, Interior |
| 89443 | 3,054 | 45.6% | 28.0% | 5.37% | Positive, Tacking |
| 91695 | 2,610 | 59.3% | 25.5% | 0.73% | Wrong_term, Firstterm |
| 104665 | 673 | 73.8% | 17.7% | 0.59% | Multiplying_by_4, Base_rate |
| 109465 | 1,051 | 52.6% | 18.7% | 0.00% | Scale, Certainty |

## Contoh per kategori (baris pertama per kategori, row_id terkecil)

- **False_Correct** (Q31772, jawaban `\( \frac{3}{6} \)`, label `NA`): "Because 3 of 9 are not shaded as a simplified fraction it would be 1 3rd"
- **False_Misconception** (Q31772, jawaban `\( \frac{3}{6} \)`, label `WNB`): "3 IS SHADED AND 6 IS NOT"
- **False_Neither** (Q31772, jawaban `\( \frac{3}{6} \)`, label `NA`): "! simplefined it and that was what i got"
- **True_Correct** (Q31772, jawaban `\( \frac{1}{3} \)`, label `NA`): "0ne third is equal to tree nineth"
- **True_Misconception** (Q31772, jawaban `\( \frac{1}{3} \)`, label `Incomplete`): "3 out of 9 parts aren't shaded."
- **True_Neither** (Q31772, jawaban `\( \frac{1}{3} \)`, label `NA`): "1 3rd is half of 3 6th, so it is simplee to understand."
