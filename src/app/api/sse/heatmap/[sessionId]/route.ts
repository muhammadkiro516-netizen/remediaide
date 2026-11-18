/**
 * SSE Heatmap Stream
 *
 * GET /api/sse/heatmap/:sessionId
 *
 * Opens a Server-Sent Events stream for real-time heatmap updates.
 * - Requires authenticated teacher session
 * - Sends the current DB state immediately on connection
 * - Streams subsequent broadcasts from SSEManager
 * - Sends a heartbeat comment every 15 seconds to keep the connection alive
 * - On disconnect (req.signal.abort): unsubscribes and cleans up
 *
 * Auth: TEACHER
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTeacherSession } from '@/lib/auth/session';
import { sseManager } from '@/lib/sse/manager';
import { buildHeatmapState } from '@/lib/sse/heatmap-builder';
import type { HeatmapEntry } from '@/types';

// Force Node.js runtime — SSE requires persistent connections unavailable on Edge
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteContext {
  params: { sessionId: string };
}

export async function GET(request: NextRequest, context: RouteContext) {
  // ── 1. Auth ──────────────────────────────────────────────────────────────────
  let session;
  try {
    session = await requireTeacherSession();
  } catch (err) {
    if (err instanceof NextResponse) return err;
    throw err;
  }

  const { sessionId } = context.params;

  // ── 2. Build ReadableStream ───────────────────────────────────────────────────
  let unsubscribe: (() => void) | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;

  const encoder = new TextEncoder();

  function sendEvent(data: HeatmapEntry[]): void {
    if (!controller) return;
    try {
      const payload = `data: ${JSON.stringify(data)}\n\n`;
      controller.enqueue(encoder.encode(payload));
    } catch {
      // Client already disconnected — ignore write errors
    }
  }

  function sendComment(comment: string): void {
    if (!controller) return;
    try {
      controller.enqueue(encoder.encode(`: ${comment}\n\n`));
    } catch {
      // Ignore
    }
  }

  function cleanup(): void {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      controller = ctrl;

      // ── 3. Send initial state from DB ────────────────────────────────────────
      try {
        // First check the in-memory cache for a very recent state
        const cachedState = sseManager.getLastState(sessionId);
        if (cachedState.length > 0) {
          sendEvent(cachedState);
        } else {
          // Build from DB (slightly more expensive, but accurate on first load)
          const initialEntries = await buildHeatmapState(
            sessionId,
            session.schoolId
          );
          // Store in memory so subsequent SSE clients get it from cache
          if (initialEntries.length > 0) {
            sseManager.broadcast(sessionId, initialEntries);
          }
          sendEvent(initialEntries);
        }
      } catch (err) {
        console.error('[sse-heatmap] Failed to build initial state:', err);
        sendEvent([]);
      }

      // ── 4. Subscribe to future broadcasts ────────────────────────────────────
      unsubscribe = sseManager.subscribe(sessionId, (entries) => {
        sendEvent(entries);
      });

      // ── 5. Heartbeat every 15s to keep the connection alive ───────────────────
      heartbeatTimer = setInterval(() => {
        sendComment('heartbeat');
      }, 15_000);

      // ── 6. Clean up on client disconnect ─────────────────────────────────────
      request.signal.addEventListener('abort', () => {
        cleanup();
        try {
          ctrl.close();
        } catch {
          // Already closed
        }
      });
    },

    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx proxy buffering
      // CORS: allow same-origin only (teacher portal is same-origin)
      'Access-Control-Allow-Origin': 'same-origin',
    },
  });
}
