// =============================================================================
// ShiftSync — /admin  (Server Component)
// Shows on-duty status across all locations via embedded client cards.
// =============================================================================

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AdminLocationCards from '@/components/admin/adminlocationcards'

export default async function AdminDashboard() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'ADMIN') redirect('/login')

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
          <h1 className='page-title'>Operations Overview</h1>
          <p className='page-subtitle'>
            {now.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href='/admin/users' className='btn btn-secondary'>
            Manage Users
          </Link>
          <Link href='/admin/locations' className='btn btn-primary'>
            Locations
          </Link>
        </div>
      </div>

      {/* Live location cards — fetched client-side */}
      <AdminLocationCards />

      {/* Quick nav */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 14,
          marginTop: 24,
        }}
      >
        {[
          {
            href: '/admin/users',
            label: 'User Management',
            icon: '👥',
            desc: 'Add, edit, manage staff',
          },
          {
            href: '/admin/locations',
            label: 'Locations',
            icon: '📍',
            desc: 'Venues & timezone config',
          },
          {
            href: '/admin/audit',
            label: 'Audit Log',
            icon: '📋',
            desc: 'Full action trail + CSV',
          },
          {
            href: '/admin/email-log',
            label: 'Email Log',
            icon: '📧',
            desc: 'Simulated notifications',
          },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            style={{ textDecoration: 'none' }}
            className='card'
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
