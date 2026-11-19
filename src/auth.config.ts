/**
 * auth.config.ts — Lightweight NextAuth config for Edge Middleware
 *
 * IMPORTANT: Do NOT import Prisma, bcrypt, or any Node.js-only library here.
 * This file is bundled into the Edge runtime (Vercel middleware).
 * Heavy operations (DB queries, password hashing) live in auth.ts only.
 *
 * trustHost: true — required so Auth.js v5 does NOT call new URL(AUTH_URL)
 * at module-init time. Without this, Vercel build crashes with
 * "TypeError: Invalid URL" when AUTH_URL is not set at build time.
 *
 * Custom jwt.encode/decode uses JWS (signed-only) instead of NextAuth's
 * default JWE (encrypted). This avoids DecompressionStream dependency
 * in jose v6 which is unavailable in Vercel serverless runtime.
 * next-auth@5.0.0-beta.25 uses jose v5 which does not have this issue,
 * but we keep the override as an explicit safeguard.
 */

import type { NextAuthConfig } from "next-auth";
import type { NextRequest } from "next/server";

// ─── Route Matchers ───────────────────────────────────────────────────────────

export const PUBLIC_ROUTES: RegExp[] = [
  /^\/login(\/.*)?$/,
  /^\/register(\/.*)?$/,
  /^\/api\/auth\/.*/,
  /^\/api\/student\/join$/,
  /^\/api\/health$/,
  /^\/$/,
  /^\/metodologi$/,  // RemediAide 2.0 public methodology page
  /^\/student\/join$/,
  /^\/exit-ticket(\/.*)?$/,
  /^\/api\/exit-ticket\/.*/,
];

const TEACHER_ROUTES: RegExp[] = [/^\/dashboard(\/.*)?$/];
const PRINCIPAL_ROUTES: RegExp[] = [/^\/principal(\/.*)?$/];
const SUPERADMIN_ROUTES: RegExp[] = [/^\/admin(\/.*)?$/, /^\/api\/admin\/.*/];
const STUDENT_ROUTES: RegExp[] = [/^\/student\/quiz(\/.*)?$/];

function isPublic(p: string) {
  return PUBLIC_ROUTES.some((r) => r.test(p));
}
function requiresTeacher(p: string) {
  return TEACHER_ROUTES.some((r) => r.test(p));
}
function requiresPrincipal(p: string) {
  return PRINCIPAL_ROUTES.some((r) => r.test(p));
}
function requiresSuperAdmin(p: string) {
  return SUPERADMIN_ROUTES.some((r) => r.test(p));
}
function requiresStudent(p: string) {
  return STUDENT_ROUTES.some((r) => r.test(p));
}

