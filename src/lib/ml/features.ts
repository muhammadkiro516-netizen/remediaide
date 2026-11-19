/**
 * RemediAide 2.0 — Layer 1 history features in TypeScript, identical to ml/src/remediaide_ml/features/history.py
 * (+ diagnose._frame). Used for in-browser inference (T68). Parity with Python is tested against a fixture produced
 * by ml/scripts/export_l1_onnx.py (src/lib/ml/__tests__/fixtures/l1_features.json).
 * Missing values are NaN (LightGBM/ONNX treat NaN as missing).
 */
export const L1_FEATURES = [
  'cur_correct', 'cur_cri', 'cur_has_conf', 'n_prev', 'acc_prev', 'n_prev_kc', 'acc_prev_kc', 'ewm_acc_kc', 'attempt_no',
  'conf_mean_prev', 'conf_mean_prev_kc', 'overconf_prev', 'cnt_P_kc', 'cnt_L_kc', 'cnt_M_kc', 'cnt_T_kc', 'last_quadrant_kc',
  'cur_quadrant_b0', 'item_diff_oof', 'kc_diff_oof', 'cur_option_share_oof', 'hours_since_prev', 'hours_since_prev_kc',
] as const;

export const CRI_HIGH = 3;
const EWM_ALPHA = 0.3;
const DEFAULTS = { item_diff_oof: 0.54, kc_diff_oof: 0.54, cur_option_share_oof: 0 };

export interface FeatureInput {
  studentKey: string;
  questionId: string;
  kcId: string | null;
  isCorrect: boolean;
  cri: number;             // 0..5 (always present in the app)
  answeredAt: string;      // ISO
}

export interface FeatureRow {
  studentKey: string;
  questionId: string;
  index: number;           // position in the input array
  x: number[];             // ordered as L1_FEATURES
}

function quadrant(correct: boolean, cri: number): number {
  const high = cri >= CRI_HIGH;
  return correct ? (high ? 0 : 1) : high ? 2 : 3; // P, L, M, T
}

/** Rows are returned sorted by (student, time, input order) like diagnose._frame. */
export function computeL1Features(inputs: FeatureInput[]): FeatureRow[] {
  const order = inputs
    .map((r, i) => ({ r, i, t: Date.parse(r.answeredAt) }))
    .sort((a, b) => (a.r.studentKey < b.r.studentKey ? -1 : a.r.studentKey > b.r.studentKey ? 1 : a.t - b.t || a.i - b.i));
  type Acc = { n: number; correct: number; nConf: number; criSum: number; over: number; lastT: number | null };
  type KcAcc = Acc & { cnt: number[]; lastQ: number | null; ewmNum: number; ewmDen: number; ewmPrev: number | null };
  const byUser = new Map<string, Acc>();
  const byKc = new Map<string, KcAcc>();
  const attempts = new Map<string, number>();
  const out: FeatureRow[] = [];
  for (const { r, i, t } of order) {
    const kc = r.kcId ?? '__none__';
    const u = byUser.get(r.studentKey) ?? { n: 0, correct: 0, nConf: 0, criSum: 0, over: 0, lastT: null };
    const kKey = `${r.studentKey}\u0000${kc}`;
    const k = byKc.get(kKey) ?? { n: 0, correct: 0, nConf: 0, criSum: 0, over: 0, lastT: null, cnt: [0, 0, 0, 0], lastQ: null,
                                  ewmNum: 0, ewmDen: 0, ewmPrev: null };
    const aKey = `${r.studentKey}\u0000${r.questionId}`;
    const attempt = (attempts.get(aKey) ?? 0) + 1;
    const y = r.isCorrect ? 1 : 0;
    const q = quadrant(r.isCorrect, r.cri);
    const f: Record<string, number> = {
      cur_correct: y, cur_cri: r.cri, cur_has_conf: 1,
      n_prev: u.n, acc_prev: u.n ? u.correct / u.n : NaN,
      n_prev_kc: k.n, acc_prev_kc: k.n ? k.correct / k.n : NaN,
      ewm_acc_kc: k.ewmPrev ?? NaN,
      attempt_no: attempt,
      conf_mean_prev: u.nConf ? u.criSum / u.nConf : NaN,
      conf_mean_prev_kc: k.nConf ? k.criSum / k.nConf : NaN,
      overconf_prev: u.nConf ? u.over / u.nConf : NaN,
      cnt_P_kc: k.cnt[0], cnt_L_kc: k.cnt[1], cnt_M_kc: k.cnt[2], cnt_T_kc: k.cnt[3],
      last_quadrant_kc: k.lastQ ?? NaN,
      cur_quadrant_b0: q,
      ...DEFAULTS,
      hours_since_prev: u.lastT === null ? NaN : (t - u.lastT) / 3.6e6,
      hours_since_prev_kc: k.lastT === null ? NaN : (t - k.lastT) / 3.6e6,
    };
    out.push({ studentKey: r.studentKey, questionId: r.questionId, index: i, x: L1_FEATURES.map((n) => f[n]) });
    // update state with row t (pandas ewm adjust=True: weights (1-a)^age, normalised)
    u.n += 1; u.correct += y; u.nConf += 1; u.criSum += r.cri; u.over += r.cri / 5 - y; u.lastT = t;
    k.n += 1; k.correct += y; k.nConf += 1; k.criSum += r.cri; k.over += r.cri / 5 - y; k.lastT = t;
    k.cnt[q] += 1; k.lastQ = q;
    k.ewmNum = k.ewmNum * (1 - EWM_ALPHA) + y; k.ewmDen = k.ewmDen * (1 - EWM_ALPHA) + 1; k.ewmPrev = k.ewmNum / k.ewmDen;
    byUser.set(r.studentKey, u); byKc.set(kKey, k); attempts.set(aKey, attempt);
  }
  return out;
}
