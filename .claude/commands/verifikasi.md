---
description: Audit kualitas menyeluruh sebelum freeze atau submit
---
Lakukan audit kualitas sebagai reviewer yang skeptis (anggap kamu juri ML yang mencari celah). Laporkan
temuan dan perbaiki yang bisa diperbaiki. Perbaikan yang mengubah hasil wajib dicatat di DECISIONS.md.

1. **Tes:** `cd ml && make test` dan `npm test` (root). Semua harus lulus.
2. **Leakage:** cek ulang split (tidak ada UserId/QuestionId lintas split), fitur hanya dari masa lalu,
   target encoding OOF, kalibrasi/conformal tidak memakai test, dan test set hanya dibuka di T46.
3. **Reproduksibilitas:** seed, `requirements-lock.txt`, config tersimpan per run, dan notebook berjalan
   berurutan dari kernel bersih.
4. **Angka:** jalankan `scripts/check_numbers.py` (buat dulu jika belum ada). Setiap angka di README,
   REPORT, RESULTS, dan NUMBERS_SHEET harus bisa ditelusuri ke tabel sumber. Cari angka tanpa sumber.
5. **Klaim:** tidak ada "pertama di Indonesia/dunia", tidak ada klaim dampak belajar tanpa E10, tidak ada
   klaim validasi Indonesia tanpa data pilot. Keterbatasan disebutkan.
6. **Lisensi & privasi:** atribusi Eedi (CC BY-NC-ND) dan MAP, tidak ada data olahan Eedi di repo submisi,
   tidak ada data pilot/siswa/token/.env di git (`git log -p | grep -iE "token|secret|password|kaggle_key"`).
7. **B0:** `cri_rule.py` tidak berubah sejak parity test, dan laporan menyebut ketidaksesuaian proposal vs kode v1.

Tulis hasil audit ke `docs/cac/AUDIT_<tanggal>.md` dan ringkasannya ke PROGRESS.md.
