import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/prisma/db'
import { createAuditLog } from '@/lib/audit'
import { createNotification } from '@/lib/notify'
import { getServerSupabase } from '@/lib/supabase'

type RouteContext = { params: Promise<{ id: string }> }

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

  const assignment = await db.shiftAssignment.findUnique({
    where: { id },
    include: { shift: { include: { location: true } } },
  })

  if (!assignment) {
    return NextResponse.json(
      { success: false, error: 'Assignment not found.' },
      { status: 404 },
    )
  }

  if (
    session.user.role !== 'ADMIN' &&
    !session.user.locationIds.includes(assignment.shift.locationId)
  ) {
    return NextResponse.json(
      { success: false, error: 'Forbidden.' },
      { status: 403 },
    )
  }

  if (assignment.status === 'CANCELLED') {
    return NextResponse.json(
      { success: false, error: 'Assignment is already cancelled.' },
      { status: 400 },
    )
  }

  const { editCutoffHours } = assignment.shift.location
  const cutoff = new Date(
    assignment.shift.startTime.getTime() - editCutoffHours * 60 * 60 * 1000,
  )

  if (new Date() >= cutoff && assignment.shift.status === 'PUBLISHED') {
    return NextResponse.json(
      {
        success: false,
        error: `Assignments at ${assignment.shift.location.name} cannot be cancelled within ${editCutoffHours} hours of the shift start time.`,
      },
      { status: 403 },
    )
  }

  // Cancel any non-terminal swaps on this assignment
  const pendingSwaps = await db.swapRequest.findMany({
    where: {
      assignmentId: id,
      status: {
        notIn: [
          'APPROVED',
          'REJECTED',
          'CANCELLED',
          'EXPIRED',
          'AUTO_CANCELLED',
        ],
      },
    },
    select: { id: true, requesterId: true, targetUserId: true },
  })

  await Promise.all(
    pendingSwaps.map(async (swap) => {
      await db.swapRequest.update({
        where: { id: swap.id },
        data: { status: 'CANCELLED' },
      })
      const msg = `A swap request has been cancelled because the underlying assignment was removed.`
      await createNotification(swap.requesterId, 'SWAP_CANCELLED', msg, {
        swapId: swap.id,
      })
      if (swap.targetUserId) {
        await createNotification(swap.targetUserId, 'SWAP_CANCELLED', msg, {
          swapId: swap.id,
        })
      }
    }),
  )

  await db.shiftAssignment.update({
    where: { id },
    data: { status: 'CANCELLED' },
  })

  await createNotification(
    assignment.userId,
    'SHIFT_CHANGED',
    `Your assignment at ${assignment.shift.location.name} has been removed by a manager.`,
    { shiftId: assignment.shiftId },
  )

  await createAuditLog(
    session.user.id,
    'UNASSIGNED',
    'ShiftAssignment',
    id,
    assignment.shift.locationId,
    { status: assignment.status, userId: assignment.userId },
    { status: 'CANCELLED' },
  )

  try {
    const supabase = getServerSupabase()
    await supabase.channel(`schedule:${assignment.shift.locationId}`).send({
      type: 'broadcast',
      event: 'schedule_updated',
      payload: {
        shiftId: assignment.shiftId,
        assignmentId: id,
        locationId: assignment.shift.locationId,
        action: 'unassigned',
      },
    })
  } catch (err) {
    console.error(
      '[Assignment DELETE] Realtime broadcast failed (non-fatal):',
      err,
    )
  }

  return NextResponse.json({ success: true, data: { id, status: 'CANCELLED' } })
}
