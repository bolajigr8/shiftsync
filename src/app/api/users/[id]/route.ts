// =============================================================================
// ShiftSync — GET /api/users/[id] + PUT /api/users/[id]
//
// GET — any authenticated user can read their own profile; MANAGER/ADMIN can
//       read any user within their location scope.
//
// PUT — update profile fields, skills (MANAGER/ADMIN), and location
//       certifications (ADMIN only). Skills and locations are replaced
//       atomically inside a single transaction.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/prisma/db'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

type RouteContext = { params: Promise<{ id: string }> }

const VALID_SKILLS = ['BARTENDER', 'LINE_COOK', 'SERVER', 'HOST'] as const

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
  desiredWeeklyHours: z.number().int().positive().nullable().optional(),
  hourlyRate: z.number().positive().nullable().optional(),
  // Fix 1: Zod v4 requires an explicit key schema as the first argument to z.record()
  notificationPrefs: z
    .record(z.string(), z.object({ inApp: z.boolean(), email: z.boolean() }))
    .optional(),
  isActive: z.boolean().optional(),
  // MANAGER/ADMIN only — full replacement of the user's skill set
  skills: z.array(z.enum(VALID_SKILLS)).optional(),
  // ADMIN only — full replacement of the user's active StaffLocation rows
  staffLocationIds: z.array(z.string()).optional(),
})

// ---------------------------------------------------------------------------
// GET /api/users/[id]
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const { id } = await params

  // STAFF may only read their own profile
  if (session.user.role === 'STAFF' && session.user.id !== id) {
    return NextResponse.json(
      { success: false, error: 'Forbidden' },
      { status: 403 },
    )
  }

  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      timezone: true,
      desiredWeeklyHours: true,
      hourlyRate: true,
      notificationPrefs: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      skills: { select: { skill: true } },
      staffLocations: {
        select: {
          locationId: true,
          isActive: true,
          certifiedAt: true,
          decertifiedAt: true,
          location: { select: { name: true } },
        },
      },
      managerLocations: {
        select: {
          locationId: true,
          location: { select: { name: true } },
        },
      },
    },
  })

  if (!user) {
    return NextResponse.json(
      { success: false, error: 'User not found' },
      { status: 404 },
    )
  }

  return NextResponse.json({ success: true, data: user })
}

// ---------------------------------------------------------------------------
// PUT /api/users/[id]
// ---------------------------------------------------------------------------
export async function PUT(req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const { id } = await params

  // STAFF may only update their own profile
  if (session.user.role === 'STAFF' && session.user.id !== id) {
    return NextResponse.json(
      { success: false, error: 'Forbidden' },
      { status: 403 },
    )
  }

  const body = await req.json().catch(() => ({}))
  const parsed = updateUserSchema.safeParse(body)
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

  // Fix 2: Destructure notificationPrefs separately so it can be cast to
  // Prisma.InputJsonValue, avoiding the type mismatch with Prisma's JSON field.
  const { skills, staffLocationIds, isActive, notificationPrefs, ...rest } =
    parsed.data

  const profileUpdate = {
    ...rest,
    // Cast notificationPrefs to satisfy Prisma's InputJsonValue expectation
    ...(notificationPrefs !== undefined && {
      notificationPrefs: notificationPrefs as Prisma.InputJsonValue,
    }),
    // STAFF cannot toggle their own isActive flag
    ...(session.user.role !== 'STAFF' &&
      isActive !== undefined && { isActive }),
  }

  await db.$transaction(async (tx) => {
    // Update core profile fields
    await tx.user.update({
      where: { id },
      data: profileUpdate,
    })

    // Atomic skill replacement — MANAGER and ADMIN only
    if (skills !== undefined && session.user.role !== 'STAFF') {
      await tx.staffSkill.deleteMany({ where: { userId: id } })
      if (skills.length > 0) {
        await tx.staffSkill.createMany({
          data: skills.map((skill) => ({ userId: id, skill })),
        })
      }
    }

    // Atomic location certification replacement — ADMIN only
    if (staffLocationIds !== undefined && session.user.role === 'ADMIN') {
      // Decertify all current active locations
      await tx.staffLocation.updateMany({
        where: { userId: id, isActive: true },
        data: { isActive: false, decertifiedAt: new Date() },
      })

      // Re-certify (or create) each supplied location
      for (const locationId of staffLocationIds) {
        await tx.staffLocation.upsert({
          where: { userId_locationId: { userId: id, locationId } },
          create: { userId: id, locationId, isActive: true },
          update: { isActive: true, decertifiedAt: null },
        })
      }
    }
  })

  return NextResponse.json({ success: true, data: { id } })
}
