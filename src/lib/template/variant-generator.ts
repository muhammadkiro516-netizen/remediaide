/**
 * RemediAide — Variant Generator
 * Task 6
 *
 * Generates ItemVariants from a TemplateAST by:
 * 1. Sampling integers within variable ranges
 * 2. Filtering candidates that satisfy all constraints
 * 3. Rendering text and computing correct answers
 * 4. Generating plausible distractors
 * 5. Saving results to database (ItemVariant table)
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.6, 18.1
 */

import { prisma } from '@/lib/db/client';
import { evaluateConstraint } from './constraint-evaluator';
import { renderTemplate } from './renderer';
import type { GeneratedVariant, RenderedOption, TemplateAST } from './types';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_CANDIDATES_ATTEMPTS = 5000;
const MIN_VARIANTS = 5;
const MAX_VARIANTS = 10;
const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;

// ─── Word count helper (mirrors diagnostic engine) ────────────────────────────

function countWords(text: string): number {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return 0;
  return normalized.split(' ').filter(Boolean).length;
}

function calculateTauMin(wordCount: number): number {
  if (wordCount <= 0) return 1;
  return Math.ceil(wordCount / 2.5);
}

// ─── Correct Answer Computation ───────────────────────────────────────────────

/**
 * Determine the context of the template to decide which math function to apply.
 * For KPK (LCM) questions, correct answer = lcm(a, b)
 * For FPB (GCD) questions, correct answer = gcd(a, b)
 *
 * Falls back to lcm if we cannot determine context.
 */
function detectTemplateContext(
  ast: TemplateAST
): 'lcm' | 'gcd' | 'product' | 'unknown' {
  const fullText = ast.nodes
    .map((n) => (n.type === 'text' ? n.value : ''))
    .join(' ')
    .toLowerCase();

  // KPK = Kelipatan Persekutuan Kecil = LCM
  if (fullText.includes('kpk') || fullText.includes('lcm') || fullText.includes('kelipatan')) {
    return 'lcm';
  }

  // FPB = Faktor Persekutuan Besar = GCD
  if (fullText.includes('fpb') || fullText.includes('gcd') || fullText.includes('faktor')) {
    return 'gcd';
  }

  return 'unknown';
}

function gcd(a: number, b: number): number {
  a = Math.abs(Math.floor(a));
  b = Math.abs(Math.floor(b));
  if (b === 0) return a;
  return gcd(b, a % b);
}

function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return Math.abs(Math.floor((a * b) / gcd(a, b)));
}

/**
 * Compute the correct answer value given the variable values and template context.
 */
function computeCorrectAnswer(
  values: Record<string, number>,
  context: 'lcm' | 'gcd' | 'product' | 'unknown'
): number {
  const varNames = Object.keys(values);

  if (varNames.length === 2) {
    const [a, b] = varNames.map((k) => values[k]);
    if (context === 'lcm') return lcm(a, b);
    if (context === 'gcd') return gcd(a, b);
    if (context === 'product') return a * b;
    // unknown: default to lcm for KPK/FPB pilot context
    return lcm(a, b);
  }

  if (varNames.length === 1) {
    return values[varNames[0]];
  }

  // Multi-variable: use first two
  const a = values[varNames[0]];
  const b = values[varNames[1]];
  if (context === 'lcm' || context === 'unknown') return lcm(a, b);
  if (context === 'gcd') return gcd(a, b);
  return a * b;
}

// ─── Distractor Generation ────────────────────────────────────────────────────

/**
 * Generate 3 plausible wrong answers (distractors) for a given correct answer.
 * For KPK/FPB context, includes common misconceptions.
 */
