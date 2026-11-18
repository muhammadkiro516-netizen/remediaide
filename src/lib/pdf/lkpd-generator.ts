/**
 * RemediAide — LKPD-KK PDF Generator
 *
 * Generates a Lembar Kerja Peserta Didik (LKPD) PDF for one remedial group.
 * Uses pdf-lib for layout control and embeds a QR code pointing to the
 * session's Exit Ticket URL.
 *
 * Output per call: one A4 PDF (Uint8Array) for a single cognitive group.
 */

import { PDFDocument, rgb, StandardFonts, PageSizes } from 'pdf-lib';
import QRCode from 'qrcode';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CognitiveGroupType =
  | 'PAHAM_KONSEP'
  | 'LUCKY_GUESS'
  | 'MISKONSEPSI'
  | 'TIDAK_PAHAM'
  | 'INSUFFICIENT_DATA';

export interface LKPDGeneratorOptions {
  /** Name of the school */
  schoolName: string;
  /** Teacher's display name */
  teacherName: string;
  /** Test topic / concept */
  topic: string;
  /** Session ID (used in QR URL) */
  sessionId: string;
  /** Formatted date string, e.g. "7 Juli 2026" */
  sessionDate: string;
  /** Cognitive group being printed */
  groupType: CognitiveGroupType;
  /** Remedial prescription text for this group */
  prescription: string;
  /** Anonymous labels of members in this group */
  memberLabels: string[];
  /** Exercise question texts to print (rendered variant texts) */
  exerciseTexts: string[];
  /** Full QR URL — e.g. https://remediaide.app/student/join */
  qrUrl: string;
}

// ─── Colour palette (WCAG AA safe) ───────────────────────────────────────────

const GROUP_COLORS: Record<CognitiveGroupType, { r: number; g: number; b: number }> = {
  PAHAM_KONSEP:      { r: 0.08, g: 0.50, b: 0.24 }, // green-700
  LUCKY_GUESS:       { r: 0.63, g: 0.38, b: 0.04 }, // yellow-700
  MISKONSEPSI:       { r: 0.73, g: 0.11, b: 0.11 }, // red-700
  TIDAK_PAHAM:       { r: 0.12, g: 0.23, b: 0.54 }, // blue-900
  INSUFFICIENT_DATA: { r: 0.42, g: 0.45, b: 0.50 }, // gray-500
};

const GROUP_LABELS: Record<CognitiveGroupType, string> = {
  PAHAM_KONSEP:      'Paham Konsep — Pengayaan',
  LUCKY_GUESS:       'Lucky Guess — Konfirmasi',
  MISKONSEPSI:       'Miskonsepsi — Rekonstruksi Konsep',
  TIDAK_PAHAM:       'Tidak Paham — Re-Teaching',
  INSUFFICIENT_DATA: 'Data Tidak Cukup — Observasi Langsung',
};

// ─── Constants ────────────────────────────────────────────────────────────────

// A4 at 72 DPI (pdf-lib default): 595.28 × 841.89 pt
const MARGIN = 56.7; // ~2 cm in pt
const LINE_HEIGHT = 14;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Wrap text to fit within maxWidth points given a font and size.
 * Returns array of lines.
 */
