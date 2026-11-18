"use client";

/**
 * Admin Login Page — Portal Tim RemediAide (Super-Admin)
 * Desain: Dark/security-first, monokrom slate dengan aksen merah subtle
 * Hanya untuk internal Tim RemediAide — bukan untuk umum
 */

import { signIn, getSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useState, useCallback, Suspense } from "react";
import Link from "next/link";
import {
  ShieldCheck, Mail, Lock, ArrowRight, Eye, EyeOff,
  Loader2, AlertTriangle, Server, Globe, Building2, Key,
} from "lucide-react";

const systemStats = [
  { icon: Server, label: "Platform aktif", value: "99.9% uptime" },
  { icon: Globe, label: "Isolasi tenant", value: "Per Sekolah" },
  { icon: Building2, label: "Manajemen", value: "Multi-Sekolah" },
  { icon: Key, label: "Akses", value: "Terenkripsi" },
];

function AdminLoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/admin/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || attempts >= 5) return;
    setIsLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
    });

    if (!result || result.error) {
      setAttempts((a) => a + 1);
      setError(attempts >= 4
        ? "Terlalu banyak percobaan gagal. Akses diblokir sementara."
        : "Kredensial tidak valid. Akses ditolak.");
      setIsLoading(false);
      return;
    }

    const session = await getSession();
    if (session?.role !== "SUPERADMIN") {
      setError("Akun ini tidak memiliki hak akses administrator.");
      setIsLoading(false);
      return;
    }

    window.location.href = callbackUrl;
  }, [email, password, isLoading, callbackUrl, attempts]);

  const isLocked = attempts >= 5;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-12">
      {/* Subtle grid background */}
      <div aria-hidden className="pointer-events-none fixed inset-0"
        style={{ backgroundImage: "linear-gradient(rgba(148,163,184,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.04) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />

      {/* Top status bar */}
      <div className="relative mb-8 flex items-center gap-6 rounded-full border border-slate-700/60 bg-slate-900/80 px-5 py-2 backdrop-blur">
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500" />
          System Online
        </span>
        <span className="text-slate-700">|</span>
        <span className="text-xs text-slate-500">RemediAide Control Panel</span>
        <span className="text-slate-700">|</span>
        <span className="text-xs text-slate-500">Internal Access Only</span>
      </div>

      <div className="relative w-full max-w-md">
        {/* Security warning banner */}
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-800/40 bg-amber-950/30 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-xs leading-relaxed text-amber-400/80">
            Area terbatas. Akses tidak sah ke sistem ini melanggar kebijakan keamanan
            dan dapat ditindaklanjuti secara hukum. Semua aktivitas login dicatat dan dipantau.
          </p>
        </div>

        {/* Main card */}
        <div className="overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl shadow-black/50">
          {/* Top accent */}
          <div className="h-1 w-full bg-gradient-to-r from-slate-600 via-red-600/60 to-slate-600" />

          <div className="px-8 py-8">
            {/* Header */}
            <div className="mb-8 flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800">
                <ShieldCheck className="h-7 w-7 text-slate-300" />
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Super-Admin Access
                </div>
                <h1 className="text-xl font-bold text-white">Control Panel</h1>
                <p className="mt-0.5 text-xs text-slate-500">
                  Tim Internal RemediAide · Tidak untuk umum
                </p>
              </div>
            </div>

            {/* System stats mini grid */}
            <div className="mb-7 grid grid-cols-4 gap-2">
              {systemStats.map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex flex-col items-center gap-1 rounded-lg border border-slate-700/60 bg-slate-800/50 p-2 text-center">
                  <Icon className="h-3.5 w-3.5 text-slate-500" />
                  <span className="text-[10px] font-bold text-slate-300">{value}</span>
                  <span className="text-[9px] text-slate-600">{label}</span>
                </div>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* Email */}
              <div>
                <label htmlFor="admin-email" className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Admin Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
                  <input
                    id="admin-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(null); }}
                    disabled={isLoading || isLocked}
                    placeholder="admin@remediaide.id"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 py-3 pl-10 pr-4 text-sm text-slate-200 placeholder:text-slate-600 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-700 disabled:opacity-50 transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="admin-password" className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
                  <input
                    id="admin-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(null); }}
                    disabled={isLoading || isLocked}
                    placeholder="••••••••••••"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 py-3 pl-10 pr-12 text-sm text-slate-200 placeholder:text-slate-600 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-700 disabled:opacity-50 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400"
                    aria-label={showPassword ? "Sembunyikan" : "Tampilkan"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Attempt counter */}
              {attempts > 0 && !isLocked && (
                <p className="text-xs text-amber-500/80">
                  Percobaan gagal: {attempts}/5
                </p>
              )}

              {/* Error */}
              {error && (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-400">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading || !email || !password || isLocked}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-700 text-sm font-bold text-white transition-all hover:border-slate-500 hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isLocked ? (
                  <><AlertTriangle className="h-4 w-4 text-red-400" />Akses Diblokir</>
                ) : isLoading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Memverifikasi...</>
                ) : (
                  <><ShieldCheck className="h-4 w-4" />Masuk ke Control Panel <ArrowRight className="h-4 w-4" /></>
                )}
              </button>
            </form>
          </div>

          {/* Footer */}
          <div className="border-t border-slate-800 bg-slate-900/50 px-8 py-4 text-center">
            <p className="text-xs text-slate-600">
              Bukan admin? Kembali ke{" "}
              <Link href="/login" className="text-slate-500 hover:text-slate-400 hover:underline">portal guru</Link>
              {" "}atau{" "}
              <Link href="/" className="text-slate-500 hover:text-slate-400 hover:underline">halaman utama</Link>
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-700">
          © 2026 RemediAide · Semua aktivitas terenkripsi & dicatat
        </p>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <AdminLoginForm />
    </Suspense>
  );
}
