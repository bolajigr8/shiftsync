import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Environment variable validation
// ---------------------------------------------------------------------------

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}. ` +
        `Check your .env.local file.`,
    )
  }
  return value
}

// ---------------------------------------------------------------------------
// SERVER-SIDE CLIENT  (service role key — never expose to the browser)
//
// Use this in:
//   - Next.js API routes (src/app/api/**/route.ts)
//   - Server Actions
//   - Server Components that need to bypass Row Level Security
//
// This client has full database access. It must NEVER be imported from a
// client component or sent to the browser.
// ---------------------------------------------------------------------------

let _serverClient: SupabaseClient | null = null

export function getServerSupabase(): SupabaseClient {
  if (_serverClient) return _serverClient

  const url = requireEnv('SUPABASE_URL')
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

  _serverClient = createClient(url, serviceRoleKey, {
    auth: {
      // Disable auto-refresh and session persistence for server-side usage.
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })

  return _serverClient
}

// ---------------------------------------------------------------------------
// CLIENT-SIDE CLIENT  (anon key — safe to ship to the browser)
//
// Use this in:
//   - Client Components for real-time subscriptions
//   - Browser-side listeners for schedule change notifications
//
// This client respects Supabase Row Level Security policies.
// ---------------------------------------------------------------------------

let _browserClient: SupabaseClient | null = null

export function getBrowserSupabase(): SupabaseClient {
  if (_browserClient) return _browserClient

  // In Next.js, only NEXT_PUBLIC_* variables are exposed to the browser bundle.
  // We read them without requireEnv so this module is safe to import anywhere.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Ensure both are set in .env.local and prefixed with NEXT_PUBLIC_.',
    )
  }

  _browserClient = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  })

  return _browserClient
}
