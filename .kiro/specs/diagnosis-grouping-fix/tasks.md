# Implementation Plan

## Overview

Implementasi fix untuk dua bug pada fitur diagnosis remedial:
- **Bug #1**: `aggregateMajorityVoting` di `engine.ts` — ubah threshold dari `< 2` ke `< 1`, tambah fast-path untuk 1 item valid
- **Bug #2**: Refactor `generateRemedialGroups` di `compute.ts` — ekstrak helper `computeDominantStatus`, aggregasi per siswa dulu baru kelompokkan

Urutan kerja mengikuti metodologi exploratory bugfix: tulis tes eksplorasi dulu (sebelum fix), lalu terapkan fix, lalu verifikasi.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2"] },
    { "wave": 2, "tasks": ["3", "4"] },
    { "wave": 3, "tasks": ["5"] }
  ]
}
```

## Tasks

- [ ] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Single Valid Item Returns INSUFFICIENT_DATA (Bug #1)
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists in `aggregateMajorityVoting`
  - **Scoped PBT Approach**: Scope the property to the 4 concrete failing cases (one per cognitive status) to ensure reproducibility
  - Write property-based test in `src/lib/diagnostic/__tests__/engine.bug-condition.test.ts`
  - Test case A: `aggregateMajorityVoting([{ status: 'PAHAM_KONSEP', ... }])` → assert `finalStatus = 'PAHAM_KONSEP'`, NOT `'INSUFFICIENT_DATA'`
  - Test case B: `aggregateMajorityVoting([{ status: 'MISKONSEPSI', ... }])` → assert `finalStatus = 'MISKONSEPSI'`
  - Test case C: `aggregateMajorityVoting([{ status: 'LUCKY_GUESS', ... }])` → assert `finalStatus = 'LUCKY_GUESS'`
  - Test case D: `aggregateMajorityVoting([{ status: 'TIDAK_PAHAM', ... }])` → assert `finalStatus = 'TIDAK_PAHAM'`
  - Use property-based testing (fast-check or vitest with `fc.assert`) to generate all valid single-item inputs
  - `isBugCondition(input)`: `input.results.filter(r => r.status !== 'INVALID').length === 1`
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS — `aggregateMajorityVoting` returns `INSUFFICIENT_DATA` for all 4 cases (confirms bug exists)
  - Document counterexamples found (e.g., `aggregateMajorityVoting([pahamKonsepItem])` → `INSUFFICIENT_DATA`)
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.2_

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Zero and Multi-Item Voting Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Write property-based tests in `src/lib/diagnostic/__tests__/engine.preservation.test.ts`
  - **Observe on unfixed code** — zero-item case: `aggregateMajorityVoting([])` returns `INSUFFICIENT_DATA` ✓
  - **Observe on unfixed code** — single-INVALID case: `aggregateMajorityVoting([{ status: 'INVALID' }])` returns `INSUFFICIENT_DATA` ✓
  - **Observe on unfixed code** — multi-item case (≥2 valid): majority voting + precedency rule produces correct `finalStatus` and `tiebreakerApplied`
  - Write `Property 2a`: for all inputs where `validItemCount = 0`, `finalStatus` SHALL remain `INSUFFICIENT_DATA`
  - Write `Property 2b`: for all randomly-generated arrays with `validItemCount >= 2` valid items, the fixed function SHALL produce the same `finalStatus`, `votingTally`, and `tiebreakerApplied` as the current (pre-fix) function snapshot
  - Use fast-check to generate: arrays of 2–10 DiagnosisResult with random status values from `['PAHAM_KONSEP', 'LUCKY_GUESS', 'MISKONSEPSI', 'TIDAK_PAHAM', 'INVALID']`
  - Also cover tie-breaking: generate arrays where two statuses share maxFreq → verify precedency order (MISKONSEPSI > LUCKY_GUESS > TIDAK_PAHAM > PAHAM_KONSEP) is applied
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: All preservation tests PASS (confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2_

- [ ] 3. Fix Bug #1 — `aggregateMajorityVoting` threshold terlalu tinggi

  - [ ] 3.1 Ubah threshold dan tambah fast-path di `src/lib/diagnostic/engine.ts`
    - Ubah baris `if (validItemCount < 2)` menjadi `if (validItemCount < 1)` (baris ~180)
    - Tambah blok fast-path setelah guard zero-item dan sebelum blok voting:
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
    - Tidak ada perubahan lain — blok voting ≥2 items tetap identik
    - _Bug_Condition: `isBugCondition(X)` di mana `X.results.filter(r => r.status !== 'INVALID').length === 1`_
    - _Expected_Behavior: `aggregateMajorityVoting` mengembalikan `finalStatus = validResults[0].status`, bukan `INSUFFICIENT_DATA`_
    - _Preservation: 0 item valid tetap `INSUFFICIENT_DATA`; ≥2 item valid tetap majority voting + precedency rule_
    - _Requirements: 2.1, 2.2, 3.1, 3.2_

  - [ ] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Single Valid Item Returns Correct Cognitive Status
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the fixed `aggregateMajorityVoting` returns the correct status for 1-item inputs
    - Run `src/lib/diagnostic/__tests__/engine.bug-condition.test.ts` on the fixed code
    - **EXPECTED OUTCOME**: Test PASSES — all 4 single-item cases now return the correct cognitive status
    - _Requirements: 2.1, 2.2_

  - [ ] 3.3 Verify preservation tests still pass after Bug #1 fix
    - **Property 2: Preservation** - Zero and Multi-Item Voting Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run `src/lib/diagnostic/__tests__/engine.preservation.test.ts` on the fixed code
    - **EXPECTED OUTCOME**: All preservation tests PASS — zero-item still `INSUFFICIENT_DATA`, ≥2 items still use majority voting
    - Confirm no regressions

- [ ] 4. Fix Bug #2 — `generateRemedialGroups` tidak melakukan aggregasi per siswa

  - [ ] 4.1 Ekstrak helper `computeDominantStatus` di `src/lib/diagnosis/compute.ts`
    - Tambah pure function `computeDominantStatus(statuses: string[]): string` sebelum `generateRemedialGroups`
    - Implementasi:
      - Jika `statuses.length === 0` → return `'INSUFFICIENT_DATA'`
      - Hitung tally frekuensi per status
      - Temukan `maxFreq = Math.max(...Object.values(tally))`
      - Kumpulkan `candidates` (semua status dengan frekuensi = maxFreq)
      - Jika satu kandidat → return kandidat tersebut
      - Jika tie → apply precedency rule: `['MISKONSEPSI', 'LUCKY_GUESS', 'TIDAK_PAHAM', 'PAHAM_KONSEP']`
      - Return `PRECEDENCY.find(s => candidates.includes(s)) ?? 'INSUFFICIENT_DATA'`
    - Ekspor fungsi ini agar dapat ditest secara mandiri
    - _Requirements: 2.3_

  - [ ] 4.2 Refactor `generateRemedialGroups` untuk aggregasi per siswa
    - Ubah query `prisma.conceptDiagnosis.findMany` untuk juga meng-select `studentId`:
      ```typescript
      select: {
        finalStatus: true,
        studentId: true,
        student: { select: { anonymousLabel: true } },
      }
      ```
    - **Tahap 1 — Aggregasi per siswa**: Bangun `Map<studentId, { label: string; statuses: string[] }>` dari semua diagnosis
    - **Tahap 2 — Hitung status dominan**: Iterasi map tersebut, panggil `computeDominantStatus(data.statuses)` per siswa
    - **Tahap 3 — Kelompokkan per status dominan**: Bangun `grouped = new Map<string, string[]>()` menggunakan `dominantStatus` sebagai kunci — bukan `finalStatus` per-baris
    - Logika clean regeneration (deleteMany + createMany) tidak berubah
    - _Bug_Condition: siswa dengan >1 diagnosis berbeda status muncul di >1 kelompok_
    - _Expected_Behavior: setiap siswa muncul di tepat satu kelompok berdasarkan status dominannya_
    - _Preservation: clean regeneration tetap berjalan; siswa dengan semua diagnosis `INSUFFICIENT_DATA` tetap masuk kelompok "Data Kurang"_
    - _Requirements: 2.3, 2.4, 3.4, 3.5, 3.6_

  - [ ] 4.3 Write unit tests untuk `computeDominantStatus` dan refactored grouping
    - Test `computeDominantStatus`:
      - Empty array → `INSUFFICIENT_DATA`
      - Single status → status tersebut
      - Clear majority → status dengan frekuensi terbanyak
      - Tie dengan MISKONSEPSI + PAHAM_KONSEP → `MISKONSEPSI` (precedency)
      - Tie dengan LUCKY_GUESS + TIDAK_PAHAM → `LUCKY_GUESS` (precedency)
      - Tie dengan TIDAK_PAHAM + PAHAM_KONSEP → `TIDAK_PAHAM` (precedency)
    - Test `generateRemedialGroups` dengan mock database data:
      - Siswa dengan 3 diagnosis: 2×`PAHAM_KONSEP` + 1×`MISKONSEPSI` → masuk kelompok `PAHAM_KONSEP` saja
      - Dua siswa berbeda status dominan → masing-masing masuk satu kelompok yang berbeda
      - Siswa dengan semua respons `INSUFFICIENT_DATA` → masuk kelompok `INSUFFICIENT_DATA`
      - Verifikasi tidak ada `anonymousLabel` yang muncul di lebih dari satu kelompok
    - _Requirements: 2.3, 2.4, 3.5_

  - [ ] 4.4 Verify each student appears in exactly one remedial group (property-based)
    - **Property 4: Bug Condition** - Each Student In Exactly One Group
    - Tulis property-based test di `src/lib/diagnosis/__tests__/compute.grouping.test.ts`
    - Generate skenario acak: N siswa (2–10), M soal (1–5), status acak per pasangan (siswa, soal)
    - Jalankan logika grouping yang sudah direfactor (dapat ditest tanpa DB dengan mengekstrak pure grouping logic)
    - Assert: setiap `anonymousLabel` muncul di tepat satu kelompok (tidak ada duplikasi)
    - Assert: jumlah total siswa di semua kelompok = jumlah siswa unik dalam sesi
    - **EXPECTED OUTCOME**: Test PASSES setelah refactor — property terpenuhi untuk semua kombinasi input
    - _Requirements: 2.3, 2.4_

- [ ] 5. Checkpoint — Ensure all tests pass
  - Jalankan seluruh test suite: `npx vitest run src/lib/diagnostic` dan `npx vitest run src/lib/diagnosis`
  - Pastikan semua test dari task 1, 2, 3, dan 4 lulus
  - Verifikasi tidak ada regresi di test yang sudah ada sebelumnya
  - Tanyakan ke user jika ada pertanyaan atau edge case yang perlu dikonfirmasi

## Notes

- Test framework: Vitest (`npx vitest run`). Untuk property-based testing gunakan `fast-check` (sudah tersedia di `devDependencies`).
- File test baru ditempatkan di direktori `__tests__` di samping file sumber masing-masing.
- `computeDominantStatus` perlu diekspor dari `compute.ts` agar dapat ditest secara mandiri.
- Logika pure grouping sebaiknya diekstrak terpisah dari DB calls agar property-based test dapat berjalan tanpa mock database.
- Urutan task 1 & 2 (sebelum fix) adalah kritis — jangan skip langsung ke implementasi.
