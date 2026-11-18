/**
 * PUT /api/variants/:id/calibration — update CalibrationStatus on an ItemVariant
 *
 * Body: { status: 'EXPERT_ESTIMATED' | 'CALIBRATING' | 'VALIDATED', notes?: string }
 *
 * Requirements: 10.7
 */

import { NextRequest, NextResponse } from "next/server";
import { requireTeacherSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const VALID_STATUSES = ["EXPERT_ESTIMATED", "CALIBRATING", "VALIDATED"] as const;
type ValidStatus = (typeof VALID_STATUSES)[number];

function isValidStatus(v: unknown): v is ValidStatus {
  return typeof v === "string" && (VALID_STATUSES as readonly string[]).includes(v);
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireTeacherSession();
    const { id } = await params;

    // Verify variant belongs to a question in teacher's school
    const variant = await prisma.itemVariant.findFirst({
      where: { id },
      include: {
        question: {
          select: { schoolId: true, testId: true },
        },
      },
    });

    if (!variant) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Variant tidak ditemukan." } },
        { status: 404 }
      );
    }

    // Tenant isolation: verify variant's question belongs to teacher's school
    if (variant.question.schoolId !== session.schoolId) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Akses ditolak." } },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { status, notes } = body as { status?: unknown; notes?: string };

    if (!isValidStatus(status)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: `Status tidak valid. Gunakan: ${VALID_STATUSES.join(", ")}`,
          },
        },
        { status: 422 }
      );
    }

    const updated = await prisma.itemVariant.update({
      where: { id },
      data: { calibrationStatus: status },
    });

    // Audit log
    console.info(
      `[CALIBRATION AUDIT] variant=${id} status=${status} teacher=${session.userId} school=${session.schoolId}${notes ? ` notes="${notes}"` : ""}`
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[PUT /api/variants/:id/calibration]", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server." } },
      { status: 500 }
    );
  }
}
