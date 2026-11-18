# 02 — Spesifikasi Data

Semua path relatif terhadap `ml/`. Konstanta path ada di `src/remediaide_ml/paths.py`.
Setiap unduhan dicatat di `data/manifest.json`: sumber URL, tanggal, ukuran, sha256, lisensi.

## 1. Eedi NeurIPS 2020 — Task 3 & 4 (Lapis 1, Lapis 3, fairness)

**Sumber:** https://eedi.com/projects/neurips-education-challenge (tombol "Download Eedi Dataset").
Paper rujukan: Wang dkk., arXiv 2007.12061 (panduan data) dan arXiv 2104.04034 (hasil).
**Lisensi:** CC BY-NC-ND 4.0. Nonkomersial dan wajib atribusi. Salinan *tanpa modifikasi* boleh dibagikan,
versi modifikasi tidak. Konsekuensinya: data olahan tidak ikut disubmit, cukup skrip yang meregenerasinya.

**Cara unduh (T10):**
1. `curl -sL https://eedi.com/projects/neurips-education-challenge | grep -oE 'href="[^"]+"' | sort -u`
   lalu cari link yang mengarah ke file `.zip`/blob/drive untuk dataset. Unduh ke `data/raw/eedi_neurips2020/`.
2. Jika tidak ketemu atau terblokir: blocker **M3**. Pemilik mengunduh manual lalu menaruh zip di folder itu.
3. Ekstrak. Verifikasi file wajib ada (paper bagian 1.3):
   - `train_data/train_task_3_4.csv`
   - `metadata/answer_metadata_task_3_4.csv`, `metadata/question_metadata_task_3_4.csv`,
     `metadata/student_metadata_task_3_4.csv`, `metadata/subject_metadata.csv`
   - `images/` (948 gambar soal, tidak dipakai model, boleh dipakai untuk demo)
   - File task 1&2 boleh diabaikan (opsional untuk uji skala).

**Kolom (verifikasi saat load; catat perbedaan di DECISIONS):**
| File | Kolom |
| --- | --- |
| train_task_3_4 | QuestionId, UserId, AnswerId, IsCorrect (0/1), CorrectAnswer (1–4), AnswerValue (1–4 = A–D) |
| answer_metadata_task_3_4 | AnswerId, DateAnswered, Confidence (0–100, sering kosong), GroupId, QuizId, SchemeOfWorkId |
| question_metadata_task_3_4 | QuestionId, SubjectId (string list, misalnya "[3, 71, 98, 209]") |
| student_metadata_task_3_4 | UserId, Gender (0 tak disebut, 1 perempuan, 2 laki-laki, 3 lainnya), DateOfBirth, PremiumPupil |
| subject_metadata | SubjectId, Name, ParentId, Level |

Catatan: panduan resmi menulis kolom pertama answer_metadata sebagai "UserId", tetapi kunci join-nya AnswerId.
Cek isi kolom yang sebenarnya. Arti PremiumPupil perlu diverifikasi di arXiv 2007.12061 bagian 2.3;
kemungkinan besar penanda siswa kurang mampu (pupil premium). Jika benar, ini kelompok fairness sosial-ekonomi.

**Cleaning (T12) → `data/interim/eedi_t34.parquet`:**
1. Join train ⨝ answer_metadata (AnswerId) ⨝ question_metadata (QuestionId) ⨝ student_metadata (UserId).
2. Parse SubjectId menjadi list[int]. **KC = SubjectId dengan Level terdalam** di list tersebut (pakai
   subject_metadata.Level). Simpan juga `kc_l2` (satu level di atasnya) untuk analisis.
3. Parse DateAnswered ke datetime. Urutkan per UserId lalu per (DateAnswered, AnswerId).
4. Duplikat (UserId, QuestionId) dipertahankan sebagai percobaan berulang dengan `attempt_no`. Duplikat
   AnswerId persis dibuang.
5. `cri = confidence_to_cri(Confidence)` (B0 mapping, D-03). `has_conf = Confidence.notna()`.
6. Validasi: IsCorrect == (AnswerValue == CorrectAnswer). Hitung baris yang tidak konsisten dan buang.
7. Tulis data card ke `reports/tables/data_card_eedi.md`: jumlah baris, siswa, soal, KC, % confidence
   kosong (keseluruhan dan per siswa), distribusi confidence, akurasi rata-rata, rentang tanggal, distribusi
   gender dan PremiumPupil, panjang sekuens per siswa (median, p90).

