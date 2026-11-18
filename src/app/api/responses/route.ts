/**
 * Response Submission API
 *
 * POST /api/responses
 *   - Requires valid student session
 *   - Server-side validation:
 *     (a) item_id matches the ItemVariant assigned to this student for this session
 *     (b) session is ACTIVE
 *     (c) no duplicate response for same (session, student, item)
 *   - Calculates integrityIndex using DiagnosticEngine
 *   - Saves Response to DB
 *
 * Returns:
 *   201 { success: true, data: { responseId } }
 *   409 on duplicate
 *   422 on validation error
 *
 * Auth: STUDENT_PIN
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireStudentSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import {
  calculateIntegrityIndex,
  classifyPerItem,
} from '@/lib/diagnostic/engine';
import { sseManager } from '@/lib/sse/manager';
import { buildHeatmapState } from '@/lib/sse/heatmap-builder';
import { enqueueRunDiagnosis } from '@/workers/run-diagnosis';

// ─── Request body type ────────────────────────────────────────────────────────

interface SubmitResponseBody {
  sessionId: string;
  itemVariantId: string;
  chosenOptionKey: string;
  criValue: number;          // 0–5 integer
  responseTimeMs: number;    // time taken in milliseconds
}

// ─── Deterministic hash (same as quiz route) ──────────────────────────────────

function deterministicHash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash >>> 0;
}

// ─── Prisma PerItemStatus mapping ─────────────────────────────────────────────

type PrismaPerItemStatus =
  | 'PAHAM_KONSEP'
  | 'LUCKY_GUESS'
  | 'MISKONSEPSI'
  | 'TIDAK_PAHAM'
  | 'INVALID';

function toPrismaPerItemStatus(status: string): PrismaPerItemStatus {
  const valid: PrismaPerItemStatus[] = [
    'PAHAM_KONSEP',
    'LUCKY_GUESS',
    'MISKONSEPSI',
    'TIDAK_PAHAM',
    'INVALID',
  ];
  if (valid.includes(status as PrismaPerItemStatus)) {
    return status as PrismaPerItemStatus;
  }
  return 'INVALID';
}

// ─── POST /api/responses ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let studentSession;
  try {
    studentSession = await requireStudentSession();
  } catch (err) {
    if (err instanceof NextResponse) return err;
    throw err;
  }

  let body: SubmitResponseBody;
  try {
    body = (await request.json()) as SubmitResponseBody;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Request body tidak valid JSON.' },
      },
      { status: 422 }
    );
  }

  // ── Input validation ────────────────────────────────────────────────────────
  const { sessionId, itemVariantId, chosenOptionKey, criValue, responseTimeMs } = body;

  if (!sessionId || !itemVariantId || !chosenOptionKey) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'sessionId, itemVariantId, dan chosenOptionKey diperlukan.',
        },
      },
      { status: 422 }
    );
  }

  if (
    typeof criValue !== 'number' ||
    !Number.isInteger(criValue) ||
    criValue < 0 ||
    criValue > 5
  ) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'criValue harus integer antara 0 dan 5.',
        },
      },
      { status: 422 }
    );
  }

  if (typeof responseTimeMs !== 'number' || responseTimeMs < 0) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'responseTimeMs harus angka non-negatif.',
        },
      },
      { status: 422 }
    );
  }

  // Verify the student is joined to this session
  if (studentSession.sessionPinId !== sessionId) {
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

  // ── Load session and validate ACTIVE state ──────────────────────────────────
  const sessionPin = await prisma.sessionPin.findFirst({
    where: { id: sessionId, schoolId: studentSession.schoolId },
    select: {
      id: true, state: true, testId: true,
      startedAt: true,                          // ← for Bug #2 (task 4.1)
      test: {
        select: {
          classId: true,                        // ← for Bug #1 (task 3.3)
          durationSeconds: true,                // ← for Bug #2 (task 4.1)
        }
      }
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
            sessionPin.state === 'CLOSED'
              ? 'Sesi sudah ditutup. Respons tidak dapat diterima.'
              : 'Sesi belum dimulai.',
        },
      },
      { status: 409 }
    );
  }

  // ── Deadline check: reject submissions after session deadline (Bug #2) ──────
  if (sessionPin.startedAt) {
    const deadlineMs = sessionPin.startedAt.getTime() + sessionPin.test.durationSeconds * 1000;
    if (Date.now() > deadlineMs) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SESSION_EXPIRED',
            message: 'Waktu sesi telah habis.',
          },
        },
        { status: 409 }
      );
    }
  }

  // ── Cross-check: student's class must match the session's class (Bug #1 defense-in-depth) ──
  const student = await prisma.student.findUnique({
    where: { id: studentSession.studentId },
    select: { classId: true },
  });

  if (!student || student.classId !== sessionPin.test.classId) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Anda tidak terdaftar di kelas sesi ini.',
        },
      },
      { status: 403 }
    );
  }

  // ── Validate item assignment: item must belong to a question in this test ───
  const itemVariant = await prisma.itemVariant.findFirst({
    where: {
      id: itemVariantId,
      question: { testId: sessionPin.testId },
    },
    select: {
      id: true,
      correctOptionKey: true,
      tauMinSeconds: true,
      renderedOptions: true,
      question: {
        select: {
          id: true,
          variants: {
            select: { id: true },
          },
        },
      },
    },
  });

  if (!itemVariant) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'ItemVariant tidak valid untuk sesi ini.',
        },
      },
      { status: 422 }
    );
  }

  // Verify deterministic assignment: the submitted itemVariantId must be the
  // one deterministically assigned to this student for this question.
  const questionVariants = itemVariant.question.variants;
  const pickSeed = deterministicHash(
    `${studentSession.studentId}:${itemVariant.question.id}:pick`
  );
  const expectedVariantIndex = pickSeed % questionVariants.length;
  const expectedVariantId = questionVariants[expectedVariantIndex].id;

  if (itemVariantId !== expectedVariantId) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'ItemVariant yang dikirim tidak sesuai dengan yang ditugaskan untuk siswa ini.',
        },
      },
      { status: 422 }
    );
  }

  // ── Check for duplicate submission ─────────────────────────────────────────
  const duplicate = await prisma.response.findFirst({
    where: {
      sessionPinId: sessionId,
      studentId: studentSession.studentId,
      itemVariantId,
    },
    select: { id: true },
  });

  if (duplicate) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'DUPLICATE_RESPONSE',
          message: 'Anda sudah mengirim respons untuk butir soal ini.',
        },
      },
      { status: 409 }
    );
  }

  // ── Calculate integrity index ───────────────────────────────────────────────
  const isCorrect = chosenOptionKey === itemVariant.correctOptionKey;
  const tauMinMs = itemVariant.tauMinSeconds * 1000;

  const diagnosisInput = {
    itemId: itemVariantId,
    isCorrect,
    criValue,
    responseTimeMs,
    tauMinMs,
  };

  const diagnosisResult = classifyPerItem(diagnosisInput);
  const integrityIndex = calculateIntegrityIndex(diagnosisInput);

  // ── Save response to DB ─────────────────────────────────────────────────────
  const savedResponse = await prisma.response.create({
    data: {
      sessionPinId: sessionId,
      studentId: studentSession.studentId,
      itemVariantId,
      schoolId: studentSession.schoolId,
      chosenOptionKey,
      criValue,
      responseTimeMs,
      integrityIndex,
      isBelowThreshold: diagnosisResult.isBelowThreshold,
      perItemStatus: toPrismaPerItemStatus(diagnosisResult.status),
    },
    select: { id: true },
  });

  // ── Fire-and-forget SSE broadcast (Bug #4 fix) ──────────────────────────────
  // Broadcasts updated heatmap state to all connected teacher SSE clients.
  // Must NOT block the 201 response — do not await.
  buildHeatmapState(sessionId, studentSession.schoolId)
    .then((entries) => sseManager.broadcast(sessionId, entries))
    .catch((err) => console.error('[responses] SSE broadcast failed:', err));

  // ── Fire-and-forget completion check + enqueue diagnosis (Bug #3 fix) ───────
  // Check if student has answered all questions; if so, trigger auto-diagnosis.
  // Must NOT block the 201 response — do not await.
  prisma.response.count({
    where: { sessionPinId: sessionId, studentId: studentSession.studentId },
  }).then(async (studentResponseCount) => {
    const totalQuestions = await prisma.question.count({ where: { testId: sessionPin.testId } });
    if (studentResponseCount >= totalQuestions) {
      await enqueueRunDiagnosis(sessionId);
    }
  }).catch((err) => console.error('[responses] Diagnosis enqueue failed:', err));

  return NextResponse.json(
    {
      success: true,
      data: { responseId: savedResponse.id },
    },
    { status: 201 }
  );
}
