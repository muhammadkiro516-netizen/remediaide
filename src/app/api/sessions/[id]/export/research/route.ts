/**
 * GET /api/sessions/:id/export/research — anonymous CSV for the pilot study (UU PDP Pasal 25).
 * Only the teacher who owns the session; requires SessionPin.researchConsent = true (else 403).
 * Must be called BEFORE auto-wipe (explanations are deleted with the responses). The download is logged
 * without any of its content.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireTeacherSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { buildResearchCsv } from '@/lib/ml/research-export';

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
  const pin = await prisma.sessionPin.findFirst({
    where: { id, schoolId: session.schoolId },
    select: { id: true, researchConsent: true, test: { select: { teacherId: true } } },
  });
  if (!pin) {
    return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Sesi tidak ditemukan.' } }, { status: 404 });
  }
  if (pin.test.teacherId !== session.userId) {
    return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Hanya guru pemilik sesi.' } }, { status: 403 });
  }
  if (!pin.researchConsent) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Persetujuan riset (orang tua/wali) belum dicatat untuk sesi ini.' } },
      { status: 403 }
    );
  }
  const salt = process.env.RESEARCH_EXPORT_SALT;
  if (!salt) {
    return NextResponse.json({ success: false, error: { code: 'CONFIG', message: 'RESEARCH_EXPORT_SALT belum diatur.' } }, { status: 500 });
  }
  const responses = await prisma.response.findMany({
    where: { sessionPinId: id },
    select: { studentId: true, chosenOptionKey: true, criValue: true, responseTimeMs: true, explanation: true, submittedAt: true,
              itemVariant: { select: { correctOptionKey: true, tauMinSeconds: true, questionId: true,
                                       question: { select: { mapQuestionId: true } } } } },
    orderBy: { submittedAt: 'asc' },
  });
  const csv = buildResearchCsv(id, responses.map((r) => ({
    studentId: r.studentId, questionId: r.itemVariant.questionId, mapQuestionId: r.itemVariant.question.mapQuestionId,
    chosenOptionKey: r.chosenOptionKey, correctOptionKey: r.itemVariant.correctOptionKey, criValue: r.criValue,
    responseTimeMs: r.responseTimeMs, tauMinSeconds: r.itemVariant.tauMinSeconds, explanation: r.explanation,
    submittedAt: r.submittedAt,
  })), salt);
  console.info(`[research-export] session ${id}: ${responses.length} rows exported by teacher ${session.userId}`);
  return new NextResponse(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="remediaide_riset.csv"' },
  });
}
