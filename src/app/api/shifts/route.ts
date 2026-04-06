import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/prisma/db'
import type { Prisma } from '@prisma/client'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const { searchParams } = new URL(req.url)
  const locationId = searchParams.get('locationId')
  const weekStart = searchParams.get('weekStart')
  const statusFilter = searchParams.get('status') as
    | 'DRAFT'
    | 'PUBLISHED'
    | 'CANCELLED'
    | null
  const userId = searchParams.get('userId')

  const where: Prisma.ShiftWhereInput = {}

  // Location scope — managers scoped to their locations
  if (locationId) {
    if (
      session.user.role !== 'ADMIN' &&
      !session.user.locationIds.includes(locationId)
    ) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 },
      )
    }
    where.locationId = locationId
  } else if (session.user.role === 'MANAGER') {
    where.locationId = { in: session.user.locationIds }
  } else if (session.user.role === 'STAFF') {
    // Staff see published shifts at their certified locations
    where.locationId = { in: session.user.locationIds }
    where.status = 'PUBLISHED'
  }

  // Week filter
  if (weekStart) {
    const start = new Date(weekStart)
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 7)
    where.startTime = { gte: start, lt: end }
  }

  // Status override (explicit takes precedence)
  if (statusFilter) {
    where.status = statusFilter
  }

  // User assignment filter
  if (userId) {
    where.assignments = {
      some: { userId, status: { not: 'CANCELLED' } },
    }
  }

  const shifts = await db.shift.findMany({
    where,
    include: {
      location: { select: { id: true, name: true, timezone: true } },
      assignments: {
        where: { status: { not: 'CANCELLED' } },
        include: {
          user: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { startTime: 'asc' },
  })

  return NextResponse.json({ success: true, data: shifts })
}
