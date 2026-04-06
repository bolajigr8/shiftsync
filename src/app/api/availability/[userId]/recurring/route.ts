import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { db } from '@/prisma/db'
import { runAvailabilityConflictCheck } from '@/lib/availability'

type RouteContext = { params: Promise<{ userId: string }> }

const RecurringRowSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'startTime must be HH:mm')
    .optional(),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'endTime must be HH:mm')
    .optional(),
  isAvailable: z.boolean(),
})

const RecurringBodySchema = z.object({
  recurring: z.array(RecurringRowSchema).min(0).max(7),
})

export async function PUT(req: NextRequest, { params }: RouteContext) {
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

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body.' },
      { status: 400 },
    )
  }

  const parsed = RecurringBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Validation failed.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    )
  }

  await db.$transaction(async (tx) => {
    await tx.availability.deleteMany({ where: { userId, type: 'RECURRING' } })
    if (parsed.data.recurring.length > 0) {
      await tx.availability.createMany({
        data: parsed.data.recurring.map((row) => ({
          userId,
          type: 'RECURRING' as const,
          dayOfWeek: row.dayOfWeek,
          startTime: row.startTime ?? null,
          endTime: row.endTime ?? null,
          isAvailable: row.isAvailable,
        })),
      })
    }
  })

  await runAvailabilityConflictCheck(userId)

  const updated = await db.availability.findMany({
    where: { userId, type: 'RECURRING' },
    orderBy: { dayOfWeek: 'asc' },
  })

  return NextResponse.json({ success: true, data: updated })
}
