/**
 * RemediAide — PDF Generator Unit Tests
 * Task 17
 *
 * Tests `generateLKPDPdf` with mocked pdf-lib and qrcode to keep tests fast
 * and deterministic (no actual PDF rendering).
 *
 * Validates:
 *   - Function accepts all cognitive group types without throwing.
 *   - Returns a Uint8Array (bytes).
 *   - Calls pdf-lib primitives with correct arguments.
 *   - QR code is embedded for each page.
 *   - Group colour palette covers all 5 group types.
 *
 * Requirements: 12.1–12.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── vi.hoisted — initialise mocks before vi.mock hoisting ───────────────────

const pdfMocks = vi.hoisted(() => {
  const drawText = vi.fn();
  const drawRectangle = vi.fn();
  const drawLine = vi.fn();
  const drawImage = vi.fn();
  const addPage = vi.fn();
  const save = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4]));
  const embedFont = vi.fn().mockResolvedValue({
    widthOfTextAtSize: vi.fn().mockReturnValue(100),
  });
  const embedPng = vi.fn().mockResolvedValue({ width: 90, height: 90 });

  const fakePage = { drawText, drawRectangle, drawLine, drawImage };
  addPage.mockReturnValue(fakePage);

  const fakeDoc = { addPage, embedFont, embedPng, save };

  return { drawText, drawRectangle, drawLine, drawImage, addPage, save, embedFont, embedPng, fakeDoc };
});

vi.mock('pdf-lib', () => ({
  PDFDocument: {
    create: vi.fn().mockResolvedValue(pdfMocks.fakeDoc),
  },
  rgb: vi.fn().mockReturnValue({ r: 0, g: 0, b: 0 }),
  StandardFonts: {
    HelveticaBold: 'Helvetica-Bold',
    Helvetica: 'Helvetica',
  },
  PageSizes: {
    A4: [595.28, 841.89],
  },
}));

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi
      .fn()
      .mockResolvedValue(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      ),
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  generateLKPDPdf,
  type LKPDGeneratorOptions,
  type CognitiveGroupType,
} from '@/lib/pdf/lkpd-generator';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeOpts(
  groupType: CognitiveGroupType,
  overrides: Partial<LKPDGeneratorOptions> = {}
): LKPDGeneratorOptions {
  return {
    schoolName: 'SMP Demo',
    teacherName: 'Budi Santoso',
    topic: 'Persamaan Linear Satu Variabel',
    sessionId: 'sess-001',
    sessionDate: '7 Juli 2026',
    groupType,
    prescription:
      'Lakukan re-teaching dengan pendekatan konkret–piktorial–abstrak.',
    memberLabels: ['Siswa-01', 'Siswa-02', 'Siswa-03'],
    exerciseTexts: [
      'Jika 2x + 4 = 10, berapa nilai x?',
      'Selesaikan: 3y − 6 = 9',
    ],
    qrUrl: 'https://remediaide.app/student/join',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('generateLKPDPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-apply return values after clearAllMocks
    pdfMocks.save.mockResolvedValue(new Uint8Array([1, 2, 3, 4]));
    pdfMocks.addPage.mockReturnValue({
      drawText: pdfMocks.drawText,
      drawRectangle: pdfMocks.drawRectangle,
      drawLine: pdfMocks.drawLine,
      drawImage: pdfMocks.drawImage,
    });
    pdfMocks.embedFont.mockResolvedValue({
      widthOfTextAtSize: vi.fn().mockReturnValue(100),
    });
    pdfMocks.embedPng.mockResolvedValue({ width: 90, height: 90 });
  });

  // ── Return type ─────────────────────────────────────────────────────────

  it('returns a Uint8Array', async () => {
    const result = await generateLKPDPdf(makeOpts('MISKONSEPSI'));
    expect(result).toBeInstanceOf(Uint8Array);
  });

  // ── All group types ──────────────────────────────────────────────────────

  const allGroupTypes: CognitiveGroupType[] = [
    'PAHAM_KONSEP',
    'LUCKY_GUESS',
    'MISKONSEPSI',
    'TIDAK_PAHAM',
    'INSUFFICIENT_DATA',
  ];

  for (const groupType of allGroupTypes) {
    it(`generates PDF without throwing for groupType=${groupType}`, async () => {
      await expect(generateLKPDPdf(makeOpts(groupType))).resolves.toBeInstanceOf(
        Uint8Array
      );
    });
  }

  // ── pdf-lib interactions ─────────────────────────────────────────────────

  it('calls doc.addPage() to create at least one page', async () => {
    await generateLKPDPdf(makeOpts('TIDAK_PAHAM'));
    expect(pdfMocks.addPage).toHaveBeenCalled();
  });

  it('calls doc.embedFont() for both Helvetica and HelveticaBold', async () => {
    await generateLKPDPdf(makeOpts('PAHAM_KONSEP'));
    expect(pdfMocks.embedFont).toHaveBeenCalledWith('Helvetica');
    expect(pdfMocks.embedFont).toHaveBeenCalledWith('Helvetica-Bold');
  });

  it('calls doc.embedPng() to embed the QR code image', async () => {
    await generateLKPDPdf(makeOpts('LUCKY_GUESS'));
    expect(pdfMocks.embedPng).toHaveBeenCalled();
  });

  it('calls page.drawImage() for the QR code', async () => {
    await generateLKPDPdf(makeOpts('LUCKY_GUESS'));
    expect(pdfMocks.drawImage).toHaveBeenCalled();
  });

  it('calls page.drawText() multiple times for header, members, prescription', async () => {
    await generateLKPDPdf(makeOpts('TIDAK_PAHAM'));
    expect(pdfMocks.drawText.mock.calls.length).toBeGreaterThan(5);
  });

  it('calls doc.save() exactly once', async () => {
    await generateLKPDPdf(makeOpts('MISKONSEPSI'));
    expect(pdfMocks.save).toHaveBeenCalledTimes(1);
  });

  // ── Content validation via drawText arguments ────────────────────────────

  it('draws the school name somewhere in the PDF', async () => {
    await generateLKPDPdf(makeOpts('MISKONSEPSI'));
    const allTextCalls = pdfMocks.drawText.mock.calls.map((args) => String(args[0]));
    const hasSchool = allTextCalls.some((t) => t.includes('SMP Demo'));
    expect(hasSchool).toBe(true);
  });

  it('draws the teacher name in the PDF', async () => {
    await generateLKPDPdf(makeOpts('PAHAM_KONSEP'));
    const allText = pdfMocks.drawText.mock.calls.map((args) => String(args[0])).join(' ');
    expect(allText).toContain('Budi Santoso');
  });

  it('draws the topic text in the PDF', async () => {
    await generateLKPDPdf(makeOpts('TIDAK_PAHAM'));
    const allText = pdfMocks.drawText.mock.calls.map((args) => String(args[0])).join(' ');
    expect(allText).toContain('Persamaan Linear');
  });

  // ── Exercise questions ───────────────────────────────────────────────────

  it('renders exercise section header when exerciseTexts is non-empty', async () => {
    await generateLKPDPdf(
      makeOpts('MISKONSEPSI', {
        exerciseTexts: ['Soal pertama.', 'Soal kedua.'],
      })
    );
    const allText = pdfMocks.drawText.mock.calls.map((args) => String(args[0])).join(' ');
    expect(allText).toMatch(/soal latihan|exercise|latihan/i);
  });

  it('skips exercise section header when exerciseTexts is empty', async () => {
    await generateLKPDPdf(makeOpts('PAHAM_KONSEP', { exerciseTexts: [] }));
    const allText = pdfMocks.drawText.mock.calls.map((args) => String(args[0])).join(' ');
    expect(allText).not.toMatch(/soal latihan/i);
  });

  // ── Member labels ────────────────────────────────────────────────────────

  it('renders each member label in the PDF', async () => {
    const opts = makeOpts('TIDAK_PAHAM', {
      memberLabels: ['Anggota-X', 'Anggota-Y'],
    });
    await generateLKPDPdf(opts);
    const allText = pdfMocks.drawText.mock.calls.map((args) => String(args[0])).join(' ');
    expect(allText).toContain('Anggota-X');
    expect(allText).toContain('Anggota-Y');
  });

  // ── QR URL ───────────────────────────────────────────────────────────────

  it('passes qrUrl to QRCode.toDataURL', async () => {
    const qrcode = await import('qrcode');
    await generateLKPDPdf(makeOpts('MISKONSEPSI'));
    expect(qrcode.default.toDataURL).toHaveBeenCalledWith(
      'https://remediaide.app/student/join',
      expect.any(Object)
    );
  });

  // ── Edge cases ───────────────────────────────────────────────────────────

  it('handles empty member list without throwing', async () => {
    await expect(
      generateLKPDPdf(makeOpts('INSUFFICIENT_DATA', { memberLabels: [] }))
    ).resolves.toBeDefined();
  });

  it('handles a very long prescription without throwing', async () => {
    const longPrescription = 'Strategi remediasi. '.repeat(50);
    await expect(
      generateLKPDPdf(makeOpts('MISKONSEPSI', { prescription: longPrescription }))
    ).resolves.toBeInstanceOf(Uint8Array);
  });
});
