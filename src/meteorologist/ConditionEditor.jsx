/**
 * ConditionEditor — per-condition (almanac rule) authoring workstage.
 *
 * Mirrors Teacup's outer frame (header + slot tabs + viewport placeholder
 * + right rail) exactly. Only the rail body diverges: Time of Day, then
 * three cards — When (rule predicates), Directive (atmospheric output),
 * and Clouds-in-condition (the cloud blend).
 *
 * Phase 3 ships every directive value as a flat scalar. Phase 3b promotes
 * the numeric subset (sun.intensity, lightDome.ambientFloor, wind.scale,
 * wind.dir, precip.intensity) to TodChannel/animatableValue once Phase
 * 4's viewport lets us validate temporal authoring visually. See
 * meteorologist/INTERFACE.md §5.2.
 *
 * Phase 4 will mount CanaryScene where the placeholder div lives.
 */
import { useState } from 'react'
import useMeteorologistStore from './stores/useMeteorologistStore.js'
import SlotTabs from './SlotTabs.jsx'
import CanaryScene from './CanaryScene.jsx'
import WhenCard from './WhenCard.jsx'
import DirectiveCard from './DirectiveCard.jsx'
import CloudsInConditionCard from './CloudsInConditionCard.jsx'
import DawnTimeline from '../components/DawnTimeline.jsx'

export default function ConditionEditor() {
  const conditions          = useMeteorologistStore(s => s.conditions)
  const activeConditionId   = useMeteorologistStore(s => s.activeConditionId)
  const setActiveCondition  = useMeteorologistStore(s => s.setActiveCondition)
  const revertToDefault     = useMeteorologistStore(s => s.revertConditionToDefault)

  const rule = conditions.find(c => c.id === activeConditionId) || null
  const [slot, setSlot] = useState('browse')

  if (!rule) {
    return (
      <div style={{
        position: 'fixed', inset: 0, color: '#ddd',
        fontFamily: '-apple-system, sans-serif', fontSize: 13,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#111',
      }}>
        <span style={{ color: '#888' }}>Condition not loaded.</span>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, color: '#ddd',
      fontFamily: '-apple-system, sans-serif', fontSize: 13,
      display: 'flex', flexDirection: 'column',
      background: '#111',
    }}>
      {/* ── Header ───────────────────────────────────────────── */}
      <header style={{
        padding: '12px 18px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <button onClick={() => setActiveCondition(null)} style={backBtnStyle}>
          ← Conditions
        </button>
        <strong style={{
          letterSpacing: '0.15em', textTransform: 'uppercase',
          fontSize: 12, color: '#fff',
        }}>Meteorologist</strong>
        <span style={{ color: '#888' }}>weather authoring</span>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', color: '#888', fontSize: 11 }}>
          <span style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>Condition</span>
          <select
            value={rule.id}
            onChange={(e) => setActiveCondition(e.target.value)}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#ddd',
              padding: '4px 8px', borderRadius: 4,
              fontFamily: 'inherit', fontSize: 12,
              minWidth: 240,
            }}>
            {conditions.map(c => (
              <option key={c.id} value={c.id}>{c.label || c.id}</option>
            ))}
          </select>
        </label>
      </header>

      {/* ── Slot tabs ───────────────────────────────────────── */}
      <SlotTabs slot={slot} onSlot={setSlot} />

      {/* ── Body: viewport + right rail ─────────────────────── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <main style={{ flex: 1, minWidth: 0, minHeight: 0, background: '#0a0a0a' }}>
          <CanaryScene slot={slot} />
        </main>

        <aside style={{
          width: 400,
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          background: '#141414',
          overflowY: 'auto',
          padding: 12,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {/* Time of Day card */}
          <div className="glass-panel rounded-xl p-3">
            <div className="section-heading mb-2">Time of Day</div>
            <DawnTimeline />
          </div>

          <WhenCard rule={rule} />
          <DirectiveCard rule={rule} />
          <CloudsInConditionCard rule={rule} />

          <button
            onClick={() => {
              if (confirm(`Revert "${rule.label || rule.id}" to ship defaults? Other conditions are untouched.`)) {
                revertToDefault(rule.id)
              }
            }}
            style={{
              padding: '8px 12px', borderRadius: 4,
              background: 'transparent',
              border: '1px solid var(--outline-variant)',
              color: 'var(--on-surface-subtle)',
              fontFamily: 'inherit', fontSize: 'var(--type-caption)',
              letterSpacing: '0.08em', textTransform: 'uppercase',
              cursor: 'pointer',
            }}>
            ↺ Revert to ship defaults
          </button>
        </aside>
      </div>
    </div>
  )
}

const backBtnStyle = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#ddd',
  padding: '4px 10px', borderRadius: 4,
  fontFamily: 'inherit', fontSize: 11,
  letterSpacing: '0.08em', textTransform: 'uppercase',
  cursor: 'pointer',
}
