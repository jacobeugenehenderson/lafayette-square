import { useState, useEffect, useRef } from 'react'
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import useGuardianStatus from '../hooks/useGuardianStatus'

export const useSmsInbox = create((set) => ({
  open: false,
  setOpen: (open) => set({ open }),

  // Deep-link target: the message id from `?msg=` in the alert SMS. Held here
  // so the inbox can jump straight to that conversation once it has loaded.
  targetMessageId: null,
  setTargetMessageId: (id) => set({ targetMessageId: id }),

  // Operator-side unread badge.
  unreadCount: 0,
  setUnreadCount: (n) => set({ unreadCount: n }),
}))

// ── Operator-side unread ────────────────────────────────────────
// "Unread" for the Host is "arrived since I last opened the inbox". There is no
// server-side seen-marker for the admin (read_at tracks the VISITOR reading our
// replies, the other direction), so the watermark lives in localStorage. That
// is per-device, which is fine for a single operator and costs no schema.
const SEEN_KEY = 'lsq_sms_last_seen'

function lastSeen() {
  try { return localStorage.getItem(SEEN_KEY) || '1970-01-01T00:00:00Z' } catch { return '1970-01-01T00:00:00Z' }
}
export function markInboxSeen() {
  try { localStorage.setItem(SEEN_KEY, new Date().toISOString()) } catch {}
  useSmsInbox.getState().setUnreadCount(0)
}

/**
 * Count inbound messages newer than the watermark, for the menu badge.
 * ⛔ On failure the count is left ALONE rather than zeroed — "I could not ask"
 * must not render as "nothing waiting". A silent zero is how a message sits
 * unanswered for a week.
 */
export async function refreshInboxUnread() {
  const adminToken = localStorage.getItem('lsq_admin_token') || ''
  if (!adminToken) return
  try {
    const { data, error } = await supabase.functions.invoke('sms-inbox', {
      body: { admin_token: adminToken },
    })
    if (error || !data?.messages) {
      console.error('[SmsInbox] unread check failed — leaving the badge as-is:', error)
      return
    }
    const since = lastSeen()
    const n = data.messages.filter((m) => m.direction === 'inbound' && m.created_at > since).length
    useSmsInbox.getState().setUnreadCount(n)
  } catch (err) {
    console.error('[SmsInbox] unread check failed — leaving the badge as-is:', err)
  }
}

// ── Deep link from the alert SMS: `?msg=<message id>` ───────────
// Read once at module load and stripped from the URL, so a reload or a shared
// link does not keep re-opening the same thread.
const _deepLinkMsgId = (() => {
  try {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('msg')
    if (!id) return null
    params.delete('msg')
    const rest = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (rest ? '?' + rest : ''))
    return id
  } catch { return null }
})()

// Thin gate
export default function SmsInbox() {
  const open = useSmsInbox((s) => s.open)
  return (
    <>
      <InboxDeepLink />
      {open ? <SmsInboxInner /> : null}
    </>
  )
}

/**
 * Honour `?msg=` from the alert text: open the inbox on that conversation.
 * If the Host is not admin on this device yet, raise the passphrase prompt and
 * open the moment they are — so tapping the link from a fresh phone still lands
 * in the right place instead of silently doing nothing.
 */
