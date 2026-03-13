import React, { useState, useRef, useCallback } from 'react'

// Curated color palette for {color:name} tags
export const COLOR_PALETTE = {
  brick:    { label: 'Brick',    css: 'rgb(183, 110, 97)'  },
  sage:     { label: 'Sage',     css: 'rgb(138, 170, 132)' },
  gold:     { label: 'Gold',     css: 'rgb(212, 175, 85)'  },
  sky:      { label: 'Sky',      css: 'rgb(120, 170, 210)' },
  coral:    { label: 'Coral',    css: 'rgb(210, 120, 120)' },
  lavender: { label: 'Lavender', css: 'rgb(168, 140, 196)' },
  cream:    { label: 'Cream',    css: 'rgb(225, 215, 195)' },
  slate:    { label: 'Slate',    css: 'rgb(140, 150, 165)' },
}

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

function renderInline(text) {
  const parts = []
  let remaining = text
  let key = 0

  const patterns = [
    { re: /\{color:(\w+)\}(.*?)\{\/color\}/, render: (m) => {
      const c = COLOR_PALETTE[m[1]]
      return <span key={key++} style={c ? { color: c.css } : undefined}>{renderInline(m[2])}</span>
    }},
    { re: /\{big\}(.*?)\{\/big\}/, render: (m) => (
      <span key={key++} className="text-[14px]">{renderInline(m[1])}</span>
    )},
    { re: /\{small\}(.*?)\{\/small\}/, render: (m) => (
      <span key={key++} className="text-caption">{renderInline(m[1])}</span>
    )},
    { re: /!\[([^\]]*)\]\(([^)]+)\)/, render: (m) => (
      <img key={key++} src={m[2]} alt={m[1]} className="max-w-full rounded my-1 inline-block" loading="lazy" />
    )},
    { re: /\[([^\]]+)\]\(([^)]+)\)/, render: (m) => (
      <a key={key++} href={m[2]} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">{m[1]}</a>
    )},
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

export function FormattedTextarea({ value, onChange, placeholder, rows = 4, maxChars = 2000 }) {
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

  const applyColor = useCallback((colorName) => { wrap(`{color:${colorName}}`, '{/color}'); setShowColors(false) }, [wrap])

  const btnClass = "px-1.5 py-1 rounded text-on-surface-disabled hover:text-on-surface-variant hover:bg-surface-container-high transition-colors text-label-sm"

  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container overflow-hidden focus-within:border-outline transition-colors">
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-outline-variant flex-wrap">
        <button type="button" onClick={() => wrap('**', '**')} className={btnClass} title="Bold"><strong>B</strong></button>
        <button type="button" onClick={() => wrap('*', '*')} className={btnClass} title="Italic"><em>I</em></button>
        <button type="button" onClick={() => wrap('~~', '~~')} className={btnClass} title="Strikethrough"><del>S</del></button>
        <button type="button" onClick={insertLink} className={btnClass} title="Link">
          <svg className="w-3.5 h-3.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </button>
        <span className="w-px h-4 bg-surface-container-high mx-0.5" />
        <button type="button" onClick={() => wrapLine('# ', '')} className={btnClass} title="Heading">H1</button>
        <button type="button" onClick={() => wrapLine('## ', '')} className={btnClass} title="Subheading">H2</button>
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
        <button type="button" onClick={() => setShowColors(!showColors)} className={`${btnClass} ${showColors ? 'bg-surface-container-high text-on-surface-variant' : ''}`} title="Color">
          <svg className="w-3.5 h-3.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
        </button>
        <span className="ml-auto text-caption text-on-surface-disabled">{value.length}/{maxChars}</span>
      </div>
      {showColors && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-outline-variant bg-surface-container">
          {Object.entries(COLOR_PALETTE).map(([name, { label, css }]) => (
            <button key={name} type="button" onClick={() => applyColor(name)} className="w-5 h-5 rounded-full border border-outline hover:border-outline transition-colors flex-shrink-0" style={{ backgroundColor: css }} title={label} />
          ))}
        </div>
      )}
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
