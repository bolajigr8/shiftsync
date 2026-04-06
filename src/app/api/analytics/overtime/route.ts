// =============================================================================
// ShiftSync — GET /api/analytics/overtime
//
// For a given location and week, returns each active staff member's:
//   totalHours, overtimeHours (above 40), projectedCost, and a status string.
//
// Status thresholds:
//   OK       → totalHours < 35
//   WARNING  → 35 ≤ totalHours < 40
//   OVERTIME → totalHours ≥ 40
//
// getProjectedCost() always uses the CURRENT week internally, so for
// historical week queries we compute cost manually using getWeeklyHours()
// directly and the user's stored hourlyRate.
//
// Query params: locationId, weekStart (ISO — must be a Monday 00:00:00 UTC)
// Restricted to MANAGER and ADMIN.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/prisma/db'
import { getWeeklyHours } from '@/lib/overtime'

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
  const weekStart = searchParams.get('weekStart')

  if (!locationId || !weekStart) {
    return NextResponse.json(
      { success: false, error: 'locationId and weekStart are required' },
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

  const weekStartDate = new Date(weekStart)
  if (isNaN(weekStartDate.getTime())) {
    return NextResponse.json(
      { success: false, error: 'Invalid weekStart — use ISO 8601' },
      { status: 400 },
    )
  }

  // All active staff certified at this location
  const staffLocations = await db.staffLocation.findMany({
    where: { locationId, isActive: true },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          hourlyRate: true,
          desiredWeeklyHours: true,
          isActive: true,
        },
      },
    },
  })

  const activeStaff = staffLocations
    .map((sl) => sl.user)
    .filter((u) => u.isActive)

  const results = await Promise.all(
    activeStaff.map(async (user) => {
      const totalHours = await getWeeklyHours(user.id, weekStartDate)

      const OVERTIME_THRESHOLD = 40
      const overtimeHours = Math.max(0, totalHours - OVERTIME_THRESHOLD)
      const regularHours = Math.min(totalHours, OVERTIME_THRESHOLD)
      const hourlyRate = user.hourlyRate ? Number(user.hourlyRate) : 0
      const regularCost = regularHours * hourlyRate
      const overtimeCost = overtimeHours * hourlyRate * 1.5
      const projectedCost = regularCost + overtimeCost

      const status: 'OK' | 'WARNING' | 'OVERTIME' =
        totalHours >= OVERTIME_THRESHOLD
          ? 'OVERTIME'
          : totalHours >= 35
            ? 'WARNING'
            : 'OK'

      return {
        userId: user.id,
        name: user.name,
        desiredWeeklyHours: user.desiredWeeklyHours,
        hourlyRate,
        totalHours: Math.round(totalHours * 100) / 100,
        overtimeHours: Math.round(overtimeHours * 100) / 100,
        projectedCost: Math.round(projectedCost * 100) / 100,
        status,
      }
    }),
  )

  // Sort: OVERTIME first, then WARNING, then OK; alphabetically within each group
  const statusOrder = { OVERTIME: 0, WARNING: 1, OK: 2 }
  results.sort((a, b) => {
    const statusDiff = statusOrder[a.status] - statusOrder[b.status]
    return statusDiff !== 0 ? statusDiff : a.name.localeCompare(b.name)
  })

  return NextResponse.json({ success: true, data: results })
}
