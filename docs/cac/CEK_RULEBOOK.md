# Cek syarat submisi penyisihan CAC MLSC 2026 (M6)

Dicek 20 Nov 2026 oleh Claude Code. **Rulebook resmi tidak ditemukan di laptop.** Sumber yang tersedia hanya slide
Technical Meeting MLSC, 12 Nov 2026 (`~/Downloads/PPT TECHNICAL MEETING MLSC.pdf`, tidak di-commit). Slide menyebut
"setiap rulebook memiliki versi revisi", jadi daftar ini perlu dicocokkan ulang dengan rulebook terbaru dari panitia.
(`~/Downloads/Guidebook Compare 2026.pdf` adalah lomba lain, COMPARE 2026, dan tidak dipakai.)

| # | Syarat (slide TM, hal. 7–11) | Status | Bukti di repo |
| --- | --- | --- | --- |
| 1 | Studi kasus mengacu minimal satu dari 17 SDGs | ✔ | SDG 4.1, 10.2, 4.c (`ml/REPORT.md` §1.4) |
| 2 | Masalah nyata yang bisa diselesaikan dengan ML | ✔ | `ml/REPORT.md` §1 |
| 3 | Data relevan, valid, sumber dicantumkan; open data boleh | ✔ | Eedi NeurIPS 2020 + MAP, `ml/DATA_CARD.md`, `ml/data/manifest.json` |
| 4 | Pengolahan data, analisis, pemodelan, evaluasi sistematis | ✔ | `ml/REPORT.md` §2–4, notebook 01–07 |
| 5 | Framework dan library bebas | ✔ | Python, LightGBM, PyTorch, scikit-learn |
| 6 | Wajib menyerahkan **source code** (notebook, python, GitHub, dll.) | ✔ | repo GitHub publik + zip release |
| 7 | Wajib menyerahkan **dataset** | ✔ dengan catatan | MAP asli + MAP-ID di paket/HF; Eedi **tidak** dibagikan ulang (CC BY-NC-ND), diganti skrip unduh + sha256. Jelaskan ini di formulir |
| 8 | Dikumpulkan sebelum 28 Nov 2026 | ✔ (rencana 27 Nov) | M15 |
| 9 | **Orisinal, belum pernah dipublikasikan atau diikutsertakan dalam kompetisi lain** | ⚠ **perlu konfirmasi panitia** | Semua komponen ML, eksperimen, dan laporan dibuat baru mulai 18 Nov 2026. Namun aplikasi web v1 (aturan CRI, tanpa ML) pernah diikutkan pada lomba lain (LIDM 2026). Commit `12780db` menghapus nama lomba itu dari dokumen, tetapi faktanya tetap ada di riwayat git dan bisa diverifikasi panitia. **Saran: tanyakan ke panitia** apakah memakai aplikasi v1 sebagai dasar/baseline diperbolehkan, dan nyatakan terbuka di formulir |
| 10 | Bebas plagiarisme; karya pihak lain diberi atribusi | ✔ | sitasi dataset, model pralatih, dan pustaka di `ml/REPORT.md`; `CITATION.cff` |
| 11 | Panitia boleh memverifikasi source code dan model | ✔ dengan catatan | kode publik; log + metrik kernel di `ml/kaggle/evidence/`; bobot Lapis 1 (turunan Eedi) tidak publik, bisa diberikan atas permintaan / lewat Space privat |
| 12 | Keterlambatan → pengurangan nilai/diskualifikasi | — | kirim 27 Nov |
| 13 | Format penamaan berkas, batas ukuran, larangan identitas | ? tidak disebut di slide | tunggu rulebook revisi terbaru (M6) |
| 14 | Kriteria penilaian penyisihan (15/20/25/20/20) | ✔ | bab `ml/REPORT.md` dipetakan ke kelima kriteria |
