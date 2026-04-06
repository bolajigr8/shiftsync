// =============================================================================
// ShiftSync — PUT /api/swaps/[id]/reject
// Manager rejects a PENDING_APPROVAL swap. Reason is mandatory.
// Both the requester and the target are notified with the reason text.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/prisma/db'
import { z } from 'zod'
import { createNotification } from '@/lib/notify'
import { createAuditLog } from '@/lib/audit'

type RouteContext = { params: Promise<{ id: string }> }

const rejectSchema = z.object({
  reason: z.string().min(1, 'Reason is required'),
})

export async function PUT(req: NextRequest, { params }: RouteContext) {
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

  const body = await req.json().catch(() => ({}))
  const parsed = rejectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'A rejection reason is required',
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    )
  }

  const { id } = await params

  const swap = await db.swapRequest.findUnique({
    where: { id },
    include: {
      assignment: {
        include: { shift: true },
      },
    },
  })

  if (!swap) {
    return NextResponse.json(
      { success: false, error: 'Swap request not found' },
      { status: 404 },
    )
  }

  const shift = swap.assignment.shift

  if (
    session.user.role !== 'ADMIN' &&
    !session.user.locationIds.includes(shift.locationId)
  ) {
    return NextResponse.json(
      { success: false, error: 'Forbidden' },
      { status: 403 },
    )
  }

  if (swap.status !== 'PENDING_APPROVAL') {
    return NextResponse.json(
      { success: false, error: 'This swap request is not awaiting approval' },
      { status: 400 },
    )
  }

  await db.swapRequest.update({
    where: { id },
    data: {
      status: 'REJECTED',
      managerReason: parsed.data.reason,
    },
  })

  const requesterMessage = `Your swap request was rejected. Reason: ${parsed.data.reason}`
  const targetMessage = `A swap request you were involved in was rejected. Reason: ${parsed.data.reason}`

  await createNotification(
    swap.requesterId,
    'SWAP_REJECTED',
    requesterMessage,
    {
      swapId: id,
    },
  )

  if (swap.targetUserId) {
    await createNotification(
      swap.targetUserId,
      'SWAP_REJECTED',
      targetMessage,
      {
        swapId: id,
      },
    )
  }

  await createAuditLog(
    session.user.id,
    'SWAP_REJECTED',
    'SwapRequest',
    id,
    shift.locationId,
    { status: 'PENDING_APPROVAL' },
    { status: 'REJECTED', managerReason: parsed.data.reason },
  )

  return NextResponse.json({ success: true, data: { status: 'REJECTED' } })
}
