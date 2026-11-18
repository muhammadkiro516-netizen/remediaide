/**
 * Principal Overview Page — Server Component
 *
 * Fetches aggregate school data server-side, then renders
 * PrincipalOverviewClient for interactivity (date filter, charts).
 *
 * Read-Only: no mutation allowed for PRINCIPAL role.
 * Individual student identities are never exposed.
 *
 * force-dynamic: auth() reads cookies at runtime — this page must
 * never be statically prerendered during build.
 */
export const dynamic = "force-dynamic";

import { redirect } from 'next/navigation';
import { getTeacherSession } from '@/lib/auth/session';
import PrincipalOverviewClient from './PrincipalOverviewClient';

export default async function PrincipalOverviewPage() {
  const session = await getTeacherSession();

  if (!session) redirect('/login');
  if (session.role !== 'PRINCIPAL') redirect('/dashboard');

  return <PrincipalOverviewClient />;
}
