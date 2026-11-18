/**
 * RemediAide — Template Parser
 * Task 6
 *
 * Parses template text with {{placeholder}} syntax into a TemplateAST.
 * Validates placeholders, detects injection, parses variable/constraint metadata.
 *
 * Template format:
 *   Budi mempunyai {{a}} kelereng dan Andi mempunyai {{b}} kelereng.
 *   Berapa KPK dari {{a}} dan {{b}}?
 *
 *   # variables: a[2..50], b[2..50]
 *   # constraints: a < b, lcm(a,b) <= 100
 *
 * Requirements: 17.1, 17.2, 17.5
 */

import type {
  ASTNode,
  ConstraintExpression,
  ITemplateParser,
  ParseError,
  Result,
  TemplateAST,
  VariableDefinition,
} from './types';

// ─── Injection Detection Patterns ─────────────────────────────────────────────

/**
 * Patterns that indicate a potential injection attack.
 * Any match → ParseError with INJECTION_DETECTED.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /<script/i,
  /<\/script/i,
  /<img/i,
  /<iframe/i,
  /<object/i,
  /<embed/i,
  /<link/i,
  /<style/i,
  /<form/i,
  /<input/i,
  /javascript:/i,
  /vbscript:/i,
  /data:/i,
  // Block < or > outside of known safe contexts
  /[<>]/,
  // Null bytes
  /\x00/,
  // Non-standard control characters (excluding newline, tab, carriage return)
  /[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/,
];

// ─── Regex Helpers ─────────────────────────────────────────────────────────────

/** Matches `{{varName}}` — variable names must be alphanumeric + underscore */
const PLACEHOLDER_REGEX = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

/** Matches `# variables: a[2..50], b[2..50]` */
const VARIABLES_LINE_REGEX = /^#\s*variables\s*:\s*(.+)$/im;

/** Matches a single variable definition like `a[2..50]` */
const VARIABLE_DEF_REGEX = /^([a-zA-Z_][a-zA-Z0-9_]*)\[(-?\d+)\.\.(-?\d+)\]$/;

/** Matches `# constraints: expr1, expr2` */
const CONSTRAINTS_LINE_REGEX = /^#\s*constraints\s*:\s*(.+)$/im;

// ─── Parser Implementation ────────────────────────────────────────────────────

/**
 * Strips the `# variables:` and `# constraints:` lines from template text
 * so they don't appear in AST text nodes.
 */
function stripMetadataLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return (
        !trimmed.startsWith('# variables:') &&
        !trimmed.startsWith('# constraints:') &&
        !trimmed.startsWith('#variables:') &&
        !trimmed.startsWith('#constraints:')
      );
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n') // collapse excess blank lines
    .trim();
}

/**
 * Detects injection attempts in the template.
 * We check the body text (non-metadata lines) for injection patterns.
 * Metadata lines (# variables:, # constraints:) are allowed to contain < > for constraint syntax.
 */
function detectInjection(templateText: string): ParseError | null {
  // Split into metadata vs body lines
  const lines = templateText.split('\n');
  const bodyLines = lines.filter((line) => {
    const trimmed = line.trim();
    return (
      !trimmed.startsWith('# variables:') &&
      !trimmed.startsWith('# constraints:') &&
      !trimmed.startsWith('#variables:') &&
      !trimmed.startsWith('#constraints:')
    );
  });
  const bodyText = bodyLines.join('\n');

  // Check the body text for injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(bodyText)) {
      return {
        code: 'INJECTION_DETECTED',
        message: `Template contains potentially unsafe content matching pattern: ${pattern.toString()}`,
        token: bodyText.match(pattern)?.[0],
      };
    }
  }
  return null;
}

/**
 * Parses the `# variables:` line into an array of VariableDefinition.
 * Returns ParseError if any definition is malformed.
 */
function parseVariablesLine(
  line: string
): Result<VariableDefinition[], ParseError> {
  const parts = line
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const variables: VariableDefinition[] = [];

  for (const part of parts) {
    const match = VARIABLE_DEF_REGEX.exec(part);
    if (!match) {
      return {
        ok: false,
        error: {
          code: 'UNDEFINED_VARIABLE',
          message: `Invalid variable definition: "${part}". Expected format: name[min..max]`,
          token: part,
        },
      };
    }

    const name = match[1];
    const min = parseInt(match[2], 10);
    const max = parseInt(match[3], 10);

    if (min > max) {
      return {
        ok: false,
        error: {
          code: 'INVALID_RANGE',
          message: `Variable "${name}" has invalid range: min (${min}) > max (${max})`,
          token: part,
        },
      };
    }

    variables.push({ name, min, max });
  }

  return { ok: true, value: variables };
}

/**
 * Parses the `# constraints:` line into an array of ConstraintExpression.
 * Splits on comma but preserves function call arguments (e.g. lcm(a,b) is one token).
 */
function parseConstraintsLine(line: string): ConstraintExpression[] {
  // Split by comma but not inside parentheses
  const constraints: ConstraintExpression[] = [];
  let depth = 0;
  let current = '';

  for (const char of line) {
    if (char === '(') {
      depth++;
      current += char;
    } else if (char === ')') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      const expr = current.trim();
      if (expr) {
        constraints.push({ expression: expr, rawText: expr });
      }
      current = '';
    } else {
      current += char;
    }
  }

  const last = current.trim();
  if (last) {
    constraints.push({ expression: last, rawText: last });
  }

  return constraints;
}

/**
 * Builds AST nodes from the template body text (metadata lines already stripped).
 */
