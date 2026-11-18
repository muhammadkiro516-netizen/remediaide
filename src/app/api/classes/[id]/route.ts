/**
 * GET    /api/classes/:id — get class details
 * PUT    /api/classes/:id — update class
 * DELETE /api/classes/:id — delete class
 *
 * Requirements: 10.4
 */

import { NextRequest, NextResponse } from "next/server";
import { requireTeacherSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { Prisma } from "@prisma/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireTeacherSession();
    const { id } = await params;

    const cls = await prisma.class.findFirst({
      where: { id, schoolId: session.schoolId },
      include: {
        students: { orderBy: { createdAt: "asc" } },
        _count: { select: { students: true } },
        teacher: { select: { id: true, name: true } },
      },
    });

    if (!cls) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Kelas tidak ditemukan." } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: cls });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/classes/:id]", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server." } },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireTeacherSession();
    const { id } = await params;

    const existing = await prisma.class.findFirst({
      where: { id, schoolId: session.schoolId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Kelas tidak ditemukan." } },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { name, grade, academicYear } = body as {
      name?: string;
      grade?: string;
      academicYear?: number;
    };

    const updated = await prisma.class.update({
      where: { id },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(grade ? { grade: grade.trim() } : {}),
        ...(academicYear ? { academicYear: Number(academicYear) } : {}),
      },
      include: { _count: { select: { students: true } } },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[PUT /api/classes/:id]", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server." } },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireTeacherSession();
    const { id } = await params;

    const existing = await prisma.class.findFirst({
      where: { id, schoolId: session.schoolId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Kelas tidak ditemukan." } },
        { status: 404 }
      );
    }

    // Check for enrolled students before attempting delete
    const studentCount = await prisma.student.count({ where: { classId: id } });
    if (studentCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "CONSTRAINT_ERROR",
            message: `Tidak bisa menghapus kelas. Masih ada ${studentCount} siswa terdaftar.`,
          },
        },
        { status: 409 }
      );
    }

    await prisma.class.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { id } });
  } catch (err) {
    if (err instanceof NextResponse) return err;

    // Safety-net: catch Prisma P2003 FK constraint in case studentCount check was bypassed
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2003"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "CONSTRAINT_ERROR",
            message: "Tidak bisa menghapus kelas karena masih ada data terkait.",
          },
        },
        { status: 409 }
      );
    }

    console.error("[DELETE /api/classes/:id]", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server." } },
      { status: 500 }
    );
  }
}
