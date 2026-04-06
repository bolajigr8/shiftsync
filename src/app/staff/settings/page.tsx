'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useToast } from '@/hooks/toast'

const NOTIFICATION_TYPES = [
  'SHIFT_ASSIGNED',
  'SCHEDULE_PUBLISHED',
  'SCHEDULE_UNPUBLISHED',
  'SHIFT_CHANGED',
  'SWAP_REQUEST',
  'SWAP_ACCEPTED',
  'SWAP_REJECTED',
  'SWAP_CANCELLED',
  'SWAP_AUTO_CANCELLED',
  'MANAGER_APPROVAL_NEEDED',
  'OVERTIME_WARNING',
  'AVAILABILITY_CHANGED',
  'COVERAGE_NEEDED',
]

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
]

type NotifPref = { inApp: boolean; email: boolean }
type NotifPrefs = Record<string, NotifPref>

const DEFAULT_PREFS: NotifPref = { inApp: true, email: false }

function Toggle({
  on,
  onChange,
}: {
  on: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div
      onClick={() => onChange(!on)}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        cursor: 'pointer',
        background: on ? 'var(--ss-ok)' : 'var(--ss-border-strong)',
        position: 'relative',
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: 'white',
          transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }}
      />
    </div>
  )
}

export default function SettingsPage() {
  const { data: session } = useSession()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)

  // Profile
  const [desiredWeeklyHours, setDesiredWeeklyHours] = useState('')
  const [timezone, setTimezone] = useState('America/New_York')
  const [savingProfile, setSavingProfile] = useState(false)

  // Notification prefs
  const [prefs, setPrefs] = useState<NotifPrefs>({})
  const [savingPrefs, setSavingPrefs] = useState(false)

  // Password change
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    if (!session?.user) return
    fetch(`/api/users/${session.user.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setDesiredWeeklyHours(data.data.desiredWeeklyHours?.toString() ?? '')
          setTimezone(data.data.timezone ?? 'America/New_York')
          const raw = data.data.notificationPrefs ?? {}
          const built: NotifPrefs = {}
          NOTIFICATION_TYPES.forEach((t) => {
            built[t] = raw[t] ?? DEFAULT_PREFS
          })
          setPrefs(built)
        }
        setLoading(false)
      })
  }, [session])

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSavingProfile(true)
    const res = await fetch(`/api/users/${session!.user.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timezone,
        desiredWeeklyHours: desiredWeeklyHours
          ? parseInt(desiredWeeklyHours)
          : null,
      }),
    })
    const data = await res.json()
    if (data.success) toast('Profile saved!', 'success')
    else toast(data.error ?? 'Failed to save', 'error')
    setSavingProfile(false)
  }

  async function savePrefs() {
    setSavingPrefs(true)
    const res = await fetch(`/api/users/${session!.user.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationPrefs: prefs }),
    })
    const data = await res.json()
    if (data.success) toast('Notification preferences saved!', 'success')
    else toast(data.error ?? 'Failed to save', 'error')
    setSavingPrefs(false)
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      toast('Passwords do not match', 'error')
      return
    }
    if (newPassword.length < 8) {
      toast('Password must be at least 8 characters', 'error')
      return
    }
    setSavingPassword(true)
    // Password change via admin user update — in production this would verify current password
    const res = await fetch(`/api/users/${session!.user.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPassword }),
    })
    const data = await res.json()
    if (data.success) {
      toast('Password updated', 'success')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } else toast(data.error ?? 'Failed to update password', 'error')
    setSavingPassword(false)
  }

  function updatePref(type: string, field: 'inApp' | 'email', val: boolean) {
    setPrefs((prev) => ({ ...prev, [type]: { ...prev[type], [field]: val } }))
  }

  if (loading) return <div className='loading-row'>Loading settings…</div>

  return (
    <div className='animate-in' style={{ maxWidth: 640 }}>
      <div className='page-header'>
        <div>
          <h1 className='page-title'>Settings</h1>
          <p className='page-subtitle'>Manage your preferences and account</p>
        </div>
      </div>

      {/* ── Profile ── */}
      <div className='card animate-in' style={{ marginBottom: 16 }}>
        <div className='card-header'>
          <span className='card-title'>Profile</span>
        </div>
        <div className='card-body'>
          <form onSubmit={saveProfile}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0 16px',
              }}
            >
              <div className='form-group'>
                <label className='form-label'>Desired Weekly Hours</label>
                <input
                  type='number'
                  className='form-input'
                  min={1}
                  max={80}
                  value={desiredWeeklyHours}
                  onChange={(e) => setDesiredWeeklyHours(e.target.value)}
                />
                <p className='form-hint'>
                  Used for overtime calculations and scheduling fairness.
                </p>
              </div>
              <div className='form-group'>
                <label className='form-label'>Your Timezone</label>
                <select
                  className='form-select'
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
                <p className='form-hint'>
                  Used for availability scheduling, not for reading shift times.
                </p>
              </div>
            </div>
            <button
              type='submit'
              className='btn btn-primary'
              disabled={savingProfile}
            >
              {savingProfile ? 'Saving…' : 'Save Profile'}
            </button>
          </form>
        </div>
      </div>

      {/* ── Notification Prefs ── */}
      <div className='card animate-in delay-1' style={{ marginBottom: 16 }}>
        <div className='card-header'>
          <span className='card-title'>Notification Preferences</span>
          <button
            className='btn btn-primary btn-sm'
            onClick={savePrefs}
            disabled={savingPrefs}
          >
            {savingPrefs ? 'Saving…' : 'Save'}
          </button>
        </div>
        <div>
          {/* Header row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 80px 80px',
              padding: '8px 20px',
              borderBottom: '2px solid var(--ss-border)',
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--ss-text-muted)',
            }}
          >
            <span>Type</span>
            <span style={{ textAlign: 'center' }}>In-App</span>
            <span style={{ textAlign: 'center' }}>Email</span>
          </div>
          {NOTIFICATION_TYPES.map((type, i) => (
            <div
              key={type}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 80px 80px',
                alignItems: 'center',
                padding: '11px 20px',
                borderBottom:
                  i < NOTIFICATION_TYPES.length - 1
                    ? '1px solid var(--ss-border)'
                    : 'none',
              }}
            >
              <span style={{ fontSize: 13.5 }}>{type.replace(/_/g, ' ')}</span>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Toggle
                  on={prefs[type]?.inApp ?? true}
                  onChange={(v) => updatePref(type, 'inApp', v)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Toggle
                  on={prefs[type]?.email ?? false}
                  onChange={(v) => updatePref(type, 'email', v)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Change Password ── */}
      <div className='card animate-in delay-2'>
        <div className='card-header'>
          <span className='card-title'>Change Password</span>
        </div>
        <div className='card-body'>
          <form onSubmit={savePassword}>
            <div className='form-group'>
              <label className='form-label'>Current Password</label>
              <input
                type='password'
                className='form-input'
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className='form-group'>
              <label className='form-label'>
                New Password (min 8 characters)
              </label>
              <input
                type='password'
                className='form-input'
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className='form-group'>
              <label className='form-label'>Confirm New Password</label>
              <input
                type='password'
                className='form-input'
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <button
              type='submit'
              className='btn btn-primary'
              disabled={savingPassword}
            >
              {savingPassword ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
