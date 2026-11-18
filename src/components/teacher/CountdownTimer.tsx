"use client";

/**
 * CountdownTimer
 *
 * Displays a MM:SS countdown from startedAt + durationSeconds.
 * Updates every second via setInterval.
 * Shows "Sesi Berakhir" when the timer reaches 0.
 * Syncs with the server every 10 seconds by re-deriving remaining time
 * from the props (parent should refresh session data on its own interval).
 *
 * Props:
 *   startedAt        — ISO date string of when the session started, or null
 *   durationSeconds  — total duration (default 900 = 15 minutes)
 *   sessionState     — 'LOCKED' | 'ACTIVE' | 'CLOSED'
 */

import React, { useEffect, useState, useRef } from "react";

interface CountdownTimerProps {
  startedAt: string | Date | null;
  durationSeconds: number;
  sessionState: string;
}

function formatTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(safeSeconds / 60)
    .toString()
    .padStart(2, "0");
  const ss = (safeSeconds % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function getRemainingSeconds(
  startedAt: string | Date | null,
  durationSeconds: number
): number {
  if (!startedAt) return durationSeconds;
  const startMs =
    typeof startedAt === "string"
      ? new Date(startedAt).getTime()
      : startedAt.getTime();
  const endMs = startMs + durationSeconds * 1000;
  return (endMs - Date.now()) / 1000;
}

export default function CountdownTimer({
  startedAt,
  durationSeconds,
  sessionState,
}: CountdownTimerProps) {
  const [remainingSeconds, setRemainingSeconds] = useState<number>(() =>
    getRemainingSeconds(startedAt, durationSeconds)
  );

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Re-sync whenever parent refreshes the props (every ~10s)
  useEffect(() => {
    setRemainingSeconds(getRemainingSeconds(startedAt, durationSeconds));
  }, [startedAt, durationSeconds]);

  // Tick every second while session is ACTIVE
  useEffect(() => {
    if (sessionState !== "ACTIVE" || !startedAt) {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }

    tickRef.current = setInterval(() => {
      setRemainingSeconds(getRemainingSeconds(startedAt, durationSeconds));
    }, 1_000);

    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [startedAt, durationSeconds, sessionState]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (sessionState === "LOCKED") {
    return (
      <div
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-gray-100 text-gray-500 text-sm font-mono"
        aria-label="Sesi belum dimulai"
      >
        <span className="text-lg">⏱</span>
        <span>--:--</span>
        <span className="text-xs text-gray-400">Belum dimulai</span>
      </div>
    );
  }

  if (sessionState === "CLOSED" || remainingSeconds <= 0) {
    return (
      <div
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-red-50 text-red-600 text-sm font-mono"
        aria-label="Sesi berakhir"
      >
        <span className="text-lg">🔴</span>
        <span>00:00</span>
        <span className="text-xs font-medium">Sesi Berakhir</span>
      </div>
    );
  }

  const isUrgent = remainingSeconds <= 60;

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-mono transition-colors ${
        isUrgent
          ? "bg-red-50 text-red-700 animate-pulse"
          : "bg-green-50 text-green-700"
      }`}
      role="timer"
      aria-live="polite"
      aria-label={`Sisa waktu: ${formatTime(remainingSeconds)}`}
    >
      <span className="text-lg">{isUrgent ? "⚠️" : "⏱"}</span>
      <span className="tabular-nums text-base font-bold">
        {formatTime(remainingSeconds)}
      </span>
      {isUrgent && (
        <span className="text-xs font-medium">Segera berakhir</span>
      )}
    </div>
  );
}
