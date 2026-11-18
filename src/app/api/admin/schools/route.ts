/**
 * GET  /api/admin/schools  — list all school tenants
 * POST /api/admin/schools  — create new school + PRINCIPAL account
 *
 * Both routes require role=SUPERADMIN (enforced by middleware).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/client";

// ─── Guard helper ─────────────────────────────────────────────────────────────

async function requireSuperAdmin() {
  const session = await auth();
  if (!session || session.role !== "SUPERADMIN") {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "Akses ditolak." } },
      { status: 403 }
    );
  }
  return null; // no error
}

// ─── Subdomain slug ───────────────────────────────────────────────────────────

function toSubdomain(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 63);
}

// ─── GET /api/admin/schools ───────────────────────────────────────────────────

export async function GET() {
  const guard = await requireSuperAdmin();
  if (guard) return guard;

  const schools = await prisma.school.findMany({
    where: {
      // Exclude the internal anchor school from the tenant list
      NOT: { subdomain: "remediaide-internal" },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      subdomain: true,
      createdAt: true,
      _count: {
        select: { teachers: true, students: true, classes: true },
      },
    },
  });

  return NextResponse.json({ success: true, data: schools });
}

// ─── POST /api/admin/schools ──────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const guard = await requireSuperAdmin();
  if (guard) return guard;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Request body harus berformat JSON." } },
      { status: 400 }
    );
  }

  const { schoolName, principalName, principalEmail, principalPassword } =
    body as Record<string, unknown>;

  // Validation
  if (!schoolName || typeof schoolName !== "string" || !schoolName.trim()) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Nama sekolah wajib diisi." } },
      { status: 400 }
    );
  }
  if (!principalName || typeof principalName !== "string" || !principalName.trim()) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Nama Kepala Sekolah wajib diisi." } },
      { status: 400 }
    );
  }
  if (!principalEmail || typeof principalEmail !== "string") {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Email wajib diisi." } },
      { status: 400 }
    );
  }

  const normalizedEmail = (principalEmail as string).toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Format email tidak valid." } },
      { status: 400 }
    );
  }

  if (!principalPassword || typeof principalPassword !== "string" || (principalPassword as string).length < 8) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Password wajib diisi dan minimal 8 karakter." } },
      { status: 400 }
    );
  }

  // Uniqueness checks
  const [existingEmail, existingSubdomain] = await Promise.all([
    prisma.teacher.findUnique({ where: { email: normalizedEmail }, select: { id: true } }),
    prisma.school.findUnique({ where: { subdomain: toSubdomain((schoolName as string).trim()) }, select: { id: true } }),
  ]);

  if (existingEmail) {
    return NextResponse.json(
      { success: false, error: { code: "EMAIL_EXISTS", message: "Email ini sudah terdaftar di sistem." } },
      { status: 409 }
    );
  }

  let subdomain = toSubdomain((schoolName as string).trim());
  if (existingSubdomain) {
    subdomain = `${subdomain}-${Math.random().toString(36).slice(2, 6)}`;
  }
  if (!subdomain) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Nama sekolah menghasilkan subdomain tidak valid." } },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(principalPassword as string, 12);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const school = await tx.school.create({
        data: { name: (schoolName as string).trim(), subdomain },
      });
      const principal = await tx.teacher.create({
        data: {
          schoolId: school.id,
          email: normalizedEmail,
          name: (principalName as string).trim(),
          passwordHash,
          role: "PRINCIPAL",
        },
      });
      return { school, principal };
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          schoolId: result.school.id,
          schoolName: result.school.name,
          subdomain: result.school.subdomain,
          principalId: result.principal.id,
          principalEmail: result.principal.email,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[admin/schools POST] transaction error:", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server. Coba lagi." } },
      { status: 500 }
    );
  }
}
