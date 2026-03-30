import { useState, useEffect, useRef } from 'react'
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { getDeviceHash } from '../lib/device'

export const useChat = create((set) => ({
  open: false,
  unreadCount: 0,
  setOpen: (open) => set({ open }),
  setUnreadCount: (n) => set({ unreadCount: n }),
}))

// Check for unread messages on load
let _checked = false
async function checkUnread() {
  if (_checked) return
  _checked = true
  try {
    const dh = await getDeviceHash()
    const { data } = await supabase.functions.invoke('web-messages', {
      body: { action: 'unread', device_hash: dh },
    })
    if (data?.count > 0) {
      useChat.getState().setUnreadCount(data.count)
      useChat.getState().setOpen(true)
    }
  } catch (err) {
    console.error('[ChatModal] unread check failed:', err)
  }
}

// Listen for new admin replies in real time
let _subscribed = false
async function subscribeRealtime() {
  if (_subscribed) return
  _subscribed = true
  try {
    const dh = await getDeviceHash()
    supabase
      .channel('chat-replies')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sms_messages',
          filter: `device_hash=eq.${dh}`,
        },
        (payload) => {
          const msg = payload.new
          if (msg.direction === 'outbound') {
            // Admin replied — open modal if closed, notify store
            useChat.getState().setUnreadCount(useChat.getState().unreadCount + 1)
            if (!useChat.getState().open) useChat.getState().setOpen(true)
            // Dispatch a custom event so ChatModalInner can append the message
            window.dispatchEvent(new CustomEvent('lsq-chat-message', { detail: msg }))
          }
        }
      )
      .subscribe()
  } catch (err) {
    console.error('[ChatModal] realtime subscribe failed:', err)
  }
}

// Thin gate
export default function ChatModal() {
  useEffect(() => { checkUnread(); subscribeRealtime() }, [])
  const open = useChat((s) => s.open)
  if (!open) return null
  return <ChatModalInner />
}

function ChatModalInner() {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  const close = () => {
    useChat.getState().setOpen(false)
    useChat.getState().setUnreadCount(0)
  }

  // Listen for real-time admin replies
  useEffect(() => {
    const handler = (e) => {
      const msg = e.detail
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev
        return [...prev, msg]
      })
    }
    window.addEventListener('lsq-chat-message', handler)
    return () => window.removeEventListener('lsq-chat-message', handler)
  }, [])

  const fetchThread = async () => {
    try {
      const dh = await getDeviceHash()
      const { data } = await supabase.functions.invoke('web-messages', {
        body: { action: 'fetch', device_hash: dh },
      })
      if (data?.messages) setMessages(data.messages)
    } catch (err) {
      console.error('[ChatModal] fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchThread() }, [])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  useEffect(() => {
    if (!loading) {
      const t = setTimeout(() => inputRef.current?.focus(), 300)
      return () => clearTimeout(t)
    }
  }, [loading])

  const sendReply = async () => {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      const dh = await getDeviceHash()
      const handle = localStorage.getItem('lsq_handle') || null
      const avatar = localStorage.getItem('lsq_avatar') || null
      const { data } = await supabase.functions.invoke('web-messages', {
        body: { action: 'reply', device_hash: dh, body: text.trim(), handle, avatar },
      })
      if (data?.sent) {
        setText('')
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          direction: 'inbound',
          body: text.trim(),
          handle, avatar,
          created_at: new Date().toISOString(),
        }])
      }
    } catch (err) {
      console.error('[ChatModal] send failed:', err)
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center font-mono"
      onClick={(e) => { if (e.target === e.currentTarget) close() }}
    >
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
        onClick={close}
      />

      <div
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex flex-col overflow-hidden"
        style={{
          width: 'min(400px, calc(100vw - 2rem))',
          maxHeight: 'min(500px, calc(100vh - 4rem))',
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
          <span style={{ fontSize: 'var(--type-body)', fontWeight: 500 }}>Lafayette Square</span>
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

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-white/30 text-body-sm py-12">
            Loading...
          </div>
        ) : (
          <>
            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 px-3 py-3 space-y-2">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.direction === 'inbound' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className="max-w-[80%] rounded-xl px-3 py-2"
                    style={{
                      background: msg.direction === 'inbound'
                        ? 'rgba(16,185,129,0.18)'
                        : 'rgba(255,255,255,0.08)',
                      border: msg.direction === 'inbound'
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
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
                  placeholder="Reply..."
                  className="flex-1 bg-white/5 text-white/90 text-body-sm rounded-lg px-3 py-2 border border-white/10 outline-none placeholder:text-white/20"
                  disabled={sending}
                  maxLength={1600}
                />
                <button
                  onClick={sendReply}
                  disabled={!text.trim() || sending}
                  className="px-3 py-2 rounded-lg text-body-sm font-medium transition-colors"
                  style={{
                    background: 'rgba(16,185,129,0.15)',
                    border: '1px solid rgba(52,211,153,0.3)',
                    color: '#6ee7b7',
                    opacity: (!text.trim() || sending) ? 0.3 : 1,
                    cursor: (!text.trim() || sending) ? 'not-allowed' : 'pointer',
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
