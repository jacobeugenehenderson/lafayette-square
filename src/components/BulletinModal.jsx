import { useState, useEffect, useRef, useCallback } from 'react'
import useBulletin from '../hooks/useBulletin'
import useHandle from '../hooks/useHandle'
import useLocalStatus from '../hooks/useLocalStatus'
import useCamera from '../hooks/useCamera'
import AvatarCircle from './AvatarCircle'

const SECTIONS = [
  { id: 'buy-nothing', title: 'Buy Nothing' },
  { id: 'for-sale', title: 'For Sale' },
  { id: 'missed-connections', title: 'Missed Connections' },
  { id: 'delivery-errands', title: 'Delivery & Errands' },
  { id: 'concierge', title: 'Concierge' },
  { id: 'professional-services', title: 'Professional Services' },
  { id: 'domestic-services', title: 'Domestic Services' },
  { id: 'emergency-supplies', title: 'Emergency Supplies' },
  { id: 'square-notes', title: 'Square Notes' },
]

const SECTION_MAP = Object.fromEntries(SECTIONS.map(s => [s.id, s.title]))

// Sections where anonymous posting is the default
const ANON_DEFAULT_SECTIONS = new Set([
  'missed-connections', 'square-notes', 'emergency-supplies',
])

const POST_MAX_CHARS = 1000

// Curated color palette for {color:name} tags
const COLOR_PALETTE = {
  brick:    { label: 'Brick',    css: 'rgb(183, 110, 97)'  },
  sage:     { label: 'Sage',     css: 'rgb(138, 170, 132)' },
  gold:     { label: 'Gold',     css: 'rgb(212, 175, 85)'  },
  sky:      { label: 'Sky',      css: 'rgb(120, 170, 210)' },
  coral:    { label: 'Coral',    css: 'rgb(210, 120, 120)' },
  lavender: { label: 'Lavender', css: 'rgb(168, 140, 196)' },
  cream:    { label: 'Cream',    css: 'rgb(225, 215, 195)' },
  slate:    { label: 'Slate',    css: 'rgb(140, 150, 165)' },
}

function relativeTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d`
  return `${Math.floor(days / 7)}w`
}

// ── Extended Markdown renderer ──────────────────────────────────────
// Supports: # heading, ## subheading, > blockquote, ---, lists,
// {color:name}...{/color}, {big}...{/big}, {small}...{/small},
// {center}...{/center}, {right}...{/right},
// **bold**, *italic*, ~~strike~~, [links](url), images, bare URLs.

function renderMarkdown(text) {
  if (!text) return null
  const lines = text.split('\n')
  const elements = []
  let listItems = []
  let blockquoteLines = []
  let key = 0

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={key++} className="list-disc list-inside space-y-0.5 my-1">
          {listItems.map((li, i) => <li key={i}>{li}</li>)}
        </ul>
      )
      listItems = []
    }
  }

  const flushBlockquote = () => {
    if (blockquoteLines.length > 0) {
      elements.push(
        <blockquote key={key++} className="border-l-2 border-outline pl-3 my-1.5 text-on-surface-subtle italic">
          {blockquoteLines.map((bl, i) => <span key={i}>{renderInline(bl)}{i < blockquoteLines.length - 1 && <br />}</span>)}
        </blockquote>
      )
      blockquoteLines = []
    }
  }

  for (const line of lines) {
    // Blockquote
    const bqMatch = line.match(/^>\s*(.*)/)
    if (bqMatch) {
      flushList()
      blockquoteLines.push(bqMatch[1])
      continue
    }
    flushBlockquote()

    // Unordered list item
    const listMatch = line.match(/^[-*]\s+(.+)/)
    if (listMatch) {
      listItems.push(renderInline(listMatch[1]))
      continue
    }
    flushList()

    // Horizontal rule
    if (/^-{3,}$/.test(line.trim())) {
      elements.push(<hr key={key++} className="border-outline-variant my-2" />)
      continue
    }

    // Heading ##
    const h2Match = line.match(/^##\s+(.+)/)
    if (h2Match) {
      elements.push(<div key={key++} className="text-label-sm font-semibold text-on-surface-variant mt-2 mb-0.5">{renderInline(h2Match[1])}</div>)
      continue
    }

    // Heading #
    const h1Match = line.match(/^#\s+(.+)/)
    if (h1Match) {
      elements.push(<div key={key++} className="text-body font-bold text-on-surface mt-2 mb-0.5">{renderInline(h1Match[1])}</div>)
      continue
    }

    // Alignment blocks — full line wraps
    const centerMatch = line.match(/^\{center\}(.*)\{\/center\}$/)
    if (centerMatch) {
      elements.push(<div key={key++} className="text-center">{renderInline(centerMatch[1])}</div>)
      continue
    }
    const rightMatch = line.match(/^\{right\}(.*)\{\/right\}$/)
    if (rightMatch) {
      elements.push(<div key={key++} className="text-right">{renderInline(rightMatch[1])}</div>)
      continue
    }

    if (line.trim() === '') {
      elements.push(<br key={key++} />)
    } else {
      elements.push(<span key={key++}>{renderInline(line)}<br /></span>)
    }
  }
  flushList()
  flushBlockquote()

  return elements
}

function renderInline(text) {
  const parts = []
  let remaining = text
  let key = 0

  const patterns = [
    // Color tag: {color:name}text{/color}
    { re: /\{color:(\w+)\}(.*?)\{\/color\}/, render: (m) => {
      const c = COLOR_PALETTE[m[1]]
      return <span key={key++} style={c ? { color: c.css } : undefined}>{renderInline(m[2])}</span>
    }},
    // Size tags: {big}text{/big}, {small}text{/small}
    { re: /\{big\}(.*?)\{\/big\}/, render: (m) => (
      <span key={key++} className="text-[14px]">{renderInline(m[1])}</span>
    )},
    { re: /\{small\}(.*?)\{\/small\}/, render: (m) => (
      <span key={key++} className="text-caption">{renderInline(m[1])}</span>
    )},
    // Markdown image: ![alt](url)
    { re: /!\[([^\]]*)\]\(([^)]+)\)/, render: (m) => (
      <img key={key++} src={m[2]} alt={m[1]} className="max-w-full rounded my-1 inline-block" loading="lazy" />
    )},
    // Markdown link: [text](url)
    { re: /\[([^\]]+)\]\(([^)]+)\)/, render: (m) => (
      <a key={key++} href={m[2]} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">{m[1]}</a>
    )},
    // Bold: **text**
    { re: /\*\*(.+?)\*\*/, render: (m) => <strong key={key++} className="font-semibold text-on-surface">{m[1]}</strong> },
    // Italic: *text*
    { re: /\*(.+?)\*/, render: (m) => <em key={key++}>{m[1]}</em> },
    // Strikethrough: ~~text~~
    { re: /~~(.+?)~~/, render: (m) => <del key={key++} className="text-on-surface-disabled">{m[1]}</del> },
    // Bare image URL
    { re: /(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg)(\?[^\s]*)?)/, render: (m) => (
      <img key={key++} src={m[1]} alt="" className="max-w-full rounded my-1 inline-block" loading="lazy" />
    )},
    // Bare URL
    { re: /(https?:\/\/[^\s]+)/, render: (m) => (
      <a key={key++} href={m[1]} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">{m[1].replace(/^https?:\/\//, '').slice(0, 40)}{m[1].replace(/^https?:\/\//, '').length > 40 ? '...' : ''}</a>
    )},
  ]

  while (remaining.length > 0) {
    let earliest = null
    let earliestIdx = Infinity
    let earliestPattern = null

    for (const p of patterns) {
      const match = remaining.match(p.re)
      if (match && match.index < earliestIdx) {
        earliest = match
        earliestIdx = match.index
        earliestPattern = p
      }
    }

    if (!earliest) {
      parts.push(remaining)
      break
    }

    if (earliestIdx > 0) {
      parts.push(remaining.slice(0, earliestIdx))
    }
    parts.push(earliestPattern.render(earliest))
    remaining = remaining.slice(earliestIdx + earliest[0].length)
  }

  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : parts
}

// ── Formatting toolbar + textarea ───────────────────────────────────

function FormattedTextarea({ value, onChange, placeholder, rows = 4 }) {
  const ref = useRef(null)
  const [showColors, setShowColors] = useState(false)

  const wrap = useCallback((before, after) => {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = value.slice(start, end)
    const replacement = before + (selected || 'text') + after
    const next = value.slice(0, start) + replacement + value.slice(end)
    onChange(next.slice(0, POST_MAX_CHARS))
    requestAnimationFrame(() => {
      const cursorPos = selected ? start + replacement.length : start + before.length
      const cursorEnd = selected ? cursorPos : cursorPos + 4
      el.focus()
      el.setSelectionRange(selected ? cursorPos : start + before.length, selected ? cursorPos : cursorEnd)
    })
  }, [value, onChange])

  const insertAtCursor = useCallback((text) => {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart
    const next = value.slice(0, start) + text + value.slice(start)
    onChange(next.slice(0, POST_MAX_CHARS))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + text.length, start + text.length)
    })
  }, [value, onChange])

  const wrapLine = useCallback((before, after) => {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = value.slice(start, end)
    const replacement = before + (selected || 'text') + after
    // If we're not at the start of a line, prepend newline
    const prefix = start > 0 && value[start - 1] !== '\n' ? '\n' : ''
    const next = value.slice(0, start) + prefix + replacement + value.slice(end)
    onChange(next.slice(0, POST_MAX_CHARS))
    requestAnimationFrame(() => {
      const offset = prefix.length + before.length
      el.focus()
      if (selected) {
        el.setSelectionRange(start + prefix.length + replacement.length, start + prefix.length + replacement.length)
      } else {
        el.setSelectionRange(start + offset, start + offset + 4)
      }
    })
  }, [value, onChange])

  const insertLink = useCallback(() => {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = value.slice(start, end)
    const isUrl = selected.startsWith('http')
    const replacement = isUrl ? `[link](${selected})` : `[${selected || 'text'}](url)`
    const next = value.slice(0, start) + replacement + value.slice(end)
    onChange(next.slice(0, POST_MAX_CHARS))
    requestAnimationFrame(() => {
      el.focus()
      if (isUrl) {
        el.setSelectionRange(start + 1, start + 5)
      } else if (selected) {
        const urlStart = start + replacement.indexOf('](') + 2
        el.setSelectionRange(urlStart, urlStart + 3)
      } else {
        el.setSelectionRange(start + 1, start + 5)
      }
    })
  }, [value, onChange])

  const applyColor = useCallback((colorName) => {
    wrap(`{color:${colorName}}`, '{/color}')
    setShowColors(false)
  }, [wrap])

  const btnClass = "px-1.5 py-1 rounded text-on-surface-disabled hover:text-on-surface-variant hover:bg-surface-container-high transition-colors text-label-sm"

  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container overflow-hidden focus-within:border-outline transition-colors">
      {/* Main toolbar */}
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-outline-variant flex-wrap">
        <button type="button" onClick={() => wrap('**', '**')} className={btnClass} title="Bold">
          <strong>B</strong>
        </button>
        <button type="button" onClick={() => wrap('*', '*')} className={btnClass} title="Italic">
          <em>I</em>
        </button>
        <button type="button" onClick={() => wrap('~~', '~~')} className={btnClass} title="Strikethrough">
          <del>S</del>
        </button>
        <button type="button" onClick={insertLink} className={btnClass} title="Link">
          <svg className="w-3.5 h-3.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </button>
        <span className="w-px h-4 bg-surface-container-high mx-0.5" />
        <button type="button" onClick={() => wrapLine('# ', '')} className={btnClass} title="Heading">
          H1
        </button>
        <button type="button" onClick={() => wrapLine('## ', '')} className={btnClass} title="Subheading">
          H2
        </button>
        <button type="button" onClick={() => wrap('\n- ', '')} className={btnClass} title="List item">
          <svg className="w-3.5 h-3.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
          </svg>
        </button>
        <button type="button" onClick={() => wrapLine('> ', '')} className={btnClass} title="Blockquote">
          <svg className="w-3.5 h-3.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button>
        <button type="button" onClick={() => insertAtCursor('\n---\n')} className={btnClass} title="Divider">
          <span className="text-[9px]">---</span>
        </button>
        <span className="w-px h-4 bg-surface-container-high mx-0.5" />
        <button type="button" onClick={() => wrap('{big}', '{/big}')} className={btnClass} title="Large text">
          <span className="text-[13px] leading-none">A</span>
        </button>
        <button type="button" onClick={() => wrap('{small}', '{/small}')} className={btnClass} title="Small text">
          <span className="text-[8px] leading-none">A</span>
        </button>
        <button type="button" onClick={() => wrapLine('{center}', '{/center}')} className={btnClass} title="Center align">
          <svg className="w-3.5 h-3.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M4 6h16M7 12h10M5 18h14" />
          </svg>
        </button>
        <button type="button" onClick={() => wrapLine('{right}', '{/right}')} className={btnClass} title="Right align">
          <svg className="w-3.5 h-3.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M4 6h16M8 12h12M6 18h14" />
          </svg>
        </button>
        <span className="w-px h-4 bg-surface-container-high mx-0.5" />
        {/* Color toggle */}
        <button
          type="button"
          onClick={() => setShowColors(!showColors)}
          className={`${btnClass} ${showColors ? 'bg-surface-container-high text-on-surface-variant' : ''}`}
          title="Color"
        >
          <svg className="w-3.5 h-3.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
        </button>
        <span className="ml-auto text-caption text-on-surface-disabled">{value.length}/{POST_MAX_CHARS}</span>
      </div>
      {/* Color palette row */}
      {showColors && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-outline-variant bg-surface-container">
          {Object.entries(COLOR_PALETTE).map(([name, { label, css }]) => (
            <button
              key={name}
              type="button"
              onClick={() => applyColor(name)}
              className="w-5 h-5 rounded-full border border-outline hover:border-outline transition-colors flex-shrink-0"
              style={{ backgroundColor: css }}
              title={label}
            />
          ))}
        </div>
      )}
      {/* Textarea */}
      <textarea
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value.slice(0, POST_MAX_CHARS))}
        placeholder={placeholder}
        rows={rows}
        className="w-full bg-transparent px-3 py-2 text-body-sm text-on-surface placeholder-on-surface-disabled resize-none focus:outline-none leading-relaxed"
      />
    </div>
  )
}

// ── Identity confirmation popup ─────────────────────────────────────
// Shows before posting: section-aware default (anon vs named),
// toggle to override, "don't ask again" checkbox in localStorage.

const IDENTITY_PREF_KEY = 'lsq_bulletin_identity_pref'

function getStoredIdentityPref() {
  try {
    const raw = localStorage.getItem(IDENTITY_PREF_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return null // null = no stored pref, show popup
}

function storeIdentityPref(anonymous) {
  localStorage.setItem(IDENTITY_PREF_KEY, JSON.stringify({ anonymous, dontAsk: true }))
}

function clearIdentityPref() {
  localStorage.removeItem(IDENTITY_PREF_KEY)
}

function IdentityPopup({ section, handle, onConfirm, onCancel }) {
  const sectionDefault = ANON_DEFAULT_SECTIONS.has(section)
  const [anonymous, setAnonymous] = useState(sectionDefault)
  const [dontAsk, setDontAsk] = useState(false)

  const handleConfirm = () => {
    if (dontAsk) storeIdentityPref(anonymous)
    onConfirm(anonymous)
  }

  return (
    <div className="absolute inset-0 z-10 bg-surface-scrim backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface border border-outline rounded-xl p-4 max-w-xs w-full space-y-3">
        <h3 className="text-body-sm font-semibold text-on-surface">Post as...</h3>

        <div className="space-y-2">
          <label className="flex items-center gap-2.5 p-2 rounded-lg cursor-pointer hover:bg-surface-container transition-colors">
            <input
              type="radio"
              name="identity"
              checked={!anonymous}
              onChange={() => setAnonymous(false)}
              className="accent-blue-400"
            />
            <div>
              <div className="text-label-sm text-on-surface-medium font-medium">@{handle}</div>
              <div className="text-caption text-on-surface-disabled">Your handle is visible on the post</div>
            </div>
          </label>
          <label className="flex items-center gap-2.5 p-2 rounded-lg cursor-pointer hover:bg-surface-container transition-colors">
            <input
              type="radio"
              name="identity"
              checked={anonymous}
              onChange={() => setAnonymous(true)}
              className="accent-blue-400"
            />
            <div>
              <div className="text-label-sm text-on-surface-medium font-medium">Anonymous</div>
              <div className="text-caption text-on-surface-disabled">No name shown; you can still delete it</div>
            </div>
          </label>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={dontAsk}
            onChange={e => setDontAsk(e.target.checked)}
            className="accent-blue-400 w-3 h-3"
          />
          <span className="text-caption text-on-surface-disabled">Don't ask again</span>
        </label>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 py-1.5 rounded-lg bg-surface-container text-on-surface-subtle text-label-sm hover:bg-surface-container-high transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-1.5 rounded-lg bg-surface-container-highest text-on-surface text-label-sm hover:bg-surface-container-highest transition-colors"
          >
            Post
          </button>
        </div>

        {getStoredIdentityPref() && (
          <button
            onClick={clearIdentityPref}
            className="w-full text-caption text-on-surface-disabled hover:text-on-surface-subtle transition-colors"
          >
            Reset "don't ask" preference
          </button>
        )}
      </div>
    </div>
  )
}

// ── Comment section (inline under a post) ───────────────────────────
const COMMENT_MAX_CHARS = 500

function CommentSection({ bulletinId, section, canPost }) {
  const commentsMap = useBulletin(s => s.comments)
  const loadComments = useBulletin(s => s.loadComments)
  const addComment = useBulletin(s => s.addComment)
  const removeCommentAction = useBulletin(s => s.removeComment)
  const handle = useHandle(s => s.handle)
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    loadComments(bulletinId)
  }, [bulletinId, loadComments])

  const comments = commentsMap[bulletinId] || []

  // Resolve anonymous preference for comments: use stored pref or section default
  const getAnonForComment = () => {
    const pref = getStoredIdentityPref()
    if (pref && pref.dontAsk) return pref.anonymous
    return ANON_DEFAULT_SECTIONS.has(section)
  }

  const handleSubmit = async () => {
    if (!text.trim()) return
    setPosting(true)
    const ok = await addComment(bulletinId, text.trim(), getAnonForComment())
    setPosting(false)
    if (ok) setText('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="mt-1.5 pl-3 border-l border-outline-variant">
      {/* Comment list */}
      {comments.length > 0 && (
        <div className="space-y-1.5 mb-1.5">
          {comments.map(c => (
            <div key={c.id} className="text-caption leading-relaxed flex items-center gap-1">
              <div className="flex-1 min-w-0 flex items-center gap-1">
                <span className="text-on-surface-subtle mr-0.5 inline-flex items-center gap-0.5">
                  {c.handle ? <><AvatarCircle emoji={c.avatar} vignette={c.vignette} size={5} fallback={c.handle[0].toUpperCase()} />@{c.handle}</> : <em className="text-on-surface-disabled">anon</em>}
                </span>
                <span className="text-on-surface-subtle">{c.text}</span>
                <span className="text-on-surface-disabled ml-1.5">{relativeTime(c.created_at)}</span>
              </div>
              {c.is_mine && (
                <button
                  onClick={() => removeCommentAction(bulletinId, c.id)}
                  className="text-caption text-red-400/30 hover:text-red-400/70 transition-colors flex-shrink-0"
                  title="Delete comment"
                >
                  x
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Reply input */}
      {canPost && (
        <div className="flex gap-1.5 items-center">
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value.slice(0, COMMENT_MAX_CHARS))}
            onKeyDown={handleKeyDown}
            placeholder="Reply..."
            className="flex-1 input rounded px-2 py-1 text-caption"
          />
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || posting}
            className="text-caption px-2 py-1 rounded bg-surface-container text-on-surface-subtle hover:text-on-surface-variant transition-colors disabled:opacity-30"
          >
            {posting ? '...' : 'Reply'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Browse view ─────────────────────────────────────────────────────
function BrowseView({ onNewPost, onOpenThreads }) {
  const posts = useBulletin(s => s.posts)
  const threads = useBulletin(s => s.threads)
  const handle = useHandle(s => s.handle)
  const { isLocal, distinctDays, threshold } = useLocalStatus()
  const remove = useBulletin(s => s.remove)
  const startThreadAction = useBulletin(s => s.startThread)
  const [filter, setFilter] = useState(null)
  const [expanded, setExpanded] = useState({}) // { [postId]: true } — expanded comment sections

  const filtered = filter ? posts.filter(p => p.section === filter) : posts

  const canPost = isLocal && handle
  const gateReason = !isLocal
    ? `Check in at ${threshold - distinctDays} more spot${threshold - distinctDays === 1 ? '' : 's'} to unlock posting`
    : !handle
    ? 'Pick a handle on your next check-in to start posting'
    : null

  const toggleComments = (postId) => {
    setExpanded(prev => ({ ...prev, [postId]: !prev[postId] }))
  }

  return (
    <div className="flex flex-col h-full">
      {/* Section filter pills */}
      <div className="flex gap-1.5 px-3 py-2 overflow-x-auto flex-shrink-0 border-b border-outline-variant">
        <button
          onClick={() => setFilter(null)}
          className={`flex-shrink-0 px-2.5 py-1 rounded-full text-caption transition-colors ${
            !filter ? 'bg-surface-container-highest text-on-surface' : 'bg-surface-container text-on-surface-subtle hover:text-on-surface-variant'
          }`}
        >
          All
        </button>
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setFilter(filter === s.id ? null : s.id)}
            className={`flex-shrink-0 px-2.5 py-1 rounded-full text-caption transition-colors whitespace-nowrap ${
              filter === s.id ? 'bg-surface-container-highest text-on-surface' : 'bg-surface-container text-on-surface-subtle hover:text-on-surface-variant'
            }`}
          >
            {s.title}
          </button>
        ))}
      </div>

      {/* Posts list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {filtered.length === 0 && (
          <div className="text-center py-10">
            <p className="text-on-surface-subtle text-body">No posts yet</p>
            <p className="text-on-surface-disabled text-body-sm mt-1">Be the first to post!</p>
          </div>
        )}
        <div className="divide-y divide-white/5">
          {filtered.map(post => {
            const isAnon = !post.handle
            const isMine = post.is_mine
            const commentCount = post.comment_count || 0
            const isExpanded = expanded[post.id]
            return (
              <div key={post.id} className="px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {isAnon ? (
                        <span className="text-label-sm text-on-surface-subtle italic">anonymous</span>
                      ) : (
                        <span className="text-label-sm text-on-surface-variant font-medium inline-flex items-center gap-1"><AvatarCircle emoji={post.avatar} vignette={post.vignette} size={5} fallback={post.handle?.[0]?.toUpperCase()} />@{post.handle}</span>
                      )}
                      <span className="text-caption text-on-surface-disabled">{relativeTime(post.created_at)}</span>
                      <span className="text-caption px-1.5 py-0.5 rounded bg-surface-container text-on-surface-disabled">
                        {SECTION_MAP[post.section] || post.section}
                      </span>
                    </div>
                    <div className="text-label-sm text-on-surface-variant leading-relaxed break-words">
                      {renderMarkdown(post.text)}
                    </div>
                    {/* Comment toggle + actions row */}
                    <div className="flex items-center gap-3 mt-1.5">
                      <button
                        onClick={() => toggleComments(post.id)}
                        className="text-caption text-on-surface-disabled hover:text-on-surface-subtle transition-colors flex items-center gap-1"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        {commentCount > 0 ? commentCount : 'Comment'}
                      </button>
                      {!isMine && !isAnon && canPost && (
                        <button
                          onClick={() => startThreadAction(post.id)}
                          className="text-caption text-on-surface-disabled hover:text-on-surface-subtle transition-colors"
                        >
                          Message
                        </button>
                      )}
                    </div>
                    {/* Expanded comments */}
                    {isExpanded && (
                      <CommentSection bulletinId={post.id} section={post.section} canPost={canPost} />
                    )}
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    {isMine && (
                      <button
                        onClick={() => remove(post.id)}
                        className="text-caption px-2 py-1 rounded bg-surface-container text-red-400/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex-shrink-0 p-3 border-t border-outline-variant flex items-center justify-between gap-2">
        {threads.length > 0 && (
          <button
            onClick={onOpenThreads}
            className="text-label-sm px-3 py-1.5 rounded-lg bg-surface-container text-on-surface-subtle hover:text-on-surface-variant hover:bg-surface-container-high transition-colors flex items-center gap-1.5"
          >
            Threads
            <span className="bg-blue-500/20 text-blue-400 text-caption px-1.5 py-0.5 rounded-full">{threads.length}</span>
          </button>
        )}
        {canPost ? (
          <button
            onClick={onNewPost}
            className="ml-auto text-label-sm px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
          >
            + New Post
          </button>
        ) : (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-caption text-on-surface-disabled">{gateReason}</span>
            <span className="text-label-sm px-3 py-1.5 rounded-lg bg-surface-container text-on-surface-disabled cursor-default">
              + New Post
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── New post view ───────────────────────────────────────────────────
function NewPostView({ onBack }) {
  const postBulletin = useBulletin(s => s.post)
  const handle = useHandle(s => s.handle)
  const [section, setSection] = useState('')
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showIdentity, setShowIdentity] = useState(false)

  const handleSubmit = () => {
    if (!section || !text.trim()) return
    // Check stored preference
    const pref = getStoredIdentityPref()
    if (pref && pref.dontAsk) {
      doPost(pref.anonymous)
    } else {
      setShowIdentity(true)
    }
  }

  const doPost = async (anonymous) => {
    setShowIdentity(false)
    setPosting(true)
    const ok = await postBulletin(section, text.trim(), anonymous)
    setPosting(false)
    if (ok) onBack()
  }

  return (
    <div className="p-3 space-y-3 overflow-y-auto relative">
      {showIdentity && (
        <IdentityPopup
          section={section}
          handle={handle}
          onConfirm={doPost}
          onCancel={() => setShowIdentity(false)}
        />
      )}

      <button onClick={onBack} className="text-on-surface-subtle text-body-sm hover:text-on-surface-variant transition-colors flex items-center gap-1">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <div>
        <label className="text-caption text-on-surface-subtle uppercase tracking-wider block mb-1.5">Section</label>
        <div className="flex flex-wrap gap-1.5">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`px-2.5 py-1 rounded-lg text-caption transition-colors ${
                section === s.id ? 'bg-surface-container-highest text-on-surface' : 'bg-surface-container text-on-surface-subtle hover:text-on-surface-variant'
              }`}
            >
              {s.title}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-caption text-on-surface-subtle uppercase tracking-wider">Post</label>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="text-caption text-on-surface-disabled hover:text-on-surface-subtle transition-colors"
          >
            {showPreview ? 'Edit' : 'Preview'}
          </button>
        </div>
        {showPreview ? (
          <div className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2 min-h-[5rem] text-body-sm text-on-surface-variant leading-relaxed break-words">
            {text.trim() ? renderMarkdown(text) : <span className="text-on-surface-disabled">Nothing to preview</span>}
          </div>
        ) : (
          <FormattedTextarea
            value={text}
            onChange={setText}
            placeholder="**bold** *italic* # heading > quote {color:brick}color{/color} {big}big{/big}"
          />
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!section || !text.trim() || posting}
        className="w-full py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-body-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {posting ? 'Posting...' : 'Post'}
      </button>
    </div>
  )
}

// ── Thread list view ────────────────────────────────────────────────
function ThreadListView({ onBack, onOpenThread }) {
  const threads = useBulletin(s => s.threads)

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-3 py-2 border-b border-outline-variant">
        <button onClick={onBack} className="text-on-surface-subtle text-body-sm hover:text-on-surface-variant transition-colors flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {threads.length === 0 && (
          <div className="text-center py-10">
            <p className="text-on-surface-subtle text-body">No active threads</p>
          </div>
        )}
        <div className="divide-y divide-white/5">
          {threads.map(thread => (
            <button
              key={thread.id}
              onClick={() => onOpenThread(thread.id)}
              className="w-full px-3 py-3 text-left hover:bg-surface-container transition-colors"
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-label-sm text-on-surface-variant font-medium">@{thread.other_handle}</span>
                <span className="text-caption text-on-surface-disabled">{relativeTime(thread.last_message_at)}</span>
              </div>
              {thread.last_message && (
                <p className="text-caption text-on-surface-subtle truncate">{thread.last_message}</p>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Thread detail view (chat) ───────────────────────────────────────
function ThreadDetailView({ onBack }) {
  const activeThread = useBulletin(s => s.activeThread)
  const messages = useBulletin(s => s.messages)
  const threads = useBulletin(s => s.threads)
  const sendMessageAction = useBulletin(s => s.sendMessage)
  const closeThreadAction = useBulletin(s => s.closeThread)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const scrollRef = useRef(null)

  const thread = threads.find(t => t.id === activeThread)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async () => {
    if (!text.trim()) return
    setSending(true)
    const msg = text.trim()
    setText('')
    await sendMessageAction(msg)
    setSending(false)
  }

  const handleClose = async () => {
    await closeThreadAction(activeThread)
    onBack()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-outline-variant flex items-center justify-between">
        <button onClick={onBack} className="text-on-surface-subtle text-body-sm hover:text-on-surface-variant transition-colors flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <span className="text-label-sm text-on-surface-variant">@{thread?.other_handle || '...'}</span>
        <button
          onClick={() => setConfirmClose(true)}
          className="text-caption text-red-400/50 hover:text-red-400 transition-colors"
        >
          Close
        </button>
      </div>

      {/* Confirm close */}
      {confirmClose && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/20 flex items-center justify-between">
          <p className="text-red-300 text-caption">This will permanently delete all messages.</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmClose(false)} className="text-caption text-on-surface-subtle hover:text-on-surface-variant">Cancel</button>
            <button onClick={handleClose} className="text-caption text-red-400 hover:text-red-300">Delete</button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 p-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-center text-on-surface-disabled text-body-sm py-4">Start the conversation</p>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.is_mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-3 py-1.5 rounded-xl text-label-sm leading-relaxed ${
              msg.is_mine
                ? 'bg-blue-500/20 text-on-surface-medium rounded-br-sm'
                : 'bg-surface-container-high text-on-surface-variant rounded-bl-sm'
            }`}>
              {msg.text}
              <div className={`text-caption mt-0.5 ${msg.is_mine ? 'text-blue-300/30' : 'text-on-surface-disabled'}`}>
                {relativeTime(msg.created_at)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 p-2 border-t border-outline-variant flex gap-2">
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          className="flex-1 input rounded-lg px-3 py-1.5 text-label-sm"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending}
          className="px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface-variant text-label-sm hover:bg-surface-container-highest transition-colors disabled:opacity-30"
        >
          Send
        </button>
      </div>
    </div>
  )
}

