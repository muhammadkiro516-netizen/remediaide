/**
 * RemediAide — Template Parser Unit Tests
 * Sub-task 6.1
 *
 * Tests:
 * - Parsing valid KPK template → correct AST
 * - Undefined placeholder → ParseError.UNDEFINED_PLACEHOLDER
 * - Injection attempts (<script>, <img>) → ParseError.INJECTION_DETECTED
 * - Round-trip: parse → prettyPrint → parse → same AST
 * - Renderer: substitute values correctly
 * - Constraint evaluator: lcm/gcd functions and relational operators
 *
 * Requirements: 17.2, 17.5
 */

import { describe, it, expect } from 'vitest';
import { parseTemplate } from '../parser';
import { printTemplate } from '../pretty-printer';
import { renderTemplate } from '../renderer';
import { gcd, lcm, evaluateConstraint } from '../constraint-evaluator';
import type { TemplateAST } from '../types';

// ─── Sample templates ─────────────────────────────────────────────────────────

const VALID_KPK_TEMPLATE = `Budi mempunyai {{a}} kelereng dan Andi mempunyai {{b}} kelereng.
Berapa KPK dari {{a}} dan {{b}}?

# variables: a[2..50], b[2..50]
# constraints: a < b, lcm(a,b) <= 100`;

const VALID_SINGLE_VAR_TEMPLATE = `Terdapat {{n}} buah apel.

# variables: n[1..100]`;

// ─── TemplateParser Unit Tests ─────────────────────────────────────────────────

describe('TemplateParser — parseTemplate', () => {
  // ── Valid templates ────────────────────────────────────────────────────────

  it('parses a valid KPK template with 2 variables and constraints', () => {
    const result = parseTemplate(VALID_KPK_TEMPLATE);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ast = result.value;

    // Check variables
    expect(ast.variables).toHaveLength(2);
    expect(ast.variables[0]).toMatchObject({ name: 'a', min: 2, max: 50 });
    expect(ast.variables[1]).toMatchObject({ name: 'b', min: 2, max: 50 });

    // Check constraints
    expect(ast.constraints).toHaveLength(2);
    expect(ast.constraints[0].expression).toBe('a < b');
    expect(ast.constraints[1].expression).toBe('lcm(a,b) <= 100');

    // Check nodes contain both text and placeholder nodes
    const placeholders = ast.nodes.filter((n) => n.type === 'placeholder');
    const placeholderNames = placeholders.map((n) => (n as { name: string }).name);
    expect(placeholderNames).toContain('a');
    expect(placeholderNames).toContain('b');
  });

  it('parses a template with a single variable and no constraints', () => {
    const result = parseTemplate(VALID_SINGLE_VAR_TEMPLATE);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ast = result.value;
    expect(ast.variables).toHaveLength(1);
    expect(ast.variables[0]).toMatchObject({ name: 'n', min: 1, max: 100 });
    expect(ast.constraints).toHaveLength(0);

    const placeholders = ast.nodes.filter((n) => n.type === 'placeholder');
    expect(placeholders).toHaveLength(1);
    expect((placeholders[0] as { name: string }).name).toBe('n');
  });

  it('parses text nodes between placeholders correctly', () => {
    const template = `Hello {{a}} world {{b}} test

# variables: a[1..10], b[1..10]`;
    const result = parseTemplate(template);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ast = result.value;
    const textNodes = ast.nodes.filter((n) => n.type === 'text');
    const placeholderNodes = ast.nodes.filter((n) => n.type === 'placeholder');

    expect(textNodes.length).toBeGreaterThanOrEqual(1);
    expect(placeholderNodes).toHaveLength(2);
  });

  // ── Undefined placeholder ──────────────────────────────────────────────────

  it('returns UNDEFINED_PLACEHOLDER error when placeholder is not defined in variables', () => {
    const template = `Nilai {{x}} adalah penting.

# variables: a[1..10]`;

    const result = parseTemplate(template);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe('UNDEFINED_PLACEHOLDER');
    expect(result.error.message).toContain('x');
  });

  it('returns UNDEFINED_PLACEHOLDER error when variable is defined but not used in template', () => {
    const template = `Nilai {{a}} adalah penting.

# variables: a[1..10], b[1..10]`;

    const result = parseTemplate(template);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe('UNDEFINED_PLACEHOLDER');
    expect(result.error.message).toContain('b');
  });

  // ── Injection detection ────────────────────────────────────────────────────

  it('returns INJECTION_DETECTED for <script> tag', () => {
    const template = `Test <script>alert(1)</script> soal

# variables: a[1..10]`;

    const result = parseTemplate(template);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe('INJECTION_DETECTED');
  });

  it('returns INJECTION_DETECTED for <img> tag', () => {
    const template = `Test <img src="x" onerror="alert(1)"> soal

# variables: a[1..10]`;

    const result = parseTemplate(template);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe('INJECTION_DETECTED');
  });

  it('returns INJECTION_DETECTED for < HTML angle bracket', () => {
    const template = `Test nilai < 10 soal`;

    const result = parseTemplate(template);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe('INJECTION_DETECTED');
  });

  it('returns INJECTION_DETECTED for javascript: scheme', () => {
    const template = `Klik di sini: javascript:alert(1)

# variables: a[1..10]`;

    const result = parseTemplate(template);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe('INJECTION_DETECTED');
  });

  it('returns INJECTION_DETECTED for null bytes', () => {
    const template = `Soal\x00teks

# variables: a[1..10]`;

    const result = parseTemplate(template);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe('INJECTION_DETECTED');
  });

  // ── Invalid range ──────────────────────────────────────────────────────────

  it('returns INVALID_RANGE error when min > max in variable definition', () => {
    const template = `Nilai {{a}} penting.

# variables: a[50..2]`;

    const result = parseTemplate(template);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe('INVALID_RANGE');
  });

  // ── Constraint with undefined variable ────────────────────────────────────

  it('returns CONSTRAINT_PARSE_ERROR when constraint references undefined variable', () => {
    const template = `Nilai {{a}} penting.

# variables: a[1..10]
# constraints: a < z`;

    const result = parseTemplate(template);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe('CONSTRAINT_PARSE_ERROR');
    expect(result.error.message).toContain('z');
  });
});

