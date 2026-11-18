import { PrismaClient } from "@prisma/client";
import { createTenantExtension } from "./tenant-extension";

// Prisma Client singleton pattern
// Prevents multiple instances in development due to hot-reloading

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = basePrisma;
}

/**
 * Base Prisma client without tenant injection.
 * Use only for operations that explicitly bypass tenant isolation
 * (e.g., system-level seeding, auth lookup by email across schools).
 */
export const prisma = basePrisma;

/**
 * Tenant-aware Prisma client.
 * Automatically injects `WHERE school_id = ?` for all tenant-scoped models
 * when called within a `withTenantContext(schoolId, fn)` scope.
 *
 * This is the default client for all route handlers and domain services.
 */
export const tenantPrisma = createTenantExtension(basePrisma);

export default tenantPrisma;
