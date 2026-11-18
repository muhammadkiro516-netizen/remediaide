"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Plus, FileText, Clock, BookOpen, ChevronRight,
  AlertCircle, Loader2, X, Trash2,
} from "lucide-react";

interface ClassItem { id: string; name: string; grade: string; }
interface TestItem {
  id: string; topic: string; durationSeconds: number; createdAt: string;
  class: ClassItem; _count: { questions: number; sessions: number };
}

async function apiFetch<T>(url: string, opts?: RequestInit) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  return res.json() as Promise<{ success: true; data: T } | { success: false; error: { code: string; message: string } }>;
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-slate-200", className)} />;
}

function TestSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3.5 w-56" />
        </div>
        <Skeleton className="h-9 w-28 rounded-xl" />
      </div>
    </div>
  );
}

function parseCustomMinutes(raw: string): {
  valid: boolean;
  minutes: number | null;
  error: string | null;
} {
  if (raw === "" || raw === null) return { valid: false, minutes: null, error: null };
  const num = parseFloat(raw);
  if (isNaN(num)) return { valid: false, minutes: null, error: null };
  const rounded = Math.round(num);
  if (rounded < 1) return { valid: false, minutes: null, error: "Minimal 1 menit" };
  if (rounded > 180) return { valid: false, minutes: null, error: "Maksimal 180 menit (3 jam)" };
  return { valid: true, minutes: rounded, error: null };
}

