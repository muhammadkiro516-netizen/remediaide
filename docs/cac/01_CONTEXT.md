# 01 — Konteks: lomba, konsep, kondisi aplikasi, fakta riset

## A. Lomba (sumber: slide Technical Meeting CAC MLSC, 12 Nov 2026)
- Penyelenggara: Laboratorium EDM bersama Departemen AKSI. Cabang: Machine Learning Solution Challenge.
- Wajib mengangkat minimal 1 dari 17 SDGs. Data harus relevan, valid, dan sumbernya dicantumkan.
- Wajib menyerahkan **source code** (notebook/python/github) dan **dataset**. Bahasa dan library bebas.
- Karya orisinal. Plagiarisme, manipulasi data, atau karya pihak lain tanpa atribusi berujung diskualifikasi.
  Panitia berhak memverifikasi source code dan model.
- Batas penyisihan: **28 November 2026**. 5 tim terbaik lolos. TM final 30 November 2026.
- Final: presentasi, demo (jika ada), tanya jawab. Dinilai: kualitas solusi, implementasi ML, inovasi,
  dampak, kemampuan presentasi dan mempertahankan hasil.

| Aspek penyisihan | Bobot | Isi |
| --- | --- | --- |
| Perumusan Permasalahan | 15% | Latar belakang, relevansi, keterkaitan SDG |
| Pengolahan & Kualitas Data | 20% | Kesesuaian dataset, preprocessing, feature engineering, kualitas data |
| Implementasi ML | 25% | Pemilihan algoritma, training, tuning, implementasi |
| Evaluasi Model | 20% | Metrik yang sesuai, interpretasi, performa |
| Inovasi & Dampak | 20% | Kebaruan, kreativitas, potensi implementasi |

Status orisinalitas: menurut tim, panitia mengizinkan pemakaian konsep RemediAide karena yang dikembangkan
adalah ML-nya. README submisi wajib memuat satu paragraf riwayat: v1 (aturan CRI tanpa ML) pernah ikut
versi awal sebelumnya, sedangkan seluruh komponen ML, dataset, eksperimen, dan hasil di sini baru.

## B. Konsep RemediAide 2.0
**Tagline:** bukan sekadar siapa yang salah, tapi kenapa salah, seberapa yakin mesinnya, dan apa yang
dilakukan guru besok pagi.

**Masalah:** CRI 2×2 (benar/salah × yakin/tidak) adalah aturan tetap. Aturan ini punya tiga titik buta:
1. **Jebakan jawaban benar:** siswa yang benar dengan nalar keliru otomatis dianggap "Paham".
2. **Miskonsepsi tanpa nama:** tidak ada keterangan miskonsepsi yang mana.
3. **Tidak tahu kapan dirinya salah:** aturan tidak punya ketidakpastian, jadi tidak bisa menyerahkan kasus sulit ke guru.

**SDG:** 4.1 (utama, hasil belajar matematika), 10.2 (fairness, mode offline), 4.c (waktu guru).

**Empat kontribusi:**
1. CRI yang dipelajari dari data.
2. Diagnosis bernama, termasuk pada jawaban benar.
3. Model yang tahu batasnya (conformal dan selective prediction).
4. Siap untuk Indonesia (lintas bahasa, offline).

**Angka utama yang dikejar (template, isi dari hasil nyata):** "Aturan CRI salah mengelompokkan [X]% siswa.
RemediAide 2.0 menurunkannya menjadi [Y]%, dan [Z]% kasus paling meragukan diserahkan ke guru."

## C. Kondisi aplikasi v1 (hasil audit 18 Nov)
- Next.js 14 App Router, TypeScript, Prisma/PostgreSQL, BullMQ/Redis (opsional, no-op tanpa REDIS_URL),
  SSE heatmap, PWA, NextAuth v5 beta, pdf-lib (LKPD), Vitest + fast-check + Playwright.
- Kode lengkap: 70 file halaman dan route API, tidak ada import yang hilang, 123 unit test modul inti lulus.
- Yang hilang: `prisma/migrations/` (di-gitignore, buat ulang), `.env.example` (disebut README, tidak ada).
- Mesin diagnosis: `src/lib/diagnostic/engine.ts` (aturan), `src/lib/diagnosis/compute.ts` (pipeline,
  voting, kelompok remedial). Tabel `Response` menyimpan `chosenOptionKey`, `criValue`, `responseTimeMs`.
- Ada `CalibrationConfig` + `/api/variants/[id]/calibration` (status manual) dan route override kelompok.
  Keduanya titik masuk ML.
- **Ketidaksesuaian dokumen desain v1 vs kode** (laporan wajib memakai versi kode = B0):
  - Proposal: ambang CRI 2,5, penalti asimetris dengan α hanya untuk jawaban salah, syarat Aᵢ ≥ 0,7.
  - Kode: `cri >= 3`, semua respons di bawah τmin langsung INVALID (termasuk yang benar), rumus Iᵢ berbeda,
    voting per soal lintas varian.
  - Di Eedi kedua ambang setara (lihat DECISIONS D-03).
