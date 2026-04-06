// =============================================================================
// ShiftSync — POST /api/admin/locations (create)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/prisma/db'
import { z } from 'zod'

const createLocationSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  timezone: z.string().min(1, 'Timezone is required'),
  address: z.string().optional(),
  editCutoffHours: z.number().int().min(0).max(168).default(48),
})

export async function POST(req: NextRequest) {
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

  const body = await req.json().catch(() => ({}))
  const parsed = createLocationSchema.safeParse(body)
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

  const location = await db.location.create({ data: parsed.data })
  return NextResponse.json({ success: true, data: location }, { status: 201 })
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const locations = await db.location.findMany({
    where:
      session.user.role === 'ADMIN'
        ? {}
        : {
            id: { in: session.user.locationIds },
          },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({ success: true, data: locations })
}