function InboxDeepLink() {
  const isAdmin = useGuardianStatus((s) => s.isAdmin)

  useEffect(() => {
    if (!_deepLinkMsgId) return
    useSmsInbox.getState().setTargetMessageId(_deepLinkMsgId)
    if (!isAdmin) useGuardianStatus.setState({ adminPromptOpen: true })
  }, [])

  useEffect(() => {
    if (_deepLinkMsgId && isAdmin) useSmsInbox.getState().setOpen(true)
  }, [isAdmin])

  // Keep the badge current for an admin who never taps a link.
  useEffect(() => { if (isAdmin) refreshInboxUnread() }, [isAdmin])

  return null
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

function parseClaimContext(messages) {
  // Extract place/address from the first inbound message's pre-filled text
  const first = (messages || []).find(m => m.direction === 'inbound')
  if (!first) return null
  const placeMatch = first.body.match(/this is my (?:place|building) — (.+?)\./)
  if (placeMatch) return placeMatch[1]
  const houseMatch = first.body.match(/this is my house/)
  if (houseMatch) return 'House claim'
  return null
}

function ContactLabel({ threadKey, profiles, messages }) {
  if (threadKey.startsWith('device:')) {
    // Device-hash thread — show handle+avatar or fall back to place/address
    const inbound = (messages || []).find(m => m.handle && m.direction === 'inbound')
    const claimContext = parseClaimContext(messages)
    if (inbound?.handle) {
      return (
        <span className="flex items-center gap-1.5">
          {inbound.avatar && <span>{inbound.avatar}</span>}
          <span className="text-white/90">@{inbound.handle}</span>
        </span>
      )
    }
    return (
      <span className="text-white/70">{claimContext || 'Anonymous'}</span>
    )
  }
  // Phone thread
  const p = profiles[threadKey]
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-white/90">{p?.display_name || formatPhone(threadKey)}</span>
      {p?.neighborhood_relationship && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/8 text-white/40 border border-white/6">
          {ROLE_LABELS[p.neighborhood_relationship] || p.neighborhood_relationship}
        </span>
      )}
    </span>
  )
}

/**
 * Which conversation a message belongs to. ⭐ One definition, used by the
 * grouping AND the deep link — if these two ever disagreed, a tapped link would
 * select a thread key that no conversation has, and open nothing.
 */
function threadKeyOf(msg) {
  return msg.phone === 'web' && msg.device_hash ? `device:${msg.device_hash}` : msg.phone
}

