import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/prisma/db'
import type { Prisma } from '@prisma/client'
import { createAuditLog } from '@/lib/audit'

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

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }
  if (session.user.role !== 'MANAGER' && session.user.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Forbidden' },
      { status: 403 },
    )
  }

  const body = await req.json()
  const { locationId, requiredSkill, startTime, endTime, headcountNeeded } =
    body

  if (!locationId || !requiredSkill || !startTime || !endTime) {
    return NextResponse.json(
      { success: false, error: 'Missing required fields' },
      { status: 400 },
    )
  }

  // Scope check — manager must own this location
  if (
    session.user.role !== 'ADMIN' &&
    !session.user.locationIds.includes(locationId)
  ) {
    return NextResponse.json(
      { success: false, error: 'Forbidden' },
      { status: 403 },
    )
  }

  const shift = await db.shift.create({
    data: {
      location: { connect: { id: locationId } },
      creator: { connect: { id: session.user.id } }, // ← relation connect
      requiredSkill,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      headcountNeeded: headcountNeeded ?? 1,
      status: 'DRAFT',
    },
    include: {
      assignments: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
  })

  await createAuditLog(
    session.user.id,
    'SHIFT_CREATED',
    'Shift',
    shift.id,
    locationId,
    undefined, // ← was null
    { requiredSkill, startTime, endTime, headcountNeeded },
  )

  return NextResponse.json({ success: true, data: shift }, { status: 201 })
}
