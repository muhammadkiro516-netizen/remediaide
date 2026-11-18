/**
 * GET /api/classes  — list all classes for teacher's school
 * POST /api/classes — create a new class
 *
 * Requirements: 10.1, 10.4
 */

import { NextRequest, NextResponse } from "next/server";
import { requireTeacherSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

export async function GET() {
  try {
    const session = await requireTeacherSession();

    const classes = await prisma.class.findMany({
      where: { schoolId: session.schoolId },
      include: {
        _count: { select: { students: true } },
        teacher: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: classes });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/classes]", err);
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
    const { name, grade, academicYear } = body as {
      name?: string;
      grade?: string;
      academicYear?: number;
    };

    if (!name || !grade || !academicYear) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Field 'name', 'grade', dan 'academicYear' wajib diisi.",
          },
        },
        { status: 422 }
      );
    }

    const newClass = await prisma.class.create({
      data: {
        schoolId: session.schoolId,
        teacherId: session.userId,
        name: name.trim(),
        grade: grade.trim(),
        academicYear: Number(academicYear),
      },
      include: {
        _count: { select: { students: true } },
      },
    });

    return NextResponse.json({ success: true, data: newClass }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[POST /api/classes]", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server." } },
      { status: 500 }
    );
  }
}
