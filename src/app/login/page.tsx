"use client";

/**
 * Login Page — Portal Guru & Kepala Sekolah
 * Desain: Profesional, clean split-layout, warna biru/indigo
 * Auth: NextAuth credentials → redirect by role
 */

import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useCallback, Suspense } from "react";
import Link from "next/link";
import {
  LayoutDashboard, School, Mail, Lock, ArrowRight, Eye, EyeOff,
  Loader2, Brain, ShieldCheck, BarChart3, Zap,
} from "lucide-react";

const features = [
  { icon: Brain, text: "Diagnosis miskonsepsi berbasis CRI" },
  { icon: Zap, text: "Live Heatmap real-time via SSE" },
  { icon: BarChart3, text: "Laporan otomatis & ekspor CSV/PDF" },
  { icon: ShieldCheck, text: "RBAC multi-peran yang aman" },
];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
    });

    if (!result || result.error) {
      setError("Email atau password salah. Periksa kembali dan coba lagi.");
      setIsLoading(false);
      return;
    }

    // Use result.url if NextAuth provides a redirect, otherwise go to callbackUrl
    // Small delay to ensure cookie is set before navigation
    await new Promise((resolve) => setTimeout(resolve, 300));
    const session = await getSession();
    const role = session?.role;
    let destination = callbackUrl;
    if (!destination || destination === "/dashboard") {
      if (role === "SUPERADMIN") destination = "/admin/dashboard";
      else if (role === "PRINCIPAL") destination = "/principal/overview";
      else destination = "/dashboard";
    }
    router.push(destination);
  }, [email, password, isLoading, callbackUrl, router]);

  return (
    <div className="flex min-h-screen">
      {/* LEFT PANEL — Branding */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-blue-700 via-indigo-700 to-violet-800 p-12 lg:flex lg:w-5/12">
        {/* Background grid */}
        <div aria-hidden className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-white/5 blur-3xl" />

        {/* Logo */}
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
              <Brain className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">RemediAide</span>
          </div>
        </div>

        {/* Main copy */}
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-blue-100">
            <LayoutDashboard className="h-3 w-3" />
            Dashboard Guru & Kepala Sekolah
          </div>
          <h2 className="text-3xl font-extrabold leading-tight text-white">
            Kenali siapa<br />yang salah paham,<br />bukan hanya siapa<br />yang salah.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-blue-200">
            Masuk untuk mengelola sesi, memantau pemahaman kelas secara live,
            dan menghasilkan rekomendasi remediasi berbasis data CRI.
          </p>

          <ul className="mt-8 space-y-3">
            {features.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-blue-100">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15">
                  <Icon className="h-3.5 w-3.5 text-white" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        {/* Role badges */}
        <div className="flex gap-3">
          <span className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white">
            <LayoutDashboard className="h-3 w-3" /> Guru
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white">
            <School className="h-3 w-3" /> Kepala Sekolah
          </span>
        </div>
      </div>

      {/* RIGHT PANEL — Form */}
      <div className="flex flex-1 flex-col items-center justify-center bg-slate-50 px-6 py-12">
        {/* Mobile logo */}
        <div className="mb-8 flex flex-col items-center lg:hidden">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 shadow-lg">
            <Brain className="h-6 w-6 text-white" />
          </div>
          <span className="text-lg font-bold text-slate-900">RemediAide</span>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-2xl font-extrabold text-slate-900">Selamat datang kembali</h1>
            <p className="mt-1.5 text-sm text-slate-500">
              Masuk ke akun Guru atau Kepala Sekolah Anda.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Email */}
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Email Institusi
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(null); }}
                  disabled={isLoading}
                  placeholder="guru@sekolah.sch.id"
                  className="w-full rounded-xl border-2 border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:opacity-60 transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  disabled={isLoading}
                  placeholder="••••••••"
                  className="w-full rounded-xl border-2 border-slate-200 bg-white py-3 pl-10 pr-12 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:opacity-60 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div role="alert" aria-live="polite" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <span className="text-base">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading || !email || !password}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-700 text-sm font-bold text-white shadow-lg shadow-blue-200 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-300 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {isLoading
                ? <><Loader2 className="h-4 w-4 animate-spin" />Memverifikasi...</>
                : <>Masuk ke Dashboard <ArrowRight className="h-4 w-4" /></>}
            </button>
          </form>

          <div className="mt-8 space-y-3 border-t border-slate-200 pt-6 text-center">
            <p className="text-sm text-slate-500">
              Belum terdaftar?{" "}
              <Link href="/register" className="font-semibold text-blue-600 hover:text-blue-700 hover:underline">
                Ajukan kemitraan sekolah
              </Link>
            </p>
            <Link href="/" className="block text-xs text-slate-400 hover:text-slate-600 hover:underline">
              ← Kembali ke halaman utama
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
