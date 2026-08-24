import { useState, useRef } from 'react'
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { getDeviceHash } from '../lib/device'

export const useContact = create((set) => ({
  open: false,
  initialMessage: '',
  setOpen: (open, initialMessage = '') => set({ open, initialMessage }),
}))

import { IS_MOBILE } from '../lib/isMobile.js'
import { INSTANCE } from '../instance.js'

// ⭐ Read the fallback number from the installation, not a literal. The old
// error text hardcoded "(877) 335-1917" in a shared component — correct for
// Lafayette Square, wrong for every other town the kit pours, and invisible
// until someone in town #2 read it. `cary.smsNumberDisplay` is the authored
// field (ls/OPERATIONS.md §5); if an installation hasn't set one, say nothing
// rather than send them to somebody else's phone.
const SMS_NUMBER = INSTANCE?.cary?.smsNumberDisplay || null

export default function ContactModal() {
  const open = useContact((s) => s.open)
  const initialMessage = useContact((s) => s.initialMessage)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [seeded, setSeeded] = useState(false)
  const [sendCount] = useState(() => parseInt(localStorage.getItem('lsq_contact_count') || '0', 10))
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)
  const textareaRef = useRef(null)

  // Seed fields when the modal opens: the initial message + the remembered name.
  if (open && !seeded) {
    if (initialMessage) setMessage(initialMessage)
    const savedName = localStorage.getItem('lsq_handle')
    if (savedName) setName(savedName)
    setSeeded(true)
  }
  if (!open && seeded) setSeeded(false)

  if (!open) return null

  const close = () => {
    useContact.getState().setOpen(false)
    setMessage('')
    setSent(false)
    setError(null)
  }

  const sendDirect = async () => {
    if (!name.trim() || !message.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const deviceHash = await getDeviceHash()
      const trimmedName = name.trim()
      localStorage.setItem('lsq_handle', trimmedName)   // remember the name for next time
      const avatar = localStorage.getItem('lsq_avatar') || null
      const { data, error: fnError } = await supabase.functions.invoke('contact-sms', {
        body: { message: message.trim(), device_hash: deviceHash, handle: trimmedName, name: trimmedName, avatar },
      })

      // ⛔ Read WHY it failed. Every failure used to render the same sentence —
      // a blocked origin, a rate limit, a Twilio outage and a dead network were
      // indistinguishable, so nobody could report what actually went wrong.
      // (A blocked origin is exactly what bit us on staging, 2026-08-24.)
      if (fnError && !data?.sent) {
        // A non-2xx arrives as FunctionsHttpError with the body on `context`.
        let body = null
        try { body = await fnError.context?.json?.() } catch { /* not JSON — a transport failure */ }
        if (body?.error) {
          setError(body.error)
          console.error('[ContactModal] send refused:', body.code || 'unknown', body.error)
          return
        }
        // No body at all = we never reached the function: offline, DNS, or the
        // browser blocking the response because our origin isn't allowed.
        setError(
          SMS_NUMBER
            ? `Couldn't reach the message service. Try texting ${SMS_NUMBER} directly.`
            : "Couldn't reach the message service. Please try again in a moment."
        )
        console.error('[ContactModal] send failed before reaching the function:', fnError)
        return
      }
      if (data?.error) {
        setError(data.error)
        console.error('[ContactModal] send refused:', data.code || 'unknown', data.error)
        return
      }
      setSent(true)
      setMessage('')
      localStorage.setItem('lsq_contact_count', String(sendCount + 1))
    } catch (err) {
      setError(
        SMS_NUMBER
          ? `Something went wrong sending that. You can text ${SMS_NUMBER} directly.`
          : 'Something went wrong sending that. Please try again in a moment.'
      )
      console.error('[ContactModal] send failed:', err)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && name.trim() && message.trim() && !IS_MOBILE) {
      e.preventDefault()
      sendDirect()
    }
  }

  const canSend = !!name.trim() && !!message.trim() && !sending

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center font-mono"
      style={{ paddingTop: IS_MOBILE ? 'env(safe-area-inset-top)' : undefined }}
      onClick={(e) => { if (e.target === e.currentTarget) close() }}
    >
      {/* Scrim */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
        onClick={close}
      />

      {/* Card */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex flex-col overflow-hidden"
        style={{
          width: IS_MOBILE ? 'calc(100% - 2rem)' : 380,
          background: 'rgba(20, 20, 30, 0.95)',
          backdropFilter: 'blur(40px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.5)',
          color: 'var(--on-surface)',
          border: '1px solid var(--outline)',
          borderRadius: 16,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 flex-shrink-0">
          <span style={{ fontSize: 'var(--type-body)', fontWeight: 500 }}>Text us</span>
          <button
            onClick={close}
            className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.4)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-3">
          {sent ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(52,211,153,0.3)' }}>
                <svg width="20" height="20" style={{ color: '#34d399' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-body text-on-surface-variant">
                {sendCount === 0 ? "Sent. We'll get back to you here on the site."
                  : sendCount === 1 ? "Sent. We'll get back to you here on the site."
                  : 'Sent.'}
              </p>
              <button
                onClick={() => { setSent(false); setError(null) }}
                className="text-body-sm text-on-surface-disabled"
              >
                Send another
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                aria-label="Your name"
                className="w-full outline-none"
                style={{
                  boxSizing: 'border-box',
                  background: 'var(--surface-container)', borderRadius: 12, padding: '12px',
                  color: 'var(--on-surface)', border: '1px solid var(--outline-variant)',
                  fontFamily: 'inherit', fontSize: 'var(--type-body-sm)',
                }}
                maxLength={80}
                disabled={sending}
              />

              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={IS_MOBILE ? 'Write a message...' : 'Write a message... (Enter to send)'}
                className="w-full resize-none outline-none"
                style={{
                  minHeight: 80, maxHeight: 160, boxSizing: 'border-box',
                  background: 'var(--surface-container)', borderRadius: 12, padding: '12px',
                  color: 'var(--on-surface)', border: '1px solid var(--outline-variant)',
                  fontFamily: 'inherit', fontSize: 'var(--type-body-sm)',
                }}
                maxLength={1600}
                disabled={sending}
              />

              {error && (
                <p className="text-body-sm" style={{ color: '#f87171' }}>{error}</p>
              )}

              <button
                onClick={sendDirect}
                disabled={!canSend}
                className="w-full py-2.5 rounded-xl text-body font-medium text-center transition-opacity"
                style={{
                  background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(52,211,153,0.3)',
                  color: '#6ee7b7',
                  opacity: !canSend ? 0.3 : 1,
                  cursor: !canSend ? 'not-allowed' : 'pointer',
                }}
              >
                {sending ? 'Sending...' : 'Send'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
