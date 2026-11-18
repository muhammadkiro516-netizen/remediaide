/**
 * middleware.ts — Official Auth.js v5 split-config pattern
 *
 * Uses NextAuth(authConfig).auth as middleware — Edge-safe because authConfig
 * does NOT import Prisma, bcrypt, or any Node.js-only library.
 *
 * All RBAC logic lives in authConfig.callbacks.authorized() in auth.config.ts.
 *
 * Route protection rules (enforced in authorized()):
 *  /dashboard/**        → requires role TEACHER, PRINCIPAL, or SUPERADMIN
 *  /principal/**        → requires role PRINCIPAL or SUPERADMIN
 *  /admin/**            → requires role SUPERADMIN
 *  /student/quiz/**     → requires valid student session (userType=student)
 *  /student/join        → public (PIN entry page)
 *  /api/auth/**         → public (NextAuth handlers)
 *  /api/student/join    → public (PIN authentication endpoint)
 *  /api/health          → public
 *  /login, /register    → public
 */

import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|.*\\..*).*)",
  ],
};
