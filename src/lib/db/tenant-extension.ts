/**
 * Prisma Client Extension — Shared-Schema Multi-Tenant Isolation.
 *
 * Automatically injects `WHERE school_id = <currentSchoolId>` on every
 * `findMany` and `findFirst` call for tenant-scoped models, preventing
 * cross-tenant data leakage without requiring callers to remember the filter.
 *
 * Tenant-scoped models (per design):
 *   Teacher, Class, Student, Test, Question, Response, ConceptDiagnosis
 *
 * Non-scoped models (school-agnostic or handled separately):
 *   School, ItemVariant, SessionPin, RemedialGroup, CalibrationConfig, AutoWipeLog
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { getCurrentSchoolId } from './context';

// Models that require automatic school_id injection
const TENANT_MODELS = new Set([
  'teacher',
  'class',
  'student',
  'test',
  'question',
  'response',
  'conceptDiagnosis',
]);

/**
 * Creates a Prisma Client extension that injects `schoolId` filters for all
 * tenant-scoped model queries sourced from `AsyncLocalStorage`.
 *
 * Call this once and reuse the extended client within a request context.
 */
export function createTenantExtension(prisma: PrismaClient) {
  return prisma.$extends({
    name: 'tenant-isolation',
    query: {
      $allModels: {
        async findMany({ model, operation, args, query }) {
          if (TENANT_MODELS.has(model.charAt(0).toLowerCase() + model.slice(1))) {
            const schoolId = getCurrentSchoolId();
            if (schoolId) {
              args.where = {
                ...(args.where ?? {}),
                schoolId,
              } as typeof args.where;
            }
          }
          return query(args);
        },

        async findFirst({ model, operation, args, query }) {
          if (TENANT_MODELS.has(model.charAt(0).toLowerCase() + model.slice(1))) {
            const schoolId = getCurrentSchoolId();
            if (schoolId) {
              args.where = {
                ...(args.where ?? {}),
                schoolId,
              } as typeof args.where;
            }
          }
          return query(args);
        },

        async findFirstOrThrow({ model, operation, args, query }) {
          if (TENANT_MODELS.has(model.charAt(0).toLowerCase() + model.slice(1))) {
            const schoolId = getCurrentSchoolId();
            if (schoolId) {
              args.where = {
                ...(args.where ?? {}),
                schoolId,
              } as typeof args.where;
            }
          }
          return query(args);
        },

        async findUnique({ model, operation, args, query }) {
          // findUnique uses a unique selector — cannot inject an extra where clause
          // without converting to findFirst. We leave this as-is; unique lookups
          // should be validated via ownership check at the route layer.
          return query(args);
        },

        async count({ model, operation, args, query }) {
          if (TENANT_MODELS.has(model.charAt(0).toLowerCase() + model.slice(1))) {
            const schoolId = getCurrentSchoolId();
            if (schoolId) {
              args.where = {
                ...(args.where ?? {}),
                schoolId,
              } as typeof args.where;
            }
          }
          return query(args);
        },
      },
    },
  });
}

/**
 * Type alias for the tenant-extended Prisma client.
 * Use this wherever you need the auto-injecting client inside a tenant context.
 */
export type TenantPrismaClient = ReturnType<typeof createTenantExtension>;
