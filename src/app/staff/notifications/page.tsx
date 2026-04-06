'use client'

import { useNotifications } from '@/hooks/Usenotifications'
import { useSession } from 'next-auth/react'

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

export default function NotificationsPage() {
  const { data: session } = useSession()
  const { notifications, unreadCount, loading, markOneRead, markAllRead } =
    useNotifications(session?.user.id)

  return (
    <div className='animate-in'>
      <div className='page-header'>
        <div>
          <h1 className='page-title'>Notifications</h1>
          <p className='page-subtitle'>
            {unreadCount > 0 ? (
              <span style={{ color: 'var(--ss-accent)', fontWeight: 600 }}>
                {unreadCount} unread
              </span>
            ) : (
              'All caught up'
            )}
          </p>
        </div>
        {unreadCount > 0 && (
          <button className='btn btn-secondary' onClick={markAllRead}>
            Mark all as read
          </button>
        )}
      </div>

      {loading ? (
        <div className='loading-row'>Loading notifications…</div>
      ) : notifications.length === 0 ? (
        <div className='card'>
          <div className='empty-state'>
            <div className='empty-state-icon'>🔔</div>
            <div className='empty-state-title'>No notifications yet</div>
            <div className='empty-state-text'>
              Shift assignments, swap updates, and schedule changes will appear
              here.
            </div>
          </div>
        </div>
      ) : (
        <div className='card animate-in delay-1'>
          {notifications.map((n, i) => (
            <div
              key={n.id}
              onClick={() => {
                if (!n.isRead) markOneRead(n.id)
              }}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
                padding: '14px 20px',
                borderBottom:
                  i < notifications.length - 1
                    ? '1px solid var(--ss-border)'
                    : 'none',
                cursor: n.isRead ? 'default' : 'pointer',
                background: n.isRead ? 'transparent' : '#fffbf7',
                transition: 'background 0.2s',
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  flexShrink: 0,
                  marginTop: 6,
                  background: n.isRead ? 'transparent' : 'var(--ss-accent)',
                }}
              />
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#f5f3ef',
                  fontSize: 18,
                }}
              >
                {TYPE_ICON[n.type] ?? '🔔'}
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 4,
                    flexWrap: 'wrap',
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      padding: '2px 8px',
                      borderRadius: 100,
                      background: '#f5f3ef',
                      color: 'var(--ss-text-muted)',
                    }}
                  >
                    {n.type.replace(/_/g, ' ')}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--ss-text-faint)' }}>
                    {timeAgo(n.createdAt)}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 13.5,
                    color: n.isRead ? 'var(--ss-text-muted)' : 'var(--ss-text)',
                    lineHeight: 1.5,
                  }}
                >
                  {n.message}
                </div>
              </div>
              {!n.isRead && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    markOneRead(n.id)
                  }}
                  className='btn btn-ghost btn-sm'
                  style={{ flexShrink: 0, fontSize: 11.5 }}
                >
                  Mark read
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
