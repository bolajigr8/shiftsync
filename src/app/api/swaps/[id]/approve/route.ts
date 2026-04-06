// =============================================================================
// ShiftSync — PUT /api/swaps/[id]/approve
//
// Manager approves a PENDING_APPROVAL swap request.
//
// SWAP type: targetUserId already set on the SwapRequest.
// DROP type: manager must supply pickupUserId in the request body because no
//            Staff B was pre-selected — the manager chooses who picks it up.
//
// The three DB mutations (cancel old assignment, create new assignment, update
// swap status) are executed inside a single Prisma transaction so they either
// all succeed or all roll back.
//
// Side-effects (notifications, audit, broadcast) run AFTER the transaction.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/prisma/db'
import { z } from 'zod'
import { createNotification } from '@/lib/notify'
import { createAuditLog } from '@/lib/audit'
import { getServerSupabase } from '@/lib/supabase'

type RouteContext = { params: Promise<{ id: string }> }

const approveSchema = z.object({
  // Required for DROP type; ignored (swap.targetUserId used instead) for SWAP type
  pickupUserId: z.string().min(1).optional(),
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

  const { id } = await params

  const body = await req.json().catch(() => ({}))
  const parsed = approveSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Validation failed',
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    )
  }

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

  // Enforce location scope — managers can only approve swaps in their locations
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

  // Resolve the user who will receive the shift
  let recipientUserId: string

  if (swap.type === 'SWAP') {
    if (!swap.targetUserId) {
      return NextResponse.json(
        { success: false, error: 'SWAP request is missing a target user' },
        { status: 400 },
      )
    }
    recipientUserId = swap.targetUserId
  } else {
    // DROP — manager must supply pickupUserId
    if (!parsed.data.pickupUserId) {
      return NextResponse.json(
        {
          success: false,
          error: 'pickupUserId is required to approve a DROP request',
        },
        { status: 400 },
      )
    }
    recipientUserId = parsed.data.pickupUserId
  }

  // ── Atomic transaction ────────────────────────────────────────────────────
  await db.$transaction(async (tx) => {
    // 1. Cancel the requester's original assignment
    await tx.shiftAssignment.update({
      where: { id: swap.assignmentId },
      data: { status: 'CANCELLED' },
    })

    // 2. Create a new assignment for the recipient
    await tx.shiftAssignment.create({
      data: {
        shiftId: shift.id,
        userId: recipientUserId,
        assignedBy: session.user.id,
        status: 'ASSIGNED',
      },
    })

    // 3. Mark the swap as approved
    await tx.swapRequest.update({
      where: { id },
      data: { status: 'APPROVED' },
    })
  })
  // ─────────────────────────────────────────────────────────────────────────

  // Side-effects outside the transaction
  await createNotification(
    swap.requesterId,
    'SWAP_ACCEPTED',
    'Your swap request has been approved by a manager',
    { swapId: id, shiftId: shift.id },
  )

  await createNotification(
    recipientUserId,
    'SWAP_ACCEPTED',
    'You have been assigned to a shift following a swap approval',
    { swapId: id, shiftId: shift.id },
  )

  await createAuditLog(
    session.user.id,
    'SWAP_APPROVED',
    'SwapRequest',
    id,
    shift.locationId,
    { status: 'PENDING_APPROVAL' },
    { status: 'APPROVED', recipientUserId },
  )

  try {
    const supabase = getServerSupabase()
    await supabase.channel(`schedule:${shift.locationId}`).send({
      type: 'broadcast',
      event: 'schedule_updated',
      payload: {
        shiftId: shift.id,
        locationId: shift.locationId,
        action: 'assigned',
      },
    })
  } catch (err) {
    console.error('[Swaps/Approve] Realtime broadcast failed (non-fatal):', err)
  }

  return NextResponse.json({ success: true, data: { status: 'APPROVED' } })
}
