# 07 — Paket Submisi Penyisihan (fase P5)

Yang diminta panitia: **source code + dataset**, sebelum 28 November 2026. Juri penyisihan menilai dari berkas
saja, jadi README dan REPORT.md harus bisa menjelaskan semuanya tanpa presentasi.

## 1. Bentuk
Repo GitHub terpisah **`remediaide-ml`** (privat lalu dibagikan ke panitia, atau publik sesuai rulebook),
diekspor dari folder `ml/`. Sertakan juga arsip `.zip` cadangan.

```
remediaide-ml/
├── README.md                 # Bahasa Indonesia, lihat §2
├── REPORT.md                 # laporan teknis, lihat §3
├── MODEL_CARD.md
├── DATA_CARD.md
├── LICENSE                   # MIT untuk kode
├── pyproject.toml, requirements-lock.txt, Makefile
├── configs/base.yaml
├── src/remediaide_ml/...
├── notebooks/                # dijalankan, output tersimpan
│   ├── 01_eda.ipynb
│   ├── 02_preprocessing_features.ipynb
│   ├── 03_lapis1_baselines_lgbm.ipynb
│   ├── 04_lapis1_cokt.ipynb          # memuat hasil run Kaggle + link kernel
│   ├── 05_lapis2_reader.ipynb
│   ├── 06_lapis3_calibration_conformal.ipynb
│   └── 07_eval_fairness_impact.ipynb
├── kaggle/                   # kernel-metadata + train.py (bisa direproduksi di Kaggle)
├── service/                  # FastAPI (bukti siap implementasi)
├── reports/RESULTS.md, figures/, tables/
├── data/
│   ├── README.md             # sumber, lisensi, checksum, cara unduh/regenerasi
│   ├── download_eedi.sh, download_map.sh
│   ├── original/             # salinan asli tanpa modifikasi (jika ukuran & lisensi mengizinkan)
│   └── derived/map_id/       # terjemahan Indonesia (MIT, hanya jika lisensi MAP terkonfirmasi)
└── tests/
```

## 2. README.md (Bahasa Indonesia) — urutan isi
1. Judul + tagline + satu kalimat angka utama (diisi dari RESULTS).
2. Masalah & SDG: data PISA 2025, Rapor Pendidikan 2025, tiga titik buta CRI.
3. Solusi: diagram tiga lapis (PNG), dan apa yang baru.
4. Data: dua dataset beserta lisensi, statistik, preprocessing, split anti-leakage.
5. Model per lapis: baseline → model terbaik.
6. Hasil utama: tabel ringkas E1–E8 dengan CI. Detail di REPORT.md.
7. Cara menjalankan dari nol: `make setup` → unduh data → `make all` (estimasi waktu, dan bagian mana yang
   perlu GPU Kaggle).
8. Struktur repo.
9. Keterbatasan dan etika.
10. Riwayat: v1 (LIDM 2026, aturan tanpa ML) vs v2 (karya ini). Kontributor. Lisensi. Sitasi dataset.

## 3. REPORT.md — dipetakan ke kriteria juri
| Bab | Kriteria |
| --- | --- |
| 1 Pendahuluan, rumusan masalah, RQ1–RQ4, SDG | Perumusan masalah 15% |
| 2 Data: sumber, kualitas, EDA, cleaning, fitur, split, terjemahan + QA | Data 20% |
| 3 Metode: arsitektur, baseline, tuning, kalibrasi, conformal, compute | Implementasi ML 25% |
| 4 Hasil: E1–E8 (+E9/E10 jika ada), uji signifikansi, SHAP, fairness, analisis error | Evaluasi 20% |
| 5 Inovasi & dampak: alur kelas, integrasi web, simulasi dampak, privasi, offline | Inovasi & dampak 20% |
| 6 Keterbatasan & rencana lanjut | Kejujuran ilmiah |
| Pustaka | Atribusi |

Semua angka diambil dari `reports/RESULTS.md`. Skrip `scripts/check_numbers.py` memastikan setiap angka di
README/REPORT ada di RESULTS atau tabel sumber.

## 4. MODEL_CARD.md dan DATA_CARD.md
- Model card: tujuan, pengguna, data latih, metrik per kelompok (E6), batasan, penggunaan yang tidak
  dianjurkan (misalnya menentukan nilai rapor), versi.
- Data card: komposisi, lisensi, preprocessing, bias yang diketahui (data Inggris, confidence self-report,
  kategori langka), dan privasi.

## 5. Dataset dalam submisi
- **Eedi (CC BY-NC-ND):** jika ukuran memungkinkan, sertakan arsip asli tanpa modifikasi beserta atribusi
  dan teks lisensi. Kalau tidak, sertakan skrip unduh + sha256. **Jangan** menyertakan versi olahan.
- **MAP:** jika MIT terkonfirmasi, sertakan train.csv asli + terjemahan Indonesia (`derived/`). Kalau tidak,
  sertakan skrip unduh saja.
- Tanyakan format pengumpulan dataset ke panitia (M6): link, unggahan, atau batas ukuran.

## 6. Checklist (T53)
- [ ] `make test` lulus. Clone segar + venv segar + `make all` mereproduksi RESULTS dalam toleransi
      (metrik ±0,005, atau identik jika deterministik).
- [ ] Notebook dijalankan berurutan tanpa error, dan output tersimpan.
- [ ] `check_numbers.py` lulus.
- [ ] Semua sumber data dan paper tersitasi. Lisensi setiap aset tercatat.
- [ ] Tidak ada data pilot/siswa, token, atau `.env` di repo (`git grep` untuk pola rahasia).
- [ ] Paragraf riwayat v1 ada.
- [ ] Ukuran repo wajar (< 100 MB tanpa data besar). Model besar ditautkan, tidak di-commit.
- [ ] Arsip zip cadangan dibuat dan diuji diekstrak.
