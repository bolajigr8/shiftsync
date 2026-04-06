import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { db } from '@/prisma/db'
import { runAvailabilityConflictCheck } from '@/lib/availability'

type RouteContext = { params: Promise<{ userId: string }> }

const ExceptionSchema = z.object({
  exceptionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'exceptionDate must be YYYY-MM-DD'),
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

export async function POST(req: NextRequest, { params }: RouteContext) {
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

  const parsed = ExceptionSchema.safeParse(body)
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

  const { exceptionDate, startTime, endTime, isAvailable } = parsed.data
  const exceptionDateParsed = new Date(`${exceptionDate}T00:00:00.000Z`)

  if (isNaN(exceptionDateParsed.getTime())) {
    return NextResponse.json(
      { success: false, error: 'exceptionDate is not a valid date.' },
      { status: 400 },
    )
  }

  // Safe conditional create-or-update (no fake-ID upsert anti-pattern)
  const existing = await db.availability.findFirst({
    where: { userId, type: 'EXCEPTION', exceptionDate: exceptionDateParsed },
    select: { id: true },
  })

  const exception = existing
    ? await db.availability.update({
        where: { id: existing.id },
        data: {
          startTime: startTime ?? null,
          endTime: endTime ?? null,
          isAvailable,
        },
      })
    : await db.availability.create({
        data: {
          userId,
          type: 'EXCEPTION',
          exceptionDate: exceptionDateParsed,
          startTime: startTime ?? null,
          endTime: endTime ?? null,
          isAvailable,
        },
      })

  await runAvailabilityConflictCheck(userId)

  return NextResponse.json({ success: true, data: exception }, { status: 201 })
}
