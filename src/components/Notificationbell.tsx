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

function getNavTarget(metadata: Record<string, string>): string | null {
  if (metadata.shiftId) return `/staff/schedule`
  if (metadata.swapId) return `/staff/swaps`
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
  const popoverRef = useRef<HTMLDivElement>(null)
  const { notifications, unreadCount, markOneRead, markAllRead } =
    useNotifications(userId)

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
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
    const target = getNavTarget(metadata)
    if (target) router.push(target)
  }

  const notifListRoute =
    role === 'STAFF'
      ? '/staff/notifications'
      : role === 'MANAGER'
        ? '/manager/notifications'
        : '/admin/notifications'

  return (
    <div style={{ position: 'relative' }} ref={popoverRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          position: 'relative',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '6px',
          borderRadius: 8,
          color: 'var(--ss-sidebar-text)',
          transition: 'color 0.15s, background 0.15s',
        }}
        title='Notifications'
      >
        <svg
          width='18'
          height='18'
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
              top: 2,
              right: 2,
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: 'var(--ss-accent)',
              color: 'white',
              fontSize: 9,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover */}
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 340,
            background: 'white',
            borderRadius: 12,
            boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
            border: '1px solid var(--ss-border)',
            overflow: 'hidden',
            zIndex: 50,
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
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              Notifications{' '}
              {unreadCount > 0 && (
                <span
                  style={{
                    marginLeft: 6,
                    padding: '1px 7px',
                    borderRadius: 100,
                    background: 'var(--ss-accent-light)',
                    color: 'var(--ss-accent)',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {unreadCount} new
                </span>
              )}
            </div>
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
                  padding: '24px 16px',
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
                      i < notifications.length - 1
                        ? '1px solid var(--ss-border)'
                        : 'none',
                    cursor: 'pointer',
                    background: n.isRead ? 'transparent' : '#fffbf7',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = '#faf9f7')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = n.isRead
                      ? 'transparent'
                      : '#fffbf7')
                  }
                >
                  {/* Dot */}
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      marginTop: 6,
                      flexShrink: 0,
                      background: n.isRead ? 'transparent' : 'var(--ss-accent)',
                    }}
                  />
                  {/* Icon */}
                  <span style={{ fontSize: 16, flexShrink: 0 }}>
                    {TYPE_ICON[n.type] ?? '🔔'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: n.isRead
                          ? 'var(--ss-text-muted)'
                          : 'var(--ss-text)',
                        lineHeight: 1.45,
                        marginBottom: 3,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical' as any,
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
                router.push(notifListRoute)
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
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = 'var(--ss-bg)')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = 'transparent')
              }
            >
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
