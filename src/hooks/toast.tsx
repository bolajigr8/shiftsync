'use client'

import { createContext, useContext, useState, useCallback, useRef } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

type ToastVariant = 'success' | 'warning' | 'error'

type Toast = {
  id: string
  message: string
  variant: ToastVariant
}

type ToastContextType = {
  toast: (message: string, variant?: ToastVariant) => void
}

// ── Context ───────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextType>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)

  const toast = useCallback(
    (message: string, variant: ToastVariant = 'success') => {
      const id = String(++idRef.current)
      setToasts((prev) => [...prev, { id, message, variant }])
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, 5000)
    },
    [],
  )

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const VARIANT_STYLE: Record<ToastVariant, React.CSSProperties> = {
    success: { background: '#065f46', borderLeft: '4px solid #34d399' },
    warning: { background: '#92400e', borderLeft: '4px solid #fbbf24' },
    error: { background: '#991b1b', borderLeft: '4px solid #f87171' },
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container */}
      <div
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          alignItems: 'flex-end',
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
              color: 'white',
              fontSize: 13.5,
              fontWeight: 500,
              maxWidth: 380,
              animation: 'fadeIn 0.2s ease both',
              ...VARIANT_STYLE[t.variant],
            }}
          >
            <span style={{ flex: 1 }}>{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
                fontSize: 16,
                lineHeight: 1,
                padding: '0 2px',
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
