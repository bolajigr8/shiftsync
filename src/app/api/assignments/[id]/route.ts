import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/prisma/db'
import { z } from 'zod'

type RouteContext = { params: Promise<{ id: string }> }

const patchSchema = z.object({
  status: z.enum(['CONFIRMED']), // only status staff can set themselves
})

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const { id } = await params

  const body = await req.json().catch(() => ({}))
  const parsed = patchSchema.safeParse(body)
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

  const assignment = await db.shiftAssignment.findUnique({
    where: { id },
    select: { id: true, userId: true, status: true },
  })

  if (!assignment) {
    return NextResponse.json(
      { success: false, error: 'Assignment not found' },
      { status: 404 },
    )
  }

  // STAFF may only confirm their own assignments
  if (session.user.role === 'STAFF' && assignment.userId !== session.user.id) {
    return NextResponse.json(
      { success: false, error: 'Forbidden' },
      { status: 403 },
    )
  }

  // Cannot confirm a cancelled assignment
  if (assignment.status === 'CANCELLED') {
    return NextResponse.json(
      { success: false, error: 'Cannot update a cancelled assignment' },
      { status: 400 },
    )
  }

  const updated = await db.shiftAssignment.update({
    where: { id },
    data: { status: parsed.data.status },
    select: { id: true, status: true },
  })

  return NextResponse.json({ success: true, data: updated })
}
