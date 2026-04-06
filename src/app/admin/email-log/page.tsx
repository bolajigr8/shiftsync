'use client'

import React, { useEffect, useState } from 'react'

type EmailLog = {
  id: string
  toEmail: string
  subject: string
  body: string
  notificationType: string
  createdAt: string
  toUser: { name: string }
}

export default function EmailLogPage() {
  const [logs, setLogs] = useState<EmailLog[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState('')
  const limit = 20

  async function load() {
    setLoading(true)
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    })
    if (typeFilter) params.set('notificationType', typeFilter)
    const res = await fetch(`/api/email-log?${params}`)
    const data = await res.json()
    if (data.success) {
      setLogs(data.data.logs)
      setTotal(data.data.pagination.total)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [page, typeFilter])

  const totalPages = Math.ceil(total / limit)

  const TYPES = [
    'SHIFT_ASSIGNED',
    'SCHEDULE_PUBLISHED',
    'SHIFT_CHANGED',
    'SWAP_REQUEST',
    'SWAP_ACCEPTED',
    'SWAP_REJECTED',
    'MANAGER_APPROVAL_NEEDED',
    'COVERAGE_NEEDED',
  ]

  return (
    <div className='animate-in'>
      <div className='page-header'>
        <div>
          <h1 className='page-title'>Email Log</h1>
          <p className='page-subtitle'>
            Simulated outgoing notifications — {total} total
          </p>
        </div>
        <div className='badge badge-info' style={{ fontSize: 12 }}>
          Simulation only — no real emails sent
        </div>
      </div>

      <div className='filters-row'>
        <select
          className='form-select'
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value)
            setPage(1)
          }}
        >
          <option value=''>All types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      <div className='ss-table-wrap'>
        <table className='ss-table'>
          <thead>
            <tr>
              <th>Time</th>
              <th>Recipient</th>
              <th>Type</th>
              <th>Subject</th>
              <th>Preview</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className='loading-row'>
                  Loading…
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className='empty-state'>
                    <div className='empty-state-icon'>📧</div>
                    <div className='empty-state-title'>No emails yet</div>
                    <div className='empty-state-text'>
                      Simulated emails will appear here as notifications are
                      sent.
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <React.Fragment key={log.id}>
                  <tr
                    style={{ cursor: 'pointer' }}
                    onClick={() =>
                      setExpanded(expanded === log.id ? null : log.id)
                    }
                  >
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
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{log.toUser.name}</div>
                      <div
                        style={{ fontSize: 12, color: 'var(--ss-text-faint)' }}
                      >
                        {log.toEmail}
                      </div>
                    </td>
                    <td>
                      <span className='badge badge-info'>
                        {log.notificationType.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ fontSize: 13 }}>{log.subject}</td>
                    <td>
                      <span
                        style={{
                          fontSize: 12,
                          color: 'var(--ss-accent)',
                          fontWeight: 500,
                        }}
                      >
                        {expanded === log.id ? 'Hide ▲' : 'View ▼'}
                      </span>
                    </td>
                  </tr>
                  {expanded === log.id && (
                    <tr>
                      <td
                        colSpan={5}
                        style={{ background: '#faf9f7', padding: '16px 20px' }}
                      >
                        <div
                          style={{
                            background: 'white',
                            border: '1px solid var(--ss-border)',
                            borderRadius: 8,
                            padding: '16px 20px',
                            fontSize: 13.5,
                            lineHeight: 1.6,
                            color: 'var(--ss-text)',
                            maxWidth: 600,
                          }}
                        >
                          {log.body}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className='pagination'>
            <span>
              Showing {Math.min((page - 1) * limit + 1, total)}–
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
