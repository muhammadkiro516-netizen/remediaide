/**
 * POST /api/classes/:id/students/bulk — batch import students from CSV
 *
 * Body: { students: { anonymousLabel: string }[] }
 *
 * Requirements: 10.5
 */

import { NextRequest, NextResponse } from "next/server";
import { requireTeacherSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

interface RouteParams {
  params: Promise<{ id: string }>;
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
    const { students } = body as { students?: { anonymousLabel: string }[] };

    if (!Array.isArray(students) || students.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Field 'students' wajib berupa array non-kosong." },
        },
        { status: 422 }
      );
    }

    // Normalize and validate labels
    const labels = students
      .map((s) => s.anonymousLabel?.trim())
      .filter((l): l is string => Boolean(l));

    if (labels.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Tidak ada label valid yang ditemukan." },
        },
        { status: 422 }
      );
    }

    // Check for duplicates within the batch itself
    const uniqueLabels = Array.from(new Set(labels));

    // Check for existing labels in the entire school (anonymousLabel is globally unique)
    const existingStudents = await prisma.student.findMany({
      where: { anonymousLabel: { in: uniqueLabels } },
      select: { anonymousLabel: true },
    });

    const existingLabels = new Set(existingStudents.map((s) => s.anonymousLabel));
    const newLabels = uniqueLabels.filter((l) => !existingLabels.has(l));
    const skippedLabels = uniqueLabels.filter((l) => existingLabels.has(l));

    // Create all new students in a transaction
    const created = await prisma.$transaction(
      newLabels.map((label) =>
        prisma.student.create({
          data: {
            classId: id,
            schoolId: session.schoolId,
            anonymousLabel: label,
          },
        })
      )
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          created: created.length,
          skipped: skippedLabels.length,
          skippedLabels,
          students: created,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[POST /api/classes/:id/students/bulk]", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server." } },
      { status: 500 }
    );
  }
}
