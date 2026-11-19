/**
 * POST /api/sessions/:id/research-consent  { consent: boolean }
 * The teacher who owns the session records that parent/guardian consent was collected (UU PDP Pasal 25).
 * Default is false: without it the research export returns 403.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireTeacherSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';

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
  const body = (await request.json().catch(() => null)) as { consent?: unknown } | null;
  if (!body || typeof body.consent !== 'boolean') {
    return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'consent harus boolean.' } }, { status: 422 });
  }
  const { id } = context.params;
  const pin = await prisma.sessionPin.findFirst({
    where: { id, schoolId: session.schoolId },
    select: { id: true, test: { select: { teacherId: true } } },
  });
  if (!pin) {
    return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Sesi tidak ditemukan.' } }, { status: 404 });
  }
  if (pin.test.teacherId !== session.userId) {
    return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Hanya guru pemilik sesi.' } }, { status: 403 });
  }
  const updated = await prisma.sessionPin.update({ where: { id }, data: { researchConsent: body.consent }, select: { researchConsent: true } });
  return NextResponse.json({ success: true, data: updated });
}
