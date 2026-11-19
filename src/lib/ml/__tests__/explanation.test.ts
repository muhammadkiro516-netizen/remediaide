import { describe, expect, it } from 'vitest';
import { EXPLANATION_MAX, sanitizeExplanation } from '../explanation';

describe('sanitizeExplanation', () => {
  it('treats missing or empty as no explanation', () => {
    expect(sanitizeExplanation(undefined)).toEqual({ ok: true, value: null });
    expect(sanitizeExplanation(null)).toEqual({ ok: true, value: null });
    expect(sanitizeExplanation('   \n\t ')).toEqual({ ok: true, value: null });
  });
  it('trims, collapses whitespace and removes control characters', () => {
    expect(sanitizeExplanation('  6,079 lebih\u0000 panjang\n\njadi   lebih besar ')).toEqual({
      ok: true,
      value: '6,079 lebih panjang jadi lebih besar',
    });
    expect(sanitizeExplanation('a​b‮c')).toEqual({ ok: true, value: 'a b c' });
  });
  it('rejects non-strings', () => {
    expect(sanitizeExplanation(42).ok).toBe(false);
    expect(sanitizeExplanation({ text: 'x' }).ok).toBe(false);
  });
  it('enforces the 280-character limit after cleaning', () => {
    expect(sanitizeExplanation('x'.repeat(EXPLANATION_MAX))).toEqual({ ok: true, value: 'x'.repeat(EXPLANATION_MAX) });
    expect(sanitizeExplanation('x'.repeat(EXPLANATION_MAX + 1)).ok).toBe(false);
    expect(sanitizeExplanation(`  ${'x'.repeat(EXPLANATION_MAX)}  `).ok).toBe(true);
  });
});
