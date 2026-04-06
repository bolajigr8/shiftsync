'use client'

import { useEffect, useState } from 'react'

type Location = {
  id: string
  name: string
  timezone: string
  isActive: boolean
}
type OvertimeEntry = {
  userId: string
  name: string
  status: 'OK' | 'WARNING' | 'OVERTIME'
}
type ActiveShift = {
  id: string
  requiredSkill: string
  endTime: string
  assignments: { user: { name: string } }[]
}

function getMondayISO() {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function minutesRemaining(endTime: string) {
  const diff = new Date(endTime).getTime() - Date.now()
  if (diff <= 0) return null
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`
}

function LocationCard({ loc }: { loc: Location }) {
  const [active, setActive] = useState<ActiveShift[]>([])
  const [upcoming, setUpcoming] = useState<ActiveShift[]>([])
  const [overtime, setOvertime] = useState<OvertimeEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [dutyRes, otRes] = await Promise.all([
        fetch(`/api/on-duty?locationId=${loc.id}`)
          .then((r) => r.json())
          .catch(() => null),
        fetch(
          `/api/analytics/overtime?locationId=${loc.id}&weekStart=${getMondayISO()}`,
        )
          .then((r) => r.json())
          .catch(() => null),
      ])
      if (dutyRes?.success) {
        setActive(dutyRes.data.active ?? [])
        setUpcoming(dutyRes.data.upcoming ?? [])
      }
      if (otRes?.success) setOvertime(otRes.data)
      setLoading(false)
    }
    load()
  }, [loc.id])

  const hasOvertime = overtime.some((e) => e.status === 'OVERTIME')
  const staffOnDuty = active.reduce((sum, s) => sum + s.assignments.length, 0)

  return (
    <div
      className='card animate-in'
      style={{
        borderTop: hasOvertime
          ? '3px solid var(--ss-error)'
          : '3px solid var(--ss-border)',
      }}
    >
      <div className='card-header'>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{loc.name}</div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--ss-text-muted)',
              marginTop: 2,
            }}
          >
            {loc.timezone}
          </div>
        </div>
        {hasOvertime && <span className='badge badge-error'>⚠ Overtime</span>}
      </div>
      <div className='card-body'>
        {loading ? (
          <div style={{ color: 'var(--ss-text-faint)', fontSize: 13 }}>
            Loading…
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 20, marginBottom: 14 }}>
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--ss-text-muted)',
                    marginBottom: 2,
                  }}
                >
                  Active Shifts
                </div>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 700,
                    fontFamily: 'Fraunces, serif',
                  }}
                >
                  {active.length}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--ss-text-muted)',
                    marginBottom: 2,
                  }}
                >
                  On Duty
                </div>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 700,
                    fontFamily: 'Fraunces, serif',
                  }}
                >
                  {staffOnDuty}
                </div>
              </div>
              {upcoming.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--ss-warn)',
                      marginBottom: 2,
                    }}
                  >
                    Starting Soon
                  </div>
                  <div
                    style={{
                      fontSize: 26,
                      fontWeight: 700,
                      fontFamily: 'Fraunces, serif',
                      color: 'var(--ss-warn)',
                    }}
                  >
                    {upcoming.length}
                  </div>
                </div>
              )}
            </div>

            {active.length > 0 && (
              <div>
                {active.map((shift) => (
                  <div
                    key={shift.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '7px 0',
                      borderBottom: '1px solid var(--ss-border)',
                      fontSize: 13,
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 500 }}>
                        {shift.requiredSkill.replace('_', ' ')}
                      </span>
                      <span
                        style={{ color: 'var(--ss-text-muted)', marginLeft: 8 }}
                      >
                        {shift.assignments.map((a) => a.user.name).join(', ')}
                      </span>
                    </div>
                    <span
                      style={{ fontSize: 12, color: 'var(--ss-text-faint)' }}
                    >
                      {minutesRemaining(shift.endTime)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {active.length === 0 && (
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--ss-text-faint)',
                  textAlign: 'center',
                  padding: '12px 0',
                }}
              >
                No active shifts right now
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function AdminLocationCards() {
  const [locations, setLocations] = useState<Location[]>([])

  useEffect(() => {
    fetch('/api/admin/locations')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setLocations(d.data.filter((l: Location) => l.isActive))
      })
  }, [])

  if (locations.length === 0) {
    return (
      <div className='card' style={{ marginBottom: 24 }}>
        <div className='empty-state'>
          <div className='empty-state-icon'>📍</div>
          <div className='empty-state-title'>No locations configured</div>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 16,
        marginBottom: 28,
      }}
    >
      {locations.map((loc) => (
        <LocationCard key={loc.id} loc={loc} />
      ))}
    </div>
  )
}
