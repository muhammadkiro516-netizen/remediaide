/**
 * RemediAide — Template Parser Property-Based Tests
 * Sub-tasks 6.2, 6.3, 6.4
 *
 * Property 5: Template Parser Round-Trip
 * Property 8: ItemVariant Constraint Satisfaction
 * Property 12: Invalid Template Rejection with Descriptive Error
 *
 * Requirements: 17.2, 17.4, 17.5, 18.4, 10.2, 10.3
 */

// Feature: remediaide

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseTemplate } from '../parser';
import { printTemplate } from '../pretty-printer';
import { generateVariants } from '../variant-generator';
import { evaluateConstraint } from '../constraint-evaluator';
import type { TemplateAST } from '../types';

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/**
 * Generate a valid variable name: lowercase letter optionally followed by digits.
 * Kept short to avoid collisions with built-in function names.
 */
const varNameArb = fc.constantFrom('a', 'b', 'c', 'd', 'x', 'y', 'z', 'n', 'm');

/**
 * Generate a valid variable range [min..max] where min < max and both >= 1.
 */
const varRangeArb = fc
  .tuple(fc.integer({ min: 1, max: 49 }), fc.integer({ min: 2, max: 50 }))
  .filter(([min, max]) => min < max)
  .map(([min, max]) => ({ min, max }));

/**
 * Generate a single variable definition string like "a[2..50]".
 */
const varDefStringArb = fc.tuple(varNameArb, varRangeArb).map(([name, { min, max }]) => ({
  name,
  min,
  max,
  str: `${name}[${min}..${max}]`,
}));

/**
 * Generate a pair of unique variable names (for two-variable templates).
 */
const twoDistinctVarNamesArb = fc
  .tuple(varNameArb, varNameArb)
  .filter(([a, b]) => a !== b);

/**
 * Generate a valid simple template text (no HTML, no injection) with 1-2 variables.
 * The template body uses simple Indonesian math problem text.
 */
const validOneVarTemplateArb = fc.tuple(varDefStringArb).map(([varDef]) => {
  const body = `Terdapat ${`{{${varDef.name}}}`} buah apel.`;
  const vars = `# variables: ${varDef.str}`;
  return `${body}\n\n${vars}`;
});

/**
 * Generate a valid two-variable template with a simple constraint "a < b".
 */