function CreateTestDialog({ onCreated, onClose }: { onCreated: (t: TestItem) => void; onClose: () => void }) {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classId, setClassId] = useState("");
  const [topic, setTopic] = useState("");
  const [duration, setDuration] = useState(900);
  const [loading, setLoading] = useState(false);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCustom, setIsCustom] = useState(false);
  const [customMinutes, setCustomMinutes] = useState("");

  useEffect(() => {
    apiFetch<ClassItem[]>("/api/classes").then((r) => { if (r.success) setClasses(r.data); setLoadingClasses(false); });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      const r = await apiFetch<TestItem>("/api/tests", { method: "POST", body: JSON.stringify({ classId, topic, durationSeconds: duration }) });
      if (!r.success) { setError(r.error.message); return; }
      onCreated(r.data);
    } finally { setLoading(false); }
  }

  function handleSelectPreset(value: number) {
    setIsCustom(false);
    setCustomMinutes("");
    setDuration(value);
  }

  function handleSelectCustom() {
    setIsCustom(true);
  }

  function handleCustomChange(raw: string) {
    setCustomMinutes(raw);
    const { valid, minutes } = parseCustomMinutes(raw);
    if (valid && minutes !== null) {
      setDuration(minutes * 60);
    }
  }

  const durationOptions = [
    { label: "2 menit", value: 120, isDemo: true },
    { label: "3 menit", value: 180, isDemo: true },
    { label: "10 menit", value: 600 },
    { label: "15 menit", value: 900 },
    { label: "20 menit", value: 1200 },
    { label: "30 menit", value: 1800 },
    { label: "45 menit", value: 2700 },
    { label: "60 menit", value: 3600 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">Buat Paket Soal Baru</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="test-class" className="mb-1.5 block text-sm font-medium text-slate-700">Kelas</label>
            {loadingClasses ? <Skeleton className="h-12 w-full" /> : (
              <select id="test-class" value={classId} onChange={(e) => setClassId(e.target.value)} required
                className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 min-h-[48px]">
                <option value="">— Pilih kelas —</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.grade} — {c.name}</option>)}
              </select>
            )}
          </div>
          <div>
            <label htmlFor="test-topic" className="mb-1.5 block text-sm font-medium text-slate-700">Topik / Judul</label>
            <input id="test-topic" type="text" value={topic} onChange={(e) => setTopic(e.target.value)}
              placeholder="Contoh: Hukum Newton, KPK dan FPB..." required
              className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 min-h-[48px]" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Durasi</label>
            <div className="grid grid-cols-3 gap-2">
              {durationOptions.map((d) => (
                <button key={d.value} type="button" onClick={() => handleSelectPreset(d.value)}
                  className={cn("rounded-xl border-2 py-2 text-sm font-medium transition-all flex flex-col items-center gap-0.5",
                    !isCustom && duration === d.value
                      ? "border-blue-400 bg-blue-50 text-blue-700"
                      : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50")}>
                  <span>{d.label}</span>
                  {d.isDemo && (
                    <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 rounded-full leading-tight">
                      ⚡ Demo
                    </span>
                  )}
                </button>
              ))}
              <button
                type="button"
                onClick={handleSelectCustom}
                className={cn(
                  "rounded-xl border-2 py-2.5 text-sm font-medium transition-all",
                  isCustom
                    ? "border-blue-400 bg-blue-50 text-blue-700"
                    : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                )}
              >
                Custom
              </button>
            </div>
            {isCustom && (
              <div className="mt-2 space-y-1">
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={customMinutes}
                  onChange={(e) => handleCustomChange(e.target.value)}
                  placeholder="1 – 180 menit"
                  className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 min-h-[48px]"
                />
                {customMinutes !== "" && parseCustomMinutes(customMinutes).error && (
                  <p className="text-xs text-red-600">{parseCustomMinutes(customMinutes).error}</p>
                )}
              </div>
            )}
          </div>
          {error && <div role="alert" className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">Batal</button>
            <button type="submit" disabled={loading || !classId || !topic || (isCustom && !parseCustomMinutes(customMinutes).valid)} className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Menyimpan...</> : "Simpan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Test Card ────────────────────────────────────────────────────────────────

function TestCard({ test, onDelete }: { test: TestItem; onDelete: (id: string) => void }) {
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDeleteTest() {
    setDeleting(true);
    setDeleteError(null);
    const r = await apiFetch<{ id: string }>(`/api/tests/${test.id}`, { method: "DELETE" });
    if (r.success) {
      onDelete(test.id);
    } else {
      setDeleteError(r.error?.message ?? "Gagal menghapus paket soal.");
    }
    setDeleting(false);
  }

  return (
    <div className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
            <FileText className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900 truncate">{test.topic}</h3>
            <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
              <span>{test.class.grade} — {test.class.name}</span>
              <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" />{test._count.questions} soal</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{Math.floor(test.durationSeconds / 60)} mnt</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {deleteConfirm ? (
            <button
              type="button"
              onClick={() => handleDeleteTest()}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Konfirmasi
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { setDeleteConfirm(true); setDeleteError(null); setTimeout(() => setDeleteConfirm(false), 3000); }}
              className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
              aria-label={`Hapus paket soal ${test.topic}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <Link href={`/dashboard/tests/${test.id}/questions`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 active:scale-95 transition-all group-hover:border-blue-200">
            Kelola Soal <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
      {deleteError && (
        <p role="alert" className="mt-2 text-sm text-red-600">{deleteError}</p>
      )}
    </div>
  );
}

export default function TestsPage() {
  const [tests, setTests] = useState<TestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await apiFetch<TestItem[]>("/api/tests");
      if (r.success) setTests(r.data); else setError(r.error.message);
    } catch { setError("Gagal memuat data."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Paket Soal</h1>
          <p className="mt-0.5 text-sm text-slate-500">Buat dan kelola bank soal untuk setiap kelas.</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-95 transition-all min-h-[44px]">
          <Plus className="h-4 w-4" /> Buat Paket Soal
        </button>
      </div>

      {/* Loading */}
      {loading && <div className="space-y-3">{[1, 2, 3].map((i) => <TestSkeleton key={i} />)}</div>}

      {/* Error */}
      {!loading && error && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl bg-red-50 border border-red-200 p-4">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-500 mt-0.5" />
          <div><p className="font-medium text-red-800">{error}</p><button onClick={load} className="mt-1 text-sm text-red-600 underline">Coba lagi</button></div>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && tests.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
            <FileText className="h-8 w-8 text-slate-400" />
          </div>
          <p className="font-semibold text-slate-700">Belum ada paket soal</p>
          <p className="mt-1 text-sm text-slate-500">Buat paket soal pertama untuk mulai ujian.</p>
        </div>
      )}

      {/* List */}
      {!loading && !error && tests.length > 0 && (
        <div className="space-y-3">
          {tests.map((t) => (
            <TestCard key={t.id} test={t} onDelete={(id) => setTests((p) => p.filter((x) => x.id !== id))} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateTestDialog
          onCreated={(t) => { setTests((p) => [t, ...p]); setShowCreate(false); }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
