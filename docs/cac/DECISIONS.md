# DECISIONS — keputusan yang dikunci (pre-registered)

Keputusan di bawah ini dikunci sebelum melihat hasil. Perubahan hanya boleh lewat entri baru
`D-xx (revisi D-yy)` yang berisi tanggal, alasan, dan dampaknya. Entri lama jangan dihapus.

| ID | Tanggal | Keputusan | Alasan |
| --- | --- | --- | --- |
| D-01 | 2026-11-18 | Seed global 20261118. Ensemble seed {20261118, 1, 2, 3, 4}. | Reproduksibilitas |
| D-02 | 2026-11-18 | **B0 = kode v1 apa adanya** (`engine.ts` + `compute.ts`), diport ke `cri_rule.py`. Kesetaraan dijamin 27 tes fixture yang dihasilkan dari TypeScript. | Pembanding harus aturan yang benar-benar dipakai di aplikasi |
| D-03 | 2026-11-18 | Confidence Eedi 0–100 → CRI integer dengan pembulatan half-up `floor((c+10)/20)`. Hasilnya cri ≥ 3 ⇔ c ≥ 50 ⇔ c/20 ≥ 2,5. Jadi ambang kode (≥3) dan ambang proposal (≥2,5) setara di data ini. | Menghilangkan ambiguitas 2,5 vs 3 |
| D-04 | 2026-11-18 | Split Eedi: 20% UserId = test terkunci. Sisanya GroupKFold(5) per UserId. Robustness: split temporal 20% terakhir per siswa test. | Protokol pyKT, anti-leakage antarsiswa |
| D-05 | 2026-11-18 | Label E1/framing (b) = **kuadran masa depan**: 3 percobaan berikutnya di KC yang sama (minimal 2). Tuntas = fut_acc ≥ 2/3; yakin = fut_cri_mean ≥ 3. B0 memprediksi kuadran masa depan = kuadran saat ini. | Definisi "salah kelompok" yang bisa diuji tanpa label guru |
| D-06 | 2026-11-18 | MAP: (i) StratifiedKFold(5) pada target, setara Kaggle; (ii) GroupKFold per QuestionId untuk `category3`. Output dibatasi kandidat (QuestionId, prefiks benar/salah). | Skor Kaggle overoptimistis karena ID soal sama; split per soal menguji generalisasi |
| D-07 | 2026-11-18 | Metrik utama: L1(a) AUC; L1(b) macro-F1 4 kelas + tingkat salah kelompok; L2 MAP@3 (random) dan macro-F1 `category3` (per soal); L3 ECE, cakupan conformal, kurva coverage-risk. | Sesuai literatur dan cerita utama |
| D-08 | 2026-11-18 | Terjemahan: Helsinki-NLP/opus-mt-en-id (Apache-2.0), dengan placeholder untuk ekspresi matematika, plus QA manual 100 sampel. | Reproduksibel, lisensi aman |
| D-09 | 2026-11-18 | Conformal α = 0,1. Titik operasi defer dipilih di validasi dengan aturan: defer terkecil yang menurunkan tingkat salah kelompok sisa ≥ 25% relatif terhadap tanpa defer, maksimal 30%. Jika tidak ada, 20%. | Dikunci supaya tidak dipilih setelah melihat test |
| D-10 | 2026-11-18 | Tingkat S dibekukan Rab 25 Nov 23:59. Test set dibuka sekali di T46. Submit Jum 27 Nov. | Tenggat 28 Nov |
| D-11 | 2026-11-18 | Data olahan Eedi tidak dibagikan (ND). Upload ke Kaggle hanya sebagai dataset privat. Data pilot tidak pernah keluar dari laptop tim. | Lisensi dan UU PDP |
| D-12 | 2026-11-18 | Dua framing L1: (a) KT standar untuk pembanding pyKT, (b) diagnostik kuadran masa depan untuk produk dan E1/E2/E8. | Benchmark yang adil dan produk yang relevan |
| D-13 | 2026-11-18 | Kelompok fairness: Gender (1 vs 2), PremiumPupil (jika artinya terverifikasi), kuartil kemampuan. Atribut ini tidak dipakai sebagai fitur model. | SDG 10, menghindari diskriminasi langsung |
| D-14 | 2026-11-18 | Training DL berat di GPU Kaggle. Lokal hanya untuk tabular dan smoke test. | MacBook Air tanpa CUDA |
| D-15 | 2026-11-18 | Model produksi L1 dipilih dari CV (bukan test). Kalau seri, pilih yang lebih sederhana. | Mencegah overfitting pada test |

## Catatan verifikasi data (diisi Claude Code saat T10–T13)
- [ ] Nama dan kolom file Eedi sesuai 02_DATA_SPEC? Catat perbedaannya.
- [ ] Arti PremiumPupil terverifikasi dari paper? (ya/tidak + kutipan halaman)
- [ ] Kolom MAP sesuai? Lisensi MAP terkonfirmasi? Salin teks lisensinya.
- [ ] Persentase confidence kosong di Eedi T3&4: ____