// ── Main panel (PlaceCard-style positioning + glass) ────────────────
export default function BulletinModal() {
  const modalOpen = useBulletin(s => s.modalOpen)
  const setModalOpen = useBulletin(s => s.setModalOpen)
  const refresh = useBulletin(s => s.refresh)
  const openThread = useBulletin(s => s.openThread)
  const activeThread = useBulletin(s => s.activeThread)
  const panelOpen = useCamera(s => s.panelOpen)
  // 'browse' | 'new-post' | 'threads' | 'thread-detail'
  const [view, setView] = useState('browse')

  useEffect(() => {
    if (modalOpen) {
      refresh()
      setView('browse')
    }
  }, [modalOpen, refresh])

  useEffect(() => {
    if (activeThread && modalOpen) setView('thread-detail')
  }, [activeThread, modalOpen])

  if (!modalOpen) return null

  const close = () => {
    setModalOpen(false)
    useBulletin.setState({ activeThread: null, messages: [] })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="absolute top-3 left-3 right-3 bg-surface-glass backdrop-blur-2xl backdrop-saturate-150 rounded-2xl text-on-surface shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-outline overflow-hidden flex flex-col z-50"
      style={{
        fontFamily: 'ui-monospace, monospace',
        bottom: panelOpen ? 'calc(35dvh - 1.5rem + 18px)' : 'calc(100px + 18px)',
      }}
    >
      {/* Header */}
      <div className="flex items-center px-4 py-3 border-b border-outline-variant flex-shrink-0">
        <h2 className="flex-1 text-body font-medium text-on-surface">Bulletin Board</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              const shareText = `Check out the Bulletin Board in Lafayette Square!\nhttps://jacobhenderson.studio/lafayette-square/bulletin`
              if (navigator.share) {
                navigator.share({ text: shareText }).catch(() => {})
              } else {
                navigator.clipboard?.writeText(shareText).catch(() => {})
              }
            }}
            className="w-8 h-8 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface transition-colors flex items-center justify-center"
            title="Share"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15m0-3l-3-3m0 0l-3 3m3-3v11.25" />
            </svg>
          </button>
          <button
            onClick={() => { useBulletin.getState().setModalOpen(false); useBulletin.setState({ activeThread: null, messages: [] }) }}
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

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {view === 'browse' && (
          <BrowseView
            onNewPost={() => setView('new-post')}
            onOpenThreads={() => setView('threads')}
          />
        )}
        {view === 'new-post' && (
          <NewPostView onBack={() => setView('browse')} />
        )}
        {view === 'threads' && (
          <ThreadListView
            onBack={() => setView('browse')}
            onOpenThread={(id) => { openThread(id); setView('thread-detail') }}
          />
        )}
        {view === 'thread-detail' && (
          <ThreadDetailView onBack={() => { setView('threads'); useBulletin.setState({ activeThread: null }) }} />
        )}
      </div>
    </div>
  )
}

export { SECTIONS, SECTION_MAP }
