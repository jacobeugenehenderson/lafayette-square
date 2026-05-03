/**
 * TriggerBar — operator buttons + mode toggle for the chart band.
 *
 * EVENT mode: triggers arm a 5s recording.
 * AMBIENT mode: chart streams a rolling 8s window; triggers disabled.
 */
import { useEffect, useState } from 'react'
import {
  start as recStart,
  getSession,
  subscribe,
  getMode as getRecMode,
  setMode as setRecMode,
} from './phoneBus'

const MODE_KEY = 'preview.recMode.v1'
function loadMode() {
  if (typeof localStorage === 'undefined') return 'event'
  try { return localStorage.getItem(MODE_KEY) || 'event' } catch { return 'event' }
}
function persistMode(m) {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(MODE_KEY, m) } catch {}
}

export default function TriggerBar({ shot, setShot, onReload }) {
  const [, force] = useState(0)
  useEffect(() => subscribe(() => force(n => n + 1)), [])

  // Apply persisted mode on mount; subsequent toggles persist.
  useEffect(() => {
    const m = loadMode()
    if (m !== getRecMode()) setRecMode(m)
  }, [])

  const recMode = getRecMode()
  const isEvent = recMode === 'event'
  const s = getSession()
  const recording = isEvent && s.status === 'recording'
  const triggersDisabled = !isEvent || recording

  const trigger = (label, action) => () => {
    recStart(label)
    action()
  }

  const switchMode = (m) => {
    setRecMode(m)
    persistMode(m)
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '0 4px', flexShrink: 0,
    }}>
      <Btn label="↻ Reload"  disabled={triggersDisabled}
        onClick={trigger('reload', () => onReload())} />
      <Btn label="→ Hero"    disabled={triggersDisabled || shot === 'hero'}
        onClick={trigger('→hero', () => setShot('hero'))} />
      <Btn label="→ Browse"  disabled={triggersDisabled || shot === 'browse'}
        onClick={trigger('→browse', () => setShot('browse'))} />
      <Btn label="→ Street"  disabled={triggersDisabled || shot === 'street'}
        onClick={trigger('→street', () => setShot('street'))} />
      <div style={{ flex: 1 }} />
      <ModeToggle mode={recMode} setMode={switchMode} />
    </div>
  )
}

function ModeToggle({ mode, setMode }) {
  const seg = (k, label, hint) => {
    const active = mode === k
    return (
      <button
        key={k}
        onClick={() => setMode(k)}
        title={hint}
        style={{
          appearance: 'none', border: 'none',
          padding: '6px 10px',
          fontSize: 11,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          borderRadius: 6,
          background: active ? 'rgba(255,255,255,0.16)' : 'transparent',
          color: active ? '#e5e7eb' : 'rgba(255,255,255,0.5)',
          cursor: 'pointer',
          transition: 'background 120ms',
        }}
      >
        {label}
      </button>
    )
  }
  return (
    <div style={{
      display: 'flex',
      padding: 2,
      borderRadius: 8,
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      {seg('event',   '▶ event',   'Triggers arm a 5s recording')}
      {seg('ambient', '📡 ambient', 'Continuous rolling 8s window')}
    </div>
  )
}

function Btn({ label, onClick, disabled }) {
  const palette = {
    bg: 'rgba(255,255,255,0.08)',
    bgHover: 'rgba(255,255,255,0.14)',
    color: '#e5e7eb',
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        appearance: 'none', border: 'none',
        padding: '6px 10px',
        fontSize: 12,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        borderRadius: 8,
        background: palette.bg,
        color: palette.color,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background 120ms',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = palette.bgHover }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = palette.bg }}
    >
      {label}
    </button>
  )
}
