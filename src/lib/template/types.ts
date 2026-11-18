/**
 * RemediAide — Template Parser & Isomorphic Item Pool
 * Type definitions for Task 6
 *
 * Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 18.1
 */

// ─── Result Type (Rust-style) ──────────────────────────────────────────────────

export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// ─── Parse Errors ─────────────────────────────────────────────────────────────

export interface ParseError {
  code:
    | 'UNDEFINED_PLACEHOLDER'
    | 'UNDEFINED_VARIABLE'
    | 'INJECTION_DETECTED'
    | 'CONSTRAINT_PARSE_ERROR'
    | 'INVALID_RANGE'
    | 'CIRCULAR_REFERENCE';
  message: string;
  position?: number;
  token?: string;
}

// ─── AST Nodes ────────────────────────────────────────────────────────────────

export type ASTNode =
  | { type: 'text'; value: string }
  | { type: 'placeholder'; name: string };

// ─── Template Structures ──────────────────────────────────────────────────────

export interface VariableDefinition {
  name: string;
  min: number;
  max: number;
}

export interface ConstraintExpression {
  expression: string; // e.g. "a < b", "lcm(a,b) <= 100"
  rawText: string;
}

export interface TemplateAST {
  nodes: ASTNode[];
  variables: VariableDefinition[];
  constraints: ConstraintExpression[];
}

export interface ParsedTemplate {
  ast: TemplateAST;
  originalText: string;
}

// ─── Rendered Output Structures ───────────────────────────────────────────────

export interface RenderedOption {
  key: string; // 'A', 'B', 'C', 'D'
  text: string;
  isCorrect: boolean;
}

export interface GeneratedVariant {
  variableValues: Record<string, number>;
  renderedText: string;
  renderedOptions: RenderedOption[];
  correctOptionKey: string;
  tauMinSeconds: number;
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface ITemplateParser {
  parse(templateText: string): Result<TemplateAST, ParseError>;
}

export interface ITemplatePrettyPrinter {
  print(ast: TemplateAST): string;
}

export interface ITemplateRenderer {
  render(ast: TemplateAST, values: Record<string, number>): string;
}