- Landing page: label kompetisi lama (page.tsx baris 268 dan 689), statistik tanpa sumber
  ("68%", "3× lebih berbahaya", PISA 2022), dan link footer placeholder. Diperbaiki di T67.

## D. Fakta riset yang boleh dikutip (dengan sumber)
| Fakta | Sumber |
| --- | --- |
| PISA 2025: 17% siswa Indonesia mencapai minimal Level 2 matematika (OECD 65%), sama dengan 2022; porsi siswa berkemampuan rendah naik 14 poin persen sejak 2015. Dirilis 8 Sep 2026. | https://www.oecd.org/en/publications/pisa-2025-results-volume-i-country-notes_2d4ff9ea-en/indonesia_9c880f8a-en.html |
| Rapor Pendidikan 2025 numerasi (capai kompetensi minimum): SD 59,45%, SMP 70,81%, SMA 67,14%, SMK 60,22%; semua "Sedang". Dirilis 18 Jun 2026. | https://www.gebrak.id/?p=18182 |
| 86% sekolah (±190.000) belum punya akses internet tetap (Komdigi, Jun 2025). | https://www.fortuneidn.com/tech/pemerintah-genjot-internet-100-mbps-di-sekolah-dan-puskesmas-00-6cmtl-glh57b |
| CRI diperkenalkan oleh Hasan, Bagayoko & Kelley (1999), Physics Education 34(5). | https://iopscience.iop.org/article/10.1088/0031-9120/34/5/304 |
| Menerapkan model Hasan langsung pada skor mentah menghasilkan kesimpulan yang tidak akurat. | https://repository.up.ac.za/handle/2263/16658 |
| Jebakan jawaban benar: 1,6% respons di data Eedi. BERT fine-tune menangkap 57,4% (CI 44,5–69,4); Gemma 4 26B 83,6% dengan FPR 18%. | https://arxiv.org/pdf/2606.23205 |
| Menyerahkan 20% prediksi paling tidak pasti ke guru: AUC +1,9–2,4 poin (DKT/SAKT/AKT, Eedi). | https://arxiv.org/pdf/2509.21514 |
| Option tracing: knowledge tracing yang memprediksi opsi persis yang dipilih. | https://arxiv.org/pdf/2104.09043 |
| NIPS34 (Eedi Task 3&4) AUC: DKT 0,7689; SAKT 0,7517; AKT 0,8033; simpleKT 0,8035; IEKT 0,8045 (split per sekuens siswa, 20% test, 5-fold). | https://arxiv.org/pdf/2302.06881 |
| Eedi 2020 Task 3&4: 948 soal, 4.918 siswa, 1.382.727 jawaban. Lisensi CC BY-NC-ND 4.0. | https://eedi.com/projects/neurips-education-challenge |
| Dataset MAP/MIME: 52.463 alasan (38.095 asli, 14.368 sintetis) untuk 15 soal. 24% dilabeli ganda, kappa 0,70–0,90. | https://aclanthology.org/2025.aimecon-wip.3.pdf |
| MAP Kaggle: batas emas MAP@3 0,94792, pemenang memakai Qwen3-32B. Qwen-3-4B fine-tune 0,9472; GPT-5 tanpa fine-tune 0,8137. | https://zenn.dev/mkj/articles/1f374627377474 , https://arxiv.org/pdf/2605.14752 |
| Test set Kaggle MAP memakai ID soal yang sama dengan train, sehingga skor leaderboard lebih tinggi daripada generalisasi nyata. | https://huggingface.co/lyixuan0718/map-deberta-v3-large-5fold |
| Data MAP tercatat berlisensi MIT di Kaggle. | https://huggingface.co/datasets/kaggle-map/data/discussions/2 |
| Teaching at the Right Level: +0,07 sampai 0,70 SD (evaluasi acak, India). | https://www.povertyactionlab.org/id/node/4537?lang=en |
| Belum ada ambang tebakan cepat yang disepakati. Metode normative threshold (NT10 dst.) umum dipakai. | https://link.springer.com/10.1186/s40536-021-00110-8 |
| UU PDP Pasal 25: pemrosesan data anak wajib persetujuan orang tua/wali. | https://id.wikisource.org/wiki/Halaman:UU_Nomor_27_Tahun_2022_Tentang_Perlindungan_Data_Pribadi.pdf/13 |
| opus-mt-en-id berlisensi Apache-2.0. | https://huggingface.co/Helsinki-NLP/opus-mt-en-id |
| Interpretasi kappa Landis & Koch: 0,61–0,80 substantial, 0,81–1,00 almost perfect. | https://bmchealthservres.biomedcentral.com/articles/10.1186/s12913-016-1655-4/tables/1 |

**Klaim yang tidak boleh dibuat:** "pertama di Indonesia/dunia" (kecuali sudah ditelusuri), angka dampak
belajar sebelum E10 dijalankan, angka validasi pada siswa Indonesia sebelum data pilot ada.
