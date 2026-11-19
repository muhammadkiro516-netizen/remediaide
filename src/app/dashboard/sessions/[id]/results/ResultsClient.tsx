'use client';

/**
 * ResultsClient — Interactive results dashboard for a completed session.
 *
 * Features:
 *  - Summary cards (count per CognitiveStatus)
 *  - "Generate Kelompok Remedial" button
 *  - "Ekspor CSV" link
 *  - Remedial groups with prescriptions + PDF download per group
 *  - Diagnosis matrix: rows=students, columns=questions, cells=status badge
 */

import React, { useState, useCallback } from 'react';
import PDFDownloadPanel from '@/components/teacher/PDFDownloadPanel';
import AutoWipeDialog from '@/components/teacher/AutoWipeDialog';
import { ExitTicketSummaryBadge } from '@/components/teacher/ExitTicketSummaryBadge';
import MlModePanel from '@/components/teacher/MlModePanel';

// ─── Types ────────────────────────────────────────────────────────────────────

type FinalStatus =
  | 'PAHAM_KONSEP'
  | 'LUCKY_GUESS'
  | 'MISKONSEPSI'
  | 'TIDAK_PAHAM'
  | 'INSUFFICIENT_DATA';

interface DiagnosisRow {
  anonymousLabel: string;
  questionId: string;
  finalStatus: FinalStatus;
  tiebreakerApplied: boolean;
  validItemCount: number;
}

interface RemedialGroupData {
  id: string;
  cognitiveStatus: FinalStatus;
  memberLabels: string[];
  prescription: string;
  exitTicketTokenCount?: number;
  exitTicketSubmissionCount?: number;
}

interface QuestionInfo {
  id: string;
  templateText: string;
  itemOrder: number;
}

interface ResultsClientProps {
  sessionId: string;
  topic: string;
  sessionState: 'LOCKED' | 'ACTIVE' | 'CLOSED';
  questions: QuestionInfo[];
  initialDiagnoses: DiagnosisRow[];
  initialGroups: RemedialGroupData[];
}

// ─── Color / label helpers ────────────────────────────────────────────────────

const STATUS_CONFIG: Record<FinalStatus, { bg: string; text: string; label: string }> = {
  PAHAM_KONSEP:      { bg: 'bg-green-700',  text: 'text-white', label: 'Paham Konsep' },
  LUCKY_GUESS:       { bg: 'bg-yellow-600', text: 'text-white', label: 'Lucky Guess' },
  MISKONSEPSI:       { bg: 'bg-red-700',    text: 'text-white', label: 'Miskonsepsi' },
  TIDAK_PAHAM:       { bg: 'bg-blue-900',   text: 'text-white', label: 'Tidak Paham' },
  INSUFFICIENT_DATA: { bg: 'bg-gray-400',   text: 'text-white', label: 'Data Kurang' },
};

