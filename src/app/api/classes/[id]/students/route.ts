/**
 * GET  /api/classes/:id/students — list students in a class
 * POST /api/classes/:id/students — add a student (individual)
 *
 * Requirements: 10.4, 10.5
 */

import { NextRequest, NextResponse } from "next/server";
import { requireTeacherSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireTeacherSession();
    const { id } = await params;

    // Verify class belongs to teacher's school
    const cls = await prisma.class.findFirst({
      where: { id, schoolId: session.schoolId },
    });

    if (!cls) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Kelas tidak ditemukan." } },
        { status: 404 }
      );
    }

    const students = await prisma.student.findMany({
      where: { classId: id, schoolId: session.schoolId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ success: true, data: students });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/classes/:id/students]", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server." } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireTeacherSession();
    const { id } = await params;

    // Verify class belongs to teacher's school
    const cls = await prisma.class.findFirst({
      where: { id, schoolId: session.schoolId },
    });

    if (!cls) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Kelas tidak ditemukan." } },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { anonymousLabel } = body as { anonymousLabel?: string };

    if (!anonymousLabel || !anonymousLabel.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Field 'anonymousLabel' wajib diisi." },
        },
        { status: 422 }
      );
    }

    // Check uniqueness
    const existing = await prisma.student.findFirst({
      where: { anonymousLabel: anonymousLabel.trim() },
    });

    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "DUPLICATE",
            message: `Label "${anonymousLabel.trim()}" sudah digunakan.`,
          },
        },
        { status: 409 }
      );
    }

    const student = await prisma.student.create({
      data: {
        classId: id,
        schoolId: session.schoolId,
        anonymousLabel: anonymousLabel.trim(),
      },
    });

    return NextResponse.json({ success: true, data: student }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[POST /api/classes/:id/students]", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server." } },
      { status: 500 }
    );
  }
}
