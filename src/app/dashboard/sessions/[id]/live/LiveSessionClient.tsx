"use client";

/**
 * LiveSessionClient
 *
 * Client component for the live session page.
 * Manages:
 *   - LiveHeatmap (SSE / polling)
 *   - CountdownTimer (syncs with server via periodic refetch)
 *   - Activate / Close session action buttons
 *   - Auto-refresh of session state every 10 seconds
 */

import React, { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import LiveHeatmap from "@/components/teacher/LiveHeatmap";
import CountdownTimer from "@/components/teacher/CountdownTimer";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionInfo {
  id: string;
  state: "LOCKED" | "ACTIVE" | "CLOSED";
  pinCode: string;
  startedAt: string | null;
  closedAt: string | null;
  test: {
    topic: string;
    durationSeconds: number;
    _count: { questions: number };
  };
}

interface LiveSessionClientProps {
  initialSession: SessionInfo;
}

// ─── State badge ──────────────────────────────────────────────────────────────

function StateBadge({ state }: { state: string }) {
  const map: Record<string, string> = {
    LOCKED: "bg-gray-100 text-gray-700",
    ACTIVE: "bg-green-100 text-green-800",
    CLOSED: "bg-red-100 text-red-700",
  };
  const label: Record<string, string> = {
    LOCKED: "Terkunci",
    ACTIVE: "Aktif",
    CLOSED: "Ditutup",
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${map[state] ?? "bg-gray-100 text-gray-600"}`}
    >
      {label[state] ?? state}
    </span>
  );
}

// ─── PIN display (masked by default) ─────────────────────────────────────────

function PinDisplay({ pin }: { pin: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-lg font-semibold tracking-widest text-gray-800">
        {revealed ? pin : "••••••"}
      </span>
      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        className="text-xs text-blue-600 hover:text-blue-800 underline"
        aria-label={revealed ? "Sembunyikan PIN" : "Tampilkan PIN"}
      >
        {revealed ? "Sembunyikan" : "Tampilkan"}
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LiveSessionClient({
  initialSession,
}: LiveSessionClientProps) {
  const router = useRouter();
  const [session, setSession] = useState<SessionInfo>(initialSession);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // ── Refresh session state every 10s ────────────────────────────────────────
  useEffect(() => {
    // Only poll while ACTIVE — CLOSED sessions don't change
    if (session.state !== "ACTIVE") return;

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/sessions/${session.id}`);
        if (!res.ok) return;
        const json = (await res.json()) as { success: boolean; data: SessionInfo };
        if (json.success) setSession(json.data);
      } catch {
        // Ignore network errors — the timer will retry
      }
    }, 10_000);

    return () => clearInterval(timer);
  }, [session.id, session.state]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function handleActivate() {
    setActionError(null);
    try {
      const res = await fetch(`/api/sessions/${session.id}/activate`, {
        method: "POST",
      });
      const json = (await res.json()) as { success: boolean; data?: SessionInfo; error?: { message: string } };
      if (json.success && json.data) {
        setSession(json.data as SessionInfo);
        // Refresh the page so server-fetched data re-validates
        startTransition(() => router.refresh());
      } else {
        setActionError(json.error?.message ?? "Gagal mengaktifkan sesi.");
      }
    } catch {
      setActionError("Terjadi kesalahan jaringan. Coba lagi.");
    }
  }

  async function handleClose() {
    if (!confirm("Tutup sesi sekarang? Tindakan ini tidak dapat dibatalkan.")) return;
    setActionError(null);
    try {
      const res = await fetch(`/api/sessions/${session.id}/close`, {
        method: "POST",
      });
      const json = (await res.json()) as { success: boolean; data?: SessionInfo; error?: { message: string } };
      if (json.success && json.data) {
        setSession(json.data as SessionInfo);
        startTransition(() => router.refresh());
      } else {
        setActionError(json.error?.message ?? "Gagal menutup sesi.");
      }
    } catch {
      setActionError("Terjadi kesalahan jaringan. Coba lagi.");
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Session info card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">
                {session.test.topic}
              </h1>
              <StateBadge state={session.state} />
            </div>
            <p className="text-sm text-gray-500">
              {session.test._count.questions} soal &bull; Durasi{" "}
              {Math.floor(session.test.durationSeconds / 60)} menit
            </p>
          </div>

          <div className="space-y-1 text-right">
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">
              Kode PIN
            </div>
            <PinDisplay pin={session.pinCode} />
          </div>
        </div>

        {/* Timer row */}
        <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
          <CountdownTimer
            startedAt={session.startedAt}
            durationSeconds={session.test.durationSeconds}
            sessionState={session.state}
          />

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            {session.state === "LOCKED" && (
              <button
                type="button"
                onClick={handleActivate}
                disabled={isPending}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
                aria-label="Mulai sesi ujian"
              >
                {isPending ? "Memproses..." : "▶ Mulai Sesi"}
              </button>
            )}

            {session.state === "ACTIVE" && (
              <button
                type="button"
                onClick={handleClose}
                disabled={isPending}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
                aria-label="Tutup sesi ujian"
              >
                {isPending ? "Memproses..." : "■ Tutup Sesi"}
              </button>
            )}

            {session.state === "CLOSED" && (
              <a
                href={`/dashboard/sessions/${session.id}/results`}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors min-h-[44px] flex items-center"
              >
                Lihat Hasil →
              </a>
            )}
          </div>
        </div>

        {/* Error message */}
        {actionError && (
          <div
            role="alert"
            className="mt-3 text-sm text-red-600 bg-red-50 rounded-md px-3 py-2"
          >
            {actionError}
          </div>
        )}
      </div>

      {/* Live Heatmap */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <LiveHeatmap
          sessionId={session.id}
          sessionState={session.state}
          totalQuestions={session.test._count.questions}
        />
      </div>

      {/* Quick-nav back to sessions list */}
      <div className="text-center">
        <a
          href="/dashboard/sessions"
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          ← Kembali ke daftar sesi
        </a>
      </div>
    </div>
  );
}
