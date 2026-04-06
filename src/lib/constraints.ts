import { fromZonedTime, toZonedTime } from 'date-fns-tz'
import { startOfDay, differenceInMinutes } from 'date-fns'
import { getWeekBoundsUTC } from '@/lib/timezone'
import type { Shift } from '@prisma/client'
import type { ConstraintResult } from '@/types/index'
import { db } from '@/prisma/db'

export type { ConstraintResult }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function minutesFromHHmm(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function getDayName(day: number): string {
  return [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ][day]
}

/**
 * Check whether a shift (expressed as local Date objects) falls entirely within
 * the availability window defined by two "HH:mm" strings.
 */
function shiftFitsInWindow(
  localStart: Date,
  localEnd: Date,
  windowStart: string,
  windowEnd: string,
): boolean {
  const shiftStartMin = localStart.getHours() * 60 + localStart.getMinutes()
  const shiftEndMin = localEnd.getHours() * 60 + localEnd.getMinutes()
  const winStartMin = minutesFromHHmm(windowStart)
  const winEndMin = minutesFromHHmm(windowEnd)

  // For overnight shifts the end time wraps past midnight (e.g. 02:00).
  // If shiftEndMin < shiftStartMin the shift crosses midnight — we only
  // validate that the shift starts within the declared window.
  const endsNextDay = shiftEndMin < shiftStartMin
  return (
    shiftStartMin >= winStartMin && (endsNextDay || shiftEndMin <= winEndMin)
  )
}

// ---------------------------------------------------------------------------
// 1. Skill check
// ---------------------------------------------------------------------------

/**
 * Verify the user holds the skill required by the shift.
 * On failure, returns up to 5 certified + skilled alternatives.
 */
export async function checkSkill(
  userId: string,
  shift: Shift,
): Promise<ConstraintResult> {
  const staffSkill = await db.staffSkill.findUnique({
    where: { userId_skill: { userId, skill: shift.requiredSkill } },
  })

  if (staffSkill) return { allowed: true }

  const alternatives = await db.user.findMany({
    where: {
      isActive: true,
      id: { not: userId },
      skills: { some: { skill: shift.requiredSkill } },
      staffLocations: {
        some: { locationId: shift.locationId, isActive: true },
      },
    },
    select: { id: true, name: true, email: true },
    take: 5,
  })

  return {
    allowed: false,
    reason: `This staff member does not hold the required skill: ${shift.requiredSkill.replace(/_/g, ' ')}.`,
    suggestions: alternatives,
  }
}

// ---------------------------------------------------------------------------
// 2. Location certification check
// ---------------------------------------------------------------------------

/**
 * Verify the user has an active certification for the shift's location.
 * On failure, returns up to 5 users who are certified and have the right skill.
 */
export async function checkLocationCert(
  userId: string,
  shift: Shift,
): Promise<ConstraintResult> {
  const cert = await db.staffLocation.findFirst({
    where: { userId, locationId: shift.locationId, isActive: true },
  })

  if (cert) return { allowed: true }

  const alternatives = await db.user.findMany({
    where: {
      isActive: true,
      id: { not: userId },
      staffLocations: {
        some: { locationId: shift.locationId, isActive: true },
      },
      skills: { some: { skill: shift.requiredSkill } },
    },
    select: { id: true, name: true, email: true },
    take: 5,
  })

  return {
    allowed: false,
    reason: `This staff member is not certified to work at this location.`,
    suggestions: alternatives,
  }
}

// ---------------------------------------------------------------------------
// 3. Availability check
// ---------------------------------------------------------------------------

/**
 * Validate the shift against the user's declared availability.
 *
 * Priority: EXCEPTION row for that exact date > RECURRING row for that day.
 * All times are compared in the USER's own timezone (User.timezone), not the
 * location timezone.
 */
export async function checkAvailability(
  userId: string,
  shift: Shift,
): Promise<ConstraintResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  })
  if (!user) return { allowed: false, reason: 'User record not found.' }

  // Convert shift times to the user's local timezone.
  const localStart = toZonedTime(shift.startTime, user.timezone)
  const localEnd = toZonedTime(shift.endTime, user.timezone)

  // Determine the UTC bounds of the local calendar day so we can query
  // EXCEPTION rows precisely.
  const localMidnight = startOfDay(localStart)
  const utcDayStart = fromZonedTime(
    new Date(
      localMidnight.getFullYear(),
      localMidnight.getMonth(),
      localMidnight.getDate(),
      0,
      0,
      0,
      0,
    ),
    user.timezone,
  )
  const utcDayEnd = new Date(utcDayStart.getTime() + 24 * 60 * 60 * 1000)

  // ── EXCEPTION row (takes priority) ──────────────────────────────────────
  const exception = await db.availability.findFirst({
    where: {
      userId,
      type: 'EXCEPTION',
      exceptionDate: { gte: utcDayStart, lt: utcDayEnd },
    },
  })

  if (exception) {
    if (!exception.isAvailable) {
      return {
        allowed: false,
        reason: `This staff member has marked themselves unavailable on this date.`,
      }
    }
    if (exception.startTime && exception.endTime) {
      if (
        !shiftFitsInWindow(
          localStart,
          localEnd,
          exception.startTime,
          exception.endTime,
        )
      ) {
        return {
          allowed: false,
          reason: `The shift falls outside this staff member's available window on this date (${exception.startTime}–${exception.endTime}).`,
        }
      }
    }
    return { allowed: true }
  }

  // ── RECURRING row (fallback) ─────────────────────────────────────────────
  const dayOfWeek = localStart.getDay() // 0=Sun … 6=Sat
  const recurring = await db.availability.findFirst({
    where: { userId, type: 'RECURRING', dayOfWeek },
  })

  if (!recurring) {
    return {
      allowed: true,
      warning: `No recurring availability is defined for ${getDayName(dayOfWeek)}s — assuming available.`,
    }
  }

  if (!recurring.isAvailable) {
    return {
      allowed: false,
      reason: `This staff member has marked themselves generally unavailable on ${getDayName(dayOfWeek)}s.`,
    }
  }

  if (recurring.startTime && recurring.endTime) {
    if (
      !shiftFitsInWindow(
        localStart,
        localEnd,
        recurring.startTime,
        recurring.endTime,
      )
    ) {
      return {
        allowed: false,
        reason: `The shift falls outside this staff member's recurring availability on ${getDayName(dayOfWeek)}s (${recurring.startTime}–${recurring.endTime}).`,
      }
    }
  }

  return { allowed: true }
}

