import React, { useState, useRef, useCallback } from 'react'

// Victorian palette — resolved from design tokens (design.css)
const COLOR_PALETTE = {
  brick:    'var(--vic-brick)',
  sage:     'var(--vic-sage)',
  gold:     'var(--vic-gold)',
  sky:      'var(--vic-sky)',
  coral:    'var(--vic-coral)',
  lavender: 'var(--vic-lavender)',
  cream:    'var(--vic-cream)',
  slate:    'var(--vic-slate)',
}

export { safeUrl }

export function relativeTime(iso) {
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

function resolveColor(val) {
  // Hex: #abc or #aabbcc
  if (val.startsWith('#')) return val
  // Named (legacy)
  return COLOR_PALETTE[val] || null
}

/** Reject anything that isn't http/https — blocks javascript:, data:, vbscript:, etc. */
function safeUrl(raw) {
  try {
    const url = new URL(raw, window.location.origin)
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href
  } catch { /* malformed */ }
  return null
}

function renderInline(text) {
  const parts = []
  let remaining = text
  let key = 0

  const patterns = [
    // Color tag: {color:name}text{/color} or {color:#hex}text{/color}
    { re: /\{color:([^}]+)\}(.*?)\{\/color\}/, render: (m) => {
      const c = resolveColor(m[1])
      return <span key={key++} style={c ? { color: c } : undefined}>{renderInline(m[2])}</span>
    }},
    { re: /\{big\}(.*?)\{\/big\}/, render: (m) => (
      <span key={key++} className="text-[14px]">{renderInline(m[1])}</span>
    )},
    { re: /\{small\}(.*?)\{\/small\}/, render: (m) => (
      <span key={key++} className="text-caption">{renderInline(m[1])}</span>
    )},
    { re: /!\[([^\]]*)\]\(([^)]+)\)/, render: (m) => {
      const href = safeUrl(m[2])
      return href ? <img key={key++} src={href} alt={m[1]} className="max-w-full rounded my-1 inline-block" loading="lazy" /> : <span key={key++}>{m[0]}</span>
    }},
    { re: /\[([^\]]+)\]\(([^)]+)\)/, render: (m) => {
      const href = safeUrl(m[2])
      return href ? <a key={key++} href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">{m[1]}</a> : <span key={key++}>{m[0]}</span>
    }},
    { re: /\*\*(.+?)\*\*/, render: (m) => <strong key={key++} className="font-semibold text-on-surface">{m[1]}</strong> },
    { re: /\*(.+?)\*/, render: (m) => <em key={key++}>{m[1]}</em> },
    { re: /~~(.+?)~~/, render: (m) => <del key={key++} className="text-on-surface-disabled">{m[1]}</del> },
    { re: /(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg)(\?[^\s]*)?)/, render: (m) => (
      <img key={key++} src={m[1]} alt="" className="max-w-full rounded my-1 inline-block" loading="lazy" />
    )},
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

