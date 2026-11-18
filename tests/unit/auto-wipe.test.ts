/**
 * RemediAide — Auto-Wipe Unit Tests
 * Task 17
 *
 * Tests the pure-logic aspects of the auto-wipe module:
 *   - `previewAutoWipe`: reads counts without deleting.
 *   - `executeAutoWipe`: deletes responses, preserves ConceptDiagnosis,
 *     records AutoWipeLog, returns correct metadata.
 *   - Transaction rollback when an inner step throws.
 *   - Result type shape is correct.
 *
 * All Prisma calls are mocked — no DB is required.
 *
 * Requirements: 13.1–13.7
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Minimal tx type used in transaction mock callbacks ───────────────────────
type TxCallback = (tx: Record<string, Record<string, ReturnType<typeof vi.fn>>>) => Promise<AutoWipeResult>;

// ─── vi.hoisted ensures these are initialised before vi.mock hoisting ─────────

const mocks = vi.hoisted(() => ({
  responseCount: vi.fn(),
  responseDeleteMany: vi.fn(),
  responseFindMany: vi.fn(),
  autoWipeLogCreate: vi.fn(),
  sessionPinFindUnique: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    response: {
      count: mocks.responseCount,
      deleteMany: mocks.responseDeleteMany,
      findMany: mocks.responseFindMany,
    },
    autoWipeLog: {
      create: mocks.autoWipeLogCreate,
    },
    sessionPin: {
      findUnique: mocks.sessionPinFindUnique,
    },
    $transaction: mocks.transaction,
  },
}));

import {
  executeAutoWipe,
  previewAutoWipe,
  type AutoWipeResult,
} from '@/lib/privacy/auto-wipe';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ThrowAt = 'delete' | 'log' | 'schoolIdLookup';

/**
 * Set up mocks.transaction to run the callback immediately with a fake tx object.
 * Optionally throws at a specified step to simulate rollback.
 */
function setupTransactionMock(opts: {
  responseCount?: number;
  schoolId?: string;
  throwAt?: ThrowAt;
}) {
  const { responseCount = 5, schoolId = 'school-01', throwAt } = opts;

  const tx = {
    response: {
      count: vi.fn().mockResolvedValue(responseCount),
      deleteMany: vi.fn().mockImplementation(async () => {
        if (throwAt === 'delete') throw new Error('DB write error');
        return { count: responseCount };
      }),
    },
    autoWipeLog: {
      create: vi.fn().mockImplementation(async () => {
        if (throwAt === 'log') throw new Error('Log write error');
        return { id: 'log-1' };
      }),
    },
    sessionPin: {
      findUnique: vi.fn().mockImplementation(async () => {
        if (throwAt === 'schoolIdLookup') throw new Error('Lookup error');
        return { schoolId };
      }),
    },
  };

  mocks.transaction.mockImplementation(
      async (callback: TxCallback) => callback(tx)
    );

  return tx;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('executeAutoWipe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns correct AutoWipeResult metadata', async () => {
    setupTransactionMock({ responseCount: 12, schoolId: 'school-42' });

    const result = await executeAutoWipe('session-1', 'teacher-1');

    expect(result.sessionId).toBe('session-1');
    expect(result.confirmedBy).toBe('teacher-1');
    expect(result.recordsDeleted).toBe(12);
    expect(result.wipedAt).toBeInstanceOf(Date);
  });

  it('calls response.deleteMany with the correct sessionPinId', async () => {
    const tx = setupTransactionMock({ responseCount: 3 });

    await executeAutoWipe('session-X', 'teacher-Y');

    expect(tx.response.deleteMany).toHaveBeenCalledWith({
      where: { sessionPinId: 'session-X' },
    });
  });

  it('creates an AutoWipeLog entry with correct data', async () => {
    const tx = setupTransactionMock({ responseCount: 7, schoolId: 'school-01' });

    await executeAutoWipe('session-2', 'teacher-2');

    expect(tx.autoWipeLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionPinId: 'session-2',
          confirmedById: 'teacher-2',
          recordsDeleted: 7,
          success: true,
          errorMessage: null,
        }),
      })
    );
  });

  it('does NOT call conceptDiagnosis or remedialGroup deleteMany', async () => {
    const tx = {
      response: {
        count: vi.fn().mockResolvedValue(5),
        deleteMany: vi.fn().mockResolvedValue({ count: 5 }),
      },
      autoWipeLog: { create: vi.fn().mockResolvedValue({}) },
      sessionPin: {
        findUnique: vi.fn().mockResolvedValue({ schoolId: 'school-01' }),
      },
      conceptDiagnosis: { deleteMany: vi.fn() },
      remedialGroup: { deleteMany: vi.fn() },
    };

    mocks.transaction.mockImplementation(
      async (cb: TxCallback) => cb(tx)
    );

    await executeAutoWipe('session-3', 'teacher-3');

    expect(tx.conceptDiagnosis.deleteMany).not.toHaveBeenCalled();
    expect(tx.remedialGroup.deleteMany).not.toHaveBeenCalled();
  });

  it('propagates error when response.deleteMany throws (transaction rolls back)', async () => {
    const tx = {
      response: {
        count: vi.fn().mockResolvedValue(5),
        deleteMany: vi.fn().mockRejectedValue(new Error('DB write error')),
      },
      autoWipeLog: { create: vi.fn() },
      sessionPin: { findUnique: vi.fn().mockResolvedValue({ schoolId: 'school-01' }) },
    };
    mocks.transaction.mockImplementation(
      async (cb: TxCallback) => cb(tx)
    );

    await expect(executeAutoWipe('session-err', 'teacher-err')).rejects.toThrow(
      'DB write error'
    );
    // AutoWipeLog must NOT have been written since delete failed
    expect(tx.autoWipeLog.create).not.toHaveBeenCalled();
  });

  it('propagates error when AutoWipeLog.create throws', async () => {
    const tx = {
      response: {
        count: vi.fn().mockResolvedValue(3),
        deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
      autoWipeLog: {
        create: vi.fn().mockRejectedValue(new Error('Log write error')),
      },
      sessionPin: { findUnique: vi.fn().mockResolvedValue({ schoolId: 'school-01' }) },
    };
    mocks.transaction.mockImplementation(
      async (cb: TxCallback) => cb(tx)
    );

    await expect(executeAutoWipe('session-log-err', 'teacher-1')).rejects.toThrow(
      'Log write error'
    );
  });

  it('counts responses before deletion to report recordsDeleted', async () => {
    const tx = setupTransactionMock({ responseCount: 4 });

    const result = await executeAutoWipe('session-count', 'teacher-1');

    expect(tx.response.count).toHaveBeenCalledWith({
      where: { sessionPinId: 'session-count' },
    });
    expect(result.recordsDeleted).toBe(4);
  });

  it('returns recordsDeleted=0 when session has no responses', async () => {
    setupTransactionMock({ responseCount: 0 });

    const result = await executeAutoWipe('session-empty', 'teacher-1');
    expect(result.recordsDeleted).toBe(0);
  });
});

