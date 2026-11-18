/**
 * RemediAide — Session State Machine
 *
 * Implements a strict one-way state machine for SessionPin:
 *   LOCKED → ACTIVE → CLOSED
 *
 * Reverse transitions and repeat transitions are rejected with
 * descriptive errors.
 *
 * All functions are pure (no side effects, no DB calls).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type SessionState = 'LOCKED' | 'ACTIVE' | 'CLOSED';

/**
 * Events that drive state transitions.
 * - 'activate' : teacher starts the session  (LOCKED → ACTIVE)
 * - 'close'    : session ends manually/auto  (ACTIVE → CLOSED)
 */
export type SessionEvent = 'activate' | 'close';

// ─── Valid forward-transitions ────────────────────────────────────────────────

/** The only valid target for each state (null = terminal). */
const VALID_NEXT: Record<SessionState, SessionState | null> = {
  LOCKED: 'ACTIVE',
  ACTIVE: 'CLOSED',
  CLOSED: null,
};

/** The event that triggers each valid forward transition. */
const EVENT_FOR_TRANSITION: Record<SessionState, SessionEvent | null> = {
  LOCKED: 'activate',
  ACTIVE: 'close',
  CLOSED: null,
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validate whether moving from `current` to `target` is permitted.
 *
 * Throws a descriptive `Error` if:
 *  - The transition is a reverse move (e.g. ACTIVE → LOCKED)
 *  - The transition is a repeat move (e.g. ACTIVE → ACTIVE)
 *  - `current` is the terminal state CLOSED
 *
 * @throws {Error} with a human-readable message
 */
export function validateTransition(
  current: SessionState,
  target: SessionState
): void {
  if (current === target) {
    throw new Error(
      `Transisi tidak valid: sesi sudah berada di state '${current}'.`
    );
  }

  if (current === 'CLOSED') {
    throw new Error(
      `Transisi tidak valid: state 'CLOSED' adalah terminal — tidak dapat bertransisi ke '${target}'.`
    );
  }

  const validNext = VALID_NEXT[current];
  if (validNext !== target) {
    throw new Error(
      `Transisi tidak valid: tidak dapat berpindah dari '${current}' ke '${target}'. ` +
        `Transisi yang diizinkan: '${current}' → '${validNext ?? 'tidak ada (terminal)'}'. ` +
        `Transisi balik (reverse) dilarang.`
    );
  }
}

/**
 * Apply a named event to the current state and return the resulting state.
 *
 * Valid transitions:
 *  - 'activate' on LOCKED  → ACTIVE
 *  - 'close'    on ACTIVE  → CLOSED
 *
 * All other combinations throw descriptive errors.
 *
 * @throws {Error} if the event is not valid for the current state
 */
export function applyTransition(
  current: SessionState,
  event: SessionEvent
): SessionState {
  if (current === 'CLOSED') {
    throw new Error(
      `Transisi tidak valid: state 'CLOSED' adalah terminal — event '${event}' ditolak.`
    );
  }

  const expectedEvent = EVENT_FOR_TRANSITION[current];

  if (expectedEvent !== event) {
    const validNext = VALID_NEXT[current];
    if (event === 'activate' && current === 'ACTIVE') {
      throw new Error(
        `Transisi tidak valid: sesi sudah ACTIVE — tidak dapat diaktifkan ulang.`
      );
    }
    if (event === 'close' && current === 'LOCKED') {
      throw new Error(
        `Transisi tidak valid: sesi masih LOCKED — harus diaktifkan dahulu sebelum dapat ditutup.`
      );
    }
    throw new Error(
      `Transisi tidak valid: event '${event}' tidak dapat diterapkan pada state '${current}'. ` +
        `Event yang diizinkan untuk state ini: '${expectedEvent ?? 'tidak ada'}'. ` +
        `State berikutnya yang valid: '${validNext ?? 'tidak ada (terminal)'}'.`
    );
  }

  // Safe to transition
  return VALID_NEXT[current] as SessionState;
}

/**
 * Returns true only when the state is the terminal state (CLOSED).
 * Once in terminal state, no further transitions are allowed.
 */
export function isTerminalState(state: SessionState): boolean {
  return state === 'CLOSED';
}

/**
 * Returns true if the given string is a valid SessionState.
 * Useful for runtime validation of DB values.
 */
export function isValidSessionState(value: string): value is SessionState {
  return value === 'LOCKED' || value === 'ACTIVE' || value === 'CLOSED';
}
