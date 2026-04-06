import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/prisma/db'
import { createAuditLog } from '@/lib/audit'
import { notifyAssignedStaff } from '@/lib/notify'
import { getServerSupabase } from '@/lib/supabase'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: RouteContext) {
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
    include: {
      location: true,
      assignments: {
        where: { status: { in: ['ASSIGNED', 'CONFIRMED'] } },
        select: { id: true },
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

  if (shift.status === 'PUBLISHED') {
    return NextResponse.json(
      { success: false, error: 'Shift is already published.' },
      { status: 400 },
    )
  }

  if (shift.status === 'CANCELLED') {
    return NextResponse.json(
      { success: false, error: 'Cancelled shifts cannot be published.' },
      { status: 400 },
    )
  }

  const headcountWarning = shift.assignments.length < shift.headcountNeeded

  const updated = await db.shift.update({
    where: { id },
    data: { status: 'PUBLISHED', publishedAt: new Date() },
    include: {
      location: true,
      assignments: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  })

  await notifyAssignedStaff(
    id,
    'SCHEDULE_PUBLISHED',
    `Your shift at ${shift.location.name} starting ${shift.startTime.toISOString()} has been published.`,
  )

  await createAuditLog(
    session.user.id,
    'SHIFT_PUBLISHED',
    'Shift',
    id,
    shift.locationId,
    { status: 'DRAFT' },
    { status: 'PUBLISHED', publishedAt: updated.publishedAt },
  )

  try {
    const supabase = getServerSupabase()
    await supabase.channel(`schedule:${shift.locationId}`).send({
      type: 'broadcast',
      event: 'schedule_updated',
      payload: {
        shiftId: id,
        locationId: shift.locationId,
        action: 'published',
      },
    })
  } catch (err) {
    console.error('[Publish] Realtime broadcast failed (non-fatal):', err)
  }

  return NextResponse.json({
    success: true,
    data: { ...updated, headcountWarning },
  })
}
