// =============================================================================
// ShiftSync — Prisma client
//
// Uses the @prisma/adapter-pg driver adapter (Prisma v6+ recommended pattern).
// Key benefits over the legacy built-in Rust engine:
//
//   1. You control the pg.Pool — size, SSL, timeouts, all explicit.
//   2. Better pgBouncer / Supabase pooler compatibility.
//   3. Forward-compatible with Prisma v7 which deprecates the internal engine.
//
// Instantiation is intentionally lazy (Proxy) so importing this module at the
// top of many files does not open a DB connection until the first query is
// actually executed — important in serverless where cold starts are expensive.
// =============================================================================

import { Pool } from 'pg'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getDatabaseUrl } from './database-url'

// ---------------------------------------------------------------------------
// Singleton bookkeeping
// ---------------------------------------------------------------------------

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function createPrismaClient(): PrismaClient {
  const connectionString = getDatabaseUrl()

  if (!connectionString) {
    throw new Error(
      'No database connection string found.\n' +
        'Set one of: POSTGRES_PRISMA_URL, DATABASE_URL\n' +
        'See .env.local.template for details.',
    )
  }

  const pool = new Pool({
    connectionString,
    ...(process.env.NODE_ENV === 'production' && {
      ssl: { rejectUnauthorized: false },
    }),
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  })

  const adapter = new PrismaPg(pool)

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  })
}

// ---------------------------------------------------------------------------
// Lazy getter — creates the client on first access, caches globally in dev
// ---------------------------------------------------------------------------

function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient()
  }
  return globalForPrisma.prisma
}

// ---------------------------------------------------------------------------
// Exported singleton Proxy
// ---------------------------------------------------------------------------

export const db = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrismaClient()
    const value = Reflect.get(client as object, prop, receiver)
    return typeof value === 'function' ? value.bind(client) : value
  },
}) as PrismaClient
