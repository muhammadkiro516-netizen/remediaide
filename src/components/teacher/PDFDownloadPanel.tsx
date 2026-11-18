'use client';

/**
 * PDFDownloadPanel
 *
 * Displays a list of remedial groups and allows the teacher to download
 * one LKPD-KK PDF per group. Each download button triggers POST /api/sessions/:id/lkpd
 * and streams the PDF directly to the browser as a file download.
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 */

import React, { useState } from 'react';

type FinalStatus =
  | 'PAHAM_KONSEP'
  | 'LUCKY_GUESS'
  | 'MISKONSEPSI'
  | 'TIDAK_PAHAM'
  | 'INSUFFICIENT_DATA';

interface RemedialGroupSummary {
  id: string;
  cognitiveStatus: FinalStatus;
  memberLabels: string[];
  prescription: string;
}

interface PDFDownloadPanelProps {
  sessionId: string;
  groups: RemedialGroupSummary[];
}

const GROUP_CONFIG: Record<FinalStatus, { label: string; colorClass: string }> = {
  PAHAM_KONSEP:      { label: 'Paham Konsep',   colorClass: 'bg-green-700 text-white' },
  LUCKY_GUESS:       { label: 'Lucky Guess',     colorClass: 'bg-yellow-600 text-white' },
  MISKONSEPSI:       { label: 'Miskonsepsi',     colorClass: 'bg-red-700 text-white' },
  TIDAK_PAHAM:       { label: 'Tidak Paham',     colorClass: 'bg-blue-900 text-white' },
  INSUFFICIENT_DATA: { label: 'Data Tidak Cukup', colorClass: 'bg-gray-500 text-white' },
};

export function PDFDownloadPanel({ sessionId, groups }: PDFDownloadPanelProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
        Belum ada kelompok remedial. Generate kelompok terlebih dahulu.
      </div>
    );
  }

  async function handleDownload(group: RemedialGroupSummary) {
    setLoadingId(group.id);
    setErrorId(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/lkpd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: group.id }),
      });

      if (!res.ok) {
        const json = (await res.json()) as { error?: { message?: string } };
        throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      }

      // Stream blob to browser download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `LKPD-${group.cognitiveStatus}-${sessionId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[PDFDownloadPanel]', err);
      setErrorId(group.id);
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">Unduh LKPD-KK per Kelompok</h3>
      {groups.map((group) => {
        const cfg = GROUP_CONFIG[group.cognitiveStatus] ?? GROUP_CONFIG.INSUFFICIENT_DATA;
        const isLoading = loadingId === group.id;
        const hasError = errorId === group.id;

        return (
          <div
            key={group.id}
            className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
          >
            <div className="space-y-1 flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${cfg.colorClass}`}>
                  {cfg.label}
                </span>
                <span className="text-xs text-gray-500">{group.memberLabels.length} siswa</span>
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {group.memberLabels.slice(0, 6).map((label) => (
                  <span
                    key={label}
                    className="inline-block px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-xs font-mono"
                  >
                    {label}
                  </span>
                ))}
                {group.memberLabels.length > 6 && (
                  <span className="text-xs text-gray-400">+{group.memberLabels.length - 6} lagi</span>
                )}
              </div>
              {hasError && (
                <p className="text-xs text-red-600 mt-1">
                  Gagal membuat PDF. Coba lagi.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleDownload(group)}
              disabled={isLoading}
              className="ml-4 flex-shrink-0 min-h-[44px] px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label={`Unduh LKPD untuk kelompok ${cfg.label}`}
            >
              {isLoading ? (
                <span className="flex items-center gap-1.5">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Membuat PDF...
                </span>
              ) : (
                '⬇ Unduh PDF'
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default PDFDownloadPanel;
