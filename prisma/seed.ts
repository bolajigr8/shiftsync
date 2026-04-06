// =============================================================================
// ShiftSync — Database seed
//
// Creates the first ADMIN user so you can log in and then create all other
// users through the application. Run with:
//
//   npx prisma db seed
//
// Add to package.json:
//   "prisma": { "seed": "tsx prisma/seed.ts" }
//
// Requires: npm install -D tsx
// =============================================================================

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // ── Admin user ─────────────────────────────────────────────────────────────
  const adminEmail = 'admin@coastaleats.com'
  const adminPassword = 'ShiftSync2024!'

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  })

  if (existingAdmin) {
    console.log(`ℹ️  Admin user already exists: ${adminEmail}`)
  } else {
    const passwordHash = await bcrypt.hash(adminPassword, 12)
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        name: 'System Admin',
        role: 'ADMIN',
        timezone: 'America/New_York',
        isActive: true,
        notificationPrefs: {},
      },
    })
    console.log(`✅ Created ADMIN user: ${admin.email}`)
  }

  // ── Seed location ──────────────────────────────────────────────────────────
  const locationName = 'Coastal Eats — Downtown'
  const existingLocation = await prisma.location.findFirst({
    where: { name: locationName },
  })

  if (existingLocation) {
    console.log(`ℹ️  Location already exists: ${locationName}`)
  } else {
    const location = await prisma.location.create({
      data: {
        name: locationName,
        timezone: 'America/New_York',
        address: '123 Ocean Drive, Miami, FL 33139',
        editCutoffHours: 48,
        isActive: true,
      },
    })
    console.log(`✅ Created location: ${location.name}`)
  }

  // ── Sample manager ─────────────────────────────────────────────────────────
  const managerEmail = 'manager@coastaleats.com'
  const existingManager = await prisma.user.findUnique({
    where: { email: managerEmail },
  })

  if (!existingManager) {
    const passwordHash = await bcrypt.hash('Manager2024!', 12)
    const manager = await prisma.user.create({
      data: {
        email: managerEmail,
        passwordHash,
        name: 'Jane Manager',
        role: 'MANAGER',
        timezone: 'America/New_York',
        isActive: true,
        notificationPrefs: {},
      },
    })

    // Assign manager to the location
    const location = await prisma.location.findFirst({
      where: { name: locationName },
    })
    if (location) {
      await prisma.managerLocation.create({
        data: { userId: manager.id, locationId: location.id },
      })
    }
    console.log(`✅ Created MANAGER user: ${manager.email}`)
  } else {
    console.log(`ℹ️  Manager user already exists: ${managerEmail}`)
  }

  // ── Sample staff member ────────────────────────────────────────────────────
  const staffEmail = 'staff@coastaleats.com'
  const existingStaff = await prisma.user.findUnique({
    where: { email: staffEmail },
  })

  if (!existingStaff) {
    const passwordHash = await bcrypt.hash('Staff2024!', 12)
    const staff = await prisma.user.create({
      data: {
        email: staffEmail,
        passwordHash,
        name: 'John Staff',
        role: 'STAFF',
        timezone: 'America/New_York',
        hourlyRate: 18.0,
        desiredWeeklyHours: 32,
        isActive: true,
        notificationPrefs: {},
      },
    })

    const location = await prisma.location.findFirst({
      where: { name: locationName },
    })
    if (location) {
      // Certify staff at the location
      await prisma.staffLocation.create({
        data: { userId: staff.id, locationId: location.id, isActive: true },
      })
      // Give staff the SERVER skill
      await prisma.staffSkill.create({
        data: { userId: staff.id, skill: 'SERVER' },
      })
    }
    console.log(`✅ Created STAFF user: ${staff.email}`)
  } else {
    console.log(`ℹ️  Staff user already exists: ${staffEmail}`)
  }

  console.log('\n🎉 Seed complete.')
  console.log('─────────────────────────────────────')
  console.log('Login credentials:')
  console.log('  ADMIN:   admin@coastaleats.com   / ShiftSync2024!')
  console.log('  MANAGER: manager@coastaleats.com / Manager2024!')
  console.log('  STAFF:   staff@coastaleats.com   / Staff2024!')
  console.log('─────────────────────────────────────')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
