# Data card — Eedi NeurIPS 2020, Task 3&4

Dihasilkan otomatis oleh `python -m remediaide_ml.data.eedi_card` dari `data/interim/eedi_t34.parquet`.
Lisensi: CC BY-NC-ND 4.0 (data olahan tidak dibagikan; hanya skrip).

## Ringkasan
- Baris mentah train_task_3_4: 1,382,727; duplikat AnswerId dibuang: 0; tidak konsisten IsCorrect dibuang: 0
- Baris bersih: 1,382,727; siswa: 4,918; soal: 948; KC (SubjectId terdalam): 57; baris tanpa KC: 0
- Baris tanpa answer metadata: 0
- Rentang tanggal: 2019-09-06 14:05:00 s.d. 2020-05-01 08:33:00
- Akurasi rata-rata (IsCorrect): 0.5373
- **Confidence kosong: 74.95% baris**; per siswa median 90.53%, siswa tanpa confidence sama sekali: 12.89%
- Panjang sekuens per siswa: median 239, p90 555, maks 827
- Percobaan ulang (attempt_no > 1): 0.00% baris

## Distribusi Confidence (baris yang terisi)

| Confidence | n | % | CRI (D-03) |
| ---: | ---: | ---: | ---: |
| 0 | 28,733 | 8.29% | 0 |
| 25 | 17,405 | 5.02% | 1 |
| 50 | 53,043 | 15.31% | 3 |
| 75 | 87,778 | 25.34% | 4 |
| 100 | 159,469 | 46.03% | 5 |

Nilai unik Confidence: 5

## CRI dan kuadran B0 (baris berkeyakinan)

- P (benar, yakin): 199,120 (57.48%)
- L (benar, tidak yakin): 16,361 (4.72%)
- M (salah, yakin): 101,170 (29.20%)
- T (salah, tidak yakin): 29,777 (8.60%)

## Atribut siswa (hanya untuk analisis fairness, bukan fitur)

| Gender | siswa | % |
| --- | ---: | ---: |
| 0 | 1,874 | 38.10% |
| 1 | 1,524 | 30.99% |
| 2 | 1,513 | 30.76% |
| 3 | 7 | 0.14% |

| PremiumPupil | siswa | % |
| --- | ---: | ---: |
| 0.0 | 1,512 | 30.74% |
| 1.0 | 601 | 12.22% |
| <NA> | 2,805 | 57.04% |

Kode Gender (panduan data Eedi): 0 tidak disebut, 1 perempuan, 2 laki-laki, 3 lainnya.
