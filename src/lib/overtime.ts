// =============================================================================
// ShiftSync — Overtime and cost projection utilities
// =============================================================================

import { getWeekBoundsUTC } from '@/lib/timezone'
import { db } from '@/prisma/db'
import { differenceInMinutes } from 'date-fns'

/**
 * Sum the hours of all non-cancelled assignments for a user in the ISO week
 * that begins at weekStart (Monday 00:00:00 UTC).
 */
export async function getWeeklyHours(
  userId: string,
  weekStart: Date,
): Promise<number> {
  const { weekEnd } = getWeekBoundsUTC(weekStart)

  const assignments = await db.shiftAssignment.findMany({
    where: {
      userId,
      status: { not: 'CANCELLED' },
      shift: {
        status: { not: 'CANCELLED' },
        startTime: { gte: weekStart, lte: weekEnd },
      },
    },
    include: { shift: { select: { startTime: true, endTime: true } } },
  })

  const totalMinutes = assignments.reduce(
    (sum, a) => sum + differenceInMinutes(a.shift.endTime, a.shift.startTime),
    0,
  )

  return totalMinutes / 60
}

/**
 * Project the weekly cost for a user if additionalHours are added to their
 * current-week schedule. Overtime kicks in above 40 hours at 1.5× rate.
 */
export async function getProjectedCost(
  userId: string,
  additionalHours: number,
): Promise<{
  regularHours: number
  overtimeHours: number
  hourlyRate: number
  regularCost: number
  overtimeCost: number
  total: number
}> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { hourlyRate: true },
  })

  const hourlyRate = user?.hourlyRate ? Number(user.hourlyRate) : 0

  // Use the current Monday as weekStart for the projection.
  const now = new Date()
  const { weekStart } = getWeekBoundsUTC(now)
  const scheduledHours = await getWeeklyHours(userId, weekStart)

  const totalHours = scheduledHours + additionalHours
  const OVERTIME_THRESHOLD = 40

  const regularHours = Math.min(totalHours, OVERTIME_THRESHOLD)
  const overtimeHours = Math.max(0, totalHours - OVERTIME_THRESHOLD)

  const regularCost = regularHours * hourlyRate
  const overtimeCost = overtimeHours * hourlyRate * 1.5

  return {
    regularHours,
    overtimeHours,
    hourlyRate,
    regularCost,
    overtimeCost,
    total: regularCost + overtimeCost,
  }
}

/**
 * Count the number of consecutive calendar days (in UTC) ending at — and
 * including — fromDate on which the user had at least one non-cancelled
 * assignment.
 */
export async function getConsecutiveDays(
  userId: string,
  fromDate: Date,
): Promise<number> {
  let consecutiveDays = 0

  // Start from fromDate and walk backwards.
  const cursor = new Date(fromDate)
  cursor.setUTCHours(0, 0, 0, 0)

  for (let i = 0; i < 14; i++) {
    const dayStart = new Date(cursor)
    const dayEnd = new Date(cursor)
    dayEnd.setUTCHours(23, 59, 59, 999)

    const assignment = await db.shiftAssignment.findFirst({
      where: {
        userId,
        status: { not: 'CANCELLED' },
        shift: {
          status: { not: 'CANCELLED' },
          startTime: { gte: dayStart, lte: dayEnd },
        },
      },
      select: { id: true },
    })

    if (assignment) {
      consecutiveDays++
      cursor.setUTCDate(cursor.getUTCDate() - 1)
    } else {
      break
    }
  }

  return consecutiveDays
}
