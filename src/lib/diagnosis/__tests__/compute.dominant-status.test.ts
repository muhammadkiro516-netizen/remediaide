/**
 * RemediAide — computeDominantStatus Unit Tests
 * Task 4.3: Unit tests for computeDominantStatus helper and grouping logic
 *
 * Tests the pure computeDominantStatus function in isolation,
 * plus the pure grouping logic extracted from generateRemedialGroups.
 *
 * Validates: Requirements 2.3, 2.4, 3.5
 */

import { describe, it, expect } from 'vitest';
import { computeDominantStatus } from '../compute';

// ─── computeDominantStatus ────────────────────────────────────────────────────

describe('computeDominantStatus', () => {
  it('empty array → INSUFFICIENT_DATA', () => {
    expect(computeDominantStatus([])).toBe('INSUFFICIENT_DATA');
  });

  it('single status → returns that status', () => {
    expect(computeDominantStatus(['PAHAM_KONSEP'])).toBe('PAHAM_KONSEP');
    expect(computeDominantStatus(['MISKONSEPSI'])).toBe('MISKONSEPSI');
    expect(computeDominantStatus(['LUCKY_GUESS'])).toBe('LUCKY_GUESS');
    expect(computeDominantStatus(['TIDAK_PAHAM'])).toBe('TIDAK_PAHAM');
    expect(computeDominantStatus(['INSUFFICIENT_DATA'])).toBe('INSUFFICIENT_DATA');
  });

  it('clear majority → status with highest frequency', () => {
    // 2 PAHAM_KONSEP vs 1 MISKONSEPSI → PAHAM_KONSEP
    expect(computeDominantStatus(['PAHAM_KONSEP', 'PAHAM_KONSEP', 'MISKONSEPSI'])).toBe('PAHAM_KONSEP');

    // 3 MISKONSEPSI vs 1 PAHAM_KONSEP vs 1 LUCKY_GUESS → MISKONSEPSI
    expect(
      computeDominantStatus(['MISKONSEPSI', 'MISKONSEPSI', 'MISKONSEPSI', 'PAHAM_KONSEP', 'LUCKY_GUESS'])
    ).toBe('MISKONSEPSI');
  });

  it('tie: MISKONSEPSI + PAHAM_KONSEP → MISKONSEPSI (precedency)', () => {
    expect(computeDominantStatus(['MISKONSEPSI', 'PAHAM_KONSEP'])).toBe('MISKONSEPSI');
  });

  it('tie: LUCKY_GUESS + TIDAK_PAHAM → LUCKY_GUESS (precedency)', () => {
    expect(computeDominantStatus(['LUCKY_GUESS', 'TIDAK_PAHAM'])).toBe('LUCKY_GUESS');
  });

  it('tie: TIDAK_PAHAM + PAHAM_KONSEP → TIDAK_PAHAM (precedency)', () => {
    expect(computeDominantStatus(['TIDAK_PAHAM', 'PAHAM_KONSEP'])).toBe('TIDAK_PAHAM');
  });

  it('tie: MISKONSEPSI + LUCKY_GUESS → MISKONSEPSI (precedency)', () => {
    expect(computeDominantStatus(['MISKONSEPSI', 'LUCKY_GUESS'])).toBe('MISKONSEPSI');
  });

  it('3-way tie with counts 2-2-2 → first in precedency wins', () => {
    // MISKONSEPSI=2, LUCKY_GUESS=2, PAHAM_KONSEP=2 → MISKONSEPSI
    expect(
      computeDominantStatus(['MISKONSEPSI', 'MISKONSEPSI', 'LUCKY_GUESS', 'LUCKY_GUESS', 'PAHAM_KONSEP', 'PAHAM_KONSEP'])
    ).toBe('MISKONSEPSI');
  });

  it('LUCKY_GUESS wins over TIDAK_PAHAM and PAHAM_KONSEP in 3-way tie', () => {
    expect(
      computeDominantStatus(['LUCKY_GUESS', 'LUCKY_GUESS', 'TIDAK_PAHAM', 'TIDAK_PAHAM', 'PAHAM_KONSEP', 'PAHAM_KONSEP'])
    ).toBe('LUCKY_GUESS');
  });

  it('all INSUFFICIENT_DATA → INSUFFICIENT_DATA', () => {
    expect(
      computeDominantStatus(['INSUFFICIENT_DATA', 'INSUFFICIENT_DATA', 'INSUFFICIENT_DATA'])
    ).toBe('INSUFFICIENT_DATA');
  });

  it('mix of valid and INSUFFICIENT_DATA → dominant cognitive status wins', () => {
    // 2 PAHAM_KONSEP vs 1 INSUFFICIENT_DATA → PAHAM_KONSEP
    expect(
      computeDominantStatus(['PAHAM_KONSEP', 'PAHAM_KONSEP', 'INSUFFICIENT_DATA'])
    ).toBe('PAHAM_KONSEP');
  });
});

