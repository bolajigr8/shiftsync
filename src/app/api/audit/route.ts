// =============================================================================
// ShiftSync — GET /api/audit
//
// Returns paginated AuditLog entries with actor name and location name joined.
//
// Query params (all optional):
//   locationId  — filter by a single location
//   start       — ISO datetime lower bound on createdAt
//   end         — ISO datetime upper bound on createdAt
//   action      — AuditAction enum value e.g. SWAP_APPROVED
//   page        — 1-based (default 1)
//   limit       — max 100 (default 50)
//
// ADMIN  → sees all locations
// MANAGER → automatically scoped to their locationIds
// STAFF  → 403
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/prisma/db'
import type { Prisma } from '@prisma/client'

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
  const start = searchParams.get('start')
  const end = searchParams.get('end')
  const action = searchParams.get('action')
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)),
  )

  // Build the locationId filter respecting role scope
  let locationFilter: Prisma.AuditLogWhereInput = {}

  if (session.user.role === 'ADMIN') {
    if (locationId) {
      locationFilter = { locationId }
    }
  } else {
    // MANAGER — always scoped to their locations
    if (locationId) {
      if (!session.user.locationIds.includes(locationId)) {
        return NextResponse.json(
          { success: false, error: 'Forbidden' },
          { status: 403 },
        )
      }
      locationFilter = { locationId }
    } else {
      locationFilter = { locationId: { in: session.user.locationIds } }
    }
  }

  const where: Prisma.AuditLogWhereInput = {
    ...locationFilter,
    ...(start && { createdAt: { gte: new Date(start) } }),
    ...(end && { createdAt: { lte: new Date(end) } }),
    // Spread both date conditions together when both are present
    ...(start &&
      end && {
        createdAt: { gte: new Date(start), lte: new Date(end) },
      }),
    ...(action && { action: action as Prisma.EnumAuditActionFilter }),
  }

  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: {
        actor: { select: { id: true, name: true, email: true } },
        location: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.auditLog.count({ where }),
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