async function wrapText(
  text: string,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  fontSize: number,
  maxWidth: number
): Promise<string[]> {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(candidate, fontSize);
    if (width <= maxWidth) {
      currentLine = candidate;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

// ─── Main generator ───────────────────────────────────────────────────────────

/**
 * Generate an A4 LKPD-KK PDF for one remedial group.
 * Returns the PDF bytes ready to stream to the client.
 */
export async function generateLKPDPdf(opts: LKPDGeneratorOptions): Promise<Uint8Array> {
  const {
    schoolName,
    teacherName,
    topic,
    sessionDate,
    groupType,
    prescription,
    memberLabels,
    exerciseTexts,
    qrUrl,
  } = opts;

  const doc = await PDFDocument.create();
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);

  const [pageWidth, pageHeight] = PageSizes.A4; // 595.28 × 841.89
  const contentWidth = pageWidth - MARGIN * 2;
  const groupColor = GROUP_COLORS[groupType] ?? GROUP_COLORS.INSUFFICIENT_DATA;

  // ── QR Code ───────────────────────────────────────────────────────────────
  // Generate QR as PNG data URL, then embed into pdf-lib
  const qrDataUrl = await QRCode.toDataURL(qrUrl, {
    width: 120,
    margin: 1,
    errorCorrectionLevel: 'M',
  });
  // Strip "data:image/png;base64," prefix
  const qrBase64 = qrDataUrl.replace(/^data:image\/png;base64,/, '');
  const qrImageBytes = Buffer.from(qrBase64, 'base64');
  const qrImage = await doc.embedPng(qrImageBytes);
  const qrSize = 90; // pt

  // ── Page 1 ────────────────────────────────────────────────────────────────
  const page = doc.addPage(PageSizes.A4);
  let y = pageHeight - MARGIN;

  // Header bar (group color)
  page.drawRectangle({
    x: MARGIN,
    y: y - 30,
    width: contentWidth,
    height: 30,
    color: rgb(groupColor.r, groupColor.g, groupColor.b),
  });
  page.drawText('REMEDIAIDE — LKPD-KK', {
    x: MARGIN + 8,
    y: y - 22,
    size: 10,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });
  y -= 40;

  // School + date line
  page.drawText(`${schoolName}   •   ${sessionDate}   •   Guru: ${teacherName}`, {
    x: MARGIN,
    y,
    size: 9,
    font: helvetica,
    color: rgb(0.4, 0.4, 0.4),
  });
  y -= 18;

  // Topic
  const topicLines = await wrapText(`Topik: ${topic}`, helveticaBold, 13, contentWidth - qrSize - 16);
  for (const line of topicLines) {
    page.drawText(line, { x: MARGIN, y, size: 13, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
    y -= LINE_HEIGHT + 2;
  }
  y -= 4;

  // Group label
  const groupLabel = GROUP_LABELS[groupType];
  page.drawText(groupLabel, {
    x: MARGIN,
    y,
    size: 11,
    font: helveticaBold,
    color: rgb(groupColor.r, groupColor.g, groupColor.b),
  });

  // QR code — top right aligned
  const qrX = pageWidth - MARGIN - qrSize;
  const qrY = y - qrSize + 12;
  page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
  page.drawText('Scan untuk Exit Ticket', {
    x: qrX,
    y: qrY - 12,
    size: 7,
    font: helvetica,
    color: rgb(0.5, 0.5, 0.5),
  });

  y -= LINE_HEIGHT + 8;

  // Thin divider
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: pageWidth - MARGIN, y },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
  y -= 14;

  // Section: Members
  page.drawText('Anggota Kelompok:', {
    x: MARGIN,
    y,
    size: 10,
    font: helveticaBold,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= LINE_HEIGHT + 2;

  // Member labels in columns (3 per row)
  const colWidth = contentWidth / 3;
  let col = 0;
  for (const label of memberLabels) {
    const xPos = MARGIN + col * colWidth;
    page.drawText(`• ${label}`, {
      x: xPos,
      y,
      size: 9,
      font: helvetica,
      color: rgb(0.2, 0.2, 0.2),
    });
    col++;
    if (col >= 3) {
      col = 0;
      y -= LINE_HEIGHT;
    }
  }
  if (col > 0) y -= LINE_HEIGHT;
  y -= 10;

  // Thin divider
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: pageWidth - MARGIN, y },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
  y -= 14;

  // Section: Prescription
  page.drawText('Strategi Remediasi:', {
    x: MARGIN,
    y,
    size: 10,
    font: helveticaBold,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= LINE_HEIGHT + 2;

  const prescLines = await wrapText(prescription, helvetica, 9, contentWidth);
  for (const line of prescLines) {
    if (y < MARGIN + 60) {
      // Add new page if running out of space
      const newPage = doc.addPage(PageSizes.A4);
      y = pageHeight - MARGIN;
      page.drawText('', {}); // noop to keep current page reference clean
      // We draw on the new page from here
      newPage.drawText(line, { x: MARGIN, y, size: 9, font: helvetica, color: rgb(0.3, 0.3, 0.3) });
    } else {
      page.drawText(line, { x: MARGIN, y, size: 9, font: helvetica, color: rgb(0.3, 0.3, 0.3) });
    }
    y -= LINE_HEIGHT;
  }
  y -= 10;

  // Section: Exercises
  if (exerciseTexts.length > 0) {
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: pageWidth - MARGIN, y },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });
    y -= 14;

    page.drawText('Soal Latihan:', {
      x: MARGIN,
      y,
      size: 10,
      font: helveticaBold,
      color: rgb(0.2, 0.2, 0.2),
    });
    y -= LINE_HEIGHT + 4;

    for (let i = 0; i < exerciseTexts.length; i++) {
      const qText = exerciseTexts[i];
      const prefix = `${i + 1}. `;
      const qLines = await wrapText(qText, helvetica, 9, contentWidth - 16);

      for (let li = 0; li < qLines.length; li++) {
        if (y < MARGIN + 40) break; // safety — avoid running off page
        const lineText = li === 0 ? `${prefix}${qLines[li]}` : `    ${qLines[li]}`;
        page.drawText(lineText, {
          x: MARGIN,
          y,
          size: 9,
          font: helvetica,
          color: rgb(0.15, 0.15, 0.15),
        });
        y -= LINE_HEIGHT;
      }

      // Answer box
      if (y > MARGIN + 40) {
        y -= 4;
        page.drawRectangle({
          x: MARGIN,
          y: y - 28,
          width: contentWidth,
          height: 28,
          borderColor: rgb(0.7, 0.7, 0.7),
          borderWidth: 0.5,
          color: rgb(0.98, 0.98, 0.98),
        });
        page.drawText('Jawaban:', {
          x: MARGIN + 4,
          y: y - 10,
          size: 8,
          font: helvetica,
          color: rgb(0.6, 0.6, 0.6),
        });
        y -= 36;
      }
      y -= 6;
    }
  }

  // Footer
  const footerY = MARGIN - 10;
  page.drawText(
    `RemediAide • Sesi ID: ${opts.sessionId} • Dicetak: ${sessionDate}`,
    {
      x: MARGIN,
      y: footerY,
      size: 7,
      font: helvetica,
      color: rgb(0.6, 0.6, 0.6),
    }
  );

  return doc.save();
}
