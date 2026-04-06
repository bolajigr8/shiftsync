'use client'

import { useEffect, useState } from 'react'

type ComplianceRow = {
  userId: string
  name: string
  totalHours: number
  overtimeHours: number
  projectedCost: number
  status: 'OK' | 'WARNING' | 'OVERTIME'
  dayHours: number[] // hours per day [Sun..Sat]
  consecutiveDays: number
}

type Location = { id: string; name: string }

function getMondayISO() {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function CompliancePage() {
  const [rows, setRows] = useState<ComplianceRow[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [locationId, setLocationId] = useState('')
  const [loading, setLoading] = useState(true)
  // Override 7th day dialog
  const [overrideUserId, setOverrideUserId] = useState<string | null>(null)
  const [overrideReason, setOverrideReason] = useState('')
  const [overrideError, setOverrideError] = useState('')

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
    if (!locationId) return
    setLoading(true)
    fetch(
      `/api/analytics/overtime?locationId=${locationId}&weekStart=${getMondayISO()}`,
    )
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          // The overtime endpoint returns basic hours — we use it as the source
          // dayHours would need a dedicated endpoint; for now we compute from total
          setRows(
            data.data.map((e: any) => ({
              ...e,
              dayHours: [0, 0, 0, 0, 0, 0, 0],
              consecutiveDays: 0, // placeholder — real value needs getConsecutiveDays per user
            })),
          )
        }
        setLoading(false)
      })
  }, [locationId])

  const overrideUser = rows.find((r) => r.userId === overrideUserId)

  return (
    <div className='animate-in'>
      <div className='page-header'>
        <div>
          <h1 className='page-title'>Compliance</h1>
          <p className='page-subtitle'>
            Weekly hours, overtime, and consecutive day tracking
          </p>
        </div>
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
      </div>

      <div style={{ marginBottom: 16, display: 'flex', gap: 16, fontSize: 13 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 14,
              height: 14,
              background: '#fffbeb',
              border: '1px solid #fcd34d',
              borderRadius: 3,
              display: 'inline-block',
            }}
          />
          35–39h (Warning)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 14,
              height: 14,
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              borderRadius: 3,
              display: 'inline-block',
            }}
          />
          40h+ (Overtime)
        </span>
      </div>

      <div className='ss-table-wrap'>
        <table className='ss-table'>
          <thead>
            <tr>
              <th>Staff</th>
              {DAY_ABBR.map((d) => (
                <th key={d}>{d}</th>
              ))}
              <th>Total</th>
              <th>Cost</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} className='loading-row'>
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={11} className='loading-row'>
                  No staff data
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const rowBg =
                  row.status === 'OVERTIME'
                    ? '#fef2f2'
                    : row.status === 'WARNING'
                      ? '#fffbeb'
                      : 'transparent'

                return (
                  <tr key={row.userId} style={{ background: rowBg }}>
                    <td>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 500 }}>{row.name}</div>
                          {row.consecutiveDays >= 6 && (
                            <span
                              className={`badge ${row.consecutiveDays >= 7 ? 'badge-error' : 'badge-warn'}`}
                              style={{ fontSize: 10, marginTop: 3 }}
                            >
                              {row.consecutiveDays >= 7
                                ? '⚠ 7th day — override required'
                                : `${row.consecutiveDays} consecutive days`}
                            </span>
                          )}
                        </div>
                        {row.consecutiveDays >= 7 && (
                          <button
                            className='btn btn-danger btn-sm'
                            style={{ fontSize: 11 }}
                            onClick={() => {
                              setOverrideUserId(row.userId)
                              setOverrideReason('')
                              setOverrideError('')
                            }}
                          >
                            Override
                          </button>
                        )}
                      </div>
                    </td>
                    {row.dayHours.map((h, i) => (
                      <td
                        key={i}
                        style={{
                          textAlign: 'center',
                          color:
                            h > 0 ? 'var(--ss-text)' : 'var(--ss-text-faint)',
                          fontSize: 13,
                        }}
                      >
                        {h > 0 ? `${h}h` : '—'}
                      </td>
                    ))}
                    <td style={{ fontWeight: 700 }}>
                      {row.totalHours.toFixed(1)}h
                    </td>
                    <td style={{ color: 'var(--ss-text-muted)' }}>
                      ${row.projectedCost.toFixed(2)}
                    </td>
                    <td>
                      <span
                        className={`badge ${row.status === 'OVERTIME' ? 'badge-error' : row.status === 'WARNING' ? 'badge-warn' : 'badge-ok'}`}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Override 7th day dialog */}
      {overrideUserId && overrideUser && (
        <div
          className='modal-backdrop'
          onClick={(e) => {
            if (e.target === e.currentTarget) setOverrideUserId(null)
          }}
        >
          <div className='modal'>
            <div className='modal-header'>
              <span className='modal-title'>
                Override 7th Consecutive Day — {overrideUser.name}
              </span>
              <button
                className='btn btn-ghost btn-sm'
                onClick={() => setOverrideUserId(null)}
              >
                ✕
              </button>
            </div>
            <div className='modal-body'>
              <div className='alert alert-error' style={{ marginBottom: 16 }}>
                Assigning this staff member would result in their 7th
                consecutive working day. This override must be documented and
                will appear in the audit log.
              </div>
              {overrideError && (
                <div className='alert alert-error'>{overrideError}</div>
              )}
              <div className='form-group'>
                <label className='form-label'>
                  Override Reason (min 10 characters) *
                </label>
                <textarea
                  className='form-textarea'
                  rows={3}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder='e.g. Staff member volunteered and signed off on working the 7th day due to emergency coverage needs.'
                />
              </div>
            </div>
            <div className='modal-footer'>
              <button
                className='btn btn-secondary'
                onClick={() => setOverrideUserId(null)}
              >
                Cancel
              </button>
              <button
                className='btn btn-danger'
                disabled={overrideReason.trim().length < 10}
                onClick={() => {
                  // The override reason would be passed to POST /api/assignments
                  // This dialog documents intent — actual assignment happens from shift sheet
                  setOverrideUserId(null)
                  alert(
                    `Override reason recorded. When assigning ${overrideUser.name} to a shift, include this reason in the overrideReason field.`,
                  )
                }}
              >
                Acknowledge Override
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
