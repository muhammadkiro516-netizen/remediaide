/**
 * Exit Ticket Category Theme Mapping
 *
 * Maps cognitive group categories to Tailwind CSS classes and Indonesian
 * reflection questions. Colors are consistent with GROUP_COLORS in
 * lkpd-generator.ts.
 */

// ─── 3.1 CognitiveGroupType ───────────────────────────────────────────────────

export type CognitiveGroupType =
  | 'PAHAM_KONSEP'
  | 'LUCKY_GUESS'
  | 'MISKONSEPSI'
  | 'TIDAK_PAHAM'
  | 'INSUFFICIENT_DATA';

// ─── 3.2 CategoryTheme ────────────────────────────────────────────────────────

export interface CategoryTheme {
  /** Tailwind background class untuk header dan aksen */
  bgClass: string;
  /** Tailwind text class untuk heading */
  headingClass: string;
  /** Tailwind class untuk tombol submit */
  buttonClass: string;
  /** Label yang ditampilkan di halaman */
  label: string;
  /** Pertanyaan refleksi yang ditampilkan di form */
  reflectionQuestion: string;
}

// ─── 3.3 CATEGORY_THEMES ──────────────────────────────────────────────────────

export const CATEGORY_THEMES: Record<CognitiveGroupType, CategoryTheme> = {
  PAHAM_KONSEP: {
    bgClass: 'bg-green-700',
    headingClass: 'text-green-800',
    buttonClass: 'bg-green-700 hover:bg-green-800',
    label: 'Paham Konsep',
    reflectionQuestion:
      'Coba jelaskan dengan kata-katamu sendiri, apa yang membuatmu yakin dengan jawabanmu?',
  },
  LUCKY_GUESS: {
    bgClass: 'bg-yellow-700',
    headingClass: 'text-yellow-800',
    buttonClass: 'bg-yellow-700 hover:bg-yellow-800',
    label: 'Lucky Guess',
    reflectionQuestion:
      'Coba jelaskan lagi alasan jawabanmu sekarang, setelah mengerjakan LKPD ini \u2014 apakah alasanmu berubah?',
  },
  MISKONSEPSI: {
    bgClass: 'bg-red-700',
    headingClass: 'text-red-800',
    buttonClass: 'bg-red-700 hover:bg-red-800',
    label: 'Miskonsepsi',
    reflectionQuestion:
      'Apa yang berubah dari pemahamanmu setelah mengerjakan LKPD ini? Bagian mana yang tadinya kamu pikir benar, ternyata berbeda?',
  },
  TIDAK_PAHAM: {
    bgClass: 'bg-blue-900',
    headingClass: 'text-blue-900',
    buttonClass: 'bg-blue-900 hover:bg-blue-950',
    label: 'Tidak Paham',
    reflectionQuestion:
      'Bagian mana dari topik ini yang masih paling membingungkan buatmu?',
  },
  INSUFFICIENT_DATA: {
    bgClass: 'bg-gray-500',
    headingClass: 'text-gray-700',
    buttonClass: 'bg-gray-500 hover:bg-gray-600',
    label: 'Data Tidak Cukup',
    reflectionQuestion:
      'Ceritakan bagaimana proses kamu mengerjakan soal tadi \u2014 apa yang kamu lakukan saat menemui soal yang sulit?',
  },
};

// ─── 3.4 CONFIDENCE_LABELS ────────────────────────────────────────────────────

export const CONFIDENCE_LABELS: Record<number, string> = {
  0: 'Menebak Sepenuhnya',
  1: 'Sangat Tidak Yakin',
  2: 'Tidak Yakin',
  3: 'Yakin',
  4: 'Sangat Yakin',
  5: 'Mutlak Yakin',
};

// ─── 3.5 getCategoryTheme ─────────────────────────────────────────────────────

/**
 * Safe accessor for a category theme.
 * Falls back to the INSUFFICIENT_DATA theme if the key is somehow not found
 * (e.g., an unexpected runtime value slips through TypeScript's type system).
 */
export function getCategoryTheme(category: CognitiveGroupType): CategoryTheme {
  return CATEGORY_THEMES[category] ?? CATEGORY_THEMES['INSUFFICIENT_DATA'];
}

// ─── 3.6 isValidReflectionText ────────────────────────────────────────────────

/**
 * Returns true iff the text contains at least one non-whitespace character.
 * Whitespace-only strings (spaces, tabs, newlines) are rejected.
 */
export function isValidReflectionText(text: string): boolean {
  return text.trim().length >= 1;
}
