# PROGRESS — log kerja Claude Code

Perbarui setelah setiap task. Entri terbaru di paling atas. Format:
`### YYYY-MM-DD HH:MM — Txx <judul> — [selesai|berjalan|terblokir]`, lalu isi: yang dikerjakan, file output,
angka kunci (dengan path sumbernya), masalah, dan langkah berikutnya.

## Status ringkas
- Fase aktif: P0
- Task berikutnya: T01
- Hari tersisa menuju submit internal (Jum 27 Nov): 9
- Kuota GPU Kaggle terpakai minggu ini: 0 jam

## Blocker (butuh Salman)
- **M1** token Kaggle dan **M2** setujui aturan MAP → memblokir T03, T11, T23, T31.
- Pertanyaan T00: apakah ada remote GitHub lama yang ingin dihubungkan? (tidak akan push tanpa izin)

## Angka kunci terbaru
_(belum ada — jangan diisi tanpa path sumber)_

## Pemahaman awal (sesi 1, 18 Nov)
1. Tujuan: v1 (aturan CRI 2×2, `engine.ts`) → RemediAide 2.0 = 3 lapis ML + Pengaman, submit Jum 27 Nov (batas 28 Nov).
2. L1 Pelacak Penguasaan (Eedi T3&4): B0 aturan v1 → B1 → LightGBM → CO-KT; dua framing (a) KT next-correct, (b) kuadran masa depan.
3. L2 Pembaca Alasan (MAP): TF-IDF → mDeBERTa (Kaggle GPU); split acak (MAP@3) + per soal (`category3`); E3 jebakan jawaban benar, E4 terjemahan Indonesia.
4. L3: kalibrasi, conformal α=0,1, selective prediction (titik operasi D-09 dari validasi), fusi naive-Bayes.
5. Pengaman (tebakan cepat) hanya diuji simulasi; tidak dilaporkan sebelum data pilot.
6. Aturan keras: tanpa angka karangan, keputusan dikunci di DECISIONS, anti-leakage + tes, data tidak masuk git, B0 tidak diubah.
7. Test set dibuka sekali di T46; freeze Tingkat S Rab 25 Nov 23:59.
8. Lokal: tabular + terjemahan + smoke test; Kaggle GPU: CO-KT dan mDeBERTa.
9. Web (P6) baru setelah submisi aman, branch `feat/ml-integration`, fallback ke `engine.ts`.
10. Bobot nilai: Implementasi ML 25%, Data 20%, Evaluasi 20%, Inovasi 20%, Masalah 15%.

**Risiko terbesar:** (1) unduhan Eedi otomatis gagal → seluruh P2 tertahan (butuh M3); (2) token Kaggle/aturan MAP
(M1/M2) terlambat → L2 dan CO-KT tertahan, padahal jadwal L2 hanya 2 hari; (3) label kuadran masa depan bergantung
pada confidence yang banyak kosong — porsi baris yang bisa dievaluasi bisa kecil; (4) RAM MacBook Air saat fitur
±1,4 juta baris × SHAP/Optuna; (5) jadwal 9 hari sangat padat, sehingga freeze 25 Nov harus dipatuhi.

## Log

### 2026-11-18 — T00 Bootstrap repo — selesai
- `git init -b main`; commit `v1: RemediAide LIDM 2026 (snapshot dari zip)` hanya berisi kode v1 (.gitignore asli).
- Branch `cac/ml`; `.gitignore` root ditambah `__MACOSX/`, `._*`, `ml/.venv/`, `ml/data/{raw,interim,processed,pilot}/`.
- git user lokal repo diset (Salman). Belum ada remote — perlu konfirmasi Salman (lihat Blocker).
- Berikutnya: T01.

### 2026-11-18 — T-1 Paket rencana dipasang — selesai
- Dokumen `docs/cac/*`, `CLAUDE.md`, `.claude/commands/*`, dan kerangka `ml/` ditambahkan.
- `ml/src/remediaide_ml/cri_rule.py` (B0) + `ml/tests/test_cri_rule.py`: 27 tes kesetaraan terhadap
  fixture dari `engine.ts` lulus di lingkungan perencana. Jalankan ulang di T01.
- Berikutnya: T00.
