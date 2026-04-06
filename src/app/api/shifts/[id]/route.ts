// =============================================================================
// GET    /api/shifts/[id]
// PUT    /api/shifts/[id]
// DELETE /api/shifts/[id]
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { db } from '@/prisma/db'
import { localToUTC } from '@/lib/timezone'
import { createAuditLog } from '@/lib/audit'
import { notifyAssignedStaff } from '@/lib/notify'
import { autoCancelSwapsForShift } from '@/lib/swaps'

// ── Schema ────────────────────────────────────────────────────────────────────

const LocalDateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/

const UpdateShiftSchema = z
  .object({
    localStartTime: z.string().regex(LocalDateTimeRegex).optional(),
    localEndTime: z.string().regex(LocalDateTimeRegex).optional(),
    requiredSkill: z
      .enum(['BARTENDER', 'LINE_COOK', 'SERVER', 'HOST'])
      .optional(),
    headcountNeeded: z.number().int().min(1).max(50).optional(),
  })
  .strict()

// ── Next.js 16 async params type ─────────────────────────────────────────────

type RouteContext = { params: Promise<{ id: string }> }

// ── Helpers ───────────────────────────────────────────────────────────────────

function isCutoffPassed(
  shiftStartTime: Date,
  editCutoffHours: number,
): boolean {
  const cutoff = new Date(
    shiftStartTime.getTime() - editCutoffHours * 60 * 60 * 1000,
  )
  return new Date() >= cutoff
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const { id } = await params

  const shift = await db.shift.findUnique({
    where: { id },
    include: {
      location: true,
      assignments: {
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      },
    },
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

  return NextResponse.json({ success: true, data: shift })
}

// ── PUT ───────────────────────────────────────────────────────────────────────

export async function PUT(req: NextRequest, { params }: RouteContext) {
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

  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body.' },
      { status: 400 },
    )
  }

  const parsed = UpdateShiftSchema.safeParse(body)
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

  const existing = await db.shift.findUnique({
    where: { id },
    include: { location: true },
  })

  if (!existing) {
    return NextResponse.json(
      { success: false, error: 'Shift not found.' },
      { status: 404 },
    )
  }

  if (
    session.user.role !== 'ADMIN' &&
    !session.user.locationIds.includes(existing.locationId)
  ) {
    return NextResponse.json(
      { success: false, error: 'Forbidden.' },
      { status: 403 },
    )
  }

  if (
    existing.status === 'PUBLISHED' &&
    isCutoffPassed(existing.startTime, existing.location.editCutoffHours)
  ) {
    return NextResponse.json(
      {
        success: false,
        error: `This shift is locked for editing. Shifts at ${existing.location.name} cannot be edited within ${existing.location.editCutoffHours} hours of the start time.`,
      },
      { status: 403 },
    )
  }

  const { localStartTime, localEndTime, requiredSkill, headcountNeeded } =
    parsed.data

  let newStartTime = existing.startTime
  let newEndTime = existing.endTime

  if (localStartTime || localEndTime) {
    if (localStartTime) {
      newStartTime = localToUTC(localStartTime, existing.location.timezone)
    }
    if (localEndTime) {
      newEndTime = localToUTC(localEndTime, existing.location.timezone)
    }
    if (newEndTime <= newStartTime) {
      newEndTime = new Date(newEndTime.getTime() + 24 * 60 * 60 * 1000)
    }
    if (newEndTime <= newStartTime) {
      return NextResponse.json(
        { success: false, error: 'Shift end time must be after start time.' },
        { status: 400 },
      )
    }
  }

  const beforeSnapshot = {
    startTime: existing.startTime,
    endTime: existing.endTime,
    requiredSkill: existing.requiredSkill,
    headcountNeeded: existing.headcountNeeded,
    status: existing.status,
  }

  const updated = await db.shift.update({
    where: { id },
    data: {
      startTime: newStartTime,
      endTime: newEndTime,
      ...(requiredSkill && { requiredSkill }),
      ...(headcountNeeded && { headcountNeeded }),
    },
    include: {
      location: true,
      assignments: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  })

  await autoCancelSwapsForShift(id, 'Shift details were edited by the manager.')

  if (existing.status === 'PUBLISHED') {
    await notifyAssignedStaff(
      id,
      'SHIFT_CHANGED',
      `A shift you are assigned to at ${existing.location.name} has been updated. Please review the new details.`,
    )
  }

  await createAuditLog(
    session.user.id,
    'SHIFT_EDITED',
    'Shift',
    id,
    existing.locationId,
    beforeSnapshot,
    {
      startTime: newStartTime,
      endTime: newEndTime,
      requiredSkill: updated.requiredSkill,
      headcountNeeded: updated.headcountNeeded,
    },
  )

  return NextResponse.json({ success: true, data: updated })
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
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

  const { id } = await params

  const shift = await db.shift.findUnique({
    where: { id },
    select: { id: true, status: true, locationId: true },
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

  if (shift.status === 'PUBLISHED') {
    return NextResponse.json(
      {
        success: false,
        error:
          'Published shifts cannot be deleted. Cancel this shift instead of deleting it.',
      },
      { status: 400 },
    )
  }

  await db.shift.delete({ where: { id } })

  await createAuditLog(
    session.user.id,
    'SHIFT_CANCELLED',
    'Shift',
    id,
    shift.locationId,
    { status: shift.status },
    { deleted: true },
  )

  return NextResponse.json({ success: true, data: { deleted: true } })
}