function generateDistractors(
  correct: number,
  values: Record<string, number>,
  context: 'lcm' | 'gcd' | 'product' | 'unknown'
): number[] {
  const varValues = Object.values(values);
  const candidates = new Set<number>();

  // Avoid duplicates and the correct answer
  const addIfValid = (n: number) => {
    const rounded = Math.round(n);
    if (rounded > 0 && rounded !== correct) {
      candidates.add(rounded);
    }
  };

  // Common misconceptions
  if (varValues.length >= 2) {
    const [a, b] = varValues;

    // Misconception 1: a * b (students often multiply instead of using LCM/GCF)
    addIfValid(a * b);

    // Misconception 2: a + b (simple addition)
    addIfValid(a + b);

    // Misconception 3: using the wrong operation
    if (context === 'lcm') {
      addIfValid(gcd(a, b)); // using gcd instead of lcm
    } else if (context === 'gcd') {
      addIfValid(lcm(a, b)); // using lcm instead of gcd
    }

    // Misconception 4: just one of the variables
    addIfValid(a);
    addIfValid(b);
  }

  // Near-miss distractors: correct ± small offset
  for (const delta of [1, -1, 2, -2, correct / 2, -correct / 2]) {
    addIfValid(correct + delta);
  }

  // Shuffle and take 3
  const candidateList = Array.from(candidates)
    .filter((n) => n > 0)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);

  // If we couldn't generate 3, pad with more offsets
  let offset = 3;
  while (candidateList.length < 3) {
    const candidate = correct + offset;
    if (candidate !== correct && candidate > 0 && !candidateList.includes(candidate)) {
      candidateList.push(candidate);
    }
    offset++;
    if (offset > 1000) break; // safety
  }

  return candidateList.slice(0, 3);
}

// ─── Candidate Sampling ───────────────────────────────────────────────────────

/**
 * Sample a random integer in [min, max] inclusive.
 */
function sampleInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate one candidate value set by sampling each variable in its range.
 */
function sampleCandidate(
  variables: TemplateAST['variables']
): Record<string, number> {
  const values: Record<string, number> = {};
  for (const varDef of variables) {
    values[varDef.name] = sampleInt(varDef.min, varDef.max);
  }
  return values;
}

/**
 * Check if a candidate value set satisfies all constraints.
 */
function satisfiesConstraints(
  values: Record<string, number>,
  constraints: TemplateAST['constraints']
): boolean {
  for (const constraint of constraints) {
    try {
      if (!evaluateConstraint(constraint.expression, values)) {
        return false;
      }
    } catch {
      // If constraint evaluation throws, consider it unsatisfied
      return false;
    }
  }
  return true;
}

/**
 * Stringify a value set for deduplication.
 */
function serializeValues(values: Record<string, number>): string {
  return Object.keys(values)
    .sort()
    .map((k) => `${k}=${values[k]}`)
    .join(',');
}

// ─── Main Variant Generation ──────────────────────────────────────────────────

/**
 * Generate an array of GeneratedVariant from a TemplateAST.
 *
 * @param ast - Parsed template AST
 * @param minCount - Minimum variants required (default 5)
 * @param maxCount - Maximum variants to generate (default 10)
 * @returns Array of GeneratedVariant (length between minCount and maxCount)
 * @throws Error if unable to generate minCount variants after MAX_CANDIDATES_ATTEMPTS
 */
