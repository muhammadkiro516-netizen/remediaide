/**
 * RemediAide 2.0 — client for the ML service (`ml/service/app.py`, 05_INTEGRATION_SPEC §4–5).
 * Never throws: any failure (no URL, timeout, HTTP error, malformed body) returns null so the v1 rule (B0)
 * pipeline always completes. Student ids are pseudonymised with HMAC before leaving the app.
 */
import { createHmac } from 'node:crypto';

export const QUADRANTS = ['PAHAM_KONSEP', 'LUCKY_GUESS', 'MISKONSEPSI', 'TIDAK_PAHAM'] as const;
export type Quadrant = (typeof QUADRANTS)[number];

export interface MlItem {
  question_id: string;
  kc_id: string | null;
  correct_option: string;
  map_question_id: number | null;
  question_text: string;
}

export interface MlResponseIn {
  student_key: string;
  question_id: string;
  chosen_option: string;
  chosen_option_text?: string;
  is_correct: boolean;
  cri: number;
  response_time_ms: number;
  tau_min_ms: number;
  explanation: string;
  answered_at: string;
}

export interface MlPayload {
  session_id: string;
  items: MlItem[];
  responses: MlResponseIn[];
}

export interface MlPerQuestion {
  question_id: string;
  quadrant_probs: Record<Quadrant, number>;
  quadrant: Quadrant;
  prediction_set: Quadrant[];
  rule_status: string;
  misconception: { label: string; label_id: string; prob: number } | null;
  hidden_misconception: boolean;
  rapid_guess: boolean;
}

export interface MlStudent {
  student_key: string;
  per_question: MlPerQuestion[];
  summary: {
    quadrant: Quadrant;
    mastery_prob: number;
    deferred: boolean;
    rule_status?: string;
    reasons: { text: string; impact: number }[];
  };
}

export interface MlResult {
  model_version: string;
  students: MlStudent[];
  latency_ms: number;
}

export function studentKey(studentId: string, salt: string): string {
  return createHmac('sha256', salt).update(studentId).digest('hex').slice(0, 32);
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isQuad = (v: unknown): v is Quadrant => typeof v === 'string' && (QUADRANTS as readonly string[]).includes(v);

/** Structural validation of the service response; returns null when anything required is missing. */
export function parseMlResult(json: unknown): MlResult | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as Record<string, unknown>;
  if (typeof j.model_version !== 'string' || !Array.isArray(j.students)) return null;
  for (const s of j.students as unknown[]) {
    if (!s || typeof s !== 'object') return null;
    const st = s as Record<string, unknown>;
    if (typeof st.student_key !== 'string' || !Array.isArray(st.per_question)) return null;
    const sum = st.summary as Record<string, unknown> | undefined;
    if (!sum || !isQuad(sum.quadrant) || !isNum(sum.mastery_prob) || typeof sum.deferred !== 'boolean'
      || !Array.isArray(sum.reasons)) return null;
    for (const q of st.per_question as unknown[]) {
      const pq = q as Record<string, unknown>;
      if (!pq || typeof pq.question_id !== 'string' || !isQuad(pq.quadrant) || !Array.isArray(pq.prediction_set)
        || typeof pq.rule_status !== 'string' || typeof pq.hidden_misconception !== 'boolean') return null;
      const probs = pq.quadrant_probs as Record<string, unknown> | undefined;
      if (!probs || !QUADRANTS.every((k) => isNum(probs[k]))) return null;
    }
  }
  return { latency_ms: isNum(j.latency_ms) ? j.latency_ms : 0, ...(j as object) } as MlResult;
}

export async function callMlService(
  payload: MlPayload,
  opts: { url?: string; timeoutMs?: number; fetchImpl?: typeof fetch } = {}
): Promise<MlResult | null> {
  const url = opts.url ?? process.env.ML_SERVICE_URL;
  if (!url) return null;
  const timeoutMs = opts.timeoutMs ?? Number(process.env.ML_TIMEOUT_MS ?? 4000);
  const doFetch = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await doFetch(`${url.replace(/\/$/, '')}/v1/diagnose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.warn(`[ml] service returned HTTP ${res.status}; falling back to v1 rule only`);
      return null;
    }
    const parsed = parseMlResult(await res.json());
    if (!parsed) console.warn('[ml] malformed service response; falling back to v1 rule only');
    return parsed;
  } catch (err) {
    const reason = (err as Error)?.name === 'AbortError' ? `timeout after ${timeoutMs} ms` : String(err);
    console.warn(`[ml] service unavailable (${reason}); falling back to v1 rule only`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
