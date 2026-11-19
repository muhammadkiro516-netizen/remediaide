'use client';

/**
 * Pilot (06 §3, UU PDP Pasal 25): the teacher records that written parent/guardian consent was collected for every
 * student in this session. Only then does "Ekspor Riset" return data (the API answers 403 otherwise).
 * Students without consent must use a separate practice session; their data is never exported.
 */
import { useState } from 'react';

export function ResearchConsentToggle({ sessionId, initialConsent }: { sessionId: string; initialConsent: boolean }) {
  const [consent, setConsent] = useState(initialConsent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(next: boolean) {
    if (next && !window.confirm(
      'Konfirmasi: formulir persetujuan orang tua/wali sudah terkumpul untuk SEMUA siswa di sesi ini. '
      + 'Siswa tanpa persetujuan harus memakai sesi latihan terpisah.')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/research-consent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setConsent(next);
    } catch {
      setError('Gagal menyimpan. Coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      {consent ? (
        <>
          <span className="rounded-lg bg-emerald-50 px-3 py-2 font-semibold text-emerald-800">Persetujuan riset tercatat ✓</span>
          <button type="button" disabled={busy} onClick={() => update(false)}
            className="min-h-[48px] rounded-lg border border-gray-300 px-3 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Batalkan
          </button>
        </>
      ) : (
        <button type="button" disabled={busy} onClick={() => update(true)}
          className="min-h-[48px] rounded-lg border border-emerald-300 bg-white px-4 py-2 font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">
          Catat persetujuan riset
        </button>
      )}
      {error && <span role="alert" className="text-red-700">{error}</span>}
    </div>
  );
}
