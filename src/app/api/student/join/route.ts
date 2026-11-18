/**
 * POST /api/student/join
 *
 * Authenticates a Siswa using their 6-digit PIN code.
 * On success, creates a signed JWT session token via NextAuth signIn.
 * On failure, applies exponential backoff rate limiting per IP.
 *
 * Security notes:
 *  - Generic error message prevents PIN / session state enumeration.
 *  - Rate limiting tracks per-IP fail counts in an in-memory Map.
 *  - Backoff: after 3 fails → 1s, after 4 → 2s, after 5+ → 4s.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

// ─── In-Memory Rate Limiter ────────────────────────────────────────────────────

interface RateLimitEntry {
  failCount: number;
  lockedUntil: number; // Unix epoch ms
}

// NOTE: This Map lives in the Node.js module cache.
// In a multi-instance deployment, use Redis for shared state.
const rateLimitMap = new Map<string, RateLimitEntry>();

const FAIL_THRESHOLD = 3; // start backing off after this many failures
const BACKOFF_SECONDS = [1, 2, 4]; // indexed by (failCount - FAIL_THRESHOLD)

/**
 * Returns the wait time in ms if the IP is currently rate-limited, or 0 if ok.
 */
function getRateLimitWaitMs(ip: string): number {
  const entry = rateLimitMap.get(ip);
  if (!entry) return 0;
  if (entry.lockedUntil > Date.now()) {
    return entry.lockedUntil - Date.now();
  }
  return 0;
}

/**
 * Records a failed attempt for the given IP and applies exponential backoff.
 */
function recordFailure(ip: string): void {
  const entry = rateLimitMap.get(ip) ?? { failCount: 0, lockedUntil: 0 };
  entry.failCount += 1;

  if (entry.failCount >= FAIL_THRESHOLD) {
    const backoffIdx = Math.min(
      entry.failCount - FAIL_THRESHOLD,
      BACKOFF_SECONDS.length - 1
    );
    const waitSec = BACKOFF_SECONDS[backoffIdx];
    entry.lockedUntil = Date.now() + waitSec * 1000;
  }

  rateLimitMap.set(ip, entry);
}

/**
 * Clears the rate limit record for a given IP on successful auth.
 */
function clearRateLimit(ip: string): void {
  rateLimitMap.delete(ip);
}

// ─── Generic error response (prevents enumeration) ───────────────────────────

const GENERIC_ERROR = "PIN tidak valid atau sesi belum dimulai";

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Determine caller IP
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  // Check rate limit
  const waitMs = getRateLimitWaitMs(ip);
  if (waitMs > 0) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(waitMs / 1000)} detik.`,
          retryAfterMs: waitMs,
        },
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(waitMs / 1000)),
        },
      }
    );
  }

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Request body tidak valid." } },
      { status: 400 }
    );
  }

  const pinCode =
    body && typeof body === "object" && "pinCode" in body
      ? String((body as Record<string, unknown>).pinCode).trim()
      : "";

  const studentId =
    body && typeof body === "object" && "studentId" in body
      ? String((body as Record<string, unknown>).studentId).trim()
      : "";

  if (!pinCode || !/^\d{6}$/.test(pinCode)) {
    recordFailure(ip);
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: GENERIC_ERROR } },
      { status: 401 }
    );
  }

  // Look up the session pin (include test.classId for student filtering)
  const sessionPin = await prisma.sessionPin.findUnique({
    where: { pinCode },
    select: {
      id: true,
      schoolId: true,
      state: true,
      test: { select: { classId: true } },
    },
  });

  if (!sessionPin || sessionPin.state !== "ACTIVE") {
    recordFailure(ip);
    return NextResponse.json(
      { success: false, error: { code: "AUTH_FAILED", message: GENERIC_ERROR } },
      { status: 401 }
    );
  }

  // If studentId is provided, verify and authenticate immediately
  if (studentId) {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, schoolId: true, classId: true, anonymousLabel: true },
    });

    if (
      !student ||
      student.schoolId !== sessionPin.schoolId ||
      student.classId !== sessionPin.test.classId
    ) {
      recordFailure(ip);
      return NextResponse.json(
        { success: false, error: { code: "AUTH_FAILED", message: GENERIC_ERROR } },
        { status: 401 }
      );
    }

    clearRateLimit(ip);

    return NextResponse.json(
      {
        success: true,
        data: {
          sessionPinId: sessionPin.id,
          schoolId: sessionPin.schoolId,
          studentId: student.id,
          anonymousLabel: student.anonymousLabel,
          students: null, // already selected
          message: "Autentikasi berhasil.",
        },
      },
      { status: 200 }
    );
  }

  // No studentId provided — return list of students in this session's class
  // so the UI can show a selection step (public, gated behind valid ACTIVE PIN)
  const students = await prisma.student.findMany({
    where: { schoolId: sessionPin.schoolId, classId: sessionPin.test.classId },
    select: { id: true, anonymousLabel: true },
    orderBy: { anonymousLabel: "asc" },
  });

  clearRateLimit(ip);

  return NextResponse.json(
    {
      success: true,
      data: {
        sessionPinId: sessionPin.id,
        schoolId: sessionPin.schoolId,
        studentId: null,
        anonymousLabel: null,
        students, // client shows selection list
        message: "PIN valid. Pilih nama kamu.",
      },
    },
    { status: 200 }
  );
}
