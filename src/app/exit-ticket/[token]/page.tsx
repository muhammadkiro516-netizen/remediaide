/**
 * Exit Ticket Page — Server Component
 *
 * Validates token format, fetches data server-side, and routes to the
 * appropriate sub-component based on token status and data availability.
 */

import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { isValidTokenFormat, isTokenExpired } from '@/lib/exit-ticket/token';
import ExitTicketForm from './ExitTicketForm';
import ErrorPage from './ErrorPage';
import ConfirmationPage from './ConfirmationPage';

export default async function ExitTicketPage({
  params,
}: {
  params: { token: string };
}) {
  const { token } = params;

  // Validate format before querying DB (11.1)
  if (!isValidTokenFormat(token)) notFound();

  // Fetch token data with minimal joins (server-side, no client API call)
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

  // Not found or expired → error page
  if (!record || isTokenExpired(record.createdAt)) {
    return <ErrorPage type="NOT_FOUND" />;
  }

  // Token already used → confirmation page with alreadySubmitted flag
  if (record.status === 'USED') {
    return <ConfirmationPage alreadySubmitted />;
  }

  // No cognitive category data → error page
  if (!record.remedialGroup?.cognitiveStatus) {
    return <ErrorPage type="DATA_NOT_FOUND" />;
  }

  // Valid unused token → render form
  return (
    <ExitTicketForm
      token={token}
      topicName={record.session.test.topic}
      cognitiveCategory={record.remedialGroup.cognitiveStatus}
    />
  );
}
