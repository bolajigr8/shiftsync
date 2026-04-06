// =============================================================================
// ShiftSync — PUT /api/swaps/[id]/accept
//
// Staff B accepts a pending SWAP request. This route re-runs ALL 8 constraints
// for Staff B — not just skill. This is the most critical edge case in the
// entire swap lifecycle: Staff B may pass the skill check but fail rest-period,
// weekly hours, or consecutive-days. All 8 must pass before status advances.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/prisma/db'
import { runAllConstraints } from '@/lib/constraints'
import { notifyLocationManagers } from '@/lib/notify'

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

  // Only the designated target (Staff B) may accept
  if (swap.targetUserId !== session.user.id) {
    return NextResponse.json(
      { success: false, error: 'Forbidden' },
      { status: 403 },
    )
  }

  // Only SWAP type has an accept step; DROP goes straight to manager approval
  if (swap.type !== 'SWAP') {
    return NextResponse.json(
      { success: false, error: 'Only SWAP requests can be accepted by staff' },
      { status: 400 },
    )
  }

  // Reject if already in a terminal or already-advanced state
  if (
    (TERMINAL as readonly string[]).includes(swap.status) ||
    swap.status === 'PENDING_APPROVAL'
  ) {
    return NextResponse.json(
      {
        success: false,
        error: 'This swap request is no longer pending acceptance',
      },
      { status: 400 },
    )
  }

  const shift = swap.assignment.shift

  // ─── THE CRITICAL EDGE CASE ──────────────────────────────────────────────
  // Re-run ALL 8 constraints for Staff B against the shift they are accepting.
  // Results are returned in a fixed positional array — do not match by name.
  const results = await runAllConstraints(session.user.id, shift)

  const failures = results.filter((r) => !r.allowed)
  if (failures.length > 0) {
    return NextResponse.json(
      {
        success: false,
        error: 'You do not meet the requirements to accept this shift',
        failures,
      },
      { status: 400 },
    )
  }
  // ─────────────────────────────────────────────────────────────────────────

  await db.swapRequest.update({
    where: { id },
    data: { status: 'PENDING_APPROVAL' },
  })

  // Notify every manager responsible for this location
  await notifyLocationManagers(
    shift.locationId,
    'MANAGER_APPROVAL_NEEDED',
    `A shift swap between staff members requires your approval for shift starting ${shift.startTime.toISOString()}`,
  )

  return NextResponse.json({
    success: true,
    data: { status: 'PENDING_APPROVAL' },
  })
}
