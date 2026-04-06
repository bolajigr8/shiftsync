'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useNotifications } from '@/hooks/Usenotifications'

const TYPE_ICON: Record<string, string> = {
  SHIFT_ASSIGNED: '📋',
  SCHEDULE_PUBLISHED: '📅',
  SCHEDULE_UNPUBLISHED: '⚠️',
  SHIFT_CHANGED: '✏️',
  SWAP_REQUEST: '🔄',
  SWAP_ACCEPTED: '✅',
  SWAP_REJECTED: '❌',
  SWAP_CANCELLED: '↩️',
  SWAP_AUTO_CANCELLED: '⏱️',
  MANAGER_APPROVAL_NEEDED: '👔',
  OVERTIME_WARNING: '🚨',
  AVAILABILITY_CHANGED: '📆',
  COVERAGE_NEEDED: '📢',
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function getNavTarget(
  metadata: Record<string, string>,
  role: string,
): string | null {
  const base =
    role === 'STAFF' ? '/staff' : role === 'MANAGER' ? '/manager' : '/admin'
  if (metadata.swapId) return `${base}/swaps`
  if (metadata.shiftId) return role === 'STAFF' ? '/staff/schedule' : null
  return null
}

export function NotificationBell({
  userId,
  role,
}: {
  userId: string
  role: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const { notifications, unreadCount, markOneRead, markAllRead } =
    useNotifications(userId)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  async function handleNotifClick(
    id: string,
    metadata: Record<string, string>,
  ) {
    await markOneRead(id)
    setOpen(false)
    const target = getNavTarget(metadata, role)
    if (target) router.push(target)
  }

  const notifListRoute =
    role === 'STAFF'
      ? '/staff/notifications'
      : role === 'MANAGER'
        ? '/staff/notifications'
        : '/staff/notifications'

  return (
    <div style={{ position: 'relative' }} ref={wrapRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          position: 'relative',
          background: open ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
          border: 'none',
          cursor: 'pointer',
          padding: '5px 6px',
          borderRadius: 7,
          color: 'var(--ss-sidebar-text)',
          transition: 'background 0.15s',
          display: 'flex',
          alignItems: 'center',
        }}
        title='Notifications'
      >
        <svg
          width='16'
          height='16'
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          strokeWidth='2'
        >
          <path d='M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9' />
          <path d='M13.73 21a2 2 0 0 1-3.46 0' />
        </svg>
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: 15,
              height: 15,
              borderRadius: '50%',
              background: 'var(--ss-accent)',
              color: 'white',
              fontSize: 8,
              fontWeight: 700,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover — fixed position to the right of the 228px sidebar */}
      {open && (
        <div
          style={{
            position: 'fixed',
            left: 240, // sidebar is 228px wide + 12px gap
            bottom: 16, // align with footer area
            width: 340,
            background: 'white',
            borderRadius: 12,
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
            border: '1px solid var(--ss-border)',
            overflow: 'hidden',
            zIndex: 200,
            animation: 'fadeIn 0.15s ease both',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '14px 16px 10px',
              borderBottom: '1px solid var(--ss-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span
              style={{ fontWeight: 700, fontSize: 14, color: 'var(--ss-text)' }}
            >
              Notifications
              {unreadCount > 0 && (
                <span
                  style={{
                    marginLeft: 8,
                    padding: '1px 7px',
                    borderRadius: 100,
                    background: 'var(--ss-accent-light)',
                    color: 'var(--ss-accent)',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {unreadCount}
                </span>
              )}
            </span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  fontSize: 12,
                  color: 'var(--ss-accent)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 500,
                  fontFamily: 'inherit',
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div
                style={{
                  padding: '28px 16px',
                  textAlign: 'center',
                  color: 'var(--ss-text-faint)',
                  fontSize: 13.5,
                }}
              >
                No notifications yet
              </div>
            ) : (
              notifications.slice(0, 10).map((n, i) => (
                <div
                  key={n.id}
                  onClick={() => handleNotifClick(n.id, n.metadata)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '11px 16px',
                    borderBottom:
                      i < 9 && i < notifications.length - 1
                        ? '1px solid var(--ss-border)'
                        : 'none',
                    cursor: 'pointer',
                    background: n.isRead ? 'transparent' : '#fffbf7',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    ;(e.currentTarget as HTMLElement).style.background =
                      '#faf9f7'
                  }}
                  onMouseLeave={(e) => {
                    ;(e.currentTarget as HTMLElement).style.background =
                      n.isRead ? 'transparent' : '#fffbf7'
                  }}
                >
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      marginTop: 7,
                      flexShrink: 0,
                      background: n.isRead ? 'transparent' : 'var(--ss-accent)',
                    }}
                  />
                  <span style={{ fontSize: 15, flexShrink: 0 }}>
                    {TYPE_ICON[n.type] ?? '🔔'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        lineHeight: 1.45,
                        marginBottom: 2,
                        color: n.isRead
                          ? 'var(--ss-text-muted)'
                          : 'var(--ss-text)',
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical' as const,
                      }}
                    >
                      {n.message}
                    </div>
                    <div
                      style={{ fontSize: 11.5, color: 'var(--ss-text-faint)' }}
                    >
                      {timeAgo(n.createdAt)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '10px 16px',
              borderTop: '1px solid var(--ss-border)',
            }}
          >
            <button
              onClick={() => {
                setOpen(false)
                router.push(
                  role === 'STAFF'
                    ? '/staff/notifications'
                    : role === 'MANAGER'
                      ? '/manager/notifications'
                      : '/admin/notifications',
                )
              }}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: 8,
                border: '1px solid var(--ss-border)',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--ss-text-muted)',
                fontFamily: 'inherit',
              }}
            >
              View all notifications →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
