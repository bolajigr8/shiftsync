// =============================================================================
// Database URL resolution
//
// Resolves the correct connection string across deployment targets without
// requiring env var renaming per platform:
//
//   Vercel Postgres  → injects POSTGRES_URL_NON_POOLING / POSTGRES_PRISMA_URL
//   Supabase         → uses DIRECT_URL / DATABASE_URL
//   Generic Postgres → DATABASE_URL
//
// The pooling vs. non-pooling distinction matters:
//   - Migrations & introspection need a DIRECT (non-pooled) connection because
//     pgBouncer (used by Supabase and Vercel Postgres poolers) does not support
//     the advisory locks that Prisma migrate relies on.
//   - Runtime queries use the pooled URL for connection efficiency in serverless.
//
// We keep two separate exported functions so callers can be explicit about
// which they need, but in practice the adapter-based PrismaClient always uses
// getDatabaseUrl() and migrations are handled by prisma.config.ts.
// =============================================================================

/** Return the first non-empty string from the argument list. */
function firstDefined(
  ...values: Array<string | undefined>
): string | undefined {
  return values.find((v) => v && v.trim().length > 0)
}

/**
 * Strip SSL query params that can cause certificate verification failures with
 * Supabase / Vercel Postgres poolers in certain Node.js versions.
 * We handle SSL explicitly via the `pg.Pool` options instead.
 */
function stripSslParams(url: string): string {
  try {
    const parsed = new URL(url)
    for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) {
      parsed.searchParams.delete(key)
    }
    return parsed.toString()
  } catch {
    // Not a valid URL — return as-is and let pg throw a useful error.
    return url
  }
}

/**
 * Pooled connection URL — used at runtime for all application queries.
 *
 * Priority:
 *   1. POSTGRES_PRISMA_URL       (Vercel Postgres pooled)
 *   2. DATABASE_URL              (Supabase pooled / generic)
 */
export function getDatabaseUrl(): string | undefined {
  const raw = firstDefined(
    process.env.POSTGRES_PRISMA_URL,
    process.env.DATABASE_URL,
  )
  return raw ? stripSslParams(raw) : undefined
}

/**
 * Direct (non-pooled) connection URL — used by Prisma CLI for migrations.
 * Should NOT be used at application runtime; pass this only to prisma.config.ts.
 *
 * Priority:
 *   1. POSTGRES_URL_NON_POOLING  (Vercel Postgres direct)
 *   2. DIRECT_URL                (Supabase direct)
 *   3. POSTGRES_PRISMA_URL       (Vercel pooled — fallback if no direct available)
 *   4. DATABASE_URL              (last resort)
 */
export function getDirectDatabaseUrl(): string | undefined {
  const raw = firstDefined(
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.DIRECT_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.DATABASE_URL,
  )
  return raw ? stripSslParams(raw) : undefined
}
