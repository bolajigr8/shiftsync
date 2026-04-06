// =============================================================================
// GET  /api/shifts  — list shifts for a location within a week
// POST /api/shifts  — create a new shift (MANAGER / ADMIN)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { toZonedTime } from 'date-fns-tz'
import { authOptions } from '@/lib/auth'
import { db } from '@/prisma/db'
import { localToUTC, getDayOfWeekInTz } from '@/lib/timezone'
import { createAuditLog } from '@/lib/audit'

// ── Schemas ───────────────────────────────────────────────────────────────────

const GetShiftsSchema = z.object({
  locationId: z.string().min(1, 'locationId is required'),
  weekStart: z
    .string()
    .min(1, 'weekStart is required')
    .refine((v) => !isNaN(Date.parse(v)), 'weekStart must be a valid ISO date'),
})

const LocalDateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/

const CreateShiftSchema = z.object({
  locationId: z.string().min(1, 'locationId is required'),
  localStartTime: z
    .string()
    .regex(
      LocalDateTimeRegex,
      'localStartTime must be YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss',
    ),
  localEndTime: z
    .string()
    .regex(
      LocalDateTimeRegex,
      'localEndTime must be YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss',
    ),
  requiredSkill: z.enum(['BARTENDER', 'LINE_COOK', 'SERVER', 'HOST']),
  headcountNeeded: z
    .number()
    .int()
    .min(1, 'At least 1 person required')
    .max(50),
})

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const { searchParams } = new URL(req.url)
  const parsed = GetShiftsSchema.safeParse({
    locationId: searchParams.get('locationId'),
    weekStart: searchParams.get('weekStart'),
  })

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid query parameters.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    )
  }

  const { locationId, weekStart } = parsed.data

  // ADMIN sees all locations; everyone else must own this locationId
  if (
    session.user.role !== 'ADMIN' &&
    !session.user.locationIds.includes(locationId)
  ) {
    return NextResponse.json(
      { success: false, error: 'You do not have access to this location.' },
      { status: 403 },
    )
  }

  const weekStartDate = new Date(weekStart)
  const weekEndDate = new Date(weekStartDate)
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 7)

  const shifts = await db.shift.findMany({
    where: {
      locationId,
      startTime: { gte: weekStartDate, lt: weekEndDate },
    },
    include: {
      location: true,
      assignments: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
    orderBy: { startTime: 'asc' },
  })

  return NextResponse.json({ success: true, data: shifts })
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  if (session.user.role !== 'MANAGER' && session.user.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Forbidden.' },
      { status: 403 },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Request body is not valid JSON.' },
      { status: 400 },
    )
  }

  const parsed = CreateShiftSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Validation failed.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    )
  }

  const {
    locationId,
    localStartTime,
    localEndTime,
    requiredSkill,
    headcountNeeded,
  } = parsed.data

  // Location ownership check
  if (
    session.user.role !== 'ADMIN' &&
    !session.user.locationIds.includes(locationId)
  ) {
    return NextResponse.json(
      {
        success: false,
        error: 'You are not assigned to manage this location.',
      },
      { status: 403 },
    )
  }

  const location = await db.location.findUnique({ where: { id: locationId } })
  if (!location || !location.isActive) {
    return NextResponse.json(
      { success: false, error: 'Location not found or inactive.' },
      { status: 404 },
    )
  }

  // Convert local times to UTC
  let utcStart: Date
  let utcEnd: Date
  try {
    utcStart = localToUTC(localStartTime, location.timezone)
    utcEnd = localToUTC(localEndTime, location.timezone)
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'Could not parse shift times with the location timezone.',
      },
      { status: 400 },
    )
  }

  // Overnight shift: if end ≤ start after conversion, advance end by 24 h
  if (utcEnd <= utcStart) {
    utcEnd = new Date(utcEnd.getTime() + 24 * 60 * 60 * 1000)
  }

  // Sanity check — still shouldn't be equal after adjustment
  if (utcEnd <= utcStart) {
    return NextResponse.json(
      { success: false, error: 'Shift end time must be after start time.' },
      { status: 400 },
    )
  }

  // Auto-set isPremium: Fri (5) or Sat (6) at or after 17:00 in location timezone
  const localStartInTz = toZonedTime(utcStart, location.timezone)
  const dayOfWeek = getDayOfWeekInTz(utcStart, location.timezone)
  const hourOfDay = localStartInTz.getHours()
  const isPremium = (dayOfWeek === 5 || dayOfWeek === 6) && hourOfDay >= 17

  const shift = await db.shift.create({
    data: {
      locationId,
      requiredSkill,
      startTime: utcStart,
      endTime: utcEnd,
      headcountNeeded,
      isPremium,
      createdBy: session.user.id,
    },
    include: { location: true, assignments: true },
  })

  await createAuditLog(
    session.user.id,
    'SHIFT_CREATED',
    'Shift',
    shift.id,
    locationId,
    undefined,
    {
      id: shift.id,
      locationId,
      requiredSkill,
      startTime: utcStart,
      endTime: utcEnd,
    },
  )

  return NextResponse.json({ success: true, data: shift }, { status: 201 })
}
