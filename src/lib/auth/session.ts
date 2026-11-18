/**
 * Session Helpers — RemediAide
 *
 * Provides typed wrappers around NextAuth's `auth()` for use inside
 * Route Handlers and Server Components.
 *
 * Usage in a Route Handler:
 *   const session = await requireTeacherSession();
 *   // session.schoolId, session.role, etc. are typed
 *
 * Usage in a Server Component:
 *   const session = await getTeacherSession();
 *   if (!session) redirect('/login');
 */

import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { TeacherSession, TeacherRole, StudentSession } from "@/types";

// ─── Internal JWT shape ───────────────────────────────────────────────────────

interface JwtPayload {
  userType?: "teacher" | "student";
  schoolId?: string;
  role?: string;
  studentId?: string;
  sessionPinId?: string;
  anonymousLabel?: string;
  user?: { id?: string; name?: string | null; email?: string | null };
}

// ─── Teacher Session Helpers ──────────────────────────────────────────────────

/**
 * Returns the current teacher/principal session, or null if not authenticated
 * or the session belongs to a student.
 */
export async function getTeacherSession(): Promise<TeacherSession | null> {
  const session = (await auth()) as (Record<string, unknown> & JwtPayload) | null;

  if (!session) return null;
  if (session.userType !== "teacher") return null;

  const userId = (session.user as { id?: string } | undefined)?.id;
  if (!userId || !session.schoolId || !session.role) return null;

  return {
    userId,
    schoolId: session.schoolId,
    role: session.role as TeacherRole,
    name: (session.user as { name?: string | null } | undefined)?.name ?? "",
    email:
      (session.user as { email?: string | null } | undefined)?.email ?? "",
  };
}

/**
 * Returns the teacher session or throws a NextResponse(401).
 * Use inside Route Handlers to guard against unauthenticated access.
 */
export async function requireTeacherSession(): Promise<TeacherSession> {
  const session = await getTeacherSession();
  if (!session) {
    throw NextResponse.json(
      {
        success: false,
        error: { code: "AUTH_REQUIRED", message: "Autentikasi diperlukan." },
      },
      { status: 401 }
    );
  }
  return session;
}

/**
 * Requires a specific teacher role.
 * Throws NextResponse(401) if not authenticated, NextResponse(403) if wrong role.
 */
export async function requireRole(
  role: TeacherRole
): Promise<TeacherSession> {
  const session = await requireTeacherSession();

  if (session.role !== role) {
    throw NextResponse.json(
      {
        success: false,
        error: {
          code: "FORBIDDEN",
          message: `Akses ditolak. Peran dibutuhkan: ${role}.`,
        },
      },
      { status: 403 }
    );
  }

  return session;
}

// ─── Student Session Helpers ──────────────────────────────────────────────────

/**
 * Returns the current student session, or null if not authenticated
 * or the session belongs to a teacher.
 */
export async function getStudentSession(): Promise<StudentSession | null> {
  const session = (await auth()) as (Record<string, unknown> & JwtPayload) | null;

  if (!session) return null;
  if (session.userType !== "student") return null;

  if (
    !session.studentId ||
    !session.sessionPinId ||
    !session.schoolId ||
    !session.anonymousLabel
  ) {
    return null;
  }

  return {
    studentId: session.studentId,
    sessionPinId: session.sessionPinId,
    schoolId: session.schoolId,
    anonymousLabel: session.anonymousLabel,
  };
}

/**
 * Returns the student session or throws a NextResponse(401).
 */
export async function requireStudentSession(): Promise<StudentSession> {
  const session = await getStudentSession();
  if (!session) {
    throw NextResponse.json(
      {
        success: false,
        error: { code: "AUTH_REQUIRED", message: "Autentikasi siswa diperlukan." },
      },
      { status: 401 }
    );
  }
  return session;
}
