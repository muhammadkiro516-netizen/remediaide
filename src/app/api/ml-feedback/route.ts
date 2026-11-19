/**
 * POST /api/ml-feedback — teacher verdict on an ML diagnosis (= new gold label for Layer 3, pilot).
 * Body: { mlDiagnosisId, action: ACCEPT | CHANGE_QUADRANT | CHANGE_MISCONCEPTION | NOT_SURE, newValue? }
 * Auth: TEACHER; the diagnosis must belong to the teacher's school.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireTeacherSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { validateFeedback } from '@/lib/ml/view';

export async function POST(request: NextRequest) {
  let session;
  try {
    session = await requireTeacherSession();
  } catch (err) {
    if (err instanceof NextResponse) return err;
    throw err;
  }
  const v = validateFeedback(await request.json().catch(() => null));
  if (!v.ok) {
    return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: v.message } }, { status: 422 });
  }
  const diag = await prisma.mlDiagnosis.findFirst({ where: { id: v.mlDiagnosisId, schoolId: session.schoolId }, select: { id: true } });
  if (!diag) {
    return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Diagnosis tidak ditemukan.' } }, { status: 404 });
  }
  const fb = await prisma.mlFeedback.create({
    data: { mlDiagnosisId: diag.id, schoolId: session.schoolId, teacherId: session.userId, action: v.action, newValue: v.newValue },
    select: { id: true },
  });
  return NextResponse.json({ success: true, data: fb }, { status: 201 });
}
