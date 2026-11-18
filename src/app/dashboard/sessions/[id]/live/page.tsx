/**
 * Live Session Page — Server Component
 *
 * Fetches initial session data server-side, then hands off to LiveSessionClient
 * which manages the SSE heatmap, countdown timer, and action buttons.
 *
 * Route: /dashboard/sessions/:id/live
 *
 * force-dynamic: auth() + Prisma query must run at request time, never
 * at build time.
 */
export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import { getTeacherSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import LiveSessionClient from "./LiveSessionClient";

interface PageProps {
  params: { id: string };
}

export default async function LiveSessionPage({ params }: PageProps) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const teacherSession = await getTeacherSession();
  if (!teacherSession) redirect("/login");

  const { id } = params;

  // ── Fetch session ────────────────────────────────────────────────────────────
  const sessionPin = await prisma.sessionPin.findFirst({
    where: { id, schoolId: teacherSession.schoolId },
    select: {
      id: true,
      state: true,
      pinCode: true,
      startedAt: true,
      closedAt: true,
      test: {
        select: {
          topic: true,
          durationSeconds: true,
          _count: { select: { questions: true } },
        },
      },
    },
  });

  if (!sessionPin) notFound();

  // Serialise dates to ISO strings so they're safe to pass as props to client
  const serialisedSession = {
    id: sessionPin.id,
    state: sessionPin.state as "LOCKED" | "ACTIVE" | "CLOSED",
    pinCode: sessionPin.pinCode,
    startedAt: sessionPin.startedAt?.toISOString() ?? null,
    closedAt: sessionPin.closedAt?.toISOString() ?? null,
    test: {
      topic: sessionPin.test.topic,
      durationSeconds: sessionPin.test.durationSeconds,
      _count: { questions: sessionPin.test._count.questions },
    },
  };

  return <LiveSessionClient initialSession={serialisedSession} />;
}
