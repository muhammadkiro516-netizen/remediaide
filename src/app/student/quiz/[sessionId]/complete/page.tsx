"use client";

/**
 * Student Quiz Complete Page — Modern redesign
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function QuizCompletePage() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    if (countdown <= 0) {
      router.push("/student/join");
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-100 px-4">
      {/* Decorative blobs */}
      <div aria-hidden className="pointer-events-none fixed -top-32 -right-32 h-96 w-96 rounded-full bg-emerald-200/40 blur-3xl" />
      <div aria-hidden className="pointer-events-none fixed -bottom-32 -left-32 h-96 w-96 rounded-full bg-teal-200/40 blur-3xl" />

      <div className="relative w-full max-w-sm">
        {/* Card */}
        <div className="relative overflow-hidden rounded-3xl bg-white px-8 pb-8 pt-10 shadow-2xl shadow-emerald-900/10 text-center">
          {/* Top gradient bar */}
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400" aria-hidden />

          {/* Success checkmark */}
          <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 shadow-xl shadow-emerald-200">
            <svg className="h-12 w-12 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          {/* Brand */}
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-emerald-600">RemediAide</p>

          {/* Main message */}
          <h1 className="text-2xl font-extrabold text-slate-900">Kuis Selesai! 🎉</h1>
          <p className="mt-2 text-base text-slate-600">Semua jawaban kamu berhasil dikirim.</p>

          <div className="my-6 h-px bg-slate-100" aria-hidden />

          {/* Info */}
          <div className="rounded-2xl bg-slate-50 px-5 py-4 text-sm text-slate-600 text-left space-y-2">
            <p className="flex items-center gap-2">
              <span className="text-base">⏳</span>
              Tunggu instruksi dari gurumu untuk langkah selanjutnya.
            </p>
            <p className="flex items-center gap-2">
              <span className="text-base">🔒</span>
              Data kamu tersimpan dengan aman dan anonim.
            </p>
          </div>

          {/* Countdown and back button */}
          <p className="mt-6 text-sm text-slate-500">
            Kembali otomatis dalam{" "}
            <span className="font-semibold text-emerald-600">{countdown}</span> detik
          </p>

          <button
            onClick={() => router.push("/student/join")}
            className="mt-4 w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-600 active:scale-95"
          >
            Kembali ke Halaman Awal
          </button>
        </div>
      </div>
    </div>
  );
}
