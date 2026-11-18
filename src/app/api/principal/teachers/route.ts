/**
 * GET  /api/principal/teachers  — list all teachers in the principal's school
 * POST /api/principal/teachers  — add a new teacher account
 *
 * Requires role: PRINCIPAL
 * Tenant-isolated: only teachers belonging to session.schoolId are returned/created.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import bcrypt from "bcryptjs";

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const session = await requireRole("PRINCIPAL");

    const teachers = await prisma.teacher.findMany({
      where: {
        schoolId: session.schoolId,
        // Don't list the principal themselves as a "teacher" to manage
        role: "TEACHER",
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        _count: {
          select: { classes: true, tests: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: teachers });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/principal/teachers]", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server." } },
      { status: 500 }
    );
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("PRINCIPAL");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Request body harus berformat JSON." } },
        { status: 400 }
      );
    }

    const { name, email, password } = body as Record<string, unknown>;

    // Validation
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Nama guru wajib diisi." } },
        { status: 400 }
      );
    }
    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Email wajib diisi." } },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Format email tidak valid." } },
        { status: 400 }
      );
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Password wajib diisi dan minimal 8 karakter." } },
        { status: 400 }
      );
    }

    // Check email uniqueness
    const existing = await prisma.teacher.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: "EMAIL_EXISTS", message: "Email ini sudah terdaftar di sistem." } },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const teacher = await prisma.teacher.create({
      data: {
        schoolId: session.schoolId,
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        role: "TEACHER",
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        _count: { select: { classes: true, tests: true } },
      },
    });

    return NextResponse.json({ success: true, data: teacher }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[POST /api/principal/teachers]", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server." } },
      { status: 500 }
    );
  }
}
