import { useState, useRef } from 'react'
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { getDeviceHash } from '../lib/device'

export const useContact = create((set) => ({
  open: false,
  initialMessage: '',
  setOpen: (open, initialMessage = '') => set({ open, initialMessage }),
}))

const IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

export default function ContactModal() {
  const open = useContact((s) => s.open)
  const initialMessage = useContact((s) => s.initialMessage)
  const [message, setMessage] = useState('')
  const [seeded, setSeeded] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)
  const textareaRef = useRef(null)

  // Seed textarea with initial message when modal opens
  if (open && !seeded && initialMessage) {
    setMessage(initialMessage)
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
    if (!message.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const deviceHash = await getDeviceHash()
      const handle = localStorage.getItem('lsq_handle') || null
      const avatar = localStorage.getItem('lsq_avatar') || null
      const { data, error: fnError } = await supabase.functions.invoke('contact-sms', {
        body: { message: message.trim(), device_hash: deviceHash, handle, avatar },
      })
      if (fnError && !data?.sent) throw fnError
      if (data?.error) throw new Error(data.error)
      setSent(true)
      setMessage('')
    } catch (err) {
      setError('Could not send — try texting (877) 335-1917 directly.')
      console.error('[ContactModal] send failed:', err)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && message.trim() && !IS_MOBILE) {
      e.preventDefault()
      sendDirect()
    }
  }

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
              <p className="text-body text-on-surface-variant">Sent. We'll get back to you here on the site — no personal info needed.</p>
              <button
                onClick={() => { setSent(false); setError(null) }}
                className="text-body-sm text-on-surface-disabled"
              >
                Send another
              </button>
            </div>
          ) : (
            <>
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
                disabled={!message.trim() || sending}
                className="w-full py-2.5 rounded-xl text-body font-medium text-center transition-opacity"
                style={{
                  background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(52,211,153,0.3)',
                  color: '#6ee7b7',
                  opacity: (!message.trim() || sending) ? 0.3 : 1,
                  cursor: (!message.trim() || sending) ? 'not-allowed' : 'pointer',
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
