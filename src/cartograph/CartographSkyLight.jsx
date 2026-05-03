/**
 * CartographSkyLight — store-bound editor for the Stage Sky & Light card.
 * Hosts the world-atmospheric TOD channels (the magical / colorable
 * stuff). Camera/grade-side channels live in CartographPost.
 *
 * Inventory (per HANDOFF-sky-and-light.md):
 *   Mist           — colorable distance fade (LANDED)
 *   Sky gradient   — top/horizon/bottom (TODO)
 *   Halo           — colorable horizon band (TODO)
 *   Constellations — single (TODO)
 *   Milky Way      — single (TODO)
 *   Neon glow      — group of 3 (LANDED 2026-05-02; see HANDOFF-neon.md)
 */
import TodChannel from './TodChannel.jsx'
import SkyGradientGrid from './SkyGradientGrid.jsx'
import useCartographStore from './stores/useCartographStore.js'
import {
  MIST_FIELDS, MIST_FLAT_DEFAULTS,
  HALO_FIELDS, HALO_FLAT_DEFAULTS,
  CONSTELLATIONS_FIELDS, CONSTELLATIONS_FLAT_DEFAULTS,
  MILKYWAY_FIELDS, MILKYWAY_FLAT_DEFAULTS,
  NEON_FIELDS, NEON_FLAT_DEFAULTS,
  AMBIENT_FIELDS, AMBIENT_FLAT_DEFAULTS,
  HEMI_FIELDS, HEMI_FLAT_DEFAULTS,
  DIRSUN_FIELDS, DIRSUN_FLAT_DEFAULTS,
  DIRMOON_FIELDS, DIRMOON_FLAT_DEFAULTS,
} from './skyLightChannels.js'

// Generic store-bound TodChannel mount — same shape as the one in
// CartographPost. Reads channel + 6 actions by name.
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

// Typographic sub-section label — same shape as CartographPost's.
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

export default function CartographSkyLight() {
  return (
    <div className="space-y-1">
      <SectionLabel label="Atmosphere" />
      <SkyGradientGrid />
      <StoreChannel name="mist" label="Mist"
        fields={MIST_FIELDS} flatDefaults={MIST_FLAT_DEFAULTS} />
      <StoreChannel name="halo" label="Halo"
        fields={HALO_FIELDS} flatDefaults={HALO_FLAT_DEFAULTS} />
      <StoreChannel name="neon" label="Neon"
        fields={NEON_FIELDS} flatDefaults={NEON_FLAT_DEFAULTS} />

      <SectionLabel label="Lighting" />
      <StoreChannel name="ambient" label="Ambient"
        fields={AMBIENT_FIELDS} flatDefaults={AMBIENT_FLAT_DEFAULTS} />
      <StoreChannel name="hemi" label="Hemisphere"
        fields={HEMI_FIELDS} flatDefaults={HEMI_FLAT_DEFAULTS} />
      <StoreChannel name="dirMoon" label="Moon light"
        fields={DIRMOON_FIELDS} flatDefaults={DIRMOON_FLAT_DEFAULTS} />
      <StoreChannel name="dirSun" label="Sun light"
        fields={DIRSUN_FIELDS} flatDefaults={DIRSUN_FLAT_DEFAULTS} />

      <SectionLabel label="Celestial" />
      <StoreChannel name="constellations" label="Constellations"
        fields={CONSTELLATIONS_FIELDS} flatDefaults={CONSTELLATIONS_FLAT_DEFAULTS} />
      {/* Milky Way hidden from operator UI 2026-05-02. Brunier panorama
          shows visible JPEG artifacting + stretched/oversized stars at
          Hero/Street FOV; needs higher-res source or cubemap rebuild
          before re-exposing. Channel state, store actions, and
          MilkyWaySphere component are preserved (dormant) for return.
          See project_milkyway_parked.md + BACKLOG.md. */}
      {/* <StoreChannel name="milkyWay" label="Milky Way"
        fields={MILKYWAY_FIELDS} flatDefaults={MILKYWAY_FLAT_DEFAULTS} /> */}
    </div>
  )
}