export function generateVariants(
  ast: TemplateAST,
  minCount = MIN_VARIANTS,
  maxCount = MAX_VARIANTS
): GeneratedVariant[] {
  const context = detectTemplateContext(ast);
  const seen = new Set<string>();
  const validCandidates: Record<string, number>[] = [];

  // Sample candidates until we have enough unique, constraint-satisfying value sets
  for (
    let attempt = 0;
    attempt < MAX_CANDIDATES_ATTEMPTS && validCandidates.length < maxCount;
    attempt++
  ) {
    const candidate = sampleCandidate(ast.variables);
    const key = serializeValues(candidate);

    if (seen.has(key)) continue;
    seen.add(key);

    if (satisfiesConstraints(candidate, ast.constraints)) {
      validCandidates.push(candidate);
    }
  }

  if (validCandidates.length < minCount) {
    throw new Error(
      `VariantGenerator: unable to generate ${minCount} valid variants after ${MAX_CANDIDATES_ATTEMPTS} attempts. ` +
        `Only found ${validCandidates.length} valid candidates. ` +
        `Check that your constraints are not too restrictive.`
    );
  }

  // Build GeneratedVariant objects
  const variants: GeneratedVariant[] = [];

  for (const values of validCandidates.slice(0, maxCount)) {
    const renderedText = renderTemplate(ast, values);
    const wordCount = countWords(renderedText);
    const tauMinSeconds = calculateTauMin(wordCount);

    const correctAnswer = computeCorrectAnswer(values, context);
    const distractors = generateDistractors(correctAnswer, values, context);

    // Build 4 options: 1 correct + 3 distractors, shuffle them
    const allOptions = [
      { text: String(correctAnswer), isCorrect: true },
      ...distractors.slice(0, 3).map((d) => ({ text: String(d), isCorrect: false })),
    ];

    // Fisher-Yates shuffle
    for (let i = allOptions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allOptions[i], allOptions[j]] = [allOptions[j], allOptions[i]];
    }

    const renderedOptions: RenderedOption[] = allOptions.map((opt, idx) => ({
      key: OPTION_KEYS[idx],
      text: opt.text,
      isCorrect: opt.isCorrect,
    }));

    const correctOption = renderedOptions.find((o) => o.isCorrect);
    const correctOptionKey = correctOption?.key ?? 'A';

    variants.push({
      variableValues: values,
      renderedText,
      renderedOptions,
      correctOptionKey,
      tauMinSeconds,
    });
  }

  return variants;
}

// ─── Static Text Variant (Bug 1 fix) ─────────────────────────────────────────

/**
 * Opsi teks statis untuk soal pilihan ganda non-numerik.
 */
export interface StaticTextOption {
  key: 'A' | 'B' | 'C' | 'D';
  text: string;
  isCorrect: boolean;
}

/**
 * Generate a single GeneratedVariant from static text options (no variable substitution).
 * Used when questionType === "text".
 *
 * @param textOptions - Array of 4 options with key, text, and isCorrect flag
 * @param questionText - The question body text to store as renderedText
 * @returns A GeneratedVariant with populated renderedText and static renderedOptions
 */
export function generateStaticVariant(
  textOptions: StaticTextOption[],
  questionText: string
): GeneratedVariant {
  const renderedOptions: RenderedOption[] = textOptions.map((opt) => ({
    key: opt.key,
    text: opt.text,
    isCorrect: opt.isCorrect,
  }));

  const correctOption = renderedOptions.find((o) => o.isCorrect);
  const correctOptionKey = correctOption?.key ?? 'A';

  const wordCount = countWords(questionText);
  const tauMinSeconds = wordCount > 0 ? calculateTauMin(wordCount) : 10;

  return {
    variableValues: {},
    renderedText: questionText,
    renderedOptions,
    correctOptionKey,
    tauMinSeconds,
  };
}

// ─── Database Save Function ───────────────────────────────────────────────────

/**
 * Save generated variants to the database (ItemVariant table).
 *
 * @param questionId - The Question ID these variants belong to
 * @param schoolId - The school ID for tenant isolation
 * @param variants - Array of GeneratedVariant to persist
 * @returns Array of created ItemVariant IDs
 */
export async function saveVariantsToDatabase(
  questionId: string,
  schoolId: string,
  variants: GeneratedVariant[]
): Promise<string[]> {
  // Batch create all variants
  const createdIds: string[] = [];

  for (const variant of variants) {
    const created = await prisma.itemVariant.create({
      data: {
        questionId,
        variableValues: variant.variableValues,
        renderedText: variant.renderedText,
        renderedOptions: variant.renderedOptions as unknown as import('@prisma/client').Prisma.InputJsonValue,
        correctOptionKey: variant.correctOptionKey,
        tauMinSeconds: variant.tauMinSeconds,
        calibrationStatus: 'EXPERT_ESTIMATED',
        hasPotentialIssue: false,
        usageStats: {},
      },
      select: { id: true },
    });

    createdIds.push(created.id);
  }

  return createdIds;
}
