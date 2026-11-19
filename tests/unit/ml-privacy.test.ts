/**
 * RemediAide 2.0 — privacy guarantees of the ML integration (05_INTEGRATION_SPEC §2).
 * - The student explanation lives on Response, so executeAutoWipe (deleteMany on Response) removes it.
 * - MlDiagnosis / MlFeedback (kept after wipe) have no column that can hold student free text.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');

function modelBody(name: string): string {
  const m = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!m) throw new Error(`model ${name} not found`);
  return m[1];
}

describe('ML integration privacy', () => {
  it('stores the explanation on Response (wiped together with the row)', () => {
    expect(modelBody('Response')).toMatch(/\bexplanation\s+String\?/);
  });

  it('auto-wipe deletes every Response row of the session', () => {
    const src = readFileSync(join(__dirname, '../../src/lib/privacy/auto-wipe.ts'), 'utf8');
    expect(src).toMatch(/tx\.response\.deleteMany\(\{\s*where: \{ sessionPinId: sessionId \}/);
  });

  it('MlDiagnosis and MlFeedback have no free-text student field', () => {
    for (const name of ['MlDiagnosis', 'MlFeedback']) {
      const body = modelBody(name);
      expect(body).not.toMatch(/\bexplanation\b/i);
      expect(body).not.toMatch(/\balasan\b/i);
    }
  });

  it('research export is off by default', () => {
    expect(modelBody('SessionPin')).toMatch(/researchConsent\s+Boolean\s+@default\(false\)/);
  });
});
