/**
 * GET /api/sessions/:id/ml — RemediAide 2.0 "Mode AI" data for the results dashboard.
 * Returns { available:false } (not an error) when the session has no MlDiagnosis rows.
 * Auth: TEACHER (school-scoped).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireTeacherSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { buildMlView, type MlRow } from '@/lib/ml/view';

interface RouteContext {
  params: { id: string };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  let session;
  try {
    session = await requireTeacherSession();
  } catch (err) {
    if (err instanceof NextResponse) return err;
    throw err;
  }
  const { id } = context.params;
  const pin = await prisma.sessionPin.findFirst({ where: { id, schoolId: session.schoolId }, select: { id: true } });
  if (!pin) {
    return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Sesi tidak ditemukan.' } }, { status: 404 });
  }
  const rows = await prisma.mlDiagnosis.findMany({
    where: { sessionPinId: id, schoolId: session.schoolId },
    include: { student: { select: { anonymousLabel: true } } },
  });
  const view = buildMlView(rows.map((r) => ({
    id: r.id, studentId: r.studentId, anonymousLabel: r.student.anonymousLabel, questionId: r.questionId,
    quadrantProbs: (r.quadrantProbs ?? {}) as Record<string, number>, quadrant: r.quadrant, masteryProb: r.masteryProb,
    misconceptionLabel: r.misconceptionLabel, misconceptionProb: r.misconceptionProb,
    hiddenMisconception: r.hiddenMisconception, predictionSet: (r.predictionSet ?? []) as string[], deferred: r.deferred,
    reasons: (r.reasons ?? []) as { text: string; impact: number }[], ruleStatus: r.ruleStatus, modelVersion: r.modelVersion,
  }) satisfies MlRow));
  return NextResponse.json({ success: true, data: view });
}
