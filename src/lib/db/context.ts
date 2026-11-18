/**
 * Tenant context via AsyncLocalStorage.
 *
 * Usage:
 *   await withTenantContext(schoolId, async () => {
 *     // All Prisma queries inside here will automatically filter by schoolId
 *     const teachers = await tenantPrisma.teacher.findMany();
 *   });
 */

import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  schoolId: string;
}

/**
 * Singleton AsyncLocalStorage instance shared across the application.
 * Auth Middleware sets the context from the JWT claim (school_id).
 */
export const tenantStorage = new AsyncLocalStorage<TenantContext>();

/**
 * Helper that runs `fn` inside a tenant context bound to `schoolId`.
 * Any Prisma queries executed within `fn` will have school_id automatically injected.
 */
export function withTenantContext<T>(
  schoolId: string,
  fn: () => Promise<T>
): Promise<T> {
  return tenantStorage.run({ schoolId }, fn);
}

/**
 * Retrieve the current tenant's schoolId from AsyncLocalStorage.
 * Returns undefined when called outside a tenant context (e.g., background jobs
 * that do not require tenant isolation — those should pass schoolId explicitly).
 */
export function getCurrentSchoolId(): string | undefined {
  return tenantStorage.getStore()?.schoolId;
}
