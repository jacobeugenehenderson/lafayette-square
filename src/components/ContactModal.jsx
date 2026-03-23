import { useState } from 'react'
import { create } from 'zustand'
import useCamera from '../hooks/useCamera'

export const useContact = create((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))

export default function ContactModal() {
  const open = useContact((s) => s.open)
  const panelOpen = useCamera((s) => s.panelOpen)
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
        bottom: panelOpen ? 'calc(30dvh - 1rem + 18px)' : `${(panelCollapsedPx || 76) + 18}px`,
      }}
    >
      {/* Header — buttons right-aligned to match avatar position */}
      <div className="flex items-center px-4 py-3 border-b border-outline-variant flex-shrink-0">
        <h2 className="flex-1 text-body font-medium text-on-surface">Contact</h2>
        <div className="flex items-center gap-2">
          {/* Email */}
          <a
            href={`mailto:hello@lafayette-square.com${message ? `?body=${encodedBody}` : ''}`}
            className="w-9 h-9 rounded-full backdrop-blur-md bg-amber-500/20 border border-amber-400/40 text-amber-300 transition-all duration-200 flex items-center justify-center hover:bg-amber-500/30"
            title="Send via email"
            aria-label="Send via email"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </a>
          {/* Text */}
          <a
            href={`sms:+13143334444${message ? `&body=${encodedBody}` : ''}`}
            className="w-9 h-9 rounded-full backdrop-blur-md bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 transition-all duration-200 flex items-center justify-center hover:bg-emerald-500/30"
            title="Send via text"
            aria-label="Send via text"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
          </a>
          {/* Close */}
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
      </div>

      {/* Compose area */}
      <div className="flex-1 min-h-0 p-4">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onFocus={() => useCamera.getState().setPanelOpen(false)}
          placeholder="Write a message..."
          className="w-full h-full min-h-[120px] resize-none bg-surface-container rounded-xl p-3 text-body-sm text-on-surface placeholder:text-on-surface-disabled border border-outline-variant focus:border-outline focus:outline-none"
        />
      </div>
    </div>
  )
}
