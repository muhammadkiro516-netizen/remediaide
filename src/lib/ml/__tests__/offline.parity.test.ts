/** T68: ONNX in onnxruntime-web (WASM, run in Node) reproduces LightGBM probabilities from the Python fixture. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as ort from 'onnxruntime-web';
import { offlineDiagnose } from '../offline';

const root = join(__dirname, '../../../..');
const fx = JSON.parse(readFileSync(join(__dirname, 'fixtures/l1_features.json'), 'utf8'));

describe('offlineDiagnose', () => {
  it('matches LightGBM (Python) probabilities within 0.01', async () => {
    ort.env.wasm.numThreads = 1;
    const load = (f: string) => ort.InferenceSession.create(new Uint8Array(readFileSync(join(root, 'public/models', f))));
    const models = { ort, b4: await load('l1_b4.onnx'), bbin: await load('l1_bbin.onnx') };
    const items = new Map(fx.payload.items.map((it: { question_id: string; kc_id: string }) => [it.question_id, it.kc_id]));
    const out = await offlineDiagnose(fx.payload.responses.map((r: Record<string, unknown>) => ({
      studentKey: r.student_key as string, questionId: r.question_id as string, kcId: items.get(r.question_id as string) as string,
      isCorrect: r.is_correct as boolean, cri: r.cri as number, answeredAt: r.answered_at as string,
    })), models as never);
    expect(out.length).toBe(fx.p_b4.length);
    out.forEach((r, i) => {
      const p = Object.values(r.quadrantProbs);
      p.forEach((v, j) => expect(Math.abs(v - fx.p_b4[i][j])).toBeLessThan(0.01));
      expect(Math.abs(r.pNeedsRemediation - fx.p_bbin[i][1])).toBeLessThan(0.01);
      expect(Math.abs(p.reduce((a, b) => a + b, 0) - 1)).toBeLessThan(1e-4);
    });
  }, 60000);
});
