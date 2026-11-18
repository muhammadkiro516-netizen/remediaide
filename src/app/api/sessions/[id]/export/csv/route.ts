/**
 * GET /api/sessions/:id/export/csv
 *
 * Export ConceptDiagnosis records as CSV.
 * Columns: anonymousLabel, conceptName (templateText), finalStatus,
 *          validItemCount, tiebreakerApplied, diagnosedAt
 *
 * Auth: TEACHER
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTeacherSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';

interface RouteContext {
  params: { id: string };
}

function escapeCSV(value: string | number | boolean): string {
  const str = String(value);
  // Wrap in quotes if contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
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
      finalStatus: true,
      validItemCount: true,
      tiebreakerApplied: true,
      diagnosedAt: true,
      student: { select: { anonymousLabel: true } },
      question: { select: { templateText: true, itemOrder: true } },
    },
    orderBy: [
      { student: { anonymousLabel: 'asc' } },
      { question: { itemOrder: 'asc' } },
    ],
  });

  // Build CSV
  const header = [
    'anonymousLabel',
    'conceptName',
    'finalStatus',
    'validItemCount',
    'tiebreakerApplied',
    'diagnosedAt',
  ].join(',');

  const rows = diagnoses.map((d) =>
    [
      escapeCSV(d.student.anonymousLabel),
      escapeCSV(d.question.templateText.substring(0, 80)),
      escapeCSV(d.finalStatus),
      escapeCSV(d.validItemCount),
      escapeCSV(d.tiebreakerApplied),
      escapeCSV(d.diagnosedAt.toISOString()),
    ].join(',')
  );

  const csv = [header, ...rows].join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="remediaide-results-${id}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
