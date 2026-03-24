import { useState } from 'react'
import { create } from 'zustand'
import useCamera from '../hooks/useCamera'

export const useContact = create((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))

export default function ContactModal() {
  const open = useContact((s) => s.open)
  const panelCollapsedPx = useCamera((s) => s.panelCollapsedPx)
  const [message, setMessage] = useState('')

  if (!open) return null

  const close = () => {
    useContact.getState().setOpen(false)
    setMessage('')
  }

  const encodedBody = encodeURIComponent(message)

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="absolute top-3 left-3 right-3 bg-surface-glass backdrop-blur-2xl backdrop-saturate-150 rounded-2xl text-on-surface shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-outline overflow-hidden flex flex-col z-50 font-mono"
      style={{
        bottom: `${(panelCollapsedPx || 76) + 18}px`,
      }}
    >
      {/* Header */}
      <div className="flex items-center px-4 py-3 border-b border-outline-variant flex-shrink-0">
        <h2 className="flex-1 text-body font-medium text-on-surface">Text Cary</h2>
        <button
          onClick={close}
          className="w-9 h-9 rounded-full backdrop-blur-md bg-rose-500/20 border border-rose-400/40 text-rose-300 transition-all duration-200 flex items-center justify-center hover:bg-rose-500/30"
          title="Close"
          aria-label="Close"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Compose area */}
      <div className="flex-1 min-h-0 p-4 flex flex-col gap-3">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onFocus={() => useCamera.getState().setPanelOpen(false)}
          placeholder="Write a message..."
          className="w-full flex-1 min-h-[120px] resize-none bg-surface-container rounded-xl p-3 text-body-sm text-on-surface placeholder:text-on-surface-disabled border border-outline-variant focus:border-outline focus:outline-none"
        />
        <a
          href={`sms:+18773351917${message ? `&body=${encodedBody}` : ''}`}
          className="w-full py-2.5 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-medium text-body text-center transition-all duration-200 hover:bg-emerald-500/30 block"
        >
          Send text
        </a>
        <p className="text-[11px] text-on-surface-disabled text-center">(877) 335-1917</p>
      </div>
    </div>
  )
}
