// =============================================================================
// ShiftSync — GET /api/email-log
// Returns all EmailLog rows, newest first, paginated. ADMIN only.
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

  if (session.user.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Forbidden' },
      { status: 403 },
    )
  }

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)),
  )

  // Optional filters
  const toUserId = searchParams.get('toUserId')
  const notificationType = searchParams.get('notificationType')

  const where = {
    ...(toUserId && { toUserId }),
    ...(notificationType && { notificationType }),
  }

  const [logs, total] = await Promise.all([
    db.emailLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        toUser: { select: { id: true, name: true } },
      },
    }),
    db.emailLog.count({ where }),
  ])

  return NextResponse.json({
    success: true,
    data: {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  })
}
