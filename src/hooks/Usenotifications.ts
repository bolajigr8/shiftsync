// =============================================================================
// ShiftSync — useNotifications
// Subscribes to the Supabase notifications:{userId} broadcast channel.
// Prepends incoming notifications to local state and increments unread count.
// =============================================================================

import { useEffect, useState, useCallback } from 'react'

export type AppNotification = {
  id: string
  type: string
  message: string
  metadata: Record<string, string>
  isRead: boolean
  createdAt: string
}

export function useNotifications(userId: string | undefined) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchNotifications = useCallback(async () => {
    if (!userId) return
    const res = await fetch('/api/notifications?limit=20')
    const data = await res.json()
    if (data.success) {
      setNotifications(data.data.notifications)
      setUnreadCount(data.data.unreadCount)
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  // Supabase realtime subscription
  useEffect(() => {
    if (!userId) return
    let channel: any

    import('@/lib/supabase').then(({ getBrowserSupabase }) => {
      const supabase = getBrowserSupabase()
      channel = supabase
        .channel(`notifications:${userId}`)
        .on('broadcast', { event: 'new_notification' }, ({ payload }: any) => {
          const notif: AppNotification = {
            id: payload.id,
            type: payload.type,
            message: payload.message,
            metadata: payload.metadata ?? {},
            isRead: false,
            createdAt: payload.createdAt ?? new Date().toISOString(),
          }
          setNotifications((prev) => [notif, ...prev].slice(0, 20))
          setUnreadCount((prev) => prev + 1)
        })
        .subscribe()
    })

    return () => {
      channel?.unsubscribe()
    }
  }, [userId])

  const markOneRead = useCallback(async (id: string) => {
    await fetch(`/api/notifications/${id}/read`, { method: 'PUT' })
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    )
    setUnreadCount((prev) => Math.max(0, prev - 1))
  }, [])

  const markAllRead = useCallback(async () => {
    await fetch('/api/notifications/read-all', { method: 'PUT' })
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
    setUnreadCount(0)
  }, [])

  return {
    notifications,
    unreadCount,
    loading,
    markOneRead,
    markAllRead,
    refetch: fetchNotifications,
  }
}