export function renderMarkdown(text) {
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
    const bqMatch = line.match(/^>\s*(.*)/)
    if (bqMatch) { flushList(); blockquoteLines.push(bqMatch[1]); continue }
    flushBlockquote()

    const listMatch = line.match(/^[-*]\s+(.+)/)
    if (listMatch) { listItems.push(renderInline(listMatch[1])); continue }
    flushList()

    if (/^-{3,}$/.test(line.trim())) { elements.push(<hr key={key++} className="border-outline-variant my-2" />); continue }

    const h2Match = line.match(/^##\s+(.+)/)
    if (h2Match) { elements.push(<div key={key++} className="text-label-sm font-semibold text-on-surface-variant mt-2 mb-0.5">{renderInline(h2Match[1])}</div>); continue }

    const h1Match = line.match(/^#\s+(.+)/)
    if (h1Match) { elements.push(<div key={key++} className="text-body font-bold text-on-surface mt-2 mb-0.5">{renderInline(h1Match[1])}</div>); continue }

    const centerMatch = line.match(/^\{center\}(.*)\{\/center\}$/)
    if (centerMatch) { elements.push(<div key={key++} className="text-center">{renderInline(centerMatch[1])}</div>); continue }
    const rightMatch = line.match(/^\{right\}(.*)\{\/right\}$/)
    if (rightMatch) { elements.push(<div key={key++} className="text-right">{renderInline(rightMatch[1])}</div>); continue }

    if (line.trim() === '') { elements.push(<br key={key++} />) }
    else { elements.push(<span key={key++}>{renderInline(line)}<br /></span>) }
  }
  flushList()
  flushBlockquote()
  return elements
}

// ── Toolbar button ──────────────────────────────────────────────────
function Btn({ onClick, title, active, children, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2 py-1.5 rounded-md text-body-sm transition-colors ${active ? 'bg-surface-container-highest text-on-surface' : 'text-on-surface-subtle hover:text-on-surface-variant hover:bg-surface-container-high'} ${className}`}
    >
      {children}
    </button>
  )
}

function Sep() {
  return <span className="w-px h-5 bg-outline-variant mx-1" />
}

// ── FormattedTextarea ───────────────────────────────────────────────
export function FormattedTextarea({ value, onChange, placeholder, rows = 4, maxChars = 2000 }) {
  const ref = useRef(null)
  const colorRef = useRef(null)
  const [pickedColor, setPickedColor] = useState('#e8a87c')

  const wrap = useCallback((before, after) => {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = value.slice(start, end)
    const replacement = before + (selected || 'text') + after
    const next = value.slice(0, start) + replacement + value.slice(end)
    onChange(next.slice(0, maxChars))
    requestAnimationFrame(() => {
      const cursorPos = selected ? start + replacement.length : start + before.length
      const cursorEnd = selected ? cursorPos : cursorPos + 4
      el.focus()
      el.setSelectionRange(selected ? cursorPos : start + before.length, selected ? cursorPos : cursorEnd)
    })
  }, [value, onChange, maxChars])

  const insertAtCursor = useCallback((text) => {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart
    const next = value.slice(0, start) + text + value.slice(start)
    onChange(next.slice(0, maxChars))
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + text.length, start + text.length) })
  }, [value, onChange, maxChars])

  const wrapLine = useCallback((before, after) => {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = value.slice(start, end)
    const replacement = before + (selected || 'text') + after
    const prefix = start > 0 && value[start - 1] !== '\n' ? '\n' : ''
    const next = value.slice(0, start) + prefix + replacement + value.slice(end)
    onChange(next.slice(0, maxChars))
    requestAnimationFrame(() => {
      const offset = prefix.length + before.length
      el.focus()
      if (selected) el.setSelectionRange(start + prefix.length + replacement.length, start + prefix.length + replacement.length)
      else el.setSelectionRange(start + offset, start + offset + 4)
    })
  }, [value, onChange, maxChars])

  const insertLink = useCallback(() => {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = value.slice(start, end)
    const isUrl = selected.startsWith('http')
    const replacement = isUrl ? `[link](${selected})` : `[${selected || 'text'}](url)`
    const next = value.slice(0, start) + replacement + value.slice(end)
    onChange(next.slice(0, maxChars))
    requestAnimationFrame(() => {
      el.focus()
      if (isUrl) el.setSelectionRange(start + 1, start + 5)
      else if (selected) { const urlStart = start + replacement.indexOf('](') + 2; el.setSelectionRange(urlStart, urlStart + 3) }
      else el.setSelectionRange(start + 1, start + 5)
    })
  }, [value, onChange, maxChars])

  const applyColor = useCallback((hex) => {
    wrap(`{color:${hex}}`, '{/color}')
  }, [wrap])

  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container overflow-hidden focus-within:border-outline transition-colors">
      {/* Row 1: Text formatting */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-outline-variant">
        <Btn onClick={() => wrap('**', '**')} title="Bold"><strong>B</strong></Btn>
        <Btn onClick={() => wrap('*', '*')} title="Italic"><em className="font-serif">I</em></Btn>
        <Btn onClick={() => wrap('~~', '~~')} title="Strikethrough"><span className="line-through">S</span></Btn>
        <Btn onClick={insertLink} title="Link">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </Btn>

        <Sep />

        <Btn onClick={() => wrapLine('# ', '')} title="Title">
          <span className="font-bold text-[13px]">T</span>
        </Btn>
        <Btn onClick={() => wrapLine('## ', '')} title="Subtitle">
          <span className="font-semibold text-[11px]">T</span>
        </Btn>
        <Btn onClick={() => wrap('{big}', '{/big}')} title="Large text">
          <span className="text-[15px] leading-none font-light">A</span>
        </Btn>
        <Btn onClick={() => wrap('{small}', '{/small}')} title="Small text">
          <span className="text-[9px] leading-none font-light">A</span>
        </Btn>

        <Sep />

        <Btn onClick={() => wrap('\n- ', '')} title="List">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
          </svg>
        </Btn>
        <Btn onClick={() => wrapLine('> ', '')} title="Quote">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h12M3 18h18" />
          </svg>
        </Btn>
        <Btn onClick={() => insertAtCursor('\n---\n')} title="Divider">
          <span className="text-[10px] tracking-widest">———</span>
        </Btn>
      </div>

      {/* Row 2: Alignment + Color */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-outline-variant">
        {/* Alignment group */}
        <div className="flex rounded-md overflow-hidden border border-outline-variant">
          <button type="button" onClick={() => {}} title="Left align (default)" className="px-1.5 py-1 text-on-surface-subtle hover:bg-surface-container-high transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M4 6h16M4 12h10M4 18h14" />
            </svg>
          </button>
          <button type="button" onClick={() => wrapLine('{center}', '{/center}')} title="Center" className="px-1.5 py-1 text-on-surface-subtle hover:bg-surface-container-high transition-colors border-x border-outline-variant">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M4 6h16M7 12h10M5 18h14" />
            </svg>
          </button>
          <button type="button" onClick={() => wrapLine('{right}', '{/right}')} title="Right" className="px-1.5 py-1 text-on-surface-subtle hover:bg-surface-container-high transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M4 6h16M10 12h10M6 18h14" />
            </svg>
          </button>
        </div>

        <Sep />

        {/* Color: native picker + apply */}
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <input
              ref={colorRef}
              type="color"
              value={pickedColor}
              onChange={e => setPickedColor(e.target.value)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              title="Pick a color"
            />
            <div
              className="w-6 h-6 rounded-full border-2 border-outline cursor-pointer"
              style={{ backgroundColor: pickedColor }}
            />
          </div>
          <Btn onClick={() => applyColor(pickedColor)} title="Apply color to selection">
            <span style={{ color: pickedColor }} className="font-bold">A</span>
          </Btn>
        </div>

        <span className="ml-auto text-caption text-on-surface-disabled">{value.length}/{maxChars}</span>
      </div>

      {/* Textarea */}
      <textarea
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value.slice(0, maxChars))}
        placeholder={placeholder}
        rows={rows}
        className="w-full bg-transparent px-3 py-2 text-body-sm text-on-surface placeholder-on-surface-disabled resize-none focus:outline-none leading-relaxed"
      />
    </div>
  )
}
