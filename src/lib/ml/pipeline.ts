/**
 * RemediAide 2.0 — run Layer 1–3 for a session after the v1 rule (B0) diagnosis (05_INTEGRATION_SPEC §5).
 * Called at the end of computeConceptDiagnosis. Never throws; on any failure B0 results stay as they are.
 * Writes MlDiagnosis rows (per student × question, plus one per-student summary with questionId = null).
 */
import { prisma } from '@/lib/db/client';
import type { Prisma } from '@prisma/client';
import { callMlService, studentKey, type MlPayload, type MlResult } from './client';

type Opts = { fetchImpl?: typeof fetch; url?: string; timeoutMs?: number; salt?: string };

export async function buildMlPayload(sessionId: string, salt: string): Promise<{ payload: MlPayload; keyToStudent: Map<string, string> } | null> {
  const responses = await prisma.response.findMany({
    where: { sessionPinId: sessionId },
    select: { studentId: true, chosenOptionKey: true, criValue: true, responseTimeMs: true, itemVariantId: true,
              explanation: true, submittedAt: true },
  });
  if (responses.length === 0) return null;
  const variantIds = Array.from(new Set(responses.map((r) => r.itemVariantId)));
  const variants = await prisma.itemVariant.findMany({
    where: { id: { in: variantIds } },
    select: { id: true, questionId: true, correctOptionKey: true, tauMinSeconds: true, renderedText: true,
              renderedOptions: true },
  });
  const vMap = new Map(variants.map((v) => [v.id, v]));
  const qIds = Array.from(new Set(variants.map((v) => v.questionId)));
  const questions = await prisma.question.findMany({
    where: { id: { in: qIds } },
    select: { id: true, templateText: true, mapQuestionId: true },
  });
  const qMap = new Map(questions.map((q) => [q.id, q]));
  const items = new Map<string, MlPayload['items'][number]>();
  const keyToStudent = new Map<string, string>();
  const out: MlPayload['responses'] = [];
  for (const r of responses) {
    const v = vMap.get(r.itemVariantId);
    if (!v) continue;
    const q = qMap.get(v.questionId);
    if (!items.has(v.questionId)) {
      items.set(v.questionId, {
        question_id: v.questionId,
        kc_id: v.questionId, // v1: one question template = one concept
        correct_option: v.correctOptionKey,
        map_question_id: q?.mapQuestionId ?? null,
        question_text: v.renderedText || q?.templateText || '',
      });
    }
    const key = studentKey(r.studentId, salt);
    keyToStudent.set(key, r.studentId);
    const opts = Array.isArray(v.renderedOptions) ? (v.renderedOptions as { key?: string; text?: string }[]) : [];
    out.push({
      student_key: key,
      question_id: v.questionId,
      chosen_option: r.chosenOptionKey,
      chosen_option_text: opts.find((o) => o?.key === r.chosenOptionKey)?.text ?? r.chosenOptionKey,
      is_correct: r.chosenOptionKey === v.correctOptionKey,
      cri: r.criValue,
      response_time_ms: r.responseTimeMs,
      tau_min_ms: v.tauMinSeconds * 1000,
      explanation: r.explanation ?? '',
      answered_at: r.submittedAt.toISOString(),
    });
  }
  return { payload: { session_id: sessionId, items: Array.from(items.values()), responses: out }, keyToStudent };
}

export function toMlDiagnosisRows(result: MlResult, sessionId: string, schoolId: string,
                                  keyToStudent: Map<string, string>): Prisma.MlDiagnosisCreateManyInput[] {
  const rows: Prisma.MlDiagnosisCreateManyInput[] = [];
  for (const s of result.students) {
    const studentId = keyToStudent.get(s.student_key);
    if (!studentId) continue;
    for (const q of s.per_question) {
      rows.push({
        sessionPinId: sessionId, studentId, questionId: q.question_id, schoolId,
        quadrantProbs: q.quadrant_probs, quadrant: q.quadrant,
        masteryProb: q.quadrant_probs.PAHAM_KONSEP + q.quadrant_probs.LUCKY_GUESS,
        misconceptionLabel: q.misconception?.label_id ?? q.misconception?.label ?? null,
        misconceptionProb: q.misconception?.prob ?? null,
        hiddenMisconception: q.hidden_misconception, predictionSet: q.prediction_set,
        deferred: false, reasons: [], ruleStatus: q.rule_status, modelVersion: result.model_version,
      });
    }
    const hidden = s.per_question.some((q) => q.hidden_misconception);
    rows.push({
      sessionPinId: sessionId, studentId, questionId: null, schoolId,
      quadrantProbs: {}, quadrant: s.summary.quadrant, masteryProb: s.summary.mastery_prob,
      hiddenMisconception: hidden, predictionSet: [], deferred: s.summary.deferred,
      reasons: s.summary.reasons.slice(0, 3), ruleStatus: s.summary.rule_status ?? '', modelVersion: result.model_version,
    });
  }
  return rows;
}

/** Returns the number of MlDiagnosis rows written (0 when ML is off or failed). Never throws. */
export async function runMlDiagnosis(sessionId: string, schoolId: string, opts: Opts = {}): Promise<number> {
  try {
    const url = opts.url ?? process.env.ML_SERVICE_URL;
    if (!url) return 0;
    const salt = opts.salt ?? process.env.RESEARCH_EXPORT_SALT;
    if (!salt) {
      console.warn('[ml] RESEARCH_EXPORT_SALT is not set; ML diagnosis skipped (student ids must be pseudonymised)');
      return 0;
    }
    const built = await buildMlPayload(sessionId, salt);
    if (!built) return 0;
    const result = await callMlService(built.payload, { url, timeoutMs: opts.timeoutMs, fetchImpl: opts.fetchImpl });
    if (!result) return 0;
    const rows = toMlDiagnosisRows(result, sessionId, schoolId, built.keyToStudent);
    await prisma.$transaction([
      prisma.mlDiagnosis.deleteMany({ where: { sessionPinId: sessionId } }),
      prisma.mlDiagnosis.createMany({ data: rows }),
    ]);
    console.info(`[ml] session ${sessionId}: ${rows.length} MlDiagnosis rows (${result.model_version}, ${result.latency_ms} ms)`);
    return rows.length;
  } catch (err) {
    console.warn(`[ml] ML diagnosis failed for session ${sessionId}; v1 results kept:`, err);
    return 0;
  }
}
