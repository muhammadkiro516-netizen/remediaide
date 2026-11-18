/**
 * GET  /api/tests — list all tests for teacher's school
 * POST /api/tests — create a new test
 *
 * Requirements: 10.1
 */

import { NextRequest, NextResponse } from "next/server";
import { requireTeacherSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

export async function GET() {
  try {
    const session = await requireTeacherSession();

    const tests = await prisma.test.findMany({
      where: { schoolId: session.schoolId },
      include: {
        class: { select: { id: true, name: true, grade: true } },
        _count: { select: { questions: true, sessions: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: tests });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/tests]", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server." } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireTeacherSession();

    const body = await request.json();
    const { classId, topic, durationSeconds } = body as {
      classId?: string;
      topic?: string;
      durationSeconds?: number;
    };

    if (!classId || !topic) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Field 'classId' dan 'topic' wajib diisi." },
        },
        { status: 422 }
      );
    }

    // Validasi durationSeconds
    const dur = durationSeconds ?? 900;
    if (
      typeof dur !== "number" ||
      !Number.isInteger(dur) ||
      dur < 60 ||
      dur > 10800
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "durationSeconds harus berupa bilangan bulat antara 60 dan 10800.",
          },
        },
        { status: 422 }
      );
    }

    // Verify class belongs to the same school
    const cls = await prisma.class.findFirst({
      where: { id: classId, schoolId: session.schoolId },
    });

    if (!cls) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Kelas tidak ditemukan." } },
        { status: 404 }
      );
    }

    const test = await prisma.test.create({
      data: {
        schoolId: session.schoolId,
        teacherId: session.userId,
        classId,
        topic: topic.trim(),
        durationSeconds: dur,
      },
      include: {
        class: { select: { id: true, name: true, grade: true } },
        _count: { select: { questions: true } },
      },
    });

    return NextResponse.json({ success: true, data: test }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[POST /api/tests]", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server." } },
      { status: 500 }
    );
  }
}
