/**
 * POST /api/sessions/:id/lkpd-ml  { misconception: string }
 * RemediAide 2.0: LKPD for an AI group = students sharing a named misconception (MlDiagnosis). Uses the existing
 * LKPD generator (group type MISKONSEPSI) with the misconception name in the title and prescription.
 * Auth: TEACHER (school-scoped).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireTeacherSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { PRESCRIPTIONS } from '@/lib/diagnosis/compute';
import { generateLKPDPdf } from '@/lib/pdf/lkpd-generator';
import { buildMlView, type MlRow } from '@/lib/ml/view';

interface RouteContext {
  params: { id: string };
}

export async function POST(request: NextRequest, context: RouteContext) {
  let session;
  try {
    session = await requireTeacherSession();
  } catch (err) {
    if (err instanceof NextResponse) return err;
    throw err;
  }
  const { id: sessionId } = context.params;
  const body = (await request.json().catch(() => null)) as { misconception?: unknown } | null;
  const label = typeof body?.misconception === 'string' ? body.misconception.trim() : '';
  if (!label) {
    return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'misconception diperlukan.' } }, { status: 422 });
  }
  const pin = await prisma.sessionPin.findFirst({ where: { id: sessionId, schoolId: session.schoolId }, select: { testId: true } });
  if (!pin) {
    return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Sesi tidak ditemukan.' } }, { status: 404 });
  }
  const rows = await prisma.mlDiagnosis.findMany({
    where: { sessionPinId: sessionId, schoolId: session.schoolId },
    include: { student: { select: { anonymousLabel: true } } },
  });
  const view = buildMlView(rows.map((r) => ({
    id: r.id, studentId: r.studentId, anonymousLabel: r.student.anonymousLabel, questionId: r.questionId,
    quadrantProbs: (r.quadrantProbs ?? {}) as Record<string, number>, quadrant: r.quadrant, masteryProb: r.masteryProb,
    misconceptionLabel: r.misconceptionLabel, misconceptionProb: r.misconceptionProb, hiddenMisconception: r.hiddenMisconception,
    predictionSet: (r.predictionSet ?? []) as string[], deferred: r.deferred,
    reasons: (r.reasons ?? []) as { text: string; impact: number }[], ruleStatus: r.ruleStatus, modelVersion: r.modelVersion,
  }) satisfies MlRow));
  const group = view.groups.find((g) => g.misconception === label);
  if (!group) {
    return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Kelompok miskonsepsi tidak ditemukan.' } }, { status: 404 });
  }
  const test = await prisma.test.findFirst({
    where: { id: pin.testId, schoolId: session.schoolId },
    select: { topic: true, classId: true, questions: { orderBy: { itemOrder: 'asc' }, take: 3,
              select: { templateText: true, variants: { take: 1, select: { renderedText: true } } } } },
  });
  const school = await prisma.school.findFirst({ where: { id: session.schoolId }, select: { name: true } });
  const teacher = await prisma.teacher.findUnique({ where: { id: session.userId }, select: { name: true } });
  const base = (process.env.AUTH_URL ?? 'https://remediaidee.vercel.app').replace(/\/$/, '');
  let pdf: Uint8Array;
  try {
    pdf = await generateLKPDPdf({
      schoolName: school?.name ?? 'Sekolah',
      teacherName: teacher?.name ?? session.email,
      topic: `${test?.topic ?? 'Topik'} — miskonsepsi: ${label}`,
      sessionId,
      sessionDate: new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()),
      groupType: 'MISKONSEPSI',
      prescription: `Miskonsepsi yang terdeteksi: "${label}". ${PRESCRIPTIONS.MISKONSEPSI}`,
      memberLabels: group.members,
      exerciseTexts: (test?.questions ?? []).map((q) => q.variants[0]?.renderedText ?? q.templateText),
      qrUrl: `${base}/student/join`,
    });
  } catch (err) {
    console.error('[lkpd-ml] PDF generation failed:', err);
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal membuat PDF.' } }, { status: 500 });
  }
  return new Response(Buffer.from(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="LKPD-AI-${sessionId.slice(0, 8)}.pdf"` },
  });
}
