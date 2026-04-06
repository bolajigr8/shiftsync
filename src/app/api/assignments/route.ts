import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { db } from '@/prisma/db'
import { runAllConstraints } from '@/lib/constraints'
import { createAuditLog } from '@/lib/audit'
import { createNotification } from '@/lib/notify'
import { displayShiftTime } from '@/lib/timezone'
import { getServerSupabase } from '@/lib/supabase'

const CreateAssignmentSchema = z.object({
  shiftId: z.string().min(1, 'shiftId is required'),
  userId: z.string().min(1, 'userId is required'),
  overrideReason: z
    .string()
    .min(10, 'Override reason must be at least 10 characters')
    .optional(),
})

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
      { success: false, error: 'Invalid JSON body.' },
      { status: 400 },
    )
  }

  const parsed = CreateAssignmentSchema.safeParse(body)
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

  const { shiftId, userId, overrideReason } = parsed.data

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

  if (shift.status === 'CANCELLED') {
    return NextResponse.json(
      { success: false, error: 'Cannot assign staff to a cancelled shift.' },
      { status: 400 },
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

  const targetUser = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true, name: true },
  })

  if (!targetUser || !targetUser.isActive) {
    return NextResponse.json(
      { success: false, error: 'Staff member not found or inactive.' },
      { status: 404 },
    )
  }

  const [
    skillResult,
    locationCertResult,
    availabilityResult,
    doubleBookingResult,
    restPeriodResult,
    dailyHoursResult,
    weeklyHoursResult,
    consecutiveDaysResult,
  ] = await runAllConstraints(userId, shift)

  const hardFailures = [
    skillResult,
    locationCertResult,
    availabilityResult,
    doubleBookingResult,
    restPeriodResult,
    dailyHoursResult,
    weeklyHoursResult,
  ].filter((r) => !r.allowed)

  if (hardFailures.length > 0) {
    return NextResponse.json(
      {
        success: false,
        error: 'One or more scheduling constraints prevent this assignment.',
        failures: hardFailures,
      },
      { status: 400 },
    )
  }

  if (!consecutiveDaysResult.allowed && !overrideReason) {
    return NextResponse.json(
      {
        success: false,
        error:
          'This assignment would be the 7th consecutive working day for this staff member. A documented override reason is required.',
        failures: [consecutiveDaysResult],
      },
      { status: 403 },
    )
  }

  // ── Transaction with row lock ─────────────────────────────────────────────
  // Explicit enum casts prevent PostgreSQL "operator does not exist" errors
  // when comparing enum columns to string literals in raw SQL.

  const assignment = await db.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT sa.id
      FROM "ShiftAssignment" sa
      INNER JOIN "Shift" s ON sa."shiftId" = s.id
      WHERE sa."userId"   = ${userId}
        AND s."startTime" < ${shift.endTime}
        AND s."endTime"   > ${shift.startTime}
        AND sa.status     != 'CANCELLED'::"AssignmentStatus"
        AND s.status      != 'CANCELLED'::"ShiftStatus"
      FOR UPDATE
    `

    return tx.shiftAssignment.create({
      data: { shiftId, userId, assignedBy: session.user.id },
      include: {
        shift: { include: { location: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    })
  })

  // ── Post-transaction side-effects ─────────────────────────────────────────

  const formattedTime = displayShiftTime(
    shift.startTime,
    shift.location.timezone,
  )

  await createAuditLog(
    session.user.id,
    'ASSIGNED',
    'ShiftAssignment',
    assignment.id,
    shift.locationId,
    undefined,
    { shiftId, userId, assignedBy: session.user.id },
    overrideReason ? { overrideReason } : undefined,
  )

  await createNotification(
    userId,
    'SHIFT_ASSIGNED',
    `You have been assigned to a shift at ${shift.location.name} on ${formattedTime}.`,
    { shiftId, assignmentId: assignment.id },
  )

  try {
    const supabase = getServerSupabase()
    await supabase.channel(`schedule:${shift.locationId}`).send({
      type: 'broadcast',
      event: 'schedule_updated',
      payload: {
        shiftId,
        assignmentId: assignment.id,
        locationId: shift.locationId,
        action: 'assigned',
      },
    })
  } catch (err) {
    console.error('[Assignment] Realtime broadcast failed (non-fatal):', err)
  }

  return NextResponse.json({ success: true, data: assignment }, { status: 201 })
}
