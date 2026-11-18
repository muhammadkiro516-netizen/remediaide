/**
 * SSE Manager — RemediAide
 *
 * In-process EventEmitter + optional Redis PubSub bridge.
 *
 * Single-instance mode (no REDIS_URL):
 *   EventEmitter routes broadcasts directly to all local subscribers.
 *
 * Multi-instance mode (REDIS_URL set):
 *   Broadcasts are published to Redis channel `heatmap:{sessionId}`.
 *   A Redis subscriber feeds incoming messages back into the local EventEmitter,
 *   so every Next.js instance keeps its SSE clients up-to-date.
 */

import { EventEmitter } from 'events';
import { publish, subscribeToChannel } from './redis-publisher';
import type { HeatmapEntry } from '@/types';

// ─── SSE Manager Interface ────────────────────────────────────────────────────

export interface ISSEManager {
  subscribe(sessionId: string, onEvent: (entries: HeatmapEntry[]) => void): () => void;
  broadcast(sessionId: string, entries: HeatmapEntry[]): void;
  getLastState(sessionId: string): HeatmapEntry[];
  cleanup(sessionId: string): void;
}

// ─── Implementation ───────────────────────────────────────────────────────────

class SSEManager implements ISSEManager {
  private readonly emitter: EventEmitter;
  private readonly lastState: Map<string, HeatmapEntry[]>;
  // Track active Redis subscriptions per channel to avoid double-subscribing
  private readonly redisUnsubscribers: Map<string, () => void>;

  constructor() {
    this.emitter = new EventEmitter();
    // Increase max listeners — one per SSE client connection per session
    this.emitter.setMaxListeners(500);
    this.lastState = new Map();
    this.redisUnsubscribers = new Map();
  }

  /**
   * Subscribe a client to heatmap updates for a session.
   * Automatically sets up Redis subscription on first subscriber for a session.
   * Returns an unsubscribe function that the SSE route calls when the connection closes.
   */
  subscribe(
    sessionId: string,
    onEvent: (entries: HeatmapEntry[]) => void
  ): () => void {
    const eventName = `heatmap:${sessionId}`;

    // First subscriber for this session — bridge Redis → EventEmitter
    if (this.emitter.listenerCount(eventName) === 0) {
      this._ensureRedisBridge(sessionId);
    }

    this.emitter.on(eventName, onEvent);

    return () => {
      this.emitter.off(eventName, onEvent);
      // Clean up Redis bridge when no more local subscribers
      if (this.emitter.listenerCount(eventName) === 0) {
        const unsub = this.redisUnsubscribers.get(sessionId);
        if (unsub) {
          unsub();
          this.redisUnsubscribers.delete(sessionId);
        }
      }
    };
  }

  /**
   * Broadcast a new heatmap state to all clients subscribed to this session.
   * Stores the state as the last known state for late-joining clients.
   * Also publishes to Redis (fire-and-forget) for multi-instance sync.
   */
  broadcast(sessionId: string, entries: HeatmapEntry[]): void {
    this.lastState.set(sessionId, entries);
    // Emit locally — reaches all SSE clients on this instance
    this.emitter.emit(`heatmap:${sessionId}`, entries);
    // Publish to Redis so other instances receive it too (fire-and-forget)
    publish(`heatmap:${sessionId}`, JSON.stringify(entries)).catch(() => {});
  }

  /**
   * Return the last known heatmap state for a session.
   * Used to send an immediate initial payload when a new SSE connection opens.
   */
  getLastState(sessionId: string): HeatmapEntry[] {
    return this.lastState.get(sessionId) ?? [];
  }

  /**
   * Remove all state and listeners for a session.
   * Call after session is CLOSED and diagnosis is complete.
   */
  cleanup(sessionId: string): void {
    this.lastState.delete(sessionId);
    this.emitter.removeAllListeners(`heatmap:${sessionId}`);
    const unsub = this.redisUnsubscribers.get(sessionId);
    if (unsub) {
      unsub();
      this.redisUnsubscribers.delete(sessionId);
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Set up a Redis → EventEmitter bridge for a session channel.
   * Messages arriving from Redis are re-emitted locally so all SSE connections
   * on this instance receive the update.
   */
  private _ensureRedisBridge(sessionId: string): void {
    if (this.redisUnsubscribers.has(sessionId)) return;

    const channel = `heatmap:${sessionId}`;
    const unsub = subscribeToChannel(channel, (message: string) => {
      try {
        const entries = JSON.parse(message) as HeatmapEntry[];
        // Update cached state and emit to local subscribers
        this.lastState.set(sessionId, entries);
        this.emitter.emit(channel, entries);
      } catch {
        console.error(`[sse-manager] Failed to parse Redis message for ${channel}`);
      }
    });

    this.redisUnsubscribers.set(sessionId, unsub);
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

// Use a global singleton so all Next.js route handler invocations share the
// same EventEmitter instance within a single process.
const globalForSSE = globalThis as unknown as { sseManager?: SSEManager };

export const sseManager: ISSEManager =
  globalForSSE.sseManager ?? (globalForSSE.sseManager = new SSEManager());