## 2. MAP — Charting Student Math Misunderstandings (Lapis 2)

**Sumber utama:** `kaggle competitions download -c map-charting-student-math-misunderstandings -p data/raw/map`
(butuh M1 token + M2 menyetujui aturan kompetisi).
**Cadangan:** Hugging Face dataset `kaggle-map/data`, lewat `datasets.load_dataset("kaggle-map/data")`.
Catat sumber mana yang dipakai.
**Lisensi:** tercatat MIT di halaman data Kaggle. Verifikasi dan salin teks lisensinya ke `data/raw/map/LICENSE_NOTE.md`.
Kalau ternyata bukan MIT: jangan publikasikan terjemahan, dan catat di DECISIONS.
**Paper dataset:** Rittle-Johnson dkk., AIME-Con 2025 (aclanthology 2025.aimecon-wip.3) dan Crossley dkk.,
AIME-Con 2026 (2026.aimecon-main.33).

**Kolom yang diharapkan di train.csv (verifikasi):** `row_id, QuestionId, QuestionText, MC_Answer,
StudentExplanation, Category, Misconception`.
- Category ∈ {True_Correct, True_Neither, True_Misconception, False_Correct, False_Neither, False_Misconception}.
  Prefiks True/False = apakah MC_Answer benar.
- Misconception: label pendek, NA jika kategori bukan *_Misconception.
- Target kompetisi = `"{Category}:{Misconception or 'NA'}"`. Metrik resmi MAP@3.
- Hanya train.csv yang berlabel. test.csv Kaggle tidak dipakai untuk evaluasi.

**Cleaning (T13) → `data/interim/map.parquet`:**
1. Strip whitespace, normalisasi unicode NFKC, dan simpan teks asli di kolom terpisah.
2. `is_correct_answer` = prefiks True/False. Validasi bahwa setiap (QuestionId, MC_Answer) konsisten.
3. `target`, `category3` (Correct/Neither/Misconception), dan `misconception`.
4. **Kandidat per soal:** himpunan target yang pernah muncul untuk (QuestionId, prefiks). Dipakai untuk
   membatasi output model (D-06).
5. **Kamus miskonsepsi:** tabel `misconception_label → deskripsi`. Deskripsi diambil dari tabel kode error
   per soal di paper Rittle-Johnson 2025 (Tabel item 1–15). Penyelarasan label data ↔ kode paper dikerjakan
   manual oleh Claude Code dan didokumentasikan di `reports/tables/map_misconception_dictionary.csv`
   (kolom: label, question_ids, deskripsi_en, deskripsi_id, sumber).
6. Data card `reports/tables/data_card_map.md`: baris per soal, per kategori, panjang teks, % True_Misconception
   (literatur menyebut sekitar 1,6–2% untuk kategori jebakan jawaban benar), dan contoh per kategori.

**Topik 15 soal (Rittle-Johnson 2025):** representasi pecahan, menjumlah pecahan, pecahan dari himpunan
(2 soal), pecahan senilai, membagi pecahan, mengalikan dua pecahan, pecahan × bilangan bulat, mencari y,
besaran desimal, sisi poligon, mengurangi bilangan negatif, berpikir fungsional, proporsi, peluang (odds).

## 3. Terjemahan Indonesia (T32)
- Model: `Helsinki-NLP/opus-mt-en-id` (Apache-2.0). Jalankan lokal (CPU/MPS), batch 32, beam 4.
- Yang diterjemahkan: QuestionText, MC_Answer (jika berupa teks), dan StudentExplanation pada **test fold**
  dan seluruh data untuk eksperimen translate-train (opsional).
- Lindungi ekspresi matematika: ganti angka, pecahan (`\frac{a}{b}`, `a/b`), dan LaTeX dengan placeholder
  sebelum diterjemahkan, lalu kembalikan sesudahnya. Uji pada 20 contoh.
- QA: Claude Code memeriksa 100 sampel acak berstrata per kategori dengan rubrik (makna terjaga, matematika
  utuh, bahasa wajar). Catat tingkat kesalahan per jenis di `reports/tables/translation_qa.csv`.
  Sampel yang rusak dilaporkan, bukan diperbaiki diam-diam.
- Hasil: `data/processed/map_id.parquet` dan kartu terjemahan `reports/translation_card.md`.

