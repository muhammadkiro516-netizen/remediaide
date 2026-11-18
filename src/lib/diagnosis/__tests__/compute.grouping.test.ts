/**
 * RemediAide — Grouping Property-Based Tests
 * Task 4.4: Property 4 — Each Student Appears in Exactly One Remedial Group
 *
 * Tests the pure grouping logic to verify that for any combination of
 * students and diagnoses, every student appears in exactly one group.
 *
 * **Validates: Requirements 2.3, 2.4**
 */

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { expect } from 'vitest';
import { computeDominantStatus } from '../compute';

// ─── Pure Grouping Logic (extracted for testability) ─────────────────────────

/**
 * Pure grouping function that mirrors the refactored generateRemedialGroups logic.
 * Extracted here to allow property-based testing without database access.
 */
function groupStudentsByDominantStatus(
  studentDiagnoses: Array<{ studentId: string; label: string; statuses: string[] }>
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();

  for (const { label, statuses } of studentDiagnoses) {
    const dominant = computeDominantStatus(statuses);
    if (!grouped.has(dominant)) grouped.set(dominant, []);
    grouped.get(dominant)!.push(label);
  }

  return grouped;
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const cognitiveStatuses = [
  'PAHAM_KONSEP',
  'LUCKY_GUESS',
  'MISKONSEPSI',
  'TIDAK_PAHAM',
  'INSUFFICIENT_DATA',
] as const;

/** Generate a random valid status string */
const statusArb = fc.constantFrom(...cognitiveStatuses);

/** Generate a single student with unique ID/label and 1–5 random diagnoses */
const studentArb = (index: number) =>
  fc
    .array(statusArb, { minLength: 1, maxLength: 5 })
    .map((statuses) => ({
      studentId: `student-${index}`,
      label: `Anonim-${String(index).padStart(2, '0')}`,
      statuses,
    }));

/** Generate N distinct students (N in 2..10) */
const studentsArb = fc.integer({ min: 2, max: 10 }).chain((n) =>
  fc.tuple(...Array.from({ length: n }, (_, i) => studentArb(i)))
);

// ─── Property-Based Tests ─────────────────────────────────────────────────────

describe('Property 4: Each student appears in exactly one remedial group', () => {
  /**
   * Property 4a: No student label appears in more than one group.
   * **Validates: Requirements 2.3, 2.4**
   */
  it('Property 4a: FOR ALL student configurations, no label appears in more than one group', () => {
    // **Validates: Requirements 2.3, 2.4**
    fc.assert(
      fc.property(studentsArb, (students) => {
        const groups = groupStudentsByDominantStatus(students);

        // Collect all labels across all groups
        const allLabels: string[] = [];
        for (const labels of groups.values()) {
          allLabels.push(...labels);
        }

        // Every label appears exactly once
        for (const { label } of students) {
          const count = allLabels.filter((l) => l === label).length;
          if (count !== 1) return false;
        }

        return true;
      }),
      { numRuns: 500 }
    );
  });

  /**
   * Property 4b: Total students across all groups equals the number of unique students.
   * **Validates: Requirements 2.3, 2.4**
   */
  it('Property 4b: FOR ALL student configurations, sum of group sizes = total student count', () => {
    // **Validates: Requirements 2.3, 2.4**
    fc.assert(
      fc.property(studentsArb, (students) => {
        const groups = groupStudentsByDominantStatus(students);

        let totalInGroups = 0;
        for (const labels of groups.values()) {
          totalInGroups += labels.length;
        }

        return totalInGroups === students.length;
      }),
      { numRuns: 500 }
    );
  });

  /**
   * Property 4c: Every student's dominant status is deterministic —
   * calling the grouping function twice with the same input yields the same groups.
   */
  it('Property 4c: Grouping is deterministic — same input produces same groups', () => {
    fc.assert(
      fc.property(studentsArb, (students) => {
        const groups1 = groupStudentsByDominantStatus(students);
        const groups2 = groupStudentsByDominantStatus(students);

        if (groups1.size !== groups2.size) return false;

        for (const [status, labels1] of groups1.entries()) {
          const labels2 = groups2.get(status);
          if (!labels2) return false;
          if (labels1.length !== labels2.length) return false;
          // Same labels (order may vary, sort before comparing)
          const sorted1 = [...labels1].sort();
          const sorted2 = [...labels2].sort();
          if (!sorted1.every((l, i) => l === sorted2[i])) return false;
        }

        return true;
      }),
      { numRuns: 200 }
    );
  });

  /**
   * Property 4d: Each student's label appears in the group corresponding
   * to their computed dominant status.
   */
  it('Property 4d: Each student lands in the group matching their computed dominant status', () => {
    fc.assert(
      fc.property(studentsArb, (students) => {
        const groups = groupStudentsByDominantStatus(students);

        for (const { label, statuses } of students) {
          const expectedStatus = computeDominantStatus(statuses);
          const group = groups.get(expectedStatus);
          if (!group || !group.includes(label)) return false;
        }

        return true;
      }),
      { numRuns: 500 }
    );
  });
});

describe('Property 4 — edge cases', () => {
  it('single student with 1 diagnosis → 1 group with that student', () => {
    const groups = groupStudentsByDominantStatus([
      { studentId: 'S-01', label: 'Anonim-01', statuses: ['PAHAM_KONSEP'] },
    ]);

    expect(groups.size).toBe(1);
    expect(groups.get('PAHAM_KONSEP')).toEqual(['Anonim-01']);
  });

  it('all students share same dominant status → 1 group with all labels', () => {
    const students = [
      { studentId: 'S-01', label: 'Anonim-01', statuses: ['MISKONSEPSI', 'MISKONSEPSI'] },
      { studentId: 'S-02', label: 'Anonim-02', statuses: ['MISKONSEPSI'] },
      { studentId: 'S-03', label: 'Anonim-03', statuses: ['MISKONSEPSI', 'LUCKY_GUESS', 'MISKONSEPSI'] },
    ];
    const groups = groupStudentsByDominantStatus(students);

    expect(groups.size).toBe(1);
    expect(groups.get('MISKONSEPSI')?.sort()).toEqual(['Anonim-01', 'Anonim-02', 'Anonim-03'].sort());
  });

  it('regression: student with different per-question statuses is in exactly ONE group', () => {
    // This is the exact bug scenario from bugfix.md:
    // Student "S-01": Soal 1→PAHAM_KONSEP, Soal 2→PAHAM_KONSEP, Soal 3→MISKONSEPSI
    // Expected: PAHAM_KONSEP group (dominant: 2 vs 1)
    const groups = groupStudentsByDominantStatus([
      { studentId: 'S-01', label: 'Anonim-01', statuses: ['PAHAM_KONSEP', 'PAHAM_KONSEP', 'MISKONSEPSI'] },
    ]);

    expect(groups.size).toBe(1);
    expect(groups.get('PAHAM_KONSEP')).toContain('Anonim-01');
    expect(groups.has('MISKONSEPSI')).toBe(false);
  });
});
