import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/prisma/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const { searchParams } = new URL(req.url)
  const requestedUserId = searchParams.get('userId')

  // STAFF may only query their own assignments
  let targetUserId: string
  if (session.user.role === 'STAFF') {
    targetUserId = session.user.id
  } else if (requestedUserId) {
    targetUserId = requestedUserId
  } else {
    return NextResponse.json(
      {
        success: false,
        error: 'userId query param required for MANAGER/ADMIN',
      },
      { status: 400 },
    )
  }

  const now = new Date()

  const assignments = await db.shiftAssignment.findMany({
    where: {
      userId: targetUserId,
      status: { not: 'CANCELLED' },
      shift: {
        status: { not: 'CANCELLED' },
        startTime: { gte: now },
      },
    },
    include: {
      shift: {
        select: {
          id: true,
          startTime: true,
          endTime: true,
          requiredSkill: true,
          status: true,
          locationId: true,
          location: { select: { id: true, name: true, timezone: true } },
        },
      },
    },
    orderBy: { shift: { startTime: 'asc' } },
  })

  return NextResponse.json({ success: true, data: assignments })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)

  // 1. Auth Check
  if (
    !session?.user ||
    (session.user.role !== 'MANAGER' && session.user.role !== 'ADMIN')
  ) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  try {
    const body = await req.json()
    const { shiftId, userId } = body

    if (!shiftId || !userId) {
      return NextResponse.json(
        { success: false, error: 'Missing shiftId or userId' },
        { status: 400 },
      )
    }

    // 2. Concurrency Check: Is this slot already filled?
    const shift = await db.shift.findUnique({
      where: { id: shiftId },
      include: { assignments: { where: { status: { not: 'CANCELLED' } } } },
    })

    if (!shift) {
      return NextResponse.json(
        { success: false, error: 'Shift not found' },
        { status: 404 },
      )
    }

    // Is the person already assigned to THIS shift?
    const alreadyAssigned = shift.assignments.some((a) => a.userId === userId)
    if (alreadyAssigned) {
      return NextResponse.json(
        { success: false, error: 'User is already assigned to this shift.' },
        { status: 409 },
      )
    }

    // Is the shift full?
    if (shift.assignments.length >= shift.headcountNeeded) {
      return NextResponse.json(
        {
          success: false,
          error: 'This shift has just been filled by another manager.',
        },
        { status: 409 },
      )
    }

    // 3. Create the assignment
    const assignment = await db.shiftAssignment.create({
      data: {
        // We "connect" the existing records by their IDs
        shift: {
          connect: { id: shiftId },
        },
        user: {
          connect: { id: userId },
        },
        // The error says 'assigner' is missing.
        // This is the manager currently logged in (session.user.id)
        assigner: {
          connect: { id: session.user.id },
        },
        status: 'CONFIRMED',
      },
      include: {
        user: { select: { name: true } },
        shift: true, // optional: include shift details in response
      },
    })

    return NextResponse.json({ success: true, data: assignment })
  } catch (error) {
    console.error('[ASSIGNMENT_POST]', error)
    return NextResponse.json(
      { success: false, error: 'Internal Server Error' },
      { status: 500 },
    )
  }
}
