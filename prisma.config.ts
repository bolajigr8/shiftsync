// =============================================================================
// prisma.config.ts  — Prisma v6+ external configuration
//
// This file is the authoritative source for Prisma CLI behaviour (migrations,
// db push, studio, seed). It runs in Node.js directly — NOT through Next.js —
// so we load .env.local manually with dotenv before reading any env vars.
//
// Why this file instead of schema.prisma datasource url = env("...")?
//   - We can run logic (priority chain, URL sanitisation) that the static
//     schema.prisma DSL does not support.
//   - The schema stays clean with no env var names baked in.
//   - Works across Vercel Postgres and Supabase without env var renaming.
// =============================================================================

import path from 'node:path'
import dotenv from 'dotenv'
import { defineConfig } from 'prisma/config'
import { getDirectDatabaseUrl } from './src/prisma/database-url'

// Load .env.local so env vars are available when the Prisma CLI runs outside
// of Next.js (which normally handles this automatically).
dotenv.config({ path: path.join(__dirname, '.env.local') })

const directUrl = getDirectDatabaseUrl()

export default defineConfig({
  // Point the CLI at the schema file explicitly so this config works regardless
  // of where the CLI is invoked from.
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),

  // Override the datasource URL with the resolved direct (non-pooled) URL.
  // Migrations must use a direct connection — pgBouncer does not support the
  // advisory locks that `prisma migrate` depends on.
  ...(directUrl
    ? {
        datasource: {
          url: directUrl,
        },
      }
    : {}),

  migrations: {
    // Run with: pnpm prisma migrate dev (automatically calls seed after migrate)
    // Or manually: pnpm dlx prisma db seed
    seed: 'pnpm tsx prisma/seed.ts',
  },
})
