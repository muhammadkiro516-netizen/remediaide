'use client';

/**
 * MlModePanel — RemediAide 2.0 "Mode AI" on the results dashboard (05_INTEGRATION_SPEC §6).
 * Shows the "Perlu dicek guru" queue, AI groups per named misconception, and per-student AI diagnosis with
 * calibrated probabilities, reasons and teacher feedback buttons. The v1 rule result is shown next to it.
 */
import React, { useEffect, useState } from 'react';
import type { MlStudentView, MlView } from '@/lib/ml/view';
import type { OfflineRow } from '@/lib/ml/offline';

const QLABEL: Record<string, string> = {
  PAHAM_KONSEP: 'Paham Konsep',
  LUCKY_GUESS: 'Lucky Guess',
  MISKONSEPSI: 'Miskonsepsi',
  TIDAK_PAHAM: 'Tidak Paham',
  INSUFFICIENT_DATA: 'Data Kurang',
  INVALID: 'Tidak valid',
};
const QCOLOR: Record<string, string> = {
  PAHAM_KONSEP: 'bg-green-700',
  LUCKY_GUESS: 'bg-yellow-600',
  MISKONSEPSI: 'bg-red-700',
  TIDAK_PAHAM: 'bg-blue-900',
};

function ProbBar({ probs }: { probs: Record<string, number> }) {
  return (
    <div className="flex h-2 w-32 overflow-hidden rounded bg-gray-100" aria-hidden="true">
      {Object.keys(QCOLOR).map((q) => (
        <div key={q} className={QCOLOR[q]} style={{ width: `${Math.round((probs[q] ?? 0) * 100)}%` }} />
      ))}
    </div>
  );
}

function FeedbackButtons({ diagnosisId }: { diagnosisId: string | null }) {
  const [sent, setSent] = useState<string | null>(null);
  if (!diagnosisId) return null;
  async function send(action: string, newValue?: string) {
    const res = await fetch('/api/ml-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mlDiagnosisId: diagnosisId, action, newValue }),
    });
    if (res.ok) setSent(action);
  }
  if (sent) return <span className="text-xs text-emerald-700">Tersimpan ✓</span>;
  return (
    <div className="flex flex-wrap gap-1">
      <button type="button" onClick={() => send('ACCEPT')} className="rounded border px-2 py-1 text-xs hover:bg-gray-50">Setuju</button>
      <select
        aria-label="Ubah kuadran"
        defaultValue=""
        onChange={(e) => e.target.value && send('CHANGE_QUADRANT', e.target.value)}
        className="rounded border px-1 py-1 text-xs"
      >
        <option value="">Ubah kuadran…</option>
        {Object.keys(QCOLOR).map((q) => <option key={q} value={q}>{QLABEL[q]}</option>)}
      </select>
      <button
        type="button"
        onClick={() => {
          const v = window.prompt('Nama miskonsepsi yang benar menurut Anda:');
          if (v && v.trim()) send('CHANGE_MISCONCEPTION', v.trim());
        }}
        className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
      >
        Ubah miskonsepsi
      </button>
      <button type="button" onClick={() => send('NOT_SURE')} className="rounded border px-2 py-1 text-xs hover:bg-gray-50">Tidak yakin</button>
    </div>
  );
}

