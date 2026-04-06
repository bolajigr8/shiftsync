'use client'

import { useEffect, useState } from 'react'

type SwapRequest = {
  id: string
  type: string
  status: string
  expiresAt: string
  assignment: {
    shift: {
      startTime: string
      endTime: string
      requiredSkill: string
      locationId: string
      location: { name: string }
    }
  }
  requester: { id: string; name: string }
  target: { id: string; name: string } | null
}

function formatDT(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function ManagerSwapsPage() {
  const [swaps, setSwaps] = useState<SwapRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [pickupUserId, setPickupUserId] = useState('')
  const [approveDropId, setApproveDropId] = useState<string | null>(null)
  const [eligibleStaff, setEligibleStaff] = useState<
    { id: string; name: string }[]
  >([])
  const [working, setWorking] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const res = await fetch('/api/swaps')
    const data = await res.json()
    if (data.success) setSwaps(data.data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleApprove(swap: SwapRequest) {
    if (swap.type === 'DROP') {
      // need to pick a staff member
      const locId = swap.assignment.shift.locationId
      const res = await fetch(`/api/users?locationId=${locId}`)
      const data = await res.json()
      if (data.success)
        setEligibleStaff(
          data.data.map((u: any) => ({ id: u.id, name: u.name })),
        )
      setApproveDropId(swap.id)
      return
    }
    setWorking(swap.id)
    setError('')
    const res = await fetch(`/api/swaps/${swap.id}/approve`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    const data = await res.json()
    if (!data.success) setError(data.error ?? 'Failed to approve')
    setWorking(null)
    load()
  }

  async function confirmDropApprove() {
    if (!approveDropId || !pickupUserId) return
    setWorking(approveDropId)
    const res = await fetch(`/api/swaps/${approveDropId}/approve`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pickupUserId }),
    })
    const data = await res.json()
    if (!data.success) setError(data.error ?? 'Failed to approve')
    setApproveDropId(null)
    setPickupUserId('')
    setWorking(null)
    load()
  }

  async function handleReject() {
    if (!rejectId || !rejectReason.trim()) return
    setWorking(rejectId)
    const res = await fetch(`/api/swaps/${rejectId}/reject`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: rejectReason }),
    })
    const data = await res.json()
    if (!data.success) setError(data.error ?? 'Failed to reject')
    setRejectId(null)
    setRejectReason('')
    setWorking(null)
    load()
  }

  return (
    <div className='animate-in'>
      <div className='page-header'>
        <div>
          <h1 className='page-title'>Swap Requests</h1>
          <p className='page-subtitle'>
            {swaps.length} pending approval{swaps.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {error && <div className='alert alert-error'>{error}</div>}

      {loading ? (
        <div className='loading-row'>Loading…</div>
      ) : swaps.length === 0 ? (
        <div className='card'>
          <div className='empty-state'>
            <div className='empty-state-icon'>🔄</div>
            <div className='empty-state-title'>No pending swap requests</div>
            <div className='empty-state-text'>
              All caught up! Swap requests requiring your approval will appear
              here.
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {swaps.map((swap) => {
            const shift = swap.assignment.shift
            const isExpiringSoon =
              new Date(swap.expiresAt) <
              new Date(Date.now() + 2 * 60 * 60 * 1000)
            return (
              <div key={swap.id} className='card animate-in'>
                <div className='card-body'>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 16,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          marginBottom: 8,
                        }}
                      >
                        <span
                          className={`badge ${swap.type === 'SWAP' ? 'badge-info' : 'badge-warn'}`}
                        >
                          {swap.type}
                        </span>
                        {isExpiringSoon && (
                          <span className='badge badge-error'>
                            Expiring soon
                          </span>
                        )}
                      </div>

                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 15,
                          marginBottom: 4,
                        }}
                      >
                        {formatDT(shift.startTime)} –{' '}
                        {new Date(shift.endTime).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: 'var(--ss-text-muted)',
                          marginBottom: 10,
                        }}
                      >
                        {shift.location.name} ·{' '}
                        {shift.requiredSkill.replace('_', ' ')}
                      </div>

                      <div style={{ fontSize: 13.5 }}>
                        <span style={{ color: 'var(--ss-text-muted)' }}>
                          From:{' '}
                        </span>
                        <strong>{swap.requester.name}</strong>
                        {swap.target && (
                          <>
                            <span style={{ color: 'var(--ss-text-muted)' }}>
                              {' '}
                              → To:{' '}
                            </span>
                            <strong>{swap.target.name}</strong>
                          </>
                        )}
                        {swap.type === 'DROP' && (
                          <span style={{ color: 'var(--ss-text-muted)' }}>
                            {' '}
                            → Open pickup
                          </span>
                        )}
                      </div>

                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--ss-text-faint)',
                          marginTop: 6,
                        }}
                      >
                        Expires {formatDT(swap.expiresAt)}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button
                        className='btn btn-primary btn-sm'
                        disabled={working === swap.id}
                        onClick={() => handleApprove(swap)}
                      >
                        Approve
                      </button>
                      <button
                        className='btn btn-danger btn-sm'
                        disabled={working === swap.id}
                        onClick={() => {
                          setRejectId(swap.id)
                          setRejectReason('')
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Reject modal */}
      {rejectId && (
        <div
          className='modal-backdrop'
          onClick={(e) => {
            if (e.target === e.currentTarget) setRejectId(null)
          }}
        >
          <div className='modal'>
            <div className='modal-header'>
              <span className='modal-title'>Reject Swap Request</span>
              <button
                className='btn btn-ghost btn-sm'
                onClick={() => setRejectId(null)}
              >
                ✕
              </button>
            </div>
            <div className='modal-body'>
              <div className='form-group'>
                <label className='form-label'>Reason for rejection *</label>
                <textarea
                  className='form-textarea'
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder='Please provide a reason that will be shared with the staff member…'
                />
              </div>
            </div>
            <div className='modal-footer'>
              <button
                className='btn btn-secondary'
                onClick={() => setRejectId(null)}
              >
                Cancel
              </button>
              <button
                className='btn btn-danger'
                disabled={!rejectReason.trim() || !!working}
                onClick={handleReject}
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DROP approve modal */}
      {approveDropId && (
        <div
          className='modal-backdrop'
          onClick={(e) => {
            if (e.target === e.currentTarget) setApproveDropId(null)
          }}
        >
          <div className='modal'>
            <div className='modal-header'>
              <span className='modal-title'>
                Approve Drop — Select Pickup Staff
              </span>
              <button
                className='btn btn-ghost btn-sm'
                onClick={() => setApproveDropId(null)}
              >
                ✕
              </button>
            </div>
            <div className='modal-body'>
              <p
                style={{
                  fontSize: 13.5,
                  color: 'var(--ss-text-muted)',
                  marginBottom: 16,
                }}
              >
                This is a DROP request. Select the staff member who will pick up
                the shift.
              </p>
              <div className='form-group'>
                <label className='form-label'>Pick up staff member *</label>
                <select
                  className='form-select'
                  value={pickupUserId}
                  onChange={(e) => setPickupUserId(e.target.value)}
                >
                  <option value=''>Select staff…</option>
                  {eligibleStaff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className='modal-footer'>
              <button
                className='btn btn-secondary'
                onClick={() => setApproveDropId(null)}
              >
                Cancel
              </button>
              <button
                className='btn btn-primary'
                disabled={!pickupUserId || !!working}
                onClick={confirmDropApprove}
              >
                Confirm Approval
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
