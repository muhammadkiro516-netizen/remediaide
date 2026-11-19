/**
 * RemediAide 2.0 — anonymous research export (05_INTEGRATION_SPEC §7, pilot schema 02_DATA_SPEC §7).
 * Pure CSV builder: never includes names, NIS, anonymousLabel or internal ids. student_key = HMAC per session.
 */
import { createHmac } from 'node:crypto';

export const RESEARCH_COLUMNS = [
  'student_key', 'session_id', 'question_id', 'chosen_option', 'is_correct', 'cri', 'response_time_ms',
  'tau_min_ms', 'explanation', 'answered_at', 'consent',
] as const;

export interface ResearchRowIn {
  studentId: string;
  questionId: string;
  mapQuestionId: number | null;
  chosenOptionKey: string;
  correctOptionKey: string;
  criValue: number;
  responseTimeMs: number;
  tauMinSeconds: number;
  explanation: string | null;
  submittedAt: Date;
}

const esc = (v: string | number | boolean) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function sessionStudentKey(studentId: string, sessionId: string, salt: string): string {
  return createHmac('sha256', `${salt}:${sessionId}`).update(studentId).digest('hex').slice(0, 24);
}

/** session_id in the export is itself a keyed hash, so internal ids never leave the app. */
export function buildResearchCsv(sessionId: string, rows: ResearchRowIn[], salt: string): string {
  const sid = createHmac('sha256', salt).update(`session:${sessionId}`).digest('hex').slice(0, 16);
  const qKey = (q: string) => createHmac('sha256', salt).update(`question:${q}`).digest('hex').slice(0, 12);
  const lines = [RESEARCH_COLUMNS.join(',')];
  for (const r of rows) {
    lines.push([
      sessionStudentKey(r.studentId, sessionId, salt), sid,
      r.mapQuestionId != null ? String(r.mapQuestionId) : qKey(r.questionId),
      r.chosenOptionKey, r.chosenOptionKey === r.correctOptionKey, r.criValue, r.responseTimeMs, r.tauMinSeconds * 1000,
      r.explanation ?? '', r.submittedAt.toISOString(), true,
    ].map(esc).join(','));
  }
  return lines.join('\n') + '\n';
}
