# ShiftSync

A multi-location staff scheduling application for the **Coastal Eats** restaurant group. Built with Next.js 16, TypeScript, Prisma, Supabase Realtime, and NextAuth — covering the full lifecycle of shift management, swap requests, availability, constraint enforcement, overtime tracking, and fairness analytics.

---

## Live Demo

**`https://shiftsync-coastal.vercel.app`** _(replace with your deployed URL)_

---

## Technology Stack

| Layer      | Choice                    | Notes                                        |
| ---------- | ------------------------- | -------------------------------------------- |
| Framework  | Next.js 16 (App Router)   | `src/` directory, server + client components |
| Language   | TypeScript (strict mode)  | All files typed end-to-end                   |
| Styling    | Custom CSS design system  | `src/app/shiftsync.css`                      |
| Database   | PostgreSQL (Supabase)     | Free tier                                    |
| ORM        | Prisma v6                 | `@prisma/adapter-pg` driver adapter          |
| Auth       | NextAuth v4               | CredentialsProvider + JWT, 8h sessions       |
| Realtime   | Supabase Realtime         | Broadcast for schedule + notifications       |
| Validation | Zod                       | All API routes and forms                     |
| Date/time  | date-fns + date-fns-tz v3 | All datetimes stored UTC                     |
| Charts     | recharts                  | Analytics fairness page                      |

---

## Test Accounts

Password for all accounts: **`CoastalEats2024`**

| Role    | Email                     | Scenario                                          |
| ------- | ------------------------- | ------------------------------------------------- |
| ADMIN   | `admin@coastal.com`       | Full system access                                |
| MANAGER | `manager.nyc@coastal.com` | NYC + Miami manager                               |
| MANAGER | `manager.la@coastal.com`  | LA + Seattle manager                              |
| STAFF   | `john@coastal.com`        | Timezone tangle — Eastern availability, LA shifts |
| STAFF   | `sarah@coastal.com`       | Overtime warning — 34h this week                  |
| STAFF   | `mike@coastal.com`        | Active PENDING swap request targeting John        |
| STAFF   | `maria@coastal.com`       | Fairness flag — 0 premium shifts                  |
| STAFF   | `carlos@coastal.com`      | Bartender, NYC + Miami                            |
| STAFF   | `priya@coastal.com`       | Server, LA + Seattle                              |
| STAFF   | `james@coastal.com`       | Host, NYC + Miami                                 |
| STAFF   | `aisha@coastal.com`       | Line Cook, LA + Seattle                           |

---

## Local Development

```bash
git clone https://github.com/your-org/shiftsync.git
cd shiftsync
npm install
cp .env.example .env.local   # fill in all values
npx prisma db push
npx prisma db seed
npm run dev
# open http://localhost:3000
```

### Environment Variables

```env
DATABASE_URL=
DIRECT_URL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
CRON_SECRET=
```

---

## Design Decisions

**1. Availability timezone storage.** Availability times are stored as plain `HH:mm` strings in the staff member's own local timezone, not UTC. A "9 AM Monday" availability means 9 AM in their time regardless of DST. The constraint engine converts the shift start into the staff member's timezone before comparing — demonstrated by John Torres certified at both NYC (ET) and LA (PT).

**2. Consecutive-day override scope.** Only the 7th-consecutive-day check is overridable. All other hard failures (skill, certification, double-booking, rest period, daily/weekly hours) are absolute. The 7th-day rule has documented exceptions in labour law; overrides are audit-logged with a mandatory reason.

**3. Swap approval architecture.** DROP requests have no pre-selected recipient at creation. The manager chooses the `pickupUserId` at approval time. SWAP requests require the target to accept first (all 8 constraints re-run for Staff B), then escalate to manager approval — a two-stage gate.

**4. JWT-only sessions with zero DB hits.** All session data is encoded in the JWT once at sign-in. `locationIds` reflects the user's assignments at that moment. Newly assigned locations require sign-out/sign-in to take effect — accepted trade-off for zero-latency auth.

