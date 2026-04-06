// =============================================================================
// ShiftSync — PUT /api/admin/locations/[id] (update)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/prisma/db'
import { z } from 'zod'

type RouteContext = { params: Promise<{ id: string }> }

const updateLocationSchema = z.object({
  name: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
  address: z.string().nullable().optional(),
  editCutoffHours: z.number().int().min(0).max(168).optional(),
  isActive: z.boolean().optional(),
})

export async function PUT(req: NextRequest, { params }: RouteContext) {
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

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const parsed = updateLocationSchema.safeParse(body)
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

  const location = await db.location.update({
    where: { id },
    data: parsed.data,
  })
  return NextResponse.json({ success: true, data: location })
}
