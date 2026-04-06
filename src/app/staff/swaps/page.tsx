'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useToast } from '@/hooks/toast'
import { useSwapRealtime } from '@/hooks/Useswaprealtime'

type SwapRequest = {
  id: string
  type: string
  status: string
  expiresAt: string
  managerReason?: string | null
  assignment: {
    id: string
    shift: {
      startTime: string
      endTime: string
      requiredSkill: string
      location: { name: string; timezone: string }
    }
  }
  requester: { id: string; name: string }
  target: { id: string; name: string } | null
}

const TERMINAL = [
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'AUTO_CANCELLED',
]

const STATUS_STEPS_SWAP = [
  'PENDING',
  'ACCEPTED',
  'PENDING_APPROVAL',
  'APPROVED',
]
const STATUS_STEPS_DROP = ['PENDING', 'PENDING_APPROVAL', 'APPROVED']

const SKILL_LABELS: Record<string, string> = {
  BARTENDER: 'Bartender',
  LINE_COOK: 'Line Cook',
  SERVER: 'Server',
  HOST: 'Host',
}

function StepTrail({ steps, current }: { steps: string[]; current: string }) {
  const idx = steps.indexOf(current)
  const isTerminal = TERMINAL.includes(current)
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 10 }}
    >
      {steps.map((step, i) => {
        const reached = isTerminal && current !== 'APPROVED' ? false : i <= idx
        return (
          <div
            key={step}
            style={{ display: 'flex', alignItems: 'center', flex: 1 }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flex: 0,
              }}
            >
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  border: '2px solid',
                  borderColor: reached
                    ? 'var(--ss-ok)'
                    : 'var(--ss-border-strong)',
                  background: reached ? 'var(--ss-ok)' : 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {reached && (
                  <span
                    style={{ color: 'white', fontSize: 10, fontWeight: 700 }}
                  >
                    ✓
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: 'var(--ss-text-faint)',
                  marginTop: 3,
                  whiteSpace: 'nowrap',
                }}
              >
                {step.replace(/_/g, ' ')}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  margin: '0 2px',
                  marginBottom: 16,
                  background:
                    reached && i < idx ? 'var(--ss-ok)' : 'var(--ss-border)',
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function StaffSwapsPage() {
  const { data: session } = useSession()
  const { toast } = useToast()
  const [swaps, setSwaps] = useState<SwapRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/swaps')
    const data = await res.json()
    if (data.success) setSwaps(data.data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  useSwapRealtime(session?.user.id, load)

  async function handleCancel(swapId: string) {
    if (!confirm('Cancel this swap request?')) return
    setCancelling(swapId)
    const res = await fetch(`/api/swaps/${swapId}/cancel`, { method: 'PUT' })
    const data = await res.json()
    if (data.success) {
      toast('Request cancelled', 'success')
      load()
    } else toast(data.error ?? 'Failed to cancel', 'error')
    setCancelling(null)
  }

  const myId = session?.user.id
  const mySwaps = swaps.filter((s) => s.requester.id === myId)
  const incoming = swaps.filter(
    (s) => s.target?.id === myId && s.status === 'PENDING',
  )

  return (
    <div className='animate-in'>
      {/* Banner */}
      <div
        style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 10,
          padding: '12px 16px',
          marginBottom: 20,
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
          fontSize: 13.5,
          color: '#1e40af',
        }}
      >
        <span style={{ fontSize: 18, flexShrink: 0 }}>ℹ️</span>
        <div>
          <strong>Your original assignment stays active</strong> until a manager
          explicitly approves a swap. You are still responsible for your shift
          unless you see a APPROVED status below.
        </div>
      </div>

      <div className='page-header'>
        <div>
          <h1 className='page-title'>My Swap Requests</h1>
          <p className='page-subtitle'>
            {mySwaps.length} request{mySwaps.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Incoming swaps needing response */}
      {incoming.length > 0 && (
        <div
          className='card animate-in'
          style={{ marginBottom: 20, borderTop: '3px solid var(--ss-accent)' }}
        >
          <div className='card-header'>
            <span className='card-title'>Action Required</span>
            <span className='badge badge-accent'>
              {incoming.length} incoming
            </span>
          </div>
          {incoming.map((swap, i) => (
            <div
              key={swap.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 20px',
                borderBottom:
                  i < incoming.length - 1
                    ? '1px solid var(--ss-border)'
                    : 'none',
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>
                  {swap.requester.name} wants to swap with you
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--ss-text-muted)',
                    marginTop: 3,
                  }}
                >
                  {swap.assignment.shift.location.name} ·{' '}
                  {new Date(swap.assignment.shift.startTime).toLocaleDateString(
                    'en-US',
                    { weekday: 'short', month: 'short', day: 'numeric' },
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className='btn btn-primary btn-sm'
                  onClick={async () => {
                    const res = await fetch(`/api/swaps/${swap.id}/accept`, {
                      method: 'PUT',
                    })
                    const data = await res.json()
                    if (data.success) {
                      toast(
                        'Swap accepted — awaiting manager approval',
                        'success',
                      )
                      load()
                    } else
                      toast(
                        data.error ?? 'Cannot accept — constraint check failed',
                        'error',
                      )
                  }}
                >
                  Accept
                </button>
                <button
                  className='btn btn-danger btn-sm'
                  onClick={async () => {
                    const res = await fetch(`/api/swaps/${swap.id}/decline`, {
                      method: 'PUT',
                    })
                    const data = await res.json()
                    if (data.success) {
                      toast('Swap declined', 'success')
                      load()
                    } else toast(data.error ?? 'Failed to decline', 'error')
                  }}
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* My requests */}
      {loading ? (
        <div className='loading-row'>Loading…</div>
      ) : mySwaps.length === 0 ? (
        <div className='card'>
          <div className='empty-state'>
            <div className='empty-state-icon'>🔄</div>
            <div className='empty-state-title'>No swap requests yet</div>
            <div className='empty-state-text'>
              Go to My Schedule to request a swap or drop for an upcoming shift.
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mySwaps.map((swap, i) => {
            const isTerminal = TERMINAL.includes(swap.status)
            const steps =
              swap.type === 'SWAP' ? STATUS_STEPS_SWAP : STATUS_STEPS_DROP
            const shift = swap.assignment.shift
            return (
              <div
                key={swap.id}
                className={`card animate-in delay-${i % 4}`}
                style={{ opacity: isTerminal ? 0.75 : 1 }}
              >
                <div className='card-body'>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <span
                          className={`badge ${swap.type === 'SWAP' ? 'badge-info' : 'badge-warn'}`}
                        >
                          {swap.type}
                        </span>
                        <span
                          className={`badge ${
                            swap.status === 'APPROVED'
                              ? 'badge-ok'
                              : swap.status === 'REJECTED'
                                ? 'badge-error'
                                : TERMINAL.includes(swap.status)
                                  ? 'badge-muted'
                                  : 'badge-info'
                          }`}
                        >
                          {swap.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>
                        {shift.location.name}
                      </div>
                      <div
                        style={{
                          fontSize: 13.5,
                          color: 'var(--ss-text-muted)',
                          marginTop: 3,
                        }}
                      >
                        {new Date(shift.startTime).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}{' '}
                        ·{' '}
                        {new Date(shift.startTime).toLocaleTimeString('en-US', {
                          timeZone: shift.location.timezone,
                          hour: 'numeric',
                          minute: '2-digit',
                        })}{' '}
                        –{' '}
                        {new Date(shift.endTime).toLocaleTimeString('en-US', {
                          timeZone: shift.location.timezone,
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </div>
                      {swap.target && (
                        <div
                          style={{
                            fontSize: 13,
                            color: 'var(--ss-text-muted)',
                            marginTop: 3,
                          }}
                        >
                          → {swap.target.name}
                        </div>
                      )}
                      {swap.status === 'REJECTED' && swap.managerReason && (
                        <div
                          style={{
                            marginTop: 8,
                            padding: '8px 12px',
                            background: '#fef2f2',
                            borderRadius: 8,
                            fontSize: 13,
                            color: 'var(--ss-error)',
                          }}
                        >
                          Rejected: {swap.managerReason}
                        </div>
                      )}

                      <StepTrail steps={steps} current={swap.status} />
                    </div>

                    {!isTerminal && (
                      <button
                        className='btn btn-ghost btn-sm'
                        style={{ color: 'var(--ss-error)', flexShrink: 0 }}
                        disabled={cancelling === swap.id}
                        onClick={() => handleCancel(swap.id)}
                      >
                        {cancelling === swap.id ? '…' : 'Cancel'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
