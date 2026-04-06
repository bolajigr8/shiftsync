'use client'

import { useEffect, useState } from 'react'

type AuditLog = {
  id: string
  action: string
  entityType: string
  entityId: string
  createdAt: string
  overrideReason: string | null
  actor: { name: string; email: string }
  location: { name: string }
}

const AUDIT_ACTIONS = [
  'SHIFT_CREATED',
  'SHIFT_EDITED',
  'SHIFT_PUBLISHED',
  'SHIFT_UNPUBLISHED',
  'SHIFT_CANCELLED',
  'ASSIGNED',
  'UNASSIGNED',
  'SWAP_APPROVED',
  'SWAP_REJECTED',
  'OVERRIDE_7TH_DAY',
]
const ACTION_BADGE: Record<string, string> = {
  SHIFT_CREATED: 'badge-info',
  SHIFT_EDITED: 'badge-info',
  SHIFT_PUBLISHED: 'badge-ok',
  SHIFT_UNPUBLISHED: 'badge-warn',
  SHIFT_CANCELLED: 'badge-error',
  ASSIGNED: 'badge-ok',
  UNASSIGNED: 'badge-warn',
  SWAP_APPROVED: 'badge-ok',
  SWAP_REJECTED: 'badge-error',
  OVERRIDE_7TH_DAY: 'badge-error',
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [locationFilter, setLocationFilter] = useState('')
  const [action, setAction] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 25

  useEffect(() => {
    fetch('/api/admin/locations')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setLocations(d.data)
      })
  }, [])

  async function load() {
    setLoading(true)
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    })
    if (locationFilter) params.set('locationId', locationFilter)
    if (action) params.set('action', action)
    if (start) params.set('start', new Date(start).toISOString())
    if (end) params.set('end', new Date(end + 'T23:59:59').toISOString())
    const res = await fetch(`/api/audit?${params}`)
    const data = await res.json()
    if (data.success) {
      setLogs(data.data.logs)
      setTotal(data.data.pagination.total)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [page, locationFilter, action, start, end])

  function handleExport() {
    const params = new URLSearchParams()
    if (locationFilter) params.set('locationId', locationFilter)
    if (action) params.set('action', action)
    if (start) params.set('start', new Date(start).toISOString())
    if (end) params.set('end', new Date(end + 'T23:59:59').toISOString())

    // Create a temporary anchor to trigger browser download
    const url = `/api/audit/export?${params}`
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const totalPages = Math.ceil(total / limit)
  const clearFilters = () => {
    setLocationFilter('')
    setAction('')
    setStart('')
    setEnd('')
    setPage(1)
  }
  const hasFilters = locationFilter || action || start || end

  return (
    <div className='animate-in'>
      <div className='page-header'>
        <div>
          <h1 className='page-title'>Audit Log</h1>
          <p className='page-subtitle'>{total} records</p>
        </div>
        <button className='btn btn-secondary' onClick={handleExport}>
          <svg
            width='14'
            height='14'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
          >
            <path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' />
            <polyline points='7 10 12 15 17 10' />
            <line x1='12' y1='15' x2='12' y2='3' />
          </svg>
          Download CSV
        </button>
      </div>

      <div className='filters-row'>
        <select
          className='form-select'
          value={locationFilter}
          onChange={(e) => {
            setLocationFilter(e.target.value)
            setPage(1)
          }}
        >
          <option value=''>All locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select
          className='form-select'
          value={action}
          onChange={(e) => {
            setAction(e.target.value)
            setPage(1)
          }}
        >
          <option value=''>All actions</option>
          {AUDIT_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <input
          type='date'
          className='form-input'
          value={start}
          onChange={(e) => {
            setStart(e.target.value)
            setPage(1)
          }}
          style={{ width: 160 }}
        />
        <span style={{ color: 'var(--ss-text-muted)', fontSize: 13 }}>to</span>
        <input
          type='date'
          className='form-input'
          value={end}
          onChange={(e) => {
            setEnd(e.target.value)
            setPage(1)
          }}
          style={{ width: 160 }}
        />
        {hasFilters && (
          <button className='btn btn-ghost btn-sm' onClick={clearFilters}>
            Clear
          </button>
        )}
      </div>

      <div className='ss-table-wrap'>
        <table className='ss-table'>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Location</th>
              <th>Override Reason</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className='loading-row'>
                  Loading…
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} className='loading-row'>
                  No records found
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id}>
                  <td
                    style={{
                      fontSize: 12.5,
                      color: 'var(--ss-text-muted)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {new Date(log.createdAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{log.actor.name}</div>
                    <div
                      style={{ fontSize: 12, color: 'var(--ss-text-faint)' }}
                    >
                      {log.actor.email}
                    </div>
                  </td>
                  <td>
                    <span
                      className={`badge ${ACTION_BADGE[log.action] ?? 'badge-muted'}`}
                    >
                      {log.action.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={{ fontSize: 12.5 }}>
                    <span style={{ fontWeight: 500 }}>{log.entityType}</span>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 11,
                        color: 'var(--ss-text-faint)',
                        display: 'block',
                      }}
                    >
                      {log.entityId.slice(0, 12)}…
                    </span>
                  </td>
                  <td style={{ color: 'var(--ss-text-muted)', fontSize: 12.5 }}>
                    {log.location.name}
                  </td>
                  <td>
                    {log.overrideReason ? (
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: '#fef3c7',
                          color: '#92400e',
                          fontSize: 12,
                          fontWeight: 500,
                        }}
                      >
                        {log.overrideReason}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--ss-text-faint)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className='pagination'>
            <span>
              {Math.min((page - 1) * limit + 1, total)}–
              {Math.min(page * limit, total)} of {total}
            </span>
            <div className='pagination-controls'>
              <button
                className='btn btn-secondary btn-sm'
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Prev
              </button>
              <button
                className='btn btn-secondary btn-sm'
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
