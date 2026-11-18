/**
 * RemediAide — Template Pretty Printer
 * Task 6
 *
 * Converts a TemplateAST back to canonical string format that can be
 * re-parsed by the TemplateParser (round-trip property).
 *
 * Output format:
 *   <body text with {{placeholder}} syntax>
 *
 *   # variables: a[2..50], b[2..50]
 *   # constraints: a < b, lcm(a,b) <= 100
 *
 * Requirements: 18.1, 18.2, 18.3, 18.4, 18.5
 */

import type { ITemplatePrettyPrinter, TemplateAST } from './types';

// ─── Pretty Printer Class ─────────────────────────────────────────────────────

export class TemplatePrettyPrinter implements ITemplatePrettyPrinter {
  /**
   * Print a TemplateAST back to canonical template string format.
   *
   * The output is deterministic and round-trippable:
   *   parse(print(parse(text))) deep-equals parse(text)
   */
  print(ast: TemplateAST): string {
    const parts: string[] = [];

    // 1. Render the body: text nodes as-is, placeholder nodes as {{varName}}
    let body = '';
    for (const node of ast.nodes) {
      if (node.type === 'text') {
        body += node.value;
      } else {
        body += `{{${node.name}}}`;
      }
    }

    parts.push(body.trim());

    // 2. Append `# variables:` line (sorted by variable name for determinism)
    if (ast.variables.length > 0) {
      const varParts = ast.variables
        .map((v) => `${v.name}[${v.min}..${v.max}]`)
        .join(', ');
      parts.push(`# variables: ${varParts}`);
    }

    // 3. Append `# constraints:` line (if any)
    if (ast.constraints.length > 0) {
      const constraintParts = ast.constraints.map((c) => c.expression).join(', ');
      parts.push(`# constraints: ${constraintParts}`);
    }

    return parts.join('\n');
  }
}

// ─── Default exported instance ────────────────────────────────────────────────

export const prettyPrinter = new TemplatePrettyPrinter();

/** Convenience function */
export function printTemplate(ast: TemplateAST): string {
  return prettyPrinter.print(ast);
}
