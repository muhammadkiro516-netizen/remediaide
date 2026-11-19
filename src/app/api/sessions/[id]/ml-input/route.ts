/**
 * GET /api/sessions/:id/ml-input — minimal response data for on-device Mode AI (T68, Layer 1 only).
 * Returns anonymous labels (already shown on the dashboard), correctness, CRI and time; no explanation text.
 * Auth: TEACHER (school-scoped).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireTeacherSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';

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
  const rows = await prisma.response.findMany({
    where: { sessionPinId: id, schoolId: session.schoolId },
    select: { chosenOptionKey: true, criValue: true, submittedAt: true, student: { select: { anonymousLabel: true } },
              itemVariant: { select: { questionId: true, correctOptionKey: true } } },
  });
  return NextResponse.json({
    success: true,
    data: rows.map((r) => ({
      studentKey: r.student.anonymousLabel, questionId: r.itemVariant.questionId, kcId: r.itemVariant.questionId,
      isCorrect: r.chosenOptionKey === r.itemVariant.correctOptionKey, cri: r.criValue, answeredAt: r.submittedAt.toISOString(),
    })),
  });
}