function StatusBadge({ status }: { status: FinalStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${cfg.bg} ${cfg.text}`}
    >
      {cfg.label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ResultsClient({
  sessionId,
  topic,
  sessionState,
  questions,
  initialDiagnoses,
  initialGroups,
}: ResultsClientProps) {
  const [diagnoses, setDiagnoses] = useState<DiagnosisRow[]>(initialDiagnoses);
  const [groups, setGroups] = useState<RemedialGroupData[]>(initialGroups);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [aiMode, setAiMode] = useState(false);

  // ── Summary counts ────────────────────────────────────────────────────────
  const statusCounts = diagnoses.reduce<Record<string, number>>((acc, d) => {
    acc[d.finalStatus] = (acc[d.finalStatus] ?? 0) + 1;
    return acc;
  }, {});

  // ── Unique students (sorted) ─────────────────────────────────────────────
  const students = Array.from(new Set(diagnoses.map((d) => d.anonymousLabel))).sort();

  // ── Build matrix lookup ───────────────────────────────────────────────────
  const matrixMap = new Map<string, FinalStatus>();
  for (const d of diagnoses) {
    matrixMap.set(`${d.anonymousLabel}:${d.questionId}`, d.finalStatus);
  }

  // ── Generate handler ──────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate' }),
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: RemedialGroupData[];
        error?: { message: string };
      };
      if (json.success && json.data) {
        setGroups(json.data);
        // Reload diagnoses too (pipeline may have run)
        const dRes = await fetch(`/api/sessions/${sessionId}/diagnoses`);
        const dJson = (await dRes.json()) as {
          success: boolean;
          data?: Array<{
            finalStatus: FinalStatus;
            tiebreakerApplied: boolean;
            validItemCount: number;
            student: { anonymousLabel: string };
            question: { id: string; itemOrder: number };
          }>;
        };
        if (dJson.success && dJson.data) {
          setDiagnoses(
            dJson.data.map((d) => ({
              anonymousLabel: d.student.anonymousLabel,
              questionId: d.question.id,
              finalStatus: d.finalStatus,
              tiebreakerApplied: d.tiebreakerApplied,
              validItemCount: d.validItemCount,
            }))
          );
        }
      } else {
        setGenerateError(json.error?.message ?? 'Gagal membuat kelompok.');
      }
    } catch {
      setGenerateError('Terjadi kesalahan jaringan. Coba lagi.');
    } finally {
      setGenerating(false);
    }
  }, [sessionId]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{topic}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Hasil Diagnosis — {students.length} siswa, {questions.length} soal
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setAiMode((v) => !v)}
            aria-pressed={aiMode}
            className={`min-h-[48px] px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
              aiMode ? 'bg-violet-700 text-white hover:bg-violet-800' : 'border border-violet-300 bg-white text-violet-700 hover:bg-violet-50'
            }`}
          >
            {aiMode ? 'Mode AI: aktif' : 'Mode AI'}
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="min-h-[48px] px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? 'Memproses...' : '⚡ Generate Kelompok Remedial'}
          </button>
          <a
            href={`/api/sessions/${sessionId}/export/csv`}
            download
            className="min-h-[48px] px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-colors flex items-center"
          >
            ⬇ Ekspor CSV
          </a>
          <AutoWipeDialog
            sessionId={sessionId}
            onWipeComplete={(count) => {
              // Optionally show a banner after wipe
              console.info(`Wipe complete: ${count} records deleted`);
            }}
          />
        </div>
      </div>

      {aiMode && <MlModePanel sessionId={sessionId} />}

      {generateError && (
        <div className="text-sm text-red-700 bg-red-50 rounded-md px-4 py-3" role="alert">
          {generateError}
        </div>
      )}

      {/* Summary cards */}
      {diagnoses.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {(Object.entries(STATUS_CONFIG) as [FinalStatus, typeof STATUS_CONFIG[FinalStatus]][]).map(
            ([status, cfg]) => (
              <div
                key={status}
                className={`rounded-xl p-4 ${cfg.bg} text-white shadow-sm`}
              >
                <div className="text-3xl font-bold">{statusCounts[status] ?? 0}</div>
                <div className="text-xs font-medium mt-1 opacity-90">{cfg.label}</div>
              </div>
            )
          )}
        </div>
      )}

      {/* Remedial groups */}
      {groups.length > 0 && (
        <section aria-label="Kelompok remedial">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Kelompok Remedial</h2>
          <div className="space-y-4">
            {groups.map((g) => {
              const cfg = STATUS_CONFIG[g.cognitiveStatus];
              return (
                <div key={g.id} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                  <div className={`px-4 py-3 ${cfg.bg} flex items-center justify-between`}>
                    <span className="font-semibold text-white">{cfg.label}</span>
                    <span className="text-xs text-white opacity-90">{g.memberLabels.length} siswa</span>
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    <p className="text-sm text-gray-700 italic">{g.prescription}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {g.memberLabels.map((label) => (
                        <span
                          key={label}
                          className="inline-block px-2 py-0.5 rounded bg-gray-100 text-gray-800 text-xs font-mono"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                    <ExitTicketSummaryBadge
                      submittedCount={g.exitTicketSubmissionCount ?? 0}
                      totalTokens={g.exitTicketTokenCount ?? 0}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {/* PDF download per group */}
          <div className="mt-4">
            <PDFDownloadPanel sessionId={sessionId} groups={groups} />
          </div>
        </section>
      )}

      {/* Diagnosis matrix */}
      {diagnoses.length === 0 ? (
        <div className="flex items-center justify-center h-40 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 text-sm">
          {sessionState !== 'CLOSED'
            ? 'Sesi belum selesai. Tutup sesi untuk melihat hasil.'
            : 'Klik "Generate Kelompok Remedial" untuk memulai diagnosa.'}
        </div>
      ) : (
        <section aria-label="Matriks diagnosis">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Matriks Diagnosis</h2>
          <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="sticky left-0 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap border-b border-r">
                    Siswa
                  </th>
                  {questions.map((q) => (
                    <th
                      key={q.id}
                      className="px-2 py-2 font-semibold text-gray-600 text-center border-b whitespace-nowrap"
                      title={q.templateText}
                    >
                      S{q.itemOrder}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((label, i) => (
                  <tr key={label} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="sticky left-0 bg-inherit px-3 py-2 font-mono text-xs text-gray-700 border-r whitespace-nowrap">
                      {label}
                    </td>
                    {questions.map((q) => {
                      const status = matrixMap.get(`${label}:${q.id}`);
                      return (
                        <td key={q.id} className="px-2 py-2 text-center">
                          {status ? (
                            <StatusBadge status={status} />
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
