'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { NotificationBell } from './Notificationbell'

export type NavItem = {
  href: string
  label: string
  icon: React.ReactNode
  exact?: boolean
}

type SidebarProps = {
  role: 'ADMIN' | 'MANAGER' | 'STAFF'
  userName: string
  userId: string
  navItems: NavItem[]
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrator',
  MANAGER: 'Manager',
  STAFF: 'Staff',
}

const ROLE_DOT_COLOR: Record<string, string> = {
  ADMIN: 'bg-amber-400',
  MANAGER: 'bg-sky-400',
  STAFF: 'bg-emerald-400',
}

export function Sidebar({ role, userName, userId, navItems }: SidebarProps) {
  const pathname = usePathname()

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href
    return pathname === href || pathname.startsWith(href + '/')
  }

  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <aside className='shiftsync-sidebar'>
      {/* Brand */}
      <div className='sidebar-brand'>
        <div className='brand-mark'>
          <svg width='22' height='22' viewBox='0 0 22 22' fill='none'>
            <rect width='22' height='22' rx='6' fill='#EA580C' />
            <path
              d='M6 16V8.5L11 6L16 8.5V16'
              stroke='white'
              strokeWidth='1.8'
              strokeLinejoin='round'
            />
            <path
              d='M8.5 16v-4.5h5V16'
              stroke='white'
              strokeWidth='1.8'
              strokeLinejoin='round'
            />
          </svg>
        </div>
        <div>
          <div className='brand-name'>ShiftSync</div>
          <div className='brand-sub'>Coastal Eats</div>
        </div>
      </div>

      {/* Nav */}
      <nav className='sidebar-nav'>
        <div className='nav-section-label'>Navigation</div>
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item ${isActive(item.href, item.exact) ? 'nav-item-active' : ''}`}
          >
            <span className='nav-icon'>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* User footer */}
      <div className='sidebar-footer'>
        <div className='user-card'>
          <div className='user-avatar'>{initials}</div>
          <div className='user-info' style={{ flex: 1, minWidth: 0 }}>
            <div className='user-name'>{userName}</div>
            <div className='user-role-row'>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  flexShrink: 0,
                  display: 'inline-block',
                  background:
                    role === 'ADMIN'
                      ? '#fbbf24'
                      : role === 'MANAGER'
                        ? '#38bdf8'
                        : '#34d399',
                }}
              />
              <span className='user-role'>{ROLE_LABELS[role]}</span>
            </div>
          </div>
          {/* Notification bell in footer */}
          <NotificationBell userId={userId} role={role} />
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className='sign-out-btn'
        >
          <svg
            width='14'
            height='14'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
          >
            <path d='M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' />
            <polyline points='16 17 21 12 16 7' />
            <line x1='21' y1='12' x2='9' y2='12' />
          </svg>
          Sign out
        </button>
      </div>
    </aside>
  )
}
