// =============================================================================
// ShiftSync — GET /api/notifications
//
// Returns the current user's notifications, newest first, with a separate
// unreadCount field for badge rendering. Paginated via `limit` param.
// =============================================================================

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
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)),
  )
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))

  const userId = session.user.id

  const [notifications, unreadCount, total] = await Promise.all([
    db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.notification.count({
      where: { userId, isRead: false },
    }),
    db.notification.count({
      where: { userId },
    }),
  ])

  return NextResponse.json({
    success: true,
    data: {
      notifications,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  })
}
