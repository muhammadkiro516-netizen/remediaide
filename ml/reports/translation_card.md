# Kartu terjemahan — MAP Inggris → Indonesia (T32)

| Item | Nilai |
| --- | --- |
| Model | Helsinki-NLP/opus-mt-en-id (Apache-2.0), beam 4, batch 32, MPS (D-08) |
| Kode | `src/remediaide_ml/data/translate.py`, run `20261118-2129_translate_map` |
| Output | `data/processed/map_id.parquet` (36.696 baris; tidak di-commit) |
| Waktu | 35.668 alasan unik dalam 2.744 detik (~13 alasan/detik) |

## Prosedur
1. Teks dipecah per kalimat (Marian membuang kalimat akhir pada input panjang; ditemukan saat uji 20 contoh).
2. LaTeX (`\( … \)`, `\frac{a}{b}`, `$…$`) dan pecahan `a/b` diganti placeholder `ZQX<n>Z`, lalu dikembalikan.
   Angka yang menempel ke huruf (`2y`, `8th`) tidak dilindungi karena placeholder di dalam kata rusak.
3. Placeholder hilang → segmen diterjemahkan ulang tanpa proteksi (326 segmen).
4. Pengaman halusinasi: output > 2,5× panjang sumber + 20 karakter → ulang greedy + no_repeat_ngram=3; jika masih,
   teks sumber dipertahankan dan ditandai. opus-mt-en-id kadang menghasilkan teks keagamaan panjang yang tak terkait
   (ditemukan pada soal 31772).

## Diagnostik otomatis (seluruh data, per string unik)
| Kolom | Unik | Angka tidak cocok | Tidak berubah | Segmen diulang | Halusinasi (sumber dipertahankan) |
| --- | ---: | ---: | ---: | ---: | ---: |
| QuestionText | 15 | 0 | 1 | 1 | 1 |
| MC_Answer | 49 | 0 | 21 | 0 | 0 |
| StudentExplanation | 35.668 | 845 (2,4%) | 246 (0,7%) | 326 | 18 (0,05%) |

## QA manual — 100 sampel acak berstrata per kategori (seed 20261118)
Sumber: `reports/tables/translation_qa.csv` (EN, ID, tingkat, jenis kesalahan, catatan per sampel). Penilai: Claude Code.
Rubrik: makna penalaran terjaga, matematika utuh, bahasa wajar. **Berat** = guru atau model bisa salah membaca penalaran.

| Tingkat | n |
| --- | ---: |
| Baik | 46 |
| Kesalahan kecil | 34 |
| **Kesalahan berat** | **20** |

| Jenis kesalahan (bisa lebih dari satu per sampel) | n |
| --- | ---: |
| Potongan tidak diterjemahkan ("i think", "thats") | 16 |
| Terjemahan harfiah ("times table" → "meja waktu", "left" → "kiri", "letter" → "surat") | 15 |
| Istilah matematika keliru ("1 third" → "1 ketiga", "fractions" → "fraksi", "number" → "nomor") | 9 |
| Bahasa kaku | 9 |
| Angka/ekspresi rusak ("-8 - -5" → "-8 -5", "0.0001" → "0, 0001", "6.0001" → "6.001") | 7 |
| Bagian hilang | 4 |

- Cek digit otomatis vs penilaian manual: menangkap 5 dari 7 sampel dengan angka rusak, dengan 4 positif palsu
  (mis. "4" → "empat", "negative three" → "-3").
- Kesalahan berat per kategori: False_Correct 40% (6/15), kategori lain 12–18%.
- **Opsi jawaban teks soal peluang (109465) salah makna:** "Unlikely" → "Tidak mungkin" (= impossible),
  "Certain" → "Tentu", "Likely" → "Sepertinya". Tidak diperbaiki diam-diam; dilaporkan di sini dan di E4.

## Konsekuensi
- E4 mengukur ketahanan model terhadap **terjemahan mesin dengan ~20% kesalahan berat**, bukan tulisan asli siswa
  Indonesia. Validasi native menunggu pilot (E9).
- Untuk instrumen pilot (T70), soal dan opsi diterjemahkan ulang secara manual oleh tim, bukan memakai keluaran ini.
