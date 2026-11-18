# Diagnosis Grouping Fix — Bugfix Design

## Overview

Fitur diagnosis remedial RemediAide menghasilkan **seluruh siswa selalu masuk kelompok "Data Kurang" (INSUFFICIENT_DATA)** meski semua soal sudah dijawab. Ini disebabkan oleh dua bug terpisah:

**Bug #1** — `aggregateMajorityVoting` di `src/lib/diagnostic/engine.ts` mensyaratkan `validItemCount >= 2` sebelum mengeluarkan status kognitif. Karena setiap siswa hanya mengerjakan **tepat 1 varian per soal** (ditentukan deterministik oleh quiz route), setiap grup `(studentId, questionId)` selalu hanya berisi 1 respons → selalu `INSUFFICIENT_DATA`.

**Bug #2** — `generateRemedialGroups` di `src/lib/diagnosis/compute.ts` mengelompokkan baris diagnosis (per soal per siswa) langsung ke kelompok berdasarkan `finalStatus`-nya. Satu siswa yang mengerjakan N soal bisa muncul di beberapa kelompok sekaligus, bukannya tepat satu kelompok.

**Strategi fix**: Ubah threshold Bug #1 dari `>= 2` menjadi `>= 1` — jika tepat 1 item valid, kembalikan status item itu langsung tanpa voting. Untuk Bug #2, hitung **status dominan per siswa** (majority voting atas semua `finalStatus` diagnosis siswa tersebut), lalu masukkan tiap siswa ke tepat satu kelompok.

---

## Glossary

- **Bug_Condition (C)**: Kondisi yang memicu bug — grup `(studentId, questionId)` yang memiliki tepat 1 respons valid setelah filtering INVALID
- **Property (P)**: Perilaku yang diharapkan — `aggregateMajorityVoting` dengan 1 item valid harus mengembalikan status kognitif item tersebut, bukan `INSUFFICIENT_DATA`
- **Preservation**: Perilaku existing yang tidak boleh berubah — voting dengan 0 item tetap `INSUFFICIENT_DATA`, voting dengan ≥2 item tetap menggunakan precedency rule, per-item classification tidak berubah, clean regeneration tetap berjalan
- **`aggregateMajorityVoting`**: Fungsi di `src/lib/diagnostic/engine.ts` yang mengagregasi array `DiagnosisResult[]` menjadi satu `AggregationResult` menggunakan majority voting + precedency rule
- **`generateRemedialGroups`**: Fungsi di `src/lib/diagnosis/compute.ts` yang memproses semua `ConceptDiagnosis` dalam satu sesi dan menulis `RemedialGroup` records ke database
- **`validItemCount`**: Jumlah item dalam array `DiagnosisResult` yang statusnya bukan `INVALID`
- **Status Dominan per Siswa**: Status kognitif yang paling sering muncul di semua diagnosis siswa tersebut dalam satu sesi; jika seri, ditentukan oleh precedency rule (MISKONSEPSI > LUCKY_GUESS > TIDAK_PAHAM > PAHAM_KONSEP)
- **`isBugCondition(X)`**: Fungsi pseudocode yang mengevaluasi apakah input X merupakan kondisi bug — yaitu tepat 1 item valid

---

## Bug Details

### Bug Condition

Bug #1 termanifestasi ketika `aggregateMajorityVoting` dipanggil dengan array yang setelah filtering INVALID hanya menyisakan tepat 1 item. Fungsi langsung mengembalikan `INSUFFICIENT_DATA` tanpa memeriksa bahwa 1 item sudah cukup untuk klasifikasi.

Bug #2 termanifestasi ketika `generateRemedialGroups` mengiterasi setiap baris `ConceptDiagnosis` dan langsung menggunakan `finalStatus`-nya sebagai kunci kelompok — tanpa terlebih dahulu menggabungkan semua diagnosis satu siswa menjadi satu status representatif.

