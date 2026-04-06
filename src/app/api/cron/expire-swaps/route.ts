// =============================================================================
// ShiftSync — POST /api/cron/expire-swaps
//
// Marks all PENDING DROP requests whose expiresAt has passed as EXPIRED.
// Intended to be called by a Vercel Cron Job or an external scheduler.
//
// Secured via an Authorization: Bearer <CRON_SECRET> header.
// If CRON_SECRET is not set the endpoint is open — set it in production.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { expireStaleDropRequests } from '@/lib/swaps'

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret) {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }
  }

  const expired = await expireStaleDropRequests()

  return NextResponse.json({
    success: true,
    data: {
      expired,
      message: `${expired} stale DROP request(s) marked as EXPIRED`,
    },
  })
}
