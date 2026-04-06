// =============================================================================
// ShiftSync — prisma/seed.ts
//
// Run with: npx prisma db seed
//
// Creates all test data in strict FK-safe order using upsert throughout so
// the seed can be re-run multiple times without errors.
//
// Password for every account: CoastalEats2024
// =============================================================================

import { db } from '@/prisma/db'
import bcrypt from 'bcryptjs'
import { fromZonedTime } from 'date-fns-tz'

// ── Helpers ──────────────────────────────────────────────────────────────────

async function hash(plain: string) {
  return bcrypt.hash(plain, 12)
}

/** Convert a local wall-clock time string to a UTC Date using date-fns-tz. */
function localToUTC(dateStr: string, timeStr: string, tz: string): Date {
  return fromZonedTime(`${dateStr}T${timeStr}:00`, tz)
}

/** Get the Monday of the current week (UTC) */
function getThisMonday(): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() - day + (day === 0 ? -6 : 1))
  return d
}

/** Add days to a date */
function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setUTCDate(r.getUTCDate() + n)
  return r
}

/** Format a Date as YYYY-MM-DD */
function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Starting ShiftSync seed...\n')

  const PASSWORD = await hash('CoastalEats2024')
  const monday = getThisMonday()

  // ── 1. Locations ────────────────────────────────────────────────────────────

  const [nyc, miami, la, seattle] = await Promise.all([
    db.location.upsert({
      where: { id: 'loc_nyc' },
      create: {
        id: 'loc_nyc',
        name: 'New York City',
        timezone: 'America/New_York',
        editCutoffHours: 48,
        address: '123 Broadway, New York, NY 10007',
      },
      update: {
        name: 'New York City',
        timezone: 'America/New_York',
        editCutoffHours: 48,
      },
    }),
    db.location.upsert({
      where: { id: 'loc_miami' },
      create: {
        id: 'loc_miami',
        name: 'Miami',
        timezone: 'America/New_York',
        editCutoffHours: 48,
        address: '456 Ocean Drive, Miami, FL 33139',
      },
      update: {
        name: 'Miami',
        timezone: 'America/New_York',
        editCutoffHours: 48,
      },
    }),
    db.location.upsert({
      where: { id: 'loc_la' },
      create: {
        id: 'loc_la',
        name: 'Los Angeles',
        timezone: 'America/Los_Angeles',
        editCutoffHours: 48,
        address: '789 Sunset Blvd, Los Angeles, CA 90028',
      },
      update: {
        name: 'Los Angeles',
        timezone: 'America/Los_Angeles',
        editCutoffHours: 48,
      },
    }),
    db.location.upsert({
      where: { id: 'loc_seattle' },
      create: {
        id: 'loc_seattle',
        name: 'Seattle',
        timezone: 'America/Los_Angeles',
        editCutoffHours: 24,
        address: '321 Pike Place, Seattle, WA 98101',
      },
      update: {
        name: 'Seattle',
        timezone: 'America/Los_Angeles',
        editCutoffHours: 24,
      },
    }),
  ])

  console.log('✅ Locations created: NYC, Miami, LA, Seattle')

  // ── 2. Users ─────────────────────────────────────────────────────────────────

  // Admin
  const admin = await db.user.upsert({
    where: { email: 'admin@coastal.com' },
    create: {
      email: 'admin@coastal.com',
      passwordHash: PASSWORD,
      name: 'Alex Admin',
      role: 'ADMIN',
      timezone: 'America/New_York',
      desiredWeeklyHours: 40,
    },
    update: { passwordHash: PASSWORD, name: 'Alex Admin', role: 'ADMIN' },
  })

  // Managers
  const managerNYC = await db.user.upsert({
    where: { email: 'manager.nyc@coastal.com' },
    create: {
      email: 'manager.nyc@coastal.com',
      passwordHash: PASSWORD,
      name: 'Morgan NYC',
      role: 'MANAGER',
      timezone: 'America/New_York',
      desiredWeeklyHours: 40,
    },
    update: { passwordHash: PASSWORD, name: 'Morgan NYC', role: 'MANAGER' },
  })

  const managerLA = await db.user.upsert({
    where: { email: 'manager.la@coastal.com' },
    create: {
      email: 'manager.la@coastal.com',
      passwordHash: PASSWORD,
      name: 'Morgan LA',
      role: 'MANAGER',
      timezone: 'America/Los_Angeles',
      desiredWeeklyHours: 40,
    },
    update: { passwordHash: PASSWORD, name: 'Morgan LA', role: 'MANAGER' },
  })

  console.log('✅ Managers created')

  // Manager locations
  await db.managerLocation.upsert({
    where: { userId_locationId: { userId: managerNYC.id, locationId: nyc.id } },
    create: { userId: managerNYC.id, locationId: nyc.id },
    update: {},
  })
  await db.managerLocation.upsert({
    where: {
      userId_locationId: { userId: managerNYC.id, locationId: miami.id },
    },
    create: { userId: managerNYC.id, locationId: miami.id },
    update: {},
  })
  await db.managerLocation.upsert({
    where: { userId_locationId: { userId: managerLA.id, locationId: la.id } },
    create: { userId: managerLA.id, locationId: la.id },
    update: {},
  })
  await db.managerLocation.upsert({
    where: {
      userId_locationId: { userId: managerLA.id, locationId: seattle.id },
    },
    create: { userId: managerLA.id, locationId: seattle.id },
    update: {},
  })

  // ── Staff accounts ──────────────────────────────────────────────────────────

  // SCENARIO: John — timezone tangle. Eastern availability, also certified at LA (Pacific).
  const john = await db.user.upsert({
    where: { email: 'john@coastal.com' },
    create: {
      email: 'john@coastal.com',
      passwordHash: PASSWORD,
      name: 'John Torres',
      role: 'STAFF',
      timezone: 'America/New_York',
      hourlyRate: 18,
      desiredWeeklyHours: 40,
    },
    update: { passwordHash: PASSWORD, name: 'John Torres', hourlyRate: 18 },
  })

  // SCENARIO: Sarah — 34h this week, next shift triggers overtime warning
  const sarah = await db.user.upsert({
    where: { email: 'sarah@coastal.com' },
    create: {
      email: 'sarah@coastal.com',
      passwordHash: PASSWORD,
      name: 'Sarah Kim',
      role: 'STAFF',
      timezone: 'America/New_York',
      hourlyRate: 14,
      desiredWeeklyHours: 35,
    },
    update: { passwordHash: PASSWORD, name: 'Sarah Kim', hourlyRate: 14 },
  })

  // SCENARIO: Mike — has an active PENDING SWAP request
  const mike = await db.user.upsert({
    where: { email: 'mike@coastal.com' },
    create: {
      email: 'mike@coastal.com',
      passwordHash: PASSWORD,
      name: 'Mike Chen',
      role: 'STAFF',
      timezone: 'America/New_York',
      hourlyRate: 16,
      desiredWeeklyHours: 32,
    },
    update: { passwordHash: PASSWORD, name: 'Mike Chen', hourlyRate: 16 },
  })

  // SCENARIO: Maria — BARTENDER with zero premium shifts (fairness flag)
  const maria = await db.user.upsert({
    where: { email: 'maria@coastal.com' },
    create: {
      email: 'maria@coastal.com',
      passwordHash: PASSWORD,
      name: 'Maria Reyes',
      role: 'STAFF',
      timezone: 'America/New_York',
      hourlyRate: 18,
      desiredWeeklyHours: 40,
    },
    update: { passwordHash: PASSWORD, name: 'Maria Reyes', hourlyRate: 18 },
  })

  // Additional staff — variety of skills + locations
  const carlos = await db.user.upsert({
    where: { email: 'carlos@coastal.com' },
    create: {
      email: 'carlos@coastal.com',
      passwordHash: PASSWORD,
      name: 'Carlos Mendez',
      role: 'STAFF',
      timezone: 'America/New_York',
      hourlyRate: 18,
      desiredWeeklyHours: 40,
    },
    update: { passwordHash: PASSWORD, name: 'Carlos Mendez', hourlyRate: 18 },
  })

  const priya = await db.user.upsert({
    where: { email: 'priya@coastal.com' },
    create: {
      email: 'priya@coastal.com',
      passwordHash: PASSWORD,
      name: 'Priya Patel',
      role: 'STAFF',
      timezone: 'America/Los_Angeles',
      hourlyRate: 14,
      desiredWeeklyHours: 30,
    },
    update: { passwordHash: PASSWORD, name: 'Priya Patel', hourlyRate: 14 },
  })

  const james = await db.user.upsert({
    where: { email: 'james@coastal.com' },
    create: {
      email: 'james@coastal.com',
      passwordHash: PASSWORD,
      name: 'James Liu',
      role: 'STAFF',
      timezone: 'America/New_York',
      hourlyRate: 13,
      desiredWeeklyHours: 25,
    },
    update: { passwordHash: PASSWORD, name: 'James Liu', hourlyRate: 13 },
  })

  const aisha = await db.user.upsert({
    where: { email: 'aisha@coastal.com' },
    create: {
      email: 'aisha@coastal.com',
      passwordHash: PASSWORD,
      name: 'Aisha Johnson',
      role: 'STAFF',
      timezone: 'America/Los_Angeles',
      hourlyRate: 16,
      desiredWeeklyHours: 35,
    },
    update: { passwordHash: PASSWORD, name: 'Aisha Johnson', hourlyRate: 16 },
  })

  console.log('✅ Staff accounts created (8 total)')

  // ── 3. Skills ───────────────────────────────────────────────────────────────

  const skillData = [
    { userId: john.id, skill: 'BARTENDER' as const },
    { userId: sarah.id, skill: 'SERVER' as const },
    { userId: mike.id, skill: 'LINE_COOK' as const },
    { userId: maria.id, skill: 'BARTENDER' as const },
    { userId: carlos.id, skill: 'BARTENDER' as const },
    { userId: priya.id, skill: 'SERVER' as const },
    { userId: james.id, skill: 'HOST' as const },
    { userId: aisha.id, skill: 'LINE_COOK' as const },
  ]

  for (const s of skillData) {
    await db.staffSkill.upsert({
      where: { userId_skill: { userId: s.userId, skill: s.skill } },
      create: s,
      update: {},
    })
  }

  console.log('✅ Skills assigned')

  // ── 4. Location Certifications ───────────────────────────────────────────────

  const certData = [
    // John: NYC + LA (timezone tangle scenario)
    { userId: john.id, locationId: nyc.id },
    { userId: john.id, locationId: la.id },
    // Sarah: NYC only
    { userId: sarah.id, locationId: nyc.id },
    // Mike: NYC
    { userId: mike.id, locationId: nyc.id },
    // Maria: NYC
    { userId: maria.id, locationId: nyc.id },
    // Carlos: NYC + Miami
    { userId: carlos.id, locationId: nyc.id },
    { userId: carlos.id, locationId: miami.id },
    // Priya: LA + Seattle
    { userId: priya.id, locationId: la.id },
    { userId: priya.id, locationId: seattle.id },
    // James: NYC + Miami
    { userId: james.id, locationId: nyc.id },
    { userId: james.id, locationId: miami.id },
    // Aisha: LA + Seattle
    { userId: aisha.id, locationId: la.id },
    { userId: aisha.id, locationId: seattle.id },
  ]

  for (const c of certData) {
    await db.staffLocation.upsert({
      where: {
        userId_locationId: { userId: c.userId, locationId: c.locationId },
      },
      create: { ...c, isActive: true },
      update: { isActive: true },
    })
  }

  console.log('✅ Location certifications set')

  // ── 5. Recurring Availability ─────────────────────────────────────────────────

  // John: available all 7 days 09:00–17:00 in Eastern time
  // This creates the timezone tangle scenario — his Eastern availability
  // must be cross-checked against Pacific-timezone LA shifts.
  for (let dow = 0; dow <= 6; dow++) {
    const existing = await db.availability.findFirst({
      where: { userId: john.id, type: 'RECURRING', dayOfWeek: dow },
    })
    if (!existing) {
      await db.availability.create({
        data: {
          userId: john.id,
          type: 'RECURRING',
          dayOfWeek: dow,
          isAvailable: true,
          startTime: '09:00',
          endTime: '17:00',
        },
      })
    }
  }

  // Sarah: Mon–Fri only
  for (let dow = 1; dow <= 5; dow++) {
    const existing = await db.availability.findFirst({
      where: { userId: sarah.id, type: 'RECURRING', dayOfWeek: dow },
    })
    if (!existing) {
      await db.availability.create({
        data: {
          userId: sarah.id,
          type: 'RECURRING',
          dayOfWeek: dow,
          isAvailable: true,
          startTime: '10:00',
          endTime: '22:00',
        },
      })
    }
  }

  console.log('✅ Recurring availability set')

  // ── 6. NYC Published Week Schedule ──────────────────────────────────────────
  // Full week Mon–Sun, various shifts demonstrating all evaluation scenarios.

  const nycShifts: Array<{
    id: string
    dow: number // 0=Sun, 1=Mon, …
    startHH: string // local NYC time
    endHH: string
    skill: 'BARTENDER' | 'SERVER' | 'LINE_COOK' | 'HOST'
    headcount: number
    isPremium?: boolean
    overnight?: boolean
  }> = [
    // Mon
    {
      id: 'sh_nyc_mon_1',
      dow: 1,
      startHH: '09:00',
      endHH: '17:00',
      skill: 'SERVER',
      headcount: 2,
    },
    {
      id: 'sh_nyc_mon_2',
      dow: 1,
      startHH: '11:00',
      endHH: '19:00',
      skill: 'LINE_COOK',
      headcount: 1,
    },
    {
      id: 'sh_nyc_mon_3',
      dow: 1,
      startHH: '17:00',
      endHH: '23:00',
      skill: 'BARTENDER',
      headcount: 1,
    },
    // Tue
    {
      id: 'sh_nyc_tue_1',
      dow: 2,
      startHH: '09:00',
      endHH: '17:00',
      skill: 'SERVER',
      headcount: 2,
    },
    {
      id: 'sh_nyc_tue_2',
      dow: 2,
      startHH: '12:00',
      endHH: '20:00',
      skill: 'LINE_COOK',
      headcount: 1,
    },
    // Wed
    {
      id: 'sh_nyc_wed_1',
      dow: 3,
      startHH: '09:00',
      endHH: '17:00',
      skill: 'HOST',
      headcount: 1,
    },
    {
      id: 'sh_nyc_wed_2',
      dow: 3,
      startHH: '17:00',
      endHH: '23:00',
      skill: 'BARTENDER',
      headcount: 2,
    },
    // Thu
    {
      id: 'sh_nyc_thu_1',
      dow: 4,
      startHH: '09:00',
      endHH: '17:00',
      skill: 'SERVER',
      headcount: 2,
    },
    {
      id: 'sh_nyc_thu_2',
      dow: 4,
      startHH: '14:00',
      endHH: '22:00',
      skill: 'LINE_COOK',
      headcount: 1,
    },
    // Fri — PREMIUM (Fri/Sat after 17:00 in location timezone)
    {
      id: 'sh_nyc_fri_1',
      dow: 5,
      startHH: '09:00',
      endHH: '17:00',
      skill: 'SERVER',
      headcount: 2,
    },
    {
      id: 'sh_nyc_fri_2',
      dow: 5,
      startHH: '17:00',
      endHH: '23:00',
      skill: 'BARTENDER',
      headcount: 2,
      isPremium: true,
    },
    // Fri overnight — starts 23:00 local, ends 07:00 next day (Saturday UTC+1 day)
    {
      id: 'sh_nyc_fri_3',
      dow: 5,
      startHH: '23:00',
      endHH: '07:00',
      skill: 'LINE_COOK',
      headcount: 1,
      isPremium: false,
      overnight: true,
    },
    // Sat — PREMIUM
    {
      id: 'sh_nyc_sat_1',
      dow: 6,
      startHH: '10:00',
      endHH: '18:00',
      skill: 'SERVER',
      headcount: 3,
      isPremium: false,
    }, // headcount 3, only 2 assigned — understaffed scenario
    {
      id: 'sh_nyc_sat_2',
      dow: 6,
      startHH: '18:00',
      endHH: '02:00',
      skill: 'BARTENDER',
      headcount: 2,
      isPremium: true,
      overnight: true,
    },
    // Sun
    {
      id: 'sh_nyc_sun_1',
      dow: 0,
      startHH: '10:00',
      endHH: '18:00',
      skill: 'SERVER',
      headcount: 1,
    },
  ]

  // Weekday for the coming week: monday = getThisMonday()
  // dow 0 = Sunday at end of week = monday + 6
  function shiftDate(dow: number): Date {
    if (dow === 0) return addDays(monday, 6) // Sunday is end of week
    return addDays(monday, dow - 1) // Mon=+0, Tue=+1, …, Sat=+5
  }

  for (const s of nycShifts) {
    const date = shiftDate(s.dow)
    const dateStr = toDateStr(date)
    const startUTC = localToUTC(dateStr, s.startHH, 'America/New_York')
    let endUTC: Date
    if (s.overnight) {
      const nextDay = addDays(date, 1)
      endUTC = localToUTC(toDateStr(nextDay), s.endHH, 'America/New_York')
    } else {
      endUTC = localToUTC(dateStr, s.endHH, 'America/New_York')
    }

    await db.shift.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        locationId: nyc.id,
        requiredSkill: s.skill,
        startTime: startUTC,
        endTime: endUTC,
        headcountNeeded: s.headcount,
        status: 'PUBLISHED',
        isPremium: s.isPremium ?? false,
        publishedAt: new Date(),
        createdBy: managerNYC.id,
      },
      update: {
        startTime: startUTC,
        endTime: endUTC,
        headcountNeeded: s.headcount,
        status: 'PUBLISHED',
        isPremium: s.isPremium ?? false,
      },
    })
  }

  console.log('✅ NYC published shifts created')

  // ── 7. ShiftAssignments — NYC ─────────────────────────────────────────────

  // Sarah scenario: needs to hit 34h so next shift triggers overtime warning.
  // We assign her to Mon(8h)+Tue(8h)+Wed(6h)+Thu(8h)+Fri(4h) = 34h exactly.

  const assignData: Array<{
    id: string
    shiftId: string
    userId: string
    status: 'ASSIGNED' | 'CONFIRMED'
  }> = [
    // Mon server — Sarah + John (but John is also at LA to create timezone tangle)
    {
      id: 'asgn_mon1_sarah',
      shiftId: 'sh_nyc_mon_1',
      userId: sarah.id,
      status: 'CONFIRMED',
    },
    {
      id: 'asgn_mon1_james',
      shiftId: 'sh_nyc_mon_1',
      userId: james.id,
      status: 'CONFIRMED',
    },
    // Mon line cook — Mike
    {
      id: 'asgn_mon2_mike',
      shiftId: 'sh_nyc_mon_2',
      userId: mike.id,
      status: 'CONFIRMED',
    },
    // Mon bartender — Carlos (premium-eligible Bartender, gets this non-premium shift)
    {
      id: 'asgn_mon3_carlos',
      shiftId: 'sh_nyc_mon_3',
      userId: carlos.id,
      status: 'CONFIRMED',
    },

    // Tue server — Sarah + James
    {
      id: 'asgn_tue1_sarah',
      shiftId: 'sh_nyc_tue_1',
      userId: sarah.id,
      status: 'CONFIRMED',
    },
    {
      id: 'asgn_tue1_james',
      shiftId: 'sh_nyc_tue_1',
      userId: james.id,
      status: 'CONFIRMED',
    },
    // Tue line cook — Mike (consecutive day 2)
    {
      id: 'asgn_tue2_mike',
      shiftId: 'sh_nyc_tue_2',
      userId: mike.id,
      status: 'CONFIRMED',
    },

    // Wed host — James
    {
      id: 'asgn_wed1_james',
      shiftId: 'sh_nyc_wed_1',
      userId: james.id,
      status: 'CONFIRMED',
    },
    // Wed bartender — Carlos + Maria (Maria gets NON-premium shift again)
    {
      id: 'asgn_wed2_carlos',
      shiftId: 'sh_nyc_wed_2',
      userId: carlos.id,
      status: 'CONFIRMED',
    },
    {
      id: 'asgn_wed2_maria',
      shiftId: 'sh_nyc_wed_2',
      userId: maria.id,
      status: 'CONFIRMED',
    },

    // Thu server — Sarah + James (Sarah day 4 = 32h cumulative before Fri)
    {
      id: 'asgn_thu1_sarah',
      shiftId: 'sh_nyc_thu_1',
      userId: sarah.id,
      status: 'CONFIRMED',
    },
    {
      id: 'asgn_thu1_james',
      shiftId: 'sh_nyc_thu_1',
      userId: james.id,
      status: 'CONFIRMED',
    },
    // Thu line cook — Mike (consecutive day 4)
    {
      id: 'asgn_thu2_mike',
      shiftId: 'sh_nyc_thu_2',
      userId: mike.id,
      status: 'CONFIRMED',
    },

    // Fri day server — Sarah (now at 34h, next assignment will trigger overtime)
    {
      id: 'asgn_fri1_sarah',
      shiftId: 'sh_nyc_fri_1',
      userId: sarah.id,
      status: 'CONFIRMED',
    },

    // Fri PREMIUM bartender — Carlos + John (NOT Maria — fairness gap)
    {
      id: 'asgn_fri2_carlos',
      shiftId: 'sh_nyc_fri_2',
      userId: carlos.id,
      status: 'CONFIRMED',
    },
    {
      id: 'asgn_fri2_john',
      shiftId: 'sh_nyc_fri_2',
      userId: john.id,
      status: 'CONFIRMED',
    },

    // Fri overnight line cook — Mike (consecutive day 5)
    {
      id: 'asgn_fri3_mike',
      shiftId: 'sh_nyc_fri_3',
      userId: mike.id,
      status: 'CONFIRMED',
    },

    // Sat server — only 2 assigned, headcount=3 → UNDERSTAFFED scenario
    {
      id: 'asgn_sat1_james',
      shiftId: 'sh_nyc_sat_1',
      userId: james.id,
      status: 'CONFIRMED',
    },
    {
      id: 'asgn_sat1_sarah',
      shiftId: 'sh_nyc_sat_1',
      userId: sarah.id,
      status: 'ASSIGNED',
    },
    // (deliberately leaving 1 slot open)

    // Sat PREMIUM bartender — Carlos + John again (Maria still 0 premium)
    {
      id: 'asgn_sat2_carlos',
      shiftId: 'sh_nyc_sat_2',
      userId: carlos.id,
      status: 'CONFIRMED',
    },
    {
      id: 'asgn_sat2_john',
      shiftId: 'sh_nyc_sat_2',
      userId: john.id,
      status: 'CONFIRMED',
    },

    // Sun server — Maria (non-premium — she still has 0 premium shifts)
    {
      id: 'asgn_sun1_maria',
      shiftId: 'sh_nyc_sun_1',
      userId: maria.id,
      status: 'ASSIGNED',
    },
  ]

  for (const a of assignData) {
    await db.shiftAssignment.upsert({
      where: { id: a.id },
      create: {
        id: a.id,
        shiftId: a.shiftId,
        userId: a.userId,
        assignedBy: managerNYC.id,
        status: a.status,
      },
      update: { status: a.status },
    })
  }

  console.log('✅ NYC shift assignments created')

  // ── 8. LA Draft Shifts (same week) ──────────────────────────────────────────

  const laDraftShifts = [
    {
      id: 'sh_la_mon_1',
      dow: 1,
      startHH: '10:00',
      endHH: '18:00',
      skill: 'BARTENDER' as const,
      headcount: 1,
    },
    {
      id: 'sh_la_wed_1',
      dow: 3,
      startHH: '10:00',
      endHH: '18:00',
      skill: 'LINE_COOK' as const,
      headcount: 1,
    },
    {
      id: 'sh_la_fri_1',
      dow: 5,
      startHH: '18:00',
      endHH: '02:00',
      skill: 'BARTENDER' as const,
      headcount: 1,
      isPremium: true,
      overnight: true,
    },
    {
      id: 'sh_la_sat_1',
      dow: 6,
      startHH: '18:00',
      endHH: '02:00',
      skill: 'LINE_COOK' as const,
      headcount: 1,
      isPremium: true,
      overnight: true,
    },
  ]

  for (const s of laDraftShifts) {
    const date = shiftDate(s.dow)
    const dateStr = toDateStr(date)
    const startUTC = localToUTC(dateStr, s.startHH, 'America/Los_Angeles')
    let endUTC: Date
    if (s.overnight) {
      endUTC = localToUTC(
        toDateStr(addDays(date, 1)),
        s.endHH,
        'America/Los_Angeles',
      )
    } else {
      endUTC = localToUTC(dateStr, s.endHH, 'America/Los_Angeles')
    }

    await db.shift.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        locationId: la.id,
        requiredSkill: s.skill,
        startTime: startUTC,
        endTime: endUTC,
        headcountNeeded: s.headcount,
        status: 'DRAFT',
        isPremium: s.isPremium ?? false,
        createdBy: managerLA.id,
      },
      update: { startTime: startUTC, endTime: endUTC, status: 'DRAFT' },
    })
  }

  console.log('✅ LA draft shifts created')

  // ── 9. Mike's PENDING Swap Request ───────────────────────────────────────────

  // Mike wants to swap his Tue line cook shift with John
  // Compute expiresAt = shift startTime - 24 hours, using the actual persisted shift
  const mikeShift = await db.shift.findUnique({
    where: { id: 'sh_nyc_tue_2' },
    select: { startTime: true },
  })
  const swapExpiresAt = mikeShift
    ? new Date(mikeShift.startTime.getTime() - 24 * 60 * 60 * 1000)
    : addDays(shiftDate(2), -1)

  const mikeSwap = await db.swapRequest.upsert({
    where: { id: 'swap_mike_john' },
    create: {
      id: 'swap_mike_john',
      assignmentId: 'asgn_tue2_mike',
      requesterId: mike.id,
      targetUserId: john.id,
      type: 'SWAP',
      status: 'PENDING',
      expiresAt: swapExpiresAt,
    },
    update: { status: 'PENDING' },
  })

  console.log("✅ Mike's swap request created")

  // ── 10. Audit log — OVERRIDE_7TH_DAY demonstration row ────────────────────

  await db.auditLog.upsert({
    where: { id: 'audit_override_demo' },
    create: {
      id: 'audit_override_demo',
      actorId: managerNYC.id,
      action: 'OVERRIDE_7TH_DAY',
      entityType: 'ShiftAssignment',
      entityId: 'asgn_fri3_mike',
      locationId: nyc.id,
      overrideReason:
        'Mike volunteered for 7th consecutive day. Emergency coverage for Friday overnight due to staff illness. Written consent obtained.',
      before: { consecutiveDays: 6 },
      after: { consecutiveDays: 7, overrideApplied: true },
    },
    update: {
      overrideReason:
        'Mike volunteered for 7th consecutive day. Emergency coverage for Friday overnight due to staff illness. Written consent obtained.',
    },
  })

  console.log('✅ Audit override demonstration row created')

  // ── 11. Simulated EmailLog entries ───────────────────────────────────────────

  const emailsToCreate = [
    {
      id: 'email_sarah_assigned',
      toUserId: sarah.id,
      toEmail: 'sarah@coastal.com',
      subject: 'ShiftSync — You have been assigned to a shift',
      body: 'Hi Sarah, you have been assigned to a shift at New York City on Monday. Please confirm your attendance.',
      notificationType: 'SHIFT_ASSIGNED',
    },
    {
      id: 'email_john_swap',
      toUserId: john.id,
      toEmail: 'john@coastal.com',
      subject: 'ShiftSync — You have a new shift swap request',
      body: 'Hi John, Mike Chen has requested to swap a Tuesday Line Cook shift with you. Please log in to accept or decline.',
      notificationType: 'SWAP_REQUEST',
    },
    {
      id: 'email_manager_approval',
      toUserId: managerNYC.id,
      toEmail: 'manager.nyc@coastal.com',
      subject: 'ShiftSync — Your approval is required',
      body: 'A shift swap between staff members requires your approval. Please log in to the manager portal to review.',
      notificationType: 'MANAGER_APPROVAL_NEEDED',
    },
  ]

  for (const e of emailsToCreate) {
    await db.emailLog.upsert({
      where: { id: e.id },
      create: e,
      update: { subject: e.subject, body: e.body },
    })
  }

  console.log('✅ Sample email log entries created')

  // ── 12. Credentials Table ─────────────────────────────────────────────────

  console.log('\n' + '═'.repeat(80))
  console.log('  ShiftSync Test Credentials (password: CoastalEats2024)')
  console.log('═'.repeat(80))
  console.log('')

  const creds = [
    {
      role: 'ADMIN',
      email: 'admin@coastal.com',
      scenario: 'Full system access',
    },
    {
      role: 'MANAGER',
      email: 'manager.nyc@coastal.com',
      scenario: 'NYC + Miami manager',
    },
    {
      role: 'MANAGER',
      email: 'manager.la@coastal.com',
      scenario: 'LA + Seattle manager',
    },
    {
      role: 'STAFF',
      email: 'john@coastal.com',
      scenario: 'Timezone tangle (Eastern availability, LA shifts)',
    },
    {
      role: 'STAFF',
      email: 'sarah@coastal.com',
      scenario: 'Overtime warning trigger (34h this week)',
    },
    {
      role: 'STAFF',
      email: 'mike@coastal.com',
      scenario: 'Active PENDING swap request',
    },
    {
      role: 'STAFF',
      email: 'maria@coastal.com',
      scenario: 'Fairness flag (0 premium shifts)',
    },
    {
      role: 'STAFF',
      email: 'carlos@coastal.com',
      scenario: 'Bartender, NYC + Miami',
    },
    {
      role: 'STAFF',
      email: 'priya@coastal.com',
      scenario: 'Server, LA + Seattle',
    },
    {
      role: 'STAFF',
      email: 'james@coastal.com',
      scenario: 'Host, NYC + Miami',
    },
    {
      role: 'STAFF',
      email: 'aisha@coastal.com',
      scenario: 'Line Cook, LA + Seattle',
    },
  ]

  const colW = [10, 32, 48]
  const header = ['ROLE', 'EMAIL', 'SCENARIO']
  console.log('  ' + header.map((h, i) => h.padEnd(colW[i])).join(' │ '))
  console.log('  ' + colW.map((w) => '─'.repeat(w)).join('─┼─'))
  for (const c of creds) {
    console.log(
      '  ' +
        [c.role, c.email, c.scenario]
          .map((v, i) => v.padEnd(colW[i]))
          .join(' │ '),
    )
  }

  console.log('')
  console.log('  Locations seeded:')
  console.log(
    '    • New York City   (America/New_York,      cutoff 48h) — published schedule',
  )
  console.log('    • Miami           (America/New_York,      cutoff 48h)')
  console.log(
    '    • Los Angeles     (America/Los_Angeles,   cutoff 48h) — draft shifts only',
  )
  console.log(
    '    • Seattle         (America/Los_Angeles,   cutoff 24h) — shorter cutoff demo',
  )
  console.log('')
  console.log('  Evaluation scenarios ready:')
  console.log(
    '    1. Overtime warning   → assign any shift to sarah@coastal.com',
  )
  console.log(
    '    2. Timezone tangle    → john@coastal.com certified at both NYC (ET) and LA (PT)',
  )
  console.log(
    '    3. Fairness flag      → maria@coastal.com has 0 premium shifts this period',
  )
  console.log(
    '    4. Swap lifecycle     → mike@coastal.com has PENDING swap targeting john',
  )
  console.log(
    '    5. Understaffed shift → Sat Server shift has headcount 3, only 2 assigned',
  )
  console.log(
    '    6. 7th day override   → see Audit Log at /admin/audit for demonstration row',
  )
  console.log(
    '    7. Simulated emails   → visit /admin/email-log after any notification fires',
  )
  console.log('')
  console.log('═'.repeat(80))
  console.log('  Seed complete ✅')
  console.log('═'.repeat(80) + '\n')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
