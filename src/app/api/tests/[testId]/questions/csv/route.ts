/**
 * POST /api/tests/:testId/questions/csv — Import questions from a CSV file
 *
 * Accepts multipart/form-data with a `file` field (CSV).
 * Required columns: nomor, teks_soal, tipe_jawaban, opsi_a, opsi_b, opsi_c, opsi_d, jawaban_benar
 *
 * For tipe_jawaban === "teks": uses generateStaticVariant() (Bug 1 fix)
 * For tipe_jawaban === "numerik": uses parseTemplate() + generateVariants()
 *
 * Requirements: 2.10, 2.11, 2.12, 2.13
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

// ─── Required CSV columns ─────────────────────────────────────────────────────

const REQUIRED_COLUMNS = [
  "nomor",
  "teks_soal",
  "tipe_jawaban",
  "opsi_a",
  "opsi_b",
  "opsi_c",
  "opsi_d",
  "jawaban_benar",
] as const;

type RequiredColumn = (typeof REQUIRED_COLUMNS)[number];

// ─── CSV Parser ───────────────────────────────────────────────────────────────

/**
 * Parse a single CSV line, handling quoted fields.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped double-quote inside quotes
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }

  fields.push(current.trim());
  return fields;
}

interface CsvRow {
  rowIndex: number; // 1-based, excluding header
  nomor: string;
  teks_soal: string;
  tipe_jawaban: string;
  opsi_a: string;
  opsi_b: string;
  opsi_c: string;
  opsi_d: string;
  jawaban_benar: string;
}

interface ParsedCsvResult {
  rows: CsvRow[];
  headerError?: string;
}

function parseCsv(text: string): ParsedCsvResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { rows: [], headerError: "File CSV kosong." };
  }

  const headerLine = lines[0];
  const headers = parseCsvLine(headerLine.toLowerCase());

  // Validate all required columns are present
  const missingColumns = REQUIRED_COLUMNS.filter((col) => !headers.includes(col));
  if (missingColumns.length > 0) {
    return {
      rows: [],
      headerError: `Kolom wajib tidak ditemukan: ${missingColumns.join(", ")}`,
    };
  }

  // Build column index map
  const colIndex: Record<RequiredColumn, number> = {} as Record<RequiredColumn, number>;
  for (const col of REQUIRED_COLUMNS) {
    colIndex[col] = headers.indexOf(col);
  }

  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    rows.push({
      rowIndex: i,
      nomor: fields[colIndex.nomor] ?? "",
      teks_soal: fields[colIndex.teks_soal] ?? "",
      tipe_jawaban: (fields[colIndex.tipe_jawaban] ?? "").toLowerCase(),
      opsi_a: fields[colIndex.opsi_a] ?? "",
      opsi_b: fields[colIndex.opsi_b] ?? "",
      opsi_c: fields[colIndex.opsi_c] ?? "",
      opsi_d: fields[colIndex.opsi_d] ?? "",
      jawaban_benar: (fields[colIndex.jawaban_benar] ?? "").toUpperCase(),
    });
  }

  return { rows };
}

// ─── Row Validation ───────────────────────────────────────────────────────────

interface RowValidationResult {
  valid: boolean;
  error?: string;
}

function validateRow(row: CsvRow): RowValidationResult {
  if (!row.teks_soal.trim()) {
    return { valid: false, error: "teks_soal kosong" };
  }

  if (row.tipe_jawaban !== "teks" && row.tipe_jawaban !== "numerik") {
    return {
      valid: false,
      error: `tipe_jawaban tidak valid: "${row.tipe_jawaban}" (harus "teks" atau "numerik")`,
    };
  }

  if (row.tipe_jawaban === "teks") {
    // All four options must be filled, and jawaban_benar must be A/B/C/D
    if (!row.opsi_a.trim() || !row.opsi_b.trim() || !row.opsi_c.trim() || !row.opsi_d.trim()) {
      return { valid: false, error: "Soal tipe teks membutuhkan opsi_a, opsi_b, opsi_c, opsi_d diisi" };
    }
    if (!["A", "B", "C", "D"].includes(row.jawaban_benar)) {
      return { valid: false, error: `jawaban_benar harus A, B, C, atau D (diterima: "${row.jawaban_benar}")` };
    }
  }

  // For "numerik" type, opsi_a–d and jawaban_benar may be empty (auto-generated)
  return { valid: true };
}

// ─── POST Handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireTeacherSession();
    const { testId } = await params;

    // Verify the test belongs to this teacher's school
    const test = await prisma.test.findFirst({
      where: { id: testId, schoolId: session.schoolId },
    });

    if (!test) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Test tidak ditemukan." } },
        { status: 404 }
      );
    }

    // Parse multipart/form-data
    let fileText: string;
    try {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION_ERROR", message: "Field 'file' wajib ada." } },
          { status: 422 }
        );
      }

      if (!file.name.endsWith(".csv") && file.type !== "text/csv" && file.type !== "application/vnd.ms-excel") {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION_ERROR", message: "File harus berformat CSV." } },
          { status: 422 }
        );
      }

      fileText = await file.text();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Gagal membaca file upload." } },
        { status: 422 }
      );
    }

    // Parse CSV
    const { rows, headerError } = parseCsv(fileText);

    if (headerError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: headerError } },
        { status: 422 }
      );
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Tidak ada baris data di CSV." } },
        { status: 422 }
      );
    }

    // Process each row: validate, then create Question + ItemVariant
    const errors: { row: number; message: string }[] = [];
    let created = 0;

    // Get current question count for item ordering
    let currentOrder = await prisma.question.count({
      where: { testId, schoolId: session.schoolId },
    });

    for (const row of rows) {
      const validation = validateRow(row);
      if (!validation.valid) {
        errors.push({ row: row.rowIndex, message: validation.error! });
        continue;
      }

      try {
        if (row.tipe_jawaban === "teks") {
          // ── Text question type ──
          const textOptions: StaticTextOption[] = [
            { key: "A", text: row.opsi_a, isCorrect: row.jawaban_benar === "A" },
            { key: "B", text: row.opsi_b, isCorrect: row.jawaban_benar === "B" },
            { key: "C", text: row.opsi_c, isCorrect: row.jawaban_benar === "C" },
            { key: "D", text: row.opsi_d, isCorrect: row.jawaban_benar === "D" },
          ];

          const question = await prisma.question.create({
            data: {
              testId,
              schoolId: session.schoolId,
              templateText: row.teks_soal.trim(),
              templateAst: {} as import("@prisma/client").Prisma.InputJsonValue,
              variableDefinitions: [] as unknown as import("@prisma/client").Prisma.InputJsonValue,
              constraints: [] as unknown as import("@prisma/client").Prisma.InputJsonValue,
              itemOrder: ++currentOrder,
            },
          });

          const staticVariant = generateStaticVariant(textOptions, row.teks_soal.trim());
          await saveVariantsToDatabase(question.id, session.schoolId, [staticVariant]);

          created++;
        } else {
          // ── Numeric question type ──
          const parseResult = parseTemplate(row.teks_soal.trim());
          if (!parseResult.ok) {
            errors.push({
              row: row.rowIndex,
              message: `Parse template gagal: ${parseResult.error.message}`,
            });
            continue;
          }

          const ast = parseResult.value;

          const question = await prisma.question.create({
            data: {
              testId,
              schoolId: session.schoolId,
              templateText: row.teks_soal.trim(),
              templateAst: ast as unknown as import("@prisma/client").Prisma.InputJsonValue,
              variableDefinitions: ast.variables as unknown as import("@prisma/client").Prisma.InputJsonValue,
              constraints: ast.constraints as unknown as import("@prisma/client").Prisma.InputJsonValue,
              itemOrder: ++currentOrder,
            },
          });

          try {
            const generated = generateVariants(ast, 5, 10);
            await saveVariantsToDatabase(question.id, session.schoolId, generated);
          } catch (genErr) {
            // Log but don't fail the whole row — question was created
            console.warn(`[CSV Import] Row ${row.rowIndex}: variant generation error:`, genErr);
          }

          created++;
        }
      } catch (rowErr) {
        console.error(`[CSV Import] Row ${row.rowIndex} error:`, rowErr);
        errors.push({
          row: row.rowIndex,
          message: "Terjadi kesalahan saat menyimpan soal ini.",
        });
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: { created, errors },
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[POST /api/tests/:testId/questions/csv]", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server." } },
      { status: 500 }
    );
  }
}
