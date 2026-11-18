'use client';

/**
 * PrincipalOverviewClient
 *
 * Read-only aggregate dashboard for Kepala Sekolah.
 *
 * Features:
 *  - KPI cards: total sessions, average learning loss %, highest learning loss class
 *  - Stacked bar chart per class (pure CSS — no external chart lib needed)
 *  - Monthly session trend (mini bar chart)
 *  - Date filter (week / month / semester)
 *  - All data is school-aggregate, no individual student data exposed
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
 */

import React, { useState, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClassStat {
  classId: string;
  className: string;
  grade: string;
  total: number;
  PAHAM_KONSEP: number;
  LUCKY_GUESS: number;
  MISKONSEPSI: number;
  TIDAK_PAHAM: number;
  INSUFFICIENT_DATA: number;
  learningLossPct: number;
}

interface MonthlyCount {
  month: string; // "YYYY-MM"
  count: number;
}

interface OverviewData {
  totalSessions: number;
  perClassStats: Array<{
    classId: string;
    className: string;
    grade: string;
    counts: Record<string, number>;
    total: number;
    learningLossPct: number;
  }>;
  sessionsPerMonth: MonthlyCount[];
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  PAHAM_KONSEP:      '#15803d', // green-700
  LUCKY_GUESS:       '#a16207', // yellow-700
  MISKONSEPSI:       '#b91c1c', // red-700
  TIDAK_PAHAM:       '#1e3a8a', // blue-900
  INSUFFICIENT_DATA: '#6b7280', // gray-500
};

const STATUS_LABELS: Record<string, string> = {
  PAHAM_KONSEP:      'Paham Konsep',
  LUCKY_GUESS:       'Lucky Guess',
  MISKONSEPSI:       'Miskonsepsi',
  TIDAK_PAHAM:       'Tidak Paham',
  INSUFFICIENT_DATA: 'Data Kurang',
};

const STATUS_ORDER = ['PAHAM_KONSEP', 'LUCKY_GUESS', 'MISKONSEPSI', 'TIDAK_PAHAM', 'INSUFFICIENT_DATA'];

// ─── Period filter ────────────────────────────────────────────────────────────

type Period = 'week' | 'month' | 'semester';

function getPeriodDates(period: Period): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  let from: Date;
  if (period === 'week') {
    from = new Date(now);
    from.setDate(now.getDate() - 7);
  } else if (period === 'month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    // semester: 6 months back
    from = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  }
  return { from: from.toISOString(), to };
}

// ─── Stacked bar for one class ────────────────────────────────────────────────

function StackedBar({ stat }: { stat: ClassStat }) {
  const total = stat.total;
  if (total === 0) {
    return <div className="h-6 rounded bg-gray-100 text-xs text-gray-400 flex items-center pl-2">Tidak ada data</div>;
  }
  return (
    <div className="h-6 flex rounded overflow-hidden" aria-label={`Distribusi status kognitif kelas ${stat.className}`}>
      {STATUS_ORDER.map((status) => {
        const count = stat[status as keyof ClassStat] as number;
        if (!count) return null;
        const pct = (count / total) * 100;
        return (
          <div
            key={status}
            style={{ width: `${pct}%`, backgroundColor: STATUS_COLORS[status] }}
            title={`${STATUS_LABELS[status]}: ${count} (${Math.round(pct)}%)`}
            aria-label={`${STATUS_LABELS[status]}: ${Math.round(pct)}%`}
          />
        );
      })}
    </div>
  );
}

// ─── Mini monthly trend bars ──────────────────────────────────────────────────

