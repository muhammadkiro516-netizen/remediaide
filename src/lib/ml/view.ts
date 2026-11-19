/**
 * RemediAide 2.0 — shape MlDiagnosis rows for the teacher dashboard "Mode AI" (05_INTEGRATION_SPEC §6).
 * Pure functions (unit-tested): per-student view, the "Perlu dicek guru" queue and AI groups per named misconception.
 */
import { QUADRANTS, type Quadrant } from './client';

export interface MlRow {
  id: string;
  studentId: string;
  anonymousLabel: string;
  questionId: string | null;
  quadrantProbs: Record<string, number>;
  quadrant: string;
  masteryProb: number;
  misconceptionLabel: string | null;
  misconceptionProb: number | null;
  hiddenMisconception: boolean;
  predictionSet: string[];
  deferred: boolean;
  reasons: { text: string; impact: number }[];
  ruleStatus: string;
  modelVersion: string;
}

export interface MlStudentView {
  studentId: string;
  anonymousLabel: string;
  summaryId: string | null;
  quadrant: string;
  masteryProb: number;
  deferred: boolean;
  hiddenMisconception: boolean;
  ruleStatus: string;
  reasons: { text: string; impact: number }[];
  doubt: number;                // max over questions of 1 - max quadrant probability
  perQuestion: MlRow[];
}

export interface MlView {
  available: boolean;
  modelVersion: string | null;
  students: MlStudentView[];
  queue: MlStudentView[];       // deferred or hidden misconception, most doubtful first
  groups: { misconception: string; members: string[] }[];
}

const doubtOf = (r: MlRow) => 1 - Math.max(...QUADRANTS.map((q: Quadrant) => Number(r.quadrantProbs?.[q] ?? 0)));

export function buildMlView(rows: MlRow[]): MlView {
  if (rows.length === 0) return { available: false, modelVersion: null, students: [], queue: [], groups: [] };
  const byStudent = new Map<string, MlRow[]>();
  for (const r of rows) {
    if (!byStudent.has(r.studentId)) byStudent.set(r.studentId, []);
    byStudent.get(r.studentId)!.push(r);
  }
  const students: MlStudentView[] = [];
  for (const [studentId, rs] of Array.from(byStudent.entries())) {
    const summary = rs.find((r) => r.questionId === null) ?? null;
    const perQuestion = rs.filter((r) => r.questionId !== null);
    students.push({
      studentId,
      anonymousLabel: rs[0].anonymousLabel,
      summaryId: summary?.id ?? null,
      quadrant: summary?.quadrant ?? perQuestion[0]?.quadrant ?? 'TIDAK_PAHAM',
      masteryProb: summary?.masteryProb ?? 0,
      deferred: summary?.deferred ?? false,
      hiddenMisconception: perQuestion.some((r) => r.hiddenMisconception),
      ruleStatus: summary?.ruleStatus ?? '',
      reasons: (summary?.reasons ?? []).slice(0, 3),
      doubt: perQuestion.length ? Math.max(...perQuestion.map(doubtOf)) : 0,
      perQuestion,
    });
  }
  students.sort((a, b) => a.anonymousLabel.localeCompare(b.anonymousLabel));
  const queue = students.filter((s) => s.deferred || s.hiddenMisconception).sort((a, b) => b.doubt - a.doubt);
  const groupMap = new Map<string, Set<string>>();
  for (const s of students) {
    for (const r of s.perQuestion) {
      if (r.misconceptionLabel && (r.quadrant === 'MISKONSEPSI' || r.hiddenMisconception)) {
        if (!groupMap.has(r.misconceptionLabel)) groupMap.set(r.misconceptionLabel, new Set());
        groupMap.get(r.misconceptionLabel)!.add(s.anonymousLabel);
      }
    }
  }
  const groups = Array.from(groupMap.entries())
    .map(([misconception, set]) => ({ misconception, members: Array.from(set).sort() }))
    .sort((a, b) => b.members.length - a.members.length);
  return { available: true, modelVersion: rows[0].modelVersion, students, queue, groups };
}

export const FEEDBACK_ACTIONS = ['ACCEPT', 'CHANGE_QUADRANT', 'CHANGE_MISCONCEPTION', 'NOT_SURE'] as const;
export type FeedbackAction = (typeof FEEDBACK_ACTIONS)[number];

export function validateFeedback(body: unknown): { ok: true; mlDiagnosisId: string; action: FeedbackAction; newValue: string | null }
  | { ok: false; message: string } {
  if (!body || typeof body !== 'object') return { ok: false, message: 'Body tidak valid.' };
  const b = body as Record<string, unknown>;
  if (typeof b.mlDiagnosisId !== 'string' || !b.mlDiagnosisId) return { ok: false, message: 'mlDiagnosisId diperlukan.' };
  if (!FEEDBACK_ACTIONS.includes(b.action as FeedbackAction)) return { ok: false, message: 'action tidak dikenal.' };
  const action = b.action as FeedbackAction;
  let newValue: string | null = null;
  if (action === 'CHANGE_QUADRANT') {
    if (!QUADRANTS.includes(b.newValue as Quadrant)) return { ok: false, message: 'newValue harus kuadran yang valid.' };
    newValue = b.newValue as string;
  } else if (action === 'CHANGE_MISCONCEPTION') {
    if (typeof b.newValue !== 'string' || !b.newValue.trim() || b.newValue.length > 120) {
      return { ok: false, message: 'newValue (nama miskonsepsi) wajib, maks 120 karakter.' };
    }
    newValue = b.newValue.trim();
  }
  return { ok: true, mlDiagnosisId: b.mlDiagnosisId, action, newValue };
}
