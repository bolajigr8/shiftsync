import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function ManagerRootPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user) redirect('/login')
  if (session.user.role !== 'MANAGER' && session.user.role !== 'ADMIN')
    redirect('/login')

  // Redirect to the schedule for the manager's first location
  const firstLocationId = session.user.locationIds[0]
  if (firstLocationId) {
    redirect(`/manager/schedule/${firstLocationId}`)
  }

  // No locations assigned yet
  return (
    <div className='animate-in'>
      <div className='page-header'>
        <h1 className='page-title'>Schedule</h1>
      </div>
      <div className='card'>
        <div className='empty-state'>
          <div className='empty-state-icon'>📍</div>
          <div className='empty-state-title'>No locations assigned</div>
          <div className='empty-state-text'>
            Ask an administrator to assign you to a location before you can
            manage schedules.
          </div>
        </div>
      </div>
    </div>
  )
}
