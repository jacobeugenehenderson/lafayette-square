/**
 * CartographPost — store-bound editor for the camera's IMAGE treatment, grouped
 * by OPERATOR INTENT (Phase A taxonomy reorg, 2026-06-30 — see
 * scratch/LOOK-PANEL-TAXONOMY.md). Sections:
 *   TONE & COLOR — Exposure · Warmth · Grade (contrast/saturation/brightness/vignette)
 *   GLOW         — Bloom
 *   LENS & FILM  — Focus (DoF) · Grain   (antialiasing always runs: no switch)
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
  DOF_FIELDS, DOF_FLAT_DEFAULTS,
} from './skyLightChannels.js'
import { withRanges } from '../lib/townRange.js'
import useTownRanges from './useTownRanges.js'
import { hasFocusObject } from '../lib/focusObject.js'

// Generic store-bound TodChannel mount. Reads channel + 6 actions by
// name. Same shape as the one in CartographSkyLight; lifted here too
// to keep this file self-contained.
// Where the blur focuses is not set here: it is an OBJECT, per hero keyframe (the town's hero unless a key names another;
// src/lib/focusObject.js). REMOVED (Jacob, 2026-10-07): the free picked point and its Pick / ✕ row.
// With no focus object the blur is the TOWN's (RomanceDoF.jsx#townLaw), and Window softness means the share of the town's
// radius that ramps — said in its label and tooltip, so one control never means two things unsaid (Boz's ruling (a)).
const TOWN_MELT = { label: 'Ramp: share of the town\'s radius', title: 'Window softness, with no focus object: the share of the town\'s radius that ramps from sharp at the centre to the Amount at the rim' }
function dofFields(fields, town) { return fields.map(f => f.key !== 'melt' ? f : town ? { ...f, ...TOWN_MELT } : { ...f, title: 'How gently the blur comes in at the clear window\'s edges' }) }
function DofFocusNote() {
  const town = useCartographStore(s => !hasFocusObject(s.heroSubject, s.heroKeyframes))
  if (town) return <div style={{ fontSize: 12, color: 'var(--on-surface-subtle)' }}>Focus: none — no hero and no key focus, so the blur is the town's: sharp at the centre, the Amount at the rim</div>
  return <div style={{ fontSize: 12, color: 'var(--on-surface-subtle)' }}>Focus: per keyframe — Hero camera (the town's hero unless a key names another)</div>
}

function StoreChannel({ name, label, fields, flatDefaults, children }) {
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
    >{children}</TodChannel>
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
  const ranges = useTownRanges()
  const noFocusObject = useCartographStore(s => !hasFocusObject(s.heroSubject, s.heroKeyframes))
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
        fields={dofFields(withRanges(DOF_FIELDS, ranges), noFocusObject)} flatDefaults={DOF_FLAT_DEFAULTS}>
        <DofFocusNote />
      </StoreChannel>
      <StoreChannel name="grain" label="Grain"
        fields={GRAIN_FIELDS} flatDefaults={GRAIN_FLAT_DEFAULTS} />
    </div>
  )
}
