'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'

// ── Types ────────────────────────────────────────────────────────────────────

type Shift = {
  id: string
  locationId: string
  requiredSkill: string
  startTime: string
  endTime: string
  headcountNeeded: number
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED'
  isPremium: boolean
  assignments: {
    id: string
    userId: string
    status: string
    user: { id: string; name: string }
  }[]
}

type StaffUser = {
  id: string
  name: string
  role: string
  skills: { skill: string }[]
  weeklyHours?: number
}

type ConstraintResult = {
  allowed: boolean
  warning?: string
  reason?: string
  suggestions?: { userId: string; name: string }[]
}

type PreviewResult = {
  regularHours: number
  overtimeHours: number
  projectedCost: number
  constraints: ConstraintResult[]
  staffName: string
  currentHours: number
  projectedHours: number
}

type OvertimeEntry = {
  userId: string
  name: string
  totalHours: number
  status: 'OK' | 'WARNING' | 'OVERTIME'
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SKILL_LABELS: Record<string, string> = {
  BARTENDER: 'Bartender',
  LINE_COOK: 'Line Cook',
  SERVER: 'Server',
  HOST: 'Host',
}
const SKILL_COLOR: Record<string, string> = {
  BARTENDER: '#ea580c',
  LINE_COOK: '#0284c7',
  SERVER: '#059669',
  HOST: '#7c3aed',
}

function getWeekStart(ref = new Date()) {
  const d = new Date(ref)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d
}
function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}
function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}
function getMondayISO() {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function SchedulePage() {
  const { locationId } = useParams<{ locationId: string }>()
  const { data: session } = useSession()

  const [weekStart, setWeekStart] = useState(() => getWeekStart())
  const [shifts, setShifts] = useState<Shift[]>([])
  const [overtimeData, setOvertimeData] = useState<OvertimeEntry[]>([])
  const [locationName, setLocationName] = useState('')
  const [locationTz, setLocationTz] = useState('UTC')
  const [loading, setLoading] = useState(true)
  const [conflictShiftId, setConflictShiftId] = useState<string | null>(null)

  // Create shift dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [createDay, setCreateDay] = useState('')
  const [createForm, setCreateForm] = useState({
    date: '',
    startTime: '09:00',
    endTime: '17:00',
    requiredSkill: 'SERVER',
    headcountNeeded: 1,
  })
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)

  // Shift detail sheet
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [staffList, setStaffList] = useState<StaffUser[]>([])
  const [staffSearch, setStaffSearch] = useState('')
  const [selectedStaff, setSelectedStaff] = useState<StaffUser | null>(null)

  // What-if preview dialog
  const [previewOpen, setPreviewOpen] = useState(false)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewFailures, setPreviewFailures] = useState<ConstraintResult[]>([])
  const [assigning, setAssigning] = useState(false)

  // Publish week
  const [publishWarning, setPublishWarning] = useState<Shift[]>([])
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadShifts = useCallback(async () => {
    if (!locationId) return
    setLoading(true)
    const params = new URLSearchParams({
      locationId,
      weekStart: weekStart.toISOString(),
    })
    const res = await fetch(`/api/shifts?${params}`)
    const data = await res.json()
    if (data.success) setShifts(data.data)
    setLoading(false)
  }, [locationId, weekStart])

  const loadOvertime = useCallback(async () => {
    if (!locationId) return
    const res = await fetch(
      `/api/analytics/overtime?locationId=${locationId}&weekStart=${getMondayISO()}`,
    )
    const data = await res.json()
    if (data.success) setOvertimeData(data.data)
  }, [locationId])

  useEffect(() => {
    if (!locationId) return
    fetch('/api/admin/locations')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          const loc = d.data.find((l: any) => l.id === locationId)
          if (loc) {
            setLocationName(loc.name)
            setLocationTz(loc.timezone)
          }
        }
      })
  }, [locationId])

  useEffect(() => {
    loadShifts()
  }, [loadShifts])
  useEffect(() => {
    loadOvertime()
  }, [loadOvertime])

  // Supabase realtime
  useEffect(() => {
    if (!locationId) return
    let channel: any
    import('@/lib/supabase').then(({ getBrowserSupabase }) => {
      const supabase = getBrowserSupabase()
      channel = supabase
        .channel(`schedule:${locationId}`)
        .on('broadcast', { event: 'schedule_updated' }, () => {
          loadShifts()
          loadOvertime()
        })
        .subscribe()
    })
    return () => {
      channel?.unsubscribe()
    }
  }, [locationId, loadShifts, loadOvertime])

  // ── Shift grid helpers ────────────────────────────────────────────────────

  const shiftsByDay = DAYS.map((_, dow) => {
    const day = addDays(weekStart, dow)
    return shifts.filter((s) => {
      const sd = new Date(s.startTime)
      return (
        sd.getFullYear() === day.getFullYear() &&
        sd.getMonth() === day.getMonth() &&
        sd.getDate() === day.getDate()
      )
    })
  })

  const today = new Date()

  // ── Create shift ──────────────────────────────────────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!createForm.date) return
    setCreating(true)
    setCreateError('')

    const localStart = `${createForm.date}T${createForm.startTime}:00`
    let localEnd = `${createForm.date}T${createForm.endTime}:00`
    // Overnight: if end ≤ start, add a day
    if (createForm.endTime <= createForm.startTime) {
      const nextDay = addDays(new Date(createForm.date), 1)
      localEnd = `${nextDay.toISOString().split('T')[0]}T${createForm.endTime}:00`
    }

    const res = await fetch('/api/shifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locationId,
        requiredSkill: createForm.requiredSkill,
        startTime: new Date(localStart).toISOString(),
        endTime: new Date(localEnd).toISOString(),
        headcountNeeded: createForm.headcountNeeded,
      }),
    })
    const data = await res.json()
    if (data.success) {
      setCreateOpen(false)
      setCreateForm({
        date: '',
        startTime: '09:00',
        endTime: '17:00',
        requiredSkill: 'SERVER',
        headcountNeeded: 1,
      })
      loadShifts()
    } else {
      setCreateError(data.error ?? 'Failed to create shift')
    }
    setCreating(false)
  }

  // ── Open shift detail sheet ───────────────────────────────────────────────

  async function openShift(shift: Shift) {
    setSelectedShift(shift)
    setSheetOpen(true)
    setStaffSearch('')
    setSelectedStaff(null)
    setPreviewFailures([])

    const res = await fetch(
      `/api/users?locationId=${shift.locationId}&skill=${shift.requiredSkill}`,
    )
    const data = await res.json()
    if (data.success) {
      const assigned = new Set(
        shift.assignments
          .filter((a) => a.status !== 'CANCELLED')
          .map((a) => a.userId),
      )
      setStaffList(data.data.filter((u: StaffUser) => !assigned.has(u.id)))
    }
  }

  // ── What-if preview ───────────────────────────────────────────────────────

  async function openPreview(staff: StaffUser) {
    if (!selectedShift) return
    setSelectedStaff(staff)
    setPreviewLoading(true)
    setPreviewOpen(true)
    setPreviewFailures([])
    setPreview(null)

    const params = new URLSearchParams({
      userId: staff.id,
      shiftId: selectedShift.id,
    })
    const res = await fetch(`/api/assignments/preview?${params}`)
    const data = await res.json()

    if (data.success) {
      setPreview(data.data)
    } else if (data.failures) {
      setPreviewFailures(data.failures)
    }
    setPreviewLoading(false)
  }

  // ── Confirm assignment ────────────────────────────────────────────────────

  async function confirmAssign() {
    if (!selectedShift || !selectedStaff) return
    setAssigning(true)

    const res = await fetch('/api/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shiftId: selectedShift.id,
        userId: selectedStaff.id,
      }),
    })
    const data = await res.json()

    if (res.status === 409) {
      // Conflict — another manager just assigned this slot
      setConflictShiftId(selectedShift.id)
      setTimeout(() => setConflictShiftId(null), 5000)
      setPreviewOpen(false)
      setSheetOpen(false)
      loadShifts()
    } else if (data.success) {
      setPreviewOpen(false)
      setSheetOpen(false)
      loadShifts()
      loadOvertime()
    } else if (data.failures) {
      setPreviewFailures(data.failures)
      setPreview(null)
    }
    setAssigning(false)
  }

  // ── Publish week ──────────────────────────────────────────────────────────

  function handlePublishWeek() {
    const draftShifts = shifts.filter((s) => s.status === 'DRAFT')
    const understaffed = draftShifts.filter((s) => {
      const filled = s.assignments.filter(
        (a) => a.status !== 'CANCELLED',
      ).length
      return filled < s.headcountNeeded
    })
    if (understaffed.length > 0) {
      setPublishWarning(understaffed)
      setPublishConfirmOpen(true)
    } else {
      publishAll(draftShifts)
    }
  }

  async function publishAll(draftShifts: Shift[]) {
    setPublishing(true)
    await Promise.all(
      draftShifts.map((s) =>
        fetch(`/api/shifts/${s.id}/publish`, { method: 'POST' }),
      ),
    )
    setPublishConfirmOpen(false)
    setPublishing(false)
    loadShifts()
  }

  const draftCount = shifts.filter((s) => s.status === 'DRAFT').length

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className='animate-in'
      style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}
    >
      {/* ── Main 75% ── */}
      <div style={{ flex: '0 0 75%', minWidth: 0 }}>
        {/* Header */}
        <div className='page-header'>
          <div>
            <h1 className='page-title'>{locationName || 'Schedule'}</h1>
            <p className='page-subtitle'>
              {weekStart.toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
              })}{' '}
              –{' '}
              {addDays(weekStart, 6).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className='btn btn-ghost btn-sm'
              onClick={() => setWeekStart((w) => addDays(w, -7))}
            >
              ← Prev
            </button>
            <button
              className='btn btn-ghost btn-sm'
              onClick={() => setWeekStart(getWeekStart())}
            >
              Today
            </button>
            <button
              className='btn btn-ghost btn-sm'
              onClick={() => setWeekStart((w) => addDays(w, 7))}
            >
              Next →
            </button>
            {draftCount > 0 && (
              <button
                className='btn btn-primary btn-sm'
                onClick={handlePublishWeek}
                disabled={publishing}
              >
                Publish Week ({draftCount} drafts)
              </button>
            )}
          </div>
        </div>

        {/* Conflict toast */}
        {conflictShiftId && (
          <div className='alert alert-error' style={{ marginBottom: 16 }}>
            ⚠ This staff member was just assigned to this time slot by another
            manager. The shift has been refreshed.
          </div>
        )}

        {/* 7-column grid */}
        {loading ? (
          <div className='loading-row'>Loading schedule…</div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 8,
            }}
          >
            {/* Day headers */}
            {DAYS.map((day, dow) => {
              const d = addDays(weekStart, dow)
              const isToday = d.toDateString() === today.toDateString()
              return (
                <div key={day} style={{ textAlign: 'center', marginBottom: 4 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: isToday
                        ? 'var(--ss-accent)'
                        : 'var(--ss-text-muted)',
                    }}
                  >
                    {day}
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      fontFamily: 'Fraunces, serif',
                      color: isToday ? 'var(--ss-accent)' : 'var(--ss-text)',
                      lineHeight: 1.1,
                    }}
                  >
                    {d.getDate()}
                  </div>
                </div>
              )
            })}

            {/* Shift columns */}
            {shiftsByDay.map((dayShifts, dow) => {
              const day = addDays(weekStart, dow)
              const dateStr = day.toISOString().split('T')[0]
              return (
                <div
                  key={dow}
                  style={{
                    minHeight: 120,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  {/* Shift cards */}
                  {dayShifts.map((shift) => {
                    const filled = shift.assignments.filter(
                      (a) => a.status !== 'CANCELLED',
                    ).length
                    const unfilled = shift.headcountNeeded - filled
                    const isConflict = shift.id === conflictShiftId
                    return (
                      <div
                        key={shift.id}
                        onClick={() => openShift(shift)}
                        style={{
                          background: 'white',
                          border: `1px solid ${isConflict ? 'var(--ss-warn)' : 'var(--ss-border)'}`,
                          borderLeft: `3px solid ${SKILL_COLOR[shift.requiredSkill] ?? 'var(--ss-accent)'}`,
                          borderRadius: 8,
                          padding: '8px 10px',
                          cursor: 'pointer',
                          boxShadow: isConflict
                            ? '0 0 0 2px rgba(217,119,6,0.3)'
                            : 'var(--ss-shadow)',
                          transition: 'box-shadow 0.15s',
                          opacity: shift.status === 'CANCELLED' ? 0.5 : 1,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            marginBottom: 3,
                          }}
                        >
                          {fmt(shift.startTime)} – {fmt(shift.endTime)}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 4,
                            marginBottom: 4,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                              color:
                                SKILL_COLOR[shift.requiredSkill] ??
                                'var(--ss-accent)',
                            }}
                          >
                            {SKILL_LABELS[shift.requiredSkill]}
                          </span>
                          <span
                            className={`badge ${shift.status === 'PUBLISHED' ? 'badge-ok' : 'badge-muted'}`}
                            style={{ fontSize: 10 }}
                          >
                            {shift.status}
                          </span>
                        </div>
                        {/* Headcount */}
                        <div style={{ marginBottom: 4 }}>
                          {shift.status === 'PUBLISHED' && unfilled > 0 ? (
                            <span
                              className='badge badge-error'
                              style={{ fontSize: 10 }}
                            >
                              {filled}/{shift.headcountNeeded} ⚠
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: 11,
                                color: 'var(--ss-text-muted)',
                              }}
                            >
                              {filled}/{shift.headcountNeeded}
                            </span>
                          )}
                          {shift.isPremium && (
                            <span
                              className='badge badge-accent'
                              style={{ fontSize: 10, marginLeft: 4 }}
                            >
                              ★
                            </span>
                          )}
                        </div>
                        {/* Staff chips */}
                        <div
                          style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}
                        >
                          {shift.assignments
                            .filter((a) => a.status !== 'CANCELLED')
                            .map((a) => (
                              <div
                                key={a.id}
                                title={a.user.name}
                                style={{
                                  width: 22,
                                  height: 22,
                                  borderRadius: '50%',
                                  background: 'var(--ss-sidebar-bg)',
                                  color: 'white',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 9,
                                  fontWeight: 700,
                                  // title: a.user.name,
                                }}
                              >
                                {initials(a.user.name)}
                              </div>
                            ))}
                        </div>
                      </div>
                    )
                  })}

                  {/* Click empty area to create */}
                  <div
                    onClick={() => {
                      setCreateForm((f) => ({ ...f, date: dateStr }))
                      setCreateOpen(true)
                      setCreateError('')
                    }}
                    style={{
                      border: '2px dashed var(--ss-border)',
                      borderRadius: 8,
                      padding: '8px 0',
                      textAlign: 'center',
                      cursor: 'pointer',
                      color: 'var(--ss-text-faint)',
                      fontSize: 20,
                      lineHeight: 1,
                      transition: 'border-color 0.15s, color 0.15s',
                      minHeight: dayShifts.length === 0 ? 80 : 32,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onMouseEnter={(e) => {
                      ;(e.target as HTMLElement).style.borderColor =
                        'var(--ss-accent)'
                      ;(e.target as HTMLElement).style.color =
                        'var(--ss-accent)'
                    }}
                    onMouseLeave={(e) => {
                      ;(e.target as HTMLElement).style.borderColor =
                        'var(--ss-border)'
                      ;(e.target as HTMLElement).style.color =
                        'var(--ss-text-faint)'
                    }}
                  >
                    +
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Overtime Sidebar 25% ── */}
      <div
        style={{ flex: '0 0 calc(25% - 20px)', position: 'sticky', top: 24 }}
      >
        <div className='card'>
          <div className='card-header'>
            <span className='card-title'>This Week</span>
            <button
              className='btn btn-ghost btn-sm'
              style={{ fontSize: 11 }}
              onClick={loadOvertime}
            >
              ↻
            </button>
          </div>
          <div style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
            {overtimeData.length === 0 ? (
              <div
                style={{
                  padding: '20px 16px',
                  color: 'var(--ss-text-faint)',
                  fontSize: 13,
                  textAlign: 'center',
                }}
              >
                No staff scheduled
              </div>
            ) : (
              overtimeData.map((entry) => (
                <div
                  key={entry.userId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 16px',
                    borderBottom: '1px solid var(--ss-border)',
                  }}
                >
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        flexShrink: 0,
                        background:
                          entry.status === 'OVERTIME'
                            ? 'var(--ss-error)'
                            : entry.status === 'WARNING'
                              ? 'var(--ss-warn)'
                              : '#d1d5db',
                      }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>
                      {entry.name}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color:
                        entry.status === 'OVERTIME'
                          ? 'var(--ss-error)'
                          : entry.status === 'WARNING'
                            ? 'var(--ss-warn)'
                            : 'var(--ss-text-muted)',
                    }}
                  >
                    {entry.totalHours.toFixed(1)}h
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          MODALS
         ══════════════════════════════════════════════════════════════════════ */}

      {/* Create Shift Dialog */}
      {createOpen && (
        <div
          className='modal-backdrop'
          onClick={(e) => {
            if (e.target === e.currentTarget) setCreateOpen(false)
          }}
        >
          <div className='modal'>
            <div className='modal-header'>
              <span className='modal-title'>Create Shift</span>
              <button
                className='btn btn-ghost btn-sm'
                onClick={() => setCreateOpen(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className='modal-body'>
                {createError && (
                  <div className='alert alert-error'>{createError}</div>
                )}
                <div className='form-group'>
                  <label className='form-label'>Date *</label>
                  <input
                    type='date'
                    className='form-input'
                    required
                    value={createForm.date}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, date: e.target.value }))
                    }
                  />
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0 16px',
                  }}
                >
                  <div className='form-group'>
                    <label className='form-label'>Start Time *</label>
                    <input
                      type='time'
                      className='form-input'
                      required
                      value={createForm.startTime}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          startTime: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className='form-group'>
                    <label className='form-label'>End Time *</label>
                    <input
                      type='time'
                      className='form-input'
                      required
                      value={createForm.endTime}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          endTime: e.target.value,
                        }))
                      }
                    />
                    {createForm.endTime <= createForm.startTime && (
                      <p
                        className='form-hint'
                        style={{ color: 'var(--ss-warn)' }}
                      >
                        ⚠ Overnight shift (next day)
                      </p>
                    )}
                  </div>
                </div>
                <div className='form-group'>
                  <label className='form-label'>Required Skill *</label>
                  <select
                    className='form-select'
                    value={createForm.requiredSkill}
                    onChange={(e) =>
                      setCreateForm((f) => ({
                        ...f,
                        requiredSkill: e.target.value,
                      }))
                    }
                  >
                    {Object.entries(SKILL_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className='form-group'>
                  <label className='form-label'>Headcount Needed *</label>
                  <input
                    type='number'
                    className='form-input'
                    min={1}
                    max={50}
                    style={{ maxWidth: 100 }}
                    value={createForm.headcountNeeded}
                    onChange={(e) =>
                      setCreateForm((f) => ({
                        ...f,
                        headcountNeeded: parseInt(e.target.value) || 1,
                      }))
                    }
                  />
                </div>
              </div>
              <div className='modal-footer'>
                <button
                  type='button'
                  className='btn btn-secondary'
                  onClick={() => setCreateOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type='submit'
                  className='btn btn-primary'
                  disabled={creating}
                >
                  {creating ? 'Creating…' : 'Create Shift'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Shift Detail Sheet (right slide-out) */}
      {sheetOpen && selectedShift && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex' }}
        >
          <div
            style={{ flex: 1, background: 'rgba(28,25,23,0.4)' }}
            onClick={() => setSheetOpen(false)}
          />
          <div
            style={{
              width: 420,
              background: 'white',
              boxShadow: '-8px 0 40px rgba(0,0,0,0.15)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Sheet header */}
            <div
              style={{
                padding: '20px 24px 16px',
                borderBottom: '1px solid var(--ss-border)',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: 'Fraunces, serif',
                    fontWeight: 700,
                    fontSize: 17,
                  }}
                >
                  {fmt(selectedShift.startTime)} – {fmt(selectedShift.endTime)}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--ss-text-muted)',
                    marginTop: 4,
                  }}
                >
                  {new Date(selectedShift.startTime).toLocaleDateString(
                    'en-US',
                    { weekday: 'long', month: 'long', day: 'numeric' },
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <span
                    className={`badge ${selectedShift.status === 'PUBLISHED' ? 'badge-ok' : 'badge-muted'}`}
                  >
                    {selectedShift.status}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: SKILL_COLOR[selectedShift.requiredSkill],
                      padding: '2px 8px',
                      border: `1px solid ${SKILL_COLOR[selectedShift.requiredSkill]}`,
                      borderRadius: 100,
                    }}
                  >
                    {SKILL_LABELS[selectedShift.requiredSkill]}
                  </span>
                  {selectedShift.isPremium && (
                    <span className='badge badge-accent'>★ Premium</span>
                  )}
                </div>
              </div>
              <button
                className='btn btn-ghost btn-sm'
                onClick={() => setSheetOpen(false)}
              >
                ✕
              </button>
            </div>

            {/* Currently assigned */}
            <div
              style={{
                padding: '16px 24px',
                borderBottom: '1px solid var(--ss-border)',
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--ss-text-muted)',
                  marginBottom: 8,
                }}
              >
                Assigned (
                {
                  selectedShift.assignments.filter(
                    (a) => a.status !== 'CANCELLED',
                  ).length
                }
                /{selectedShift.headcountNeeded})
              </div>
              {selectedShift.assignments.filter((a) => a.status !== 'CANCELLED')
                .length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--ss-text-faint)' }}>
                  No staff assigned yet
                </div>
              ) : (
                selectedShift.assignments
                  .filter((a) => a.status !== 'CANCELLED')
                  .map((a) => (
                    <div
                      key={a.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '5px 0',
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: 'var(--ss-sidebar-bg)',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        {initials(a.user.name)}
                      </div>
                      <span style={{ fontSize: 13.5, fontWeight: 500 }}>
                        {a.user.name}
                      </span>
                      <span
                        className={`badge ${a.status === 'CONFIRMED' ? 'badge-ok' : 'badge-muted'}`}
                        style={{ fontSize: 10 }}
                      >
                        {a.status}
                      </span>
                    </div>
                  ))
              )}
            </div>

            {/* Assign staff section */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: '16px 24px 8px' }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--ss-text-muted)',
                    marginBottom: 10,
                  }}
                >
                  Assign Staff
                </div>
                <input
                  className='form-input'
                  placeholder='Search staff…'
                  value={staffSearch}
                  onChange={(e) => setStaffSearch(e.target.value)}
                />
              </div>
              <div
                style={{ flex: 1, overflowY: 'auto', padding: '0 24px 16px' }}
              >
                {staffList
                  .filter(
                    (s) =>
                      !staffSearch ||
                      s.name.toLowerCase().includes(staffSearch.toLowerCase()),
                  )
                  .map((staff) => (
                    <div
                      key={staff.id}
                      onClick={() => openPreview(staff)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        marginBottom: 4,
                        border:
                          selectedStaff?.id === staff.id
                            ? '2px solid var(--ss-accent)'
                            : '1px solid var(--ss-border)',
                        background:
                          selectedStaff?.id === staff.id
                            ? 'var(--ss-accent-light)'
                            : 'white',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: '50%',
                            background: 'var(--ss-bg)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {initials(staff.name)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 13.5 }}>
                            {staff.name}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: 'var(--ss-text-muted)',
                            }}
                          >
                            {staff.skills
                              .map((s) => SKILL_LABELS[s.skill] ?? s.skill)
                              .join(', ')}
                          </div>
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 12,
                          color: 'var(--ss-accent)',
                          fontWeight: 600,
                        }}
                      >
                        Preview →
                      </span>
                    </div>
                  ))}
                {staffList.length === 0 && (
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--ss-text-faint)',
                      textAlign: 'center',
                      padding: 20,
                    }}
                  >
                    No eligible staff available
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* What-if Preview Dialog */}
      {previewOpen && (
        <div
          className='modal-backdrop'
          style={{ zIndex: 60 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewOpen(false)
          }}
        >
          <div className='modal' style={{ maxWidth: 520 }}>
            <div className='modal-header'>
              <span className='modal-title'>
                Assignment Preview — {selectedStaff?.name}
              </span>
              <button
                className='btn btn-ghost btn-sm'
                onClick={() => setPreviewOpen(false)}
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

              {/* Constraint failures */}
              {previewFailures.length > 0 && (
                <div>
                  <div
                    className='alert alert-error'
                    style={{ marginBottom: 12 }}
                  >
                    This assignment cannot proceed — constraint check failed:
                  </div>
                  {previewFailures.map((f, i) => (
                    <div key={i} style={{ marginBottom: 12 }}>
                      <div
                        style={{
                          color: 'var(--ss-error)',
                          fontWeight: 600,
                          fontSize: 14,
                        }}
                      >
                        ✕ {f.reason}
                      </div>
                      {f.suggestions && f.suggestions.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--ss-text-muted)',
                              marginBottom: 6,
                            }}
                          >
                            Suggestions:
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 6,
                            }}
                          >
                            {f.suggestions.map((s) => (
                              <button
                                key={s.userId}
                                className='btn btn-secondary btn-sm'
                                onClick={() => {
                                  const staff = staffList.find(
                                    (u) => u.id === s.userId,
                                  )
                                  if (staff) openPreview(staff)
                                }}
                              >
                                {s.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Preview data */}
              {preview && !previewLoading && previewFailures.length === 0 && (
                <div>
                  <div
                    style={{
                      background: '#faf9f7',
                      borderRadius: 8,
                      padding: '14px 16px',
                      marginBottom: 16,
                    }}
                  >
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '12px 20px',
                      }}
                    >
                      {[
                        {
                          label: 'Current Hours',
                          val: `${preview.currentHours?.toFixed(1) ?? '—'}h`,
                        },
                        {
                          label: 'After This Shift',
                          val: `${preview.projectedHours?.toFixed(1) ?? '—'}h`,
                        },
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
                              marginTop: 2,
                            }}
                          >
                            {item.val}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Warnings */}
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
                  onClick={() => setPreviewOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className='btn btn-primary'
                  disabled={assigning}
                  onClick={confirmAssign}
                >
                  {assigning ? 'Assigning…' : 'Confirm Assignment'}
                </button>
              </div>
            )}
            {previewFailures.length > 0 && (
              <div className='modal-footer'>
                <button
                  className='btn btn-secondary'
                  onClick={() => setPreviewOpen(false)}
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Publish week confirmation */}
      {publishConfirmOpen && (
        <div
          className='modal-backdrop'
          onClick={(e) => {
            if (e.target === e.currentTarget) setPublishConfirmOpen(false)
          }}
        >
          <div className='modal'>
            <div className='modal-header'>
              <span className='modal-title'>Publish Week</span>
              <button
                className='btn btn-ghost btn-sm'
                onClick={() => setPublishConfirmOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className='modal-body'>
              <div className='alert alert-error' style={{ marginBottom: 12 }}>
                {publishWarning.length} shift
                {publishWarning.length !== 1 ? 's are' : ' is'} understaffed:
              </div>
              {publishWarning.map((s) => (
                <div
                  key={s.id}
                  style={{
                    padding: '8px 0',
                    borderBottom: '1px solid var(--ss-border)',
                    fontSize: 13.5,
                  }}
                >
                  <strong>{fmt(s.startTime)}</strong> —{' '}
                  {SKILL_LABELS[s.requiredSkill]} (
                  {s.assignments.filter((a) => a.status !== 'CANCELLED').length}
                  /{s.headcountNeeded} filled)
                </div>
              ))}
              <p
                style={{
                  fontSize: 13.5,
                  color: 'var(--ss-text-muted)',
                  marginTop: 12,
                }}
              >
                Are you sure you want to publish anyway?
              </p>
            </div>
            <div className='modal-footer'>
              <button
                className='btn btn-secondary'
                onClick={() => setPublishConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                className='btn btn-primary'
                disabled={publishing}
                onClick={() =>
                  publishAll(shifts.filter((s) => s.status === 'DRAFT'))
                }
              >
                {publishing ? 'Publishing…' : 'Publish Anyway'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
