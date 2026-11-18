/**
 * GET  /api/tests/:testId/questions — list questions for a test
 * POST /api/tests/:testId/questions — create a question + generate variants
 *
 * Requirements: 10.1, 10.2, 10.6
 */

import { NextRequest, NextResponse } from "next/server";
import { requireTeacherSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { parseTemplate } from "@/lib/template/parser";
import {
  generateVariants,
  generateStaticVariant,
  saveVariantsToDatabase,
  type StaticTextOption,
} from "@/lib/template/variant-generator";

interface RouteParams {
  params: Promise<{ testId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireTeacherSession();
    const { testId } = await params;

    // Verify test belongs to teacher's school
    const test = await prisma.test.findFirst({
      where: { id: testId, schoolId: session.schoolId },
    });

    if (!test) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Test tidak ditemukan." } },
        { status: 404 }
      );
    }

    const questions = await prisma.question.findMany({
      where: { testId, schoolId: session.schoolId },
      include: {
        _count: { select: { variants: true } },
      },
      orderBy: { itemOrder: "asc" },
    });

    return NextResponse.json({ success: true, data: questions });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/tests/:testId/questions]", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server." } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireTeacherSession();
    const { testId } = await params;

    // Verify test belongs to teacher's school
    const test = await prisma.test.findFirst({
      where: { id: testId, schoolId: session.schoolId },
    });

    if (!test) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Test tidak ditemukan." } },
        { status: 404 }
      );
    }

    const body = await request.json();
    const {
      templateText,
      questionType,
      textOptions,
    } = body as {
      templateText?: string;
      questionType?: "numeric" | "text";
      textOptions?: StaticTextOption[];
    };

    if (!templateText || !templateText.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Field 'templateText' wajib diisi." },
        },
        { status: 422 }
      );
    }

    // ── TEXT question type: skip parse + generateVariants, use static variant ──
    if (questionType === "text") {
      if (!Array.isArray(textOptions) || textOptions.length !== 4) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Field 'textOptions' wajib berisi tepat 4 opsi untuk soal tipe teks.",
            },
          },
          { status: 422 }
        );
      }

      const hasCorrect = textOptions.some((o) => o.isCorrect);
      if (!hasCorrect) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Satu opsi harus ditandai sebagai jawaban benar.",
            },
          },
          { status: 422 }
        );
      }

      const existingCountText = await prisma.question.count({
        where: { testId, schoolId: session.schoolId },
      });

      const questionText = await prisma.question.create({
        data: {
          testId,
          schoolId: session.schoolId,
          templateText: templateText.trim(),
          templateAst: {} as import("@prisma/client").Prisma.InputJsonValue,
          variableDefinitions: [] as unknown as import("@prisma/client").Prisma.InputJsonValue,
          constraints: [] as unknown as import("@prisma/client").Prisma.InputJsonValue,
          itemOrder: existingCountText + 1,
        },
      });

      const staticVariant = generateStaticVariant(textOptions, templateText.trim());
      const variantIdsText = await saveVariantsToDatabase(
        questionText.id,
        session.schoolId,
        [staticVariant]
      );

      const variantsText = await prisma.itemVariant.findMany({
        where: { questionId: questionText.id },
        orderBy: { createdAt: "asc" },
      });

      return NextResponse.json(
        {
          success: true,
          data: {
            question: questionText,
            variants: variantsText,
            variantCount: variantIdsText.length,
            generationError: null,
          },
        },
        { status: 201 }
      );
    }

    // ── NUMERIC (default) path ─────────────────────────────────────────────────
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

    // 2. Determine item order (next available)
    const existingCount = await prisma.question.count({
      where: { testId, schoolId: session.schoolId },
    });

    // 3. Create Question record
    const question = await prisma.question.create({
      data: {
        testId,
        schoolId: session.schoolId,
        templateText: templateText.trim(),
        templateAst: ast as unknown as import("@prisma/client").Prisma.InputJsonValue,
        variableDefinitions: ast.variables as unknown as import("@prisma/client").Prisma.InputJsonValue,
        constraints: ast.constraints as unknown as import("@prisma/client").Prisma.InputJsonValue,
        itemOrder: existingCount + 1,
      },
    });

    // 4. Generate variants
    let variantIds: string[] = [];
    let variants: Awaited<ReturnType<typeof prisma.itemVariant.findMany>> = [];
    let generationError: string | null = null;

    try {
      const generated = generateVariants(ast, 5, 10);
      variantIds = await saveVariantsToDatabase(question.id, session.schoolId, generated);

      variants = await prisma.itemVariant.findMany({
        where: { questionId: question.id },
        orderBy: { createdAt: "asc" },
      });
    } catch (genErr) {
      generationError =
        genErr instanceof Error
          ? genErr.message
          : "Gagal generate variant. Periksa constraints template.";
      console.error("[POST /api/tests/:testId/questions] variant generation error:", genErr);
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          question,
          variants,
          variantCount: variantIds.length,
          generationError,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[POST /api/tests/:testId/questions]", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server." } },
      { status: 500 }
    );
  }
}
