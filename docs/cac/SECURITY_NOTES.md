# SECURITY_NOTES — RemediAide 2.0

Diperbarui 19 Nov 2026 oleh Claude Code. Dokumen ini mencatat hasil pemeriksaan rahasia (secret) di repo
https://github.com/muhammadkiro516-netizen/remediaide (**publik**: API GitHub tanpa login mengembalikan HTTP 200 pada
19 Nov 2026) dan tindakan yang masih harus dilakukan pemilik repo. **Riwayat git tidak ditulis ulang.**

## 1. Pemindaian riwayat git dan working tree
- Alat: `ml/scripts/scan_secrets.py` (gitleaks/trufflehog tidak terpasang di mesin ini). Skrip memeriksa **setiap commit
  di semua ref** (`git rev-list --all`, termasuk `origin/*`) dan setiap file yang di-track. Pola: token GitHub
  (`ghp_`, `gho_`, `github_pat_`), password Neon (`npg_`), token Hugging Face (`hf_`), kunci `sk-`, kunci Kaggle (JSON
  `"key"`), kunci AWS, private key, URL Postgres dengan password, dan `AUTH_SECRET`/`NEXTAUTH_SECRET`.
  Hasil hanya dicetak dalam bentuk tersamar.
- Pemeriksaan silang manual: `git log -p --all | grep -E "ghp_|github_pat_|npg_|neon.tech|DATABASE_URL|DIRECT_URL|AUTH_SECRET|kaggle"`.
- **Hasil (19 Nov 2026, 85 commit, 442 file):** 0 rahasia asli. 9 temuan semuanya placeholder:
  | Commit / file | Jenis | Isi (tersamar) | Status |
  | --- | --- | --- | --- |
  | `6ea4442`, `9343aa9`, `README.md` | `DATABASE_URL`, `NEXTAUTH_SECRET` contoh | `postgresql://user:***@localhost…`, `"your-…"` | placeholder dokumentasi v1 |
  | `a8f4dcb` (`.env.example`) | `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET` contoh | `postgresql://postgres:***@localhost…`, `ganti-dengan-…` | placeholder |
- Tidak ada host Neon (`neon.tech`, `ep-…-pooler`), token GitHub, token Kaggle, atau file `.env`/`credentials.json`
  yang pernah di-commit.

## 2. Rahasia yang **tidak** ada di git tetapi sudah terpapar
| Rahasia | Di mana terpapar | Risiko | Tindakan (pemilik repo) |
| --- | --- | --- | --- |
| Token GitHub (PAT) | ditempel di chat Claude Code, 19 Nov | akses tulis ke repo | **Cabut** di GitHub → Settings → Developer settings → Personal access tokens → token itu → *Delete/Revoke* |
| Connection string Neon (password DB) | ditempel di chat Claude Code, 19 Nov | baca/tulis seluruh DB produksi | **Reset password** di Neon (Branches → main → Roles → *Reset password*), lalu perbarui `DATABASE_URL` + `DIRECT_URL` di Vercel → Settings → Environment Variables → **Redeploy** |
| Password akun seed | `prisma/seed.ts` di repo **publik**: semua akun demo `demo123`, superadmin `remedi123`; DB produksi Neon di-seed dengan nilai ini | siapa pun bisa login sebagai **superadmin** di https://remediaide.vercel.app | Ganti password semua akun seed di produksi (lihat §3) |
| `.env.vercel.local` (AUTH_SECRET acak) | hanya di laptop, di-ignore git | rendah | tidak perlu tindakan; jangan dibagikan |
| Kredensial Kaggle | `~/.kaggle/credentials.json` (di luar repo) | rendah | tidak perlu tindakan |

### Keputusan pemilik (20 Nov 2026)
Pemilik repo memutuskan **tidak** mencabut token GitHub lama dan **tidak** mereset password Neon; risiko dari dua rahasia
yang pernah ditempel di chat diterima secara sadar. Keduanya tidak pernah masuk git (pemindaian §1). Mitigasi yang tetap
berlaku: password akun seed di produksi diganti dengan `scripts/rotate-seed-passwords.ts` begitu kredensial database
tersedia lewat `npx vercel env pull` (tanpa reset Neon).

### Rotasi password akun seed — selesai 20 Nov 2026
`scripts/rotate-seed-passwords.ts` dijalankan ke database produksi (Neon `neon-celeste-sail`, terverifikasi berisi 5 akun
seed): 4 akun demo + 1 superadmin diganti dengan password acak baru yang hanya disimpan di
`~/Desktop/RAHASIA_password_seed.txt` (izin 600, di luar repo). Uji lewat request login ke https://remediaide.vercel.app
(`scripts/check_login.py`): password lama `demo123` dan `remedi123` **GAGAL** untuk kelima akun; password baru **OK**.

## 3. Cara mengganti password akun seed di produksi
Sejak commit Bagian A, `prisma/seed.ts` membaca `SEED_PASSWORD` dan `SEED_SUPERADMIN_PASSWORD` dari environment
(nilai lama hanya dipakai bila variabel kosong, dengan peringatan). Seed **tidak** mengubah akun yang sudah ada, jadi
untuk DB produksi gunakan skrip `scripts/rotate-seed-passwords.ts`:
```bash
cd ~/Downloads/remediaide-main/.worktrees/web
DATABASE_URL="<connection string Neon BARU, setelah reset>" \
SEED_PASSWORD="<password baru akun demo>" SEED_SUPERADMIN_PASSWORD="<password baru superadmin>" \
npx tsx scripts/rotate-seed-passwords.ts
```
Skrip hanya mengubah `passwordHash` akun berdomain `@remediaide.app` yang dibuat seed, dan mencetak jumlah akun yang
diubah (tanpa mencetak password).

## 4. Perlindungan yang sekarang berlaku
- `.gitignore`: `.env`, `.env.*` (kecuali `.env.example`), `.env*.local`, `credentials.json`, `kaggle.json`, `*.key`,
  `*.pem`, `*.p12`, `.huggingface/`, `**/hf_token*`, plus semua data (`ml/data/raw|interim|processed|pilot`, `*.parquet`).
- `ml/kaggle/kernels/*/kernel-metadata.json` asli (berisi username Kaggle) tetap di-ignore; yang di-commit adalah
  `kernel-metadata.template.json` (username = `{USER}`). Log dan metrik kernel ada di `ml/kaggle/evidence/`
  (`scripts/export_kaggle_evidence.py`, username diganti `<KAGGLE_USERNAME>`; tanpa parquet, bobot model, atau ID siswa).
- Jalankan ulang `cd ml && .venv/bin/python scripts/scan_secrets.py` sebelum setiap push (exit code 1 bila ada temuan asli).
