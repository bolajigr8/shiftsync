// =============================================================================
// ShiftSync — /admin/users  (Server Component)
// Renders the full users table server-side. Create User dialog is a client
// component embedded below.
// =============================================================================

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/prisma/db'
import Link from 'next/link'
import CreateUserDialog from '@/components/admin/createuserdialog'

const ROLE_STYLE: Record<string, string> = {
  ADMIN: 'badge-error',
  MANAGER: 'badge-info',
  STAFF: 'badge-muted',
}

const SKILL_LABELS: Record<string, string> = {
  BARTENDER: 'Bartender',
  LINE_COOK: 'Line Cook',
  SERVER: 'Server',
  HOST: 'Host',
}

export default async function UsersPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'ADMIN') redirect('/login')

  const users = await db.user.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      hourlyRate: true,
      desiredWeeklyHours: true,
      isActive: true,
      skills: { select: { skill: true } },
      staffLocations: {
        where: { isActive: true },
        select: { location: { select: { name: true } } },
      },
    },
  })

  return (
    <div className='animate-in'>
      <div className='page-header'>
        <div>
          <h1 className='page-title'>Users</h1>
          <p className='page-subtitle'>{users.length} accounts</p>
        </div>
        <CreateUserDialog />
      </div>

      <div className='ss-table-wrap'>
        <table className='ss-table'>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Skills</th>
              <th>Hourly Rate</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  <div style={{ fontWeight: 500 }}>{user.name}</div>
                  {user.staffLocations.length > 0 && (
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--ss-text-faint)',
                        marginTop: 2,
                      }}
                    >
                      {user.staffLocations
                        .map((sl) => sl.location.name)
                        .join(', ')}
                    </div>
                  )}
                </td>
                <td style={{ color: 'var(--ss-text-muted)' }}>{user.email}</td>
                <td>
                  <span
                    className={`badge ${ROLE_STYLE[user.role] ?? 'badge-muted'}`}
                  >
                    {user.role}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {user.skills.map((s) => (
                      <span
                        key={s.skill}
                        className='badge badge-accent'
                        style={{ fontSize: 11 }}
                      >
                        {SKILL_LABELS[s.skill] ?? s.skill}
                      </span>
                    ))}
                    {user.skills.length === 0 && (
                      <span style={{ color: 'var(--ss-text-faint)' }}>—</span>
                    )}
                  </div>
                </td>
                <td style={{ color: 'var(--ss-text-muted)' }}>
                  {user.hourlyRate
                    ? `$${Number(user.hourlyRate).toFixed(2)}/hr`
                    : '—'}
                </td>
                <td>
                  <span
                    className={`badge ${user.isActive ? 'badge-ok' : 'badge-muted'}`}
                  >
                    {user.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <Link
                    href={`/admin/users/${user.id}`}
                    className='btn btn-ghost btn-sm'
                  >
                    Edit →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