// ─── TemplatePrettyPrinter Unit Tests ─────────────────────────────────────────

describe('TemplatePrettyPrinter — printTemplate', () => {
  it('prints an AST back to a canonical string containing # variables', () => {
    const result = parseTemplate(VALID_KPK_TEMPLATE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const printed = printTemplate(result.value);

    expect(printed).toContain('# variables: a[2..50], b[2..50]');
    expect(printed).toContain('{{a}}');
    expect(printed).toContain('{{b}}');
  });

  it('includes # constraints line when constraints exist', () => {
    const result = parseTemplate(VALID_KPK_TEMPLATE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const printed = printTemplate(result.value);

    expect(printed).toContain('# constraints:');
    expect(printed).toContain('a < b');
    expect(printed).toContain('lcm(a,b) <= 100');
  });

  it('omits # constraints line when no constraints exist', () => {
    const result = parseTemplate(VALID_SINGLE_VAR_TEMPLATE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const printed = printTemplate(result.value);

    expect(printed).not.toContain('# constraints:');
  });

  // ── Round-trip property (example-based) ───────────────────────────────────

  it('round-trip: parse → prettyPrint → parse yields equivalent AST', () => {
    const result1 = parseTemplate(VALID_KPK_TEMPLATE);
    expect(result1.ok).toBe(true);
    if (!result1.ok) return;

    const printed = printTemplate(result1.value);
    const result2 = parseTemplate(printed);

    expect(result2.ok).toBe(true);
    if (!result2.ok) {
      console.error('Re-parse error:', result2.error);
      return;
    }

    const ast1 = result1.value;
    const ast2 = result2.value;

    // Variables should be equivalent
    expect(ast2.variables).toHaveLength(ast1.variables.length);
    for (let i = 0; i < ast1.variables.length; i++) {
      expect(ast2.variables[i]).toMatchObject(ast1.variables[i]);
    }

    // Constraints should be equivalent
    expect(ast2.constraints).toHaveLength(ast1.constraints.length);
    for (let i = 0; i < ast1.constraints.length; i++) {
      expect(ast2.constraints[i].expression).toBe(ast1.constraints[i].expression);
    }

    // Placeholder names should match
    const getPlaceholders = (ast: TemplateAST) =>
      ast.nodes
        .filter((n) => n.type === 'placeholder')
        .map((n) => (n as { name: string }).name);

    expect(getPlaceholders(ast2)).toEqual(getPlaceholders(ast1));
  });
});

// ─── TemplateRenderer Unit Tests ──────────────────────────────────────────────

describe('TemplateRenderer — renderTemplate', () => {
  it('substitutes all placeholders with numeric values', () => {
    const result = parseTemplate(VALID_KPK_TEMPLATE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rendered = renderTemplate(result.value, { a: 6, b: 8 });

    expect(rendered).toContain('6');
    expect(rendered).toContain('8');
    expect(rendered).not.toContain('{{a}}');
    expect(rendered).not.toContain('{{b}}');
  });

  it('renders the body text correctly', () => {
    const template = `Budi mempunyai {{a}} kelereng.

# variables: a[1..10]`;

    const result = parseTemplate(template);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rendered = renderTemplate(result.value, { a: 7 });
    expect(rendered).toBe('Budi mempunyai 7 kelereng.');
  });

  it('throws when a placeholder has no corresponding value', () => {
    const result = parseTemplate(VALID_KPK_TEMPLATE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(() => renderTemplate(result.value, { a: 6 })).toThrow();
  });

  it('renders zero correctly', () => {
    const template = `Nilai {{n}} soal.

# variables: n[0..100]`;

    const result = parseTemplate(template);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rendered = renderTemplate(result.value, { n: 0 });
    expect(rendered).toBe('Nilai 0 soal.');
  });
});

// ─── ConstraintEvaluator Unit Tests ───────────────────────────────────────────

describe('ConstraintEvaluator — gcd and lcm', () => {
  it('computes gcd(12, 8) = 4', () => {
    expect(gcd(12, 8)).toBe(4);
  });

  it('computes gcd(7, 11) = 1 (coprime)', () => {
    expect(gcd(7, 11)).toBe(1);
  });

  it('computes gcd(0, 5) = 5', () => {
    expect(gcd(0, 5)).toBe(5);
  });

  it('computes lcm(4, 6) = 12', () => {
    expect(lcm(4, 6)).toBe(12);
  });

  it('computes lcm(3, 5) = 15', () => {
    expect(lcm(3, 5)).toBe(15);
  });

  it('computes lcm(12, 8) = 24', () => {
    expect(lcm(12, 8)).toBe(24);
  });
});

describe('ConstraintEvaluator — evaluateConstraint', () => {
  it('evaluates "a < b" as true when a < b', () => {
    expect(evaluateConstraint('a < b', { a: 3, b: 5 })).toBe(true);
  });

  it('evaluates "a < b" as false when a >= b', () => {
    expect(evaluateConstraint('a < b', { a: 5, b: 3 })).toBe(false);
    expect(evaluateConstraint('a < b', { a: 5, b: 5 })).toBe(false);
  });

  it('evaluates "a <= b" correctly', () => {
    expect(evaluateConstraint('a <= b', { a: 5, b: 5 })).toBe(true);
    expect(evaluateConstraint('a <= b', { a: 5, b: 4 })).toBe(false);
  });

  it('evaluates "a > b" correctly', () => {
    expect(evaluateConstraint('a > b', { a: 10, b: 5 })).toBe(true);
    expect(evaluateConstraint('a > b', { a: 5, b: 10 })).toBe(false);
  });

  it('evaluates "a >= b" correctly', () => {
    expect(evaluateConstraint('a >= b', { a: 5, b: 5 })).toBe(true);
    expect(evaluateConstraint('a >= b', { a: 4, b: 5 })).toBe(false);
  });

  it('evaluates "a == b" correctly', () => {
    expect(evaluateConstraint('a == b', { a: 5, b: 5 })).toBe(true);
    expect(evaluateConstraint('a == b', { a: 4, b: 5 })).toBe(false);
  });

  it('evaluates "a != b" correctly', () => {
    expect(evaluateConstraint('a != b', { a: 4, b: 5 })).toBe(true);
    expect(evaluateConstraint('a != b', { a: 5, b: 5 })).toBe(false);
  });

  it('evaluates "lcm(a,b) <= 100" correctly', () => {
    // lcm(4, 6) = 12 → 12 <= 100 = true
    expect(evaluateConstraint('lcm(a,b) <= 100', { a: 4, b: 6 })).toBe(true);
    // lcm(50, 49) is very large → false
    expect(evaluateConstraint('lcm(a,b) <= 100', { a: 50, b: 49 })).toBe(false);
  });

  it('evaluates "gcd(a,b) == 1" correctly', () => {
    // gcd(7, 11) = 1 → true
    expect(evaluateConstraint('gcd(a,b) == 1', { a: 7, b: 11 })).toBe(true);
    // gcd(4, 6) = 2 → false
    expect(evaluateConstraint('gcd(a,b) == 1', { a: 4, b: 6 })).toBe(false);
  });
});
