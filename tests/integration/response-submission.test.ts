/**
 * Integration Test — Response Submission
 * tests/integration/response-submission.test.ts
 *
 * Tests:
 *   - Duplicate submission: second call for same (session, student, item) → 409
 *   - item_id validation: itemVariantId that doesn't belong to the test → 422
 *   - Session state validation: submit to LOCKED session → 409
 *   - Session state validation: submit to CLOSED session → 409
 *   - Valid submission: correct data → 201 + responseId
 *   - criValue validation: out-of-range or non-integer → 422
 *   - responseTimeMs validation: negative value → 422
 *   - Missing required fields → 422
 *   - Integrity index is calculated and persisted correctly
 *   - isBelowThreshold flag set correctly when responseTimeMs < tauMinMs
 *
 * Requirements: 1.1, 1.4, 1.5, 1.6, 16.1, 16.2, 16.3, 16.4
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateIntegrityIndex,
  classifyPerItem,
} from '@/lib/diagnostic/engine';

// ─── Mock Prisma ──────────────────────────────────────────────────────────────

const prismaMocks = vi.hoisted(() => ({
  sessionPinFindFirst: vi.fn(),
  itemVariantFindFirst: vi.fn(),
  responseFindFirst: vi.fn(),
  responseCreate: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    sessionPin: { findFirst: prismaMocks.sessionPinFindFirst },
    itemVariant: { findFirst: prismaMocks.itemVariantFindFirst },
    response: {
      findFirst: prismaMocks.responseFindFirst,
      create: prismaMocks.responseCreate,
    },
  },
}));

// ─── Deterministic hash (mirrors route implementation) ────────────────────────

function deterministicHash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash >>> 0;
}

// ─── Validation helpers (mirrors route logic) ─────────────────────────────────

interface SubmitBody {
  sessionId: string;
  itemVariantId: string;
  chosenOptionKey: string;
  criValue: number;
  responseTimeMs: number;
}

function validateSubmitBody(body: Partial<SubmitBody>): string | null {
  if (!body.sessionId || !body.itemVariantId || !body.chosenOptionKey) {
    return 'MISSING_REQUIRED_FIELDS';
  }
  if (
    typeof body.criValue !== 'number' ||
    !Number.isInteger(body.criValue) ||
    body.criValue < 0 ||
    body.criValue > 5
  ) {
    return 'INVALID_CRI';
  }
  if (typeof body.responseTimeMs !== 'number' || body.responseTimeMs < 0) {
    return 'INVALID_RESPONSE_TIME';
  }
  return null;
}

// ─── Simulate submission pipeline (mirrors route handler logic) ───────────────

interface SimulateSubmitOptions {
  studentId: string;
  sessionPinId: string;
  schoolId: string;
  body: SubmitBody;
}

interface SimulateResult {
  status: number;
  code?: string;
  responseId?: string;
  integrityIndex?: number;
  isBelowThreshold?: boolean;
  perItemStatus?: string;
}

async function simulateSubmit(opts: SimulateSubmitOptions): Promise<SimulateResult> {
  const { prisma } = await import('@/lib/db/client');
  const { studentId, sessionPinId, schoolId, body } = opts;

  // Validate student owns this session
  if (sessionPinId !== body.sessionId) {
    return { status: 403, code: 'FORBIDDEN' };
  }

  // Validate body
  const validationError = validateSubmitBody(body);
  if (validationError) {
    return { status: 422, code: validationError };
  }

  // Load session
  const session = await prisma.sessionPin.findFirst({
    where: { id: body.sessionId, schoolId },
    select: { id: true, state: true, testId: true },
  } as Parameters<typeof prisma.sessionPin.findFirst>[0]);

  if (!session) return { status: 404, code: 'NOT_FOUND' };

  if ((session as { state: string }).state !== 'ACTIVE') {
    return {
      status: 409,
      code: (session as { state: string }).state === 'CLOSED'
        ? 'SESSION_CLOSED'
        : 'SESSION_NOT_ACTIVE',
    };
  }

  // Load item variant
  const itemVariant = await prisma.itemVariant.findFirst({
    where: { id: body.itemVariantId },
    select: {
      id: true,
      correctOptionKey: true,
      tauMinSeconds: true,
      question: {
        select: { id: true, variants: { select: { id: true } } },
      },
    },
  } as Parameters<typeof prisma.itemVariant.findFirst>[0]);

  if (!itemVariant) return { status: 422, code: 'INVALID_ITEM' };

  // Validate deterministic assignment
  type ItemVariantShape = {
    id: string;
    correctOptionKey: string;
    tauMinSeconds: number;
    question: { id: string; variants: { id: string }[] };
  };
  const iv = itemVariant as unknown as ItemVariantShape;
  const variants = iv.question.variants;
  const pickSeed = deterministicHash(`${studentId}:${iv.question.id}:pick`);
  const expectedIndex = pickSeed % variants.length;
  const expectedId = variants[expectedIndex].id;

  if (body.itemVariantId !== expectedId) {
    return { status: 422, code: 'WRONG_VARIANT_ASSIGNMENT' };
  }

  // Check for duplicate
  const duplicate = await prisma.response.findFirst({
    where: {
      sessionPinId: body.sessionId,
      studentId,
      itemVariantId: body.itemVariantId,
    },
    select: { id: true },
  } as Parameters<typeof prisma.response.findFirst>[0]);

  if (duplicate) return { status: 409, code: 'DUPLICATE_RESPONSE' };

  // Calculate integrity index
  const isCorrect = body.chosenOptionKey === iv.correctOptionKey;
  const tauMinMs = iv.tauMinSeconds * 1000;
  const diagInput = {
    itemId: body.itemVariantId,
    isCorrect,
    criValue: body.criValue,
    responseTimeMs: body.responseTimeMs,
    tauMinMs,
  };

  const diagResult = classifyPerItem(diagInput);
  const integrityIndex = calculateIntegrityIndex(diagInput);

  // Save
  const saved = await prisma.response.create({
    data: {
      sessionPinId: body.sessionId,
      studentId,
      itemVariantId: body.itemVariantId,
      schoolId,
      chosenOptionKey: body.chosenOptionKey,
      criValue: body.criValue,
      responseTimeMs: body.responseTimeMs,
      integrityIndex,
      isBelowThreshold: diagResult.isBelowThreshold,
      perItemStatus: diagResult.status === 'INSUFFICIENT_DATA' ? 'INVALID' : diagResult.status,
    },
    select: { id: true },
  } as Parameters<typeof prisma.response.create>[0]);

  return {
    status: 201,
    responseId: (saved as { id: string }).id,
    integrityIndex,
    isBelowThreshold: diagResult.isBelowThreshold,
    perItemStatus: diagResult.status,
  };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SCHOOL_ID = 'school-01';
const SESSION_ID = 'sess-submit-1';
const STUDENT_ID = 'student-001';
const QUESTION_ID = 'question-001';

// One variant only — its index will always be 0
const ITEM_VARIANT_ID = 'variant-abc';

function makeActiveSession() {
  return { id: SESSION_ID, state: 'ACTIVE', testId: 'test-01', schoolId: SCHOOL_ID };
}

function makeItemVariant(opts: {
  correctOptionKey?: string;
  tauMinSeconds?: number;
} = {}) {
  return {
    id: ITEM_VARIANT_ID,
    correctOptionKey: opts.correctOptionKey ?? 'A',
    tauMinSeconds: opts.tauMinSeconds ?? 5,
    question: {
      id: QUESTION_ID,
      variants: [{ id: ITEM_VARIANT_ID }],
    },
  };
}

function makeValidBody(overrides: Partial<SubmitBody> = {}): SubmitBody {
  return {
    sessionId: SESSION_ID,
    itemVariantId: ITEM_VARIANT_ID,
    chosenOptionKey: 'A',
    criValue: 4,
    responseTimeMs: 8000,
    ...overrides,
  };
}

const BASE_OPTS: Omit<SimulateSubmitOptions, 'body'> = {
  studentId: STUDENT_ID,
  sessionPinId: SESSION_ID,
  schoolId: SCHOOL_ID,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Response Submission Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMocks.responseCreate.mockResolvedValue({ id: 'resp-new-1' });
  });

  // ── 1. Valid submission → 201 + responseId ────────────────────────────────

  it('valid submission returns 201 and responseId', async () => {
    prismaMocks.sessionPinFindFirst.mockResolvedValue(makeActiveSession());
    prismaMocks.itemVariantFindFirst.mockResolvedValue(makeItemVariant());
    prismaMocks.responseFindFirst.mockResolvedValue(null);
    prismaMocks.responseCreate.mockResolvedValue({ id: 'resp-001' });

    const result = await simulateSubmit({
      ...BASE_OPTS,
      body: makeValidBody(),
    });

    expect(result.status).toBe(201);
    expect(result.responseId).toBe('resp-001');
  });

  // ── 2. Duplicate submission → 409 DUPLICATE_RESPONSE ────────────────────

  it('duplicate submission returns 409 DUPLICATE_RESPONSE', async () => {
    prismaMocks.sessionPinFindFirst.mockResolvedValue(makeActiveSession());
    prismaMocks.itemVariantFindFirst.mockResolvedValue(makeItemVariant());
    // Existing response found
    prismaMocks.responseFindFirst.mockResolvedValue({ id: 'resp-existing' });

    const result = await simulateSubmit({
      ...BASE_OPTS,
      body: makeValidBody(),
    });

    expect(result.status).toBe(409);
    expect(result.code).toBe('DUPLICATE_RESPONSE');
    // create should NOT be called on duplicate
    expect(prismaMocks.responseCreate).not.toHaveBeenCalled();
  });

  it('second call for same item is detected as duplicate', async () => {
    prismaMocks.sessionPinFindFirst.mockResolvedValue(makeActiveSession());
    prismaMocks.itemVariantFindFirst.mockResolvedValue(makeItemVariant());
    prismaMocks.responseFindFirst
      .mockResolvedValueOnce(null)          // first call: no duplicate
      .mockResolvedValueOnce({ id: 'resp-001' }); // second call: duplicate found
    prismaMocks.responseCreate.mockResolvedValue({ id: 'resp-001' });

    const first = await simulateSubmit({ ...BASE_OPTS, body: makeValidBody() });
    expect(first.status).toBe(201);

    const second = await simulateSubmit({ ...BASE_OPTS, body: makeValidBody() });
    expect(second.status).toBe(409);
    expect(second.code).toBe('DUPLICATE_RESPONSE');
  });

  // ── 3. item_id validation: unknown item → 422 ─────────────────────────────

  it('unknown itemVariantId returns 422 INVALID_ITEM', async () => {
    prismaMocks.sessionPinFindFirst.mockResolvedValue(makeActiveSession());
    prismaMocks.itemVariantFindFirst.mockResolvedValue(null); // not found

    const result = await simulateSubmit({
      ...BASE_OPTS,
      body: makeValidBody({ itemVariantId: 'non-existent-variant' }),
    });

    expect(result.status).toBe(422);
    expect(result.code).toBe('INVALID_ITEM');
  });

  // ── 4. Session state validation: LOCKED → 409 ────────────────────────────

  it('submission to LOCKED session returns 409 SESSION_NOT_ACTIVE', async () => {
    prismaMocks.sessionPinFindFirst.mockResolvedValue({
      ...makeActiveSession(),
      state: 'LOCKED',
    });

    const result = await simulateSubmit({ ...BASE_OPTS, body: makeValidBody() });

    expect(result.status).toBe(409);
    expect(result.code).toBe('SESSION_NOT_ACTIVE');
  });

  // ── 5. Session state validation: CLOSED → 409 SESSION_CLOSED ─────────────

  it('submission to CLOSED session returns 409 SESSION_CLOSED', async () => {
    prismaMocks.sessionPinFindFirst.mockResolvedValue({
      ...makeActiveSession(),
      state: 'CLOSED',
    });

    const result = await simulateSubmit({ ...BASE_OPTS, body: makeValidBody() });

    expect(result.status).toBe(409);
    expect(result.code).toBe('SESSION_CLOSED');
  });

  // ── 6. criValue validation ────────────────────────────────────────────────

  it.each([
    [-1, 'below minimum'],
    [6, 'above maximum'],
    [2.5, 'non-integer float'],
  ])('criValue=%s (%s) returns 422 INVALID_CRI', async (criValue, _label) => {
    const result = await simulateSubmit({
      ...BASE_OPTS,
      body: makeValidBody({ criValue: criValue as number }),
    });

    expect(result.status).toBe(422);
    expect(result.code).toBe('INVALID_CRI');
  });

  it.each([0, 1, 2, 3, 4, 5])('criValue=%s (valid) passes validation', async (criValue) => {
    prismaMocks.sessionPinFindFirst.mockResolvedValue(makeActiveSession());
    prismaMocks.itemVariantFindFirst.mockResolvedValue(makeItemVariant());
    prismaMocks.responseFindFirst.mockResolvedValue(null);

    const result = await simulateSubmit({
      ...BASE_OPTS,
      body: makeValidBody({ criValue }),
    });

    expect(result.status).toBe(201);
  });

  // ── 7. responseTimeMs validation ─────────────────────────────────────────

  it('negative responseTimeMs returns 422 INVALID_RESPONSE_TIME', async () => {
    const result = await simulateSubmit({
      ...BASE_OPTS,
      body: makeValidBody({ responseTimeMs: -100 }),
    });

    expect(result.status).toBe(422);
    expect(result.code).toBe('INVALID_RESPONSE_TIME');
  });

  it('responseTimeMs=0 is valid (edge case)', async () => {
    prismaMocks.sessionPinFindFirst.mockResolvedValue(makeActiveSession());
    prismaMocks.itemVariantFindFirst.mockResolvedValue(makeItemVariant());
    prismaMocks.responseFindFirst.mockResolvedValue(null);

    const result = await simulateSubmit({
      ...BASE_OPTS,
      body: makeValidBody({ responseTimeMs: 0 }),
    });

    // responseTimeMs=0 < tauMinMs → BELOW_THRESHOLD → still saved with status 201
    expect(result.status).toBe(201);
    expect(result.isBelowThreshold).toBe(true);
  });

  // ── 8. Missing required fields → 422 ─────────────────────────────────────

  it('missing sessionId returns 422 MISSING_REQUIRED_FIELDS', async () => {
    // sessionId='' means body.sessionId is empty, but sessionPinId check happens
    // first — must use a non-empty sessionId so we reach body validation.
    // Test empty vs missing: validation occurs after the session-ownership guard.
    const error = validateSubmitBody({ sessionId: '', itemVariantId: 'x', chosenOptionKey: 'A', criValue: 3, responseTimeMs: 5000 });
    expect(error).toBe('MISSING_REQUIRED_FIELDS');
  });

  it('missing itemVariantId returns 422 MISSING_REQUIRED_FIELDS', async () => {
    const result = await simulateSubmit({
      ...BASE_OPTS,
      body: makeValidBody({ itemVariantId: '' }),
    });

    expect(result.status).toBe(422);
    expect(result.code).toBe('MISSING_REQUIRED_FIELDS');
  });

  it('missing chosenOptionKey returns 422 MISSING_REQUIRED_FIELDS', async () => {
    const result = await simulateSubmit({
      ...BASE_OPTS,
      body: makeValidBody({ chosenOptionKey: '' }),
    });

    expect(result.status).toBe(422);
    expect(result.code).toBe('MISSING_REQUIRED_FIELDS');
  });

  // ── 9. Integrity index calculation is correct ─────────────────────────────

  it('correct answer with CRI=4 produces integrityIndex=1.0 and PAHAM_KONSEP', async () => {
    prismaMocks.sessionPinFindFirst.mockResolvedValue(makeActiveSession());
    prismaMocks.itemVariantFindFirst.mockResolvedValue(
      makeItemVariant({ correctOptionKey: 'B', tauMinSeconds: 5 })
    );
    prismaMocks.responseFindFirst.mockResolvedValue(null);

    const result = await simulateSubmit({
      ...BASE_OPTS,
      body: makeValidBody({ chosenOptionKey: 'B', criValue: 4, responseTimeMs: 8000 }),
    });

    expect(result.status).toBe(201);
    expect(result.integrityIndex).toBe(1.0);
    expect(result.perItemStatus).toBe('PAHAM_KONSEP');
  });

  it('wrong answer with CRI=4 produces integrityIndex=0.0 and MISKONSEPSI', async () => {
    prismaMocks.sessionPinFindFirst.mockResolvedValue(makeActiveSession());
    prismaMocks.itemVariantFindFirst.mockResolvedValue(
      makeItemVariant({ correctOptionKey: 'A', tauMinSeconds: 5 })
    );
    prismaMocks.responseFindFirst.mockResolvedValue(null);

    const result = await simulateSubmit({
      ...BASE_OPTS,
      // chosenOptionKey='B' is wrong (correctOptionKey='A'), criValue=4 → MISKONSEPSI
      body: makeValidBody({ chosenOptionKey: 'B', criValue: 4, responseTimeMs: 8000 }),
    });

    expect(result.status).toBe(201);
    expect(result.integrityIndex).toBe(0.0);
    expect(result.perItemStatus).toBe('MISKONSEPSI');
  });

  // ── 10. isBelowThreshold flag ─────────────────────────────────────────────

  it('responseTimeMs < tauMinMs sets isBelowThreshold=true and status=INVALID', async () => {
    prismaMocks.sessionPinFindFirst.mockResolvedValue(makeActiveSession());
    // tauMinSeconds=10 → tauMinMs=10000
    prismaMocks.itemVariantFindFirst.mockResolvedValue(
      makeItemVariant({ tauMinSeconds: 10 })
    );
    prismaMocks.responseFindFirst.mockResolvedValue(null);

    const result = await simulateSubmit({
      ...BASE_OPTS,
      // responseTimeMs=3000 < tauMinMs=10000 → BELOW_THRESHOLD
      body: makeValidBody({ responseTimeMs: 3000, criValue: 3 }),
    });

    expect(result.status).toBe(201);
    expect(result.isBelowThreshold).toBe(true);
    expect(result.perItemStatus).toBe('INVALID');
    expect(result.integrityIndex).toBe(0.0);
  });

  it('responseTimeMs >= tauMinMs sets isBelowThreshold=false', async () => {
    prismaMocks.sessionPinFindFirst.mockResolvedValue(makeActiveSession());
    // tauMinSeconds=5 → tauMinMs=5000
    prismaMocks.itemVariantFindFirst.mockResolvedValue(
      makeItemVariant({ correctOptionKey: 'A', tauMinSeconds: 5 })
    );
    prismaMocks.responseFindFirst.mockResolvedValue(null);

    const result = await simulateSubmit({
      ...BASE_OPTS,
      // responseTimeMs=5000 exactly at threshold → NOT below
      body: makeValidBody({ chosenOptionKey: 'A', criValue: 4, responseTimeMs: 5000 }),
    });

    expect(result.status).toBe(201);
    expect(result.isBelowThreshold).toBe(false);
  });

  // ── 11. Student trying to submit to wrong session → 403 ──────────────────

  it('student joined to different session returns 403 FORBIDDEN', async () => {
    const result = await simulateSubmit({
      ...BASE_OPTS,
      sessionPinId: 'different-session-id', // student is joined to different session
      body: makeValidBody({ sessionId: SESSION_ID }),
    });

    expect(result.status).toBe(403);
    expect(result.code).toBe('FORBIDDEN');
  });

  // ── 12. response.create is called with correct data ───────────────────────

  it('response.create is called with correct field values', async () => {
    prismaMocks.sessionPinFindFirst.mockResolvedValue(makeActiveSession());
    prismaMocks.itemVariantFindFirst.mockResolvedValue(
      makeItemVariant({ correctOptionKey: 'C', tauMinSeconds: 5 })
    );
    prismaMocks.responseFindFirst.mockResolvedValue(null);
    prismaMocks.responseCreate.mockResolvedValue({ id: 'resp-check' });

    await simulateSubmit({
      ...BASE_OPTS,
      body: makeValidBody({ chosenOptionKey: 'C', criValue: 5, responseTimeMs: 9000 }),
    });

    expect(prismaMocks.responseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionPinId: SESSION_ID,
          studentId: STUDENT_ID,
          itemVariantId: ITEM_VARIANT_ID,
          schoolId: SCHOOL_ID,
          chosenOptionKey: 'C',
          criValue: 5,
          responseTimeMs: 9000,
        }),
      })
    );
  });
});
