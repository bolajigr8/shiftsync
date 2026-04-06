import { db } from '@/prisma/db'
import type { AuditAction, Prisma } from '@prisma/client'

/**
 * Write an immutable audit log entry.
 *
 * @param actorId    - The user performing the action
 * @param action     - AuditAction enum value
 * @param entityType - Human-readable entity name e.g. "Shift", "SwapRequest"
 * @param entityId   - Primary key of the affected entity
 * @param locationId - Location context (required by schema FK)
 * @param before     - State snapshot before the change (optional)
 * @param after      - State snapshot after the change (optional)
 * @param opts       - overrideReason required when action is OVERRIDE_7TH_DAY
 */
export async function createAuditLog(
  actorId: string,
  action: AuditAction,
  entityType: string,
  entityId: string,
  locationId: string,
  before?: Prisma.InputJsonValue,
  after?: Prisma.InputJsonValue,
  opts?: { overrideReason?: string },
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorId,
        action,
        entityType,
        entityId,
        locationId,
        before: before ?? undefined,
        after: after ?? undefined,
        overrideReason: opts?.overrideReason ?? null,
      },
    })
  } catch (error) {
    // Log to the console but never re-throw.
    console.error('[Audit] createAuditLog failed (non-fatal):', {
      actorId,
      action,
      entityType,
      entityId,
      locationId,
      error,
    })
  }
}
