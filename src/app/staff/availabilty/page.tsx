'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useToast } from '@/hooks/toast'

type Recurring = {
  dayOfWeek: number
  isAvailable: boolean
  startTime: string | null
  endTime: string | null
}
type Exception = {
  id: string
  exceptionDate: string
  isAvailable: boolean
  startTime: string | null
  endTime: string | null
}

const DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const DEFAULT_RECURRING: Recurring[] = DAYS.map((_, i) => ({
  dayOfWeek: i,
  isAvailable: i >= 1 && i <= 5,
  startTime: '09:00',
  endTime: '17:00',
}))

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  return { firstDay, daysInMonth }
}

export default function AvailabilityPage() {
  const { data: session } = useSession()
  const { toast } = useToast()
  const [recurring, setRecurring] = useState<Recurring[]>(DEFAULT_RECURRING)
  const [exceptions, setExceptions] = useState<Exception[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Calendar state
  const now = new Date()
  const [calYear, setCalYear] = useState(now.getFullYear())
  const [calMonth, setCalMonth] = useState(now.getMonth())

  // Exception dialog
  const [exDialogOpen, setExDialogOpen] = useState(false)
  const [exDate, setExDate] = useState('')
  const [exAvailable, setExAvailable] = useState(true)
  const [exStart, setExStart] = useState('09:00')
  const [exEnd, setExEnd] = useState('17:00')
  const [savingEx, setSavingEx] = useState(false)

  const userId = session?.user.id

  useEffect(() => {
    if (!userId) return
    fetch(`/api/availability/${userId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          if (data.data.recurring?.length) {
            const rec = DEFAULT_RECURRING.map((d) => {
              const found = data.data.recurring.find(
                (r: any) => r.dayOfWeek === d.dayOfWeek,
              )
              return found
                ? {
                    dayOfWeek: d.dayOfWeek,
                    isAvailable: found.isAvailable,
                    startTime: found.startTime,
                    endTime: found.endTime,
                  }
                : d
            })
            setRecurring(rec)
          }
          setExceptions(data.data.exceptions ?? [])
        }
        setLoading(false)
      })
  }, [userId])

  function updateDay(dow: number, field: keyof Recurring, value: any) {
    setRecurring((prev) =>
      prev.map((d) => (d.dayOfWeek === dow ? { ...d, [field]: value } : d)),
    )
  }

  async function saveRecurring() {
    if (!userId) return
    setSaving(true)
    const res = await fetch(`/api/availability/${userId}/recurring`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ availabilities: recurring }),
    })
    const data = await res.json()
    if (data.success) toast('Availability saved!', 'success')
    else toast(data.error ?? 'Failed to save', 'error')
    setSaving(false)
  }

  async function saveException() {
    if (!userId || !exDate) return
    setSavingEx(true)
    const res = await fetch(`/api/availability/${userId}/exceptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exceptionDate: new Date(exDate + 'T12:00:00').toISOString(),
        isAvailable: exAvailable,
        startTime: exAvailable ? exStart : null,
        endTime: exAvailable ? exEnd : null,
      }),
    })
    const data = await res.json()
    if (data.success) {
      toast('Exception saved', 'success')
      setExDialogOpen(false)
      // Reload exceptions
      const r = await fetch(`/api/availability/${userId}`).then((r) => r.json())
      if (r.success) setExceptions(r.data.exceptions ?? [])
    } else {
      toast(data.error ?? 'Failed to save exception', 'error')
    }
    setSavingEx(false)
  }

  // Build exception map for calendar dots
  const exMap = new Map(
    exceptions.map((e) => {
      const d = new Date(e.exceptionDate)
      return [`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`, e]
    }),
  )

  const { firstDay, daysInMonth } = getMonthDays(calYear, calMonth)

  if (loading) return <div className='loading-row'>Loading availability…</div>

  return (
    <div className='animate-in'>
      <div className='page-header'>
        <div>
          <h1 className='page-title'>Availability</h1>
          <p className='page-subtitle'>
            Times saved in your local timezone (
            {session?.user.timezone ?? 'your timezone'})
          </p>
        </div>
      </div>

      {/* ── Weekly recurring grid ── */}
      <div className='card animate-in' style={{ marginBottom: 20 }}>
        <div className='card-header'>
          <span className='card-title'>Weekly Schedule</span>
          <button
            className='btn btn-primary btn-sm'
            onClick={saveRecurring}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
        <div className='card-body'>
          <div
            style={{
              background: '#fef3c7',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 16,
              fontSize: 13,
              color: '#92400e',
            }}
          >
            ℹ Times are saved in your own local timezone, not the location's
            timezone.
          </div>
          {recurring.map((day, i) => (
            <div
              key={day.dayOfWeek}
              style={{
                display: 'grid',
                gridTemplateColumns: '110px 44px 1fr',
                alignItems: 'center',
                gap: 16,
                padding: '12px 0',
                borderBottom: i < 6 ? '1px solid var(--ss-border)' : 'none',
              }}
            >
              <div style={{ fontWeight: 500 }}>{DAYS[day.dayOfWeek]}</div>
              <div
                onClick={() =>
                  updateDay(day.dayOfWeek, 'isAvailable', !day.isAvailable)
                }
                style={{
                  width: 36,
                  height: 20,
                  borderRadius: 10,
                  cursor: 'pointer',
                  background: day.isAvailable
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
                    left: day.isAvailable ? 18 : 2,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: 'white',
                    transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }}
                />
              </div>
              {day.isAvailable ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type='time'
                    className='form-input'
                    value={day.startTime ?? '09:00'}
                    onChange={(e) =>
                      updateDay(day.dayOfWeek, 'startTime', e.target.value)
                    }
                    style={{ width: 120 }}
                  />
                  <span style={{ color: 'var(--ss-text-muted)', fontSize: 13 }}>
                    to
                  </span>
                  <input
                    type='time'
                    className='form-input'
                    value={day.endTime ?? '17:00'}
                    onChange={(e) =>
                      updateDay(day.dayOfWeek, 'endTime', e.target.value)
                    }
                    style={{ width: 120 }}
                  />
                </div>
              ) : (
                <span style={{ color: 'var(--ss-text-faint)', fontSize: 13.5 }}>
                  Unavailable
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Month calendar ── */}
      <div className='card animate-in delay-1'>
        <div className='card-header'>
          <span className='card-title'>Date Exceptions</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className='btn btn-ghost btn-sm'
              onClick={() => {
                if (calMonth === 0) {
                  setCalYear((y) => y - 1)
                  setCalMonth(11)
                } else setCalMonth((m) => m - 1)
              }}
            >
              ←
            </button>
            <span style={{ fontWeight: 600, fontSize: 13.5 }}>
              {new Date(calYear, calMonth).toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric',
              })}
            </span>
            <button
              className='btn btn-ghost btn-sm'
              onClick={() => {
                if (calMonth === 11) {
                  setCalYear((y) => y + 1)
                  setCalMonth(0)
                } else setCalMonth((m) => m + 1)
              }}
            >
              →
            </button>
          </div>
        </div>
        <div className='card-body'>
          <div
            style={{
              display: 'flex',
              gap: 8,
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--ss-text-muted)',
              marginBottom: 8,
            }}
          >
            {DAY_SHORT.map((d) => (
              <div key={d} style={{ flex: 1, textAlign: 'center' }}>
                {d}
              </div>
            ))}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 4,
            }}
          >
            {/* Empty cells before first day */}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`e${i}`} />
            ))}

            {/* Day cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const date = i + 1
              const key = `${calYear}-${calMonth}-${date}`
              const ex = exMap.get(key)
              const isPast =
                new Date(calYear, calMonth, date) <
                new Date(now.getFullYear(), now.getMonth(), now.getDate())
              const isToday =
                date === now.getDate() &&
                calMonth === now.getMonth() &&
                calYear === now.getFullYear()

              return (
                <div
                  key={date}
                  onClick={() => {
                    if (isPast) return
                    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`
                    setExDate(dateStr)
                    setExAvailable(true)
                    setExStart('09:00')
                    setExEnd('17:00')
                    setExDialogOpen(true)
                  }}
                  style={{
                    padding: '8px 4px',
                    borderRadius: 8,
                    textAlign: 'center',
                    cursor: isPast ? 'default' : 'pointer',
                    opacity: isPast ? 0.35 : 1,
                    background: isToday
                      ? 'var(--ss-accent-light)'
                      : ex?.isAvailable
                        ? '#ecfdf5'
                        : ex && !ex.isAvailable
                          ? '#fef2f2'
                          : 'transparent',
                    border: isToday
                      ? '2px solid var(--ss-accent)'
                      : '2px solid transparent',
                    transition: 'background 0.15s',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{ fontSize: 13.5, fontWeight: isToday ? 700 : 400 }}
                  >
                    {date}
                  </div>
                  {ex && (
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        margin: '2px auto 0',
                        background: ex.isAvailable
                          ? 'var(--ss-ok)'
                          : 'var(--ss-error)',
                      }}
                    />
                  )}
                </div>
              )
            })}
          </div>

          <div
            style={{
              display: 'flex',
              gap: 16,
              marginTop: 12,
              fontSize: 12,
              color: 'var(--ss-text-muted)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--ss-ok)',
                  display: 'inline-block',
                }}
              />
              Available override
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--ss-error)',
                  display: 'inline-block',
                }}
              />
              Unavailable override
            </span>
          </div>
        </div>
      </div>

      {/* Exception dialog */}
      {exDialogOpen && (
        <div
          className='modal-backdrop'
          onClick={(e) => {
            if (e.target === e.currentTarget) setExDialogOpen(false)
          }}
        >
          <div className='modal'>
            <div className='modal-header'>
              <span className='modal-title'>Set Exception — {exDate}</span>
              <button
                className='btn btn-ghost btn-sm'
                onClick={() => setExDialogOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className='modal-body'>
              <div className='form-group'>
                <label className='form-label'>Availability on this date</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type='button'
                    className={`btn ${exAvailable ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setExAvailable(true)}
                  >
                    ✓ Available
                  </button>
                  <button
                    type='button'
                    className={`btn ${!exAvailable ? 'btn-danger' : 'btn-secondary'}`}
                    onClick={() => setExAvailable(false)}
                  >
                    ✕ Unavailable
                  </button>
                </div>
              </div>
              {exAvailable && (
                <div
                  style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}
                >
                  <div className='form-group' style={{ flex: 1 }}>
                    <label className='form-label'>From</label>
                    <input
                      type='time'
                      className='form-input'
                      value={exStart}
                      onChange={(e) => setExStart(e.target.value)}
                    />
                  </div>
                  <div className='form-group' style={{ flex: 1 }}>
                    <label className='form-label'>To</label>
                    <input
                      type='time'
                      className='form-input'
                      value={exEnd}
                      onChange={(e) => setExEnd(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className='modal-footer'>
              <button
                className='btn btn-secondary'
                onClick={() => setExDialogOpen(false)}
              >
                Cancel
              </button>
              <button
                className='btn btn-primary'
                disabled={savingEx}
                onClick={saveException}
              >
                {savingEx ? 'Saving…' : 'Save Exception'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
