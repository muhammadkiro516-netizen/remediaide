/**
 * GET    /api/tests/:testId — get test details
 * PUT    /api/tests/:testId — update test
 * DELETE /api/tests/:testId — delete test
 *
 * Requirements: 10.1
 */

import { NextRequest, NextResponse } from "next/server";
import { requireTeacherSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

interface RouteParams {
  params: Promise<{ testId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireTeacherSession();
    const { testId } = await params;

    const test = await prisma.test.findFirst({
      where: { id: testId, schoolId: session.schoolId },
      include: {
        class: { select: { id: true, name: true, grade: true } },
        _count: { select: { questions: true, sessions: true } },
      },
    });

    if (!test) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Test tidak ditemukan." } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: test });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/tests/:testId]", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server." } },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireTeacherSession();
    const { testId } = await params;

    const existing = await prisma.test.findFirst({
      where: { id: testId, schoolId: session.schoolId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Test tidak ditemukan." } },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { topic, durationSeconds } = body as { topic?: string; durationSeconds?: number };

    const updated = await prisma.test.update({
      where: { id: testId },
      data: {
        ...(topic ? { topic: topic.trim() } : {}),
        ...(durationSeconds ? { durationSeconds: Number(durationSeconds) } : {}),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[PUT /api/tests/:testId]", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server." } },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireTeacherSession();
    const { testId } = await params;

    const existing = await prisma.test.findFirst({
      where: { id: testId, schoolId: session.schoolId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Test tidak ditemukan." } },
        { status: 404 }
      );
    }

    // Check for active sessions before deleting
    const activeSessionCount = await prisma.sessionPin.count({ where: { testId, state: "ACTIVE" } });
    if (activeSessionCount > 0) {
      return NextResponse.json(
        { success: false, error: { code: "ACTIVE_SESSION", message: "Tidak bisa menghapus paket soal yang memiliki sesi aktif." } },
        { status: 409 }
      );
    }

    // Get session IDs for cascade delete
    const sessionPins = await prisma.sessionPin.findMany({ where: { testId }, select: { id: true } });
    const sessionIds = sessionPins.map((s) => s.id);

    // Cascade delete in transaction
    await prisma.$transaction([
      prisma.response.deleteMany({ where: { session: { testId } } }),
      prisma.conceptDiagnosis.deleteMany({ where: { session: { testId } } }),
      prisma.remedialGroup.deleteMany({ where: { sessionPinId: { in: sessionIds } } }),
      prisma.autoWipeLog.deleteMany({ where: { sessionPinId: { in: sessionIds } } }),
      prisma.itemVariant.deleteMany({ where: { question: { testId } } }),
      prisma.sessionPin.deleteMany({ where: { testId } }),
      prisma.question.deleteMany({ where: { testId } }),
      prisma.test.delete({ where: { id: testId } }),
    ]);

    return NextResponse.json({ success: true, data: { id: testId } });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[DELETE /api/tests/:testId]", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server." } },
      { status: 500 }
    );
  }
}
