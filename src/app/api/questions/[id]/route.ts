/**
 * PUT    /api/questions/:id — update question template
 * DELETE /api/questions/:id — delete question
 *
 * Requirements: 10.2, 10.7
 */

import { NextRequest, NextResponse } from "next/server";
import { requireTeacherSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { parseTemplate } from "@/lib/template/parser";
import { generateVariants, saveVariantsToDatabase } from "@/lib/template/variant-generator";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireTeacherSession();
    const { id } = await params;

    const question = await prisma.question.findFirst({
      where: { id, schoolId: session.schoolId },
    });

    if (!question) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Soal tidak ditemukan." } },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { templateText, regenerateVariants } = body as {
      templateText?: string;
      regenerateVariants?: boolean;
    };

    if (!templateText || !templateText.trim()) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Field 'templateText' wajib diisi." } },
        { status: 422 }
      );
    }

    // Parse updated template
    const parseResult = parseTemplate(templateText);
    if (!parseResult.ok) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: `Template parse error: ${parseResult.error.message}`,
            details: parseResult.error,
          },
        },
        { status: 422 }
      );
    }

    const ast = parseResult.value;

    const updated = await prisma.question.update({
      where: { id },
      data: {
        templateText: templateText.trim(),
        templateAst: ast as unknown as import("@prisma/client").Prisma.InputJsonValue,
        variableDefinitions: ast.variables as unknown as import("@prisma/client").Prisma.InputJsonValue,
        constraints: ast.constraints as unknown as import("@prisma/client").Prisma.InputJsonValue,
      },
    });

    let variants = null;
    let generationError: string | null = null;

    if (regenerateVariants) {
      // Delete old variants and generate new ones
      await prisma.itemVariant.deleteMany({ where: { questionId: id } });

      try {
        const generated = generateVariants(ast, 5, 10);
        await saveVariantsToDatabase(id, session.schoolId, generated);
        variants = await prisma.itemVariant.findMany({
          where: { questionId: id },
          orderBy: { createdAt: "asc" },
        });
      } catch (genErr) {
        generationError =
          genErr instanceof Error
            ? genErr.message
            : "Gagal generate variant.";
      }
    }

    return NextResponse.json({ success: true, data: { question: updated, variants, generationError } });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[PUT /api/questions/:id]", err);
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

    const question = await prisma.question.findFirst({
      where: { id, schoolId: session.schoolId },
    });

    if (!question) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Soal tidak ditemukan." } },
        { status: 404 }
      );
    }

    // Delete variants first (FK constraint), then the question
    await prisma.itemVariant.deleteMany({ where: { questionId: id } });
    await prisma.question.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { id } });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[DELETE /api/questions/:id]", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server." } },
      { status: 500 }
    );
  }
}

// ─── PATCH /api/questions/:id — RemediAide 2.0 ML settings ───────────────────
// Body: { requireExplanation?: boolean, mapQuestionId?: number | null }. Does not touch variants.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireTeacherSession();
    const { id } = await params;
    const question = await prisma.question.findFirst({ where: { id, schoolId: session.schoolId } });
    if (!question) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Soal tidak ditemukan." } },
        { status: 404 }
      );
    }
    const body = (await request.json().catch(() => null)) as
      | { requireExplanation?: unknown; mapQuestionId?: unknown }
      | null;
    const data: { requireExplanation?: boolean; mapQuestionId?: number | null } = {};
    if (body && "requireExplanation" in body) {
      if (typeof body.requireExplanation !== "boolean") {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION_ERROR", message: "requireExplanation harus boolean." } },
          { status: 422 }
        );
      }
      data.requireExplanation = body.requireExplanation;
    }
    if (body && "mapQuestionId" in body) {
      const v = body.mapQuestionId;
      if (v !== null && (typeof v !== "number" || !Number.isInteger(v) || v <= 0)) {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION_ERROR", message: "mapQuestionId harus bilangan bulat positif atau null." } },
          { status: 422 }
        );
      }
      data.mapQuestionId = v as number | null;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Tidak ada field yang diubah." } },
        { status: 422 }
      );
    }
    const updated = await prisma.question.update({ where: { id }, data });
    return NextResponse.json({
      success: true,
      data: { id: updated.id, requireExplanation: updated.requireExplanation, mapQuestionId: updated.mapQuestionId },
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[PATCH /api/questions/:id]", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Gagal memperbarui soal." } },
      { status: 500 }
    );
  }
}
