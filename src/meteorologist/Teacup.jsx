/**
 * Teacup — per-cloud authoring workstage.
 *
 * Phase 2 scope: header (back button + cloud pulldown), slot tabs (visual
 * state only), viewport placeholder, right rail with DawnTimeline + 13
 * cloud-shader-param TodChannels. Autosave routes through the
 * useMeteorologistStore.setCloudParam/savePreset pipeline.
 *
 * Phase 4 will mount CanaryScene where the placeholder div lives.
 */
import { useState, useMemo } from 'react'
import useMeteorologistStore from './stores/useMeteorologistStore.js'
import { CLOUD_PARAM_FIELDS } from './cloudParamFields.js'
import SlotTabs from './SlotTabs.jsx'
import CanaryScene from './CanaryScene.jsx'
import TodChannel from '../cartograph/TodChannel.jsx'
import DawnTimeline from '../components/DawnTimeline.jsx'

const FLAT_DEFAULTS = { value: 0 }
const GROUP_LABEL = { shape: 'Shape', lighting: 'Lighting', motion: 'Motion' }

export default function Teacup() {
  const presets         = useMeteorologistStore(s => s.presets)
  const activePresetId  = useMeteorologistStore(s => s.activePresetId)
  const setActivePreset = useMeteorologistStore(s => s.setActivePreset)
  const setCloudParam   = useMeteorologistStore(s => s.setCloudParam)
  const animateParam    = useMeteorologistStore(s => s.animateCloudParam)
  const unanimateParam  = useMeteorologistStore(s => s.unanimateCloudParam)
  const addParamSlot    = useMeteorologistStore(s => s.addCloudParamSlot)
  const removeParamSlot = useMeteorologistStore(s => s.removeCloudParamSlot)
  const setParamTrans   = useMeteorologistStore(s => s.setCloudParamTransition)

  const preset = presets.find(p => p.id === activePresetId) || null

  // Filter the cloud pulldown to siblings of the same kind (cloud↔cloud,
  // fog↔fog). Mixing the two in the pulldown is confusing — fog has a
  // different param set; switching from cumulus_humilis to fog_ground via
  // this pulldown would surprise.
  const siblingPresets = useMemo(() => {
    if (!preset) return []
    return presets.filter(p => p.kind === preset.kind)
  }, [presets, preset])

  const [slot, setSlot] = useState('browse')

  if (!preset) {
    return (
      <div style={{
        position: 'fixed', inset: 0, color: '#ddd',
        fontFamily: '-apple-system, sans-serif', fontSize: 13,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#111',
      }}>
        <span style={{ color: '#888' }}>Preset not loaded.</span>
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
        <button onClick={() => setActivePreset(null)} style={backBtnStyle}>
          ← Teapot
        </button>
        <strong style={{
          letterSpacing: '0.15em', textTransform: 'uppercase',
          fontSize: 12, color: '#fff',
        }}>Meteorologist</strong>
        <span style={{ color: '#888' }}>cloud authoring</span>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', color: '#888', fontSize: 11 }}>
          <span style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>Cloud</span>
          <select
            value={preset.id}
            onChange={(e) => setActivePreset(e.target.value)}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#ddd',
              padding: '4px 8px', borderRadius: 4,
              fontFamily: 'inherit', fontSize: 12,
              minWidth: 220,
            }}
          >
            {siblingPresets.map(p => (
              <option key={p.id} value={p.id}>
                {p.label}{p.wmo ? ` · ${p.wmo}` : ''}
              </option>
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

          {/* Cloud parameters card */}
          <div className="glass-panel rounded-xl p-3">
            <div className="section-heading mb-2">Cloud parameters</div>

            {CLOUD_PARAM_FIELDS.map((f, i) => {
              const prev = CLOUD_PARAM_FIELDS[i - 1]
              const groupChanged = !prev || prev.group !== f.group
              const channel = preset.params?.[f.key]
              // TodChannel expects channel.values keyed by 'value' field. The
              // migration ensures this; channels written by setCloudParam keep
              // the same shape.
              return (
                <div key={f.key}>
                  {groupChanged && (
                    <div style={{
                      fontSize: 9, letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: 'rgba(255,255,255,0.35)',
                      padding: '8px 4px 2px',
                    }}>
                      {GROUP_LABEL[f.group] || f.group}
                    </div>
                  )}
                  <TodChannel
                    label={f.label}
                    fields={[{ key: 'value', label: f.label, min: f.min, max: f.max, step: f.step }]}
                    channel={channel}
                    flatDefaults={FLAT_DEFAULTS}
                    onSetValue={(_key, value) => setCloudParam(preset.id, f.key, value)}
                    onFillSlot={(slotId, isFirst) =>
                      isFirst ? animateParam(preset.id, f.key, slotId)
                              : addParamSlot(preset.id, f.key, slotId)}
                    onRemoveSlot={(slotId) => removeParamSlot(preset.id, f.key, slotId)}
                    onUnanimate={() => unanimateParam(preset.id, f.key)}
                    onSetTransition={(side, minutes) => setParamTrans(preset.id, f.key, side, minutes)}
                  />
                </div>
              )
            })}
          </div>
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
