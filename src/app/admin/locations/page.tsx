'use client'

import { useEffect, useState } from 'react'

type Location = {
  id: string
  name: string
  timezone: string
  address: string | null
  editCutoffHours: number
  isActive: boolean
}

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Phoenix', label: 'Arizona (MST)' },
]

const emptyForm = {
  name: '',
  timezone: 'America/New_York',
  address: '',
  editCutoffHours: 48,
}

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Location | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const res = await fetch('/api/admin/locations')
    const data = await res.json()
    if (data.success) setLocations(data.data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setShowModal(true)
  }

  function openEdit(loc: Location) {
    setEditing(loc)
    setForm({
      name: loc.name,
      timezone: loc.timezone,
      address: loc.address ?? '',
      editCutoffHours: loc.editCutoffHours,
    })
    setError('')
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const body = { ...form, address: form.address || undefined }
    const url = editing
      ? `/api/admin/locations/${editing.id}`
      : '/api/admin/locations'
    const method = editing ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()

    if (data.success) {
      setShowModal(false)
      load()
    } else {
      setError(data.error ?? 'Failed to save')
    }
    setSaving(false)
  }

  async function toggleActive(loc: Location) {
    await fetch(`/api/admin/locations/${loc.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !loc.isActive }),
    })
    load()
  }

  return (
    <div className='animate-in'>
      <div className='page-header'>
        <div>
          <h1 className='page-title'>Locations</h1>
          <p className='page-subtitle'>
            {locations.filter((l) => l.isActive).length} active venues
          </p>
        </div>
        <button className='btn btn-primary' onClick={openCreate}>
          <svg
            width='14'
            height='14'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2.5'
          >
            <line x1='12' y1='5' x2='12' y2='19' />
            <line x1='5' y1='12' x2='19' y2='12' />
          </svg>
          New Location
        </button>
      </div>

      {loading ? (
        <div className='loading-row'>Loading locations…</div>
      ) : locations.length === 0 ? (
        <div className='card'>
          <div className='empty-state'>
            <div className='empty-state-icon'>📍</div>
            <div className='empty-state-title'>No locations yet</div>
            <div className='empty-state-text'>
              Add your first restaurant location to get started.
            </div>
            <button
              className='btn btn-primary'
              style={{ marginTop: 16 }}
              onClick={openCreate}
            >
              Add Location
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {locations.map((loc, i) => (
            <div key={loc.id} className={`card animate-in delay-${i % 4}`}>
              <div
                className='card-body'
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: loc.isActive
                        ? 'var(--ss-accent-light)'
                        : '#f5f3ef',
                      fontSize: 18,
                    }}
                  >
                    📍
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>
                      {loc.name}
                    </div>
                    <div
                      style={{
                        fontSize: 12.5,
                        color: 'var(--ss-text-muted)',
                        marginTop: 2,
                      }}
                    >
                      {TIMEZONES.find((t) => t.value === loc.timezone)?.label ??
                        loc.timezone}
                      {loc.address && ` · ${loc.address}`}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--ss-text-faint)',
                        marginTop: 2,
                      }}
                    >
                      Schedule locks {loc.editCutoffHours}h before shift
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    className={`badge ${loc.isActive ? 'badge-ok' : 'badge-muted'}`}
                  >
                    {loc.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <button
                    className='btn btn-secondary btn-sm'
                    onClick={() => openEdit(loc)}
                  >
                    Edit
                  </button>
                  <button
                    className={`btn btn-sm ${loc.isActive ? 'btn-danger' : 'btn-secondary'}`}
                    onClick={() => toggleActive(loc)}
                  >
                    {loc.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div
          className='modal-backdrop'
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowModal(false)
          }}
        >
          <div className='modal'>
            <div className='modal-header'>
              <span className='modal-title'>
                {editing ? 'Edit Location' : 'New Location'}
              </span>
              <button
                className='btn btn-ghost btn-sm'
                onClick={() => setShowModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className='modal-body'>
                {error && <div className='alert alert-error'>{error}</div>}
                <div className='form-group'>
                  <label className='form-label'>Location Name *</label>
                  <input
                    className='form-input'
                    required
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                    placeholder='e.g. Harbour Front'
                  />
                </div>
                <div className='form-group'>
                  <label className='form-label'>Timezone *</label>
                  <select
                    className='form-select'
                    value={form.timezone}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, timezone: e.target.value }))
                    }
                  >
                    {TIMEZONES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className='form-group'>
                  <label className='form-label'>Address</label>
                  <input
                    className='form-input'
                    value={form.address}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, address: e.target.value }))
                    }
                    placeholder='123 Ocean Drive'
                  />
                </div>
                <div className='form-group'>
                  <label className='form-label'>
                    Schedule Lock (hours before shift)
                  </label>
                  <input
                    className='form-input'
                    type='number'
                    min={0}
                    max={168}
                    value={form.editCutoffHours}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        editCutoffHours: parseInt(e.target.value) || 48,
                      }))
                    }
                  />
                  <p className='form-hint'>
                    Shifts cannot be edited within this many hours of start
                    time.
                  </p>
                </div>
              </div>
              <div className='modal-footer'>
                <button
                  type='button'
                  className='btn btn-secondary'
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type='submit'
                  className='btn btn-primary'
                  disabled={saving}
                >
                  {saving
                    ? 'Saving…'
                    : editing
                      ? 'Save Changes'
                      : 'Create Location'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
