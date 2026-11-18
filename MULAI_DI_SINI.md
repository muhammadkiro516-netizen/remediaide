# Mulai di sini — memasang paket RemediAide 2.0 untuk Claude Code

## 1. Pasang paket ke repo (sekali saja, lewat Terminal)
> Jika `CLAUDE.md`, `.claude/`, `docs/cac/`, dan `ml/` sudah ada di repo (sudah dipasang Claude lewat aplikasi desktop), **lewati langkah ini**.

Finder menyembunyikan folder `.claude`, jadi pakai Terminal supaya tidak ada yang tertinggal:
```bash
cd /path/ke/repo/remediaide          # folder yang dibuka di VS Code (berisi package.json)
unzip -o ~/Downloads/remediaide2-claude-code-pack.zip -d .
ls -a                                # harus ada: CLAUDE.md  .claude/  docs/cac/  ml/  MULAI_DI_SINI.md
git status                           # cek file baru, belum perlu commit (Claude Code yang commit di T00)
```

## 2. Kerjakan dua tindakan manual dulu (5 menit)
Buka `docs/cac/MANUAL_ACTIONS.md`, lalu kerjakan **M1** (token Kaggle) dan **M2** (setujui aturan kompetisi MAP).
Tanpa keduanya, Claude Code tetap bisa mulai mengerjakan data Eedi, tetapi training GPU akan menunggu.

## 3. Jalankan Claude Code
Di VS Code, buka panel Claude Code (root repo), lalu ketik:
```
/mulai
```
Selanjutnya, setiap membuka sesi baru cukup ketik `/lanjut`. Cek kemajuan dengan `/status`.
Semua prompt lain ada di `docs/cac/PROMPTS.md`.

## 4. Yang Claude Code kerjakan sendiri
Unduh dataset, cleaning, fitur, training (lokal + GPU Kaggle), 10 eksperimen, laporan hasil, paket submisi,
integrasi web, dan bahan final. Kamu hanya mengurus surat dan item di MANUAL_ACTIONS.md.

File ini boleh dihapus setelah `/mulai` berjalan.
