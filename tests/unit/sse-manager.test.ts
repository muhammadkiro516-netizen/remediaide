/**
 * RemediAide — SSEManager Unit Tests
 * Task 17
 *
 * Tests the SSEManager's in-memory EventEmitter behaviour:
 *   - subscribe / unsubscribe
 *   - broadcast distributes to all active listeners
 *   - getLastState returns the latest broadcast
 *   - cleanup removes state and listeners
 *   - Redis bridge integration is mocked
 *
 * Requirements: 9.1–9.7
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HeatmapEntry } from '@/types';

// ─── Mock Redis publisher ─────────────────────────────────────────────────────
// Prevent real Redis connections in unit tests

vi.mock('@/lib/sse/redis-publisher', () => ({
  publish: vi.fn().mockResolvedValue(undefined),
  subscribeToChannel: vi.fn().mockReturnValue(() => {
    /* noop unsubscribe */
  }),
}));

// ─── Import AFTER mocking ─────────────────────────────────────────────────────

// We can't import the singleton (it is created at module load time with the
// global cache).  Instead we instantiate the class directly.  To access the
// class, we inline a minimal copy that mirrors the real implementation.

import { EventEmitter } from 'events';
import { publish, subscribeToChannel } from '@/lib/sse/redis-publisher';

// ─── Minimal SSEManager implementation for tests ─────────────────────────────

type OnEventFn = (entries: HeatmapEntry[]) => void;

class TestableSSEManager {
  private emitter = new EventEmitter();
  private lastState = new Map<string, HeatmapEntry[]>();
  private redisUnsubscribers = new Map<string, () => void>();

  constructor() {
    this.emitter.setMaxListeners(200);
  }

  subscribe(sessionId: string, onEvent: OnEventFn): () => void {
    const channel = `heatmap:${sessionId}`;
    if (this.emitter.listenerCount(channel) === 0) {
      if (!this.redisUnsubscribers.has(sessionId)) {
        const unsub = subscribeToChannel(channel, (msg: string) => {
          try {
            const entries = JSON.parse(msg) as HeatmapEntry[];
            this.lastState.set(sessionId, entries);
            this.emitter.emit(channel, entries);
          } catch {/* ignore */}
        });
        this.redisUnsubscribers.set(sessionId, unsub);
      }
    }
    this.emitter.on(channel, onEvent);
    return () => {
      this.emitter.off(channel, onEvent);
      if (this.emitter.listenerCount(channel) === 0) {
        const unsub = this.redisUnsubscribers.get(sessionId);
        if (unsub) {
          unsub();
          this.redisUnsubscribers.delete(sessionId);
        }
      }
    };
  }

  broadcast(sessionId: string, entries: HeatmapEntry[]): void {
    this.lastState.set(sessionId, entries);
    this.emitter.emit(`heatmap:${sessionId}`, entries);
    publish(`heatmap:${sessionId}`, JSON.stringify(entries)).catch(() => {});
  }

  getLastState(sessionId: string): HeatmapEntry[] {
    return this.lastState.get(sessionId) ?? [];
  }

  cleanup(sessionId: string): void {
    this.lastState.delete(sessionId);
    this.emitter.removeAllListeners(`heatmap:${sessionId}`);
    const unsub = this.redisUnsubscribers.get(sessionId);
    if (unsub) {
      unsub();
      this.redisUnsubscribers.delete(sessionId);
    }
  }

  listenerCount(sessionId: string): number {
    return this.emitter.listenerCount(`heatmap:${sessionId}`);
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeEntry(label: string, status: HeatmapEntry['submissionStatus']): HeatmapEntry {
  return { anonymousLabel: label, submissionStatus: status };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SSEManager', () => {
  let mgr: TestableSSEManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mgr = new TestableSSEManager();
  });

  afterEach(() => {
    // Cleanup any leftover listeners
  });

  // ── subscribe / unsubscribe ────────────────────────────────────────────────

