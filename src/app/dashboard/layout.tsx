"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  Users,
  PlayCircle,
  FileText,
  BarChart3,
  Menu,
  X,
  LogOut,
  GraduationCap,
  ChevronRight,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Kelas",  href: "/dashboard/classes",  Icon: Users,       color: "text-violet-500" },
  { label: "Sesi",   href: "/dashboard/sessions", Icon: PlayCircle,  color: "text-emerald-500" },
  { label: "Soal",   href: "/dashboard/tests",    Icon: FileText,    color: "text-blue-500" },
  { label: "Hasil",  href: "/dashboard/results",  Icon: BarChart3,   color: "text-amber-500" },
];

function NavItem({
  href,
  label,
  Icon,
  color,
  active,
  onClick,
}: {
  href: string;
  label: string;
  Icon: React.ElementType;
  color: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 min-h-[48px]",
        active
          ? "bg-white/10 text-white shadow-sm"
          : "text-slate-300 hover:bg-white/5 hover:text-white"
      )}
    >
      <span className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200",
        active ? "bg-white/15" : "bg-white/5 group-hover:bg-white/10"
      )}>
        <Icon className={cn("h-4 w-4", active ? "text-white" : color)} aria-hidden="true" />
      </span>
      <span className="flex-1">{label}</span>
      {active && <ChevronRight className="h-3.5 w-3.5 text-white/50" aria-hidden="true" />}
    </Link>
  );
}

function Sidebar({
  pathname,
  onNavClick,
}: {
  pathname: string;
  onNavClick?: () => void;
}) {
  const { data: session } = useSession();
  const name = session?.user?.name ?? "Guru";
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-slate-800 to-slate-900">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500 shadow-lg shadow-blue-500/30">
          <GraduationCap className="h-5 w-5 text-white" aria-hidden="true" />
        </div>
        <div>
          <p className="text-base font-bold text-white leading-none">RemediAide</p>
          <p className="text-xs text-slate-400 mt-0.5">Portal Guru</p>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-5 h-px bg-white/10" />

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Menu navigasi utama">
        {NAV_ITEMS.map(({ label, href, Icon, color }) => (
          <NavItem
            key={href}
            href={href}
            label={label}
            Icon={Icon}
            color={color}
            active={pathname === href || pathname.startsWith(href + "/")}
            onClick={onNavClick}
          />
        ))}
      </nav>

      {/* User footer */}
      <div className="mx-3 mb-4 rounded-xl bg-white/5 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-violet-500 text-sm font-bold text-white">
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{name}</p>
            <p className="text-xs text-slate-400">Guru</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Keluar"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-60 md:fixed md:inset-y-0 z-30">
        <Sidebar pathname={pathname} />
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <div className="relative flex h-full w-72 max-w-full flex-col z-50">
            <button
              type="button"
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              onClick={() => setSidebarOpen(false)}
              aria-label="Tutup menu"
            >
              <X className="h-5 w-5" />
            </button>
            <Sidebar pathname={pathname} onNavClick={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 md:ml-60 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md">
          <button
            type="button"
            className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
            onClick={() => setSidebarOpen(true)}
            aria-label="Buka menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Breadcrumb-style title */}
          <div className="flex-1 text-sm text-slate-500">
            {NAV_ITEMS.find((n) => pathname === n.href || pathname.startsWith(n.href + "/"))?.label ?? "Dashboard"}
          </div>

          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="hidden md:flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Keluar
          </button>
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
