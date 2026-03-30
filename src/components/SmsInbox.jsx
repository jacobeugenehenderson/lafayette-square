import { useState, useEffect, useRef } from 'react'
import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useSmsInbox = create((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))

// Thin gate
export default function SmsInbox() {
  const open = useSmsInbox((s) => s.open)
  if (!open) return null
  return <SmsInboxInner />
}

function formatPhone(phone) {
  // +19171234567 → (917) 123-4567
  const d = phone.replace(/^\+1/, '')
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  return phone
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  return `${days}d`
}

const ROLE_LABELS = { resident: 'Resident', worker: 'Worker', visitor: 'Visitor' }

function ContactLabel({ phone, profiles, messages }) {
  if (phone === 'web') {
    // Count unique senders by handle
    const handles = [...new Set((messages || []).filter(m => m.handle).map(m => m.handle))]
    if (handles.length === 1) {
      const msg = messages.find(m => m.handle)
      return (
        <span className="flex items-center gap-1.5">
          {msg.avatar && <span>{msg.avatar}</span>}
          <span className="text-white/90">@{msg.handle}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/8 text-white/40 border border-white/6">Web</span>
        </span>
      )
    }
    return (
      <span className="flex items-center gap-1.5">
        <span className="text-white/50 italic">Web contacts</span>
        {handles.length > 0 && <span className="text-caption text-white/30">({handles.length})</span>}
      </span>
    )
  }
  const p = profiles[phone]
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-white/90">{p?.display_name || formatPhone(phone)}</span>
      {p?.neighborhood_relationship && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/8 text-white/40 border border-white/6">
          {ROLE_LABELS[p.neighborhood_relationship] || p.neighborhood_relationship}
        </span>
      )}
    </span>
  )
}

