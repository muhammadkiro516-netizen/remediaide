/**
 * GET /api/questions/:id/variants — list all ItemVariants for a question
 *
 * Requirements: 10.6
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

    // Verify question belongs to teacher's school
    const question = await prisma.question.findFirst({
      where: { id, schoolId: session.schoolId },
    });

    if (!question) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Soal tidak ditemukan." } },
        { status: 404 }
      );
    }

    const variants = await prisma.itemVariant.findMany({
      where: { questionId: id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ success: true, data: variants });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/questions/:id/variants]", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server." } },
      { status: 500 }
    );
  }
}
