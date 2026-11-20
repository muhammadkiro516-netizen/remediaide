# Catatan developer dan ringkasan teknis

> Isi ini sebelumnya adalah README utama. README utama sekarang ditulis untuk juri; detail teknis tetap di sini.


Submisi **CAC Machine Learning Solution Challenge 2026**. Aplikasi web RemediAide v1 (aturan CRI 2×2, versi awal tanpa ML)
ditambah mesin diagnosis **3 lapis ML + 1 pengaman**, dievaluasi pada test yang dikunci dan dibuka sekali.

> **Angka utama (test, 20% siswa Eedi yang dikunci sejak awal; 58.963 kasus, 773 siswa).** Aturan CRI v1 salah
> mengelompokkan **45,1%** kasus [CI 95% 43,1–46,9]. RemediAide 2.0 salah mengelompokkan **34,7%** [33,0–36,6]:
> turun **10,3 poin** [9,7–10,9], atau **22,9% relatif** (aproksimasi 21,6–24,2%). Model lalu menyerahkan **20,6%**
> kasus paling meragukan ke guru. Pada **79,4%** kasus sisanya, salah kelompok **28,3%**, sedangkan aturan v1 pada
> kasus yang sama **39,2%**.
> Terhadap baseline sederhana terkuat (regresi logistik B1b, **40,1%** [38,0–42,2]), RemediAide 2.0 tetap lebih baik
> **5,3 poin** [4,8–5,9]. Aturan v1 (45,1%) bahkan lebih buruk dari baseline B1a yang hanya memakai kesulitan soal
> (**42,9%** [40,3–45,8]; tanpa uji berpasangan, CI tumpang tindih), walaupun B1a hampir selalu menebak *Paham*
> (macro-F1 0,182 vs aturan v1 0,392).
> Sumber: [`ml/reports/tables/headline.json`](ml/reports/tables/headline.json).

![Aturan v1 vs ML pada siswa test yang sama](ml/reports/figures/E8_v1_vs_ml.png)

| Untuk juri | Isi |
| --- | --- |
| [`ml/REPORT.md`](ml/REPORT.md) | laporan teknis (bab dipetakan ke 5 kriteria penilaian) |
| [`ml/reports/RESULTS.md`](ml/reports/RESULTS.md) | semua hasil E1–E8 dengan CI dan path sumber |
| [`ml/MODEL_CARD.md`](ml/MODEL_CARD.md) · [`ml/DATA_CARD.md`](ml/DATA_CARD.md) | kartu model dan kartu data |
| [`docs/cac/LAPORAN_REVIEW.md`](docs/cac/LAPORAN_REVIEW.md) | audit jujur: penyimpangan, yang belum, risiko |
| [`docs/cac/REVIEW_INDEX.md`](docs/cac/REVIEW_INDEX.md) | daftar tautan semua bukti |
| [`docs/cac/DECISIONS.md`](docs/cac/DECISIONS.md) | keputusan yang dikunci sebelum hasil dilihat (D-01 s.d. D-24) |
| https://remediaide.vercel.app | aplikasi web (Mode AI di branch `feat/ml-integration` = `main`) |

**Tidak semua kuadran membaik.** Recall per kuadran di test (dari confusion matrix tersimpan;
[`ml/reports/tables/E1_recall_per_class_test.csv`](ml/reports/tables/E1_recall_per_class_test.csv)):

| Kuadran masa depan (test) | n | Aturan v1 (B0) | CO-KT | Tambahan benar CO-KT − B0 |
| --- | --- | --- | --- | --- |
| Paham | 33.682 | 0,713 | **0,886** | +5.815 |
| Tebakan beruntung | 3.701 | **0,141** | 0,050 | −337 |
| Miskonsepsi | 15.440 | **0,400** | 0,368 | −494 |
| Tidak paham | 6.140 | 0,274 | **0,452** | +1.094 |

