# PROMPTS — yang Salman ketik ke Claude Code

## 1. Pertama kali (sekali saja)
Di VS Code, buka panel Claude Code di root repo RemediAide, lalu ketik:
```
/mulai
```
Jika perintah slash belum muncul (versi lama), tempel ini:
```
Baca CLAUDE.md dan seluruh docs/cac/. Kamu engineer tunggal proyek RemediAide 2.0 untuk CAC MLSC 2026.
Ikuti TASKS.md dari T00 secara berurutan sesuai aturan di CLAUDE.md. Kerjakan sampai selesai, verifikasi
tiap task, perbarui PROGRESS.md, dan commit per task. Beri tahu saya hanya untuk tindakan di MANUAL_ACTIONS.md.
```

## 2. Setiap kali membuka sesi baru / setelah konteks penuh
```
/lanjut
```

## 3. Cek kemajuan kapan saja
```
/status
```

## 4. Setelah menyelesaikan tindakan manual
```
M1 dan M2 sudah selesai. /lanjut
```

## 5. Sebelum freeze (Rab 25 Nov) dan sebelum submit (Kam 26 Nov)
```
/verifikasi
```

## 6. Jika Claude Code terlihat tersesat atau mengulang-ulang
```
Berhenti. Baca ulang CLAUDE.md bagian "Aturan emas" dan task aktif di TASKS.md. Jelaskan dalam 5 baris
apa yang sedang kamu coba capai, apa yang gagal, dan dua alternatif. Pilih yang paling sederhana yang tetap
memenuhi kriteria "Selesai jika".
```

## 7. Jika waktu mepet (misalnya tanggal 25 dan Tingkat S belum selesai)
```
Kita di mode darurat. Ikuti 00_MASTER_PLAN: pangkas sisa Tingkat S ke versi minimal yang jujur
(tandai "rencana" untuk yang tidak sempat), lakukan T46–T47, lalu langsung P5. Tulis rencana pemangkasan
di DECISIONS.md sebelum mulai.
```

## 8. Setelah submit, untuk integrasi web
```
Submisi sudah terkirim. Lanjut ke P6 (05_INTEGRATION_SPEC.md) mulai T60. /lanjut
```

## 9. Saat izin pilot keluar
```
Izin pilot dari SMA Advent sudah keluar, sesi kelas tanggal <tanggal>. Kerjakan T70 dan T71 sekarang, lalu
siapkan panduan langkah demi langkah untuk saya menjalankan sesi (M12).
```

## Tips
- Saat Claude Code meminta izin menjalankan perintah, izin yang aman sudah ada di `.claude/settings.json`.
  Untuk perintah lain, baca dulu sebelum menyetujui.
- Biarkan laptop menyala dan tersambung listrik saat training lokal berjalan. Training di Kaggle tetap jalan
  walau laptop tidur.
- Jangan menempel token atau password ke chat Claude Code.
