import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth'

// Thin re-export so authOptions can live in src/lib without circular imports.
const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
