import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/prisma/db'
import { z } from 'zod'
import { createNotification } from '@/lib/notify'
import { getEligiblePickupStaff } from '@/lib/swaps'

const postSchema = z
  .object({
    assignmentId: z.string().min(1),
    type: z.enum(['SWAP', 'DROP']),
    targetUserId: z.string().optional(),
  })
  .refine((data) => data.type !== 'SWAP' || !!data.targetUserId, {
    message: 'targetUserId is required for SWAP type',
    path: ['targetUserId'],
  })

// ---------------------------------------------------------------------------
// GET /api/swaps
// STAFF   → their own requests (requester or target)
// MANAGER → PENDING_APPROVAL swaps within their locations
// ADMIN   → all PENDING_APPROVAL swaps
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const { id: userId, role, locationIds } = session.user

  const { searchParams } = new URL(req.url)
  const showDrops = searchParams.get('drops') === 'true'

  if (role === 'STAFF' && showDrops) {
    // Return all PENDING DROP requests at the user's certified locations
    // that they are eligible to pick up (excluding their own)
    const swaps = await db.swapRequest.findMany({
      where: {
        type: 'DROP',
        status: 'PENDING',
        requesterId: { not: userId },
        assignment: {
          shift: {
            locationId: { in: locationIds },
            startTime: { gte: new Date() },
          },
        },
      },
      include: {
        assignment: {
          include: {
            shift: {
              select: {
                id: true,
                startTime: true,
                endTime: true,
                requiredSkill: true,
                locationId: true,
                location: { select: { name: true, timezone: true } },
              },
            },
          },
        },
        requester: { select: { id: true, name: true } },
        target: { select: { id: true, name: true } },
      },
      orderBy: { expiresAt: 'asc' },
    })
    return NextResponse.json({ success: true, data: swaps })
  }

  if (role === 'STAFF') {
    const swaps = await db.swapRequest.findMany({
      where: {
        OR: [{ requesterId: userId }, { targetUserId: userId }],
      },
      include: {
        assignment: {
          include: {
            shift: {
              select: {
                id: true,
                startTime: true,
                endTime: true,
                requiredSkill: true,
                locationId: true,
                location: { select: { name: true } },
              },
            },
          },
        },
        requester: { select: { id: true, name: true } },
        target: { select: { id: true, name: true } },
      },
      orderBy: { expiresAt: 'desc' },
    })
    return NextResponse.json({ success: true, data: swaps })
  }

  // MANAGER or ADMIN — pending approval within accessible locations
  const swaps = await db.swapRequest.findMany({
    where: {
      status: 'PENDING_APPROVAL',
      assignment: {
        shift: {
          locationId: role === 'ADMIN' ? undefined : { in: locationIds },
        },
      },
    },
    include: {
      assignment: {
        include: {
          shift: {
            select: {
              id: true,
              startTime: true,
              endTime: true,
              requiredSkill: true,
              locationId: true,
              location: { select: { name: true } },
            },
          },
        },
      },
      requester: { select: { id: true, name: true } },
      target: { select: { id: true, name: true } },
    },
    orderBy: { expiresAt: 'asc' },
  })

  return NextResponse.json({ success: true, data: swaps })
}

// ---------------------------------------------------------------------------
// POST /api/swaps — create a SWAP or DROP request
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const body = await req.json().catch(() => ({}))
  const parsed = postSchema.safeParse(body)
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

  const { assignmentId, type, targetUserId } = parsed.data
  const userId = session.user.id

  // Verify the session user owns a non-cancelled assignment matching assignmentId
  const assignment = await db.shiftAssignment.findUnique({
    where: { id: assignmentId },
    include: { shift: true },
  })

  if (
    !assignment ||
    assignment.userId !== userId ||
    assignment.status === 'CANCELLED'
  ) {
    return NextResponse.json(
      { success: false, error: 'Assignment not found or not active' },
      { status: 404 },
    )
  }

  // Enforce 3-request active limit
  const activeCount = await db.swapRequest.count({
    where: {
      requesterId: userId,
      status: { in: ['PENDING', 'ACCEPTED', 'PENDING_APPROVAL'] },
    },
  })

  if (activeCount >= 3) {
    return NextResponse.json(
      {
        success: false,
        error: 'You have reached the limit of 3 active swap requests',
      },
      { status: 400 },
    )
  }

  // Enforce 24-hour cutoff
  const now = new Date()
  const hoursUntilShift =
    (assignment.shift.startTime.getTime() - now.getTime()) / (1000 * 60 * 60)

  if (hoursUntilShift < 24) {
    return NextResponse.json(
      {
        success: false,
        error: 'Cannot request a swap within 24 hours of the shift start',
      },
      { status: 400 },
    )
  }

  // expiresAt = shift.startTime − 24 hours
  const expiresAt = new Date(
    assignment.shift.startTime.getTime() - 24 * 60 * 60 * 1000,
  )

  const swap = await db.swapRequest.create({
    data: {
      assignmentId,
      requesterId: userId,
      targetUserId: type === 'SWAP' ? (targetUserId ?? null) : null,
      type,
      expiresAt,
    },
  })

  // Notifications — always outside any transaction
  if (type === 'SWAP' && targetUserId) {
    await createNotification(
      targetUserId,
      'SWAP_REQUEST',
      `${session.user.name} has sent you a shift swap request`,
      { swapId: swap.id, shiftId: assignment.shiftId },
    )
  } else if (type === 'DROP') {
    const eligible = await getEligiblePickupStaff(assignment.shiftId)
    await Promise.all(
      eligible.map((staff) =>
        createNotification(
          staff.id,
          'COVERAGE_NEEDED',
          `A staff member has dropped a shift and coverage is needed`,
          { swapId: swap.id, shiftId: assignment.shiftId },
        ),
      ),
    )
  }

  return NextResponse.json({ success: true, data: swap }, { status: 201 })
}
