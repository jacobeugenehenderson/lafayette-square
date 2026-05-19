/**
 * SlotTabs — BROWSE | GROUND switcher.
 *
 * The two slots mirror the production app's two main viewpoints:
 *   BROWSE = 90° overhead, matches production SHOTS.browse
 *   GROUND = eye-level under the cloud, with hero tree for scale
 *
 * Each opens a different CanaryScene camera framing; the cloud is
 * the same authored cloud, just rendered against the two consumer
 * perspectives the operator is authoring for.
 */

export default function SlotTabs({ slot, onSlot }) {
  return (
    <div style={{
      padding: '8px 18px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      display: 'flex', alignItems: 'center', gap: 6,
      background: 'rgba(255,255,255,0.015)',
    }}>
      <Pill label="Browse" active={slot === 'browse'} onClick={() => onSlot('browse')} />
      <Pill label="Ground" active={slot === 'ground'} onClick={() => onSlot('ground')} />
    </div>
  )
}

function Pill({ label, active, onClick }) {
  return (
    <button onClick={onClick}
      style={{
        background: active ? 'rgba(232,184,96,0.18)' : 'rgba(255,255,255,0.04)',
        border: '1px solid ' + (active ? 'rgba(232,184,96,0.5)' : 'rgba(255,255,255,0.1)'),
        color: active ? '#e8c878' : '#bbb',
        padding: '5px 12px', borderRadius: 3,
        fontFamily: 'inherit', fontSize: 11,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
      {label}
      {active && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#e8b860' }} />}
    </button>
  )
}
