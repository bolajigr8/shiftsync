// =============================================================================
// ShiftSync — GET /api/on-duty
//
// Returns shifts that are currently active (startTime ≤ now < endTime) and
// shifts starting within the next 30 minutes, with assigned staff names.
// Restricted to MANAGER and ADMIN.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/prisma/db'
import type { AssignmentStatus } from '@prisma/client'

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

  if (!locationId) {
    return NextResponse.json(
      { success: false, error: 'locationId is required' },
      { status: 400 },
    )
  }

  // Managers can only query their own locations; admins can query any
  if (
    session.user.role !== 'ADMIN' &&
    !session.user.locationIds.includes(locationId)
  ) {
    return NextResponse.json(
      { success: false, error: 'Forbidden' },
      { status: 403 },
    )
  }

  const now = new Date()
  const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000)

  const shiftSelect = {
    include: {
      assignments: {
        where: {
          status: { in: ['ASSIGNED', 'CONFIRMED'] as AssignmentStatus[] },
        },
        include: {
          user: {
            select: { id: true, name: true, role: true, timezone: true },
          },
        },
      },
      location: { select: { name: true, timezone: true } },
    },
  }

  const [active, upcoming] = await Promise.all([
    // Currently active: started in the past, not yet ended
    db.shift.findMany({
      where: {
        locationId,
        status: 'PUBLISHED',
        startTime: { lte: now },
        endTime: { gt: now },
      },
      ...shiftSelect,
      orderBy: { startTime: 'asc' },
    }),

    // Starting in the next 30 minutes
    db.shift.findMany({
      where: {
        locationId,
        status: 'PUBLISHED',
        startTime: { gt: now, lte: thirtyMinutesFromNow },
      },
      ...shiftSelect,
      orderBy: { startTime: 'asc' },
    }),
  ])

  return NextResponse.json({ success: true, data: { active, upcoming } })
}
