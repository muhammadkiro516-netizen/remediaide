"use client";

/**
 * Student Join Page — Portal Siswa
 * Desain: Playful, friendly, mobile-first, warna hijau/teal energik
 * Step 1: Masukkan PIN 6 digit
 * Step 2: Pilih nama dari daftar kelas
 */

import { signIn, getSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useState, useEffect } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { KeyRound, Users, ArrowRight, RotateCcw, CheckCircle2, Loader2, BookOpen, Sparkles } from "lucide-react";

interface StudentOption {
  id: string;
  anonymousLabel: string;
}

interface JoinResponse {
  success: boolean;
  data?: {
    sessionPinId: string;
    schoolId: string;
    studentId: string | null;
    anonymousLabel: string | null;
    students: StudentOption[] | null;
    message: string;
  };
  error?: {
    code: string;
    message: string;
    retryAfterMs?: number;
  };
}

export default function StudentJoinPage() {
  const router = useRouter();
  const [step, setStep] = useState<"pin" | "select">("pin");
  const [pinCode, setPinCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const [sessionPinId, setSessionPinId] = useState("");
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    if (retryAfterSeconds <= 0) return;
    const timer = setInterval(() => {
      setRetryAfterSeconds((prev) => {
        if (prev <= 1) { setError(null); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [retryAfterSeconds]);

  const handlePinSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || retryAfterSeconds > 0) return;
    if (!/^\d{6}$/.test(pinCode)) { setError("PIN harus 6 angka"); return; }
    setIsSubmitting(true);
    setError(null);
    try {
      // Retry logic: max 3 attempts, 500ms delay, only for 5xx or network errors
      let res: Response | null = null;
      let lastNetworkError: Error | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          res = await fetch("/api/student/join", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pinCode, studentId: "" }),
          });
          if (res.status < 500) break; // don't retry 4xx or success
          if (attempt < 2) await new Promise((r) => setTimeout(r, 500));
        } catch (networkErr) {
          lastNetworkError = networkErr as Error;
          if (attempt < 2) await new Promise((r) => setTimeout(r, 500));
        }
      }
      if (!res) {
        setError("Terjadi kesalahan jaringan. Coba lagi.");
        return;
      }
      const json: JoinResponse = await res.json();
      if (!res.ok || !json.success) {
        if (json.error?.code === "RATE_LIMITED" && json.error.retryAfterMs) {
          setRetryAfterSeconds(Math.ceil(json.error.retryAfterMs / 1000));
          setError(json.error.message ?? "Terlalu banyak percobaan");
        } else {
          setError("PIN tidak valid atau sesi belum dimulai. Tanyakan gurumu.");
        }
        return;
      }
      setSessionPinId(json.data!.sessionPinId);
      setStudents(json.data!.students ?? []);
      setStep("select");
    } catch {
      setError("Terjadi kesalahan jaringan. Coba lagi.");
    } finally {
      setIsSubmitting(false);
    }
  }, [pinCode, isSubmitting, retryAfterSeconds]);

  const handleSelectSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId || isSigningIn) return;
    setIsSigningIn(true);
    setError(null);
    try {
      const confirmRes = await fetch("/api/student/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinCode, studentId: selectedStudentId }),
      });
      const confirmJson: JoinResponse = await confirmRes.json();
      if (!confirmRes.ok || !confirmJson.success) {
        setError(confirmJson.error?.message ?? "Gagal verifikasi. Coba lagi.");
        setIsSigningIn(false);
        return;
      }
      const signInRes = await signIn("student-pin", { pinCode, studentId: selectedStudentId, redirect: false });
      if (!signInRes || signInRes.error) {
        setError("Gagal membuat sesi. Hubungi gurumu.");
        setIsSigningIn(false);
        return;
      }
      // Wait for session cookie to be set before navigating (prevents race condition)
      await new Promise((resolve) => setTimeout(resolve, 300));
      const session = await getSession();
      if (!session) {
        // Session not ready yet — wait a bit longer before navigating
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      router.push(`/student/quiz/${sessionPinId}`);
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
      setIsSigningIn(false);
    }
  }, [selectedStudentId, isSigningIn, pinCode, sessionPinId, router]);

  const isDisabled = isSubmitting || retryAfterSeconds > 0;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 px-4 py-8">
      {/* Decorative blobs */}
      <div aria-hidden className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-emerald-300/20 blur-3xl" />

      {/* Back link */}
      <Link href="/" className="absolute top-6 left-6 flex items-center gap-1.5 rounded-full bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm hover:bg-white/30 transition-colors">
        ← Beranda
      </Link>

      {/* Card */}
      <div className="relative w-full max-w-md">
        {/* Top accent bar */}
        <div className="h-2 w-full rounded-t-3xl bg-gradient-to-r from-emerald-300 to-teal-200" />
        <div className="rounded-b-3xl rounded-t-none bg-white px-8 pb-8 pt-8 shadow-2xl shadow-emerald-900/20">

          {/* Header */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-200">
              <BookOpen className="h-10 w-10 text-white" />
            </div>
            <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
              <Sparkles className="h-3 w-3" />
              Zero-Registration · UU PDP Compliant
            </div>
            <h1 className="mt-3 text-2xl font-extrabold text-slate-900">Portal Siswa</h1>
            <p className="mt-1.5 text-sm text-slate-500">
              {step === "pin"
                ? "Masukkan PIN 6 digit yang diberikan oleh gurumu untuk bergabung ke sesi tes."
                : "Sesi ditemukan! Sekarang pilih namamu dari daftar kelas."}
            </p>
          </div>

          {/* Step indicator */}
          <div className="mb-6 flex items-center justify-center gap-2">
            <div className={cn("flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all", step === "pin" ? "bg-emerald-500 text-white" : "bg-emerald-100 text-emerald-600")}>
              {step === "select" ? <CheckCircle2 className="h-4 w-4" /> : "1"}
            </div>
            <div className={cn("h-0.5 w-10 rounded-full transition-all", step === "select" ? "bg-emerald-500" : "bg-slate-200")} />
            <div className={cn("flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all", step === "select" ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-400")}>
              2
            </div>
          </div>

          {/* STEP 1: PIN */}
          {step === "pin" && (
            <form onSubmit={handlePinSubmit} className="space-y-5">
              <div>
                <label htmlFor="pinCode" className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <KeyRound className="h-4 w-4 text-emerald-500" />
                  PIN Sesi (6 angka)
                </label>
                <input
                  id="pinCode"
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={pinCode}
                  onChange={(e) => { setPinCode(e.target.value.replace(/\D/g, "")); setError(null); }}
                  disabled={isDisabled}
                  placeholder="· · · · · ·"
                  className={cn(
                    "w-full rounded-2xl border-2 px-4 py-4 text-center text-3xl font-bold tracking-[0.5em] text-slate-900 transition-all",
                    "placeholder:text-2xl placeholder:tracking-[0.4em] placeholder:text-slate-300",
                    "focus:outline-none focus:ring-4 focus:ring-emerald-200",
                    "disabled:cursor-not-allowed disabled:bg-slate-50",
                    error ? "border-red-400 bg-red-50" : "border-slate-200 bg-slate-50 focus:border-emerald-400 focus:bg-white"
                  )}
                  autoFocus
                  autoComplete="off"
                />
                {/* PIN dots visual */}
                <div className="mt-2 flex justify-center gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className={cn("h-2 w-2 rounded-full transition-all", i < pinCode.length ? "bg-emerald-500 scale-125" : "bg-slate-200")} />
                  ))}
                </div>
              </div>

              {error && (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <span className="mt-0.5 text-base">⚠️</span>
                  <span>{error}{retryAfterSeconds > 0 && <strong className="ml-1">(tunggu {retryAfterSeconds}s)</strong>}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isDisabled || pinCode.length !== 6}
                className={cn(
                  "flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-bold text-white shadow-lg transition-all",
                  isDisabled || pinCode.length !== 6
                    ? "cursor-not-allowed bg-slate-300"
                    : "bg-gradient-to-r from-emerald-500 to-teal-600 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-200 active:scale-[0.98]"
                )}
              >
                {isSubmitting ? <><Loader2 className="h-5 w-5 animate-spin" />Memeriksa PIN...</>
                  : retryAfterSeconds > 0 ? `Tunggu ${retryAfterSeconds} detik`
                  : <>Lanjut <ArrowRight className="h-5 w-5" /></>}
              </button>
            </form>
          )}

          {/* STEP 2: Pilih nama */}
          {step === "select" && (
            <form onSubmit={handleSelectSubmit} className="space-y-4">
              <div>
                <label className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Users className="h-4 w-4 text-emerald-500" />
                  Pilih namamu dari daftar:
                </label>
                {students.length === 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Tidak ada nama terdaftar. Hubungi gurumu.
                  </div>
                ) : (
                  <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                    {students.map((s) => {
                      const isSelected = selectedStudentId === s.id;
                      return (
                        <label key={s.id} className={cn(
                          "flex min-h-[52px] cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 transition-all",
                          isSelected ? "border-emerald-400 bg-emerald-50 shadow-sm" : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/50"
                        )}>
                          <input type="radio" name="studentId" value={s.id} checked={isSelected} onChange={() => setSelectedStudentId(s.id)} className="sr-only" />
                          <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all", isSelected ? "border-emerald-500 bg-emerald-500" : "border-slate-300")}>
                            {isSelected && <span className="h-2 w-2 rounded-full bg-white" />}
                          </span>
                          <span className="font-mono text-sm font-semibold text-slate-800">{s.anonymousLabel}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {error && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setStep("pin"); setError(null); setSelectedStudentId(null); }}
                  className="flex min-h-[52px] flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-slate-200 text-sm font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-colors">
                  <RotateCcw className="h-4 w-4" /> Ganti PIN
                </button>
                <button type="submit" disabled={!selectedStudentId || isSigningIn || students.length === 0}
                  className={cn(
                    "flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl text-sm font-bold text-white shadow-lg transition-all",
                    !selectedStudentId || isSigningIn || students.length === 0
                      ? "cursor-not-allowed bg-slate-300"
                      : "bg-gradient-to-r from-emerald-500 to-teal-600 hover:-translate-y-0.5 hover:shadow-emerald-200"
                  )}>
                  {isSigningIn ? <><Loader2 className="h-4 w-4 animate-spin" />Masuk...</> : <>Masuk <ArrowRight className="h-4 w-4" /></>}
                </button>
              </div>
            </form>
          )}

          <p className="mt-6 text-center text-xs text-slate-400">
            {step === "pin" ? "Tidak perlu akun atau email — datamu dilindungi UU PDP" : `PIN sesi: ${pinCode}`}
          </p>
        </div>
      </div>
    </div>
  );
}