// ---------------------------------------------------------------------------
// 4. Double-booking check
// ---------------------------------------------------------------------------

/**
 * Ensure the user has no overlapping non-cancelled assignment across any
 * location. Overlap condition: startA < endB AND endA > startB.
 */
export async function checkDoubleBooking(
  userId: string,
  shift: Shift,
): Promise<ConstraintResult> {
  const overlapping = await db.shiftAssignment.findFirst({
    where: {
      userId,
      status: { not: 'CANCELLED' },
      shift: {
        status: { not: 'CANCELLED' },
        startTime: { lt: shift.endTime },
        endTime: { gt: shift.startTime },
      },
    },
    include: {
      shift: { include: { location: { select: { name: true } } } },
    },
  })

  if (!overlapping) return { allowed: true }

  return {
    allowed: false,
    reason: `This staff member is already assigned to an overlapping shift at ${overlapping.shift.location.name}.`,
  }
}

// ---------------------------------------------------------------------------
// 5. Rest period check (minimum 10 hours between shifts)
// ---------------------------------------------------------------------------

/**
 * Verify there are at least 10 hours between adjacent assignments.
 * Checks both the gap before this shift and the gap after.
 */
export async function checkRestPeriod(
  userId: string,
  shift: Shift,
): Promise<ConstraintResult> {
  const MIN_REST_MS = 10 * 60 * 60 * 1000 // 10 hours in milliseconds

  // Most recent assignment that ends on or before this shift's start.
  const before = await db.shiftAssignment.findFirst({
    where: {
      userId,
      status: { not: 'CANCELLED' },
      shift: {
        status: { not: 'CANCELLED' },
        endTime: { lte: shift.startTime },
      },
    },
    orderBy: { shift: { endTime: 'desc' } },
    include: { shift: { select: { endTime: true } } },
  })

  if (before) {
    const gapMs = shift.startTime.getTime() - before.shift.endTime.getTime()
    if (gapMs < MIN_REST_MS) {
      const gapHours = (gapMs / (60 * 60 * 1000)).toFixed(1)
      return {
        allowed: false,
        reason: `Only ${gapHours}h rest before this shift. A minimum of 10 hours is required between assignments.`,
      }
    }
  }

  // Soonest assignment that starts on or after this shift's end.
  const after = await db.shiftAssignment.findFirst({
    where: {
      userId,
      status: { not: 'CANCELLED' },
      shift: {
        status: { not: 'CANCELLED' },
        startTime: { gte: shift.endTime },
      },
    },
    orderBy: { shift: { startTime: 'asc' } },
    include: { shift: { select: { startTime: true } } },
  })

  if (after) {
    const gapMs = after.shift.startTime.getTime() - shift.endTime.getTime()
    if (gapMs < MIN_REST_MS) {
      const gapHours = (gapMs / (60 * 60 * 1000)).toFixed(1)
      return {
        allowed: false,
        reason: `Only ${gapHours}h rest after this shift. A minimum of 10 hours is required between assignments.`,
      }
    }
  }

  return { allowed: true }
}

// ---------------------------------------------------------------------------
// 6. Daily hours check
// ---------------------------------------------------------------------------

/**
 * Sum all non-cancelled hours on the same calendar day in the location's
 * timezone. Warns above 8 h, hard-blocks above 12 h.
 */
