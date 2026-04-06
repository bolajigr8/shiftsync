// =============================================================================
// ShiftSync — GET /api/audit/export
//
// Streams a CSV download of the audit log. ADMIN only.
// Uses a hand-written CSV serialiser — no third-party dependency required.
//
// Columns:
//   timestamp, actorName, action, entityType, entityId, locationName,
//   overrideReason, before (JSON string), after (JSON string)
//
// Query params (all optional): locationId, start, end, action
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/prisma/db'
import type { Prisma } from '@prisma/client'

// ---------------------------------------------------------------------------
// Minimal RFC 4180-compliant CSV serialiser
// ---------------------------------------------------------------------------

/** Escape a single field value per RFC 4180. */
function csvField(value: unknown): string {
  if (value === null || value === undefined) return ''

  const str = typeof value === 'object' ? JSON.stringify(value) : String(value)

  // Wrap in double-quotes if the value contains a comma, double-quote, or newline
  if (
    str.includes(',') ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r')
  ) {
    return `"${str.replace(/"/g, '""')}"`
  }

  return str
}

/** Serialise one array of values to a CSV row terminated with CRLF. */
function csvRow(fields: unknown[]): string {
  return fields.map(csvField).join(',') + '\r\n'
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

const CSV_HEADERS = [
  'timestamp',
  'actorName',
  'action',
  'entityType',
  'entityId',
  'locationName',
  'overrideReason',
  'before',
  'after',
]

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
  const locationId = searchParams.get('locationId')
  const start = searchParams.get('start')
  const end = searchParams.get('end')
  const action = searchParams.get('action')

  const where: Prisma.AuditLogWhereInput = {
    ...(locationId && { locationId }),
    ...(start &&
      end && { createdAt: { gte: new Date(start), lte: new Date(end) } }),
    ...(start && !end && { createdAt: { gte: new Date(start) } }),
    ...(!start && end && { createdAt: { lte: new Date(end) } }),
    ...(action && { action: action as Prisma.EnumAuditActionFilter }),
  }

  const logs = await db.auditLog.findMany({
    where,
    include: {
      actor: { select: { name: true } },
      location: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const lines: string[] = [csvRow(CSV_HEADERS)]

  for (const log of logs) {
    lines.push(
      csvRow([
        log.createdAt.toISOString(),
        log.actor.name,
        log.action,
        log.entityType,
        log.entityId,
        log.location.name,
        log.overrideReason ?? '',
        log.before !== null ? JSON.stringify(log.before) : '',
        log.after !== null ? JSON.stringify(log.after) : '',
      ]),
    )
  }

  const csv = lines.join('')
  const filename = `audit-log-${new Date().toISOString().split('T')[0]}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