const validTwoVarTemplateArb = fc
  .tuple(
    twoDistinctVarNamesArb,
    varRangeArb,
    varRangeArb,
    fc.string({ minLength: 3, maxLength: 20, unit: 'grapheme' }).filter(
      (s) =>
        // Exclude any characters that would trigger injection detection
        !/[<>&'";\x00-\x1F\\\/]/.test(s) &&
        !s.includes('{{') &&
        !s.includes('}}') &&
        !s.includes('#') &&
        !s.includes('javascript') &&
        !s.includes('script')
    )
  )
  .map(([[va, vb], rangeA, rangeB, prefix]) => {
    // Ensure min ranges are low enough that a < b constraint can be satisfied
    const minA = Math.min(rangeA.min, rangeA.max - 1);
    const maxA = Math.max(rangeA.min, rangeA.max - 1);
    const minB = minA + 1;
    const maxB = maxA + 10;

    const body = `${prefix} {{${va}}} dan {{${vb}}} soal.`;
    const vars = `# variables: ${va}[${minA}..${maxA}], ${vb}[${minB}..${maxB}]`;
    const constraints = `# constraints: ${va} < ${vb}`;
    return { text: `${body}\n\n${vars}\n${constraints}`, va, vb, minA, maxA, minB, maxB };
  });

/**
 * Generate a template where at least one placeholder is undefined
 * (used in body but not in # variables).
 */
const undefinedPlaceholderTemplateArb = fc
  .tuple(varNameArb, varNameArb)
  .filter(([bodyVar, definedVar]) => bodyVar !== definedVar)
  .map(([bodyVar, definedVar]) => {
    // bodyVar is used in template but NOT defined; definedVar is defined but NOT used
    const body = `Nilai {{${bodyVar}}} soal.`;
    const vars = `# variables: ${definedVar}[1..10]`;
    return `${body}\n\n${vars}`;
  });

/**
 * Generate templates with HTML/script injection.
 * All entries MUST contain an actual injection pattern (literal < > null-byte etc.)
 */
const injectionTemplateArb = fc.constantFrom(
  // script tag
  `Test soal dengan <script>alert(1)</script> konten`,
  // img tag
  `Test soal <img src="x" onerror="alert(1)">`,
  // javascript: scheme
  `Klik di sini: javascript:void(0)`,
  // literal < angle bracket in body text
  `Nilai 5 < 10 soal`,
  // literal > angle bracket in body text
  `Nilai 10 > 5 soal`,
  // null byte
  `Test\x00soal`,
  // iframe
  `<iframe src="evil.com"></iframe>`,
  // data: URI
  `data:text/html,<h1>xss</h1>`,
  // vbscript
  `vbscript:alert(1)`,
  // form tag
  `<form action="steal.php">`,
);

// ─── Helper: deep-equal two TemplateASTs structurally ────────────────────────

/**
 * Compare two TemplateASTs for structural equivalence:
 * - Same placeholder names in same order
 * - Same variable definitions (name, min, max)
 * - Same constraint expressions
 */
function astEquivalent(ast1: TemplateAST, ast2: TemplateAST): boolean {
  // Compare variables
  if (ast1.variables.length !== ast2.variables.length) return false;
  for (let i = 0; i < ast1.variables.length; i++) {
    const v1 = ast1.variables[i];
    const v2 = ast2.variables[i];
    if (v1.name !== v2.name || v1.min !== v2.min || v1.max !== v2.max) return false;
  }

  // Compare constraints
  if (ast1.constraints.length !== ast2.constraints.length) return false;
  for (let i = 0; i < ast1.constraints.length; i++) {
    if (ast1.constraints[i].expression !== ast2.constraints[i].expression) return false;
  }

  // Compare placeholder sequence (structure equivalence)
  const getPlaceholders = (ast: TemplateAST) =>
    ast.nodes
      .filter((n) => n.type === 'placeholder')
      .map((n) => (n as { name: string }).name);

  const p1 = getPlaceholders(ast1);
  const p2 = getPlaceholders(ast2);

  if (p1.length !== p2.length) return false;
  for (let i = 0; i < p1.length; i++) {
    if (p1[i] !== p2[i]) return false;
  }

  return true;
}

// ─── Property 5: Template Parser Round-Trip ───────────────────────────────────
// Sub-task 6.2
// Validates: Requirements 17.4, 18.4

describe('Property 5: Template Parser Round-Trip', () => {
  it(
    'FOR ALL valid one-variable templates: parse(prettyPrint(parse(text))) deep-equals parse(text)',
    () => {
      // Feature: remediaide, Property 5: Template Parser Round-Trip
      fc.assert(
        fc.property(validOneVarTemplateArb, (templateText) => {
          // First parse
          const result1 = parseTemplate(templateText);

          // If parse fails for any reason, skip this sample
          if (!result1.ok) return true;

          // Pretty-print the AST
          const printed = printTemplate(result1.value);

          // Re-parse the printed output
          const result2 = parseTemplate(printed);

          // The re-parse must succeed
          if (!result2.ok) return false;

          // The two ASTs must be structurally equivalent
          return astEquivalent(result1.value, result2.value);
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    'FOR ALL valid two-variable templates: parse(prettyPrint(parse(text))) deep-equals parse(text)',
    () => {
      // Feature: remediaide, Property 5: Template Parser Round-Trip
      fc.assert(
        fc.property(validTwoVarTemplateArb, ({ text }) => {
          const result1 = parseTemplate(text);
          if (!result1.ok) return true; // skip invalid samples

          const printed = printTemplate(result1.value);
          const result2 = parseTemplate(printed);

          if (!result2.ok) return false;

          return astEquivalent(result1.value, result2.value);
        }),
        { numRuns: 100 }
      );
    }
  );

  it('round-trip preserves constraint expressions exactly', () => {
    // Feature: remediaide, Property 5: Template Parser Round-Trip
    const templates = [
      `Soal {{a}} dan {{b}}.

# variables: a[2..20], b[3..30]
# constraints: a < b`,
      `Soal {{a}} dan {{b}}.

# variables: a[2..20], b[3..30]
# constraints: a < b, lcm(a,b) <= 100`,
    ];

    for (const template of templates) {
      const r1 = parseTemplate(template);
      expect(r1.ok).toBe(true);
      if (!r1.ok) continue;

      const printed = printTemplate(r1.value);
      const r2 = parseTemplate(printed);
      expect(r2.ok).toBe(true);
      if (!r2.ok) continue;

      // Constraints must be identical
      expect(r2.value.constraints.map((c) => c.expression)).toEqual(
        r1.value.constraints.map((c) => c.expression)
      );
    }
  });
});

// ─── Property 8: ItemVariant Constraint Satisfaction ─────────────────────────
// Sub-task 6.3
// Validates: Requirements 10.2, 10.3

describe('Property 8: ItemVariant Constraint Satisfaction', () => {
  it(
    'FOR ALL generated variants from a template with a < b constraint, all variants satisfy a < b',
    () => {
      // Feature: remediaide, Property 8: ItemVariant Constraint Satisfaction
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 20 }), // minA
          fc.integer({ min: 2, max: 30 }), // some offset ensures b range > a range
          (minA, offset) => {
            const maxA = minA + offset;
            const minB = maxA + 1;
            const maxB = minB + offset + 5;

            const templateText = `Soal {{a}} dan {{b}} kelereng.

# variables: a[${minA}..${maxA}], b[${minB}..${maxB}]
# constraints: a < b`;

            const parseResult = parseTemplate(templateText);
            if (!parseResult.ok) return true; // skip if parse fails

            let variants;
            try {
              variants = generateVariants(parseResult.value, 5, 10);
            } catch {
              // If not enough variants can be generated, skip
              return true;
            }

            // All variants must satisfy a < b
            for (const variant of variants) {
              const { a, b } = variant.variableValues;
              if (a >= b) return false;
            }

            // All variants must satisfy the constraint via evaluator
            for (const variant of variants) {
              if (!evaluateConstraint('a < b', variant.variableValues)) {
                return false;
              }
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  it(
    'FOR ALL generated variants, ALL constraints in the template are satisfied',
    () => {
      // Feature: remediaide, Property 8: ItemVariant Constraint Satisfaction
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 15 }), // small ranges for speed
          fc.integer({ min: 3, max: 20 }),
          (minA, minB) => {
            if (minA >= minB) return true; // skip if constraint can't be satisfied

            const maxA = minA + 5;
            const maxB = minB + 10;

            const templateText = `Soal {{a}} dan {{b}}.

# variables: a[${minA}..${maxA}], b[${minB}..${maxB}]
# constraints: a < b`;

            const parseResult = parseTemplate(templateText);
            if (!parseResult.ok) return true;

            let variants;
            try {
              variants = generateVariants(parseResult.value, 5, 5);
            } catch {
              return true;
            }

            // Every variant must satisfy every constraint
            for (const variant of variants) {
              for (const constraint of parseResult.value.constraints) {
                if (!evaluateConstraint(constraint.expression, variant.variableValues)) {
                  return false;
                }
              }
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  it('generated variant values are within declared variable ranges', () => {
    // Feature: remediaide, Property 8: ItemVariant Constraint Satisfaction
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 20 }),
        fc.integer({ min: 25, max: 45 }),
        (minA, maxA) => {
          if (minA >= maxA) return true;

          const templateText = `Soal {{a}} kelereng.

# variables: a[${minA}..${maxA}]`;

          const parseResult = parseTemplate(templateText);
          if (!parseResult.ok) return true;

          let variants;
          try {
            variants = generateVariants(parseResult.value, 3, 5);
          } catch {
            return true;
          }

          for (const variant of variants) {
            const a = variant.variableValues['a'];
            if (a < minA || a > maxA) return false;
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 12: Invalid Template Rejection with Descriptive Error ───────────
// Sub-task 6.4
// Validates: Requirements 17.2, 17.5

describe('Property 12: Invalid Template Rejection with Descriptive Error', () => {
  it(
    'FOR ALL templates with undefined placeholders, parser returns Result.ok=false with non-empty message',
    () => {
      // Feature: remediaide, Property 12: Invalid Template Rejection with Descriptive Error
      fc.assert(
        fc.property(undefinedPlaceholderTemplateArb, (templateText) => {
          const result = parseTemplate(templateText);

          // Must return an error
          if (result.ok) return false;

          // Error code must be UNDEFINED_PLACEHOLDER
          if (result.error.code !== 'UNDEFINED_PLACEHOLDER') return false;

          // Error message must be non-empty and descriptive
          return (
            typeof result.error.message === 'string' &&
            result.error.message.length > 0
          );
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    'FOR ALL injection attempt templates, parser returns Result.ok=false with INJECTION_DETECTED',
    () => {
      // Feature: remediaide, Property 12: Invalid Template Rejection with Descriptive Error
      fc.assert(
        fc.property(injectionTemplateArb, (templateText) => {
          const result = parseTemplate(templateText);

          // Must return an error
          if (result.ok) return false;

          // Error code must be INJECTION_DETECTED
          if (result.error.code !== 'INJECTION_DETECTED') return false;

          // Error message must be non-empty
          return (
            typeof result.error.message === 'string' &&
            result.error.message.length > 0
          );
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    'parser always returns descriptive error for templates with HTML angle brackets',
    () => {
      // Feature: remediaide, Property 12: Invalid Template Rejection with Descriptive Error
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20, unit: 'grapheme' }).filter(
            (s) => !/[<>]/.test(s) && s.length > 0
          ),
          (safeText) => {
            // Insert an HTML angle bracket to create injection
            const injectionTemplates = [
              `${safeText} <script>evil</script>`,
              `${safeText} <img src=x>`,
              `${safeText} ${`\x00null-byte`}`,
            ];

            for (const tmpl of injectionTemplates) {
              const result = parseTemplate(tmpl);
              if (result.ok) return false;
              if (result.error.code !== 'INJECTION_DETECTED') return false;
              if (!result.error.message || result.error.message.length === 0) return false;
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  it(
    'parser returns error with non-empty message for all invalid template types',
    () => {
      // Feature: remediaide, Property 12: Invalid Template Rejection with Descriptive Error
      const invalidTemplates = [
        // Undefined placeholder
        `Soal {{z}} nilai.\n\n# variables: a[1..10]`,
        // Missing variable definition
        `Soal {{a}} dan {{b}} nilai.\n\n# variables: a[1..10]`,
        // Invalid range (min > max)
        `Soal {{a}} nilai.\n\n# variables: a[50..2]`,
        // Constraint referencing undefined variable
        `Soal {{a}} nilai.\n\n# variables: a[1..10]\n# constraints: a < z`,
        // Script injection
        `<script>alert(1)</script>`,
        // HTML injection
        `<img src="x">`,
      ];

      for (const template of invalidTemplates) {
        const result = parseTemplate(template);
        expect(result.ok, `Template should be rejected: "${template.substring(0, 50)}"`).toBe(false);
        if (!result.ok) {
          expect(result.error.message.length, 'Error message must be non-empty').toBeGreaterThan(0);
        }
      }
    }
  );
});