function SmsInboxInner() {
  const [messages, setMessages] = useState([])
  const [profiles, setProfiles] = useState({})  // phone → { display_name, neighborhood_relationship }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)   // a reachability failure, never an empty inbox
  const [selectedThread, setSelectedPhone] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  const close = () => useSmsInbox.getState().setOpen(false)
  const adminToken = localStorage.getItem('lsq_admin_token') || ''

  /* ⛔ A FAILED FETCH IS NOT AN EMPTY INBOX, and this function used to render it
     as one. `setMessages` was only called on success, so an auth rejection, a
     dropped connection or a cold function left the list at its initial [] and
     the operator read "No messages yet. Inbound texts will appear here." — a
     sentence that says the system is fine and nobody has written.
     ⭐ THE FILE ALREADY KNEW. `refreshInboxUnread` above carries the rule in as
     many words — "a silent zero is how a message sits unanswered for a week" —
     and leaves the badge alone rather than zeroing it on error. That guard was
     written for the BADGE and never applied to the LIST it belongs to.
     ⚠️ Worth keeping in mind when this fires: the token is minted by `adminAuth`
     through Apps Script, and validated here by a SUPABASE function. Two
     backends, one credential — so a passphrase that signed you in can still be
     refused by the inbox, and that is an error, not an absence. */
  const fetchMessages = async () => {
    setError(null)
    try {
      const { data, error } = await supabase.functions.invoke('sms-inbox', {
        body: { admin_token: adminToken },
      })
      if (error) {
        console.error('[SmsInbox] fetch error:', error)
        setError(error.message || String(error))
        return
      }
      if (!data?.messages) {
        console.error('[SmsInbox] fetch returned no messages field:', data)
        setError('The inbox replied without any messages.')
        return
      }
      setMessages(data.messages)
      setProfiles(data.profiles || {})
    } catch (err) {
      console.error('[SmsInbox] fetch failed:', err)
      setError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchMessages() }, [])

  // Opening the inbox IS the operator reading it — drop the badge.
  useEffect(() => { markInboxSeen() }, [])

  // Deep link: once messages are in, jump to the conversation the alert text
  // pointed at. Cleared either way, so a message that has since been deleted
  // leaves the operator on the list rather than stuck waiting for a jump.
  const targetMessageId = useSmsInbox((s) => s.targetMessageId)
  useEffect(() => {
    if (!targetMessageId || !messages.length) return
    const msg = messages.find((m) => m.id === targetMessageId)
    if (msg) setSelectedPhone(threadKeyOf(msg))
    else console.warn(`[SmsInbox] deep-link message ${targetMessageId} not found`)
    useSmsInbox.getState().setTargetMessageId(null)
  }, [targetMessageId, messages])

  // Auto-scroll thread to bottom
  useEffect(() => {
    if (selectedThread && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [selectedThread, messages])

  // Focus input when thread opens
  useEffect(() => {
    if (selectedThread) {
      const t = setTimeout(() => inputRef.current?.focus(), 300)
      return () => clearTimeout(t)
    }
  }, [selectedThread])

  // Group messages into conversations — by device_hash for web, by phone for SMS
  const conversations = {}
  for (const msg of messages) {
    const key = threadKeyOf(msg)
    if (!conversations[key]) conversations[key] = []
    conversations[key].push(msg)
  }

  // Sort conversations by most recent message
  const sorted = Object.entries(conversations).sort((a, b) => {
    const lastA = a[1][a[1].length - 1]
    const lastB = b[1][b[1].length - 1]
    return new Date(lastB.created_at) - new Date(lastA.created_at)
  })

  const sendReply = async () => {
    if (!replyText.trim() || sending || !selectedThread) return
    setSending(true)
    // For device threads, send the device_hash; for phone threads, send the phone
    const isDevice = selectedThread.startsWith('device:')
    const to = isDevice ? selectedThread.slice(7) : selectedThread
    try {
      const { data, error } = await supabase.functions.invoke('sms-reply', {
        body: { to, body: replyText.trim(), admin_token: adminToken },
      })
      if (data?.sent) {
        setReplyText('')
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          phone: isDevice ? 'web' : selectedThread,
          device_hash: isDevice ? to : null,
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

  const thread = selectedThread ? conversations[selectedThread] || [] : []

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
          {selectedThread ? (
            <>
              <button
                onClick={() => setSelectedPhone(null)}
                className="text-white/40 hover:text-white/70 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
              <span className="text-body font-medium flex-1"><ContactLabel threadKey={selectedThread} profiles={profiles} messages={thread} /></span>
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
        ) : !selectedThread ? (
          /* ── Conversation list ── */
          <div className="flex-1 overflow-y-auto min-h-0">
            {/* ⛔ THE TWO STATES MUST NOT LOOK ALIKE. "Nobody has written" is
                reassuring; "we could not ask" is a thing to act on. Reaching for
                the same grey sentence for both is what let this sit unnoticed. */}
            {error ? (
              <div className="flex flex-col items-center justify-center h-full text-body-sm px-6 text-center gap-2">
                <span className="text-amber-300/90">Couldn&rsquo;t reach the inbox.</span>
                <span className="text-white/40">This is not an empty inbox &mdash; your messages may be fine. Your admin session may have expired; sign in again with <code className="text-white/60">?admin</code>.</span>
                <span className="text-white/25 text-caption break-words max-w-full">{error}</span>
                <button onClick={() => { setLoading(true); fetchMessages() }}
                  className="mt-1 px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-white/80 transition-colors">
                  Try again
                </button>
              </div>
            ) : sorted.length === 0 ? (
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
                      <span className="text-body-sm font-medium"><ContactLabel threadKey={phone} profiles={profiles} messages={msgs} /></span>
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
                    <p className="text-body-sm text-white/90 whitespace-pre-wrap break-words">{msg.body}</p>
                    <p className="text-caption text-white/25 mt-1">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Reply input */}
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
          </>
        )}
      </div>
    </div>
  )
}
