/**
 * GET /api/exit-ticket/[token]
 *
 * Public endpoint — no authentication required.
 * Validates the token, applies rate limiting, and returns the minimal
 * public data needed to render the Exit Ticket form.
 *
 * Response shapes:
 *  200 UNUSED  → { status: 'UNUSED', topicName: string, cognitiveCategory: string }
 *  200 USED    → { status: 'USED' }
 *  404 (empty) → token format is invalid (oracle-safe)
 *  404         → { error: 'TOKEN_NOT_FOUND' }
 *  429         → { error: 'RATE_LIMIT_EXCEEDED' }
 *  500         → { error: 'INTERNAL_ERROR' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { isValidTokenFormat, isTokenExpired } from '@/lib/exit-ticket/token';
import { checkRateLimit } from '@/lib/exit-ticket/rate-limit';

// ─── 7.1 Named GET export; extract token from params ─────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } },
): Promise<NextResponse> {
  // ── 7.9 Outer try/catch — catch any unexpected error ─────────────────────
  try {
    const { token } = params;

    // ── 7.2 Validate token format — 404 (no body) to avoid oracle leakage ──
    if (!isValidTokenFormat(token)) {
      return new NextResponse(null, { status: 404 });
    }

    // ── 7.3 Rate limiting ─────────────────────────────────────────────────
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

    // ── 7.4 Query DB with minimal joins ───────────────────────────────────
    const record = await prisma.exitTicketToken.findUnique({
      where: { token },
      select: {
        status: true,
        createdAt: true,
        session: {
          select: {
            test: {
              select: {
                topic: true,
              },
            },
          },
        },
        remedialGroup: {
          select: {
            cognitiveStatus: true,
          },
        },
      },
    });

    // ── 7.5 Not found → 404 TOKEN_NOT_FOUND ──────────────────────────────
    if (!record) {
      return NextResponse.json(
        { error: 'TOKEN_NOT_FOUND' },
        { status: 404 },
      );
    }

    // ── 7.6 Expired → 404 TOKEN_NOT_FOUND (no distinction) ───────────────
    if (isTokenExpired(record.createdAt)) {
      return NextResponse.json(
        { error: 'TOKEN_NOT_FOUND' },
        { status: 404 },
      );
    }

    // ── 7.7 Token already used → 200 { status: 'USED' } ──────────────────
    if (record.status === 'USED') {
      return NextResponse.json({ status: 'USED' }, { status: 200 });
    }

    // ── 7.8 Token unused → 200 with minimal public data ───────────────────
    // CRITICAL: only status, topicName, cognitiveCategory — NO IDs, NO schoolId,
    // NO remedialGroupId, NO sessionPinId
    return NextResponse.json(
      {
        status: 'UNUSED',
        topicName: record.session.test.topic,
        cognitiveCategory: record.remedialGroup?.cognitiveStatus ?? null,
      },
      { status: 200 },
    );
  } catch {
    // ── 7.9 Unexpected error → 500 INTERNAL_ERROR ─────────────────────────
    return NextResponse.json(
      { error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