function StudentCard({ s }: { s: MlStudentView }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900">{s.anonymousLabel}</span>
          <span className={`rounded px-2 py-0.5 text-xs font-semibold text-white ${QCOLOR[s.quadrant] ?? 'bg-gray-400'}`}>
            AI: {QLABEL[s.quadrant] ?? s.quadrant}
          </span>
          {s.ruleStatus && <span className="text-xs text-gray-500">aturan v1: {QLABEL[s.ruleStatus] ?? s.ruleStatus}</span>}
          {s.hiddenMisconception && (
            <span className="rounded bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">Benar tapi nalar keliru</span>
          )}
          {s.deferred && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Perlu dicek guru</span>}
        </div>
        <span className="text-xs text-gray-500">peluang tuntas {Math.round(s.masteryProb * 100)}%</span>
      </div>
      {s.reasons.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-xs text-gray-600">
          {s.reasons.map((r, i) => <li key={i}>{r.text}</li>)}
        </ul>
      )}
      <table className="mt-3 w-full text-xs">
        <tbody>
          {s.perQuestion.map((q) => (
            <tr key={q.id} className="border-t border-gray-100">
              <td className="py-1 pr-2 text-gray-500">Soal {q.questionOrder ?? ''}</td>
              <td className="py-1 pr-2"><ProbBar probs={q.quadrantProbs} /></td>
              <td className="py-1 pr-2">{QLABEL[q.quadrant] ?? q.quadrant}</td>
              <td className="py-1 pr-2 text-gray-700">{q.misconceptionLabel ?? ''}</td>
              <td className="py-1 text-gray-400">{q.predictionSet.length > 1 ? `ragu: ${q.predictionSet.map((x) => QLABEL[x] ?? x).join(' / ')}` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3"><FeedbackButtons diagnosisId={s.summaryId} /></div>
    </div>
  );
}

function OnDevicePanel({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [rows, setRows] = useState<{ label: string; quadrant: string; probs: Record<string, number>; pRemed: number }[]>([]);
  async function run() {
    setState('running');
    try {
      const res = await fetch(`/api/sessions/${sessionId}/ml-input`).then((r) => r.json());
      if (!res.success) throw new Error('data');
      const { loadOfflineModels, offlineDiagnose } = await import('@/lib/ml/offline');
      const out: OfflineRow[] = await offlineDiagnose(res.data, await loadOfflineModels());
      const by = new Map<string, OfflineRow[]>();
      out.forEach((r) => by.set(r.studentKey, [...(by.get(r.studentKey) ?? []), r]));
      setRows(Array.from(by.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([label, rs]) => {
        const probs = Object.fromEntries(Object.keys(QCOLOR).map((q) => [q, rs.reduce((s, r) => s + r.quadrantProbs[q as keyof typeof r.quadrantProbs], 0) / rs.length]));
        const quadrant = Object.entries(probs).sort((a, b) => b[1] - a[1])[0][0];
        return { label, quadrant, probs, pRemed: rs.reduce((s, r) => s + r.pNeedsRemediation, 0) / rs.length };
      }));
      setState('done');
    } catch {
      setState('error');
    }
  }
  return (
    <div className="rounded-md border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
      <p>Layanan AI server tidak tersedia. Anda bisa menghitung <strong>Lapis 1 di perangkat ini</strong> (tanpa pembaca alasan,
        tanpa kalibrasi; model ±29 MB diunduh sekali lalu disimpan).</p>
      {state !== 'done' && (
        <button type="button" onClick={run} disabled={state === 'running'}
          className="mt-2 rounded bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-800 disabled:opacity-50">
          {state === 'running' ? 'Menghitung…' : 'Hitung di perangkat (L1 saja)'}
        </button>
      )}
      {state === 'error' && <p className="mt-2 text-red-700">Gagal menghitung di perangkat.</p>}
      {state === 'done' && (
        <table className="mt-3 w-full text-xs">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-violet-100">
                <td className="py-1 pr-2 font-semibold">{r.label}</td>
                <td className="py-1 pr-2"><ProbBar probs={r.probs} /></td>
                <td className="py-1 pr-2">{QLABEL[r.quadrant] ?? r.quadrant}</td>
                <td className="py-1 text-gray-600">butuh remediasi {Math.round(r.pRemed * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

async function downloadLkpd(sessionId: string, misconception: string) {
  const res = await fetch(`/api/sessions/${sessionId}/lkpd-ml`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ misconception }),
  });
  if (!res.ok) return;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = `LKPD-AI-${misconception.slice(0, 30)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function MlModePanel({ sessionId }: { sessionId: string }) {
  const [view, setView] = useState<MlView | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/sessions/${sessionId}/ml`)
      .then((r) => r.json())
      .then((j) => (j.success ? setView(j.data as MlView) : setError(j.error?.message ?? 'Gagal memuat Mode AI.')))
      .catch(() => setError('Gagal memuat Mode AI.'));
  }, [sessionId]);

  if (error) {
    return (
      <div className="space-y-3">
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</div>
        <OnDevicePanel sessionId={sessionId} />
      </div>
    );
  }
  if (!view) return <div className="text-sm text-gray-500">Memuat Mode AI…</div>;
  if (!view.available) {
    return (
      <div className="space-y-3">
        <div className="rounded-md bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Mode AI belum tersedia untuk sesi ini. Hasil aturan v1 tetap berlaku.
        </div>
        <OnDevicePanel sessionId={sessionId} />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <p className="text-xs text-gray-500">Model {view.modelVersion}. Keputusan akhir tetap di tangan guru.</p>
      <section aria-label="Perlu dicek guru">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Perlu dicek guru ({view.queue.length})</h2>
        {view.queue.length === 0 ? (
          <p className="text-sm text-gray-500">Tidak ada kasus yang meragukan.</p>
        ) : (
          <div className="space-y-3">{view.queue.map((s) => <StudentCard key={s.studentId} s={s} />)}</div>
        )}
      </section>
      {view.groups.length > 0 && (
        <section aria-label="Kelompok per miskonsepsi">
          <h2 className="mb-2 text-lg font-semibold text-gray-900">Kelompok remedial AI per miskonsepsi</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {view.groups.map((g) => (
              <div key={g.misconception} className="rounded-lg border border-red-200 bg-red-50 p-3">
                <div className="text-sm font-semibold text-red-900">{g.misconception}</div>
                <div className="mt-1 text-xs text-red-800">{g.members.join(', ')}</div>
                <button
                  type="button"
                  onClick={() => downloadLkpd(sessionId, g.misconception)}
                  className="mt-2 rounded border border-red-300 bg-white px-2 py-1 text-xs font-semibold text-red-800 hover:bg-red-100"
                >
                  ⬇ Unduh LKPD
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      <section aria-label="Diagnosis AI per siswa">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Diagnosis AI per siswa</h2>
        <div className="space-y-3">{view.students.map((s) => <StudentCard key={s.studentId} s={s} />)}</div>
      </section>
    </div>
  );
}
