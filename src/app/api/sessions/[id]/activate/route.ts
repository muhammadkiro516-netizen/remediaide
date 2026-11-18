/**
 * Session API — Activate
 *
 * POST /api/sessions/:id/activate
 *   - Validates state transition LOCKED → ACTIVE
 *   - Sets started_at = now()
 *   - Enqueues BullMQ auto-close job with 900_000ms delay
 *
 * Auth: TEACHER (or PRINCIPAL)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTeacherSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { applyTransition } from '@/lib/session/state-machine';
import { enqueueAutoClose } from '@/workers/auto-close';
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
    select: {
      id: true,
      state: true,
      schoolId: true,
      test: { select: { durationSeconds: true } },
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

  // Validate state transition
  let newState: SessionState;
  try {
    newState = applyTransition(
      sessionPin.state as SessionState,
      'activate'
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
      startedAt: now,
    },
    include: {
      test: { select: { id: true, topic: true, durationSeconds: true } },
    },
  });

  // Calculate delay from actual test durationSeconds (fallback 900s for legacy sessions)
  const rawDuration = sessionPin.test?.durationSeconds ?? 0;
  const safeDuration = rawDuration > 0 ? rawDuration : 900; // fallback 15 min for legacy sessions
  const durationMs = safeDuration * 1000;

  // Enqueue BullMQ auto-close job (fire-and-forget)
  await enqueueAutoClose(id, durationMs);

  return NextResponse.json({ success: true, data: updated });
}
