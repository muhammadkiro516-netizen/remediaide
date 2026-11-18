/**
 * Session API — Close (manual)
 *
 * POST /api/sessions/:id/close
 *   - Validates state transition ACTIVE → CLOSED
 *   - Cancels pending BullMQ auto-close job if any
 *   - Sets closed_at = now()
 *
 * Auth: TEACHER (or PRINCIPAL)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTeacherSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { applyTransition } from '@/lib/session/state-machine';
import { cancelAutoClose } from '@/workers/auto-close';
import type { SessionState } from '@/lib/session/state-machine';

interface RouteContext {
  params: { id: string };
}

export async function POST(
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
    select: { id: true, state: true },
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

  // Validate state transition
  let newState: SessionState;
  try {
    newState = applyTransition(
      sessionPin.state as SessionState,
      'close'
    );
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INVALID_TRANSITION',
          message: err instanceof Error ? err.message : 'Transisi state tidak valid.',
        },
      },
      { status: 409 }
    );
  }

  const now = new Date();

  const updated = await prisma.sessionPin.update({
    where: { id },
    data: {
      state: newState,
      closedAt: now,
    },
    include: {
      test: { select: { id: true, topic: true, durationSeconds: true } },
    },
  });

  // Cancel pending BullMQ job (best-effort, fire-and-forget)
  await cancelAutoClose(id);

  return NextResponse.json({ success: true, data: updated });
}
