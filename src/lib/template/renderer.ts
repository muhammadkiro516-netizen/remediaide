/**
 * RemediAide — Template Renderer
 * Task 6
 *
 * Substitutes placeholder nodes in a TemplateAST with concrete numeric values.
 * Renders in < 100ms per variant.
 *
 * Requirements: 17.3
 */

import type { ITemplateRenderer, TemplateAST } from './types';

// ─── Renderer Class ───────────────────────────────────────────────────────────

export class TemplateRenderer implements ITemplateRenderer {
  /**
   * Render a TemplateAST to a string by substituting placeholders with values.
   *
   * @param ast - The parsed template AST
   * @param values - Map of variable name → numeric value
   * @returns The rendered string with all placeholders replaced
   * @throws Error if a placeholder has no corresponding value in `values`
   */
  render(ast: TemplateAST, values: Record<string, number>): string {
    let result = '';

    for (const node of ast.nodes) {
      if (node.type === 'text') {
        result += node.value;
      } else {
        // placeholder node
        if (!(node.name in values)) {
          throw new Error(
            `Renderer: placeholder "{{${node.name}}}" has no corresponding value. ` +
              `Available keys: [${Object.keys(values).join(', ')}]`
          );
        }
        result += String(values[node.name]);
      }
    }

    return result;
  }
}

// ─── Default exported instance ────────────────────────────────────────────────

export const templateRenderer = new TemplateRenderer();

/** Convenience function */
export function renderTemplate(
  ast: TemplateAST,
  values: Record<string, number>
): string {
  return templateRenderer.render(ast, values);
}