function MonthlyTrend({ data }: { data: MonthlyCount[] }) {
  if (data.length === 0) return null;
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="flex items-end gap-1 h-20" aria-label="Tren sesi bulanan">
      {data.map((d) => {
        const heightPct = (d.count / maxCount) * 100;
        const [year, month] = d.month.split('-');
        const label = new Date(Number(year), Number(month) - 1).toLocaleDateString('id-ID', { month: 'short' });
        return (
          <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex items-end justify-center" style={{ height: '60px' }}>
              <div
                className="w-full rounded-t bg-blue-600 transition-all"
                style={{ height: `${heightPct}%`, minHeight: d.count > 0 ? '4px' : '0' }}
                title={`${label}: ${d.count} sesi`}
              />
            </div>
            <span className="text-xs text-gray-500 leading-none">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PrincipalOverviewClient() {
  const [period, setPeriod] = useState<Period>('semester');
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [classData, setClassData] = useState<ClassStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    const { from, to } = getPeriodDates(p);

    try {
      const [overviewRes, classRes] = await Promise.all([
        fetch('/api/principal/overview'),
        fetch(`/api/principal/classes?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
      ]);

      const [overviewJson, classJson] = await Promise.all([
        overviewRes.json() as Promise<{ success: boolean; data: OverviewData; error?: { message: string } }>,
        classRes.json() as Promise<{ success: boolean; data: ClassStat[]; error?: { message: string } }>,
      ]);

      if (!overviewJson.success) throw new Error(overviewJson.error?.message ?? 'Gagal memuat data');
      if (!classJson.success) throw new Error(classJson.error?.message ?? 'Gagal memuat data kelas');

      setOverview(overviewJson.data);
      setClassData(classJson.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(period);
  }, [period, fetchData]);

  // ── Compute summary KPIs ──────────────────────────────────────────────────
  const avgLearningLoss =
    classData.length > 0
      ? Math.round(classData.reduce((sum, c) => sum + c.learningLossPct, 0) / classData.length)
      : 0;

  const worstClass = classData.length > 0
    ? classData.reduce((a, b) => (a.learningLossPct > b.learningLossPct ? a : b))
    : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard Kepala Sekolah</h1>
          <p className="text-sm text-gray-500 mt-1">Ringkasan performa remediasi seluruh kelas</p>
        </div>

        {/* Period filter */}
        <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
          {(['week', 'month', 'semester'] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                period === p
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p === 'week' ? '7 Hari' : p === 'month' ? 'Bulan Ini' : '6 Bulan'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total Sesi Selesai</p>
              <p className="text-4xl font-bold text-blue-700 mt-2">{overview?.totalSessions ?? 0}</p>
            </div>
            <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Rata-rata Learning Loss</p>
              <p className="text-4xl font-bold text-red-700 mt-2">{avgLearningLoss}%</p>
              <p className="text-xs text-gray-400 mt-1">Miskonsepsi + Tidak Paham</p>
            </div>
            <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Kelas Tertinggi Learning Loss</p>
              {worstClass ? (
                <>
                  <p className="text-2xl font-bold text-gray-900 mt-2">{worstClass.className}</p>
                  <p className="text-sm text-red-600 font-semibold">{worstClass.learningLossPct}% learning loss</p>
                </>
              ) : (
                <p className="text-sm text-gray-400 mt-2">Tidak ada data</p>
              )}
            </div>
          </div>

          {/* Monthly trend */}
          {overview && overview.sessionsPerMonth.length > 0 && (
            <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Jumlah Sesi per Bulan (12 Bulan Terakhir)</h2>
              <MonthlyTrend data={overview.sessionsPerMonth} />
            </div>
          )}

          {/* Class comparison stacked bars */}
          <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Distribusi Status Kognitif per Kelas</h2>
            </div>

            {classData.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                Tidak ada data diagnosis untuk periode ini.
              </p>
            ) : (
              <div className="space-y-4">
                {classData
                  .sort((a, b) => b.learningLossPct - a.learningLossPct)
                  .map((stat) => (
                    <div key={stat.classId}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-800">
                          {stat.className}
                          <span className="ml-2 text-xs text-gray-400">Kelas {stat.grade}</span>
                        </span>
                        <span
                          className={`text-xs font-semibold ${
                            stat.learningLossPct >= 50 ? 'text-red-600' : 'text-gray-500'
                          }`}
                        >
                          {stat.learningLossPct}% learning loss
                        </span>
                      </div>
                      <StackedBar stat={stat} />
                      <div className="mt-1 text-xs text-gray-400">
                        Total: {stat.total} diagnosa
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* Legend */}
            <div className="mt-4 flex flex-wrap gap-3">
              {STATUS_ORDER.map((s) => (
                <div key={s} className="flex items-center gap-1.5 text-xs text-gray-600">
                  <div
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: STATUS_COLORS[s] }}
                    aria-hidden="true"
                  />
                  <span>{STATUS_LABELS[s]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Detailed table */}
          {classData.length > 0 && (
            <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">Tabel Detail per Kelas</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Kelas</th>
                      {STATUS_ORDER.slice(0, 4).map((s) => (
                        <th key={s} className="px-3 py-3 text-center font-semibold text-gray-600">
                          {STATUS_LABELS[s]}
                        </th>
                      ))}
                      <th className="px-3 py-3 text-center font-semibold text-red-600">Learning Loss</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classData.map((stat, i) => (
                      <tr key={stat.classId} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-3 font-medium text-gray-900">{stat.className}</td>
                        {STATUS_ORDER.slice(0, 4).map((s) => {
                          const count = stat[s as keyof ClassStat] as number;
                          const pct = stat.total > 0 ? Math.round((count / stat.total) * 100) : 0;
                          return (
                            <td key={s} className="px-3 py-3 text-center">
                              <span className="text-gray-900">{count}</span>
                              <span className="text-xs text-gray-400 ml-1">({pct}%)</span>
                            </td>
                          );
                        })}
                        <td className="px-3 py-3 text-center">
                          <span
                            className={`font-bold ${
                              stat.learningLossPct >= 50 ? 'text-red-700' : 'text-gray-700'
                            }`}
                          >
                            {stat.learningLossPct}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Privacy notice */}
          <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-700">
            <strong>Catatan Privasi:</strong> Data yang ditampilkan adalah agregat kelas —
            tidak ada identitas siswa individual yang terekspos sesuai UU No. 27/2022 tentang Perlindungan Data Pribadi.
          </div>
        </>
      )}
    </div>
  );
}