// ─── Pure Grouping Logic Tests ────────────────────────────────────────────────

/**
 * Helper: simulate the grouping logic extracted from generateRemedialGroups.
 * This pure function can be tested without database access.
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

describe('Grouping logic — each student appears in exactly one group', () => {
  it('student with 3 diagnoses: 2×PAHAM_KONSEP + 1×MISKONSEPSI → in PAHAM_KONSEP group only', () => {
    const groups = groupStudentsByDominantStatus([
      { studentId: 'S-01', label: 'Anonim-01', statuses: ['PAHAM_KONSEP', 'PAHAM_KONSEP', 'MISKONSEPSI'] },
    ]);

    expect(groups.get('PAHAM_KONSEP')).toContain('Anonim-01');
    expect(groups.has('MISKONSEPSI')).toBe(false);
  });

  it('two students with different dominant statuses → each in their own group', () => {
    const groups = groupStudentsByDominantStatus([
      { studentId: 'S-01', label: 'Anonim-01', statuses: ['PAHAM_KONSEP', 'PAHAM_KONSEP'] },
      { studentId: 'S-02', label: 'Anonim-02', statuses: ['MISKONSEPSI', 'MISKONSEPSI'] },
    ]);

    expect(groups.get('PAHAM_KONSEP')).toEqual(['Anonim-01']);
    expect(groups.get('MISKONSEPSI')).toEqual(['Anonim-02']);
  });

  it('student with all INSUFFICIENT_DATA → in INSUFFICIENT_DATA group', () => {
    const groups = groupStudentsByDominantStatus([
      { studentId: 'S-01', label: 'Anonim-01', statuses: ['INSUFFICIENT_DATA', 'INSUFFICIENT_DATA'] },
    ]);

    expect(groups.get('INSUFFICIENT_DATA')).toContain('Anonim-01');
  });

  it('no student label appears in more than one group', () => {
    const students = [
      { studentId: 'S-01', label: 'Anonim-01', statuses: ['PAHAM_KONSEP', 'PAHAM_KONSEP', 'MISKONSEPSI'] },
      { studentId: 'S-02', label: 'Anonim-02', statuses: ['MISKONSEPSI', 'MISKONSEPSI', 'PAHAM_KONSEP'] },
      { studentId: 'S-03', label: 'Anonim-03', statuses: ['LUCKY_GUESS', 'LUCKY_GUESS'] },
      { studentId: 'S-04', label: 'Anonim-04', statuses: ['TIDAK_PAHAM'] },
    ];

    const groups = groupStudentsByDominantStatus(students);

    // Collect all labels across all groups
    const allLabels: string[] = [];
    for (const labels of groups.values()) {
      allLabels.push(...labels);
    }

    // Each label must appear exactly once
    for (const { label } of students) {
      const count = allLabels.filter((l) => l === label).length;
      expect(count).toBe(1);
    }
  });

  it('total students across all groups equals unique student count', () => {
    const students = [
      { studentId: 'S-01', label: 'Anonim-01', statuses: ['PAHAM_KONSEP', 'LUCKY_GUESS', 'PAHAM_KONSEP'] },
      { studentId: 'S-02', label: 'Anonim-02', statuses: ['MISKONSEPSI'] },
      { studentId: 'S-03', label: 'Anonim-03', statuses: ['TIDAK_PAHAM', 'TIDAK_PAHAM'] },
    ];

    const groups = groupStudentsByDominantStatus(students);

    let totalInGroups = 0;
    for (const labels of groups.values()) {
      totalInGroups += labels.length;
    }

    expect(totalInGroups).toBe(students.length);
  });

  it('student with single diagnosis → in that status group', () => {
    const groups = groupStudentsByDominantStatus([
      { studentId: 'S-01', label: 'Anonim-01', statuses: ['LUCKY_GUESS'] },
    ]);

    expect(groups.get('LUCKY_GUESS')).toContain('Anonim-01');
    // Only 1 group exists
    expect(groups.size).toBe(1);
  });

  it('mixed tie scenario: student with 1 MISKONSEPSI + 1 PAHAM_KONSEP → MISKONSEPSI (precedency)', () => {
    const groups = groupStudentsByDominantStatus([
      { studentId: 'S-01', label: 'Anonim-01', statuses: ['MISKONSEPSI', 'PAHAM_KONSEP'] },
    ]);

    expect(groups.get('MISKONSEPSI')).toContain('Anonim-01');
    expect(groups.has('PAHAM_KONSEP')).toBe(false);
  });
});