describe('previewAutoWipe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns responseCount, studentCount, and sessionTopic without deleting', async () => {
    mocks.responseCount.mockResolvedValue(10);
    mocks.responseFindMany.mockResolvedValue([
      { studentId: 'student-1' },
      { studentId: 'student-2' },
    ]);
    mocks.sessionPinFindUnique.mockResolvedValue({
      test: { topic: 'Persamaan Kuadrat' },
    });

    const result = await previewAutoWipe('session-preview');

    expect(result.responseCount).toBe(10);
    expect(typeof result.studentCount).toBe('number');
    expect(result.sessionTopic).toBe('Persamaan Kuadrat');
  });

  it('does NOT call response.deleteMany', async () => {
    mocks.responseCount.mockResolvedValue(5);
    mocks.responseFindMany.mockResolvedValue([]);
    mocks.sessionPinFindUnique.mockResolvedValue({ test: { topic: 'Test' } });

    await previewAutoWipe('session-preview-2');

    expect(mocks.responseDeleteMany).not.toHaveBeenCalled();
  });

  it('returns sessionTopic as "Tidak diketahui" when session not found', async () => {
    mocks.responseCount.mockResolvedValue(0);
    mocks.responseFindMany.mockResolvedValue([]);
    mocks.sessionPinFindUnique.mockResolvedValue(null);

    const result = await previewAutoWipe('session-missing');
    expect(result.sessionTopic).toBe('Tidak diketahui');
  });

  it('returns responseCount=0 for a session with no responses', async () => {
    mocks.responseCount.mockResolvedValue(0);
    mocks.responseFindMany.mockResolvedValue([]);
    mocks.sessionPinFindUnique.mockResolvedValue({ test: { topic: 'Topic A' } });

    const result = await previewAutoWipe('session-no-resp');
    expect(result.responseCount).toBe(0);
    expect(result.studentCount).toBe(0);
  });
});

describe('AutoWipeResult shape', () => {
  it('result has the correct fields with correct types', async () => {
    setupTransactionMock({ responseCount: 3 });

    const result: AutoWipeResult = await executeAutoWipe('sess', 'teacher');

    expect(typeof result.sessionId).toBe('string');
    expect(typeof result.confirmedBy).toBe('string');
    expect(typeof result.recordsDeleted).toBe('number');
    expect(result.wipedAt).toBeInstanceOf(Date);
  });
});
