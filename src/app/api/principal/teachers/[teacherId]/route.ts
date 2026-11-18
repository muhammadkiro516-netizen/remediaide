/**
 * DELETE /api/principal/teachers/[teacherId] — remove a teacher from the school
 * PATCH  /api/principal/teachers/[teacherId] — update teacher name (no email/role change)
 *
 * Requires role: PRINCIPAL
 * Guard: the target teacher must belong to session.schoolId (tenant isolation).
 * Guard: cannot delete yourself (the principal).
 * Guard: cannot delete/edit another PRINCIPAL or SUPERADMIN.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { teacherId: string } }
) {
  try {
    const session = await requireRole("PRINCIPAL");
    const { teacherId } = params;

    // Cannot delete yourself
    if (teacherId === session.userId) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Tidak dapat menghapus akun Anda sendiri." } },
        { status: 403 }
      );
    }

    // Verify target belongs to same school and is a plain TEACHER
    const target = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { id: true, schoolId: true, role: true, _count: { select: { classes: true, tests: true } } },
    });

    if (!target || target.schoolId !== session.schoolId) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Guru tidak ditemukan." } },
        { status: 404 }
      );
    }

    if (target.role !== "TEACHER") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Hanya akun TEACHER yang dapat dihapus melalui portal ini." } },
        { status: 403 }
      );
    }

    // Soft safety: warn if teacher has active data
    if (target._count.classes > 0 || target._count.tests > 0) {
      // We still allow deletion — cascade is handled by DB or caller must confirm
      // The frontend confirmation modal handles this UX
    }

    await prisma.teacher.delete({ where: { id: teacherId } });

    return NextResponse.json({ success: true, data: { deleted: teacherId } });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[DELETE /api/principal/teachers/[teacherId]]", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server." } },
      { status: 500 }
    );
  }
}

// ─── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: { teacherId: string } }
) {
  try {
    const session = await requireRole("PRINCIPAL");
    const { teacherId } = params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Request body harus berformat JSON." } },
        { status: 400 }
      );
    }

    const { name } = body as Record<string, unknown>;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Nama guru wajib diisi." } },
        { status: 400 }
      );
    }

    // Verify ownership and role
    const target = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { id: true, schoolId: true, role: true },
    });

    if (!target || target.schoolId !== session.schoolId) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Guru tidak ditemukan." } },
        { status: 404 }
      );
    }

    if (target.role !== "TEACHER") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Hanya akun TEACHER yang dapat diedit melalui portal ini." } },
        { status: 403 }
      );
    }

    const updated = await prisma.teacher.update({
      where: { id: teacherId },
      data: { name: name.trim() },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        _count: { select: { classes: true, tests: true } },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[PATCH /api/principal/teachers/[teacherId]]", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server." } },
      { status: 500 }
    );
  }
}
