# Bugfix Requirements Document

## Introduction

Setelah guru mengklik "Generate Kelompok Remedial" pada halaman hasil sesi, **semua siswa selalu masuk ke grup "Data Kurang" (INSUFFICIENT_DATA)** meskipun mereka sudah mengerjakan semua soal sampai selesai. Counter untuk Paham Konsep, Lucky Guess, Miskonsepsi, dan Tidak Paham semuanya menunjukkan angka 0. Dampaknya, fitur diagnosis remedial tidak berfungsi sama sekali — guru tidak mendapatkan pengelompokan yang bermakna untuk intervensi pedagogis.

Bug ini disebabkan oleh ketidakcocokan antara threshold minimum di fungsi `aggregateMajorityVoting` (mensyaratkan ≥2 item valid per grup) dan model data aktual di mana setiap siswa hanya mengerjakan **tepat 1 varian per soal** (ditentukan secara deterministik oleh quiz route). Akibatnya, setiap grup `(studentId, questionId)` selalu hanya berisi 1 response, sehingga selalu menghasilkan `INSUFFICIENT_DATA`.

Selain itu, fungsi `generateRemedialGroups` mengelompokkan siswa berdasarkan `finalStatus` *per diagnosis* (per soal per siswa), bukan berdasarkan status **dominan** per siswa. Ini menyebabkan satu siswa bisa muncul di beberapa kelompok sekaligus.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN seorang siswa mengerjakan semua soal dalam sesi (masing-masing 1 respons per soal) THEN sistem menghasilkan `INSUFFICIENT_DATA` untuk setiap pasangan `(siswa, soal)` karena `aggregateMajorityVoting` mensyaratkan `validItemCount >= 2`

1.2 WHEN `aggregateMajorityVoting` dipanggil dengan tepat 1 item valid THEN sistem mengembalikan `finalStatus = INSUFFICIENT_DATA` meskipun 1 respons sudah cukup untuk mengklasifikasikan status kognitif

1.3 WHEN `generateRemedialGroups` memproses hasil diagnosis THEN sistem mengelompokkan `anonymousLabel` siswa berdasarkan `finalStatus` per-baris diagnosis (per soal), sehingga satu siswa dapat muncul di beberapa kelompok berbeda sekaligus

1.4 WHEN semua `ConceptDiagnosis` bernilai `INSUFFICIENT_DATA` THEN sistem menampilkan seluruh siswa (dengan kemungkinan duplikasi) dalam satu kelompok "Data Kurang" dan semua counter status lain bernilai 0

### Expected Behavior (Correct)

2.1 WHEN seorang siswa mengerjakan semua soal dalam sesi (masing-masing 1 respons per soal) THEN sistem SHALL menghasilkan diagnosis status yang bermakna (PAHAM_KONSEP, LUCKY_GUESS, MISKONSEPSI, atau TIDAK_PAHAM) berdasarkan satu respons valid per soal, bukan INSUFFICIENT_DATA

2.2 WHEN `aggregateMajorityVoting` dipanggil dengan tepat 1 item valid THEN sistem SHALL mengembalikan status kognitif dari item valid tersebut secara langsung (tanpa voting), karena 1 respons sudah cukup untuk klasifikasi

2.3 WHEN `generateRemedialGroups` memproses hasil diagnosis per siswa THEN sistem SHALL menghitung **status dominan per siswa** (majority voting atas semua soal yang dijawab siswa tersebut), lalu memasukkan setiap siswa ke tepat satu kelompok berdasarkan status dominannya

2.4 WHEN sesi memiliki cukup respons dan semua diagnosis berhasil dikompute THEN sistem SHALL menampilkan counter yang akurat untuk setiap kategori status (Paham Konsep, Lucky Guess, Miskonsepsi, Tidak Paham) dengan siswa terdistribusi ke kelompok yang sesuai

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `aggregateMajorityVoting` dipanggil dengan 0 item valid THEN sistem SHALL CONTINUE TO mengembalikan `INSUFFICIENT_DATA` (tidak ada data yang bisa diklasifikasi)

3.2 WHEN `aggregateMajorityVoting` dipanggil dengan 2 atau lebih item valid THEN sistem SHALL CONTINUE TO menerapkan majority voting dengan precedency rule (MISKONSEPSI > LUCKY_GUESS > TIDAK_PAHAM > PAHAM_KONSEP) pada saat terjadi seri

3.3 WHEN sebuah respons siswa memiliki `responseTimeMs < tauMinMs` THEN sistem SHALL CONTINUE TO mengklasifikasikan item tersebut sebagai INVALID dan mengecualikannya dari voting

3.4 WHEN `generateRemedialGroups` dieksekusi THEN sistem SHALL CONTINUE TO menghapus grup lama sebelum membuat grup baru (clean regeneration)

3.5 WHEN sebuah siswa memiliki status dominan INSUFFICIENT_DATA (semua respons menghasilkan INVALID atau tidak ada data) THEN sistem SHALL CONTINUE TO memasukkan siswa tersebut ke kelompok "Data Kurang"

3.6 WHEN teacher mengklik "Generate Kelompok Remedial" berkali-kali THEN sistem SHALL CONTINUE TO menghasilkan hasil yang konsisten (idempoten)

---

## Bug Condition

**Bug Condition Function:**
```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type DiagnosisGroup
         where DiagnosisGroup = { studentId, questionId, responses: Response[] }
  OUTPUT: boolean
  
  // Bug terjadi saat jumlah respons valid dalam grup tepat 1
  RETURN length(X.responses.filter(r => r.status != INVALID)) = 1
END FUNCTION
```

**Property: Fix Checking**
```pascal
// Untuk setiap grup (studentId, questionId) dengan tepat 1 respons valid,
// diagnosis harus menghasilkan status kognitif yang bermakna, bukan INSUFFICIENT_DATA
FOR ALL X WHERE isBugCondition(X) DO
  result ← computeConceptDiagnosis'(X)
  ASSERT result.finalStatus IN { PAHAM_KONSEP, LUCKY_GUESS, MISKONSEPSI, TIDAK_PAHAM }
  ASSERT result.finalStatus != INSUFFICIENT_DATA
END FOR
```

**Preservation Goal:**
```pascal
// Untuk grup dengan 0 item valid, perilaku tetap sama (INSUFFICIENT_DATA)
// Untuk grup dengan ≥2 item valid, perilaku voting tetap sama
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT computeConceptDiagnosis(X) = computeConceptDiagnosis'(X)
END FOR
```
