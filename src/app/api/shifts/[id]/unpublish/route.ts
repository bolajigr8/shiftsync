import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/prisma/db'
import { createAuditLog } from '@/lib/audit'
import { notifyAssignedStaff } from '@/lib/notify'
import { autoCancelSwapsForShift } from '@/lib/swaps'
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

  if (shift.status !== 'PUBLISHED') {
    return NextResponse.json(
      { success: false, error: 'Only published shifts can be unpublished.' },
      { status: 400 },
    )
  }

  const updated = await db.shift.update({
    where: { id },
    data: { status: 'DRAFT', publishedAt: null },
    include: {
      location: true,
      assignments: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  })

  await autoCancelSwapsForShift(
    id,
    `The shift at ${shift.location.name} was unpublished by a manager.`,
  )

  await notifyAssignedStaff(
    id,
    'SCHEDULE_UNPUBLISHED',
    `A shift you were assigned to at ${shift.location.name} has been unpublished. Please check with your manager.`,
  )

  await createAuditLog(
    session.user.id,
    'SHIFT_UNPUBLISHED',
    'Shift',
    id,
    shift.locationId,
    { status: 'PUBLISHED' },
    { status: 'DRAFT' },
  )

  try {
    const supabase = getServerSupabase()
    await supabase.channel(`schedule:${shift.locationId}`).send({
      type: 'broadcast',
      event: 'schedule_updated',
      payload: {
        shiftId: id,
        locationId: shift.locationId,
        action: 'unpublished',
      },
    })
  } catch (err) {
    console.error('[Unpublish] Realtime broadcast failed (non-fatal):', err)
  }

  return NextResponse.json({ success: true, data: updated })
}
