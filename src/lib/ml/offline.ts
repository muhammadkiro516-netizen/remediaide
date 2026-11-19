/**
 * RemediAide 2.0 — on-device Layer 1 (T68): LightGBM fold-0 models exported to ONNX, run with onnxruntime-web
 * (WASM) in the teacher's browser. Used when the ML service is not reachable. Layer 2 (explanations) and the
 * CO-KT ensemble are server-only; results are labelled "perangkat (L1 saja)".
 */
import { computeL1Features, L1_FEATURES, type FeatureInput } from './features';
import { QUADRANTS, type Quadrant } from './types';

type Ort = typeof import('onnxruntime-web');
type Session = import('onnxruntime-web').InferenceSession;

export interface OfflineRow {
  studentKey: string;
  questionId: string;
  quadrantProbs: Record<Quadrant, number>;
  quadrant: Quadrant;
  pNeedsRemediation: number;
}

let cached: { ort: Ort; b4: Session; bbin: Session } | null = null;

export async function loadOfflineModels(baseUrl = '/models', ortImpl?: Ort): Promise<{ ort: Ort; b4: Session; bbin: Session }> {
  if (cached) return cached;
  const ort = ortImpl ?? (await import('onnxruntime-web'));
  if (typeof window !== 'undefined') {
    ort.env.wasm.wasmPaths = '/ort/'; // local runtime (copied by scripts/copy-ort-wasm.js), works offline
    ort.env.wasm.numThreads = 1;      // no SharedArrayBuffer / COOP-COEP requirement
  }
  const [b4, bbin] = await Promise.all([
    ort.InferenceSession.create(`${baseUrl}/l1_b4.onnx`),
    ort.InferenceSession.create(`${baseUrl}/l1_bbin.onnx`),
  ]);
  cached = { ort, b4, bbin };
  return cached;
}

/** Probabilities output = second output ("probabilities", shape [n, k]) of the onnxmltools LightGBM graph. */
async function probs(ort: Ort, s: Session, X: Float32Array, n: number, k: number): Promise<number[][]> {
  const feeds = { [s.inputNames[0]]: new ort.Tensor('float32', X, [n, L1_FEATURES.length]) };
  const out = await s.run(feeds);
  const data = out[s.outputNames[1]].data as Float32Array;
  return Array.from({ length: n }, (_, i) => Array.from(data.slice(i * k, i * k + k)));
}

export async function offlineDiagnose(inputs: FeatureInput[], models: { ort: Ort; b4: Session; bbin: Session }): Promise<OfflineRow[]> {
  if (inputs.length === 0) return [];
  const rows = computeL1Features(inputs);
  const n = rows.length;
  const X = new Float32Array(n * L1_FEATURES.length);
  rows.forEach((r, i) => r.x.forEach((v, j) => { X[i * L1_FEATURES.length + j] = v; }));
  const p4 = await probs(models.ort, models.b4, X, n, 4);
  const pb = await probs(models.ort, models.bbin, X, n, 2);
  return rows.map((r, i) => {
    const qp = Object.fromEntries(QUADRANTS.map((q, j) => [q, p4[i][j]])) as Record<Quadrant, number>;
    const best = QUADRANTS[p4[i].indexOf(Math.max(...p4[i]))];
    return { studentKey: r.studentKey, questionId: r.questionId, quadrantProbs: qp, quadrant: best, pNeedsRemediation: pb[i][1] };
  });
}
