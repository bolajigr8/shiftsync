'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useToast } from '@/hooks/toast'

type ShiftAssignment = {
  id: string
  status: string
  shift: {
    id: string
    startTime: string
    endTime: string
    requiredSkill: string
    status: string
    locationId: string
    location: { name: string; timezone: string }
  }
}

type Coworker = { id: string; name: string }

const SKILL_LABELS: Record<string, string> = {
  BARTENDER: 'Bartender',
  LINE_COOK: 'Line Cook',
  SERVER: 'Server',
  HOST: 'Host',
}

const STATUS_BADGE: Record<string, string> = {
  ASSIGNED: 'badge-muted',
  CONFIRMED: 'badge-ok',
  CANCELLED: 'badge-error',
}

function formatShiftTime(start: string, end: string, tz: string) {
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }
  const startStr = new Date(start).toLocaleString('en-US', opts)
  const endStr = new Date(end).toLocaleTimeString('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
  })
  return { startStr, endStr }
}

function within24h(startTime: string) {
  return new Date(startTime).getTime() - Date.now() < 24 * 60 * 60 * 1000
}

export default function StaffSchedulePage() {
  const { data: session } = useSession()
  const { toast } = useToast()
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([])
  const [coworkers, setCoworkers] = useState<Coworker[]>([])
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState<string | null>(null)

  // Swap dialog state
  const [swapOpen, setSwapOpen] = useState(false)
  const [swapAssignment, setSwapAssignment] = useState<ShiftAssignment | null>(
    null,
  )
  const [swapType, setSwapType] = useState<'SWAP' | 'DROP'>('SWAP')
  const [swapTarget, setSwapTarget] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [swapError, setSwapError] = useState('')

  async function load() {
    if (!session?.user) return
    setLoading(true)
    // Fetch via swaps endpoint — assignments come from the shift assignments API
    const [swapRes, userRes] = await Promise.all([
      fetch('/api/swaps').then((r) => r.json()),
      fetch('/api/users').then((r) => r.json()),
    ])
    // For own assignments, derive from swap data or fetch directly
    const assignRes = await fetch(`/api/users/${session.user.id}`).then((r) =>
      r.json(),
    )
    // The user detail doesn't return assignments — use shifts list instead
    // Fetch published upcoming shifts where user is assigned
    const shiftsRes = await fetch('/api/swaps').then((r) => r.json())

    if (userRes.success) {
      setCoworkers(userRes.data.filter((u: any) => u.id !== session.user.id))
    }

    // Load actual assignments from assignments endpoint
    const aRes = await fetch(`/api/assignments?userId=${session.user.id}`)
      .then((r) => r.json())
      .catch(() => ({ success: false }))
    if (aRes.success) {
      setAssignments(
        aRes.data
          .filter(
            (a: ShiftAssignment) =>
              a.status !== 'CANCELLED' &&
              new Date(a.shift.startTime) > new Date(),
          )
          .sort(
            (a: ShiftAssignment, b: ShiftAssignment) =>
              new Date(a.shift.startTime).getTime() -
              new Date(b.shift.startTime).getTime(),
          ),
      )
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [session])

  async function handleConfirm(assignmentId: string) {
    setConfirming(assignmentId)
    const res = await fetch(`/api/assignments/${assignmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CONFIRMED' }),
    })
    const data = await res.json()
    if (data.success) {
      toast('Shift confirmed!', 'success')
      load()
    } else {
      toast(data.error ?? 'Failed to confirm', 'error')
    }
    setConfirming(null)
  }

  async function handleSwapSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!swapAssignment) return
    setSubmitting(true)
    setSwapError('')
    const res = await fetch('/api/swaps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assignmentId: swapAssignment.id,
        type: swapType,
        targetUserId: swapType === 'SWAP' ? swapTarget : undefined,
      }),
    })
    const data = await res.json()
    if (data.success) {
      setSwapOpen(false)
      toast('Swap request submitted', 'success')
    } else {
      setSwapError(data.error ?? 'Failed to submit request')
    }
    setSubmitting(false)
  }

  if (loading) return <div className='loading-row'>Loading your schedule…</div>

  return (
    <div className='animate-in'>
      <div className='page-header'>
        <div>
          <h1 className='page-title'>My Schedule</h1>
          <p className='page-subtitle'>
            Your upcoming shifts — times shown in each location's local timezone
          </p>
        </div>
      </div>

      {assignments.length === 0 ? (
        <div className='card'>
          <div className='empty-state'>
            <div className='empty-state-icon'>☀️</div>
            <div className='empty-state-title'>No upcoming shifts</div>
            <div className='empty-state-text'>
              You have no assigned shifts coming up. Check back after the next
              schedule is published.
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {assignments.map((a, i) => {
            const { startStr, endStr } = formatShiftTime(
              a.shift.startTime,
              a.shift.endTime,
              a.shift.location.timezone,
            )
            const locked = within24h(a.shift.startTime)
            return (
              <div key={a.id} className={`card animate-in delay-${i % 4}`}>
                <div
                  className='card-body'
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 6,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          padding: '2px 8px',
                          borderRadius: 100,
                          background: '#fff7ed',
                          color: 'var(--ss-accent)',
                          border: '1px solid #fed7aa',
                        }}
                      >
                        {SKILL_LABELS[a.shift.requiredSkill]}
                      </span>
                      <span
                        className={`badge ${STATUS_BADGE[a.status] ?? 'badge-muted'}`}
                      >
                        {a.status}
                      </span>
                    </div>
                    <div
                      style={{ fontWeight: 600, fontSize: 15, marginBottom: 3 }}
                    >
                      {a.shift.location.name}
                    </div>
                    <div
                      style={{ fontSize: 13.5, color: 'var(--ss-text-muted)' }}
                    >
                      {startStr} – {endStr}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--ss-text-faint)',
                        marginTop: 3,
                      }}
                    >
                      Times shown in {a.shift.location.timezone}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      flexShrink: 0,
                      flexWrap: 'wrap',
                      justifyContent: 'flex-end',
                    }}
                  >
                    {a.status === 'ASSIGNED' && (
                      <button
                        className='btn btn-primary btn-sm'
                        disabled={confirming === a.id}
                        onClick={() => handleConfirm(a.id)}
                      >
                        {confirming === a.id ? '…' : 'Confirm'}
                      </button>
                    )}

                    {/* Swap/Drop button with tooltip when locked */}
                    <div
                      style={{ position: 'relative' }}
                      className='swap-btn-wrap'
                    >
                      <button
                        className='btn btn-secondary btn-sm'
                        disabled={locked}
                        style={{ opacity: locked ? 0.5 : 1 }}
                        onClick={() => {
                          if (!locked) {
                            setSwapAssignment(a)
                            setSwapType('SWAP')
                            setSwapTarget('')
                            setSwapError('')
                            setSwapOpen(true)
                          }
                        }}
                        title={
                          locked
                            ? 'Cannot request a swap within 24 hours of shift start'
                            : ''
                        }
                      >
                        {locked ? '🔒 Swap unavailable' : 'Request Swap / Drop'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Swap / Drop Dialog */}
      {swapOpen && swapAssignment && (
        <div
          className='modal-backdrop'
          onClick={(e) => {
            if (e.target === e.currentTarget) setSwapOpen(false)
          }}
        >
          <div className='modal'>
            <div className='modal-header'>
              <span className='modal-title'>Request Swap or Drop</span>
              <button
                className='btn btn-ghost btn-sm'
                onClick={() => setSwapOpen(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSwapSubmit}>
              <div className='modal-body'>
                {swapError && (
                  <div className='alert alert-error'>{swapError}</div>
                )}

                <div
                  style={{
                    background: '#faf9f7',
                    borderRadius: 8,
                    padding: '12px 14px',
                    marginBottom: 16,
                    fontSize: 13.5,
                  }}
                >
                  <strong>{swapAssignment.shift.location.name}</strong>
                  <span
                    style={{ color: 'var(--ss-text-muted)', marginLeft: 8 }}
                  >
                    {new Date(
                      swapAssignment.shift.startTime,
                    ).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>

                <div className='form-group'>
                  <label className='form-label'>Type</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(['SWAP', 'DROP'] as const).map((t) => (
                      <button
                        key={t}
                        type='button'
                        className={`btn ${swapType === t ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setSwapType(t)}
                      >
                        {t === 'SWAP'
                          ? '🔄 Swap with someone'
                          : '📤 Drop shift'}
                      </button>
                    ))}
                  </div>
                  <p className='form-hint' style={{ marginTop: 8 }}>
                    {swapType === 'SWAP'
                      ? 'Choose a colleague to swap with. They must accept before a manager approves.'
                      : 'Open to any eligible staff member. Manager selects who picks it up.'}
                  </p>
                </div>

                {swapType === 'SWAP' && (
                  <div className='form-group'>
                    <label className='form-label'>Swap with *</label>
                    <select
                      className='form-select'
                      required
                      value={swapTarget}
                      onChange={(e) => setSwapTarget(e.target.value)}
                    >
                      <option value=''>Select colleague…</option>
                      {coworkers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className='modal-footer'>
                <button
                  type='button'
                  className='btn btn-secondary'
                  onClick={() => setSwapOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type='submit'
                  className='btn btn-primary'
                  disabled={submitting}
                >
                  {submitting ? 'Submitting…' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
