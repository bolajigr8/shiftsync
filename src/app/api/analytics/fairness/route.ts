// =============================================================================
// ShiftSync — GET /api/analytics/fairness
//
// Measures how equitably premium shifts (isPremium=true) are distributed
// across staff relative to their total hours worked.
//
// fairnessScore = (user's share of premium shifts) / (user's share of total hours)
//   1.0  → perfectly equitable
//   <0.7 → flagged as under-allocated on premium shifts
//   >1.3 → flagged as over-allocated on premium shifts
//
// Query params: locationId, start (ISO), end (ISO)
// Restricted to MANAGER and ADMIN.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/prisma/db'
import { differenceInMinutes } from 'date-fns'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  if (session.user.role === 'STAFF') {
    return NextResponse.json(
      { success: false, error: 'Forbidden' },
      { status: 403 },
    )
  }

  const { searchParams } = new URL(req.url)
  const locationId = searchParams.get('locationId')
  const start = searchParams.get('start')
  const end = searchParams.get('end')

  if (!locationId || !start || !end) {
    return NextResponse.json(
      { success: false, error: 'locationId, start, and end are required' },
      { status: 400 },
    )
  }

  if (
    session.user.role !== 'ADMIN' &&
    !session.user.locationIds.includes(locationId)
  ) {
    return NextResponse.json(
      { success: false, error: 'Forbidden' },
      { status: 403 },
    )
  }

  const startDate = new Date(start)
  const endDate = new Date(end)

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json(
      { success: false, error: 'Invalid date format — use ISO 8601' },
      { status: 400 },
    )
  }

  const assignments = await db.shiftAssignment.findMany({
    where: {
      status: { in: ['ASSIGNED', 'CONFIRMED'] },
      shift: {
        locationId,
        status: { not: 'CANCELLED' },
        startTime: { gte: startDate, lte: endDate },
      },
    },
    include: {
      shift: {
        select: { startTime: true, endTime: true, isPremium: true },
      },
      user: {
        select: {
          id: true,
          name: true,
          desiredWeeklyHours: true,
        },
      },
    },
  })

  // Aggregate per user
  type UserBucket = {
    userId: string
    name: string
    desiredWeeklyHours: number | null
    totalMinutes: number
    premiumShiftCount: number
  }

  const buckets = new Map<string, UserBucket>()
  let grandTotalMinutes = 0
  let grandTotalPremiumShifts = 0

  for (const a of assignments) {
    const minutes = differenceInMinutes(a.shift.endTime, a.shift.startTime)

    if (!buckets.has(a.user.id)) {
      buckets.set(a.user.id, {
        userId: a.user.id,
        name: a.user.name,
        desiredWeeklyHours: a.user.desiredWeeklyHours,
        totalMinutes: 0,
        premiumShiftCount: 0,
      })
    }

    const bucket = buckets.get(a.user.id)!
    bucket.totalMinutes += minutes
    grandTotalMinutes += minutes

    if (a.shift.isPremium) {
      bucket.premiumShiftCount++
      grandTotalPremiumShifts++
    }
  }

  // Weeks in the period (at least 1 to avoid divide-by-zero)
  const msPerWeek = 7 * 24 * 60 * 60 * 1000
  const weeksInPeriod = Math.max(
    1,
    Math.round((endDate.getTime() - startDate.getTime()) / msPerWeek),
  )

  const results = Array.from(buckets.values()).map((b) => {
    const totalHours = b.totalMinutes / 60

    // Fractions relative to all staff in the period
    const hourFraction =
      grandTotalMinutes > 0 ? b.totalMinutes / grandTotalMinutes : 0
    const premiumFraction =
      grandTotalPremiumShifts > 0
        ? b.premiumShiftCount / grandTotalPremiumShifts
        : 0

    // fairnessScore is null when there are no premium shifts to distribute
    // or when the user has no hours (avoids 0/0)
    let fairnessScore: number | null = null
    if (grandTotalPremiumShifts > 0 && hourFraction > 0) {
      fairnessScore = Math.round((premiumFraction / hourFraction) * 100) / 100
    }

    return {
      userId: b.userId,
      name: b.name,
      desiredWeeklyHours: b.desiredWeeklyHours,
      totalHours: Math.round(totalHours * 100) / 100,
      premiumShifts: b.premiumShiftCount,
      actualAverageWeeklyHours:
        Math.round((totalHours / weeksInPeriod) * 100) / 100,
      fairnessScore,
      // Flag both under- and over-allocation (null → no premium shifts in period)
      flagged:
        fairnessScore !== null && (fairnessScore < 0.7 || fairnessScore > 1.3),
    }
  })

  // Sort by fairnessScore ascending (most under-allocated first); nulls last
  results.sort((a, b) => {
    if (a.fairnessScore === null) return 1
    if (b.fairnessScore === null) return -1
    return a.fairnessScore - b.fairnessScore
  })

  return NextResponse.json({
    success: true,
    data: {
      results,
      meta: {
        totalPremiumShifts: grandTotalPremiumShifts,
        weeksInPeriod,
        locationId,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
    },
  })
}
