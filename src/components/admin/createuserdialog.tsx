'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
]

export default function CreateUserDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'STAFF',
    timezone: 'America/New_York',
    desiredWeeklyHours: '',
    hourlyRate: '',
  })

  function f(k: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [k]: e.target.value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        desiredWeeklyHours: form.desiredWeeklyHours
          ? parseInt(form.desiredWeeklyHours)
          : undefined,
        hourlyRate: form.hourlyRate ? parseFloat(form.hourlyRate) : undefined,
      }),
    })
    const data = await res.json()
    if (data.success) {
      setOpen(false)
      router.refresh()
    } else {
      setError(data.error ?? 'Failed to create user')
    }
    setSaving(false)
  }

  if (!open) {
    return (
      <button className='btn btn-primary' onClick={() => setOpen(true)}>
        <svg
          width='14'
          height='14'
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          strokeWidth='2.5'
        >
          <line x1='12' y1='5' x2='12' y2='19' />
          <line x1='5' y1='12' x2='19' y2='12' />
        </svg>
        New User
      </button>
    )
  }

  return (
    <>
      <button className='btn btn-primary' onClick={() => setOpen(true)}>
        <svg
          width='14'
          height='14'
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          strokeWidth='2.5'
        >
          <line x1='12' y1='5' x2='12' y2='19' />
          <line x1='5' y1='12' x2='19' y2='12' />
        </svg>
        New User
      </button>

      <div
        className='modal-backdrop'
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false)
        }}
      >
        <div className='modal'>
          <div className='modal-header'>
            <span className='modal-title'>New User</span>
            <button
              className='btn btn-ghost btn-sm'
              onClick={() => setOpen(false)}
            >
              ✕
            </button>
          </div>
          <form onSubmit={submit}>
            <div className='modal-body'>
              {error && <div className='alert alert-error'>{error}</div>}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0 16px',
                }}
              >
                <div className='form-group'>
                  <label className='form-label'>Full Name *</label>
                  <input
                    className='form-input'
                    required
                    value={form.name}
                    onChange={f('name')}
                  />
                </div>
                <div className='form-group'>
                  <label className='form-label'>Email *</label>
                  <input
                    className='form-input'
                    type='email'
                    required
                    value={form.email}
                    onChange={f('email')}
                  />
                </div>
                <div className='form-group'>
                  <label className='form-label'>Password * (min 8 chars)</label>
                  <input
                    className='form-input'
                    type='password'
                    required
                    minLength={8}
                    value={form.password}
                    onChange={f('password')}
                  />
                </div>
                <div className='form-group'>
                  <label className='form-label'>Role *</label>
                  <select
                    className='form-select'
                    value={form.role}
                    onChange={f('role')}
                  >
                    <option value='STAFF'>Staff</option>
                    <option value='MANAGER'>Manager</option>
                    <option value='ADMIN'>Admin</option>
                  </select>
                </div>
                <div className='form-group' style={{ gridColumn: '1 / -1' }}>
                  <label className='form-label'>Timezone *</label>
                  <select
                    className='form-select'
                    value={form.timezone}
                    onChange={f('timezone')}
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
                    max={60}
                    value={form.desiredWeeklyHours}
                    onChange={f('desiredWeeklyHours')}
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
                    onChange={f('hourlyRate')}
                  />
                </div>
              </div>
            </div>
            <div className='modal-footer'>
              <button
                type='button'
                className='btn btn-secondary'
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type='submit'
                className='btn btn-primary'
                disabled={saving}
              >
                {saving ? 'Creating…' : 'Create User'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
