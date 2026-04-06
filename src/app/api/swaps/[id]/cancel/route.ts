// =============================================================================
// ShiftSync — PUT /api/swaps/[id]/cancel
// The original requester (Staff A) cancels their own SWAP or DROP request.
// Notifies all involved parties.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/prisma/db'
import { createNotification } from '@/lib/notify'

type RouteContext = { params: Promise<{ id: string }> }

const TERMINAL = [
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'AUTO_CANCELLED',
] as const

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const { id } = await params

  const swap = await db.swapRequest.findUnique({
    where: { id },
  })

  if (!swap) {
    return NextResponse.json(
      { success: false, error: 'Swap request not found' },
      { status: 404 },
    )
  }

  // Only the requester may cancel
  if (swap.requesterId !== session.user.id) {
    return NextResponse.json(
      { success: false, error: 'Forbidden' },
      { status: 403 },
    )
  }

  if ((TERMINAL as readonly string[]).includes(swap.status)) {
    return NextResponse.json(
      { success: false, error: 'This swap request cannot be cancelled' },
      { status: 400 },
    )
  }

  await db.swapRequest.update({
    where: { id },
    data: { status: 'CANCELLED' },
  })

  // Notify target (Staff B) if one was assigned — they need to know the request is gone
  if (swap.targetUserId) {
    await createNotification(
      swap.targetUserId,
      'SWAP_CANCELLED',
      `${session.user.name} has cancelled their swap request`,
      { swapId: id },
    )
  }

  // Confirm to the requester themselves (in-app notification centre record)
  await createNotification(
    swap.requesterId,
    'SWAP_CANCELLED',
    'You have cancelled your swap request',
    { swapId: id },
  )

  return NextResponse.json({ success: true, data: { status: 'CANCELLED' } })
}