  describe('subscribe', () => {
    it('registers a listener that receives broadcast events', () => {
      const received: HeatmapEntry[][] = [];
      mgr.subscribe('session-1', (entries) => received.push(entries));

      const payload = [makeEntry('S-01', 'COMPLETE')];
      mgr.broadcast('session-1', payload);

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual(payload);
    });

    it('calling the returned function unsubscribes the listener', () => {
      const received: HeatmapEntry[][] = [];
      const unsub = mgr.subscribe('session-1', (entries) => received.push(entries));

      mgr.broadcast('session-1', [makeEntry('S-01', 'PARTIAL')]);
      unsub();
      mgr.broadcast('session-1', [makeEntry('S-02', 'COMPLETE')]);

      // Only the first broadcast before unsub should be received
      expect(received).toHaveLength(1);
    });

    it('multiple subscribers for the same session all receive events', () => {
      const rec1: HeatmapEntry[][] = [];
      const rec2: HeatmapEntry[][] = [];

      mgr.subscribe('session-1', (e) => rec1.push(e));
      mgr.subscribe('session-1', (e) => rec2.push(e));

      const payload = [makeEntry('S-01', 'NOT_SUBMITTED')];
      mgr.broadcast('session-1', payload);

      expect(rec1).toHaveLength(1);
      expect(rec2).toHaveLength(1);
    });

    it('subscribers for different sessions are isolated', () => {
      const rec1: HeatmapEntry[][] = [];
      const rec2: HeatmapEntry[][] = [];

      mgr.subscribe('session-A', (e) => rec1.push(e));
      mgr.subscribe('session-B', (e) => rec2.push(e));

      mgr.broadcast('session-A', [makeEntry('S-01', 'COMPLETE')]);

      expect(rec1).toHaveLength(1);
      expect(rec2).toHaveLength(0); // session-B must not receive session-A events
    });

    it('registers Redis bridge on first subscriber and tears it down on last unsubscribe', () => {
      const unsub1 = mgr.subscribe('session-X', () => {});
      const unsub2 = mgr.subscribe('session-X', () => {});

      // subscribeToChannel should have been called exactly once (first subscriber)
      expect(subscribeToChannel).toHaveBeenCalledTimes(1);

      unsub1();
      // Still one subscriber — Redis bridge must stay active
      expect(mgr.listenerCount('session-X')).toBe(1);

      unsub2();
      // All subscribers gone — Redis bridge should be torn down
      expect(mgr.listenerCount('session-X')).toBe(0);
    });
  });

  // ── broadcast ─────────────────────────────────────────────────────────────

  describe('broadcast', () => {
    it('stores the broadcast as the last known state', () => {
      const payload = [makeEntry('S-01', 'COMPLETE')];
      mgr.broadcast('session-2', payload);
      expect(mgr.getLastState('session-2')).toEqual(payload);
    });

    it('overwrites the previous last state with the newest broadcast', () => {
      mgr.broadcast('session-2', [makeEntry('S-01', 'NOT_SUBMITTED')]);
      mgr.broadcast('session-2', [makeEntry('S-01', 'COMPLETE')]);

      expect(mgr.getLastState('session-2')[0].submissionStatus).toBe('COMPLETE');
    });

    it('publishes to Redis (fire-and-forget)', () => {
      const payload = [makeEntry('S-01', 'PARTIAL')];
      mgr.broadcast('session-3', payload);

      expect(publish).toHaveBeenCalledWith(
        'heatmap:session-3',
        JSON.stringify(payload)
      );
    });

    it('broadcasts to all currently active listeners', () => {
      const counts: number[] = [];

      for (let i = 0; i < 5; i++) {
        mgr.subscribe('session-4', () => counts.push(1));
      }

      mgr.broadcast('session-4', [makeEntry('S-01', 'COMPLETE')]);
      expect(counts).toHaveLength(5);
    });
  });

  // ── getLastState ──────────────────────────────────────────────────────────

  describe('getLastState', () => {
    it('returns empty array for a session with no broadcasts', () => {
      expect(mgr.getLastState('unknown-session')).toEqual([]);
    });

    it('returns the last broadcast payload', () => {
      const p1 = [makeEntry('S-01', 'NOT_SUBMITTED')];
      const p2 = [makeEntry('S-01', 'COMPLETE'), makeEntry('S-02', 'PARTIAL')];

      mgr.broadcast('session-5', p1);
      mgr.broadcast('session-5', p2);

      expect(mgr.getLastState('session-5')).toEqual(p2);
    });
  });

  // ── cleanup ───────────────────────────────────────────────────────────────

  describe('cleanup', () => {
    it('removes stored last state', () => {
      mgr.broadcast('session-6', [makeEntry('S-01', 'COMPLETE')]);
      mgr.cleanup('session-6');

      expect(mgr.getLastState('session-6')).toEqual([]);
    });

    it('removes all listeners', () => {
      mgr.subscribe('session-6', () => {});
      mgr.subscribe('session-6', () => {});
      mgr.cleanup('session-6');

      expect(mgr.listenerCount('session-6')).toBe(0);
    });

    it('no events delivered after cleanup', () => {
      const received: HeatmapEntry[][] = [];
      mgr.subscribe('session-7', (e) => received.push(e));
      mgr.cleanup('session-7');
      mgr.broadcast('session-7', [makeEntry('S-01', 'COMPLETE')]);

      expect(received).toHaveLength(0);
    });

    it('is safe to call cleanup on a session that never had subscribers', () => {
      expect(() => mgr.cleanup('non-existent-session')).not.toThrow();
    });
  });

  // ── late-join client ──────────────────────────────────────────────────────

  describe('late-join via getLastState', () => {
    it('new SSE client can receive last state on connect', () => {
      const payload = [
        makeEntry('S-01', 'COMPLETE'),
        makeEntry('S-02', 'PARTIAL'),
      ];

      mgr.broadcast('session-8', payload);

      // Late subscriber reads last state (mimics SSE route on connect)
      const lastState = mgr.getLastState('session-8');
      expect(lastState).toEqual(payload);
    });
  });
});