export async function checkDailyHours(
  userId: string,
  shift: Shift,
): Promise<ConstraintResult> {
  const location = await db.location.findUnique({
    where: { id: shift.locationId },
    select: { timezone: true },
  })
  if (!location) return { allowed: false, reason: 'Location not found.' }

  // Determine the UTC bounds of the local calendar day.
  const localStart = toZonedTime(shift.startTime, location.timezone)
  const localMidnight = startOfDay(localStart)
  const utcDayStart = fromZonedTime(
    new Date(
      localMidnight.getFullYear(),
      localMidnight.getMonth(),
      localMidnight.getDate(),
      0,
      0,
      0,
      0,
    ),
    location.timezone,
  )
  const utcDayEnd = new Date(utcDayStart.getTime() + 24 * 60 * 60 * 1000)

  const existing = await db.shiftAssignment.findMany({
    where: {
      userId,
      status: { not: 'CANCELLED' },
      shift: {
        status: { not: 'CANCELLED' },
        startTime: { gte: utcDayStart, lt: utcDayEnd },
      },
    },
    include: { shift: { select: { startTime: true, endTime: true } } },
  })

  const existingMinutes = existing.reduce(
    (sum, a) => sum + differenceInMinutes(a.shift.endTime, a.shift.startTime),
    0,
  )
  const newMinutes = differenceInMinutes(shift.endTime, shift.startTime)
  const totalHours = (existingMinutes + newMinutes) / 60

  if (totalHours > 12) {
    return {
      allowed: false,
      reason: `Assigning this shift would result in ${totalHours.toFixed(1)} hours in a single day, exceeding the 12-hour daily maximum.`,
    }
  }

  if (totalHours > 8) {
    return {
      allowed: true,
      warning: `This staff member would work ${totalHours.toFixed(1)} hours on this day (above the 8-hour recommended daily limit).`,
    }
  }

  return { allowed: true }
}

// ---------------------------------------------------------------------------
// 7. Weekly hours check
// ---------------------------------------------------------------------------

/**
 * Sum all non-cancelled hours in the ISO week (Mon–Sun) containing the shift.
 * Returns a soft warning at ≥ 35 hours — does NOT block the assignment.
 */
export async function checkWeeklyHours(
  userId: string,
  shift: Shift,
): Promise<ConstraintResult> {
  const { weekStart, weekEnd } = getWeekBoundsUTC(shift.startTime)

  const existing = await db.shiftAssignment.findMany({
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

  const existingMinutes = existing.reduce(
    (sum, a) => sum + differenceInMinutes(a.shift.endTime, a.shift.startTime),
    0,
  )
  const newMinutes = differenceInMinutes(shift.endTime, shift.startTime)
  const totalHours = (existingMinutes + newMinutes) / 60

  if (totalHours >= 35) {
    return {
      allowed: true,
      warning: `Assigning this shift would bring this staff member to ${totalHours.toFixed(1)} scheduled hours this week (≥ 35-hour threshold).`,
    }
  }

  return { allowed: true }
}

// ---------------------------------------------------------------------------
// 8. Consecutive days check
// ---------------------------------------------------------------------------

/**
 * Count consecutive calendar days with at least one non-cancelled assignment
 * immediately preceding the proposed shift date.
 *
 * 6 consecutive days → soft warning (allowed: true).
 * 7 consecutive days → hard block (allowed: false) — manager override required.
 */
export async function checkConsecutiveDays(
  userId: string,
  shift: Shift,
): Promise<ConstraintResult> {
  let consecutiveDays = 0

  for (let i = 1; i <= 7; i++) {
    // Build UTC bounds for the day that is `i` days before the shift.
    const dayStart = new Date(shift.startTime)
    dayStart.setUTCDate(dayStart.getUTCDate() - i)
    dayStart.setUTCHours(0, 0, 0, 0)

    const dayEnd = new Date(dayStart)
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
    } else {
      break // Chain broken — no need to look further back.
    }
  }

  const projected = consecutiveDays + 1 // Including the proposed shift day.

  if (projected >= 7) {
    return {
      allowed: false,
      reason: `This would be this staff member's ${projected}th consecutive working day. A manager override with a documented reason is required.`,
    }
  }

  if (projected === 6) {
    return {
      allowed: true,
      warning: `This would be this staff member's 6th consecutive working day.`,
    }
  }

  return { allowed: true }
}

// ---------------------------------------------------------------------------
// Aggregate runner
// ---------------------------------------------------------------------------

/**
 * Run all eight constraint checks in parallel and return every result.
 * Callers should inspect each result — a single hard block (allowed: false)
 * is enough to refuse the assignment unless the manager explicitly overrides.
 */
export async function runAllConstraints(
  userId: string,
  shift: Shift,
): Promise<ConstraintResult[]> {
  return Promise.all([
    checkSkill(userId, shift),
    checkLocationCert(userId, shift),
    checkAvailability(userId, shift),
    checkDoubleBooking(userId, shift),
    checkRestPeriod(userId, shift),
    checkDailyHours(userId, shift),
    checkWeeklyHours(userId, shift),
    checkConsecutiveDays(userId, shift),
  ])
}
