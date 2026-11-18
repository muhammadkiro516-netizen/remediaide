# docs/cac — Paket rencana RemediAide 2.0 (CAC MLSC 2026)

| File | Isi | Dibaca saat |
| --- | --- | --- |
| `../../CLAUDE.md` | Aturan kerja Claude Code, aturan emas, lingkungan | Setiap sesi (otomatis) |
| `00_MASTER_PLAN.md` | Fase, jadwal, tingkat lingkup, risiko | Awal dan saat merencanakan ulang |
| `01_CONTEXT.md` | Aturan lomba, konsep, audit aplikasi v1, fakta riset + sumber | Menulis README/laporan |
| `02_DATA_SPEC.md` | Dataset, unduhan, kolom, cleaning, fitur, label, split | P1–P2 |
| `03_MODEL_SPEC.md` | Rencana komputasi (Kaggle GPU), model per lapis | P2–P4 |
| `04_EXPERIMENTS.md` | Protokol E1–E10, metrik, uji statistik, format RESULTS | P2–P4 |
| `05_INTEGRATION_SPEC.md` | Prisma, API ML, Mode AI, ekspor riset, deploy | P6 |
| `06_PILOT_PROTOCOL.md` | Instrumen, persetujuan, label guru | P7 |
| `07_SUBMISSION.md` | Struktur repo submisi, README/REPORT, checklist | P5 |
| `TASKS.md` | Daftar task berurutan + kriteria selesai | Setiap sesi |
| `PROGRESS.md` | Log kerja + blocker + angka kunci | Setiap sesi |
| `DECISIONS.md` | Keputusan yang dikunci | Sebelum mengubah apa pun |
| `MANUAL_ACTIONS.md` | Tindakan khusus Salman | Saat ada blocker |
| `PROMPTS.md` | Yang Salman ketik ke Claude Code | Salman |

Kerangka kode: `ml/` (pyproject, Makefile, `src/remediaide_ml/cri_rule.py` = B0 yang sudah lolos uji
kesetaraan dengan engine.ts).
