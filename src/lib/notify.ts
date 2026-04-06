import { getServerSupabase } from '@/lib/supabase'
import { simulateEmail } from '@/lib/email'
import type { NotificationType } from '@prisma/client'
import type { NotificationPrefs } from '@/types/index'
import { db } from '@/prisma/db'

// ---------------------------------------------------------------------------
// Email subject map
// ---------------------------------------------------------------------------

const EMAIL_SUBJECTS: Record<NotificationType, string> = {
  SHIFT_ASSIGNED: 'ShiftSync — You have been assigned to a shift',
  SCHEDULE_PUBLISHED: 'ShiftSync — The schedule has been published',
  SCHEDULE_UNPUBLISHED: 'ShiftSync — A schedule has been unpublished',
  SHIFT_CHANGED: 'ShiftSync — A shift you are assigned to has changed',
  SWAP_REQUEST: 'ShiftSync — You have a new shift swap request',
  SWAP_ACCEPTED: 'ShiftSync — Your swap request was accepted',
  SWAP_REJECTED: 'ShiftSync — Your swap request was rejected',
  SWAP_CANCELLED: 'ShiftSync — A swap request has been cancelled',
  SWAP_AUTO_CANCELLED: 'ShiftSync — A swap request was automatically cancelled',
  MANAGER_APPROVAL_NEEDED: 'ShiftSync — Your approval is required',
  OVERTIME_WARNING: 'ShiftSync — Overtime threshold approaching',
  AVAILABILITY_CHANGED: 'ShiftSync — Staff availability has changed',
  COVERAGE_NEEDED: 'ShiftSync — Coverage is needed for a shift',
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Create an in-app notification, broadcast it over Supabase Realtime, and
 * optionally simulate an email based on the user's notificationPrefs.
 */
export async function createNotification(
  userId: string,
  type: NotificationType,
  message: string,
  metadata: Record<string, string> = {},
): Promise<void> {
  // 1 — Write to DB (always happens, regardless of what follows).
  const notification = await db.notification.create({
    data: { userId, type, message, metadata },
    include: {
      user: { select: { notificationPrefs: true } },
    },
  })

  // 2 — Broadcast to the user's realtime channel (best-effort).
  try {
    const supabase = getServerSupabase()
    await supabase.channel(`notifications:${userId}`).send({
      type: 'broadcast',
      event: 'new_notification',
      payload: {
        id: notification.id,
        type,
        message,
        metadata,
        createdAt: notification.createdAt.toISOString(),
      },
    })
  } catch (error) {
    console.error(
      `[Notify] Realtime broadcast failed for user ${userId} (non-fatal):`,
      error,
    )
  }

  // 3 — Simulate email if the user's prefs enable it for this type.
  try {
    const prefs = notification.user.notificationPrefs as NotificationPrefs
    if (prefs?.[type]?.email) {
      await simulateEmail(
        userId,
        EMAIL_SUBJECTS[type] ?? 'ShiftSync — Notification',
        message,
        type,
      )
    }
  } catch (error) {
    console.error(`[Notify] simulateEmail failed for user ${userId}:`, error)
  }
}

// ---------------------------------------------------------------------------
// Bulk helpers
// ---------------------------------------------------------------------------

/**
 * Notify every ASSIGNED or CONFIRMED staff member on a given shift.
 */
export async function notifyAssignedStaff(
  shiftId: string,
  type: NotificationType,
  message: string,
): Promise<void> {
  const assignments = await db.shiftAssignment.findMany({
    where: {
      shiftId,
      status: { in: ['ASSIGNED', 'CONFIRMED'] },
    },
    select: { userId: true },
  })

  await Promise.all(
    assignments.map((a) => createNotification(a.userId, type, message)),
  )
}

/**
 * Notify every manager responsible for a given location.
 */
export async function notifyLocationManagers(
  locationId: string,
  type: NotificationType,
  message: string,
): Promise<void> {
  const managers = await db.managerLocation.findMany({
    where: { locationId },
    select: { userId: true },
  })

  await Promise.all(
    managers.map((m) => createNotification(m.userId, type, message)),
  )
}
