import { db } from '@/prisma/db'
import { checkAvailability } from '@/lib/constraints'
import { notifyLocationManagers } from '@/lib/notify'

/**
 * After any availability change, scan all future PUBLISHED assignments for
 * this user and notify the relevant location managers about any conflicts.
 *
 * Runs entirely outside of any transaction — read-only + notification only.
 * Deduplicates notifications per location so managers receive one message
 * per location even if multiple shifts are now conflicting.
 */
export async function runAvailabilityConflictCheck(
  userId: string,
): Promise<void> {
  const now = new Date()

  const futureAssignments = await db.shiftAssignment.findMany({
    where: {
      userId,
      status: { not: 'CANCELLED' },
      shift: { status: 'PUBLISHED', startTime: { gt: now } },
    },
    include: { shift: true },
  })

  const conflictingLocationIds = new Set<string>()

  await Promise.all(
    futureAssignments.map(async (a) => {
      const result = await checkAvailability(userId, a.shift)
      if (!result.allowed) {
        conflictingLocationIds.add(a.shift.locationId)
      }
    }),
  )

  await Promise.all(
    Array.from(conflictingLocationIds).map((locationId) =>
      notifyLocationManagers(
        locationId,
        'AVAILABILITY_CHANGED',
        `A staff member's availability has changed and now conflicts with one or more published shifts at this location. Please review the schedule.`,
      ),
    ),
  )
}
