/**
 * Principal Portal Layout
 *
 * Navigation shell for Kepala Sekolah.
 * Links: Overview (read-only) + Kelola Guru (manage teachers)
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/principal/overview", label: "Ringkasan Sekolah" },
  { href: "/principal/teachers", label: "Kelola Guru" },
];

export default function PrincipalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-sm">
              R
            </div>
            <span className="font-semibold text-gray-900 hidden sm:inline">RemediAide</span>
          </div>

          {/* Nav tabs */}
          <nav className="flex items-center gap-1" aria-label="Menu Kepala Sekolah">
            {NAV_ITEMS.map(({ href, label }) => {
              const isActive = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "px-3 py-2 rounded-md text-sm font-medium transition-colors min-h-[40px] flex items-center",
                    isActive
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm text-gray-500 hover:text-red-600 transition-colors px-3 py-2 rounded-md hover:bg-red-50 min-h-[40px]"
          >
            Keluar
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-6xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