function SmsInboxInner() {
  const [messages, setMessages] = useState([])
  const [profiles, setProfiles] = useState({})  // phone → { display_name, neighborhood_relationship }
  const [loading, setLoading] = useState(true)
  const [selectedPhone, setSelectedPhone] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  const close = () => useSmsInbox.getState().setOpen(false)
  const adminToken = sessionStorage.getItem('lsq_admin_token') || ''

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('sms-inbox', {
        body: { admin_token: adminToken },
      })
      if (data?.messages) setMessages(data.messages)
      if (data?.profiles) setProfiles(data.profiles)
      if (error) console.error('[SmsInbox] fetch error:', error)
    } catch (err) {
      console.error('[SmsInbox] fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchMessages() }, [])

  // Auto-scroll thread to bottom
  useEffect(() => {
    if (selectedPhone && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [selectedPhone, messages])

  // Focus input when thread opens
  useEffect(() => {
    if (selectedPhone) {
      const t = setTimeout(() => inputRef.current?.focus(), 300)
      return () => clearTimeout(t)
    }
  }, [selectedPhone])

  // Group messages into conversations by phone
  const conversations = {}
  for (const msg of messages) {
    if (!conversations[msg.phone]) conversations[msg.phone] = []
    conversations[msg.phone].push(msg)
  }

  // Sort conversations by most recent message
  const sorted = Object.entries(conversations).sort((a, b) => {
    const lastA = a[1][a[1].length - 1]
    const lastB = b[1][b[1].length - 1]
    return new Date(lastB.created_at) - new Date(lastA.created_at)
  })

  const sendReply = async () => {
    if (!replyText.trim() || sending) return
    setSending(true)
    try {
      const { data, error } = await supabase.functions.invoke('sms-reply', {
        body: { to: selectedPhone, body: replyText.trim(), admin_token: adminToken },
      })
      if (data?.sent) {
        setReplyText('')
        // Optimistically add message
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          phone: selectedPhone,
          direction: 'outbound',
          body: replyText.trim(),
          created_at: new Date().toISOString(),
        }])
      }
      if (error) console.error('[SmsInbox] reply error:', error)
    } catch (err) {
      console.error('[SmsInbox] reply failed:', err)
    } finally {
      setSending(false)
    }
  }

  const thread = selectedPhone ? conversations[selectedPhone] || [] : []

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center font-mono"
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
          width: 'min(420px, calc(100vw - 1rem))',
          height: 'min(600px, calc(100vh - 4rem))',
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
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 flex-shrink-0">
          {selectedPhone ? (
            <>
              <button
                onClick={() => setSelectedPhone(null)}
                className="text-white/40 hover:text-white/70 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
              <span className="text-body font-medium flex-1"><ContactLabel phone={selectedPhone} profiles={profiles} messages={thread} /></span>
            </>
          ) : (
            <span className="text-body font-medium flex-1">SMS Inbox</span>
          )}
          <button
            onClick={fetchMessages}
            className="text-white/30 hover:text-white/60 transition-colors"
            title="Refresh"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
          </button>
          <button
            onClick={close}
            className="text-white/30 hover:text-white/60 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-white/30 text-body-sm">
            Loading...
          </div>
        ) : !selectedPhone ? (
          /* ── Conversation list ── */
          <div className="flex-1 overflow-y-auto min-h-0">
            {sorted.length === 0 ? (
              <div className="flex items-center justify-center h-full text-white/30 text-body-sm px-4 text-center">
                No messages yet. Inbound texts will appear here.
              </div>
            ) : (
              sorted.map(([phone, msgs]) => {
                const last = msgs[msgs.length - 1]
                const unread = msgs.filter(m => m.direction === 'inbound').length
                return (
                  <button
                    key={phone}
                    onClick={() => setSelectedPhone(phone)}
                    className="w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-body-sm font-medium"><ContactLabel phone={phone} profiles={profiles} messages={msgs} /></span>
                      <span className="text-caption text-white/30">{timeAgo(last.created_at)}</span>
                    </div>
                    <p className="text-body-sm text-white/50 truncate mt-0.5">
                      {last.direction === 'outbound' && <span className="text-white/30">You: </span>}
                      {last.body}
                    </p>
                  </button>
                )
              })
            )}
          </div>
        ) : (
          /* ── Thread view ── */
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 px-3 py-3 space-y-2">
              {thread.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className="max-w-[80%] rounded-xl px-3 py-2"
                    style={{
                      background: msg.direction === 'outbound'
                        ? 'rgba(16,185,129,0.18)'
                        : 'rgba(255,255,255,0.08)',
                      border: msg.direction === 'outbound'
                        ? '1px solid rgba(52,211,153,0.2)'
                        : '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    {selectedPhone === 'web' && msg.direction === 'inbound' && msg.handle && (
                      <p className="text-caption text-white/40 mb-1">
                        {msg.avatar && <span className="mr-1">{msg.avatar}</span>}
                        @{msg.handle}
                      </p>
                    )}
                    <p className="text-body-sm text-white/90 whitespace-pre-wrap break-words">{msg.body}</p>
                    <p className="text-caption text-white/25 mt-1">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Reply input — hidden for web contacts (no phone to reply to) */}
            {selectedPhone === 'web' ? (
              <div className="flex-shrink-0 px-3 py-2 border-t border-white/10">
                <p className="text-caption text-white/25 text-center">Web contact — no phone number to reply to</p>
              </div>
            ) : (
            <div className="flex-shrink-0 px-3 py-2 border-t border-white/10">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
                  placeholder="Reply..."
                  className="flex-1 bg-white/5 text-white/90 text-body-sm rounded-lg px-3 py-2 border border-white/10 outline-none placeholder:text-white/20"
                  disabled={sending}
                  maxLength={1600}
                />
                <button
                  onClick={sendReply}
                  disabled={!replyText.trim() || sending}
                  className="px-3 py-2 rounded-lg text-body-sm font-medium transition-colors"
                  style={{
                    background: 'rgba(16,185,129,0.15)',
                    border: '1px solid rgba(52,211,153,0.3)',
                    color: '#6ee7b7',
                    opacity: (!replyText.trim() || sending) ? 0.3 : 1,
                    cursor: (!replyText.trim() || sending) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {sending ? '...' : 'Send'}
                </button>
              </div>
            </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