Recall Miskonsepsi CO-KT (0,368) lebih rendah dari aturan v1 (0,400); turunnya salah kelompok terutama berasal dari kelas
Paham dan Tidak paham. B1b dan LightGBM dibandingkan per kuadran di CV ([`ml/REPORT.md` §4.2](ml/REPORT.md#42-e1--aturan-v1-salah-mengelompokkan-hampir-separuh-kasus-test)).

**Yang jujur kami akui sejak awal:** label "kuadran masa depan" adalah proxy, bukan label guru; alasan berbahasa
Indonesia diuji dengan terjemahan mesin; manfaat defer (turun 18,5%) di bawah target awal 25%; kesenjangan error untuk
siswa berkemampuan rendah dan pupil premium tetap ada; pilot sekolah (E9/E10) belum dijalankan. Rincian:
[`ml/REPORT.md` §6](ml/REPORT.md#6-keterbatasan-dan-rencana-lanjut).

---

## Cara menjalankan dari nol

**Bagian ML** (Python 3.12, CPU cukup; bagian GPU memakai output kernel Kaggle yang tersimpan):
```bash
cd ml
make setup            # venv + dependensi terkunci (requirements-lock.txt)
make data-raw         # unduh Eedi (blob publik resmi) + MAP; cek sha256 di data/manifest.json
make test             # tes kesetaraan B0 vs engine.ts, leakage, kausalitas CO-KT, kontrak layanan
make kaggle-outputs   # ambil output GPU tersimpan (atau jalankan ulang kaggle/kernels/*/train.py di Kaggle)
make all              # data → L1 → L2 → L3 → evaluasi test; ±4 jam di laptop CPU
make check-repro      # bandingkan tabel hasil dengan versi di repo (toleransi ±0,005)
```
Rincian, termasuk layanan FastAPI dan Docker: [`ml/README.md`](ml/README.md).

**Aplikasi web** (Node.js 20, PostgreSQL 15; Redis opsional):
```bash
npm install
cp .env.example .env.local          # isi DATABASE_URL, DIRECT_URL, AUTH_SECRET
npx prisma migrate deploy
SEED_PASSWORD='<password demo>' SEED_SUPERADMIN_PASSWORD='<password superadmin>' npm run prisma:seed
npm run dev                         # http://localhost:3000
npm test                            # Vitest
```
Mode AI memanggil layanan ML di `ML_SERVICE_URL`; bila kosong atau mati, aplikasi kembali ke aturan v1 (`engine.ts`).

## Struktur repo
```
ml/                     # seluruh komponen ML (paket remediaide-ml)
  src/remediaide_ml/    # data, fitur, l1 (CO-KT, LightGBM), l2 (TF-IDF, mDeBERTa), l3, guard, eval, diagnose
  scripts/              # satu skrip per langkah pipeline (lihat Makefile)
  notebooks/            # 01–07, tipis, output tersimpan
  kaggle/kernels/       # kode kernel GPU; kaggle/evidence/ = log + metrik kernel
  service/              # FastAPI + Dockerfile (+ hf_space/ untuk Hugging Face Spaces)
  reports/              # RESULTS.md, tables/, figures/
  tests/                # pytest
src/, prisma/, tests/   # aplikasi web Next.js 14 (v1 + integrasi ML)
docs/cac/               # rencana, keputusan, audit, keamanan, materi pilot
```

## Data dan lisensi
| Dataset | Lisensi | Di repo |
| --- | --- | --- |
| Eedi NeurIPS 2020 Task 3&4 | CC BY-NC-ND 4.0 | **tidak**; skrip unduh + sha256 (`ml/data/`) |
| MAP — Charting Student Math Misunderstandings | MIT | lewat paket submisi (asli + terjemahan Indonesia) |
| Data pilot siswa | UU PDP, persetujuan orang tua | **tidak pernah** |

Kode ML: MIT (`ml/LICENSE`). Sitasi dataset ada di [`ml/README.md`](ml/README.md#8-riwayat-kontributor-lisensi).
Keamanan: tidak ada rahasia di riwayat git (pemindaian di [`docs/cac/SECURITY_NOTES.md`](docs/cac/SECURITY_NOTES.md)).

## Riwayat
RemediAide v1 (aplikasi web Next.js + aturan CRI 2×2 tanpa ML) adalah versi awal yang kami buat sebelumnya. Semua komponen ML, data
olahan, eksperimen, dan hasil di repo ini dibuat baru untuk CAC MLSC 2026. Aturan v1 dipakai apa adanya sebagai
baseline B0 (27 tes kesetaraan dengan `engine.ts`).

**Tim:** Muhammad Salman Al Farisi (ketua), Lubna Maryam (anggota), Muhammad Farel Rizky (anggota).

### Stack aplikasi web
Next.js 14 (App Router), TypeScript, Tailwind + shadcn/ui, PostgreSQL + Prisma 6, NextAuth v5, BullMQ + Redis
(opsional), SSE, Vitest + fast-check, Playwright, onnxruntime-web (Lapis 1 di browser), Serwist (PWA).
