"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Plus, Play, Square, Activity, Download,
  Lock, CheckCircle2, Clock, Hash, Loader2,
  AlertCircle, X,
} from "lucide-react";

type SessionState = "LOCKED" | "ACTIVE" | "CLOSED";

interface TestInfo {
  id: string;
  topic: string;
  durationSeconds: number;
  _count?: { questions: number };
}

interface SessionItem {
  id: string;
  pinCode: string;
  state: SessionState;
  startedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  test: TestInfo;
  _count?: { responses: number };
}

interface TestOption {
  id: string;
  topic: string;
  class: { name: string; grade: string };
  _count: { questions: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, opts?: RequestInit) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  return res.json() as Promise<{ success: true; data: T } | { success: false; error: { code: string; message: string } }>;
}

function fmtDur(s: number) { return `${Math.floor(s / 60)} mnt`; }
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-slate-200", className)} />;
}

function SessionSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3.5 w-36" />
        </div>
        <Skeleton className="h-10 w-20 rounded-xl" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
    </div>
  );
}

// ─── State config ─────────────────────────────────────────────────────────────

const STATE: Record<SessionState, {
  label: string; Icon: React.ElementType;
  pill: string; stripe: string; card: string;
}> = {
  LOCKED: { label: "Terkunci", Icon: Lock, pill: "bg-slate-100 text-slate-600", stripe: "bg-slate-300", card: "" },
  ACTIVE: { label: "Aktif", Icon: Activity, pill: "bg-emerald-100 text-emerald-700", stripe: "bg-emerald-500", card: "ring-1 ring-emerald-300" },
  CLOSED: { label: "Selesai", Icon: CheckCircle2, pill: "bg-blue-100 text-blue-700", stripe: "bg-blue-400", card: "" },
};

function StatePill({ state }: { state: SessionState }) {
  const cfg = STATE[state];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", cfg.pill)}>
      <cfg.Icon className={cn("h-3 w-3", state === "ACTIVE" && "animate-pulse")} aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

// ─── Loading button ───────────────────────────────────────────────────────────

function ActionButton({
  onClick, disabled, loading, loadingText, children, variant = "primary",
}: {
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  children: React.ReactNode;
  variant?: "primary" | "danger" | "outline" | "ghost";
}) {
  const base = "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 min-h-[40px] disabled:cursor-not-allowed disabled:opacity-50";
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow-md active:scale-95",
    danger:  "border border-red-300 text-red-600 hover:bg-red-50 active:scale-95",
    outline: "border border-slate-300 text-slate-700 hover:bg-slate-50 active:scale-95",
    ghost:   "text-slate-600 hover:bg-slate-100 active:scale-95",
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled || loading} className={cn(base, variants[variant])}>
      {loading ? (<><Loader2 className="h-4 w-4 animate-spin" />{loadingText ?? "Memproses..."}</>) : children}
    </button>
  );
}

// ─── Create Session Dialog ────────────────────────────────────────────────────

