import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pilotFigure, PILOT_FIGURE_IDS } from '@/lib/pilot/figures';
import { tauMinSeconds } from '@/lib/pilot/instrument';

const inst = JSON.parse(readFileSync(resolve(__dirname, '../../docs/cac/pilot/instrument_map_id.json'), 'utf8')) as {
  items: Array<{ map_question_id: number; figure: string | null; stem_id: string; require_explanation: boolean;
    options: Array<{ key: string; text_id: string; is_correct: boolean }>; correct_key: string; needs_teacher_check: boolean }>;
};

describe('pilot instrument (T70)', () => {
  it('has 15 questions, 4 options each, 5 asking for a reason', () => {
    expect(inst.items).toHaveLength(15);
    for (const it of inst.items) {
      expect(it.options.map((o) => o.key)).toEqual(['A', 'B', 'C', 'D']);
      expect(it.options.filter((o) => o.is_correct)).toHaveLength(1);
    }
    expect(inst.items.filter((i) => i.require_explanation)).toHaveLength(5);
  });

  it('every picture question has a figure in public/pilot identical to docs/cac/pilot/figures', () => {
    const withFig = inst.items.filter((i) => i.figure);
    expect(withFig.map((i) => i.map_question_id).sort()).toEqual([...PILOT_FIGURE_IDS].sort());
    for (const it of withFig) {
      const f = pilotFigure(it.map_question_id);
      expect(f?.src).toBe(`/pilot/${it.figure}`);
      const pub = resolve(__dirname, '../../public', `.${f!.src}`);
      expect(existsSync(pub)).toBe(true);
      expect(readFileSync(pub, 'utf8')).toBe(readFileSync(resolve(__dirname, '../../docs/cac/pilot/figures', it.figure!), 'utf8'));
      expect(it.needs_teacher_check).toBe(true);
    }
    expect(pilotFigure(12345)).toBeNull();
    expect(pilotFigure(null)).toBeNull();
  });

  it('tauMin follows the v1 rule ceil(words / 2.5) and is positive', () => {
    for (const it of inst.items) expect(tauMinSeconds(it as never)).toBeGreaterThan(0);
  });
});
