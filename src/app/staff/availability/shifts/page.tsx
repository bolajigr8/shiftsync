'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useToast } from '@/hooks/toast'

type OpenShift = {
  id: string
  startTime: string
  endTime: string
  requiredSkill: string
  headcountNeeded: number
  isPremium: boolean
  location: { name: string; timezone: string }
  assignments: { status: string }[]
}

type DroppedShift = {
  id: string
  type: string
  status: string
  expiresAt: string
  assignment: {
    shift: {
      id: string
      startTime: string
      endTime: string
      requiredSkill: string
      location: { name: string; timezone: string }
    }
  }
  requester: { name: string }
}

type PreviewData = {
  regularHours: number
  overtimeHours: number
  projectedCost: number
  constraints: { allowed: boolean; warning?: string; reason?: string }[]
}

const SKILL_LABELS: Record<string, string> = {
  BARTENDER: 'Bartender',
  LINE_COOK: 'Line Cook',
  SERVER: 'Server',
  HOST: 'Host',
}

function fmtTime(iso: string, tz: string) {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function AvailableShiftsPage() {
  const { data: session } = useSession()
  const { toast } = useToast()
  const [tab, setTab] = useState<'open' | 'dropped'>('open')
  const [openShifts, setOpenShifts] = useState<OpenShift[]>([])
  const [droppedShifts, setDroppedShifts] = useState<DroppedShift[]>([])
  const [loading, setLoading] = useState(true)

  // Pick up preview
  const [previewShiftId, setPreviewShiftId] = useState<string | null>(null)
  const [previewAssignmentId, setPreviewAssignmentId] = useState<string | null>(
    null,
  )
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewFailures, setPreviewFailures] = useState<{ reason?: string }[]>(
    [],
  )
  const [picking, setPicking] = useState(false)

  useEffect(() => {
    if (!session?.user) return
    setLoading(true)
    Promise.all([
      // Open shifts: published with unfilled headcount — filter client-side
      fetch('/api/shifts?status=PUBLISHED')
        .then((r) => r.json())
        .catch(() => ({ success: false })),
      // Dropped shifts
      fetch('/api/swaps')
        .then((r) => r.json())
        .catch(() => ({ success: false })),
    ]).then(([shiftsData, swapsData]) => {
      if (shiftsData.success) {
        const filtered =
          shiftsData.data?.filter((s: OpenShift) => {
            const filled = s.assignments.filter(
              (a: any) => a.status !== 'CANCELLED',
            ).length
            return (
              filled < s.headcountNeeded && new Date(s.startTime) > new Date()
            )
          }) ?? []
        setOpenShifts(filtered)
      }
      if (swapsData.success) {
        const drops =
          swapsData.data?.filter(
            (s: DroppedShift) => s.type === 'DROP' && s.status === 'PENDING',
          ) ?? []
        setDroppedShifts(drops)
      }
      setLoading(false)
    })
  }, [session])

  async function openPreview(shiftId: string, assignmentId?: string) {
    setPreviewShiftId(shiftId)
    setPreviewAssignmentId(assignmentId ?? null)
    setPreviewLoading(true)
    setPreview(null)
    setPreviewFailures([])

    const params = new URLSearchParams({ shiftId })
    if (session?.user.id) params.set('userId', session.user.id)
    const res = await fetch(`/api/assignments/preview?${params}`)
    const data = await res.json()

    if (data.success) setPreview(data.data)
    else if (data.failures) setPreviewFailures(data.failures)
    setPreviewLoading(false)
  }

  async function confirmPickUp() {
    if (!previewShiftId || !session?.user) return
    setPicking(true)
    const res = await fetch('/api/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shiftId: previewShiftId,
        userId: session.user.id,
      }),
    })
    const data = await res.json()
    if (data.success) {
      toast('Shift picked up!', 'success')
      setPreviewShiftId(null)
      setOpenShifts((prev) => prev.filter((s) => s.id !== previewShiftId))
    } else {
      toast(data.error ?? 'Failed to pick up shift', 'error')
    }
    setPicking(false)
  }

  const TABS = [
    { key: 'open', label: `Open Shifts (${openShifts.length})` },
    { key: 'dropped', label: `Dropped Shifts (${droppedShifts.length})` },
  ] as const

  return (
    <div className='animate-in'>
      <div className='page-header'>
        <div>
          <h1 className='page-title'>Available Shifts</h1>
          <p className='page-subtitle'>
            Pick up open shifts or dropped shifts from colleagues
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 0,
          marginBottom: 20,
          borderBottom: '2px solid var(--ss-border)',
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className='btn btn-ghost'
            style={{
              borderRadius: 0,
              borderBottom:
                tab === t.key
                  ? '2px solid var(--ss-accent)'
                  : '2px solid transparent',
              marginBottom: -2,
              color:
                tab === t.key ? 'var(--ss-accent)' : 'var(--ss-text-muted)',
              fontWeight: tab === t.key ? 600 : 400,
              padding: '8px 16px',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className='loading-row'>Loading…</div>
      ) : tab === 'open' ? (
        openShifts.length === 0 ? (
          <div className='card'>
            <div className='empty-state'>
              <div className='empty-state-icon'>✅</div>
              <div className='empty-state-title'>No open shifts</div>
              <div className='empty-state-text'>
                All published shifts are fully staffed.
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {openShifts.map((shift, i) => {
              const filled = shift.assignments.filter(
                (a) => a.status !== 'CANCELLED',
              ).length
              return (
                <div
                  key={shift.id}
                  className={`card animate-in delay-${i % 4}`}
                >
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
                          gap: 8,
                          marginBottom: 6,
                          flexWrap: 'wrap',
                        }}
                      >
                        <span className='badge badge-accent'>
                          {SKILL_LABELS[shift.requiredSkill]}
                        </span>
                        {shift.isPremium && (
                          <span className='badge badge-accent'>★ Premium</span>
                        )}
                        <span className='badge badge-warn'>
                          {filled}/{shift.headcountNeeded} filled
                        </span>
                      </div>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 15,
                          marginBottom: 3,
                        }}
                      >
                        {shift.location.name}
                      </div>
                      <div
                        style={{
                          fontSize: 13.5,
                          color: 'var(--ss-text-muted)',
                        }}
                      >
                        {fmtTime(shift.startTime, shift.location.timezone)} –{' '}
                        {new Date(shift.endTime).toLocaleTimeString('en-US', {
                          timeZone: shift.location.timezone,
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                    <button
                      className='btn btn-primary btn-sm'
                      onClick={() => openPreview(shift.id)}
                    >
                      Pick Up
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : droppedShifts.length === 0 ? (
        <div className='card'>
          <div className='empty-state'>
            <div className='empty-state-icon'>🔄</div>
            <div className='empty-state-title'>No dropped shifts</div>
            <div className='empty-state-text'>
              No colleagues have dropped shifts available for pickup.
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {droppedShifts.map((swap, i) => {
            const shift = swap.assignment.shift
            return (
              <div key={swap.id} className={`card animate-in delay-${i % 4}`}>
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
                        fontSize: 12.5,
                        color: 'var(--ss-text-muted)',
                        marginBottom: 4,
                      }}
                    >
                      Dropped by <strong>{swap.requester.name}</strong> ·
                      Expires {new Date(swap.expiresAt).toLocaleDateString()}
                    </div>
                    <div
                      style={{ fontWeight: 600, fontSize: 15, marginBottom: 3 }}
                    >
                      {shift.location.name}
                    </div>
                    <div
                      style={{ fontSize: 13.5, color: 'var(--ss-text-muted)' }}
                    >
                      {fmtTime(shift.startTime, shift.location.timezone)}
                    </div>
                    <span
                      className='badge badge-accent'
                      style={{ marginTop: 6 }}
                    >
                      {SKILL_LABELS[shift.requiredSkill]}
                    </span>
                  </div>
                  <button
                    className='btn btn-primary btn-sm'
                    onClick={() => openPreview(shift.id)}
                  >
                    Pick Up
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pick-up preview modal */}
      {previewShiftId && (
        <div
          className='modal-backdrop'
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewShiftId(null)
          }}
        >
          <div className='modal' style={{ maxWidth: 480 }}>
            <div className='modal-header'>
              <span className='modal-title'>Shift Preview</span>
              <button
                className='btn btn-ghost btn-sm'
                onClick={() => setPreviewShiftId(null)}
              >
                ✕
              </button>
            </div>
            <div className='modal-body'>
              {previewLoading && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: 24,
                    color: 'var(--ss-text-muted)',
                  }}
                >
                  Checking constraints…
                </div>
              )}

              {previewFailures.length > 0 && (
                <>
                  <div className='alert alert-error'>
                    You cannot pick up this shift:
                  </div>
                  {previewFailures.map((f, i) => (
                    <div
                      key={i}
                      style={{
                        color: 'var(--ss-error)',
                        fontSize: 13.5,
                        marginTop: 8,
                      }}
                    >
                      ✕ {f.reason}
                    </div>
                  ))}
                </>
              )}

              {preview && previewFailures.length === 0 && (
                <div>
                  <div
                    style={{
                      background: '#faf9f7',
                      borderRadius: 8,
                      padding: '14px 16px',
                      marginBottom: 14,
                    }}
                  >
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '10px 20px',
                      }}
                    >
                      {[
                        {
                          label: 'Regular Hours',
                          val: `${preview.regularHours.toFixed(1)}h`,
                        },
                        {
                          label: 'Overtime Hours',
                          val: `${preview.overtimeHours.toFixed(1)}h`,
                        },
                        {
                          label: 'Projected Cost',
                          val: `$${preview.projectedCost.toFixed(2)}`,
                          span: true,
                        },
                      ].map((item) => (
                        <div
                          key={item.label}
                          style={{
                            gridColumn: (item as any).span
                              ? '1 / -1'
                              : undefined,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                              color: 'var(--ss-text-muted)',
                            }}
                          >
                            {item.label}
                          </div>
                          <div
                            style={{
                              fontSize: 18,
                              fontWeight: 700,
                              fontFamily: 'Fraunces, serif',
                            }}
                          >
                            {item.val}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {preview.constraints
                    ?.filter((c) => c.warning)
                    .map((c, i) => (
                      <div
                        key={i}
                        style={{
                          color: 'var(--ss-warn)',
                          fontSize: 13.5,
                          marginBottom: 6,
                        }}
                      >
                        ⚠ {c.warning}
                      </div>
                    ))}
                </div>
              )}
            </div>
            {previewFailures.length === 0 && preview && (
              <div className='modal-footer'>
                <button
                  className='btn btn-secondary'
                  onClick={() => setPreviewShiftId(null)}
                >
                  Cancel
                </button>
                <button
                  className='btn btn-primary'
                  disabled={picking}
                  onClick={confirmPickUp}
                >
                  {picking ? 'Picking up…' : 'Confirm Pick Up'}
                </button>
              </div>
            )}
            {previewFailures.length > 0 && (
              <div className='modal-footer'>
                <button
                  className='btn btn-secondary'
                  onClick={() => setPreviewShiftId(null)}
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
