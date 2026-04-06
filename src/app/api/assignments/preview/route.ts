import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { differenceInMinutes } from 'date-fns'
import { authOptions } from '@/lib/auth'
import { db } from '@/prisma/db'
import { runAllConstraints } from '@/lib/constraints'
import { getWeeklyHours, getProjectedCost } from '@/lib/overtime'
import { getWeekBoundsUTC } from '@/lib/timezone'

const PreviewSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  shiftId: z.string().min(1, 'shiftId is required'),
})

export async function GET(req: NextRequest) {
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

  const { searchParams } = new URL(req.url)
  const parsed = PreviewSchema.safeParse({
    userId: searchParams.get('userId'),
    shiftId: searchParams.get('shiftId'),
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

  const { userId, shiftId } = parsed.data

  // ── Fetch shift ────────────────────────────────────────────────────────────

  const shift = await db.shift.findUnique({
    where: { id: shiftId },
    include: { location: true },
  })
  if (!shift) {
    return NextResponse.json(
      { success: false, error: 'Shift not found.' },
      { status: 404 },
    )
  }
  if (
    session.user.role !== 'ADMIN' &&
    !session.user.locationIds.includes(shift.locationId)
  ) {
    return NextResponse.json(
      { success: false, error: 'Forbidden.' },
      { status: 403 },
    )
  }

  // ── Fetch user ─────────────────────────────────────────────────────────────

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true },
  })
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'User not found.' },
      { status: 404 },
    )
  }

  // ── Compute shift duration ─────────────────────────────────────────────────

  const shiftHours = differenceInMinutes(shift.endTime, shift.startTime) / 60
  const { weekStart } = getWeekBoundsUTC(shift.startTime)

  // ── Run constraints + hours + cost in parallel ─────────────────────────────

  const [constraintResults, currentHoursRaw, costBreakdown] = await Promise.all(
    [
      runAllConstraints(userId, shift),
      getWeeklyHours(userId, weekStart),
      getProjectedCost(userId, shiftHours), // returns { regularHours, overtimeHours, total, ... }
    ],
  )

  // ── Hard failures ──────────────────────────────────────────────────────────

  const failures = constraintResults.filter((c) => !c.allowed)
  if (failures.length > 0) {
    return NextResponse.json({ success: false, failures }, { status: 200 })
  }

  // ── Build response using costBreakdown directly ────────────────────────────

  const currentHours = Number(currentHoursRaw ?? 0)
  const projectedHours = currentHours + shiftHours

  return NextResponse.json({
    success: true,
    data: {
      staffName: user.name,
      currentHours,
      projectedHours,
      regularHours: Number(costBreakdown.regularHours), // ← from getProjectedCost
      overtimeHours: Number(costBreakdown.overtimeHours), // ← from getProjectedCost
      projectedCost: Number(costBreakdown.total), // ← .total is the number
      constraints: constraintResults,
    },
  })
}
