// =============================================================================
// ShiftSync — Swap request lifecycle helpers
// =============================================================================

import { createNotification } from '@/lib/notify'
import { db } from '@/prisma/db'
import type { SafeUser } from '@/types/index'

// ---------------------------------------------------------------------------
// Auto-cancel
// ---------------------------------------------------------------------------

/**
 * Cancel all non-terminal swap requests for a shift (e.g. when the shift
 * itself is cancelled) and notify every involved party.
 *
 * Non-terminal statuses: PENDING, PENDING_APPROVAL, ACCEPTED.
 */
export async function autoCancelSwapsForShift(
  shiftId: string,
  reason: string,
): Promise<void> {
  const swaps = await db.swapRequest.findMany({
    where: {
      assignment: { shiftId },
      status: {
        notIn: [
          'APPROVED',
          'REJECTED',
          'CANCELLED',
          'EXPIRED',
          'AUTO_CANCELLED',
        ],
      },
    },
    select: { id: true, requesterId: true, targetUserId: true },
  })

  await Promise.all(
    swaps.map(async (swap) => {
      await db.swapRequest.update({
        where: { id: swap.id },
        data: { status: 'AUTO_CANCELLED' },
      })

      const message = `Your swap request has been automatically cancelled: ${reason}`

      await createNotification(
        swap.requesterId,
        'SWAP_AUTO_CANCELLED',
        message,
        { swapId: swap.id },
      )

      if (swap.targetUserId) {
        await createNotification(
          swap.targetUserId,
          'SWAP_AUTO_CANCELLED',
          message,
          { swapId: swap.id },
        )
      }
    }),
  )
}

// ---------------------------------------------------------------------------
// Eligible pickup staff
// ---------------------------------------------------------------------------

/**
 * Return all active users who:
 *   1. Are certified at the shift's location (active StaffLocation).
 *   2. Hold the required skill.
 *   3. Have no overlapping non-cancelled assignment during the shift window.
 */
export async function getEligiblePickupStaff(
  shiftId: string,
): Promise<Omit<SafeUser, 'passwordHash'>[]> {
  const shift = await db.shift.findUnique({
    where: { id: shiftId },
    select: {
      locationId: true,
      requiredSkill: true,
      startTime: true,
      endTime: true,
    },
  })

  if (!shift) return []

  const eligible = await db.user.findMany({
    where: {
      isActive: true,
      staffLocations: {
        some: { locationId: shift.locationId, isActive: true },
      },
      skills: { some: { skill: shift.requiredSkill } },
      // Exclude anyone with an overlapping assignment.
      shiftAssignments: {
        none: {
          status: { not: 'CANCELLED' },
          shift: {
            status: { not: 'CANCELLED' },
            startTime: { lt: shift.endTime },
            endTime: { gt: shift.startTime },
          },
        },
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      timezone: true,
      desiredWeeklyHours: true,
      hourlyRate: true,
      notificationPrefs: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return eligible
}

// ---------------------------------------------------------------------------
// Expire stale drop requests
// ---------------------------------------------------------------------------

/**
 * Mark all PENDING DROP requests whose expiresAt is in the past as EXPIRED.
 * Intended to be called from a scheduled cron job or on-demand cleanup route.
 */
export async function expireStaleDropRequests(): Promise<number> {
  const now = new Date()

  const stale = await db.swapRequest.findMany({
    where: {
      type: 'DROP',
      status: 'PENDING',
      expiresAt: { lt: now },
    },
    select: { id: true },
  })

  if (stale.length === 0) return 0

  await db.swapRequest.updateMany({
    where: { id: { in: stale.map((s) => s.id) } },
    data: { status: 'EXPIRED' },
  })

  return stale.length
}
