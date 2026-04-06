import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Sidebar, type NavItem } from '@/components/sidebar'
import { ToastProvider } from '@/hooks/toast'
import '../shiftsync.css'
import { AuthProvider } from '@/components/client-provider'

export default async function ManagerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'MANAGER') redirect('/login')

  // Get the manager's first location for schedule link
  const firstLocation = session.user.locationIds[0] ?? null

  const NAV_ITEMS: NavItem[] = [
    {
      href: firstLocation
        ? `/manager/schedule/${firstLocation}`
        : '/manager/schedule',
      label: 'Schedule',
      icon: (
        <svg
          width='16'
          height='16'
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          strokeWidth='2'
        >
          <rect x='3' y='4' width='18' height='18' rx='2' ry='2' />
          <line x1='16' y1='2' x2='16' y2='6' />
          <line x1='8' y1='2' x2='8' y2='6' />
          <line x1='3' y1='10' x2='21' y2='10' />
        </svg>
      ),
    },
    {
      href: '/manager/swaps',
      label: 'Swap Requests',
      icon: (
        <svg
          width='16'
          height='16'
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          strokeWidth='2'
        >
          <polyline points='17 1 21 5 17 9' />
          <path d='M3 11V9a4 4 0 0 1 4-4h14' />
          <polyline points='7 23 3 19 7 15' />
          <path d='M21 13v2a4 4 0 0 1-4 4H3' />
        </svg>
      ),
    },
    {
      href: '/manager/compliance',
      label: 'Compliance',
      icon: (
        <svg
          width='16'
          height='16'
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          strokeWidth='2'
        >
          <path d='M9 11l3 3L22 4' />
          <path d='M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' />
        </svg>
      ),
    },
    {
      href: '/manager/on-duty',
      label: 'On Duty',
      icon: (
        <svg
          width='16'
          height='16'
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          strokeWidth='2'
        >
          <circle cx='12' cy='12' r='10' />
          <polyline points='12 6 12 12 16 14' />
        </svg>
      ),
    },
    {
      href: '/manager/analytics',
      label: 'Analytics',
      icon: (
        <svg
          width='16'
          height='16'
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          strokeWidth='2'
        >
          <line x1='18' y1='20' x2='18' y2='10' />
          <line x1='12' y1='20' x2='12' y2='4' />
          <line x1='6' y1='20' x2='6' y2='14' />
        </svg>
      ),
    },
  ]

  return (
    <AuthProvider session={session}>
      <ToastProvider>
        <div className='ss-shell'>
          <Sidebar
            role='MANAGER'
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
