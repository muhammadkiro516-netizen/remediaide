"use client";

/**
 * LiveHeatmap
 *
 * Real-time heatmap grid showing student submission and cognitive status.
 * Max 50 cells visible in the grid without horizontal scroll at 1024px viewport.
 *
 * Connection lifecycle:
 *   1. Opens EventSource to /api/sse/heatmap/:sessionId
 *   2. On message: parse JSON, update state
 *   3. On error/close: reconnect with exponential backoff (1s → 2s → 4s → max 30s)
 *   4. After 3 consecutive failed reconnects: switch to polling every 5s
 *   5. On unmount: close EventSource, clear intervals
 *
 * Connection status indicator:
 *   🟢 Live (connected)
 *   🟡 Menghubungkan ulang... (reconnecting)
 *   🔵 Polling setiap 5 detik (polling mode)
 *   🔴 Terputus (error / giving up)
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import type { HeatmapEntry, CognitiveStatus } from "@/types";

// ─── Props ────────────────────────────────────────────────────────────────────

interface LiveHeatmapProps {
  sessionId: string;
  sessionState: "LOCKED" | "ACTIVE" | "CLOSED";
  totalQuestions: number;
}

// ─── Connection status type ───────────────────────────────────────────────────

type ConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "polling"
  | "error";

// ─── Colour mappings ──────────────────────────────────────────────────────────

function getCellColor(entry: HeatmapEntry): string {
  if (entry.submissionStatus === "NOT_SUBMITTED") return "bg-gray-300";
  if (entry.submissionStatus === "PARTIAL") return "bg-amber-400";

  // COMPLETE — check cognitive status
  if (!entry.cognitiveStatus) return "bg-green-500";

  const colorMap: Record<CognitiveStatus, string> = {
    PAHAM_KONSEP:      "bg-green-700",
    LUCKY_GUESS:       "bg-yellow-700",
    MISKONSEPSI:       "bg-red-700",
    TIDAK_PAHAM:       "bg-blue-900",
    INSUFFICIENT_DATA: "bg-gray-400",
    INVALID:           "bg-orange-500",
  };
  return colorMap[entry.cognitiveStatus] ?? "bg-green-500";
}

// ─── Status label helpers ─────────────────────────────────────────────────────

function submissionStatusText(status: HeatmapEntry["submissionStatus"]): string {
  switch (status) {
    case "NOT_SUBMITTED": return "Belum mengerjakan";
    case "PARTIAL":       return "Sebagian dikerjakan";
    case "COMPLETE":      return "Selesai";
  }
}

function cognitiveStatusText(status?: CognitiveStatus): string {
  if (!status) return "";
  const labels: Record<CognitiveStatus, string> = {
    PAHAM_KONSEP:      "Paham Konsep",
    LUCKY_GUESS:       "Lucky Guess",
    MISKONSEPSI:       "Miskonsepsi",
    TIDAK_PAHAM:       "Tidak Paham",
    INSUFFICIENT_DATA: "Data Tidak Cukup",
    INVALID:           "Tidak Valid",
  };
  return labels[status] ?? status;
}

// ─── Legend entries ───────────────────────────────────────────────────────────

const LEGEND_ITEMS = [
  { color: "bg-gray-300",   label: "Belum mengerjakan" },
  { color: "bg-amber-400",  label: "Sebagian dikerjakan" },
  { color: "bg-green-500",  label: "Selesai (belum didiagnosis)" },
  { color: "bg-green-700",  label: "Paham Konsep" },
  { color: "bg-yellow-700", label: "Lucky Guess" },
  { color: "bg-red-700",    label: "Miskonsepsi" },
  { color: "bg-blue-900",   label: "Tidak Paham" },
  { color: "bg-gray-400",   label: "Data Tidak Cukup" },
  { color: "bg-orange-500", label: "Tidak Valid" },
] as const;

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_BACKOFF_MS = 30_000;
const POLLING_INTERVAL_MS = 5_000;
const MAX_RECONNECT_FAILURES = 3;

// ─── Component ────────────────────────────────────────────────────────────────

export default function LiveHeatmap({
  sessionId,
  sessionState,
  totalQuestions,
}: LiveHeatmapProps) {
  const [entries, setEntries] = useState<HeatmapEntry[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);

  // Refs so callbacks capture the latest values without re-creating effects
  const esRef = useRef<EventSource | null>(null);
  const backoffMsRef = useRef<number>(1_000);
  const failureCountRef = useRef<number>(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef<boolean>(true);

  // ── Polling mode ───────────────────────────────────────────────────────────

  const startPolling = useCallback(() => {
    if (!isMountedRef.current) return;
    setStatus("polling");

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/heatmap`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { success: boolean; data: HeatmapEntry[] };
        if (json.success && isMountedRef.current) {
          setEntries(json.data);
        }
      } catch {
        // Polling failure — keep retrying silently
      }
    }, POLLING_INTERVAL_MS);
  }, [sessionId]);

  // ── SSE connection ─────────────────────────────────────────────────────────

  const closeSSE = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const connectSSE = useCallback(() => {
    if (!isMountedRef.current) return;

    closeSSE();
    setStatus("connecting");

    const es = new EventSource(`/api/sse/heatmap/${sessionId}`);
    esRef.current = es;

    es.onopen = () => {
      if (!isMountedRef.current) return;
      backoffMsRef.current = 1_000;
      failureCountRef.current = 0;
      setStatus("connected");
    };

    es.onmessage = (event: MessageEvent) => {
      if (!isMountedRef.current) return;
      try {
        const parsed = JSON.parse(event.data as string) as HeatmapEntry[];
        setEntries(parsed);
        setStatus("connected");
      } catch {
        console.error("[LiveHeatmap] Failed to parse SSE message");
      }
    };

    es.onerror = () => {
      if (!isMountedRef.current) return;
      es.close();
      esRef.current = null;

      failureCountRef.current += 1;

      if (failureCountRef.current >= MAX_RECONNECT_FAILURES) {
        // Give up SSE — fall back to polling
        setStatus("polling");
        startPolling();
        return;
      }

      // Exponential backoff reconnect
      setStatus("reconnecting");
      const delay = Math.min(backoffMsRef.current, MAX_BACKOFF_MS);
      backoffMsRef.current = Math.min(backoffMsRef.current * 2, MAX_BACKOFF_MS);

      reconnectTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) connectSSE();
      }, delay);
    };
  }, [sessionId, closeSSE, startPolling]);

  // ── Effect: connect on mount, cleanup on unmount ───────────────────────────

  useEffect(() => {
    isMountedRef.current = true;
    connectSSE();

    return () => {
      isMountedRef.current = false;
      closeSSE();
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [connectSSE, closeSSE]);

  // ── Status indicator ───────────────────────────────────────────────────────

  const statusIndicator: Record<ConnectionStatus, { icon: string; label: string; className: string }> = {
    connecting:   { icon: "🟡", label: "Menghubungkan...",          className: "text-yellow-600" },
    connected:    { icon: "🟢", label: "Live",                      className: "text-green-600" },
    reconnecting: { icon: "🟡", label: "Menghubungkan ulang...",     className: "text-yellow-600" },
    polling:      { icon: "🔵", label: "Polling setiap 5 detik",    className: "text-blue-600" },
    error:        { icon: "🔴", label: "Terputus",                  className: "text-red-600" },
  };

  const indicator = statusIndicator[status];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Heatmap Kelas
          </h2>
          <p className="text-sm text-gray-500">
            {entries.length} siswa &bull; {totalQuestions} soal
          </p>
        </div>

        {/* Connection status badge */}
        <div
          className={`flex items-center gap-1.5 text-sm font-medium ${indicator.className}`}
          role="status"
          aria-live="polite"
          aria-label={`Status koneksi: ${indicator.label}`}
        >
          <span aria-hidden="true">{indicator.icon}</span>
          <span>{indicator.label}</span>
        </div>
      </div>

      {/* Grid */}
      {entries.length === 0 ? (
        <div className="flex items-center justify-center h-32 rounded-lg border-2 border-dashed border-gray-200 text-gray-400 text-sm">
          {status === "connecting"
            ? "Memuat data..."
            : "Belum ada siswa dalam sesi ini."}
        </div>
      ) : (
        <div
          className="relative"
          role="grid"
          aria-label="Heatmap status pengerjaan siswa"
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(48px, 1fr))",
              gap: "6px",
              maxWidth: "100%",
            }}
          >
            {entries.map((entry) => {
              const colorClass = getCellColor(entry);
              const statusText = submissionStatusText(entry.submissionStatus);
              const cogText = cognitiveStatusText(entry.cognitiveStatus);
              const ariaLabel = cogText
                ? `${entry.anonymousLabel}: ${statusText}, ${cogText}`
                : `${entry.anonymousLabel}: ${statusText}`;
              const isHovered = hoveredLabel === entry.anonymousLabel;

              return (
                <div key={entry.anonymousLabel} className="relative">
                  <div
                    role="gridcell"
                    className={`
                      w-full aspect-square rounded-md cursor-default select-none
                      transition-transform duration-150 focus:outline-none
                      focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500
                      ${colorClass}
                      ${isHovered ? "scale-110 z-10 shadow-lg" : "hover:scale-105"}
                    `}
                    style={{ minWidth: "48px", minHeight: "48px" }}
                    aria-label={ariaLabel}
                    tabIndex={0}
                    onMouseEnter={() => setHoveredLabel(entry.anonymousLabel)}
                    onMouseLeave={() => setHoveredLabel(null)}
                    onFocus={() => setHoveredLabel(entry.anonymousLabel)}
                    onBlur={() => setHoveredLabel(null)}
                  />

                  {/* Tooltip */}
                  {isHovered && (
                    <div
                      className="
                        absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-2
                        bg-gray-900 text-white text-xs rounded-md px-2.5 py-1.5
                        whitespace-nowrap pointer-events-none shadow-lg
                        max-w-[200px] text-center
                      "
                      role="tooltip"
                      aria-hidden="true"
                    >
                      <div className="font-semibold">{entry.anonymousLabel}</div>
                      <div>{statusText}</div>
                      {cogText && <div>{cogText}</div>}
                      {/* Tooltip arrow */}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <details className="mt-2">
        <summary className="text-sm font-medium text-gray-600 cursor-pointer hover:text-gray-900 list-none flex items-center gap-1">
          <span>▸</span>
          <span>Keterangan warna</span>
        </summary>
        <div className="mt-2 flex flex-wrap gap-3">
          {LEGEND_ITEMS.map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5 text-xs text-gray-600">
              <div
                className={`w-4 h-4 rounded-sm flex-shrink-0 ${color}`}
                aria-hidden="true"
              />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
