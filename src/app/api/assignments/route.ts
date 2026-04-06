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
