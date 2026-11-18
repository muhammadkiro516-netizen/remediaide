/**
 * Unit Tests — Session State Machine
 *
 * Tests all 6 transition combinations (3 valid + 3 invalid via applyTransition)
 * and isTerminalState.
 *
 * Requirements: 1.7
 */

import { describe, it, expect } from 'vitest';
import {
  applyTransition,
  validateTransition,
  isTerminalState,
  type SessionState,
} from '../state-machine';

// ─── applyTransition ──────────────────────────────────────────────────────────

describe('applyTransition', () => {
  // ── Valid transitions ──────────────────────────────────────────────────────

  it('LOCKED + activate → ACTIVE (valid)', () => {
    const result = applyTransition('LOCKED', 'activate');
    expect(result).toBe('ACTIVE');
  });

  it('ACTIVE + close → CLOSED (valid)', () => {
    const result = applyTransition('ACTIVE', 'close');
    expect(result).toBe('CLOSED');
  });

  // ── Invalid transitions ────────────────────────────────────────────────────

  it('LOCKED + close → throws (cannot close a LOCKED session)', () => {
    expect(() => applyTransition('LOCKED', 'close')).toThrow();
  });

  it('ACTIVE + activate → throws (already ACTIVE)', () => {
    expect(() => applyTransition('ACTIVE', 'activate')).toThrow();
  });

  it('CLOSED + activate → throws (terminal state)', () => {
    expect(() => applyTransition('CLOSED', 'activate')).toThrow();
  });

  it('CLOSED + close → throws (terminal state)', () => {
    expect(() => applyTransition('CLOSED', 'close')).toThrow();
  });

  // ── Error messages are descriptive ────────────────────────────────────────

  it('LOCKED + close error message mentions LOCKED and close', () => {
    expect(() => applyTransition('LOCKED', 'close')).toThrowError(
      /LOCKED/i
    );
  });

  it('CLOSED + activate error message mentions terminal or CLOSED', () => {
    expect(() => applyTransition('CLOSED', 'activate')).toThrowError(
      /CLOSED|terminal/i
    );
  });

  it('ACTIVE + activate error message mentions ACTIVE or diaktifkan', () => {
    expect(() => applyTransition('ACTIVE', 'activate')).toThrowError(
      /ACTIVE|aktif/i
    );
  });
});

// ─── validateTransition ───────────────────────────────────────────────────────

describe('validateTransition', () => {
  it('LOCKED → ACTIVE: does not throw', () => {
    expect(() => validateTransition('LOCKED', 'ACTIVE')).not.toThrow();
  });

  it('ACTIVE → CLOSED: does not throw', () => {
    expect(() => validateTransition('ACTIVE', 'CLOSED')).not.toThrow();
  });

  it('ACTIVE → LOCKED: throws (reverse transition)', () => {
    expect(() => validateTransition('ACTIVE', 'LOCKED')).toThrow();
  });

  it('CLOSED → ACTIVE: throws (reverse transition from terminal)', () => {
    expect(() => validateTransition('CLOSED', 'ACTIVE')).toThrow();
  });

  it('CLOSED → LOCKED: throws (reverse transition from terminal)', () => {
    expect(() => validateTransition('CLOSED', 'LOCKED')).toThrow();
  });

  it('LOCKED → LOCKED: throws (repeat/same-state transition)', () => {
    expect(() => validateTransition('LOCKED', 'LOCKED')).toThrow();
  });

  it('ACTIVE → ACTIVE: throws (repeat/same-state transition)', () => {
    expect(() => validateTransition('ACTIVE', 'ACTIVE')).toThrow();
  });

  it('CLOSED → CLOSED: throws (terminal state)', () => {
    expect(() => validateTransition('CLOSED', 'CLOSED')).toThrow();
  });

  it('LOCKED → CLOSED: throws (skip one state)', () => {
    expect(() => validateTransition('LOCKED', 'CLOSED')).toThrow();
  });
});

// ─── isTerminalState ──────────────────────────────────────────────────────────

describe('isTerminalState', () => {
  it('returns true for CLOSED', () => {
    expect(isTerminalState('CLOSED')).toBe(true);
  });

  it('returns false for LOCKED', () => {
    expect(isTerminalState('LOCKED')).toBe(false);
  });

  it('returns false for ACTIVE', () => {
    expect(isTerminalState('ACTIVE')).toBe(false);
  });
});

// ─── State machine chain: simulate a full lifecycle ───────────────────────────

describe('full lifecycle simulation', () => {
  it('LOCKED → activate → ACTIVE → close → CLOSED', () => {
    let state: SessionState = 'LOCKED';

    state = applyTransition(state, 'activate');
    expect(state).toBe('ACTIVE');
    expect(isTerminalState(state)).toBe(false);

    state = applyTransition(state, 'close');
    expect(state).toBe('CLOSED');
    expect(isTerminalState(state)).toBe(true);
  });

  it('once CLOSED, no further transitions are possible', () => {
    const state: SessionState = 'CLOSED';
    expect(() => applyTransition(state, 'activate')).toThrow();
    expect(() => applyTransition(state, 'close')).toThrow();
  });
});
