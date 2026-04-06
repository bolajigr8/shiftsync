'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useToast } from '@/hooks/toast'

// ── Types ────────────────────────────────────────────────────────────────────

type ShiftAssignment = {
  id: string
  status: 'ASSIGNED' | 'CONFIRMED' | 'CANCELLED'
  shift: {
    id: string
    startTime: string
    endTime: string
    requiredSkill: string
    status: string
    locationId: string
    location: { id: string; name: string; timezone: string }
  }
}

type Coworker = { id: string; name: string }

// ── Helpers ──────────────────────────────────────────────────────────────────

const SKILL_LABELS: Record<string, string> = {
  BARTENDER: 'Bartender',
  LINE_COOK: 'Line Cook',
  SERVER: 'Server',
  HOST: 'Host',
}

const STATUS_STYLE: Record<string, string> = {
  ASSIGNED: 'badge-muted',
  CONFIRMED: 'badge-ok',
  CANCELLED: 'badge-error',
}

/** Format shift time in the location's own timezone */
function formatShiftTime(startISO: string, endISO: string, tz: string) {
  const opts = (
    extra?: Intl.DateTimeFormatOptions,
  ): Intl.DateTimeFormatOptions => ({
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    ...extra,
  })
  const dateLabel = new Date(startISO).toLocaleDateString('en-US', {
    timeZone: tz,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  const startTime = new Date(startISO).toLocaleTimeString('en-US', opts())
  const endTime = new Date(endISO).toLocaleTimeString(
    'en-US',
    opts({ timeZoneName: 'short' }),
  )
  return { dateLabel, startTime, endTime }
}

/** True when shift starts within 24 hours */
function within24h(startISO: string): boolean {
  return new Date(startISO).getTime() - Date.now() < 24 * 60 * 60 * 1000
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StaffSchedulePage() {
  const { data: session } = useSession()
  const { toast } = useToast()

  const [assignments, setAssignments] = useState<ShiftAssignment[]>([])
  const [coworkers, setCoworkers] = useState<Coworker[]>([])
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState<string | null>(null)

  // Swap / Drop dialog state
  const [swapOpen, setSwapOpen] = useState(false)
  const [swapAssignment, setSwapAssignment] = useState<ShiftAssignment | null>(
    null,
  )
  const [swapType, setSwapType] = useState<'SWAP' | 'DROP'>('SWAP')
  const [swapTarget, setSwapTarget] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [swapError, setSwapError] = useState('')

  // ── Data loading ─────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!session?.user) return
    setLoading(true)

    const [assignRes, userRes] = await Promise.all([
      fetch(`/api/assignments?userId=${session.user.id}`)
        .then((r) => r.json())
        .catch(() => ({ success: false })),
      // Fetch colleagues for the swap target selector (scoped to shared locations)
      fetch('/api/users')
        .then((r) => r.json())
        .catch(() => ({ success: false })),
    ])

    if (assignRes.success) {
      setAssignments(assignRes.data)
    }

    if (userRes.success) {
      setCoworkers(
        (userRes.data as (Coworker & { id: string })[]).filter(
          (u) => u.id !== session.user.id,
        ),
      )
    }

    setLoading(false)
  }, [session?.user?.id])

  useEffect(() => {
    load()
  }, [load])

  // ── Confirm assignment ────────────────────────────────────────────────────

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
      toast(data.error ?? 'Failed to confirm shift', 'error')
    }
    setConfirming(null)
  }

  // ── Swap / Drop dialog ────────────────────────────────────────────────────

  function openSwapDialog(assignment: ShiftAssignment) {
    setSwapAssignment(assignment)
    setSwapType('SWAP')
    setSwapTarget('')
    setSwapError('')
    setSwapOpen(true)
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
      toast(
        'Request submitted — your assignment stays active until a manager approves.',
        'success',
      )
    } else {
      setSwapError(data.error ?? 'Failed to submit request')
    }
    setSubmitting(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className='animate-in'>
      <div className='page-header'>
        <div>
          <h1 className='page-title'>My Schedule</h1>
          <p className='page-subtitle'>
            Upcoming shifts — times shown in each location's local timezone
          </p>
        </div>
      </div>

      {loading ? (
        <div className='loading-row'>Loading your schedule…</div>
      ) : assignments.length === 0 ? (
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
            const { dateLabel, startTime, endTime } = formatShiftTime(
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
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Skill + status badges */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 8,
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
                        {SKILL_LABELS[a.shift.requiredSkill] ??
                          a.shift.requiredSkill}
                      </span>
                      <span
                        className={`badge ${STATUS_STYLE[a.status] ?? 'badge-muted'}`}
                      >
                        {a.status}
                      </span>
                    </div>

                    {/* Location + time */}
                    <div
                      style={{ fontWeight: 600, fontSize: 15, marginBottom: 3 }}
                    >
                      {a.shift.location.name}
                    </div>
                    <div
                      style={{ fontSize: 14, color: 'var(--ss-text-muted)' }}
                    >
                      {dateLabel}
                    </div>
                    <div
                      style={{
                        fontSize: 13.5,
                        color: 'var(--ss-text-muted)',
                        marginTop: 2,
                      }}
                    >
                      {startTime} – {endTime}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: 'var(--ss-text-faint)',
                        marginTop: 3,
                      }}
                    >
                      Times shown in {a.shift.location.timezone}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      flexShrink: 0,
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                    }}
                  >
                    {a.status === 'ASSIGNED' && (
                      <button
                        className='btn btn-primary btn-sm'
                        disabled={confirming === a.id}
                        onClick={() => handleConfirm(a.id)}
                      >
                        {confirming === a.id ? 'Confirming…' : 'Confirm'}
                      </button>
                    )}

                    <button
                      className='btn btn-secondary btn-sm'
                      disabled={locked}
                      title={
                        locked
                          ? 'Cannot request a swap within 24 hours of shift start'
                          : undefined
                      }
                      style={{ opacity: locked ? 0.5 : 1 }}
                      onClick={() => {
                        if (!locked) openSwapDialog(a)
                      }}
                    >
                      {locked ? '🔒 Swap unavailable' : 'Request Swap / Drop'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Swap / Drop Dialog ── */}
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

                {/* Shift summary */}
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

                {/* Type toggle */}
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
                      : 'Open for any eligible staff member. A manager selects who picks it up.'}
                  </p>
                </div>

                {/* Swap target */}
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
                    {coworkers.length === 0 && (
                      <p
                        className='form-hint'
                        style={{ color: 'var(--ss-warn)' }}
                      >
                        No colleagues found at your location.
                      </p>
                    )}
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
