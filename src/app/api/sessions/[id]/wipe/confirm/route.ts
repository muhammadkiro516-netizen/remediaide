/**
 * POST /api/sessions/:id/wipe/confirm
 *
 * Executes the irreversible Auto-Wipe for a session.
 * Step 2 of the two-step confirmation dialog.
 *
 * Body: { confirmationText: string }
 * confirmationText must exactly equal "HAPUS DATA RESPONS"
 *
 * Auth: TEACHER (must own the session's class)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTeacherSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { executeAutoWipe } from '@/lib/privacy/auto-wipe';

const REQUIRED_CONFIRMATION = 'HAPUS DATA RESPONS';

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

  const { id: sessionId } = context.params;

  let body: { confirmationText?: string };
  try {
    body = (await request.json()) as { confirmationText?: string };
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Body tidak valid.' } },
      { status: 422 }
    );
  }

  // Validate confirmation text (case-sensitive)
  if (body.confirmationText !== REQUIRED_CONFIRMATION) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Teks konfirmasi salah. Ketik persis: "${REQUIRED_CONFIRMATION}"`,
        },
      },
      { status: 422 }
    );
  }

  // Validate teacher owns this session
  const sessionPin = await prisma.sessionPin.findFirst({
    where: { id: sessionId, schoolId: session.schoolId },
    select: {
      id: true,
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

  // Execute wipe (transactional — rolls back entirely on failure)
  let result;
  try {
    result = await executeAutoWipe(sessionId, session.userId);
  } catch (err) {
    console.error('[wipe/confirm] Auto-wipe failed:', err);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'WIPE_FAILED',
          message: 'Penghapusan gagal. Tidak ada data yang dihapus. Silakan coba lagi.',
        },
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      recordsDeleted: result.recordsDeleted,
      wipedAt: result.wipedAt.toISOString(),
      message: `${result.recordsDeleted} baris data respons telah dihapus secara permanen. Status ketuntasan konsep tetap tersimpan untuk pelaporan.`,
    },
  });
}
