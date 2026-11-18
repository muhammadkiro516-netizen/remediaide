"use client";

/**
 * Results Page — Daftar sesi selesai untuk dipilih guru.
 *
 * Menampilkan semua sesi CLOSED → klik → navigasi ke
 * /dashboard/sessions/[id]/results yang sudah punya ResultsClient lengkap.
 *
 * Juga menampilkan statistik singkat per sesi (jumlah respons, status agregat)
 * langsung dari API diagnoses.
 */

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type FinalStatus =
  | "PAHAM_KONSEP"
  | "LUCKY_GUESS"
  | "MISKONSEPSI"
  | "TIDAK_PAHAM"
  | "INSUFFICIENT_DATA";

interface SessionSummary {
  id: string;
  pinCode: string;
  state: string;
  closedAt: string | null;
  createdAt: string;
  test: {
    topic: string;
    durationSeconds: number;
    _count?: { questions: number };
  };
  _count?: { responses: number; diagnoses?: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<FinalStatus, { label: string; bg: string; text: string }> = {
  PAHAM_KONSEP:      { label: "Paham",      bg: "bg-green-700",  text: "text-white" },
  LUCKY_GUESS:       { label: "Lucky",      bg: "bg-yellow-600", text: "text-white" },
  MISKONSEPSI:       { label: "Miskonsepsi",bg: "bg-red-700",    text: "text-white" },
  TIDAK_PAHAM:       { label: "Tdk Paham",  bg: "bg-blue-900",   text: "text-white" },
  INSUFFICIENT_DATA: { label: "Kurang",     bg: "bg-gray-400",   text: "text-white" },
};

async function apiFetch<T>(url: string): Promise<{ success: true; data: T } | { success: false; error: { message: string } }> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
  return res.json();
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Mini status bar per sesi ─────────────────────────────────────────────────

function StatusBar({ sessionId }: { sessionId: string }) {
  const [counts, setCounts] = useState<Partial<Record<FinalStatus, number>> | null>(null);

  useEffect(() => {
    apiFetch<Array<{ finalStatus: FinalStatus }>>(`/api/sessions/${sessionId}/diagnoses`)
      .then((r) => {
        if (!r.success) return;
        const tally: Partial<Record<FinalStatus, number>> = {};
        for (const d of r.data) {
          tally[d.finalStatus] = (tally[d.finalStatus] ?? 0) + 1;
        }
        setCounts(tally);
      });
  }, [sessionId]);

  if (!counts) return <div className="h-4 bg-gray-100 animate-pulse rounded-full w-full" />;

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return <p className="text-xs text-gray-400">Belum ada data diagnosis.</p>;

  return (
    <div className="space-y-1.5">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
        {(Object.entries(counts) as [FinalStatus, number][]).map(([status, count]) => {
          const pct = (count / total) * 100;
          const cfg = STATUS_CONFIG[status];
          return (
            <div
              key={status}
              className={cfg.bg}
              style={{ width: `${pct}%` }}
              title={`${cfg.label}: ${count}`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {(Object.entries(counts) as [FinalStatus, number][]).map(([status, count]) => {
          const cfg = STATUS_CONFIG[status];
          return (
            <span key={status} className="text-xs text-gray-600 flex items-center gap-1">
              <span className={`inline-block h-2 w-2 rounded-full ${cfg.bg}`} />
              {cfg.label}: {count}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Session result card ──────────────────────────────────────────────────────

function ResultCard({ session }: { session: SessionSummary }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{session.test.topic}</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            PIN: <span className="font-mono font-medium">{session.pinCode}</span>
            &nbsp;&middot;&nbsp;{session.test._count?.questions ?? 0} soal
            &nbsp;&middot;&nbsp;{session._count?.responses ?? 0} respons
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Selesai: {formatDate(session.closedAt)}
          </p>
        </div>

        <div className="flex flex-col gap-2 flex-shrink-0">
          <Link
            href={`/dashboard/sessions/${session.id}/results`}
            className="min-h-[40px] px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            📊 Buka Hasil
          </Link>
          <a
            href={`/api/sessions/${session.id}/export/csv`}
            download
            className="min-h-[36px] px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 text-xs font-medium hover:bg-gray-50 transition-colors flex items-center gap-1.5 justify-center"
          >
            ⬇ CSV
          </a>
        </div>
      </div>

      {/* Status bar — always show for CLOSED sessions, StatusBar itself handles empty state */}
      <StatusBar sessionId={session.id} />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ResultsPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<SessionSummary[]>("/api/sessions");
      if (result.success) {
        // Only show CLOSED sessions on results page
        setSessions(result.data.filter((s) => s.state === "CLOSED"));
      } else {
        setError(result.error.message);
      }
    } catch {
      setError("Gagal memuat data. Periksa koneksi Anda.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Hasil Diagnosis</h1>
        <p className="text-sm text-gray-500 mt-1">
          Pilih sesi selesai untuk melihat matriks diagnosis, kelompok remedial, dan mengunduh LKPD.
        </p>
      </div>

      {/* Legend */}
      <div className="mb-5 flex flex-wrap gap-3 items-center">
        <span className="text-xs text-gray-500 font-medium">Status kognitif:</span>
        {(Object.entries(STATUS_CONFIG) as [FinalStatus, typeof STATUS_CONFIG[FinalStatus]][]).map(
          ([status, cfg]) => (
            <span key={status} className="inline-flex items-center gap-1.5 text-xs text-gray-600">
              <span className={`h-2.5 w-2.5 rounded-full ${cfg.bg}`} />
              {cfg.label}
            </span>
          )
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3" aria-live="polite">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-gray-100 animate-pulse rounded-xl" />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
          <p className="font-medium">Terjadi kesalahan</p>
          <p className="text-sm mt-1">{error}</p>
          <button type="button" onClick={loadSessions} className="mt-2 text-sm underline">
            Coba lagi
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && sessions.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-5xl mb-3" aria-hidden="true">📂</p>
          <p className="text-lg font-medium">Belum ada sesi selesai</p>
          <p className="text-sm mt-1">
            Tutup sesi aktif terlebih dahulu untuk melihat hasil diagnosisnya.
          </p>
          <Link
            href="/dashboard/sessions"
            className="mt-4 inline-block px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Kelola Sesi →
          </Link>
        </div>
      )}

      {/* Results list */}
      {!loading && !error && sessions.length > 0 && (
        <div className="space-y-4">
          {sessions.map((s) => (
            <ResultCard key={s.id} session={s} />
          ))}
        </div>
      )}
    </div>
  );
}
