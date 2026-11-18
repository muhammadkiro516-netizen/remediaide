/**
 * auth.ts — Full NextAuth configuration (Node.js runtime only)
 *
 * This file contains Prisma + bcrypt — do NOT import it in middleware.ts.
 * Middleware uses auth.config.ts (Edge-safe) via next-auth's split-config pattern.
 *
 * Two credential providers:
 *  1. "credentials"  — Guru / Kepala Sekolah (email + bcrypt password)
 *  2. "student-pin"  — Siswa (6-digit PIN sesi sementara)
 */

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/client";
import { authConfig } from "@/auth.config";

// ─── Module Augmentation ──────────────────────────────────────────────────────
declare module "next-auth" {
  interface Session {
    userType?: "teacher" | "student";
    schoolId?: string;
    role?: "TEACHER" | "PRINCIPAL" | "SUPERADMIN";
    studentId?: string;
    sessionPinId?: string;
    anonymousLabel?: string;
  }
}

// ─── Full config with heavy providers ────────────────────────────────────────

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: process.env.AUTH_SECRET,
  providers: [
    // ── Provider 1: Guru / Kepala Sekolah (email + password) ──────────────
    Credentials({
      id: "credentials",
      name: "Teacher / Principal",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = String(credentials.email).toLowerCase().trim();
        const password = String(credentials.password);

        let teacher;
        try {
          teacher = await prisma.teacher.findUnique({
            where: { email },
            select: {
              id: true,
              schoolId: true,
              name: true,
              email: true,
              role: true,
              passwordHash: true,
            },
          });
        } catch (dbError) {
          console.error("[auth] DB query failed:", (dbError as Error)?.message);
          return null;
        }

        if (!teacher) {
          // Constant-time rejection to prevent timing attacks
          await bcrypt.compare(password, "$2b$12$dummyhashtopreventtimingattack00");
          return null;
        }

        const passwordMatch = await bcrypt.compare(password, teacher.passwordHash);
        if (!passwordMatch) {
          return null;
        }

        return {
          id: teacher.id,
          email: teacher.email,
          name: teacher.name,
          schoolId: teacher.schoolId,
          role: teacher.role as "TEACHER" | "PRINCIPAL" | "SUPERADMIN",
          userType: "teacher" as const,
        };
      },
    }),

    // ── Provider 2: Siswa (PIN sesi sementara) ─────────────────────────────
    Credentials({
      id: "student-pin",
      name: "Student PIN",
      credentials: {
        pinCode: { label: "PIN Sesi", type: "text" },
        studentId: { label: "Student ID", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.pinCode || !credentials?.studentId) {
          return null;
        }

        const pinCode = String(credentials.pinCode).trim();
        const studentId = String(credentials.studentId).trim();

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
          return null;
        }

        const student = await prisma.student.findUnique({
          where: { id: studentId },
          select: {
            id: true,
            schoolId: true,
            classId: true,
            anonymousLabel: true,
          },
        });

        if (
          !student ||
          student.schoolId !== sessionPin.schoolId ||
          student.classId !== sessionPin.test.classId
        ) {
          return null;
        }

        return {
          id: `student:${student.id}:${sessionPin.id}`,
          name: student.anonymousLabel,
          email: null,
          studentId: student.id,
          sessionPinId: sessionPin.id,
          schoolId: sessionPin.schoolId,
          anonymousLabel: student.anonymousLabel,
          userType: "student" as const,
        };
      },
    }),
  ],
});
