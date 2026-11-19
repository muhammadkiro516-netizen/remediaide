/**
 * RemediAide 2.0 — validation of the optional one-sentence student explanation (05_INTEGRATION_SPEC §3).
 * Rules: optional; must be a string; control characters removed; whitespace collapsed; trimmed; max 280 chars.
 * Empty after cleaning -> null (no explanation).
 */
export const EXPLANATION_MAX = 280;

export type ExplanationResult = { ok: true; value: string | null } | { ok: false; message: string };

// C0/C1 control characters and zero-width/bidi formatting characters
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿]/g;

export function sanitizeExplanation(input: unknown): ExplanationResult {
  if (input === undefined || input === null) return { ok: true, value: null };
  if (typeof input !== 'string') return { ok: false, message: 'explanation harus berupa teks.' };
  const cleaned = input.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0) return { ok: true, value: null };
  if (cleaned.length > EXPLANATION_MAX) {
    return { ok: false, message: `Alasan maksimal ${EXPLANATION_MAX} karakter.` };
  }
  return { ok: true, value: cleaned };
}
