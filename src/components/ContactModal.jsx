import { useState, useRef, useCallback } from 'react'
import { create } from 'zustand'
import useCamera from '../hooks/useCamera'
import { supabase } from '../lib/supabase'

export const useContact = create((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))

const IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

// Lazy-load emoji picker only when toggled open
let _emojiMod = null
function loadEmojiPicker() {
  if (!_emojiMod) {
    _emojiMod = Promise.all([
      import('@emoji-mart/react'),
      import('@emoji-mart/data'),
    ])
  }
  return _emojiMod
}

export default function ContactModal() {
  const open = useContact((s) => s.open)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [EmojiKit, setEmojiKit] = useState(null) // { Picker, data }
  const textareaRef = useRef(null)

  if (!open) return null

  const close = () => {
    useContact.getState().setOpen(false)
    setMessage('')
    setSent(false)
    setError(null)
    setEmojiOpen(false)
  }

  const encodedBody = encodeURIComponent(message)

  const sendDirect = async () => {
    if (!message.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('contact-sms', {
        body: { message: message.trim() },
      })
      console.log('[ContactModal] response:', { data, fnError })
      // supabase-js may wrap non-2xx as an error, but also check the data
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

  const toggleEmoji = async () => {
    if (emojiOpen) {
      setEmojiOpen(false)
      return
    }
    if (!EmojiKit) {
      try {
        const [pickerMod, dataMod] = await loadEmojiPicker()
        setEmojiKit({ Picker: pickerMod.default, data: dataMod.default })
      } catch (err) {
        console.error('[ContactModal] emoji load failed:', err)
        return
      }
    }
    setEmojiOpen(true)
  }

  const insertEmoji = (emojiData) => {
    const native = emojiData.native
    const ta = textareaRef.current
    if (ta) {
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const next = message.slice(0, start) + native + message.slice(end)
      setMessage(next)
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + native.length
        ta.focus()
      })
    } else {
      setMessage(m => m + native)
    }
    setEmojiOpen(false)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: IS_MOBILE ? 'flex-end' : 'center', justifyContent: 'center' }}
      onClick={(e) => { if (e.target === e.currentTarget) close() }}
    >
      {/* Scrim */}
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
        onClick={close}
      />

      {/* Card */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="font-mono"
        style={{
          position: 'relative',
          zIndex: 1,
          width: IS_MOBILE ? '100%' : 400,
          maxHeight: '80vh',
          background: 'rgba(20, 20, 30, 0.92)',
          backdropFilter: 'blur(40px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.5)',
          color: 'var(--on-surface)',
          border: '1px solid var(--outline)',
          borderRadius: IS_MOBILE ? '16px 16px 0 0' : 16,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          paddingBottom: IS_MOBILE ? 'env(safe-area-inset-bottom, 0px)' : undefined,
        }}
      >
        {/* Close button — top right corner */}
        <button
          onClick={close}
          style={{
            position: 'absolute', top: 8, right: 8, zIndex: 2,
            width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.4)', border: 'none', cursor: 'pointer',
          }}
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <span style={{ fontSize: 'var(--type-body)', fontWeight: 500 }}>Text us</span>
        </div>

        {/* Body */}
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sent ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '32px 0', textAlign: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(52,211,153,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="24" height="24" style={{ color: '#34d399' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p style={{ fontSize: 'var(--type-body)', color: 'var(--on-surface-variant)' }}>Message sent. We'll get back to you soon.</p>
              <button
                onClick={() => { setSent(false); setError(null) }}
                style={{ fontSize: 'var(--type-body-sm)', color: 'var(--on-surface-disabled)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Send another
              </button>
            </div>
          ) : (
            <>
              {/* Compose field */}
              <div style={{ position: 'relative' }}>
                <textarea
                  ref={textareaRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onFocus={() => {
                    useCamera.getState().setPanelOpen(false)
                    setEmojiOpen(false)
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={IS_MOBILE ? 'Write a message...' : 'Write a message... (Enter to send)'}
                  style={{
                    width: '100%', minHeight: 100, maxHeight: 200, resize: 'none', boxSizing: 'border-box',
                    background: 'var(--surface-container)', borderRadius: 12, padding: '12px 40px 12px 12px',
                    color: 'var(--on-surface)', border: '1px solid var(--outline-variant)', outline: 'none',
                    fontFamily: 'inherit', fontSize: 'var(--type-body-sm)',
                  }}
                  maxLength={1600}
                  disabled={sending}
                />
                {/* Emoji toggle */}
                <button
                  onClick={toggleEmoji}
                  type="button"
                  aria-label="Emoji picker"
                  style={{
                    position: 'absolute', right: 10, bottom: 10, width: 28, height: 28, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: emojiOpen ? 'rgba(255,255,255,0.12)' : 'transparent',
                    color: emojiOpen ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)',
                    border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <circle cx="12" cy="12" r="10" />
                    <path d="M8 14s1.5 2 4 2 4-2 4-2" strokeLinecap="round" />
                    <circle cx="9" cy="9.5" r="0.75" fill="currentColor" stroke="none" />
                    <circle cx="15" cy="9.5" r="0.75" fill="currentColor" stroke="none" />
                  </svg>
                </button>
              </div>

              {/* Emoji picker — loaded on demand */}
              {emojiOpen && EmojiKit && (
                <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ width: '100%' }} ref={(el) => {
                    // emoji-mart sizes itself from its container — force full width
                    if (el) {
                      const em = el.querySelector('em-emoji-picker')
                      if (em) em.style.width = '100%'
                    }
                  }}>
                    <EmojiKit.Picker
                      data={EmojiKit.data}
                      onEmojiSelect={insertEmoji}
                      theme="dark"
                      set="native"
                      perLine={9}
                      emojiSize={30}
                      emojiButtonSize={38}
                      previewPosition="none"
                      skinTonePosition="search"
                      maxFrequentRows={2}
                    />
                  </div>
                </div>
              )}

              {error && (
                <p style={{ fontSize: 'var(--type-body-sm)', color: '#f87171' }}>{error}</p>
              )}

              {/* Send button — one-click on all platforms */}
              <button
                onClick={sendDirect}
                disabled={!message.trim() || sending}
                style={{
                  width: '100%', padding: '10px 0', borderRadius: 12,
                  background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(52,211,153,0.3)',
                  color: '#6ee7b7', fontWeight: 500, textAlign: 'center', fontSize: 'var(--type-body)',
                  cursor: (!message.trim() || sending) ? 'not-allowed' : 'pointer',
                  opacity: (!message.trim() || sending) ? 0.4 : 1,
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
