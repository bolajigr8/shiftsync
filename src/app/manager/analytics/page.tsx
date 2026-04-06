'use client'

import { useEffect, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts'

type FairnessEntry = {
  userId: string
  name: string
  totalHours: number
  premiumShifts: number
  actualAverageWeeklyHours: number
  desiredWeeklyHours: number | null
  fairnessScore: number | null
  flagged: boolean
  status?: 'OK' | 'WARNING' | 'OVERTIME' // add this
}

type Location = { id: string; name: string }

function scoreColor(score: number | null) {
  if (score === null) return 'var(--ss-text-faint)'
  if (score < 0.7) return 'var(--ss-error)'
  if (score > 1.3) return 'var(--ss-warn)'
  return 'var(--ss-ok)'
}

function scoreBadge(score: number | null) {
  if (score === null) return 'badge-muted'
  if (score < 0.7) return 'badge-error'
  if (score > 1.3) return 'badge-warn'
  return 'badge-ok'
}

export default function AnalyticsPage() {
  const [data, setData] = useState<FairnessEntry[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [locationId, setLocationId] = useState('')
  const [start, setStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 28)
    return d.toISOString().split('T')[0]
  })
  const [end, setEnd] = useState(() => new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)
  const [meta, setMeta] = useState<{
    totalPremiumShifts: number
    weeksInPeriod: number
  } | null>(null)

  useEffect(() => {
    fetch('/api/admin/locations')
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data.length > 0) {
          setLocations(d.data)
          setLocationId(d.data[0].id)
        }
      })
  }, [])

  useEffect(() => {
    if (!locationId || !start || !end) return
    setLoading(true)
    const params = new URLSearchParams({
      locationId,
      start: new Date(start).toISOString(),
      end: new Date(end + 'T23:59:59').toISOString(),
    })
    fetch(`/api/analytics/fairness?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setData(d.data.results)
          setMeta(d.data.meta)
        }
        setLoading(false)
      })
  }, [locationId, start, end])

  return (
    <div className='animate-in'>
      <div className='page-header'>
        <div>
          <h1 className='page-title'>Analytics</h1>
          <p className='page-subtitle'>
            Premium shift equity and hours distribution
          </p>
        </div>
      </div>

      <div className='filters-row' style={{ marginBottom: 24 }}>
        {locations.length > 1 && (
          <select
            className='form-select'
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
        <input
          type='date'
          className='form-input'
          value={start}
          onChange={(e) => setStart(e.target.value)}
          style={{ width: 160 }}
        />
        <span style={{ color: 'var(--ss-text-muted)', fontSize: 13 }}>to</span>
        <input
          type='date'
          className='form-input'
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          style={{ width: 160 }}
        />
      </div>

      {meta && (
        <div className='stat-grid' style={{ marginBottom: 28 }}>
          <div className='stat-card'>
            <div className='stat-label'>Period</div>
            <div className='stat-value'>{meta.weeksInPeriod}</div>
            <div className='stat-meta'>weeks analysed</div>
          </div>
          <div className='stat-card'>
            <div className='stat-label'>Premium Shifts</div>
            <div className='stat-value'>{meta.totalPremiumShifts}</div>
            <div className='stat-meta'>Fri/Sat evenings</div>
          </div>
          <div className='stat-card'>
            <div className='stat-label'>Flagged Staff</div>
            <div
              className='stat-value'
              style={{
                color:
                  data.filter((d) => d.flagged).length > 0
                    ? 'var(--ss-error)'
                    : undefined,
              }}
            >
              {data.filter((d) => d.flagged).length}
            </div>
            <div className='stat-meta'>fairness score out of range</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className='loading-row'>Loading analytics…</div>
      ) : data.length === 0 ? (
        <div className='card'>
          <div className='empty-state'>
            <div className='empty-state-icon'>📊</div>
            <div className='empty-state-title'>No data for this period</div>
          </div>
        </div>
      ) : (
        <>
          {/* Total hours chart */}
          <div className='card animate-in' style={{ marginBottom: 16 }}>
            <div className='card-header'>
              <span className='card-title'>Total Hours by Staff</span>
            </div>
            <div className='card-body'>
              <ResponsiveContainer width='100%' height={220}>
                <BarChart
                  data={data}
                  margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
                >
                  <XAxis dataKey='name' tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} unit='h' />
                  <Tooltip
                    formatter={(value) =>
                      typeof value === 'number'
                        ? [`${value.toFixed(1)}h`, 'Hours']
                        : [String(value ?? '—'), 'Hours']
                    }
                  />
                  <Bar dataKey='totalHours' radius={[4, 4, 0, 0]}>
                    {data.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={
                          entry.status === 'OVERTIME'
                            ? '#dc2626'
                            : entry.status === 'WARNING'
                              ? '#d97706'
                              : '#ea580c'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Premium shifts chart */}
          <div className='card animate-in delay-1' style={{ marginBottom: 16 }}>
            <div className='card-header'>
              <span className='card-title'>Premium Shifts by Staff</span>
            </div>
            <div className='card-body'>
              <ResponsiveContainer width='100%' height={220}>
                <BarChart
                  data={data}
                  margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
                >
                  <XAxis dataKey='name' tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar
                    dataKey='premiumShifts'
                    fill='#7c3aed'
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Fairness table */}
          <div className='ss-table-wrap animate-in delay-2'>
            <table className='ss-table'>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Fairness Score</th>
                  <th>Desired Hrs/Wk</th>
                  <th>Actual Avg Hrs/Wk</th>
                  <th>Premium Shifts</th>
                  <th>Total Hours</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.userId}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{row.name}</div>
                      {row.flagged && (
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--ss-error)',
                            marginTop: 2,
                          }}
                        >
                          ⚠ Equity flag
                        </div>
                      )}
                    </td>
                    <td>
                      {row.fairnessScore !== null ? (
                        <span
                          className={`badge ${scoreBadge(row.fairnessScore)}`}
                        >
                          {row.fairnessScore.toFixed(2)}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--ss-text-faint)' }}>—</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--ss-text-muted)' }}>
                      {row.desiredWeeklyHours
                        ? `${row.desiredWeeklyHours}h`
                        : '—'}
                    </td>
                    <td style={{ fontWeight: 500 }}>
                      {row.actualAverageWeeklyHours.toFixed(1)}h
                    </td>
                    <td>{row.premiumShifts}</td>
                    <td>{row.totalHours.toFixed(1)}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