**Formal Specification (Bug #1):**
```
FUNCTION isBugCondition(X)
  INPUT: X of type DiagnosisInput
         where DiagnosisInput = { results: DiagnosisResult[] }
  OUTPUT: boolean

  validResults ← X.results.filter(r => r.status ≠ INVALID)
  RETURN length(validResults) = 1
END FUNCTION
```

**Formal Specification (Bug #2):**
```
FUNCTION isBugConditionGrouping(S)
  INPUT: S of type StudentDiagnoses
         where StudentDiagnoses = { studentId, diagnoses: ConceptDiagnosis[] }
  OUTPUT: boolean

  // Bug terjadi ketika siswa memiliki >1 diagnosis dengan status berbeda
  // dan fungsi grouping tidak melakukan aggregasi per-siswa
  RETURN length(S.diagnoses) > 1
         AND distinctStatuses(S.diagnoses) > 1
         AND NOT aggregatedToSingleGroup(S.studentId)
END FUNCTION
```

### Examples

**Bug #1 — Concrete Examples:**

| Input | validItemCount | Perilaku Saat Ini (Bug) | Perilaku Seharusnya |
|-------|---------------|--------------------------|---------------------|
| 1 response: `isCorrect=true, CRI=4` | 1 | `INSUFFICIENT_DATA` | `PAHAM_KONSEP` |
| 1 response: `isCorrect=true, CRI=1` | 1 | `INSUFFICIENT_DATA` | `LUCKY_GUESS` |
| 1 response: `isCorrect=false, CRI=4` | 1 | `INSUFFICIENT_DATA` | `MISKONSEPSI` |
| 1 response: `isCorrect=false, CRI=1` | 1 | `INSUFFICIENT_DATA` | `TIDAK_PAHAM` |
| 1 response INVALID + 0 valid | 0 | `INSUFFICIENT_DATA` | `INSUFFICIENT_DATA` ✓ |
| 2 responses valid | 2 | majority voting ✓ | majority voting ✓ |

**Bug #2 — Concrete Examples:**

Sesi dengan 3 soal, siswa "S-01" memiliki diagnosis:
- Soal 1 → `PAHAM_KONSEP`
- Soal 2 → `PAHAM_KONSEP`
- Soal 3 → `MISKONSEPSI`

| Perilaku Saat Ini (Bug) | Perilaku Seharusnya |
|--------------------------|---------------------|
| S-01 muncul di kelompok PAHAM_KONSEP **DAN** MISKONSEPSI | S-01 muncul **hanya** di kelompok PAHAM_KONSEP (status dominan: 2 vs 1) |

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- `aggregateMajorityVoting` dengan 0 item valid harus tetap mengembalikan `INSUFFICIENT_DATA`
- `aggregateMajorityVoting` dengan ≥2 item valid harus tetap menerapkan majority voting + precedency rule (MISKONSEPSI > LUCKY_GUESS > TIDAK_PAHAM > PAHAM_KONSEP) saat terjadi tie
- Fungsi `classifyPerItem` dan seluruh logika per-item classification tidak boleh berubah
- Respons dengan `responseTimeMs < tauMinMs` harus tetap diklasifikasikan sebagai `INVALID` dan dikecualikan dari voting
- `generateRemedialGroups` harus tetap menghapus grup lama sebelum membuat grup baru (clean regeneration / idempoten)
- Siswa dengan status dominan `INSUFFICIENT_DATA` (semua respons INVALID atau tidak ada data) harus tetap masuk kelompok "Data Kurang"
- Integritas struktur `RemedialGroup` di database tidak berubah (setiap siswa muncul di tepat satu grup)

**Scope:**
Semua input yang TIDAK memenuhi `isBugCondition` (yaitu: 0 item valid atau ≥2 item valid) harus sepenuhnya tidak terpengaruh oleh fix Bug #1. Fix Bug #2 hanya mengubah logika aggregasi di `generateRemedialGroups` — tidak ada perubahan pada fungsi classification atau data pipeline lainnya.

---

## Hypothesized Root Cause

### Bug #1 — `aggregateMajorityVoting` threshold terlalu tinggi

1. **Threshold Desain Asumsi Keliru**: Kode asli ditulis dengan asumsi satu konsep diuji oleh ≥2 varian (misalnya 3 varian per soal). Dalam implementasi aktual, quiz route menentukan tepat 1 varian per soal secara deterministik, sehingga `validItemCount` selalu bernilai 1.
   - Baris yang bermasalah: `if (validItemCount < 2)` di `engine.ts:180`
   - Nilai threshold yang benar: `< 1` (yaitu hanya return `INSUFFICIENT_DATA` jika tidak ada item valid sama sekali)

2. **Tidak Ada Unit Test yang Menangkap Kasus 1-Item**: Test suite tidak mencakup skenario `aggregateMajorityVoting([singleValidResult])`, sehingga bug tidak terdeteksi saat development.

### Bug #2 — `generateRemedialGroups` tidak melakukan aggregasi per siswa

1. **Iterasi Langsung Tanpa Aggregasi**: Fungsi mengiterasi setiap baris `ConceptDiagnosis` dan langsung menggunakan `d.finalStatus` sebagai kunci `Map`, tanpa melakukan aggregasi per siswa terlebih dahulu.
   - Kode bermasalah di `compute.ts`:
     ```typescript
     for (const d of diagnoses) {
       const status = d.finalStatus as string;
       if (!grouped.has(status)) grouped.set(status, []);
       grouped.get(status)!.push(d.student.anonymousLabel);
     }
     ```
   - Satu `anonymousLabel` dapat di-push ke beberapa status berbeda jika siswa memiliki diagnosis yang berbeda-beda per soal.

2. **Konsep "Status Dominan per Siswa" Tidak Diimplementasikan**: Tidak ada tahap intermediate yang menghitung status mana yang paling representatif untuk satu siswa secara keseluruhan dalam satu sesi.

---

## Correctness Properties

Property 1: Bug Condition — Single Valid Item Returns Meaningful Status

_For any_ `DiagnosisResult[]` input where `isBugCondition` returns true (exactly 1 valid item after filtering INVALID), the fixed `aggregateMajorityVoting` function SHALL return `finalStatus` equal to the status of that single valid item, and `finalStatus` SHALL NOT be `INSUFFICIENT_DATA`.

**Validates: Requirements 2.1, 2.2**

---

Property 2: Preservation — Zero Valid Items Still Returns INSUFFICIENT_DATA

_For any_ `DiagnosisResult[]` input where `validItemCount = 0` (isBugCondition returns false — no valid items), the fixed `aggregateMajorityVoting` SHALL continue to return `finalStatus = INSUFFICIENT_DATA`, identical to the original function.

**Validates: Requirements 3.1**

---

Property 3: Preservation — Multi-Item Voting Unchanged

_For any_ `DiagnosisResult[]` input where `validItemCount >= 2` (isBugCondition returns false — multiple valid items), the fixed `aggregateMajorityVoting` SHALL produce exactly the same `finalStatus`, `votingTally`, and `tiebreakerApplied` as the original function, preserving majority voting + precedency rule behavior.

**Validates: Requirements 3.2**

---

Property 4: Bug Condition — Each Student Appears in Exactly One Remedial Group

_For any_ session where `generateRemedialGroups` is called and students have multiple diagnoses across questions, the fixed function SHALL compute a dominant status per student (majority voting over all their diagnoses), then assign each student to exactly one `RemedialGroup` — no student `anonymousLabel` shall appear in more than one group's `memberLabels`.

**Validates: Requirements 2.3, 2.4**

---

Property 5: Preservation — Grouping Dominant-Status Tie Uses Precedency Rule

_For any_ student whose diagnoses result in a tie (two or more statuses share the highest frequency), the fixed `generateRemedialGroups` SHALL resolve the tie using the precedency rule (MISKONSEPSI > LUCKY_GUESS > TIDAK_PAHAM > PAHAM_KONSEP), identical to how `aggregateMajorityVoting` resolves ties.

**Validates: Requirements 2.3, 3.2**

---

## Fix Implementation

### Bug #1 — `src/lib/diagnostic/engine.ts`

**Function**: `aggregateMajorityVoting`

**Specific Changes**:

1. **Ubah threshold dari `< 2` menjadi `< 1`**:
   ```typescript
   // SEBELUM (buggy):
   if (validItemCount < 2) {
     return { finalStatus: 'INSUFFICIENT_DATA', ... };
   }

   // SESUDAH (fixed):
   if (validItemCount < 1) {
     return { finalStatus: 'INSUFFICIENT_DATA', ... };
   }
   ```

2. **Tambah fast-path untuk tepat 1 item valid** (hindari overhead voting):
   ```typescript
   if (validItemCount === 1) {
     return {
       finalStatus: validResults[0].status,
       votingTally,
       tiebreakerApplied: false,
       validItemCount: 1,
     };
   }
   ```
   Fast-path ini ditempatkan setelah blok `validItemCount < 1` dan sebelum logika voting.

3. **Tidak ada perubahan lain** — blok voting dengan ≥2 items tetap identik.

### Bug #2 — `src/lib/diagnosis/compute.ts`

**Function**: `generateRemedialGroups`

**Specific Changes**:

1. **Tambah query untuk mendapatkan semua diagnosis per siswa** (group by studentId):
   ```typescript
   // Query sudah ada, tinggal ubah select untuk include studentId
   const diagnoses = await prisma.conceptDiagnosis.findMany({
     where: { sessionPinId: sessionId },
     select: {
       finalStatus: true,
       studentId: true,
       student: { select: { anonymousLabel: true } },
     },
   });
   ```

2. **Tahap 1 — Aggregasi per siswa**: Untuk setiap siswa, kumpulkan semua `finalStatus` diagnosis mereka, lalu terapkan majority voting + precedency rule:
   ```typescript
   // Kumpulkan semua status per studentId
   const perStudent = new Map<string, { label: string; statuses: string[] }>();
   for (const d of diagnoses) {
     if (!perStudent.has(d.studentId)) {
       perStudent.set(d.studentId, { label: d.student.anonymousLabel, statuses: [] });
     }
     perStudent.get(d.studentId)!.statuses.push(d.finalStatus);
   }

   // Hitung status dominan per siswa
   const studentDominant = new Map<string, { label: string; dominantStatus: string }>();
   for (const [studentId, data] of perStudent.entries()) {
     const dominant = computeDominantStatus(data.statuses);
     studentDominant.set(studentId, { label: data.label, dominantStatus: dominant });
   }
   ```

3. **Tahap 2 — Kelompokkan berdasarkan status dominan** (bukan per-baris diagnosis):
   ```typescript
   const grouped = new Map<string, string[]>();
   for (const { label, dominantStatus } of studentDominant.values()) {
     if (!grouped.has(dominantStatus)) grouped.set(dominantStatus, []);
     grouped.get(dominantStatus)!.push(label);
   }
   ```

4. **Ekstrak helper `computeDominantStatus`** (pure function, dapat ditest mandiri):
   ```typescript
   function computeDominantStatus(statuses: string[]): string {
     if (statuses.length === 0) return 'INSUFFICIENT_DATA';
     const tally: Record<string, number> = {};
     for (const s of statuses) tally[s] = (tally[s] ?? 0) + 1;
     const maxFreq = Math.max(...Object.values(tally));
     const candidates = Object.entries(tally)
       .filter(([, freq]) => freq === maxFreq)
       .map(([s]) => s);
     if (candidates.length === 1) return candidates[0];
     // Tie-break dengan precedency rule
     const PRECEDENCY = ['MISKONSEPSI', 'LUCKY_GUESS', 'TIDAK_PAHAM', 'PAHAM_KONSEP'];
     return PRECEDENCY.find(s => candidates.includes(s)) ?? 'INSUFFICIENT_DATA';
   }
   ```

---

## Testing Strategy

### Validation Approach

Pengujian menggunakan dua fase: pertama **Exploratory Bug Condition Checking** pada kode yang belum difix untuk mengkonfirmasi root cause, kemudian **Fix Checking** dan **Preservation Checking** setelah fix diterapkan. Property-based testing digunakan untuk preservation checking karena dapat men-generate banyak kombinasi input secara otomatis.

---

### Exploratory Bug Condition Checking

**Goal**: Menunjukkan counterexample yang membuktikan bug SEBELUM fix diimplementasikan. Mengkonfirmasi atau menyangkal root cause analysis.

**Test Plan**: Panggil `aggregateMajorityVoting` langsung dengan array berisi tepat 1 `DiagnosisResult` valid, dan panggil `generateRemedialGroups` dengan data yang mensimulasikan siswa multi-soal.

**Test Cases**:

1. **Single PAHAM_KONSEP Item**: Panggil `aggregateMajorityVoting([{status:'PAHAM_KONSEP',...}])` → ekspektasi `PAHAM_KONSEP`, tapi kode saat ini mengembalikan `INSUFFICIENT_DATA` *(akan GAGAL pada kode unfixed)*
2. **Single MISKONSEPSI Item**: Panggil `aggregateMajorityVoting([{status:'MISKONSEPSI',...}])` → ekspektasi `MISKONSEPSI`, tapi kode saat ini mengembalikan `INSUFFICIENT_DATA` *(akan GAGAL pada kode unfixed)*
3. **Multi-diagnosis Student Grouping**: Simulasi siswa dengan 3 diagnosis berbeda status → ekspektasi siswa muncul di satu kelompok, tapi kode saat ini bisa memasukkan ke beberapa kelompok *(akan GAGAL pada kode unfixed)*
4. **All Responses Invalid**: Panggil `aggregateMajorityVoting([{status:'INVALID',...}])` → ekspektasi `INSUFFICIENT_DATA` *(masih BENAR pada kode unfixed — bukan bug condition)*

**Expected Counterexamples**:
- `aggregateMajorityVoting` mengembalikan `INSUFFICIENT_DATA` alih-alih status kognitif yang valid untuk input 1 item
- Satu `anonymousLabel` siswa muncul di lebih dari satu `RemedialGroup.memberLabels`

---

### Fix Checking

**Goal**: Verifikasi bahwa untuk semua input di mana `isBugCondition` bernilai true, fungsi yang sudah difix menghasilkan perilaku yang diharapkan.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result ← aggregateMajorityVoting_fixed(input)
  ASSERT result.finalStatus ∈ { PAHAM_KONSEP, LUCKY_GUESS, MISKONSEPSI, TIDAK_PAHAM }
  ASSERT result.finalStatus ≠ INSUFFICIENT_DATA
  ASSERT result.finalStatus = input.validResults[0].status
END FOR

FOR ALL session WHERE multiDiagnosisStudentExists(session) DO
  groups ← generateRemedialGroups_fixed(session)
  FOR ALL student IN session DO
    appearances ← count(groups WHERE student.label IN group.memberLabels)
    ASSERT appearances = 1
  END FOR
END FOR
```

---

### Preservation Checking

**Goal**: Verifikasi bahwa untuk semua input di mana `isBugCondition` bernilai false, fungsi yang sudah difix menghasilkan hasil yang identik dengan fungsi original.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT aggregateMajorityVoting_original(input) = aggregateMajorityVoting_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing direkomendasikan karena:
- Men-generate kombinasi jumlah items dan status yang banyak secara otomatis
- Menangkap edge case yang mungkin terlewat oleh unit test manual
- Memberikan jaminan kuat bahwa perilaku tidak berubah untuk semua kasus non-buggy

**Test Plan**: Observasi bahwa kasus 0 item dan ≥2 item bekerja benar pada kode unfixed, lalu tulis property-based test yang memverifikasi perilaku ini tetap identik setelah fix.

**Test Cases**:
1. **Zero Valid Items Preservation**: Verifikasi `aggregateMajorityVoting([])` dan `aggregateMajorityVoting([INVALID])` tetap mengembalikan `INSUFFICIENT_DATA` setelah fix
2. **Multi-Item Voting Preservation**: Generate array 2–10 item valid dengan status acak, verifikasi `finalStatus` dan `tiebreakerApplied` identik antara original dan fixed
3. **Tie-breaking Preservation**: Verifikasi precedency rule (MISKONSEPSI > LUCKY_GUESS > TIDAK_PAHAM > PAHAM_KONSEP) tetap benar setelah fix
4. **Clean Regeneration Preservation**: Verifikasi `generateRemedialGroups` tetap menghapus grup lama sebelum membuat yang baru

---

### Unit Tests

- Test `aggregateMajorityVoting` dengan 0, 1, 2, dan 3 item valid secara eksplisit
- Test `computeDominantStatus` helper dengan semua kombinasi tie dan non-tie
- Test bahwa setiap siswa muncul di tepat satu kelompok setelah `generateRemedialGroups`
- Test edge case: semua respons INVALID, satu siswa mengerjakan satu soal, satu siswa mengerjakan semua soal

### Property-Based Tests

- Generate array `DiagnosisResult[]` acak dengan `validItemCount ≥ 2`: verifikasi `aggregateMajorityVoting_fixed` menghasilkan hasil identik dengan `aggregateMajorityVoting_original`
- Generate array `DiagnosisResult[]` dengan `validItemCount = 0`: verifikasi tetap `INSUFFICIENT_DATA`
- Generate banyak konfigurasi status siswa: verifikasi setiap siswa muncul di tepat satu kelompok
- Generate skenario tie di berbagai posisi precedency: verifikasi `computeDominantStatus` selalu memilih sesuai urutan MISKONSEPSI > LUCKY_GUESS > TIDAK_PAHAM > PAHAM_KONSEP

### Integration Tests

- Test full pipeline dari `computeConceptDiagnosis` hingga `RemedialGroup` creation dengan sesi mock (1 siswa, 1 soal, 1 respons valid)
- Test bahwa counter status pada UI menampilkan nilai akurat setelah fix (bukan semua nol)
- Test idempotency: memanggil `POST /api/sessions/:id/groups` dua kali menghasilkan data yang identik
- Test dengan sesi yang memiliki campuran respons valid dan INVALID per siswa
