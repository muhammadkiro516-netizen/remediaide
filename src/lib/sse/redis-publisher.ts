/**
 * Redis PubSub helpers for SSE heatmap broadcasts.
 *
 * - If REDIS_URL is set: uses ioredis to publish/subscribe
 * - If REDIS_URL is not set (test / single-instance dev): all ops are no-ops
 *
 * Two separate Redis clients are required by Redis protocol:
 *   publisher  — for PUBLISH commands
 *   subscriber — for SUBSCRIBE commands (blocked connection)
 */

import type Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL;
const IS_REDIS_AVAILABLE = Boolean(REDIS_URL);

// ─── Lazy Redis client factory ────────────────────────────────────────────────

let _publisher: Redis | null = null;
let _subscriber: Redis | null = null;

function createClient(): Redis {
  // Dynamic import to avoid issues in environments without REDIS_URL
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const IORedis = require('ioredis') as typeof import('ioredis');
  const RedisClass = 'default' in IORedis
    ? (IORedis as unknown as { default: typeof Redis }).default
    : (IORedis as unknown as typeof Redis);

  return new RedisClass(REDIS_URL!, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    reconnectOnError: () => true,
  });
}

function getPublisher(): Redis | null {
  if (!IS_REDIS_AVAILABLE) return null;
  if (!_publisher) {
    _publisher = createClient();
    _publisher.on('error', (err: Error) => {
      console.error('[redis-publisher] Connection error:', err.message);
    });
  }
  return _publisher;
}

function getSubscriber(): Redis | null {
  if (!IS_REDIS_AVAILABLE) return null;
  if (!_subscriber) {
    _subscriber = createClient();
    _subscriber.on('error', (err: Error) => {
      console.error('[redis-subscriber] Connection error:', err.message);
    });
  }
  return _subscriber;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Publish a message to a Redis channel.
 * No-op if Redis is not configured.
 */
export async function publish(channel: string, message: string): Promise<void> {
  const pub = getPublisher();
  if (!pub) return;
  try {
    await pub.publish(channel, message);
  } catch (err) {
    console.error(`[redis-publisher] Failed to publish to ${channel}:`, err);
  }
}

/**
 * Subscribe to a Redis channel and call handler on each message.
 * Returns an unsubscribe function.
 * No-op (returns no-op cleanup) if Redis is not configured.
 */
export function subscribeToChannel(
  channel: string,
  handler: (message: string) => void
): () => void {
  const sub = getSubscriber();
  if (!sub) return () => {};

  // Subscribe (fire and forget errors — the subscriber reconnects automatically)
  sub.subscribe(channel).catch((err: Error) => {
    console.error(`[redis-subscriber] Failed to subscribe to ${channel}:`, err.message);
  });

  const messageHandler = (ch: string, msg: string) => {
    if (ch === channel) handler(msg);
  };

  sub.on('message', messageHandler);

  return () => {
    sub.off('message', messageHandler);
    sub.unsubscribe(channel).catch(() => {});
  };
}

/**
 * Gracefully close both Redis connections.
 * Call during process shutdown.
 */
export async function closeRedisConnections(): Promise<void> {
  await Promise.all([
    _publisher?.quit().catch(() => {}),
    _subscriber?.quit().catch(() => {}),
  ]);
  _publisher = null;
  _subscriber = null;
}
