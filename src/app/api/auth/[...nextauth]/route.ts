/**
 * NextAuth v5 route handler.
 * All GET/POST requests to /api/auth/* are handled here.
 */

import { handlers } from "@/auth";

export async function GET(req: Request, ctx: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (handlers.GET as any)(req, ctx);
}

export async function POST(req: Request, ctx: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (handlers.POST as any)(req, ctx);
}
