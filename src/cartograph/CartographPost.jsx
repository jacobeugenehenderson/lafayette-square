/**
 * CartographPost — store-bound editor for the Stage Post card.
 * Hosts the camera/grade-side TOD channels (image-space effects, not
 * world atmospherics — those live in CartographSkyLight).
 *
 * Three sub-groups, separated by typographic landmarks (small-caps
 * labels + thin dividers). Not folders: nothing collapses at the group
 * level, no nested twirl state.
 *
 *   CAMERA   — Exposure, Warmth
 *   SHADOW   — AO, Fill
 *   SOFTEN   — Bloom (singleton)
 *
 * See HANDOFF-sky-and-light.md and project_post_vs_skylight_split.md.
 */
import TodChannel from './TodChannel.jsx'
import useCartographStore from './stores/useCartographStore.js'
import {
  BLOOM_FIELDS, BLOOM_FLAT_DEFAULTS,
  WARMTH_FIELDS, WARMTH_FLAT_DEFAULTS,
  FILL_FIELDS, FILL_FLAT_DEFAULTS,
  EXPOSURE_FIELDS, EXPOSURE_FLAT_DEFAULTS,
  AO_FIELDS, AO_FLAT_DEFAULTS,
} from './skyLightChannels.js'

// Generic store-bound TodChannel mount. Reads channel + 6 actions by
// name. Same shape as the one in CartographSkyLight; lifted here too
// to keep this file self-contained.
function StoreChannel({ name, label, fields, flatDefaults }) {
  const cap = name[0].toUpperCase() + name.slice(1)
  const channel       = useCartographStore(s => s[name])
  const setValue      = useCartographStore(s => s[`set${cap}`])
  const animate       = useCartographStore(s => s[`animate${cap}`])
  const unanimate     = useCartographStore(s => s[`unanimate${cap}`])
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
      onSetValue={(key, value) => setValue(key, value)}
      onFillSlot={(slotId, isFirst) => isFirst ? animate(slotId) : addSlot(slotId)}
      onRemoveSlot={removeSlot}
      onUnanimate={unanimate}
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
      <SectionLabel label="Camera" />
      <StoreChannel name="exposure" label="Exposure"
        fields={EXPOSURE_FIELDS} flatDefaults={EXPOSURE_FLAT_DEFAULTS} />
      <StoreChannel name="warmth" label="Warmth"
        fields={WARMTH_FIELDS} flatDefaults={WARMTH_FLAT_DEFAULTS} />

      <SectionLabel label="Shadow" />
      <StoreChannel name="ao" label="AO"
        fields={AO_FIELDS} flatDefaults={AO_FLAT_DEFAULTS} />
      <StoreChannel name="fill" label="Fill"
        fields={FILL_FIELDS} flatDefaults={FILL_FLAT_DEFAULTS} />

      <SectionLabel label="Soften" />
      <StoreChannel name="bloom" label="Bloom"
        fields={BLOOM_FIELDS} flatDefaults={BLOOM_FLAT_DEFAULTS} />
    </div>
  )
}
