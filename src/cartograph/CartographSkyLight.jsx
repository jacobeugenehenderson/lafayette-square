/**
 * CartographSkyLight — store-bound editor for the world's light + sky, grouped
 * by OPERATOR INTENT (Phase A taxonomy reorg, 2026-06-30 — see
 * scratch/LOOK-PANEL-TAXONOMY.md). Sections:
 *   LIGHT & SHADOW — Sun · Moon · Fill light (ambient) · Sky fill (hemi) ·
 *                    Cast shadows · Occlusion (AO) · Shadow lift (fill).
 *                    AO/Fill/Shadow moved here from the Post card by intent.
 *   SKY & AIR      — sky gradient · sky brightness · mist · halo
 *   NIGHT SKY      — constellations · stars
 *   NEON           — neon (+ force-on QA toggle)
 * The camera/image-grade channels (exposure/warmth/grade/bloom/dof/grain/smaa)
 * live in CartographPost.
 */
import TodChannel from './TodChannel.jsx'
import SkyGradientGrid from './SkyGradientGrid.jsx'
import useCartographStore, { activeChannel } from './stores/useCartographStore.js'
import {
  MIST_FIELDS, MIST_FLAT_DEFAULTS,
  HALO_FIELDS, HALO_FLAT_DEFAULTS,
  SKY_GAIN_FIELDS, SKY_GAIN_FLAT_DEFAULTS,
  CONSTELLATIONS_FIELDS, CONSTELLATIONS_FLAT_DEFAULTS,
  STARS_FIELDS, STARS_FLAT_DEFAULTS,
  MILKYWAY_FIELDS, MILKYWAY_FLAT_DEFAULTS,
  NEON_FIELDS, NEON_FLAT_DEFAULTS,
  AMBIENT_FIELDS, AMBIENT_FLAT_DEFAULTS,
  HEMI_FIELDS, HEMI_FLAT_DEFAULTS,
  DIRSUN_FIELDS, DIRSUN_FLAT_DEFAULTS,
  DIRMOON_FIELDS, DIRMOON_FLAT_DEFAULTS,
  // Pulled in from the Post card (Phase A taxonomy reorg, 2026-06-30): the
  // "darkness" controls belong WITH the lights, by intent — not filed under
  // post-processing mechanism. AO = occlusion, Fill = shadow lift, Shadow = cast.
  AO_FIELDS, AO_FLAT_DEFAULTS,
  FILL_FIELDS, FILL_FLAT_DEFAULTS,
  SHADOW_FIELDS, SHADOW_FLAT_DEFAULTS,
} from './skyLightChannels.js'

// Generic store-bound TodChannel mount — same shape as the one in
// CartographPost. Reads channel + 6 actions by name.
function StoreChannel({ name, label, fields, flatDefaults }) {
  const cap = name[0].toUpperCase() + name.slice(1)
  // Resolve the active shot's channel (channel-variant cascade) — same panel,
  // binding follows the active shot (forked shot edits its own block).
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

// Stage-only QA toggle — bypasses LafayetteScene's openPlaces
// business-hours filter so the operator can preview neon visibility
// at any TOD without scrubbing to night. Session-only state, NOT
// serialized to design.json, NOT in scene.json. Doctrine:
// slab-carries-full-authored-product counter-rule.
function NeonForceOnToggle() {
  const on  = useCartographStore(s => s.neonForceOn)
  const set = useCartographStore(s => s.setNeonForceOn)
  return (
    <label className="flex items-center gap-2 py-1 pl-2"
      style={{ fontSize: 12, color: 'var(--on-surface)' }}>
      <input type="checkbox" checked={!!on} onChange={e => set(e.target.checked)} />
      <span>Force Neon On (test)</span>
    </label>
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
      {/* LIGHT & SHADOW — by intent: the directional lights, the soft fill, and
          the three "how dark are the darks" controls (cast shadow · occlusion ·
          shadow lift) together. The last three used to live under the Post card
          by render-mechanism; they're here now because that's what you reach for
          when you author light. */}
      <SectionLabel label="Light & Shadow" />
      <StoreChannel name="dirSun" label="Sun light"
        fields={DIRSUN_FIELDS} flatDefaults={DIRSUN_FLAT_DEFAULTS} />
      <StoreChannel name="dirMoon" label="Moon light"
        fields={DIRMOON_FIELDS} flatDefaults={DIRMOON_FLAT_DEFAULTS} />
      <StoreChannel name="ambient" label="Fill light"
        fields={AMBIENT_FIELDS} flatDefaults={AMBIENT_FLAT_DEFAULTS} />
      <StoreChannel name="hemi" label="Sky fill (hemisphere)"
        fields={HEMI_FIELDS} flatDefaults={HEMI_FLAT_DEFAULTS} />
      <StoreChannel name="shadow" label="Cast shadows"
        fields={SHADOW_FIELDS} flatDefaults={SHADOW_FLAT_DEFAULTS} />
      <StoreChannel name="ao" label="Occlusion (AO)"
        fields={AO_FIELDS} flatDefaults={AO_FLAT_DEFAULTS} />
      <StoreChannel name="fill" label="Shadow lift"
        fields={FILL_FIELDS} flatDefaults={FILL_FLAT_DEFAULTS} />

      <SectionLabel label="Sky & Air" />
      <SkyGradientGrid />
      <StoreChannel name="skyGain" label="Sky brightness"
        fields={SKY_GAIN_FIELDS} flatDefaults={SKY_GAIN_FLAT_DEFAULTS} />
      <StoreChannel name="mist" label="Mist"
        fields={MIST_FIELDS} flatDefaults={MIST_FLAT_DEFAULTS} />
      <StoreChannel name="halo" label="Halo"
        fields={HALO_FIELDS} flatDefaults={HALO_FLAT_DEFAULTS} />

      <SectionLabel label="Night Sky" />
      <StoreChannel name="constellations" label="Constellations"
        fields={CONSTELLATIONS_FIELDS} flatDefaults={CONSTELLATIONS_FLAT_DEFAULTS} />
      <StoreChannel name="stars" label="Stars"
        fields={STARS_FIELDS} flatDefaults={STARS_FLAT_DEFAULTS} />

      {/* Neon — a man-made light SOURCE; lives here for now, flagged to move to
          a "Glow & Sources" card with Bloom + Lamps + Arch in Phase B. */}
      <SectionLabel label="Neon" />
      <StoreChannel name="neon" label="Neon"
        fields={NEON_FIELDS} flatDefaults={NEON_FLAT_DEFAULTS} />
      <NeonForceOnToggle />
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
