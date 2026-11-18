/**
 * POST /api/sessions/:id/lkpd
 *
 * Generate and return an LKPD-KK PDF for a specific remedial group.
 *
 * Body: { groupId: string }
 *
 * Returns: application/pdf stream
 *
 * Auth: TEACHER
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTeacherSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { generateLKPDPdf, type CognitiveGroupType } from '@/lib/pdf/lkpd-generator';
import { generateAndSaveToken, buildQrUrl } from '@/lib/exit-ticket/token';

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

  let body: { groupId?: string };
  try {
    body = (await request.json()) as { groupId?: string };
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Body tidak valid.' } },
      { status: 422 }
    );
  }

  if (!body.groupId) {
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'groupId diperlukan.' } },
      { status: 422 }
    );
  }

  // ── Load session + test metadata ─────────────────────────────────────────
  const sessionPin = await prisma.sessionPin.findFirst({
    where: { id: sessionId, schoolId: session.schoolId },
    select: { id: true, createdAt: true, testId: true },
  });

  if (!sessionPin) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Sesi tidak ditemukan.' } },
      { status: 404 }
    );
  }

  const test = await prisma.test.findFirst({
    where: { id: sessionPin.testId, schoolId: session.schoolId },
    select: {
      topic: true,
      classId: true,
      questions: {
        orderBy: { itemOrder: 'asc' },
        take: 3,
        select: {
          id: true,
          templateText: true,
          variants: {
            take: 1,
            select: { renderedText: true },
          },
        },
      },
    },
  });

  if (!test) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Test tidak ditemukan.' } },
      { status: 404 }
    );
  }

  const schoolData = await prisma.school.findFirst({
    where: { classes: { some: { id: test.classId } } },
    select: { name: true },
  });

  // ── Load remedial group ──────────────────────────────────────────────────
  const group = await prisma.remedialGroup.findFirst({
    where: { id: body.groupId, sessionPinId: sessionId, schoolId: session.schoolId },
    select: { cognitiveStatus: true, memberLabels: true, prescription: true },
  });

  if (!group) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Kelompok tidak ditemukan.' } },
      { status: 404 }
    );
  }

  // ── Load teacher name ────────────────────────────────────────────────────
  const teacher = await prisma.teacher.findUnique({
    where: { id: session.userId },
    select: { name: true },
  });

  // ── Generate Exit Ticket Token + Build QR URL ─────────────────────────────
  let exitToken: string;
  try {
    exitToken = await generateAndSaveToken({
      sessionPinId: sessionId,
      remedialGroupId: body.groupId,
      schoolId: session.schoolId,
    });
  } catch (err) {
    console.error('[lkpd] Failed to create exit ticket token:', err);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal membuat token exit ticket.' } },
      { status: 500 }
    );
  }

  const rawBaseUrl = process.env.AUTH_URL;
  if (!rawBaseUrl) {
    console.warn('[lkpd] AUTH_URL not set, using fallback URL');
  }
  const qrUrl = buildQrUrl(exitToken, rawBaseUrl);

  // ── Format date ───────────────────────────────────────────────────────────
  const sessionDate = new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  // ── Exercise texts ────────────────────────────────────────────────────────
  const exerciseTexts = test.questions.map((q) =>
    q.variants[0]?.renderedText ?? q.templateText
  );

  // ── Generate PDF ──────────────────────────────────────────────────────────
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await generateLKPDPdf({
      schoolName: schoolData?.name ?? 'Sekolah',
      teacherName: teacher?.name ?? session.email,
      topic: test.topic,
      sessionId,
      sessionDate,
      groupType: group.cognitiveStatus as CognitiveGroupType,
      prescription: group.prescription,
      memberLabels: group.memberLabels as string[],
      exerciseTexts,
      qrUrl,
    });
  } catch (err) {
    console.error('[lkpd] PDF generation failed:', err);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal membuat PDF.' } },
      { status: 500 }
    );
  }

  const filename = `LKPD-${group.cognitiveStatus}-${sessionId.slice(0, 8)}.pdf`;

  return new Response(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(pdfBytes.byteLength),
      'Cache-Control': 'no-store',
    },
  });
}
