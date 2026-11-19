import { describe, expect, it } from 'vitest';
import { buildMlView, validateFeedback, type MlRow } from '../view';

const p = (P: number, L: number, M: number, T: number) => ({ PAHAM_KONSEP: P, LUCKY_GUESS: L, MISKONSEPSI: M, TIDAK_PAHAM: T });
function row(o: Partial<MlRow>): MlRow {
  return { id: 'x', studentId: 's', anonymousLabel: 'A', questionId: 'q1', quadrantProbs: p(0.7, 0.1, 0.1, 0.1),
           quadrant: 'PAHAM_KONSEP', masteryProb: 0.8, misconceptionLabel: null, misconceptionProb: null,
           hiddenMisconception: false, predictionSet: ['PAHAM_KONSEP'], deferred: false, reasons: [], ruleStatus: 'PAHAM_KONSEP',
           modelVersion: 'v', ...o };
}

describe('buildMlView', () => {
  it('reports unavailable when there are no rows', () => {
    expect(buildMlView([]).available).toBe(false);
  });
  it('builds students, queue sorted by doubt, and named misconception groups', () => {
    const rows = [
      row({ id: 'a1', studentId: 'a', anonymousLabel: 'Siswa-A', quadrantProbs: p(0.4, 0.3, 0.2, 0.1) }),
      row({ id: 'a0', studentId: 'a', anonymousLabel: 'Siswa-A', questionId: null, deferred: true }),
      row({ id: 'b1', studentId: 'b', anonymousLabel: 'Siswa-B', quadrant: 'MISKONSEPSI', quadrantProbs: p(0.1, 0.1, 0.5, 0.3),
            misconceptionLabel: 'Angka lebih panjang dianggap lebih besar' }),
      row({ id: 'b0', studentId: 'b', anonymousLabel: 'Siswa-B', questionId: null, deferred: true }),
      row({ id: 'c1', studentId: 'c', anonymousLabel: 'Siswa-C', hiddenMisconception: true,
            misconceptionLabel: 'Angka lebih panjang dianggap lebih besar' }),
      row({ id: 'c0', studentId: 'c', anonymousLabel: 'Siswa-C', questionId: null }),
    ];
    const v = buildMlView(rows);
    expect(v.students.map((s) => s.anonymousLabel)).toEqual(['Siswa-A', 'Siswa-B', 'Siswa-C']);
    expect(v.queue.map((s) => s.anonymousLabel)).toEqual(['Siswa-A', 'Siswa-B', 'Siswa-C']); // doubt 0.6, 0.5, 0.3
    expect(v.groups).toEqual([{ misconception: 'Angka lebih panjang dianggap lebih besar', members: ['Siswa-B', 'Siswa-C'] }]);
    expect(v.students[0].summaryId).toBe('a0');
  });
});

describe('validateFeedback', () => {
  it('accepts valid actions and rejects invalid ones', () => {
    expect(validateFeedback({ mlDiagnosisId: 'd', action: 'ACCEPT' })).toMatchObject({ ok: true, newValue: null });
    expect(validateFeedback({ mlDiagnosisId: 'd', action: 'CHANGE_QUADRANT', newValue: 'MISKONSEPSI' }).ok).toBe(true);
    expect(validateFeedback({ mlDiagnosisId: 'd', action: 'CHANGE_QUADRANT', newValue: 'X' }).ok).toBe(false);
    expect(validateFeedback({ mlDiagnosisId: 'd', action: 'CHANGE_MISCONCEPTION', newValue: '' }).ok).toBe(false);
    expect(validateFeedback({ mlDiagnosisId: 'd', action: 'DELETE' }).ok).toBe(false);
    expect(validateFeedback(null).ok).toBe(false);
  });
});