function buildASTNodes(bodyText: string): ASTNode[] {
  const nodes: ASTNode[] = [];
  let lastIndex = 0;

  // Reset regex
  PLACEHOLDER_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  const regex = new RegExp(PLACEHOLDER_REGEX.source, 'g');

  while ((match = regex.exec(bodyText)) !== null) {
    const [fullMatch, varName] = match;
    const matchStart = match.index;

    // Text before this placeholder
    if (matchStart > lastIndex) {
      nodes.push({ type: 'text', value: bodyText.slice(lastIndex, matchStart) });
    }

    // Placeholder node
    nodes.push({ type: 'placeholder', name: varName });

    lastIndex = matchStart + fullMatch.length;
  }

  // Remaining text after last placeholder
  if (lastIndex < bodyText.length) {
    nodes.push({ type: 'text', value: bodyText.slice(lastIndex) });
  }

  return nodes;
}

/**
 * Checks for circular self-reference in constraints (e.g., "a depends on a" in a simple sense).
 * Basic check: a variable name appears on both sides of an equation with itself.
 */
function detectCircularReference(
  constraints: ConstraintExpression[],
  variables: VariableDefinition[]
): ParseError | null {
  // Simple check: no variable can be defined in terms of itself
  // e.g. "a = a + 1" would be circular — we look for `varName op varName` patterns
  for (const constraint of constraints) {
    const expr = constraint.expression;
    for (const v of variables) {
      // Match things like "a = a" or "a == a" (same variable on both sides of assignment)
      const selfRefPattern = new RegExp(
        `\\b${v.name}\\b\\s*=\\s*\\b${v.name}\\b`
      );
      if (selfRefPattern.test(expr)) {
        return {
          code: 'CIRCULAR_REFERENCE',
          message: `Constraint contains circular self-reference for variable "${v.name}": "${expr}"`,
          token: v.name,
        };
      }
    }
  }
  return null;
}

// ─── Main Parser Class ────────────────────────────────────────────────────────

export class TemplateParser implements ITemplateParser {
  /**
   * Parse a template text into a TemplateAST.
   *
   * Template format:
   *   <body text with {{placeholder}} syntax>
   *
   *   # variables: a[2..50], b[2..50]
   *   # constraints: a < b, lcm(a,b) <= 100
   */
  parse(templateText: string): Result<TemplateAST, ParseError> {
    // 1. Injection detection — check on raw text first
    const injectionError = detectInjection(templateText);
    if (injectionError) {
      return { ok: false, error: injectionError };
    }

    // 2. Parse `# variables:` line
    const variablesMatch = VARIABLES_LINE_REGEX.exec(templateText);
    let variables: VariableDefinition[] = [];

    if (variablesMatch) {
      const result = parseVariablesLine(variablesMatch[1].trim());
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      variables = result.value;
    }

    // 3. Parse `# constraints:` line
    const constraintsMatch = CONSTRAINTS_LINE_REGEX.exec(templateText);
    let constraints: ConstraintExpression[] = [];

    if (constraintsMatch) {
      constraints = parseConstraintsLine(constraintsMatch[1].trim());
    }

    // 4. Strip metadata lines to get the body text
    const bodyText = stripMetadataLines(templateText);

    // 5. Build AST nodes from body text
    const nodes = buildASTNodes(bodyText);

    // 6. Collect all placeholder names used in the body
    const usedPlaceholders = new Set<string>(
      nodes
        .filter((n): n is Extract<typeof n, { type: 'placeholder' }> => n.type === 'placeholder')
        .map((n) => n.name)
    );

    // 7. Collect all defined variable names
    const definedVariables = new Set<string>(variables.map((v) => v.name));

    // 8. Validate: all used placeholders must be defined as variables
    const usedPlaceholderList = Array.from(usedPlaceholders);
    for (const placeholder of usedPlaceholderList) {
      if (!definedVariables.has(placeholder)) {
        return {
          ok: false,
          error: {
            code: 'UNDEFINED_PLACEHOLDER',
            message: `Placeholder "{{${placeholder}}}" is used in the template but not defined in # variables`,
            token: placeholder,
          },
        };
      }
    }

    // 9. Validate: all defined variables must be used in the template
    for (const varDef of variables) {
      if (!usedPlaceholders.has(varDef.name)) {
        return {
          ok: false,
          error: {
            code: 'UNDEFINED_PLACEHOLDER',
            message: `Variable "${varDef.name}" is defined in # variables but never used in the template body`,
            token: varDef.name,
          },
        };
      }
    }

    // 10. Validate constraints reference only defined variables
    for (const constraint of constraints) {
      const expr = constraint.expression;
      // Extract identifiers from the constraint (simple word-boundary match)
      const identifiers = expr.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g) ?? [];
      // Known function names to exclude from variable validation
      const builtinFunctions = new Set(['lcm', 'gcd', 'min', 'max', 'abs']);

      for (const id of identifiers) {
        if (!builtinFunctions.has(id) && !definedVariables.has(id)) {
          return {
            ok: false,
            error: {
              code: 'CONSTRAINT_PARSE_ERROR',
              message: `Constraint references undefined variable "${id}": "${expr}"`,
              token: id,
            },
          };
        }
      }
    }

    // 11. Detect circular references in constraints
    const circularError = detectCircularReference(constraints, variables);
    if (circularError) {
      return { ok: false, error: circularError };
    }

    return {
      ok: true,
      value: { nodes, variables, constraints },
    };
  }
}

// ─── Default exported instance ────────────────────────────────────────────────

export const templateParser = new TemplateParser();

/** Convenience function */
export function parseTemplate(
  templateText: string
): Result<TemplateAST, ParseError> {
  return templateParser.parse(templateText);
}
