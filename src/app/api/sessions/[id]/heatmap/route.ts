/**
 * Heatmap HTTP Polling Fallback
 *
 * GET /api/sessions/:id/heatmap
 *
 * Returns the current heatmap state for a session.
 * Used by LiveHeatmap when SSE is unavailable (3 consecutive failed reconnects).
 *
 * Auth: TEACHER
 * Returns: { success: true, data: HeatmapEntry[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTeacherSession } from '@/lib/auth/session';
import { buildHeatmapState } from '@/lib/sse/heatmap-builder';

interface RouteContext {
  params: { id: string };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  let session;
  try {
    session = await requireTeacherSession();
  } catch (err) {
    if (err instanceof NextResponse) return err;
    throw err;
  }

  const { id } = context.params;

  // ── Build and return current heatmap state ───────────────────────────────────
  const entries = await buildHeatmapState(id, session.schoolId);

  return NextResponse.json({ success: true, data: entries });
}
