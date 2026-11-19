import { describe, expect, it, vi, beforeEach } from 'vitest';
import { buildResearchCsv, RESEARCH_COLUMNS } from '../research-export';

const row = {
  studentId: 'stu-uuid-123', questionId: 'q-uuid-9', mapQuestionId: null, chosenOptionKey: 'B', correctOptionKey: 'A',
  criValue: 4, responseTimeMs: 7300, tauMinSeconds: 4, explanation: 'karena "6,079" lebih panjang, jadi lebih besar',
  submittedAt: new Date('2026-11-30T08:12:00Z'),
};

describe('buildResearchCsv', () => {
  it('has exactly the pilot schema columns and no internal identifiers', () => {
    const csv = buildResearchCsv('sess-uuid-1', [row, { ...row, mapQuestionId: 32835 }], 'salt');
    const [header, ...lines] = csv.trim().split('\n');
    expect(header.split(',')).toEqual([...RESEARCH_COLUMNS]);
    for (const banned of ['stu-uuid-123', 'q-uuid-9', 'sess-uuid-1', 'anonymous', 'Siswa', 'nis']) {
      expect(csv.toLowerCase()).not.toContain(banned.toLowerCase());
    }
    expect(lines[1].split(',')[2]).toBe('32835');
    expect(lines[0]).toContain('"karena ""6,079"" lebih panjang, jadi lebih besar"');
  });
  it('keys differ across sessions for the same student', () => {
    const a = buildResearchCsv('s1', [row], 'salt').split('\n')[1].split(',')[0];
    const b = buildResearchCsv('s2', [row], 'salt').split('\n')[1].split(',')[0];
    expect(a).not.toBe(b);
  });
});

const m = vi.hoisted(() => ({ pinFind: vi.fn(), respFind: vi.fn(), teacher: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ prisma: { sessionPin: { findFirst: m.pinFind }, response: { findMany: m.respFind } } }));
vi.mock('@/lib/auth/session', () => ({ requireTeacherSession: m.teacher }));

describe('GET /api/sessions/:id/export/research', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.teacher.mockResolvedValue({ userId: 't-1', schoolId: 'sch', role: 'TEACHER', name: 'x', email: 'x' });
    vi.stubEnv('RESEARCH_EXPORT_SALT', 'salt');
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });
  it('returns 403 without research consent', async () => {
    m.pinFind.mockResolvedValue({ id: 's', researchConsent: false, test: { teacherId: 't-1' } });
    const { GET } = await import('@/app/api/sessions/[id]/export/research/route');
    const res = await GET({} as never, { params: { id: 's' } });
    expect(res.status).toBe(403);
    expect(m.respFind).not.toHaveBeenCalled();
  });
  it('returns 403 for a teacher who does not own the session', async () => {
    m.pinFind.mockResolvedValue({ id: 's', researchConsent: true, test: { teacherId: 'other' } });
    const { GET } = await import('@/app/api/sessions/[id]/export/research/route');
    expect((await GET({} as never, { params: { id: 's' } })).status).toBe(403);
  });
  it('returns the CSV with consent, without forbidden columns', async () => {
    m.pinFind.mockResolvedValue({ id: 's', researchConsent: true, test: { teacherId: 't-1' } });
    m.respFind.mockResolvedValue([{ studentId: 'stu-uuid-123', chosenOptionKey: 'B', criValue: 4, responseTimeMs: 7300,
      explanation: null, submittedAt: new Date('2026-11-30T08:12:00Z'),
      itemVariant: { correctOptionKey: 'A', tauMinSeconds: 4, questionId: 'q', question: { mapQuestionId: null } } }]);
    const { GET } = await import('@/app/api/sessions/[id]/export/research/route');
    const res = await GET({} as never, { params: { id: 's' } });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text.split('\n')[0]).toBe(RESEARCH_COLUMNS.join(','));
    expect(text).not.toContain('stu-uuid-123');
  });
});