## 4. Fitur Lapis 1 (T14) — anti-leakage
Untuk setiap interaksi t milik siswa s (soal q, KC k), hanya data **sebelum t** yang boleh dipakai sebagai
riwayat. Ada dua framing (D-12):
- **(a) KT standar:** prediksi IsCorrect pada t dari riwayat < t. Sinyal pada t tidak dipakai. Ini untuk
  perbandingan dengan pyKT.
- **(b) Diagnostik (produk):** setelah siswa menjawab t, prediksi **kuadran masa depan** di KC k dari
  riwayat ≤ t. Jawaban, keyakinan, dan opsi pada t boleh dipakai karena memang sudah diketahui guru.

Daftar fitur (nama kolom → definisi):
- `n_prev`, `acc_prev`: jumlah dan akurasi seluruh jawaban sebelumnya
- `n_prev_kc`, `acc_prev_kc`, `ewm_acc_kc` (α=0,3): akurasi di KC yang sama
- `conf_mean_prev`, `conf_mean_prev_kc`, `overconf_prev` = rata-rata (cri/5 − benar) di masa lalu
- `cnt_P_kc, cnt_L_kc, cnt_M_kc, cnt_T_kc`: hitungan kuadran B0 sebelumnya di KC; `last_quadrant_kc`
- `hours_since_prev`, `hours_since_prev_kc`, `attempt_no`
- `item_diff_oof`, `kc_diff_oof`: tingkat kesulitan soal dan KC, dihitung **hanya dari fold latih**
- Framing (b) saja: `cur_correct`, `cur_cri`, `cur_has_conf`, `cur_option_share_oof` (popularitas opsi yang
  dipilih di antara siswa yang salah, dari fold latih), `cur_quadrant_b0`
- Fairness (tidak dipakai sebagai fitur model): `gender`, `premium_pupil`, `ability_quartile`
  (dari akurasi periode latih)

**Tes leakage wajib (tests/test_features_leakage.py):**
1. Mengacak atau menghapus baris masa depan seorang siswa tidak mengubah fitur baris sebelumnya.
2. `item_diff_oof` pada fold validasi tidak memakai baris validasi.
3. Tidak ada UserId yang muncul di train dan test sekaligus.

## 5. Label proxy E1 / framing (b) — "kuadran masa depan" (D-05)
Untuk interaksi t di KC k, ambil **k=3 percobaan berikutnya** milik siswa yang sama di KC yang sama.
Butuh minimal 2 percobaan; jika kurang, baris dikeluarkan dari evaluasi framing (b) dan jumlahnya dilaporkan.
- `fut_acc` = rata-rata benar di jendela, `fut_conf` = rata-rata cri di jendela (hanya yang ada confidence).
- **Kuadran masa depan:** tuntas = fut_acc ≥ 2/3; yakin = fut_conf ≥ 3.
  P = tuntas & yakin, L = tuntas & tidak yakin, M = belum tuntas & yakin, T = belum tuntas & tidak yakin.
- Biner sekunder: `butuh_remediasi` = belum tuntas.
- B0 memprediksi kuadran masa depan = kuadran saat ini (asumsi implisit aturan v1).

## 6. Split (T15, D-04, D-06)
- **Eedi:** 20% UserId acak menjadi test (terkunci, hanya disentuh di T46/T47). Sisa 80%: GroupKFold 5 fold
  per UserId. Robustness: split temporal, yaitu 20% interaksi terakhir tiap siswa test menjadi test-temporal.
  Simpan `data/processed/eedi_splits.parquet` (UserId → fold/test).
- **MAP:** (i) StratifiedKFold 5 fold pada `target` (setara Kaggle); (ii) GroupKFold per QuestionId
  (15 grup, leave-question-out, 5 fold berisi 3 soal) untuk tugas `category3`. Simpan `data/processed/map_splits.parquet`.
- **Kalibrasi/conformal:** dari fold latih dibuat calibration split 20% per grup (siswa/soal), tidak tumpang
  tindih dengan test.

## 7. Data pilot (P7) — lihat 06_PILOT_PROTOCOL.md
Skema ekspor anonim per respons: `student_key` (hash bergaram per sesi), `session_id`, `question_id`
(ID MAP asli jika soal MAP), `chosen_option`, `is_correct`, `cri` (0–5), `response_time_ms`, `tau_min_ms`,
`explanation` (opsional), `answered_at`, `consent=true`. Disimpan hanya di `data/pilot/`, tidak pernah di-commit.
