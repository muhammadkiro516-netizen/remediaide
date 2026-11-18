/**
 * Session API — Detail
 *
 * GET /api/sessions/:id — return session detail with test info
 *
 * Auth: TEACHER (or PRINCIPAL)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTeacherSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';

interface RouteContext {
  params: { id: string };
}

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
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
    include: {
      test: {
        select: {
          id: true,
          topic: true,
          durationSeconds: true,
          teacher: { select: { id: true, name: true } },
          _count: { select: { questions: true } },
        },
      },
      _count: {
        select: { responses: true, diagnoses: true },
      },
    },
  });

  if (!sessionPin) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Sesi tidak ditemukan atau bukan milik sekolah Anda.',
        },
      },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, data: sessionPin });
}
