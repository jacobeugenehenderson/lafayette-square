/**
 * CartographPost — store-bound editor for the camera's IMAGE treatment, grouped
 * by OPERATOR INTENT (Phase A taxonomy reorg, 2026-06-30 — see
 * scratch/LOOK-PANEL-TAXONOMY.md). Sections:
 *   TONE & COLOR — Exposure · Warmth · Grade (contrast/saturation/brightness/vignette)
 *   GLOW         — Bloom
 *   LENS & FILM  — Focus (DoF) · Grain · Antialiasing (SMAA)
 * The world's light + shadow + sky channels (incl. AO/Fill/Cast-shadows, moved
 * out by intent) live in CartographSkyLight.
 */
import TodChannel from './TodChannel.jsx'
import useCartographStore, { activeChannel } from './stores/useCartographStore.js'
import {
  BLOOM_FIELDS, BLOOM_FLAT_DEFAULTS,
  WARMTH_FIELDS, WARMTH_FLAT_DEFAULTS,
  EXPOSURE_FIELDS, EXPOSURE_FLAT_DEFAULTS,
  GRADE_FIELDS, GRADE_FLAT_DEFAULTS,
  GRAIN_FIELDS, GRAIN_FLAT_DEFAULTS,
  SMAA_FIELDS, SMAA_FLAT_DEFAULTS,
  DOF_FIELDS, DOF_FLAT_DEFAULTS,
} from './skyLightChannels.js'

// Generic store-bound TodChannel mount. Reads channel + 6 actions by
// name. Same shape as the one in CartographSkyLight; lifted here too
// to keep this file self-contained.
function StoreChannel({ name, label, fields, flatDefaults }) {
  const cap = name[0].toUpperCase() + name.slice(1)
  // Resolve the active shot's channel (channel-variant cascade): a forked shot
  // edits its own block, hero/unforked edits base — same panel, the binding
  // follows the active shot.
  const channel       = useCartographStore(s => activeChannel(s, name))
  const setValue      = useCartographStore(s => s[`set${cap}`])
  const animate       = useCartographStore(s => s[`animate${cap}`])
  const addSlot       = useCartographStore(s => s[`add${cap}Slot`])
  const removeSlot    = useCartographStore(s => s[`remove${cap}Slot`])
  const setTransition = useCartographStore(s => s[`set${cap}Transition`])
  const revert        = useCartographStore(s => s[`revert${cap}`])
  return (
    <TodChannel
      label={label}
      fields={fields}
      flatDefaults={flatDefaults}
      channel={channel}
      onSetValue={(key, value, slotId) => setValue(key, value, slotId)}
      onFillSlot={(slotId, isFirst) => isFirst ? animate(slotId) : addSlot(slotId)}
      onRemoveSlot={removeSlot}
      onSetTransition={setTransition}
      onRevert={revert}
    />
  )
}

// Typographic landmark — small uppercase label with thin top divider.
// NOT a folder: no expand/collapse state, no children grouping in DOM.
function SectionLabel({ label }) {
  return (
    <div
      className="pt-2 pb-1"
      style={{
        fontSize: 10,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--on-surface-subtle)',
        borderTop: '1px solid var(--outline-variant)',
        marginTop: 4,
      }}
    >
      {label}
    </div>
  )
}

export default function CartographPost() {
  return (
    <div className="space-y-1">
      <SectionLabel label="Tone & Color" />
      <StoreChannel name="exposure" label="Exposure"
        fields={EXPOSURE_FIELDS} flatDefaults={EXPOSURE_FLAT_DEFAULTS} />
      <StoreChannel name="warmth" label="Warmth"
        fields={WARMTH_FIELDS} flatDefaults={WARMTH_FLAT_DEFAULTS} />
      <StoreChannel name="grade" label="Grade"
        fields={GRADE_FIELDS} flatDefaults={GRADE_FLAT_DEFAULTS} />

      <SectionLabel label="Glow" />
      <StoreChannel name="bloom" label="Bloom"
        fields={BLOOM_FIELDS} flatDefaults={BLOOM_FLAT_DEFAULTS} />

      <SectionLabel label="Lens & Film" />
      <StoreChannel name="dof" label="Focus (DoF)"
        fields={DOF_FIELDS} flatDefaults={DOF_FLAT_DEFAULTS} />
      <StoreChannel name="grain" label="Grain"
        fields={GRAIN_FIELDS} flatDefaults={GRAIN_FLAT_DEFAULTS} />
      <StoreChannel name="smaa" label="Antialiasing (SMAA)"
        fields={SMAA_FIELDS} flatDefaults={SMAA_FLAT_DEFAULTS} />
    </div>
  )
}
