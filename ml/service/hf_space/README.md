---
title: RemediAide 2.0 ML
emoji: 🧮
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
license: other
short_description: Layanan diagnosis miskonsepsi RemediAide 2.0 (CAC MLSC 2026)
---

# RemediAide 2.0 — layanan ML

`GET /health` dan `POST /v1/diagnose` (kontrak di `ml/REPORT.md` repo GitHub). Layanan ini tidak menyimpan data siswa
dan tidak me-log teks alasan.

**Model di Space ini (D-27):** Lapis 1 CO-KT ensemble 5 seed (+ LightGBM sebagai penjelas SHAP), Lapis 2 **mDeBERTa-v3-base**
untuk alasan berbahasa Indonesia (model produksi D-21), Lapis 3 kalibrasi + conformal + defer. Space ini privat; web memanggilnya
dengan token baca.

**Lisensi:** kode MIT. Bobot Lapis 1 dilatih dari Eedi NeurIPS 2020 (CC BY-NC-ND 4.0): hanya untuk penggunaan
non-komersial dan penelitian. Lapis 2 dilatih dari MAP (MIT).
