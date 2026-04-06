// =============================================================================
// GET /api/assignments/preview?userId=...&shiftId=...
//
// Read-only: runs all constraints + projects cost. No database writes.
// Used by the manager UI to preview before confirming an assignment.
// =============================================================================

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

  const [constraintResults, projectedCost] = await Promise.all([
    runAllConstraints(userId, shift),
    getProjectedCost(
      userId,
      differenceInMinutes(shift.endTime, shift.startTime) / 60,
    ),
  ])

  const { weekStart } = getWeekBoundsUTC(shift.startTime)
  const projectedWeeklyHours = await getWeeklyHours(userId, weekStart)

  return NextResponse.json({
    success: true,
    data: {
      constraintResults,
      projectedWeeklyHours:
        projectedWeeklyHours +
        differenceInMinutes(shift.endTime, shift.startTime) / 60,
      projectedCost,
    },
  })
}
