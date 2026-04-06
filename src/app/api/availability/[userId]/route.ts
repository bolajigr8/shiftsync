import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/prisma/db'

type RouteContext = { params: Promise<{ userId: string }> }

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const { userId } = await params

  if (session.user.id !== userId && session.user.role !== 'ADMIN') {
    if (session.user.role === 'MANAGER') {
      const overlap = await db.staffLocation.findFirst({
        where: {
          userId,
          isActive: true,
          locationId: { in: session.user.locationIds },
        },
      })
      if (!overlap) {
        return NextResponse.json(
          {
            success: false,
            error: 'You do not manage any location this staff member works at.',
          },
          { status: 403 },
        )
      }
    } else {
      return NextResponse.json(
        { success: false, error: 'Forbidden.' },
        { status: 403 },
      )
    }
  }

  const availability = await db.availability.findMany({
    where: { userId },
    orderBy: [{ type: 'asc' }, { dayOfWeek: 'asc' }, { exceptionDate: 'asc' }],
  })

  return NextResponse.json({ success: true, data: availability })
}
