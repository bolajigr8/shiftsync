import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Sidebar, type NavItem } from '@/components/sidebar'
import { ToastProvider } from '@/hooks/toast'
import '../shiftsync.css'
import { SessionProvider } from 'next-auth/react'
import { AuthProvider } from '@/components/client-provider'

const icon = (d: string) => (
  <svg
    width='16'
    height='16'
    viewBox='0 0 24 24'
    fill='none'
    stroke='currentColor'
    strokeWidth='2'
  >
    <path d={d} />
  </svg>
)

const NAV_ITEMS: NavItem[] = [
  {
    href: '/staff',
    exact: true,
    label: 'Home',
    icon: icon('M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10'),
  },
  {
    href: '/staff/schedule',
    label: 'My Schedule',
    icon: icon('M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'),
  },
  {
    href: '/staff/available-shifts',
    label: 'Available Shifts',
    icon: icon('M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z'),
  },
  {
    href: '/staff/availability',
    label: 'Availability',
    icon: icon(
      'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    ),
  },
  {
    href: '/staff/swaps',
    label: 'Swaps',
    icon: icon(
      'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
    ),
  },
  {
    href: '/staff/notifications',
    label: 'Notifications',
    icon: icon(
      'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0',
    ),
  },
  {
    href: '/staff/settings',
    label: 'Settings',
    icon: icon(
      'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
    ),
  },
]

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'STAFF') redirect('/login')

  return (
    <AuthProvider session={session}>
      <ToastProvider>
        <div className='ss-shell'>
          <Sidebar
            role='STAFF'
            userName={session.user.name ?? ''}
            userId={session.user.id}
            navItems={NAV_ITEMS}
          />
          <main className='ss-main'>
            <div className='ss-content'>{children}</div>
          </main>
        </div>
      </ToastProvider>
    </AuthProvider>
  )
}
