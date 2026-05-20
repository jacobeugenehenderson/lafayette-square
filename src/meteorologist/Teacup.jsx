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
import { useState, useEffect, useMemo } from 'react'
import useMeteorologistStore from './stores/useMeteorologistStore.js'
import { CLOUD_PARAM_FIELDS } from './cloudParamFields.js'
import SlotTabs from './SlotTabs.jsx'
import CanaryScene from './CanaryScene.jsx'
import CloudPhoto from './CloudPhoto.jsx'
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
  const setPresetField  = useMeteorologistStore(s => s.setPresetField)
  const revertField     = useMeteorologistStore(s => s.revertPresetField)
  const seedDescFor     = useMeteorologistStore(s => s.seedDescriptionFor)

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
  // Photo expanded → ref photo swaps INTO the viewport; live render hidden.
  // Closed by default; resets when the active preset changes.
  const [photoExpanded, setPhotoExpanded] = useState(false)
  useEffect(() => { setPhotoExpanded(false) }, [preset?.id])

  // Local-draft description so typing doesn't snap-back through autosave.
  // Committed (autosave + authored:true) on blur.
  const [descDraft, setDescDraft] = useState(preset?.description || '')
  useEffect(() => { setDescDraft(preset?.description || '') }, [preset?.id, preset?.description])

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
        <main style={{ flex: 1, minWidth: 0, minHeight: 0, background: '#0a0a0a', position: 'relative' }}>
          {photoExpanded ? (
            <ExpandedPhoto
              preset={preset}
              descDraft={descDraft}
              setDescDraft={setDescDraft}
              onCommitDesc={(value) => setPresetField(preset.id, 'description', value)}
              onRevert={() => revertField(preset.id, 'description')}
              onClose={() => setPhotoExpanded(false)}
              hasSeed={Boolean(seedDescFor(preset.id))}
            />
          ) : (
            <CanaryScene slot={slot} />
          )}
        </main>

        <aside style={{
          width: 400,
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          background: '#141414',
          overflowY: 'auto',
          padding: 12,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {/* Reference photo card — click the thumb to swap it INTO the
              viewport (sliders stay live, so the operator can tune against
              the photographed target). */}
          <div className="glass-panel rounded-xl p-3">
            <div style={{ position: 'relative' }}>
              <CloudPhoto
                presetId={preset.id}
                alt={preset.label || preset.id}
                onClick={() => setPhotoExpanded(p => !p)}
                style={{ width: '100%', height: 80, borderRadius: 4 }}
              />
              <div style={{
                position: 'absolute', top: 4, right: 4,
                background: 'rgba(0,0,0,0.55)', color: '#ddd',
                padding: '2px 6px', borderRadius: 3,
                fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase',
                pointerEvents: 'none',
              }}>
                {photoExpanded ? 'showing' : 'expand'}
              </div>
            </div>
            <div style={{
              marginTop: 8, fontSize: 12, color: '#ddd', fontWeight: 600,
            }}>{preset.label || preset.id}</div>
            {preset.description && (
              <div style={{
                marginTop: 6, fontSize: 11, lineHeight: 1.5,
                color: 'rgba(255,255,255,0.65)',
              }}>{preset.description}</div>
            )}
          </div>

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

function ExpandedPhoto({ preset, descDraft, setDescDraft, onCommitDesc, onRevert, onClose, hasSeed }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: '#0a0a0a',
      display: 'flex', flexDirection: 'column',
      padding: 18, gap: 12,
    }}>
      <button
        onClick={onClose}
        title="Back to live render"
        style={{
          position: 'absolute', top: 12, right: 12,
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.15)',
          color: '#ddd',
          padding: '4px 10px', borderRadius: 4,
          fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
          cursor: 'pointer', zIndex: 1,
        }}
      >
        ← render
      </button>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CloudPhoto
          presetId={preset.id}
          alt={preset.label || preset.id}
          fit="contain"
          style={{ maxWidth: '100%', maxHeight: '100%', width: '100%', height: '100%', background: '#0a0a0a' }}
        />
      </div>

      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{
          fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.45)',
        }}>
          Description {preset.authored ? '· operator-edited' : '· seed'}
        </div>
        <textarea
          value={descDraft}
          onChange={(e) => setDescDraft(e.target.value)}
          onBlur={() => {
            if (descDraft !== (preset.description || '')) onCommitDesc(descDraft)
          }}
          placeholder="Describe this preset in plainspoken terms — what it looks like, when it appears, how it reads."
          rows={4}
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4,
            color: '#ddd', fontFamily: 'inherit', fontSize: 12, lineHeight: 1.5,
            padding: '8px 10px',
            resize: 'vertical',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={onRevert}
            disabled={!hasSeed}
            title={hasSeed ? 'Restore the specialist seed description' : 'No seed description on file'}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: hasSeed ? '#ddd' : '#666',
              padding: '4px 10px', borderRadius: 4,
              fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
              cursor: hasSeed ? 'pointer' : 'not-allowed',
            }}
          >
            Revert to seed
          </button>
          <span style={{ color: '#666', fontSize: 10 }}>
            Autosaves on blur.
          </span>
        </div>
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
