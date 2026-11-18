/**
 * GET  /api/sessions/:id/groups  — return existing RemedialGroups
 * POST /api/sessions/:id/groups  — body { action: 'generate' } triggers pipeline
 *
 * Auth: TEACHER
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTeacherSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { computeConceptDiagnosis } from '@/lib/diagnosis/compute';

interface RouteContext {
  params: { id: string };
}

async function validateSessionOwnership(sessionId: string, schoolId: string) {
  return prisma.sessionPin.findFirst({
    where: { id: sessionId, schoolId },
    select: { id: true, state: true },
  });
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

  const sessionPin = await validateSessionOwnership(id, session.schoolId);
  if (!sessionPin) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Sesi tidak ditemukan.' } },
      { status: 404 }
    );
  }

  const groups = await prisma.remedialGroup.findMany({
    where: { sessionPinId: id },
    orderBy: { cognitiveStatus: 'asc' },
  });

  return NextResponse.json({ success: true, data: groups });
}

export async function POST(request: NextRequest, context: RouteContext) {
  let session;
  try {
    session = await requireTeacherSession();
  } catch (err) {
    if (err instanceof NextResponse) return err;
    throw err;
  }

  const { id } = context.params;

  const sessionPin = await validateSessionOwnership(id, session.schoolId);
  if (!sessionPin) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Sesi tidak ditemukan.' } },
      { status: 404 }
    );
  }

  let body: { action?: string };
  try {
    body = (await request.json()) as { action?: string };
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Body tidak valid.' } },
      { status: 422 }
    );
  }

  if (body.action !== 'generate') {
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'action harus "generate".' } },
      { status: 422 }
    );
  }

  // Run the full pipeline (sync in API route — acceptable for pilot scale ≤40 students)
  await computeConceptDiagnosis(id);

  const groups = await prisma.remedialGroup.findMany({
    where: { sessionPinId: id },
    orderBy: { cognitiveStatus: 'asc' },
  });

  return NextResponse.json({ success: true, data: groups });
}
