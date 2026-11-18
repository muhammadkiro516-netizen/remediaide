/**
 * RemediAide — Constraint Evaluator
 * Task 6
 *
 * Evaluates constraint expressions against a set of variable values.
 * Supports relational operators (<, <=, >, >=, ==, !=) and functions (lcm, gcd).
 *
 * Requirements: 10.2, 10.3
 */

// ─── Math Helpers ─────────────────────────────────────────────────────────────

/** Compute GCD using Euclidean algorithm */
function gcd(a: number, b: number): number {
  a = Math.abs(Math.floor(a));
  b = Math.abs(Math.floor(b));
  if (b === 0) return a;
  return gcd(b, a % b);
}

/** Compute LCM using formula: lcm(a, b) = (a * b) / gcd(a, b) */
function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return Math.abs(Math.floor((a * b) / gcd(a, b)));
}

// ─── Constraint Evaluator ─────────────────────────────────────────────────────

export interface ConstraintEvaluator {
  evaluate(
    expression: string,
    values: Record<string, number>
  ): boolean;
}

/**
 * Evaluates a constraint expression.
 *
 * Supported operators:
 *   <, <=, >, >=, ==, !=
 *
 * Supported functions:
 *   lcm(a, b), gcd(a, b)
 *
 * Examples:
 *   "a < b" with {a: 2, b: 5} → true
 *   "lcm(a, b) <= 100" with {a: 12, b: 8} → true (lcm=24)
 *   "gcd(a, b) == 1" with {a: 7, b: 11} → true
 */
export class DefaultConstraintEvaluator implements ConstraintEvaluator {
  evaluate(expression: string, values: Record<string, number>): boolean {
    // 1. Substitute variable names with their numeric values
    let substituted = expression;

    // Sort keys by length (longest first) to avoid partial matches
    // e.g. if we have variables "a" and "ab", process "ab" before "a"
    const sortedKeys = Object.keys(values).sort((a, b) => b.length - a.length);

    for (const key of sortedKeys) {
      // Use word boundaries to avoid replacing part of function names or other variables
      const regex = new RegExp(`\\b${key}\\b`, 'g');
      substituted = substituted.replace(regex, String(values[key]));
    }

    // 2. Replace function calls with their computed values
    // lcm(a, b)
    substituted = substituted.replace(
      /lcm\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/gi,
      (_match, a, b) => {
        return String(lcm(parseFloat(a), parseFloat(b)));
      }
    );

    // gcd(a, b)
    substituted = substituted.replace(
      /gcd\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/gi,
      (_match, a, b) => {
        return String(gcd(parseFloat(a), parseFloat(b)));
      }
    );

    // 3. Parse the final expression as a relational comparison
    // Supported: <, <=, >, >=, ==, !=
    const comparisonMatch = substituted.match(
      /^\s*(-?\d+(?:\.\d+)?)\s*(<=|>=|<|>|==|!=)\s*(-?\d+(?:\.\d+)?)\s*$/
    );

    if (!comparisonMatch) {
      throw new Error(
        `ConstraintEvaluator: unable to parse expression after substitution: "${substituted}" (original: "${expression}")`
      );
    }

    const left = parseFloat(comparisonMatch[1]);
    const operator = comparisonMatch[2];
    const right = parseFloat(comparisonMatch[3]);

    // 4. Evaluate the comparison
    switch (operator) {
      case '<':
        return left < right;
      case '<=':
        return left <= right;
      case '>':
        return left > right;
      case '>=':
        return left >= right;
      case '==':
        return left === right;
      case '!=':
        return left !== right;
      default:
        throw new Error(
          `ConstraintEvaluator: unknown operator "${operator}" in expression: "${expression}"`
        );
    }
  }
}

// ─── Default exported instance ────────────────────────────────────────────────

export const constraintEvaluator = new DefaultConstraintEvaluator();

/** Convenience function */
export function evaluateConstraint(
  expression: string,
  values: Record<string, number>
): boolean {
  return constraintEvaluator.evaluate(expression, values);
}

/** Export math helpers for tests */
export { gcd, lcm };
