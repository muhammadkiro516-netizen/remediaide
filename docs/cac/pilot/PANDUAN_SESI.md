# Panduan sesi pilot RemediAide-ID — langkah demi langkah (untuk Salman)

Dokumen ini memandu satu sesi pilot dari persiapan sampai data siap dianalisis. Protokol lengkap:
`docs/cac/06_PILOT_PROTOCOL.md`. **Jangan pernah** meng-commit, mengunggah, atau mengirim data siswa ke layanan lain.

Semua alat sudah diuji dengan **tes kering** (19 Nov 2026, database lokal, 3 siswa dummy): 15 soal terjawab lewat
aplikasi, gambar soal tampil, ekspor riset ditolak sebelum persetujuan dicatat, lalu menghasilkan CSV 45 baris yang lolos
validator (`tests/e2e/pilot-dry-run.spec.ts`, `ml/scripts/pilot_analysis.py validate`). Data tes kering itu dummy dan
tidak dipakai sebagai hasil.

## A. Dua minggu sebelum sesi
1. **Izin** (M4, M5): surat pengantar kampus ke kepala SMA Advent Tanjung Barat; sepakati 2–3 kelas X (30 menit per
   kelas) dan 2 guru matematika sebagai pelabel.
2. **Cetak formulir** (M11): `docs/cac/pilot/consent_form.pdf` (1 lembar per siswa). Isi dulu tanggal penghapusan data
   dan kontak tim. Bagikan lewat wali kelas, kumpulkan **sebelum** hari sesi.
3. **Berikan ke guru:** `docs/cac/pilot/teacher_info.pdf` dan `docs/cac/pilot/instrument_map_id.md`.
   Minta guru mengecek 8 soal bertanda **[cek guru]**, terutama 3 soal bergambar (31772, 76870, 91695) dan penulisan
   desimal dengan koma. Kalau ada perbaikan, beri tahu Claude Code; instrumen dibuat ulang dengan
   `ml/scripts/pilot_materials.py`.

## B. Sehari sebelum sesi
4. **Akun guru:** buat akun guru pendamping di aplikasi (dashboard superadmin), atau pakai akun Salman.
5. **Pisahkan siswa yang setuju dan tidak.** Siswa tanpa persetujuan tetap boleh ikut sebagai latihan, tetapi di
   **kelas/sesi terpisah** yang tidak pernah diekspor. Untuk setiap kelas pilot buat dua kelas di aplikasi, misalnya
   `X-A Pilot` (hanya siswa yang setuju) dan `X-A Latihan` (sisanya). Label siswa harus anonim (misalnya `XA-01`); jangan
   pakai nama atau NIS.
6. **Masukkan instrumen** ke kelas pilot (dari laptop, satu kali per kelas):
   ```bash
   cd ~/Downloads/remediaide-main/.worktrees/web
   DATABASE_URL="<connection string Neon>" DIRECT_URL="<connection string Neon>" \
   PILOT_TEACHER_EMAIL="<email guru>" PILOT_CLASS_NAME="X-A Pilot" npx tsx scripts/seed-pilot-instrument.ts
   ```
   Ulangi untuk `X-A Latihan`. Skrip aman dijalankan ulang (tidak menggandakan soal). Hasilnya: 1 Test berisi 15 soal,
   5 soal meminta alasan (31774, 32829, 31777, 76870, 33472; keputusan D-25).
7. **Buat sesi PIN** di dashboard (menu Sesi → **Buat Sesi** → pilih paket soal "Pilot RemediAide-ID: 15 soal MAP").
   Sesi dibuat dalam status **Terkunci** sampai di kelas.
8. **Cek HP:** buka https://remediaide.vercel.app/student/join dari satu HP siswa contoh.

## C. Di kelas (30 menit)
9. **5 menit — penjelasan:** tujuan uji coba, hasil tidak memengaruhi nilai, boleh berhenti kapan saja. Minta
   persetujuan lisan siswa (assent).
10. Tekan **Aktifkan Sesi** di dashboard, lalu tulis PIN di papan. Siswa membuka `/student/join`, memasukkan PIN, dan memilih
    label anonimnya.
11. **20 menit — mengerjakan:** untuk tiap soal, pilih jawaban → geser keyakinan 0–5 → (di 5 soal) tulis alasan satu
    kalimat. Waktu tercatat otomatis. Jangan membantu menjawab.
12. **5 menit — penutup:** tutup sesi di dashboard; ucapkan terima kasih.

## D. Setelah sesi, hari yang sama (sebelum Auto-Wipe)
13. Buka **Hasil sesi** → tekan **Catat persetujuan riset** (hanya untuk sesi kelas *Pilot*, setelah memastikan semua
    formulir terkumpul) → tekan **⬇ Ekspor Riset** (M14). Simpan file sebagai
    `~/Downloads/remediaide-main/ml/data/pilot/<kelas>_<tanggal>.csv`. Folder ini di-ignore git.
14. Validasi:
    ```bash
    cd ~/Downloads/remediaide-main/ml
    .venv/bin/python scripts/pilot_analysis.py validate --export data/pilot/<kelas>_<tanggal>.csv
    ```
    Harus `"ok": true`. Kalau ada error "kemungkinan data pribadi", hapus teks itu dari CSV sebelum lanjut.
15. Kalau ada beberapa kelas, gabungkan CSV-nya (header sekali) menjadi `data/pilot/remediaide_riset.csv`.

## E. Pelabelan guru (E9, ±2 jam per guru)
16. Buat lembar untuk dua guru:
    ```bash
    .venv/bin/python scripts/pilot_analysis.py sheets --export data/pilot/remediaide_riset.csv
    ```
    Hasilnya `data/pilot/labeling_guru_A.xlsx` dan `labeling_guru_B.xlsx` (urutan baris inti diacak berbeda).
17. Serahkan satu file ke tiap guru (M13), **secara langsung atau lewat flashdisk**, bukan lewat chat atau email publik.
    Guru mengerjakan 20 baris latihan bersama, lalu 200 baris inti **sendiri-sendiri**, mengisi kolom `kode_label` dari
    dropdown.
18. Kumpulkan kembali kedua file ke `data/pilot/`. Untuk baris yang tidak sepakat, guru berdiskusi dan Anda mencatat
    hasilnya di `data/pilot/konsensus.csv` (kolom `id_baris,kode`).

## F. Analisis
19. Jalankan (butuh model di `ml/models/`):
    ```bash
    .venv/bin/python scripts/pilot_analysis.py analyze --export data/pilot/remediaide_riset.csv \
      --labels-a data/pilot/labeling_guru_A.xlsx --labels-b data/pilot/labeling_guru_B.xlsx --resolved data/pilot/konsensus.csv
    ```
    Hasil agregat (tanpa teks alasan) ditulis ke `ml/reports/pilot/`: kappa guru–guru (target ≥ 0,61), kappa
    model–guru, validasi fusi (aturan v1 vs L1 vs L2 vs fusi), dan Pengaman dengan waktu nyata.
20. Ketik `pilot selesai` ke Claude Code. Claude Code akan menulis data card pilot dan memperbarui RESULTS/REPORT.

## G. Setelah analisis
21. Hapus CSV mentah dan lembar label sesuai tanggal di formulir persetujuan (`rm ml/data/pilot/*`), kecuali bila ada
    izin tertulis untuk menyimpan lebih lama.
