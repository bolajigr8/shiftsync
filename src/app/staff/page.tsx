'use client'

import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

type Swap = {
  id: string
  status: string
  requester?: { id: string; name?: string }
  assignment: { shift: { startTime: string; location: { name: string } } }
}

export default function StaffDashboard() {
  const { data: session } = useSession()
  const [swaps, setSwaps] = useState<Swap[]>([])

  useEffect(() => {
    fetch('/api/swaps')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setSwaps(d.data)
      })
  }, [])

  const activeSwaps = swaps.filter(
    (s) =>
      s.requester?.id === session?.user.id &&
      ['PENDING', 'ACCEPTED', 'PENDING_APPROVAL'].includes(s.status),
  )

  const now = new Date()
  const greeting =
    now.getHours() < 12
      ? 'Good morning'
      : now.getHours() < 17
        ? 'Good afternoon'
        : 'Good evening'

  return (
    <div className='animate-in'>
      <div className='page-header'>
        <div>
          <p
            style={{
              fontSize: 13,
              color: 'var(--ss-text-muted)',
              marginBottom: 4,
            }}
          >
            {greeting}
          </p>
          <h1 className='page-title'>
            {session?.user.name?.split(' ')[0] ?? 'Welcome'}
          </h1>
          <p className='page-subtitle'>
            {now.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
      </div>

      <div className='stat-grid'>
        <div className='stat-card animate-in'>
          <div className='stat-label'>Active Swap Requests</div>
          <div className='stat-value'>
            {activeSwaps.length}
            <span style={{ fontSize: 14, color: 'var(--ss-text-faint)' }}>
              /3
            </span>
          </div>
          <div className='stat-meta'>max allowed at once</div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
          gap: 14,
          marginTop: 8,
        }}
      >
        {[
          {
            href: '/staff/schedule',
            label: 'My Schedule',
            icon: '📅',
            desc: 'View & confirm upcoming shifts',
          },
          {
            href: '/staff/available-shifts',
            label: 'Available Shifts',
            icon: '🔍',
            desc: 'Pick up open or dropped shifts',
          },
          {
            href: '/staff/availability',
            label: 'Availability',
            icon: '🗓️',
            desc: 'Set your weekly schedule',
          },
          {
            href: '/staff/swaps',
            label: 'Swap Requests',
            icon: '🔄',
            desc: `${activeSwaps.length} active request${activeSwaps.length !== 1 ? 's' : ''}`,
          },
          {
            href: '/staff/notifications',
            label: 'Notifications',
            icon: '🔔',
            desc: 'Shifts, swaps, schedule updates',
          },
          {
            href: '/staff/settings',
            label: 'Settings',
            icon: '⚙️',
            desc: 'Timezone, preferences, password',
          },
        ].map((item, i) => (
          <Link
            key={item.href}
            href={item.href}
            style={{ textDecoration: 'none' }}
            className={`card animate-in delay-${i % 4}`}
          >
            <div
              className='card-body'
              style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}
            >
              <span style={{ fontSize: 22 }}>{item.icon}</span>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ss-text-muted)' }}>
                  {item.desc}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
