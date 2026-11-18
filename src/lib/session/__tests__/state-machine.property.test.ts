/**
 * Property-Based Tests — Session State Machine
 *
 * Feature: remediaide, Property 9: State Machine Irreversibility
 *
 * FOR ALL reverse/invalid transition attempts, applyTransition MUST throw.
 * Specifically:
 *   - CLOSED → activate  (reverse from terminal)
 *   - CLOSED → close     (repeat on terminal)
 *   - ACTIVE → activate  (repeat same state)
 *   - LOCKED → close     (wrong event for state)
 *   - ACTIVE → LOCKED    (reverse via validateTransition)
 *   - CLOSED → ACTIVE    (reverse via validateTransition)
 *   - CLOSED → LOCKED    (reverse via validateTransition)
 *
 * numRuns: 100
 *
 * Validates: Requirements 1.7
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  applyTransition,
  validateTransition,
  isTerminalState,
  type SessionState,
  type SessionEvent,
} from '../state-machine';

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const stateArb = fc.constantFrom<SessionState>('LOCKED', 'ACTIVE', 'CLOSED');
const eventArb = fc.constantFrom<SessionEvent>('activate', 'close');

// ─── Property 9: State Machine Irreversibility ────────────────────────────────

describe('Property 9: State Machine Irreversibility', () => {
  /**
   * For ALL combinations of (state, event) that are NOT the two valid transitions
   * (LOCKED+activate, ACTIVE+close), applyTransition MUST throw.
   */
  it(
    'any non-forward transition attempt throws — 100 samples',
    () => {
      fc.assert(
        fc.property(
          stateArb,
          eventArb,
          (state, event) => {
            const isValidForward =
              (state === 'LOCKED' && event === 'activate') ||
              (state === 'ACTIVE' && event === 'close');

            if (isValidForward) {
              // Valid forward transition — must NOT throw
              expect(() => applyTransition(state, event)).not.toThrow();
            } else {
              // All other combinations MUST throw
              expect(() => applyTransition(state, event)).toThrow();
            }
          }
        ),
        { numRuns: 100, verbose: true }
      );
    }
  );

  /**
   * CLOSED is terminal: both 'activate' and 'close' events MUST throw.
   */
  it(
    'CLOSED state rejects ALL events — 100 samples',
    () => {
      fc.assert(
        fc.property(
          eventArb,
          (event) => {
            expect(() => applyTransition('CLOSED', event)).toThrow();
          }
        ),
        { numRuns: 100, verbose: true }
      );
    }
  );

  /**
   * isTerminalState(CLOSED) is always true; LOCKED and ACTIVE always false.
   * This holds for any repeated check (idempotent read).
   */
  it(
    'isTerminalState is true only for CLOSED — 100 samples',
    () => {
      fc.assert(
        fc.property(
          stateArb,
          (state) => {
            const result = isTerminalState(state);
            if (state === 'CLOSED') {
              expect(result).toBe(true);
            } else {
              expect(result).toBe(false);
            }
          }
        ),
        { numRuns: 100, verbose: true }
      );
    }
  );

  /**
   * validateTransition: reverse transitions (target < source in LOCKED<ACTIVE<CLOSED order)
   * always throw regardless of the specific state values.
   */
  it(
    'validateTransition rejects all reverse transitions — 100 samples',
    () => {
      // Only reverse pairs: ACTIVE→LOCKED, CLOSED→ACTIVE, CLOSED→LOCKED
      const reversePairs: Array<[SessionState, SessionState]> = [
        ['ACTIVE', 'LOCKED'],
        ['CLOSED', 'ACTIVE'],
        ['CLOSED', 'LOCKED'],
      ];

      const reversePairArb = fc.constantFrom<[SessionState, SessionState]>(
        ...reversePairs
      );

      fc.assert(
        fc.property(
          reversePairArb,
          ([current, target]) => {
            expect(() => validateTransition(current, target)).toThrow();
          }
        ),
        { numRuns: 100, verbose: true }
      );
    }
  );

  /**
   * validateTransition: same-state transitions always throw (idempotent check).
   */
  it(
    'validateTransition rejects same-state (repeat) transitions — 100 samples',
    () => {
      fc.assert(
        fc.property(
          stateArb,
          (state) => {
            expect(() => validateTransition(state, state)).toThrow();
          }
        ),
        { numRuns: 100, verbose: true }
      );
    }
  );

  /**
   * The LOCKED→ACTIVE→CLOSED forward chain is always achievable in order.
   * After each applyTransition the resulting state must be the expected next state.
   * Using a fixed-trajectory test driven by fast-check for completeness.
   */
  it(
    'forward chain LOCKED→ACTIVE→CLOSED always produces correct next states — 100 runs',
    () => {
      // We use fc.constant to drive numRuns=100 identical executions of the chain,
      // confirming determinism and idempotence of the forward path.
      fc.assert(
        fc.property(
          fc.constant(null),
          () => {
            const s1 = applyTransition('LOCKED', 'activate');
            expect(s1).toBe('ACTIVE');

            const s2 = applyTransition(s1, 'close');
            expect(s2).toBe('CLOSED');

            expect(isTerminalState(s2)).toBe(true);
          }
        ),
        { numRuns: 100, verbose: true }
      );
    }
  );
});
