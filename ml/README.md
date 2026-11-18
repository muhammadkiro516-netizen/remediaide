# ml/ — RemediAide 2.0 machine learning

Folder kerja ML (Python 3.11). Rencana dan spesifikasi ada di `../docs/cac/`. Saat submisi, folder ini
diekspor menjadi repo `remediaide-ml` (lihat `../docs/cac/07_SUBMISSION.md`), dan README ini diganti dengan
README submisi lengkap.

```bash
cd ml
make setup     # venv + dependensi + requirements-lock.txt
make test      # termasuk 27 tes kesetaraan B0 vs engine.ts
make env       # cek mesin + Kaggle CLI -> runs/env_report.json
```

Status modul: lihat docstring `src/remediaide_ml/__init__.py` dan `../docs/cac/TASKS.md`.
Data tidak pernah di-commit (lihat `data/README.md`).
