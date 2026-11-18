/**
 * Rate Limit Helper Tests
 *
 * Tests the in-memory sliding-window rate limiter behavior.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, clearRateLimitStore } from './rate-limit';

describe('rate-limit', () => {
  beforeEach(() => {
    // Reset store before each test for isolation
    clearRateLimitStore();
  });

  it('first 20 calls within a window are all allowed', () => {
    const ip = '127.0.0.1';
    
    for (let i = 0; i < 20; i++) {
      const result = checkRateLimit(ip);
      expect(result.allowed).toBe(true);
    }
  });

  it('21st call within same window returns { allowed: false } with a retryAfter property', () => {
    const ip = '192.168.1.1';
    
    // Exhaust the limit
    for (let i = 0; i < 20; i++) {
      checkRateLimit(ip);
    }
    
    // 21st call should be denied
    const result = checkRateLimit(ip);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeDefined();
    expect(typeof result.retryAfter).toBe('number');
    expect(result.retryAfter!).toBeGreaterThan(0);
  });

  it('after calling clearRateLimitStore() the count resets and the next call is allowed', () => {
    const ip = '10.0.0.1';
    
    // Exhaust the limit
    for (let i = 0; i < 20; i++) {
      checkRateLimit(ip);
    }
    
    // Verify we're at the limit
    const deniedResult = checkRateLimit(ip);
    expect(deniedResult.allowed).toBe(false);
    
    // Reset the store
    clearRateLimitStore();
    
    // Should be allowed again
    const allowedResult = checkRateLimit(ip);
    expect(allowedResult.allowed).toBe(true);
  });

  it('different IPs have independent rate limit windows', () => {
    const ip1 = '10.0.0.1';
    const ip2 = '10.0.0.2';
    
    // Exhaust limit for ip1
    for (let i = 0; i < 20; i++) {
      checkRateLimit(ip1);
    }
    
    // ip1 should be blocked
    expect(checkRateLimit(ip1).allowed).toBe(false);
    
    // ip2 should still be allowed
    expect(checkRateLimit(ip2).allowed).toBe(true);
  });
});
