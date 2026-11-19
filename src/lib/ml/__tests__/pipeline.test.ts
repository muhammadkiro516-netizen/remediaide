/**
 * T64: ML call from the diagnosis pipeline. fetch is mocked: success, timeout, HTTP 500, malformed body.
 * In every failure case B0 (ConceptDiagnosis) is still written and no exception escapes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  sessionFind: vi.fn(),
  responseFind: vi.fn(),
  variantFind: vi.fn(),
  questionFind: vi.fn(),
  cdUpsert: vi.fn(),
  cdFind: vi.fn(),
  rgDelete: vi.fn(),
  rgCreate: vi.fn(),
  mlDelete: vi.fn(),
  mlCreate: vi.fn(),
  tx: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    sessionPin: { findUnique: m.sessionFind },
    response: { findMany: m.responseFind },
    itemVariant: { findMany: m.variantFind },
    question: { findMany: m.questionFind },
    conceptDiagnosis: { upsert: m.cdUpsert, findMany: m.cdFind },
    remedialGroup: { deleteMany: m.rgDelete, create: m.rgCreate },
    mlDiagnosis: { deleteMany: m.mlDelete, createMany: m.mlCreate },
    $transaction: m.tx,
  },
}));
vi.mock('@/lib/sse/heatmap-builder', () => ({ buildHeatmapState: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/sse/manager', () => ({ sseManager: { broadcast: vi.fn() } }));

import { computeConceptDiagnosis } from '@/lib/diagnosis/compute';
import { studentKey } from '../client';
import { runMlDiagnosis } from '../pipeline';

const SALT = 'test-salt';
const probs = { PAHAM_KONSEP: 0.1, LUCKY_GUESS: 0.1, MISKONSEPSI: 0.7, TIDAK_PAHAM: 0.1 };

function okBody() {
  return {
    model_version: 'rmd2-test',
    latency_ms: 12,
    students: [{
      student_key: studentKey('stu-1', SALT),
      per_question: [{ question_id: 'q-1', quadrant_probs: probs, quadrant: 'MISKONSEPSI', prediction_set: ['MISKONSEPSI'],
                       rule_status: 'MISKONSEPSI', misconception: { label: 'Longer_is_bigger', label_id: 'Angka lebih panjang dianggap lebih besar', prob: 0.8 },
                       hidden_misconception: false, rapid_guess: false }],
      summary: { quadrant: 'MISKONSEPSI', mastery_prob: 0.2, deferred: true, rule_status: 'MISKONSEPSI',
                 reasons: [{ text: 'akurasi keseluruhan sejauh ini 0%', impact: 0.3 }] },
    }],
  };
}

const fetchOk = () => vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => okBody() });

beforeEach(() => {
  vi.clearAllMocks();
  m.sessionFind.mockResolvedValue({ id: 's-1', schoolId: 'sch-1' });
  m.responseFind.mockResolvedValue([{ id: 'r-1', studentId: 'stu-1', chosenOptionKey: 'B', criValue: 4, responseTimeMs: 9000,
    itemVariantId: 'v-1', explanation: '6,079 lebih panjang', submittedAt: new Date('2026-11-30T08:00:00Z') }]);
  m.variantFind.mockResolvedValue([{ id: 'v-1', questionId: 'q-1', correctOptionKey: 'A', tauMinSeconds: 4, renderedText: 'Mana yang terbesar?',
    renderedOptions: [{ key: 'A', text: '6,2' }, { key: 'B', text: '6,079' }] }]);
  m.questionFind.mockResolvedValue([{ id: 'q-1', templateText: 'Mana yang terbesar?', mapQuestionId: 32835 }]);
  m.cdUpsert.mockResolvedValue({});
  m.cdFind.mockResolvedValue([]);
  m.rgDelete.mockResolvedValue({});
  m.tx.mockResolvedValue([]);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllEnvs());

describe('runMlDiagnosis', () => {
  it('writes per-question + summary rows on success, with pseudonymised ids only in the payload', async () => {
    const f = fetchOk();
    const n = await runMlDiagnosis('s-1', 'sch-1', { url: 'http://ml', salt: SALT, fetchImpl: f as unknown as typeof fetch });
    expect(n).toBe(2);
    const sent = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
    expect(JSON.stringify(sent)).not.toContain('stu-1');
    expect(sent.responses[0]).toMatchObject({ is_correct: false, cri: 4, explanation: '6,079 lebih panjang', chosen_option_text: '6,079' });
    expect(sent.items[0].map_question_id).toBe(32835);
    const rows = m.mlCreate.mock.calls[0][0].data;
    expect(rows[0]).toMatchObject({ studentId: 'stu-1', questionId: 'q-1', quadrant: 'MISKONSEPSI',
                                    misconceptionLabel: 'Angka lebih panjang dianggap lebih besar' });
    expect(rows[1]).toMatchObject({ questionId: null, deferred: true });
    expect(JSON.stringify(rows)).not.toContain('6,079 lebih panjang'); // student text never stored in MlDiagnosis
  });

  it('times out without throwing', async () => {
    const f = vi.fn((_u: string, init: RequestInit) => new Promise((_res, rej) => {
      init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    const n = await runMlDiagnosis('s-1', 'sch-1', { url: 'http://ml', salt: SALT, timeoutMs: 20, fetchImpl: f as unknown as typeof fetch });
    expect(n).toBe(0);
    expect(m.mlCreate).not.toHaveBeenCalled();
  });

  it('ignores HTTP 500', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    expect(await runMlDiagnosis('s-1', 'sch-1', { url: 'http://ml', salt: SALT, fetchImpl: f as unknown as typeof fetch })).toBe(0);
  });

  it('ignores a malformed body', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ students: [{ student_key: 'x' }] }) });
    expect(await runMlDiagnosis('s-1', 'sch-1', { url: 'http://ml', salt: SALT, fetchImpl: f as unknown as typeof fetch })).toBe(0);
    expect(m.mlCreate).not.toHaveBeenCalled();
  });

  it('is off without ML_SERVICE_URL or without a salt', async () => {
    const f = fetchOk();
    expect(await runMlDiagnosis('s-1', 'sch-1', { salt: SALT, fetchImpl: f as unknown as typeof fetch })).toBe(0);
    expect(await runMlDiagnosis('s-1', 'sch-1', { url: 'http://ml', fetchImpl: f as unknown as typeof fetch })).toBe(0);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('computeConceptDiagnosis with a failing ML service', () => {
  it('still writes the v1 (B0) ConceptDiagnosis', async () => {
    vi.stubEnv('ML_SERVICE_URL', 'http://127.0.0.1:9');
    vi.stubEnv('RESEARCH_EXPORT_SALT', SALT);
    vi.stubEnv('ML_TIMEOUT_MS', '50');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(computeConceptDiagnosis('s-1')).resolves.toBeUndefined();
    expect(m.cdUpsert).toHaveBeenCalledTimes(1);
    expect(m.mlCreate).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
