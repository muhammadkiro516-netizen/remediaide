/**
 * Session API — List & Create
 *
 * GET  /api/sessions  — list sessions for the authenticated teacher's school
 * POST /api/sessions  — create a new session (LOCKED state, random 6-digit PIN)
 *
 * Auth: TEACHER (or PRINCIPAL)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTeacherSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';

// ─── Helper: Generate 6-digit PIN ─────────────────────────────────────────────

async function generateUniquePin(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const pin = String(Math.floor(100_000 + Math.random() * 900_000));
    const existing = await prisma.sessionPin.findUnique({
      where: { pinCode: pin },
      select: { id: true },
    });
    if (!existing) return pin;
  }
  throw new Error('Unable to generate unique PIN after 20 attempts.');
}

// ─── GET /api/sessions ────────────────────────────────────────────────────────

export async function GET(_request: NextRequest) {
  let session;
  try {
    session = await requireTeacherSession();
  } catch (err) {
    if (err instanceof NextResponse) return err;
    throw err;
  }

  const sessions = await prisma.sessionPin.findMany({
    where: { schoolId: session.schoolId },
    include: {
      test: {
        select: {
          id: true,
          topic: true,
          durationSeconds: true,
          _count: { select: { questions: true } },
        },
      },
      _count: { select: { responses: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ success: true, data: sessions });
}

// ─── POST /api/sessions ───────────────────────────────────────────────────────

interface CreateSessionBody {
  testId: string;
}

export async function POST(request: NextRequest) {
  let session;
  try {
    session = await requireTeacherSession();
  } catch (err) {
    if (err instanceof NextResponse) return err;
    throw err;
  }

  let body: CreateSessionBody;
  try {
    body = (await request.json()) as CreateSessionBody;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Request body tidak valid.' },
      },
      { status: 422 }
    );
  }

  if (!body.testId || typeof body.testId !== 'string') {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'testId diperlukan.' },
      },
      { status: 422 }
    );
  }

  // Verify the test belongs to this teacher's school
  const test = await prisma.test.findFirst({
    where: { id: body.testId, schoolId: session.schoolId },
    select: { id: true, teacherId: true, topic: true },
  });

  if (!test) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Test tidak ditemukan atau bukan milik sekolah Anda.',
        },
      },
      { status: 403 }
    );
  }

  let pinCode: string;
  try {
    pinCode = await generateUniquePin();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Gagal membuat PIN unik. Coba lagi.',
        },
      },
      { status: 500 }
    );
  }

  const newSession = await prisma.sessionPin.create({
    data: {
      testId: body.testId,
      schoolId: session.schoolId,
      pinCode,
      state: 'LOCKED',
    },
    include: {
      test: { select: { id: true, topic: true, durationSeconds: true } },
    },
  });

  return NextResponse.json({ success: true, data: newSession }, { status: 201 });
}
