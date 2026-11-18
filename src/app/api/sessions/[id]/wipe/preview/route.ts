/**
 * POST /api/sessions/:id/wipe/preview
 *
 * Returns a summary of data that WOULD be deleted, without actually deleting.
 * Used in Step 1 of the two-step Auto-Wipe confirmation dialog.
 *
 * Auth: TEACHER (must own the session's class)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTeacherSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { previewAutoWipe } from '@/lib/privacy/auto-wipe';

interface RouteContext {
  params: { id: string };
}

export async function POST(_request: NextRequest, context: RouteContext) {
  let session;
  try {
    session = await requireTeacherSession();
  } catch (err) {
    if (err instanceof NextResponse) return err;
    throw err;
  }

  const { id: sessionId } = context.params;

  // Validate teacher owns this session
  const sessionPin = await prisma.sessionPin.findFirst({
    where: { id: sessionId, schoolId: session.schoolId },
    select: {
      id: true,
      state: true,
      test: { select: { teacherId: true } },
    },
  });

  if (!sessionPin) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Sesi tidak ditemukan.' } },
      { status: 404 }
    );
  }

  if (sessionPin.test.teacherId !== session.userId) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Hanya guru pemilik kelas yang dapat menghapus data.' },
      },
      { status: 403 }
    );
  }

  const preview = await previewAutoWipe(sessionId);

  return NextResponse.json({ success: true, data: preview });
}