**5. isPremium auto-classification.** Shifts starting Friday or Saturday after 17:00 in the location's timezone are automatically `isPremium = true`. The fairness analytics engine uses this to calculate equity scores; below 0.7 is flagged. Maria's seed data demonstrates this gap deliberately.

---

## Known Limitations

- No real email sending — see `/admin/email-log` for simulated notifications
- Password reset requires admin user edit or direct DB access
- JWT `locationIds` staleness on new location assignments requires re-login
- `GET /api/assignments?userId=` not yet implemented — staff schedule page uses swap data as fallback
- Compliance page day-by-day hours breakdown requires a dedicated per-day query endpoint
- Schedule grid not optimised for screens under 900px wide

---

## Evaluation Scenarios

**1. Overtime Warning** — Log in as `manager.nyc@coastal.com`. Open the NYC schedule. Assign any shift to Sarah Kim. The what-if preview shows her at 34h + new shift hours, triggering the orange overtime warning.

**2. Timezone Tangle** — Log in as `manager.la@coastal.com`. Create an LA shift Monday 10:00–18:00 PT. Try to assign John Torres. The availability check converts his Eastern 09:00–17:00 to 06:00–14:00 PT and flags the conflict.

**3. Fairness Analytics** — Log in as `manager.nyc@coastal.com`. Go to Analytics → New York City. Maria Reyes shows a fairness score below 0.7 (red flag). Carlos and John are above 1.0 (over-allocated premium shifts).

**4. Swap Lifecycle** — Log in as `mike@coastal.com`, check Swaps. Log in as `john@coastal.com`, accept the incoming request (all 8 constraints run for John). Log in as `manager.nyc@coastal.com`, approve the swap — Mike's assignment cancelled, John assigned.

**5. Understaffed Publish** — Log in as `manager.nyc@coastal.com`. Click Publish Week. The Saturday Server shift (headcount 3, only 2 assigned) appears in the confirmation warning before proceeding.

**6. 7th Day Override** — Visit `/admin/audit` as admin, filter by `OVERRIDE_7TH_DAY`. The demonstration row shows Mike's documented override reason. Live: assign Mike to a 7th consecutive day shift — the constraint engine returns a hard block requiring an `overrideReason` field (min 10 chars).

## Where to Find Simulated Emails

All notification emails are stored and viewable at **`/admin/email-log`** (ADMIN role required). No real emails are sent.

---

## Deployment to Vercel

```bash
# 1. Push code
git push origin main

# 2. Deploy
npx vercel --prod

# 3. Set all environment variables in Vercel Dashboard
#    Project → Settings → Environment Variables

# 4. Seed production database
#    (with DATABASE_URL pointing to production)
npx prisma db push
npx prisma db seed

# 5. Verify cron job at Vercel Dashboard → Cron Jobs
#    /api/cron/expire-swaps runs hourly
```

---

## Prompt 6 Complete — Final Implementation Checklist

1. `npm install recharts` (if not already in package.json)
2. Paste all files at their exact paths (see project structure in handoff docs)
3. Run `npx tsc --noEmit` — fix any type errors
4. Run `npx prisma db push && npx prisma db seed`
5. Confirm seed credentials table prints in terminal
6. Verify login page at `http://localhost:3000/login`
7. Verify all six evaluation scenarios manually:
   - [ ] Overtime warning appears for Sarah
   - [ ] Timezone constraint fires for John at LA
   - [ ] Fairness flag on Maria in analytics
   - [ ] Full swap lifecycle completes (pending → accepted → approved)
   - [ ] Understaffed publish warning dialog appears
   - [ ] OVERRIDE_7TH_DAY row visible in audit log
8. Verify schedule builder specifically:
   - [ ] Click empty day area opens create shift dialog
   - [ ] Overnight indicator shows when end < start time
   - [ ] Shift card click opens right-side assignment sheet
   - [ ] Staff preview modal shows hours + cost
   - [ ] Constraint failure panel shows red reasons + suggestion chips
   - [ ] Overtime sidebar updates after assignment
   - [ ] Realtime: two windows, assign in one, other refreshes
9. Deploy: `npx vercel --prod`
10. Seed production: `npx prisma db seed`
11. Submit live URL
