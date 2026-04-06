import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import type { Role } from '@prisma/client'

const ROLE_REDIRECTS: Record<Role, string> = {
  ADMIN: '/admin',
  MANAGER: '/manager',
  STAFF: '/staff',
}

export default async function RootPage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  const destination = ROLE_REDIRECTS[session.user.role as Role]
  redirect(destination ?? '/login')
}