export const authConfig: NextAuthConfig = {
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  basePath: "/api/auth",

  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
  },

  /**
   * Override JWT encode/decode to use JWS (signed) instead of JWE (encrypted).
   * NextAuth v5 beta defaults to JWE which requires DecompressionStream —
   * unavailable in Vercel serverless runtime. JWS avoids this entirely.
   */
  jwt: {
    encode: async ({ token, secret, maxAge }) => {
      const { SignJWT } = await import("jose");
      const secretKey = new TextEncoder().encode(
        Array.isArray(secret) ? secret[0] : (secret as string)
      );
      return new SignJWT(token as Record<string, unknown>)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) + (maxAge ?? 8 * 60 * 60))
        .sign(secretKey);
    },
    decode: async ({ token, secret }) => {
      if (!token) return null;
      try {
        const { jwtVerify } = await import("jose");
        const secretKey = new TextEncoder().encode(
          Array.isArray(secret) ? secret[0] : (secret as string)
        );
        const { payload } = await jwtVerify(token, secretKey);
        return payload as import("next-auth/jwt").JWT;
      } catch {
        return null;
      }
    },
  },

  cookies: {
    sessionToken: {
      name: "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },

  /**
   * Providers are added in auth.ts (Node.js runtime).
   * Edge middleware only needs the JWT callbacks — no authorize() is called here.
   */
  providers: [],

  callbacks: {
    /**
     * authorized() runs on every matched request in middleware.
     * We implement full RBAC here using the decoded auth object.
     *
     * Return value:
     *   - true          → allow request (NextResponse.next())
     *   - false         → block (NextAuth redirects to signIn page for page routes)
     *   - NextResponse  → custom response (used for API 401/403)
     */
    authorized({ auth, request }) {
      const { nextUrl } = request as NextRequest;
      const { pathname } = nextUrl;
      const isApi = pathname.startsWith("/api/");

      // Always allow public routes
      if (isPublic(pathname)) return true;

      const userType = (auth as { userType?: string } | null)?.userType;
      const role = (auth as { role?: string } | null)?.role;

      // No session — redirect to login or return 401 for API
      if (!auth) {
        if (isApi) {
          return new Response(
            JSON.stringify({
              success: false,
              error: { code: "AUTH_REQUIRED", message: "Autentikasi diperlukan" },
            }),
            { status: 401, headers: { "Content-Type": "application/json" } }
          );
        }
        return false; // NextAuth redirects to pages.signIn
      }

      // SUPERADMIN routes
      if (requiresSuperAdmin(pathname)) {
        if (userType !== "teacher" || role !== "SUPERADMIN") {
          if (isApi) {
            return new Response(
              JSON.stringify({
                success: false,
                error: { code: "FORBIDDEN", message: "Akses ditolak" },
              }),
              { status: 403, headers: { "Content-Type": "application/json" } }
            );
          }
          return false;
        }
        return true;
      }

      // TEACHER/PRINCIPAL routes (e.g. /dashboard)
      if (requiresTeacher(pathname)) {
        if (
          userType !== "teacher" ||
          (role !== "TEACHER" && role !== "PRINCIPAL" && role !== "SUPERADMIN")
        ) {
          if (isApi) {
            return new Response(
              JSON.stringify({
                success: false,
                error: { code: "FORBIDDEN", message: "Akses ditolak" },
              }),
              { status: 403, headers: { "Content-Type": "application/json" } }
            );
          }
          return false;
        }
        return true;
      }

      // PRINCIPAL-only routes
      if (requiresPrincipal(pathname)) {
        if (userType !== "teacher" || (role !== "PRINCIPAL" && role !== "SUPERADMIN")) {
          if (isApi) {
            return new Response(
              JSON.stringify({
                success: false,
                error: { code: "FORBIDDEN", message: "Akses ditolak" },
              }),
              { status: 403, headers: { "Content-Type": "application/json" } }
            );
          }
          return false;
        }
        return true;
      }

      // STUDENT-only routes
      if (requiresStudent(pathname)) {
        if (userType !== "student") {
          if (isApi) {
            return new Response(
              JSON.stringify({
                success: false,
                error: { code: "FORBIDDEN", message: "Akses ditolak" },
              }),
              { status: 403, headers: { "Content-Type": "application/json" } }
            );
          }
          return false;
        }
        return true;
      }

      return true;
    },

    /**
     * Propagate custom JWT claims into the token.
     * Runs server-side only (in auth.ts context during sign-in).
     * Also runs on the Edge when NextAuth decodes the JWT for authorized().
     */
    jwt({ token, user }) {
      if (user) {
        const u = user as {
          userType?: "teacher" | "student";
          schoolId?: string;
          role?: "TEACHER" | "PRINCIPAL" | "SUPERADMIN";
          studentId?: string;
          sessionPinId?: string;
          anonymousLabel?: string;
        };

        token["userType"] = u.userType;
        token["schoolId"] = u.schoolId;
        token["role"] = u.role;
        token["studentId"] = u.studentId;
        token["sessionPinId"] = u.sessionPinId;
        token["anonymousLabel"] = u.anonymousLabel;
      }
      return token;
    },

    session({ session, token }) {
      session.userType = token["userType"] as "teacher" | "student" | undefined;
      session.schoolId = token["schoolId"] as string | undefined;
      session.role = token["role"] as "TEACHER" | "PRINCIPAL" | "SUPERADMIN" | undefined;
      session.studentId = token["studentId"] as string | undefined;
      session.sessionPinId = token["sessionPinId"] as string | undefined;
      session.anonymousLabel = token["anonymousLabel"] as string | undefined;

      if (session.user) {
        session.user.id = token.sub ?? "";
      }

      return session;
    },
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },
} satisfies NextAuthConfig;
