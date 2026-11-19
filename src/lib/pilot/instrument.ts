/** Pilot instrument (T70) types + the v1 tau_min rule on the Indonesian text: ceil(words / 2.5) seconds. */
export interface PilotOption { key: string; text_id: string; is_correct: boolean }
export interface PilotItem {
  order: number; map_question_id: number; stem_id: string; options: PilotOption[]; correct_key: string;
  require_explanation: boolean; figure: string | null; needs_teacher_check: boolean;
}

function countWords(text: string): number {
  const n = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return n ? n.split(' ').length : 0;
}

export function tauMinSeconds(item: Pick<PilotItem, 'stem_id' | 'options'>): number {
  const words = countWords(`${item.stem_id} ${item.options.map((o) => o.text_id).join(' ')}`);
  return Math.max(1, Math.ceil(words / 2.5));
}
