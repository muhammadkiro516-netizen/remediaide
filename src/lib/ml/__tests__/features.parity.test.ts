/** T68: TypeScript L1 features must equal the Python pipeline (fixture from ml/scripts/export_l1_onnx.py). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeL1Features, L1_FEATURES } from '../features';

const fx = JSON.parse(readFileSync(join(__dirname, 'fixtures/l1_features.json'), 'utf8'));

describe('computeL1Features parity with Python', () => {
  it('uses the same feature order', () => {
    expect([...L1_FEATURES]).toEqual(fx.features);
  });
  it('matches every feature of every row (tol 1e-5; NaN = missing)', () => {
    const items = new Map(fx.payload.items.map((it: { question_id: string; kc_id: string }) => [it.question_id, it.kc_id]));
    const rows = computeL1Features(fx.payload.responses.map((r: Record<string, unknown>) => ({
      studentKey: r.student_key as string, questionId: r.question_id as string, kcId: items.get(r.question_id as string) as string,
      isCorrect: r.is_correct as boolean, cri: r.cri as number, answeredAt: r.answered_at as string,
    })));
    expect(rows.length).toBe(fx.rows.length);
    rows.forEach((row, i) => {
      const ref = fx.rows[i];
      expect([row.studentKey, row.questionId]).toEqual([ref.student_key, ref.question_id]);
      row.x.forEach((v, j) => {
        const e = ref.x[j];
        if (e === null) expect(Number.isNaN(v), `${fx.features[j]} row ${i}`).toBe(true);
        else expect(Math.abs(v - e), `${fx.features[j]} row ${i}: ${v} vs ${e}`).toBeLessThan(1e-5);
      });
    });
  });
});
