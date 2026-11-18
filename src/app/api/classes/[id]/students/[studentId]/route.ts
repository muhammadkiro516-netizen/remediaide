/**
 * DELETE /api/classes/:id/students/:studentId — remove a student from a class
 *
 * Requirements: 10.5
 */

import { NextRequest, NextResponse } from "next/server";
import { requireTeacherSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

interface RouteParams {
  params: Promise<{ id: string; studentId: string }>;
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireTeacherSession();
    const { id, studentId } = await params;

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

    const student = await prisma.student.findFirst({
      where: { id: studentId, classId: id, schoolId: session.schoolId },
    });

    if (!student) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Siswa tidak ditemukan." } },
        { status: 404 }
      );
    }

    await prisma.student.delete({ where: { id: studentId } });

    return NextResponse.json({ success: true, data: { id: studentId } });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[DELETE /api/classes/:id/students/:studentId]", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server." } },
      { status: 500 }
    );
  }
}
