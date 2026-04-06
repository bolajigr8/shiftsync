import type { Role } from '@prisma/client'
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      name: string
      email: string
      image?: string | null
      role: Role
      timezone: string
      locationIds: string[]
    } & DefaultSession['user']
  }

  interface User {
    id: string
    role: Role
    timezone: string
    locationIds: string[]
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: Role
    timezone: string
    locationIds: string[]
  }
}
