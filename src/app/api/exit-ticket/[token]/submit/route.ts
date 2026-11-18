/**
 * POST /api/exit-ticket/[token]/submit
 *
 * Public endpoint — no authentication required.
 * Validates all inputs and uses a Prisma transaction to atomically:
 *   1. Verify the token is still UNUSED
 *   2. Create an ExitTicketSubmission record
 *   3. Mark the token as USED with a timestamp
 *
 * Response shapes:
 *  200 → { success: true }
 *  404 (empty) → token format is invalid (oracle-safe)
 *  409 → { error: 'TOKEN_ALREADY_USED' }
 *  422 → { error: 'VALIDATION_ERROR', field: 'reflectionText' | 'confidenceScore' }
 *  429 → { error: 'RATE_LIMIT_EXCEEDED' }
 *  500 → { error: 'INTERNAL_ERROR' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { isValidTokenFormat } from '@/lib/exit-ticket/token';
import { checkRateLimit } from '@/lib/exit-ticket/rate-limit';

// ─── Custom error class ───────────────────────────────────────────────────────

class AlreadyUsedError extends Error {
  constructor() {
    super('Token already used');
    this.name = 'AlreadyUsedError';
  }
}

// ─── 9.1 Named POST export; extract token from params ────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } },
): Promise<NextResponse> {
  // ── 9.8 Outer try/catch — catch any unexpected error ─────────────────────
  try {
    const { token } = params;

    // ── 9.2 Validate token format — 404 (no body) to avoid oracle leakage ──
    if (!isValidTokenFormat(token)) {
      return new NextResponse(null, { status: 404 });
    }

    // ── 9.3 Rate limiting ─────────────────────────────────────────────────
    const ip =
      request.headers.get('x-forwarded-for') ??
      request.headers.get('x-real-ip') ??
      'unknown';

    const rateLimitResult = checkRateLimit(ip);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'RATE_LIMIT_EXCEEDED' },
        { status: 429 },
      );
    }

    // ── 9.4 Parse and validate request body ──────────────────────────────
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', field: 'reflectionText' },
        { status: 422 },
      );
    }

    const raw = body as Record<string, unknown>;

    // Validate reflectionText
    if (
      typeof raw.reflectionText !== 'string' ||
      raw.reflectionText.trim().length < 1 ||
      raw.reflectionText.trim().length > 1000
    ) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', field: 'reflectionText' },
        { status: 422 },
      );
    }

    // Validate confidenceScore
    if (
      !Number.isInteger(raw.confidenceScore) ||
      (raw.confidenceScore as number) < 0 ||
      (raw.confidenceScore as number) > 5
    ) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', field: 'confidenceScore' },
        { status: 422 },
      );
    }

    const reflectionText = (raw.reflectionText as string).trim();
    const confidenceScore = raw.confidenceScore as number;

    // ── 9.5 Execute Prisma transaction ────────────────────────────────────
    await prisma.$transaction(async (tx) => {
      // Step 1: Find token and verify it is still UNUSED
      const record = await tx.exitTicketToken.findUnique({
        where: { token },
        select: { id: true, status: true, schoolId: true },
      });

      if (!record || record.status === 'USED') {
        throw new AlreadyUsedError();
      }

      // Step 2: Create the submission
      await tx.exitTicketSubmission.create({
        data: {
          reflectionText,
          confidenceScore,
          exitTicketTokenId: record.id,
          schoolId: record.schoolId,
        },
      });

      // Step 3: Mark the token as USED
      await tx.exitTicketToken.update({
        where: { id: record.id },
        data: { status: 'USED', usedAt: new Date() },
      });
    });

    // ── 9.7 Transaction succeeded → 200 { success: true } ────────────────
    // 9.9: Response body contains ONLY { success: true } — no IDs, no schoolId,
    // no anonymousLabel, no student data whatsoever.
    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    // ── 9.6 AlreadyUsedError → 409 TOKEN_ALREADY_USED ────────────────────
    if (error instanceof AlreadyUsedError) {
      return NextResponse.json(
        { error: 'TOKEN_ALREADY_USED' },
        { status: 409 },
      );
    }

    // ── 9.8 Unexpected error → 500 INTERNAL_ERROR ─────────────────────────
    return NextResponse.json(
      { error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
