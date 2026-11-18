# 00 — Rencana Induk RemediAide 2.0 (CAC MLSC 2026)

Dibuat 18 November 2026. Pemilik: Salman (urusan manual). Eksekutor teknis: Claude Code.

## Hasil akhir yang dituju
1. **Paket submisi penyisihan** (source code + dataset + laporan teknis) yang bisa direproduksi dari nol,
   terkirim **Jumat 27 November 2026** (batas resmi Sabtu 28 November).
2. **Web RemediAide 2.0** dengan panel "Mode AI", antrean "perlu dicek guru", dan input alasan siswa,
   dengan fallback ke aturan v1. Siap demo final.
3. **Bahan final**: RESULTS.md yang terkunci, gambar, data demo, dan naskah demo. Proposal dan video disusun
   belakangan dari bahan ini.

## Konsep singkat (detail di 01_CONTEXT.md)
Lima sinyal per jawaban: opsi dipilih, keyakinan 0–5, riwayat, alasan 1 kalimat, waktu respons.
- **Lapis 1, Pelacak Penguasaan** (Eedi 2020 Task 3&4): memprediksi kuadran masa depan siswa per konsep
  dan peluang benar berikutnya. Baseline B0 (aturan v1) → B1 → B2 LightGBM → M1 CO-KT transformer.
- **Lapis 2, Pembaca Alasan** (MAP): mengklasifikasi alasan menjadi kategori dan miskonsepsi, termasuk
  "benar tapi miskonsepsi". Dievaluasi juga lintas bahasa (terjemahan Indonesia).
- **Lapis 3, Pengambil Keputusan**: kalibrasi, conformal prediction, selective prediction (serahkan ke guru),
  dan fusi probabilitas.
- **Pengaman**: deteksi tebakan cepat berbasis data (butuh waktu respons, jadi menunggu data pilot).

## Fase dan jadwal

| Fase | Isi | Tanggal | Gerbang selesai |
| --- | --- | --- | --- |
| P0 Setup | Repo, venv, cek mesin, Kaggle CLI, kunci keputusan | Rab 18 – Kam 19 Nov | `make test` lulus, env_report.json ada |
| P1 Data | Unduh Eedi & MAP, loader, cleaning, fitur anti-leakage, split, utilitas evaluasi, EDA | Kam 19 – Jum 20 Nov | Data card terisi, tes leakage lulus |
| P2 Lapis 1 | B0/E1, B1, B2 LightGBM + E2 ablation, M1 CO-KT di Kaggle, SHAP | Jum 20 – Min 22 Nov | Tabel L1 lengkap dengan CI |
| P3 Lapis 2 | B0 TF-IDF, encoder multibahasa di Kaggle, terjemahan + QA, E3, E4 | Min 22 – Sel 24 Nov | Tabel L2 lengkap, test set Indonesia |
| P4 Lapis 3 + evaluasi | Kalibrasi, conformal, coverage-risk (E5), fairness (E6), dampak (E8), angka utama | Sel 24 – Rab 25 Nov | **FREEZE Tingkat S 25 Nov 23:59** |
| P5 Submisi | Repo submisi, README, REPORT.md, kartu model/data, uji reproduksi | Kam 26 – Jum 27 Nov | **Submit 27 Nov** |
| P6 Integrasi web | Prisma, input alasan, FastAPI, Mode AI, ekspor riset, landing page | Kam 26 Nov → sebelum final | Demo end-to-end jalan |
| P7 Pilot | Instrumen 15 soal, persetujuan, sesi kelas, label guru, E9 | Saat izin keluar | Kappa + validasi fusi |
| P8 Bahan final | RESULTS v2, naskah demo, gambar slide, persiapan tanya jawab | Setelah 30 Nov | Siap presentasi |

## Tingkat lingkup
- **S (wajib, sebelum freeze 25 Nov):** T00–T24, T30–T34, T40–T43, T45–T47, T50–T53.
- **A (nilai tambah, jika S selesai lebih cepat):** T25 (baseline pyKT resmi), T35 (distilasi + ONNX + E7),
  T36 (retrieval soal baru), T68 (mode offline).
- **B (setelah lolos / untuk final):** P7 pilot (T70–T75), E9, E10, P8.

Aturan: jangan mulai Tingkat A sebelum semua Tingkat S `[x]`. P6 boleh berjalan paralel mulai 26 Nov,
tapi submisi P5 selalu didahulukan.

## Dependensi kritis
- Kaggle CLI + token (M1) dan persetujuan aturan kompetisi MAP (M2) memblokir T11, T23, T31.
  Jika belum ada: kerjakan T10, T12, T14–T16, T20–T22 dulu (semuanya lokal).
- Unduhan Eedi (T10) memblokir seluruh P2. Jika link otomatis gagal → M3 (unduh manual).
- Data pilot (P7) memblokir modul Pengaman versi nyata, validasi fusi, dan E9. Ini tidak memblokir submisi.

## Risiko dan cadangan
| Risiko | Cadangan |
| --- | --- |
| CO-KT kalah dari LightGBM | Laporkan apa adanya. Pilih model produksi berdasarkan validasi. simpleKT menunjukkan baseline sederhana memang sulit dikalahkan. |
| Kuota GPU Kaggle habis | Kurangi seed (5 → 3), max_len, ukuran subset. Coba MPS lokal untuk model kecil. Colab via notebook manual (M8). |
| Confidence banyak kosong | Laporkan porsinya. Bandingkan dua strategi missing. Analisis utama E1 hanya pada baris berkeyakinan. |
| mDeBERTa fp16 NaN | Pakai fp32 atau `xlm-roberta-base`, dan catat di DECISIONS. |
| Waktu habis | Freeze di Tingkat S per 25 Nov. Sisa waktu untuk laporan dan uji reproduksi. |
| Aplikasi rusak saat integrasi | Branch terpisah, fallback engine.ts, `npm test` wajib lulus sebelum merge. |
