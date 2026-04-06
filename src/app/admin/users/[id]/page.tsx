'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'

type User = {
  id: string
  name: string
  email: string
  role: string
  timezone: string
  desiredWeeklyHours: number | null
  hourlyRate: string | null
  isActive: boolean
  skills: { skill: string }[]
  staffLocations: {
    locationId: string
    isActive: boolean
    location: { name: string }
  }[]
}

type Location = { id: string; name: string }

const ALL_SKILLS = ['BARTENDER', 'LINE_COOK', 'SERVER', 'HOST'] as const
const SKILL_LABELS: Record<string, string> = {
  BARTENDER: 'Bartender',
  LINE_COOK: 'Line Cook',
  SERVER: 'Server',
  HOST: 'Host',
}
const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
]

export default function UserDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    timezone: 'America/New_York',
    desiredWeeklyHours: '',
    hourlyRate: '',
    isActive: true,
  })
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [certifiedLocations, setCertifiedLocations] = useState<string[]>([])

  async function load() {
    const [uRes, lRes] = await Promise.all([
      fetch(`/api/users/${params.id}`).then((r) => r.json()),
      fetch('/api/admin/locations').then((r) => r.json()),
    ])
    if (uRes.success) {
      const u: User = uRes.data
      setUser(u)
      setForm({
        name: u.name,
        timezone: u.timezone,
        desiredWeeklyHours: u.desiredWeeklyHours?.toString() ?? '',
        hourlyRate: u.hourlyRate ? Number(u.hourlyRate).toFixed(2) : '',
        isActive: u.isActive,
      })
      setSelectedSkills(u.skills.map((s) => s.skill))
      setCertifiedLocations(
        u.staffLocations.filter((sl) => sl.isActive).map((sl) => sl.locationId),
      )
    }
    if (lRes.success) setLocations(lRes.data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [params.id])

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    const res = await fetch(`/api/users/${params.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        timezone: form.timezone,
        desiredWeeklyHours: form.desiredWeeklyHours
          ? parseInt(form.desiredWeeklyHours)
          : null,
        hourlyRate: form.hourlyRate ? parseFloat(form.hourlyRate) : null,
        isActive: form.isActive,
      }),
    })
    const data = await res.json()
    if (data.success) setSuccess('Profile saved.')
    else setError(data.error ?? 'Failed')
    setSaving(false)
  }

  async function saveSkills(skills: string[]) {
    setSelectedSkills(skills)
    await fetch(`/api/users/${params.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skills }),
    })
  }

  async function saveCertLocations(locationIds: string[]) {
    setCertifiedLocations(locationIds)
    await fetch(`/api/users/${params.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffLocationIds: locationIds }),
    })
  }

  function toggleSkill(skill: string) {
    const next = selectedSkills.includes(skill)
      ? selectedSkills.filter((s) => s !== skill)
      : [...selectedSkills, skill]
    saveSkills(next)
  }

  function toggleLocation(locId: string) {
    const next = certifiedLocations.includes(locId)
      ? certifiedLocations.filter((l) => l !== locId)
      : [...certifiedLocations, locId]
    saveCertLocations(next)
  }

  if (loading) return <div className='loading-row'>Loading…</div>
  if (!user) return <div className='loading-row'>User not found</div>

  return (
    <div className='animate-in' style={{ maxWidth: 680 }}>
      <div className='page-header'>
        <div>
          <button
            className='btn btn-ghost btn-sm'
            onClick={() => router.push('/admin/users')}
            style={{ marginBottom: 8, padding: '4px 0' }}
          >
            ← Back to Users
          </button>
          <h1 className='page-title'>{user.name}</h1>
          <p className='page-subtitle'>{user.email}</p>
        </div>
      </div>

      {/* ── Profile ── */}
      <div className='card animate-in' style={{ marginBottom: 16 }}>
        <div className='card-header'>
          <span className='card-title'>Profile</span>
        </div>
        <div className='card-body'>
          {error && <div className='alert alert-error'>{error}</div>}
          {success && <div className='alert alert-success'>{success}</div>}
          <form onSubmit={saveProfile}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0 16px',
              }}
            >
              <div className='form-group'>
                <label className='form-label'>Full Name</label>
                <input
                  className='form-input'
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </div>
              <div className='form-group'>
                <label className='form-label'>Timezone</label>
                <select
                  className='form-select'
                  value={form.timezone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, timezone: e.target.value }))
                  }
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
              <div className='form-group'>
                <label className='form-label'>Desired Weekly Hours</label>
                <input
                  className='form-input'
                  type='number'
                  min={1}
                  max={80}
                  value={form.desiredWeeklyHours}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      desiredWeeklyHours: e.target.value,
                    }))
                  }
                />
              </div>
              <div className='form-group'>
                <label className='form-label'>Hourly Rate ($)</label>
                <input
                  className='form-input'
                  type='number'
                  step='0.01'
                  min={0}
                  value={form.hourlyRate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, hourlyRate: e.target.value }))
                  }
                />
              </div>
              <div
                className='form-group'
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  gridColumn: '1 / -1',
                }}
              >
                <label className='form-label' style={{ marginBottom: 0 }}>
                  Active Account
                </label>
                <div
                  onClick={() =>
                    setForm((f) => ({ ...f, isActive: !f.isActive }))
                  }
                  style={{
                    width: 36,
                    height: 20,
                    borderRadius: 10,
                    cursor: 'pointer',
                    background: form.isActive
                      ? 'var(--ss-ok)'
                      : 'var(--ss-border-strong)',
                    position: 'relative',
                    transition: 'background 0.2s',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 2,
                      left: form.isActive ? 18 : 2,
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: 'white',
                      transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }}
                  />
                </div>
              </div>
            </div>
            <button
              type='submit'
              className='btn btn-primary'
              disabled={saving}
              style={{ marginTop: 8 }}
            >
              {saving ? 'Saving…' : 'Save Profile'}
            </button>
          </form>
        </div>
      </div>

      {/* ── Skills ── */}
      <div className='card animate-in delay-1' style={{ marginBottom: 16 }}>
        <div className='card-header'>
          <span className='card-title'>Skills</span>
          <span style={{ fontSize: 12.5, color: 'var(--ss-text-muted)' }}>
            Changes save immediately
          </span>
        </div>
        <div
          className='card-body'
          style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}
        >
          {ALL_SKILLS.map((skill) => {
            const active = selectedSkills.includes(skill)
            return (
              <button
                key={skill}
                type='button'
                className={`btn ${active ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => toggleSkill(skill)}
              >
                {active && '✓ '}
                {SKILL_LABELS[skill]}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Location Certifications ── */}
      <div className='card animate-in delay-2'>
        <div className='card-header'>
          <span className='card-title'>Location Certifications</span>
          <span style={{ fontSize: 12.5, color: 'var(--ss-text-muted)' }}>
            Changes save immediately
          </span>
        </div>
        <div className='card-body'>
          {locations.map((loc, i) => {
            const certified = certifiedLocations.includes(loc.id)
            return (
              <div
                key={loc.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 0',
                  borderBottom:
                    i < locations.length - 1
                      ? '1px solid var(--ss-border)'
                      : 'none',
                }}
              >
                <div>
                  <div style={{ fontWeight: 500 }}>{loc.name}</div>
                  {!certified && (
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--ss-warn)',
                        marginTop: 2,
                      }}
                    >
                      ⚠ Not certified — cannot be assigned to shifts here
                    </div>
                  )}
                </div>
                <div
                  onClick={() => toggleLocation(loc.id)}
                  style={{
                    width: 36,
                    height: 20,
                    borderRadius: 10,
                    cursor: 'pointer',
                    background: certified
                      ? 'var(--ss-ok)'
                      : 'var(--ss-border-strong)',
                    position: 'relative',
                    transition: 'background 0.2s',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 2,
                      left: certified ? 18 : 2,
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: 'white',
                      transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
