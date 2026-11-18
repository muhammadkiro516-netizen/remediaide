/**
 * GET /api/sessions/:id/diagnoses
 *
 * Returns all ConceptDiagnosis records for a session, joined with
 * student anonymousLabel and question templateText for the results dashboard.
 *
 * Auth: TEACHER
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

  // Validate session belongs to this school
  const sessionPin = await prisma.sessionPin.findFirst({
    where: { id, schoolId: session.schoolId },
    select: { id: true },
  });

  if (!sessionPin) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Sesi tidak ditemukan.' } },
      { status: 404 }
    );
  }

  const diagnoses = await prisma.conceptDiagnosis.findMany({
    where: { sessionPinId: id },
    select: {
      id: true,
      finalStatus: true,
      votingTally: true,
      tiebreakerApplied: true,
      validItemCount: true,
      manuallyOverridden: true,
      diagnosedAt: true,
      student: { select: { id: true, anonymousLabel: true } },
      question: { select: { id: true, templateText: true, itemOrder: true } },
    },
    orderBy: [
      { student: { anonymousLabel: 'asc' } },
      { question: { itemOrder: 'asc' } },
    ],
  });

  return NextResponse.json({ success: true, data: diagnoses });
}
