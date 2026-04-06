'use client'

import { useState } from 'react'
import { signIn, getSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import type { Role } from '@prisma/client'

const ROLE_REDIRECTS: Record<Role, string> = {
  ADMIN: '/admin',
  MANAGER: '/manager',
  STAFF: '/staff',
}

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const result = await signIn('credentials', {
        email: email.toLowerCase().trim(),
        password,
        redirect: false,
      })

      if (!result?.ok || result.error) {
        setError('Invalid email or password. Please try again.')
        return
      }

      // Fetch the now-active session to read the role for routing.
      const session = await getSession()
      const role = session?.user?.role as Role | undefined

      if (role && ROLE_REDIRECTS[role]) {
        router.push(ROLE_REDIRECTS[role])
        router.refresh()
      } else {
        setError(
          'Your account role is not configured. Contact your administrator.',
        )
      }
    } catch {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className='flex min-h-screen items-center justify-center bg-gray-50 px-4'>
      <Card className='w-full max-w-md shadow-lg'>
        <CardHeader className='space-y-1 text-center'>
          <CardTitle className='text-2xl font-bold tracking-tight'>
            ShiftSync
          </CardTitle>
          <CardDescription>
            Sign in to manage and view your schedule
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='email'>Email address</Label>
              <Input
                id='email'
                type='email'
                placeholder='you@coastaleats.com'
                autoComplete='email'
                required
                disabled={isLoading}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className='space-y-2'>
              <Label htmlFor='password'>Password</Label>
              <Input
                id='password'
                type='password'
                placeholder='••••••••'
                autoComplete='current-password'
                required
                disabled={isLoading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <p
                role='alert'
                className='rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'
              >
                {error}
              </p>
            )}

            <Button
              type='submit'
              className='w-full'
              disabled={isLoading || !email || !password}
            >
              {isLoading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
