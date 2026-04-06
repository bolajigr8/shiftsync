import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import type { Role } from '@prisma/client'
import { db } from '@/prisma/db'

export const authOptions: NextAuthOptions = {
  // JWT sessions avoid a DB round-trip on every request. locationIds are
  // baked into the token at sign-in time so middleware stays Edge-compatible.
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours — reasonable upper bound for a shift day
  },

  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },

      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        try {
          const user = await db.user.findUnique({
            where: { email: credentials.email.toLowerCase().trim() },
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              timezone: true,
              passwordHash: true,
              isActive: true,
            },
          })

          // Return null for BOTH "not found" and "wrong password" to avoid
          // revealing which field was incorrect.
          if (!user || !user.isActive) return null

          const passwordValid = await bcrypt.compare(
            credentials.password,
            user.passwordHash,
          )
          if (!passwordValid) return null

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            timezone: user.timezone,
            locationIds: [], // populated in the jwt callback below
          }
        } catch (error) {
          console.error('[Auth] authorize error:', error)
          return null
        }
      },
    }),
  ],

  callbacks: {
    // The jwt callback runs once on sign-in (user is present) and on every
    // subsequent request to re-hydrate the token. We do the DB work only on
    // the initial sign-in pass to keep subsequent requests fast.
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role as Role
        token.timezone = user.timezone

        try {
          if (token.role === 'ADMIN') {
            // Admins see all active locations.
            const locations = await db.location.findMany({
              where: { isActive: true },
              select: { id: true },
            })
            token.locationIds = locations.map((l) => l.id)
          } else if (token.role === 'MANAGER') {
            const rows = await db.managerLocation.findMany({
              where: { userId: user.id },
              select: { locationId: true },
            })
            token.locationIds = rows.map((r) => r.locationId)
          } else {
            // STAFF — only active certifications count.
            const rows = await db.staffLocation.findMany({
              where: { userId: user.id, isActive: true },
              select: { locationId: true },
            })
            token.locationIds = rows.map((r) => r.locationId)
          }
        } catch (error) {
          console.error('[Auth] jwt: failed to load locationIds:', error)
          token.locationIds = []
        }
      }

      return token
    },

    async session({ session, token }) {
      session.user.id = token.id
      session.user.role = token.role
      session.user.timezone = token.timezone
      session.user.locationIds = token.locationIds ?? []
      return session
    },
  },

  pages: {
    signIn: '/login',
    error: '/login', // Surface NextAuth errors through the login page
  },

  secret: process.env.NEXTAUTH_SECRET,
}
