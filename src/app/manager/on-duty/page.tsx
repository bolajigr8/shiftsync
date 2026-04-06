'use client'

import { useEffect, useState, useRef, useCallback } from 'react'

type OnDutyShift = {
  id: string
  requiredSkill: string
  startTime: string
  endTime: string
  assignments: { user: { name: string } }[]
  location: { name: string; timezone: string }
}

type Location = { id: string; name: string; isActive: boolean }

const SKILL_LABELS: Record<string, string> = {
  BARTENDER: 'Bartender',
  LINE_COOK: 'Line Cook',
  SERVER: 'Server',
  HOST: 'Host',
}

function countdown(endTime: string) {
  const diff = new Date(endTime).getTime() - Date.now()
  if (diff <= 0) return 'Ending'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m remaining` : `${m}m remaining`
}

function timeUntil(startTime: string) {
  const diff = new Date(startTime).getTime() - Date.now()
  if (diff <= 0) return 'Now'
  const m = Math.floor(diff / 60000)
  return `in ${m}m`
}

export default function OnDutyPage() {
  const [locations, setLocations] = useState<Location[]>([])
  const [data, setData] = useState<
    Record<string, { active: OnDutyShift[]; upcoming: OnDutyShift[] }>
  >({})
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchAll = useCallback(async (locs: Location[]) => {
    const results = await Promise.all(
      locs.map((loc) =>
        fetch(`/api/on-duty?locationId=${loc.id}`)
          .then((r) => r.json())
          .then((d) => ({
            id: loc.id,
            data: d.success ? d.data : { active: [], upcoming: [] },
          }))
          .catch(() => ({ id: loc.id, data: { active: [], upcoming: [] } })),
      ),
    )
    const map: typeof data = {}
    results.forEach((r) => {
      map[r.id] = r.data
    })
    setData(map)
    setLastRefresh(new Date())
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetch('/api/admin/locations')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          const active = d.data.filter((l: Location) => l.isActive)
          setLocations(active)
          fetchAll(active)
        }
      })
  }, [])

  // 60-second polling
  useEffect(() => {
    if (locations.length === 0) return
    intervalRef.current = setInterval(() => fetchAll(locations), 60000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [locations])

  const totalOnDuty = Object.values(data).reduce(
    (sum, d) => sum + d.active.reduce((s, sh) => s + sh.assignments.length, 0),
    0,
  )

  return (
    <div className='animate-in'>
      <div className='page-header'>
        <div>
          <h1 className='page-title'>On Duty</h1>
          <p className='page-subtitle'>
            {totalOnDuty} staff currently working · Last updated{' '}
            {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <button
          className='btn btn-secondary btn-sm'
          onClick={() => fetchAll(locations)}
        >
          ↻ Refresh
        </button>
      </div>

      {loading ? (
        <div className='loading-row'>Loading…</div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: 16,
          }}
        >
          {locations.map((loc) => {
            const locData = data[loc.id] ?? { active: [], upcoming: [] }
            return (
              <div key={loc.id} className='card animate-in'>
                <div className='card-header'>
                  <span className='card-title'>{loc.name}</span>
                  <span
                    style={{ fontSize: 12.5, color: 'var(--ss-text-muted)' }}
                  >
                    {locData.active.length} active · {locData.upcoming.length}{' '}
                    upcoming
                  </span>
                </div>

                {/* Active shifts */}
                {locData.active.length > 0 ? (
                  <div>
                    <div
                      style={{
                        padding: '8px 16px 4px',
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: 'var(--ss-text-muted)',
                      }}
                    >
                      Active Now
                    </div>
                    {locData.active.map((shift) => (
                      <div
                        key={shift.id}
                        style={{
                          padding: '12px 16px',
                          borderBottom: '1px solid var(--ss-border)',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 6,
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 600,
                              color: SKILL_LABELS[shift.requiredSkill]
                                ? 'var(--ss-text)'
                                : 'var(--ss-text-muted)',
                              fontSize: 14,
                            }}
                          >
                            {SKILL_LABELS[shift.requiredSkill] ??
                              shift.requiredSkill}
                          </span>
                          <span
                            style={{
                              fontSize: 12,
                              color: 'var(--ss-ok)',
                              fontWeight: 600,
                            }}
                          >
                            {countdown(shift.endTime)}
                          </span>
                        </div>
                        <div
                          style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
                        >
                          {shift.assignments.map((a, i) => (
                            <span
                              key={i}
                              style={{
                                padding: '3px 10px',
                                borderRadius: 100,
                                fontSize: 12.5,
                                background: 'var(--ss-ok-bg)',
                                color: 'var(--ss-ok)',
                                fontWeight: 500,
                              }}
                            >
                              {a.user.name}
                            </span>
                          ))}
                          {shift.assignments.length === 0 && (
                            <span
                              style={{
                                fontSize: 12.5,
                                color: 'var(--ss-text-faint)',
                              }}
                            >
                              No staff assigned
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      padding: '14px 16px',
                      color: 'var(--ss-text-faint)',
                      fontSize: 13,
                    }}
                  >
                    No active shifts right now
                  </div>
                )}

                {/* Upcoming shifts */}
                {locData.upcoming.length > 0 && (
                  <div>
                    <div
                      style={{
                        padding: '8px 16px 4px',
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: 'var(--ss-warn)',
                      }}
                    >
                      Starting Soon
                    </div>
                    {locData.upcoming.map((shift) => (
                      <div
                        key={shift.id}
                        style={{
                          padding: '12px 16px',
                          borderBottom: '1px solid var(--ss-border)',
                          background: '#fffbeb',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 6,
                          }}
                        >
                          <span style={{ fontWeight: 600, fontSize: 14 }}>
                            {SKILL_LABELS[shift.requiredSkill] ??
                              shift.requiredSkill}
                          </span>
                          <span
                            style={{
                              fontSize: 12,
                              color: 'var(--ss-warn)',
                              fontWeight: 600,
                            }}
                          >
                            {timeUntil(shift.startTime)}
                          </span>
                        </div>
                        <div
                          style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
                        >
                          {shift.assignments.map((a, i) => (
                            <span
                              key={i}
                              style={{
                                padding: '3px 10px',
                                borderRadius: 100,
                                fontSize: 12.5,
                                background: '#fef3c7',
                                color: '#92400e',
                                fontWeight: 500,
                              }}
                            >
                              {a.user.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