function CreateSessionDialog({ onCreated, onClose }: { onCreated: (s: SessionItem) => void; onClose: () => void }) {
  const [tests, setTests] = useState<TestOption[]>([]);
  const [testId, setTestId] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingTests, setLoadingTests] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<TestOption[]>("/api/tests").then((r) => { if (r.success) setTests(r.data); setLoadingTests(false); });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await apiFetch<SessionItem>("/api/sessions", { method: "POST", body: JSON.stringify({ testId }) });
      if (!r.success) { setError(r.error.message); return; }
      onCreated(r.data);
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">Buat Sesi Ujian Baru</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="session-test" className="mb-1.5 block text-sm font-medium text-slate-700">Paket Soal</label>
            {loadingTests ? <Skeleton className="h-12 w-full" /> : (
              <select id="session-test" value={testId} onChange={(e) => setTestId(e.target.value)} required
                className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 min-h-[48px]">
                <option value="">— Pilih paket soal —</option>
                {tests.map((t) => <option key={t.id} value={t.id}>{t.topic} · Kelas {t.class.grade} {t.class.name} ({t._count.questions} soal)</option>)}
              </select>
            )}
          </div>
          <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-700">
            Sesi dibuat dalam status <strong>Terkunci</strong>. Aktifkan saat siap membagikan PIN ke siswa.
          </div>
          {error && <div role="alert" className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">Batal</button>
            <button type="submit" disabled={loading || !testId} className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Membuat...</> : "Buat Sesi"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Session Card ─────────────────────────────────────────────────────────────

function SessionCard({ session, onStateChange }: { session: SessionItem; onStateChange: (id: string, s: SessionState) => void }) {
  const [activating, setActivating] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cfg = STATE[session.state];

  async function handleActivate() {
    setActivating(true); setError(null);
    const r = await apiFetch<SessionItem>(`/api/sessions/${session.id}/activate`, { method: "POST" });
    if (r.success) onStateChange(session.id, "ACTIVE"); else setError(r.error.message);
    setActivating(false);
  }

  async function handleClose() {
    if (!confirm("Tutup sesi ini? Siswa tidak bisa lagi mengirim jawaban.")) return;
    setClosing(true); setError(null);
    const r = await apiFetch<SessionItem>(`/api/sessions/${session.id}/close`, { method: "POST" });
    if (r.success) onStateChange(session.id, "CLOSED"); else setError(r.error.message);
    setClosing(false);
  }

  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200", cfg.card)}>
      {/* State stripe */}
      <div className={cn("h-1 w-full", cfg.stripe)} aria-hidden="true" />

      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-slate-900 truncate">{session.test.topic}</h3>
              <StatePill state={session.state} />
            </div>
            <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1"><Hash className="h-3 w-3" />{session.test._count?.questions ?? 0} soal</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDur(session.test.durationSeconds)}</span>
              {(session._count?.responses ?? 0) > 0 && (
                <span className="flex items-center gap-1 text-emerald-600 font-medium">
                  <Activity className="h-3 w-3" />{session._count?.responses} respons
                </span>
              )}
            </div>
          </div>

          {/* PIN badge */}
          <div className="shrink-0 text-right">
            <div className={cn(
              "inline-flex items-center gap-1.5 rounded-xl px-4 py-2 font-mono font-bold text-xl tracking-widest shadow-sm",
              session.state === "ACTIVE"
                ? "bg-emerald-500 text-white shadow-emerald-200"
                : "bg-slate-100 text-slate-700"
            )} aria-label={`PIN: ${session.pinCode}`}>
              {session.pinCode}
            </div>
            <p className="mt-1 text-[11px] text-slate-400 text-center">PIN Sesi</p>
          </div>
        </div>

        {/* Timestamps */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400">
          <span>Dibuat {fmtDate(session.createdAt)}</span>
          {session.startedAt && <span className="text-emerald-600">Mulai {fmtDate(session.startedAt)}</span>}
          {session.closedAt && <span>Tutup {fmtDate(session.closedAt)}</span>}
        </div>

        {error && (
          <div role="alert" className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />{error}
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex flex-wrap gap-2">
          {session.state === "LOCKED" && (
            <ActionButton onClick={handleActivate} loading={activating} loadingText="Mengaktifkan...">
              <Play className="h-4 w-4" /> Aktifkan Sesi
            </ActionButton>
          )}

          {session.state === "ACTIVE" && (
            <>
              <Link href={`/dashboard/sessions/${session.id}/live`}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-95 transition-all">
                <Activity className="h-4 w-4" /> Live Heatmap
              </Link>
              <ActionButton onClick={handleClose} loading={closing} loadingText="Menutup..." variant="danger">
                <Square className="h-4 w-4" /> Tutup Sesi
              </ActionButton>
            </>
          )}

          {session.state === "CLOSED" && (
            <>
              <Link href={`/dashboard/sessions/${session.id}/results`}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-95 transition-all">
                <BarChart3Icon /> Lihat Hasil
              </Link>
              <a href={`/api/sessions/${session.id}/export/csv`} download
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 active:scale-95 transition-all">
                <Download className="h-4 w-4" /> Ekspor CSV
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BarChart3Icon() { return <BarChart3 className="h-4 w-4" />; }
import { BarChart3 } from "lucide-react";

// ─── Filter tabs ──────────────────────────────────────────────────────────────

const FILTERS = [
  { key: "ALL", label: "Semua" },
  { key: "ACTIVE", label: "Aktif" },
  { key: "LOCKED", label: "Terkunci" },
  { key: "CLOSED", label: "Selesai" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("ALL");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await apiFetch<SessionItem[]>("/api/sessions");
      if (r.success) setSessions(r.data); else setError(r.error.message);
    } catch { setError("Gagal memuat data."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleStateChange = useCallback((id: string, s: SessionState) => {
    setSessions((prev) => prev.map((x) => (x.id === id ? { ...x, state: s } : x)));
  }, []);

  const counts = sessions.reduce<Record<string, number>>((a, s) => { a[s.state] = (a[s.state] ?? 0) + 1; return a; }, {});
  const filtered = filter === "ALL" ? sessions : sessions.filter((s) => s.state === filter);
  const hasActive = sessions.some((s) => s.state === "ACTIVE");

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sesi Ujian</h1>
          <p className="mt-0.5 text-sm text-slate-500">Kelola sesi aktif, bagikan PIN ke siswa, pantau live.</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-95 transition-all min-h-[44px]">
          <Plus className="h-4 w-4" /> Buat Sesi
        </button>
      </div>

      {/* Active banner */}
      {hasActive && (
        <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 px-5 py-3.5">
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
          </span>
          <p className="text-sm font-medium text-emerald-800">
            Sesi sedang aktif — bagikan PIN ke siswa dan pantau via Live Heatmap.
          </p>
        </div>
      )}

      {/* Filter */}
      {!loading && sessions.length > 1 && (
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 w-fit">
          {FILTERS.map(({ key, label }) => (
            <button key={key} onClick={() => setFilter(key)}
              className={cn("px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-150",
                filter === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}>
              {label}{key !== "ALL" && counts[key] != null && <span className="ml-1 text-xs text-slate-400">({counts[key]})</span>}
            </button>
          ))}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <SessionSkeleton key={i} />)}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl bg-red-50 border border-red-200 p-4">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-500 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">{error}</p>
            <button onClick={load} className="mt-1 text-sm text-red-600 underline">Coba lagi</button>
          </div>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && sessions.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
            <PlayCircle className="h-8 w-8 text-slate-400" />
          </div>
          <p className="font-semibold text-slate-700">Belum ada sesi ujian</p>
          <p className="mt-1 text-sm text-slate-500">Buat sesi dari paket soal yang sudah ada.</p>
        </div>
      )}

      {/* Empty filter */}
      {!loading && !error && sessions.length > 0 && filtered.length === 0 && (
        <div className="py-10 text-center text-sm text-slate-500">Tidak ada sesi dengan status ini.</div>
      )}

      {/* List */}
      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-4">
          {filtered.map((s) => <SessionCard key={s.id} session={s} onStateChange={handleStateChange} />)}
        </div>
      )}

      {showCreate && (
        <CreateSessionDialog
          onCreated={(s) => { setSessions((p) => [s, ...p]); setShowCreate(false); }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

import { PlayCircle } from "lucide-react";
