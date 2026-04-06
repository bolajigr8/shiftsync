// =============================================================================
// ShiftSync — GET /api/users (list) + POST /api/users (create)
//
// GET  — MANAGER / ADMIN. Filterable by locationId and skill.
//        Managers are automatically scoped to their own locations.
// POST — ADMIN only. Creates a new user with a bcrypt-hashed password.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/prisma/db'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import type { Prisma } from '@prisma/client'

const VALID_SKILLS = ['BARTENDER', 'LINE_COOK', 'SERVER', 'HOST'] as const
const VALID_ROLES = ['ADMIN', 'MANAGER', 'STAFF'] as const

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(VALID_ROLES),
  timezone: z.string().min(1),
  desiredWeeklyHours: z.number().int().positive().optional(),
  hourlyRate: z.number().positive().optional(),
})

// ---------------------------------------------------------------------------
// GET /api/users
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  if (session.user.role === 'STAFF') {
    return NextResponse.json(
      { success: false, error: 'Forbidden' },
      { status: 403 },
    )
  }

  const { searchParams } = new URL(req.url)
  const locationId = searchParams.get('locationId')
  const skill = searchParams.get('skill')

  // Build location filter — managers are always scoped to their own locations
  const effectiveLocationIds =
    session.user.role === 'ADMIN' ? null : session.user.locationIds

  // If a specific locationId is requested by a manager, verify it's accessible
  if (
    locationId &&
    effectiveLocationIds &&
    !effectiveLocationIds.includes(locationId)
  ) {
    return NextResponse.json(
      { success: false, error: 'Forbidden' },
      { status: 403 },
    )
  }

  const where: Prisma.UserWhereInput = {
    isActive: true,
  }

  // Skill filter
  if (skill && VALID_SKILLS.includes(skill as (typeof VALID_SKILLS)[number])) {
    where.skills = { some: { skill: skill as (typeof VALID_SKILLS)[number] } }
  }

  // Location filter — use the explicit locationId if provided, else the manager's scope
  const targetLocationId = locationId ?? null
  const scopeLocationIds = effectiveLocationIds

  if (targetLocationId) {
    where.staffLocations = {
      some: { locationId: targetLocationId, isActive: true },
    }
  } else if (scopeLocationIds) {
    where.staffLocations = {
      some: { locationId: { in: scopeLocationIds }, isActive: true },
    }
  }

  const users = await db.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      timezone: true,
      desiredWeeklyHours: true,
      hourlyRate: true,
      isActive: true,
      createdAt: true,
      skills: { select: { skill: true } },
      staffLocations: {
        where: { isActive: true },
        select: {
          locationId: true,
          location: { select: { name: true } },
        },
      },
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({ success: true, data: users })
}

// ---------------------------------------------------------------------------
// POST /api/users — ADMIN only
// ---------------------------------------------------------------------------
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
  const parsed = createUserSchema.safeParse(body)
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

  const {
    email,
    name,
    password,
    role,
    timezone,
    desiredWeeklyHours,
    hourlyRate,
  } = parsed.data

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json(
      { success: false, error: 'A user with this email already exists' },
      { status: 409 },
    )
  }

  const passwordHash = await bcrypt.hash(password, 12)

  const user = await db.user.create({
    data: {
      email,
      name,
      passwordHash,
      role,
      timezone,
      desiredWeeklyHours,
      hourlyRate,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      timezone: true,
      desiredWeeklyHours: true,
      isActive: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ success: true, data: user }, { status: 201 })
}
