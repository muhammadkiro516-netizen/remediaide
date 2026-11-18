/**
 * Results Page — Server Component
 *
 * Fetches session + initial diagnoses + groups server-side,
 * then renders ResultsClient for interactivity.
 *
 * force-dynamic: auth() + Prisma queries must run at request time,
 * never at build time.
 */
export const dynamic = "force-dynamic";

import { notFound, redirect } from 'next/navigation';
import { getTeacherSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import ResultsClient from './ResultsClient';

interface PageProps {
  params: { id: string };
}

export default async function ResultsPage({ params }: PageProps) {
  const teacherSession = await getTeacherSession();
  if (!teacherSession) redirect('/login');

  const { id } = params;

  const sessionPin = await prisma.sessionPin.findFirst({
    where: { id, schoolId: teacherSession.schoolId },
    select: {
      id: true,
      state: true,
      test: {
        select: {
          topic: true,
          questions: {
            orderBy: { itemOrder: 'asc' },
            select: { id: true, templateText: true, itemOrder: true },
          },
        },
      },
    },
  });

  if (!sessionPin) notFound();

  const diagnoses = await prisma.conceptDiagnosis.findMany({
    where: { sessionPinId: id },
    select: {
      finalStatus: true,
      tiebreakerApplied: true,
      validItemCount: true,
      student: { select: { anonymousLabel: true } },
      question: { select: { id: true, itemOrder: true } },
    },
    orderBy: [
      { student: { anonymousLabel: 'asc' } },
      { question: { itemOrder: 'asc' } },
    ],
  });

  const groups = await prisma.remedialGroup.findMany({
    where: { sessionPinId: id },
    include: {
      exitTicketTokens: {
        select: { status: true },
      },
    },
    orderBy: { cognitiveStatus: 'asc' },
  });

  return (
    <ResultsClient
      sessionId={id}
      topic={sessionPin.test.topic}
      sessionState={sessionPin.state as 'LOCKED' | 'ACTIVE' | 'CLOSED'}
      questions={sessionPin.test.questions}
      initialDiagnoses={diagnoses.map((d) => ({
        anonymousLabel: d.student.anonymousLabel,
        questionId: d.question.id,
        finalStatus: d.finalStatus,
        tiebreakerApplied: d.tiebreakerApplied,
        validItemCount: d.validItemCount,
      }))}
      initialGroups={groups.map((g) => ({
        id: g.id,
        cognitiveStatus: g.cognitiveStatus,
        memberLabels: g.memberLabels as string[],
        prescription: g.prescription,
        exitTicketTokenCount: g.exitTicketTokens.length,
        exitTicketSubmissionCount: g.exitTicketTokens.filter(
          (t) => t.status === 'USED'
        ).length,
      }))}
    />
  );
}
