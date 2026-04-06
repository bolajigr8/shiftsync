// =============================================================================
// ShiftSync — Email simulation layer
//
// No real email is ever sent. Every outbound email is written to the EmailLog
// table for admin review at /admin/email-log. This keeps infrastructure simple
// on the free Supabase tier while giving the admin full visibility.
// =============================================================================

import { db } from '@/prisma/db'
import type { NotificationType } from '@prisma/client'

/**
 * Log a simulated outbound email to the EmailLog table.
 *
 * Never re-throws — a logging failure must never break the caller.
 */
export async function simulateEmail(
  toUserId: string,
  subject: string,
  body: string,
  notificationType: NotificationType,
): Promise<void> {
  try {
    const user = await db.user.findUnique({
      where: { id: toUserId },
      select: { email: true },
    })

    if (!user) {
      console.warn(
        `[Email] simulateEmail: user ${toUserId} not found — log skipped.`,
      )
      return
    }

    await db.emailLog.create({
      data: {
        toUserId,
        toEmail: user.email,
        subject,
        body,
        notificationType,
      },
    })
  } catch (error) {
    console.error('[Email] simulateEmail failed (non-fatal):', error)
  }
}
