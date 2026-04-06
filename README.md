# ShiftSync — Multi-Location Staff Scheduling Platform (Assessment)

ShiftSync is a staff scheduling platform built for Coastal Eats, a restaurant
group running four locations across two US timezones. It handles the full
cycle of shift management, creating and publishing schedules, assigning staff
with automatic constraint checks, managing swap requests through a multi-stage
approval flow, tracking overtime costs, and surfacing fairness analytics across
the team.

The constraint engine is the core of the system. Before any assignment goes
through, it checks eight rules in parallel: skill match, location certification,
availability (with daylight-saving-safe timezone handling), double-booking,
rest periods between shifts, daily hours, weekly hours, and consecutive days.
Failures come back as a structured list with alternative suggestions. Only the
seventh-consecutive-day rule is overridable, and only with a documented reason
that gets written permanently to the audit log.

---

## Tech Stack

| Layer           | Choice                                           |
| --------------- | ------------------------------------------------ |
| Framework       | Next.js 16 (App Router), TypeScript strict mode  |
| Styling         | TailwindCSS + shadcn/ui                          |
| Database        | PostgreSQL via Supabase                          |
| ORM             | Prisma v6 with @prisma/adapter-pg                |
| Auth            | NextAuth v4, CredentialsProvider, JWT sessions   |
| Realtime        | Supabase Realtime broadcast channels             |
| Date handling   | date-fns + date-fns-tz, all datetimes stored UTC |
| Charts          | recharts                                         |
| Validation      | Zod                                              |
| Package manager | pnpm                                             |

---

## Test Accounts

All accounts use the password **CoastalEats2024**

| Role    | Email                   | What it demonstrates                                 |
| ------- | ----------------------- | ---------------------------------------------------- |
| Admin   | admin@coastal.com       | Full system access, audit log, email log             |
| Manager | manager.nyc@coastal.com | NYC + Miami, full schedule builder                   |
| Manager | manager.la@coastal.com  | LA + Seattle, timezone scenario                      |
| Staff   | john@coastal.com        | Eastern availability against Pacific shifts          |
| Staff   | sarah@coastal.com       | 34h this week — next shift triggers overtime warning |
| Staff   | mike@coastal.com        | Active pending swap request                          |
| Staff   | maria@coastal.com       | Zero premium shifts — fairness score below 0.7       |
| Staff   | carlos@coastal.com      | Bartender, NYC + Miami                               |
| Staff   | priya@coastal.com       | Server, LA + Seattle                                 |
| Staff   | james@coastal.com       | Host, NYC + Miami                                    |
| Staff   | aisha@coastal.com       | Line Cook, LA + Seattle                              |

---

## Running Locally

```bash
git clone https://github.com/your-username/shiftsync.git
cd shiftsync
pnpm install
cp .env.example .env.local
# Fill in all values — see Environment Variables below
pnpm dlx prisma db push
pnpm dlx prisma db seed
pnpm dev
```

Open `http://localhost:3000`. The login page is the entry point for all roles.

### Environment Variables

```env
DATABASE_URL=          # Supabase pooled connection (Transaction mode)
DIRECT_URL=            # Supabase direct connection (for migrations)
SUPABASE_URL=          # Project URL from Supabase API settings
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=   # Keep secret — server only
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXTAUTH_SECRET=       # Generate with: openssl rand -base64 32
NEXTAUTH_URL=          # http://localhost:3000 locally
CRON_SECRET=           # Generate with: openssl rand -base64 32
```

---

## Design Decisions

**Availability stored in local HH:mm, not UTC.**
Recurring availability like "Monday 9 AM – 5 PM" is stored as plain time
strings in the staff member's own timezone rather than converting to UTC.
Converting would cause the times to drift when daylight saving changes —
a 9 AM Eastern slot would silently shift to 8 AM UTC in summer and 9 AM
in winter. The constraint engine converts the shift's UTC start time into
the staff member's personal timezone before comparing against their
availability window.

**Only the seventh-consecutive-day rule is overridable.**
Labour law has documented exceptions for the seven-day rule, managers
occasionally need to schedule someone across a full week during peak
periods. The other seven constraints (skill, certification, double-booking,
rest period, daily hours, weekly hours) have no legitimate exceptions in
this context and are treated as hard failures. When a manager overrides
the consecutive-day check they must provide a written reason which is
stored permanently in the audit log under OVERRIDE_7TH_DAY.

**Two-stage swap approval.**
A swap goes through Staff B accepting first, then manager approval.
When Staff B accepts, all eight constraints run for them, not just skill.
This catches cases where Staff B would be double-booked, under-rested,
or over their weekly hours if the swap went through. The original
assignment stays active throughout the process so neither party is left
uncovered if the swap falls apart.

**JWT carries location access, no database hit on auth.**
Location IDs are baked into the JWT at sign-in time. Every API route
checks the session's locationIds against the requested locationId without
touching the database. The trade-off is that if a manager is assigned to
a new location, they need to sign out and back in for it to take effect.
For an internal tool with infrequent location changes this is acceptable
and keeps every authenticated request free of extra queries.

**isPremium is automatic, not manual.**
Shifts starting on Friday or Saturday after 17:00 in the location's own
timezone are automatically marked premium. Managers cannot override this.
The fairness analytics engine uses this flag to calculate equity scores,
whether premium shifts are distributed proportionally to total hours worked.
Maria's seed account is set up with zero premium assignments while
colleagues have three or more, producing a score well below the 0.7
threshold that triggers a flag.

---

## Known Limitations

- No real email delivery. All notification emails are written to the
  EmailLog table. View them at /admin/email-log.
- Password reset requires admin intervention — no self-service reset flow.
- The hourly cron job that expires stale swap requests requires Vercel Pro.
  On the free Hobby plan, swap expiry runs lazily when the swaps endpoint
  is called instead of on a schedule.
- JWT location IDs require a re-login after new location assignments.
- The schedule grid is designed for screens 900px and wider.
