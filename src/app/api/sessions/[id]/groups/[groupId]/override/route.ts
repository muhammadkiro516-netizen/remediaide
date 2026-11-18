/**
 * POST /api/sessions/:id/groups/:groupId/override
 *
 * Move a student (by anonymousLabel) from one remedial group to another.
 * Body: { anonymousLabel: string, toGroupId: string }
 *
 * Auth: TEACHER
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTeacherSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';

interface RouteContext {
  params: { id: string; groupId: string };
}

export async function POST(request: NextRequest, context: RouteContext) {
  let session;
  try {
    session = await requireTeacherSession();
  } catch (err) {
    if (err instanceof NextResponse) return err;
    throw err;
  }

  const { id: sessionId, groupId } = context.params;

  let body: { anonymousLabel?: string; toGroupId?: string };
  try {
    body = (await request.json()) as { anonymousLabel?: string; toGroupId?: string };
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Body tidak valid.' } },
      { status: 422 }
    );
  }

  const { anonymousLabel, toGroupId } = body;
  if (!anonymousLabel || !toGroupId) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'anonymousLabel dan toGroupId diperlukan.' },
      },
      { status: 422 }
    );
  }

  // Load source group (validate ownership via sessionPin)
  const sourceGroup = await prisma.remedialGroup.findFirst({
    where: { id: groupId, sessionPinId: sessionId, schoolId: session.schoolId },
    select: { id: true, memberLabels: true },
  });

  if (!sourceGroup) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Kelompok sumber tidak ditemukan.' } },
      { status: 404 }
    );
  }

  // Load target group
  const targetGroup = await prisma.remedialGroup.findFirst({
    where: { id: toGroupId, sessionPinId: sessionId, schoolId: session.schoolId },
    select: { id: true, memberLabels: true },
  });

  if (!targetGroup) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Kelompok tujuan tidak ditemukan.' } },
      { status: 404 }
    );
  }

  const sourceLabels = sourceGroup.memberLabels as string[];
  const targetLabels = targetGroup.memberLabels as string[];

  if (!sourceLabels.includes(anonymousLabel)) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: `${anonymousLabel} tidak ada di kelompok sumber.` },
      },
      { status: 422 }
    );
  }

  // Execute override in a transaction
  const [updatedSource, updatedTarget] = await prisma.$transaction([
    prisma.remedialGroup.update({
      where: { id: groupId },
      data: { memberLabels: sourceLabels.filter((l) => l !== anonymousLabel) },
    }),
    prisma.remedialGroup.update({
      where: { id: toGroupId },
      data: {
        memberLabels: targetLabels.includes(anonymousLabel)
          ? targetLabels
          : [...targetLabels, anonymousLabel],
      },
    }),
  ]);

  console.info(
    `[groups-override] Session ${sessionId}: moved ${anonymousLabel} from ${groupId} → ${toGroupId} by teacher ${session.userId}`
  );

  return NextResponse.json({ success: true, data: { source: updatedSource, target: updatedTarget } });
}
