import { describe, it, expect } from 'vitest';
import { PUBLIC_ROUTES } from './auth.config';

/**
 * Mirror of the internal isPublic() helper so tests don't depend on
 * the function being exported from auth.config.ts.
 */
function isPublic(pathname: string): boolean {
  return PUBLIC_ROUTES.some((r) => r.test(pathname));
}

describe('auth.config — public route matching', () => {
  it('allows unauthenticated access to /exit-ticket/<token>', () => {
    expect(isPublic('/exit-ticket/sometoken')).toBe(true);
  });

  it('allows unauthenticated access to /api/exit-ticket/<token>/submit', () => {
    expect(isPublic('/api/exit-ticket/sometoken/submit')).toBe(true);
  });

  it('allows unauthenticated access to /exit-ticket/ (root with trailing slash)', () => {
    expect(isPublic('/exit-ticket/')).toBe(true);
  });

  it('allows unauthenticated access to GET /api/exit-ticket/<token>', () => {
    expect(isPublic('/api/exit-ticket/abc123def456')).toBe(true);
  });

  it('blocks unauthenticated access to /dashboard/sessions/123/results', () => {
    expect(isPublic('/dashboard/sessions/123/results')).toBe(false);
  });

  it('does not expose /dashboard under public routes', () => {
    expect(isPublic('/dashboard')).toBe(false);
  });

  it('does not expose /api/sessions under public routes', () => {
    expect(isPublic('/api/sessions/some-id')).toBe(false);
  });
});
