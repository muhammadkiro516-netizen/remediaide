/**
 * Quiz API — Student access
 *
 * GET /api/sessions/:id/quiz
 *   - Requires valid student session (authenticated via PIN)
 *   - Session must be ACTIVE
 *   - Returns one ItemVariant per question, assigned deterministically to this student
 *   - correctOptionKey is NEVER included in the response
 *   - Option order is shuffled deterministically per (studentId, questionId)
 *
 * Auth: STUDENT_PIN
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireStudentSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';

interface RouteContext {
  params: { id: string };
}

// ─── Deterministic hash ───────────────────────────────────────────────────────

/**
 * Simple, fast, deterministic integer hash of a string.
 * Used to pick the variant index and shuffle order per student.
 * Returns a non-negative 32-bit integer.
 */
function deterministicHash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0; // keep 32-bit unsigned
  }
  return hash >>> 0;
}

/**
 * Deterministically shuffle an array using a seeded hash value.
 * Uses Fisher-Yates with a simple LCG seeded by `seed`.
 */
function deterministicShuffle<T>(arr: T[], seed: number): T[] {
  const copy = [...arr];
  let s = seed >>> 0;
  for (let i = copy.length - 1; i > 0; i--) {
    // LCG step
    s = Math.imul(s, 1664525) + 1013904223;
    const j = (s >>> 0) % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ─── GET /api/sessions/:id/quiz ───────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  let studentSession;
  try {
    studentSession = await requireStudentSession();
  } catch (err) {
    if (err instanceof NextResponse) return err;
    throw err;
  }

  const { id } = context.params;

  // Verify the student is joined to this specific session
  if (studentSession.sessionPinId !== id) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Anda tidak terdaftar di sesi ini.',
        },
      },
      { status: 403 }
    );
  }

  // Load session and verify ACTIVE state
  const sessionPin = await prisma.sessionPin.findFirst({
    where: { id, schoolId: studentSession.schoolId },
    select: {
      id: true,
      state: true,
      startedAt: true,
      test: {
        select: {
          id: true,
          topic: true,
          durationSeconds: true,
          questions: {
            orderBy: { itemOrder: 'asc' },
            select: {
              id: true,
              templateText: true,
              itemOrder: true,
              requireExplanation: true,
              mapQuestionId: true,
              variants: {
                select: {
                  id: true,
                  renderedText: true,
                  renderedOptions: true,
                  tauMinSeconds: true,
                  // correctOptionKey is deliberately excluded from select
                  variableValues: true,
                  calibrationStatus: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!sessionPin) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Sesi tidak ditemukan.' },
      },
      { status: 404 }
    );
  }

  if (sessionPin.state !== 'ACTIVE') {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SESSION_CLOSED',
          message:
            sessionPin.state === 'LOCKED'
              ? 'Sesi belum dimulai. Tunggu instruksi guru.'
              : 'Sesi sudah ditutup.',
        },
      },
      { status: 409 }
    );
  }

  const { studentId } = studentSession;
  const questions = sessionPin.test.questions;

  // Build per-question quiz items
  const quizItems = questions.map((question) => {
    const variants = question.variants;

    if (variants.length === 0) {
      // No variants available — return a placeholder
      return {
        questionId: question.id,
        itemOrder: question.itemOrder,
        variantId: null,
        renderedText: question.templateText,
        options: [],
        tauMinSeconds: 1,
        requireExplanation: question.requireExplanation,
        mapQuestionId: question.mapQuestionId ?? null,
      };
    }

    // Pick variant deterministically: hash(studentId + questionId) % variantCount
    const pickSeed = deterministicHash(`${studentId}:${question.id}:pick`);
    const variantIndex = pickSeed % variants.length;
    const chosenVariant = variants[variantIndex];

    // Shuffle options deterministically for this student + question
    const optionShuffleSeed = deterministicHash(
      `${studentId}:${question.id}:shuffle`
    );

    // renderedOptions is stored as JSON in two possible formats:
    //
    // Format A (legacy numeric / seed data):
    //   { A: "2 m/s²", B: "5 m/s²", C: "8 m/s²", D: "20 m/s²" }
    //
    // Format B (new text-type variants from generateStaticVariant / generateVariants):
    //   [{ key: "A", text: "...", isCorrect: true }, ...]
    //
    // Normalise both to [{ key, text }] before shuffling.
    const rawOptions = chosenVariant.renderedOptions;
    let optionEntries: [string, string][];

    if (Array.isArray(rawOptions)) {
      // Format B — array of { key, text, isCorrect? }
      optionEntries = (rawOptions as Array<{ key: string; text: string }>).map(
        (opt) => [opt.key, opt.text]
      );
    } else {
      // Format A — plain object { A: "...", B: "...", ... }
      optionEntries = Object.entries(rawOptions as Record<string, string>);
    }

    const shuffledEntries = deterministicShuffle(optionEntries, optionShuffleSeed);

    const options = shuffledEntries.map(([key, text]) => ({ key, text }));

    return {
      questionId: question.id,
      itemOrder: question.itemOrder,
      variantId: chosenVariant.id,
      // Fallback: text-type questions created before the Bug 2 fix have renderedText = ''
      // in the database. Use the parent question's templateText in that case so the
      // question body always displays correctly for the student.
      renderedText: chosenVariant.renderedText || question.templateText,
      options,
      tauMinSeconds: chosenVariant.tauMinSeconds,
      calibrationStatus: chosenVariant.calibrationStatus,
      requireExplanation: question.requireExplanation,
      mapQuestionId: question.mapQuestionId ?? null,
    };
  });

  return NextResponse.json({
    success: true,
    data: {
      sessionId: id,
      topic: sessionPin.test.topic,
      durationSeconds: sessionPin.test.durationSeconds,
      startedAt: sessionPin.startedAt?.toISOString() ?? null,
      items: quizItems,
    },
  });
}
