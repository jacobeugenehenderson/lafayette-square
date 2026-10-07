import { LABEL_STYLE_DEFAULT, authoredLabelStyle } from '../../lib/labelStyle.js'
import { authoredBrowseFrame } from '../../camera/browseFrame.js'
import { create } from 'zustand'
import {
  fetchMarkers, saveMarkers, fetchCenterlines, fetchSkeleton,
  fetchMeasurements, saveMeasurements, fetchOverlay, saveOverlay,
  fetchLooks, fetchLookDesign, saveLookDesign, bakeLook, fetchBakeStatus, fetchBakePlan,
  createLook as apiCreateLook, deleteLook as apiDeleteLook,
  saveShapeFreeze, fetchRibbons, fetchMap, fetchGeography, fetchBoundary,
} from '../api.js'
import { setSceneMeasureSource } from '../measureModel.js'
import { readAddress, resolveTown, lookForScene, isValidMapId, ADDRESS_STORAGE } from '../../lib/authoringAddress.js'
import { feCustomKey } from '../../lib/feCustomKey.js'
import useTimeOfDay from '../../hooks/useTimeOfDay'

// A1 (2026-07-18) — FANNED per-fe STORAGE. blockCustoms stores one authored
// arrangement across ALL of a block-edge's owned segOrds, not only min(segOrd)
// (feCustomKey's representative). The renderer reads blockCustoms[skel][side]
// [run.segOrd] PER RUN; the fes-less BAKE can't expand at read-time the way the
// Designer does (expandCustomsAcrossFeSegOrds) — so an over-segmented block-edge
// (a cul-de-sac's clustered IXs shatter its terminal chain into many tiny natural
// segments) orphaned every non-min run and the leg flip rendered Δ=0.0 in the
// slab. Fanning at WRITE time makes the store self-sufficient (bake reads raw).
// segOrds are disjoint across fes (assignSegOrdsToFes), so a fan never collides.
// EVERY per-fe writer AND deleter fans through this. Supersedes the min-key +
// render-time-only expand (the Designer's expand is now idempotent under it).
const feSegOrds = (fe, k) => {
  const key = k || feCustomKey(fe)
  if (!key) return []
  return (fe?.segOrds && fe.segOrds.length) ? [...new Set(fe.segOrds)] : [key[2]]
}
import { keepAuthorable } from '../../lib/authorableSlot.js'
import {
  migrateLampGlow, resolveLampGlowAtMinute,
  resolveGroupAtMinute, migrateGroupChannel,
  NAMED_TOD_SLOTS_BY_ID, getTodSlotMinutes, todSlotAtMinute, todEdgePatch,
  stampLampGlowRadius,
} from '../animatedParam.js'
import {
  BLOOM_FIELD_KEYS, BLOOM_FLAT_DEFAULTS,
  WARMTH_FIELD_KEYS, WARMTH_FLAT_DEFAULTS,
  FILL_FIELD_KEYS, FILL_FLAT_DEFAULTS,
  EXPOSURE_FIELD_KEYS, EXPOSURE_FLAT_DEFAULTS,
  AO_FIELD_KEYS, AO_FLAT_DEFAULTS,
  MIST_FIELD_KEYS, MIST_FLAT_DEFAULTS,
  EDGE_RUFFLE_FIELD_KEYS, EDGE_RUFFLE_FLAT_DEFAULTS,
  HALO_FIELD_KEYS, HALO_FLAT_DEFAULTS,
  SKY_GAIN_FIELD_KEYS, SKY_GAIN_FLAT_DEFAULTS,
  GRADE_FIELD_KEYS, GRADE_FLAT_DEFAULTS,
  GRAIN_FIELD_KEYS, GRAIN_FLAT_DEFAULTS,
  SHADOW_FIELD_KEYS, SHADOW_FLAT_DEFAULTS,
  CANOPY_FIELD_KEYS, CANOPY_FLAT_DEFAULTS,
  TREE_WIND_FIELD_KEYS, TREE_WIND_FLAT_DEFAULTS,
  SHOTS_FLAT_DEFAULTS,
  BROWSE_HEADING_FIELD_KEYS, BROWSE_HEADING_FLAT_DEFAULTS,
  ARCH_FIELD_KEYS, ARCH_FLAT_DEFAULTS,
  LANDSCAPE_FIELD_KEYS, LANDSCAPE_FLAT_DEFAULTS,
  ARCHLIGHT_FIELD_KEYS, ARCHLIGHT_FLAT_DEFAULTS, migrateArchLight,
  LANTERN_FIELD_KEYS, LANTERN_FLAT_DEFAULTS,
  CLOUDS_FLAT_DEFAULTS,
  DOF_FIELD_KEYS, DOF_FLAT_DEFAULTS, migrateDof, migrateFill,
  CONSTELLATIONS_FIELD_KEYS, CONSTELLATIONS_FLAT_DEFAULTS,
  STARS_FIELD_KEYS, STARS_FLAT_DEFAULTS,
  MILKYWAY_FIELD_KEYS, MILKYWAY_FLAT_DEFAULTS,
  NEON_FIELD_KEYS, NEON_FLAT_DEFAULTS,
  AMBIENT_FIELD_KEYS, AMBIENT_FLAT_DEFAULTS,
  HEMI_FIELD_KEYS, HEMI_FLAT_DEFAULTS,
  DIRSUN_FIELD_KEYS, DIRSUN_FLAT_DEFAULTS,
  DIRMOON_FIELD_KEYS, DIRMOON_FLAT_DEFAULTS,
  kitDayChannel, KIT_DAY_CHANNELS,
} from '../skyLightChannels.js'
import { migrateSkyChannel, SKY_BANDS, SKY_HOURS } from '../skyGrid.js'
import { validateIdentity } from '../../lib/townIdentity.js'
import { assertHardPolicy } from '../../lib/colourPolicy.js'

const ACTIVE_LOOK_KEY = ADDRESS_STORAGE.look
// ⛔⛔ There is deliberately NO `DEFAULT_LOOK_ID = 'lafayette-square'` here any
// more. It was the client's own copy of "when in doubt, Lafayette Square" — the
// A00 class — and it outlived the server-side fixes because it is a literal in
// the browser bundle. The 0-state Look id is SERVED (`index.json`'s `default`,
// now the town-less `kit-default`) and lands in `defaultLookId` below.

// ⛔ THE LOOK FOR A SCENE (`lookForScene`, src/lib/authoringAddress.js). Design autosave writes to the ACTIVE Look, so
// the active Look must belong to the store's scene — else one town's edits land in another town's design.json
// (2026-09-25: Extent's openScene switched the scene and left the Look on the previous town). None ⇒ null: nothing
// saves and the StatusBar says so. ⛔ Never the served default — `kit-default` has no scene; it is not a town.

// ── Channel-variant cascade (HANDOFF-channel-variant-cascade.md, Phase 2) ──
// IMPLICIT per-shot override cascade: editing a LOOK channel while a forkable
// shot (browse/street) is active RECORDS that change as the shot's override —
// no "make this its own look" step (Jacob, 2026-06-29: "just record changes as
// the new fork"). Hero IS the base (the top-level channels) — that's where you
// edit the shared look; browse/street override sparsely on top, inheriting base
// for every channel they haven't touched. Reads + writes RESOLVE the active shot
// STATELESSLY — the data always lives in its true place (base = top-level,
// override = shotLooks[shot][channel]), so there's no swap/flush race; a channel
// resolves to the shot's override if present, else base. Only LOOK channels
// override. NOT overridable, by design:
// shape (frozen geometry), framing (shot identity = shots/hero*/arch/horizon/
// browseHeading), and building material (materialColors/Physics/buildingPalette
// render via SlabBuildings, which bypasses the slab adapter → can't fork per
// shot until that read path is firmed — Jacob isn't after per-shot building
// color). Add a new LOOK channel here when it should fork; opt-in is the safe
// failure mode (a missing one just edits base — never an accidental shape fork).
export const SHOT_LOOK_CHANNELS = new Set([
  'layerColors', 'luColors', 'lampGlow', 'bloom', 'warmth', 'fill', 'exposure',
  'ao', 'mist', 'halo', 'skyGain', 'stars', 'grade', 'grain', 'dof', 'shadow',
  'constellations', 'milkyWay', 'neon', 'sky', 'ambient', 'hemi', 'dirSun',
  'dirMoon', 'archLight', 'setPieceLight', 'lantern', 'clouds', 'canopy',
])
const FORK_SHOT_KEYS = ['browse', 'street'] // hero + designer → base

// The active shot key when it's an overridable shot (browse/street), else null
// (→ base) for hero/designer. NOT gated on an existing override block — a
// forkable shot records overrides IMPLICITLY on first edit.
function forkableShotKey(s) {
  return FORK_SHOT_KEYS.includes(s.shot) ? s.shot : null
}
// Resolve a channel for the active shot: the shot's override if it has recorded
// one for this channel, else base. Returns a stored object reference (no merge)
// → a stable zustand selector result. An overridable shot inherits base for
// every channel it hasn't touched.
export function activeChannel(s, name) {
  const sk = SHOT_LOOK_CHANNELS.has(name) ? forkableShotKey(s) : null
  if (sk && s.shotLooks?.[sk] && name in s.shotLooks[sk]) return s.shotLooks[sk][name]
  return s[name]
}
// Build the set()-patch that writes `obj` into the right layer for `name` — the
// active shot's override block (auto-created on first edit) when forkable, else
// the top-level base. This is what makes editing in a shot implicitly record
// the override.
function channelPatch(s, name, obj) {
  const sk = SHOT_LOOK_CHANNELS.has(name) ? forkableShotKey(s) : null
  if (!sk) return { [name]: obj }
  return { shotLooks: { ...s.shotLooks, [sk]: { ...(s.shotLooks?.[sk] || {}), [name]: obj } } }
}
// Per-channel revert. In an overridable shot, "revert" DROPS this channel's
// override → the channel follows base (Hero) again. In base (hero/designer),
// it resets the channel to defaults (today's behavior).
function channelRevert(s, name, baseDefaultObj) {
  const sk = SHOT_LOOK_CHANNELS.has(name) ? forkableShotKey(s) : null
  if (sk && s.shotLooks?.[sk] && name in s.shotLooks[sk]) {
    const block = { ...s.shotLooks[sk] }
    delete block[name]
    // Drop the shot's whole block once its last override is cleared.
    const next = { ...s.shotLooks }
    if (Object.keys(block).length === 0) delete next[sk]
    else next[sk] = block
    return { shotLooks: next }
  }
  return { [name]: baseDefaultObj }
}

// Group-channel action factory. See use site below the LampGlow block.
function createGroupChannelActions({ name, fieldKeys, flatDefaults }, set, get) {
  const cap = name[0].toUpperCase() + name.slice(1)
  const flatTuple = (s) => {
    const ch = activeChannel(s, name)
    const out = {}
    for (const k of fieldKeys) {
      const v = ch?.values?.[k]
      out[k] = v == null ? (flatDefaults[k] ?? 0) : Number(v)
    }
    return out
  }
  return {
    [`set${cap}`]: (key, value, slotId) => {
      set(s => {
        const ch = activeChannel(s, name) || { values: {} }
        if (!ch.animated) {
          return channelPatch(s, name, { ...ch, values: { ...(ch.values || {}), [key]: value } })
        }
        // Animated: write to the EXPLICIT edit-target slot the caller passes
        // (TodChannel's selected chip). Keyframes are keyed BY SLOT ID and each
        // slot's time is already stamped (getTodSlotMinutes), so the write never
        // needs the playhead — which is what retired the scrub-on-edit timeline
        // jog. Fall back to the playhead-inferred slot for any caller that
        // doesn't pass one (e.g. meteorologist's Teacup, programmatic writes).
        const sid = slotId ?? (() => {
          const tod = useTimeOfDay.getState()
          return todSlotAtMinute(tod.getMinuteOfDay(), tod.currentTime)
        })()
        if (!sid || !(sid in (ch.values || {}))) return s
        const tuple = { ...(ch.values[sid] || {}), [key]: value }
        return channelPatch(s, name, { ...ch, values: { ...ch.values, [sid]: tuple } })
      })
      get()._saveDesignDebounced()
    },
    [`animate${cap}`]: (slotId) => {
      if (!slotId || !NAMED_TOD_SLOTS_BY_ID[slotId]) return
      set(s => {
        if (activeChannel(s, name)?.animated) return s
        return channelPatch(s, name, {
          animated: 'tod',
          transitionIn: 30,
          transitionOut: 30,
          values: { [slotId]: flatTuple(s) },
        })
      })
      get()._saveDesignDebounced()
    },
    [`unanimate${cap}`]: () => {
      set(s => {
        const ch = activeChannel(s, name)
        if (!ch?.animated) return s
        const tod = useTimeOfDay.getState()
        const phId = todSlotAtMinute(tod.getMinuteOfDay(), tod.currentTime)
        const slotIds = Object.keys(ch.values || {})
        const useId = phId && slotIds.includes(phId) ? phId : slotIds[0]
        const tuple = useId ? ch.values[useId] : { ...flatDefaults }
        return channelPatch(s, name, { values: { ...tuple } })
      })
      get()._saveDesignDebounced()
    },
    [`add${cap}Slot`]: (slotId) => {
      if (!slotId || !NAMED_TOD_SLOTS_BY_ID[slotId]) return
      const slotMinutes = getTodSlotMinutes(useTimeOfDay.getState().currentTime)
      const minute = slotMinutes[slotId]
      if (minute == null) return
      set(s => {
        const ch = activeChannel(s, name)
        if (!ch?.animated) return s
        if (slotId in (ch.values || {})) return s
        const seed = resolveGroupAtMinute(ch, minute, slotMinutes, fieldKeys, flatDefaults)
        return channelPatch(s, name, { ...ch, values: { ...ch.values, [slotId]: seed } })
      })
      get()._saveDesignDebounced()
    },
    [`remove${cap}Slot`]: (slotId) => {
      set(s => {
        const ch = activeChannel(s, name)
        if (!ch?.animated || !(slotId in (ch.values || {}))) return s
        const values = { ...ch.values }
        const removedTuple = values[slotId]
        delete values[slotId]
        // 0 authored slots → collapse to flat using the removed tuple
        // (preserves the visual at the moment of removal).
        const next = Object.keys(values).length === 0
          ? { values: { ...removedTuple } }
          : { ...ch, values }
        return channelPatch(s, name, next)
      })
      get()._saveDesignDebounced()
    },
    // A key's fade at a blank tile — 'up' | 'down' | null (tween) — and its minutes (animatedParam.js#todEdgePatch).
    [`set${cap}Transition`]: (slotId, fade, minutes) => {
      set(s => {
        const ch = activeChannel(s, name)
        if (!ch?.animated) return s
        return channelPatch(s, name, todEdgePatch(ch, slotId, fade, minutes))
      })
      get()._saveDesignDebounced()
    },
    // Per-channel revert: collapse to flat AND reset to defaults.
    // Single button at the channel header (feedback_per_item_revert) —
    // never a card-level "reset everything," never a per-slider revert.
    [`revert${cap}`]: () => {
      set(s => channelRevert(s, name, kitDayChannel(name) || { values: { ...flatDefaults } }))
      get()._saveDesignDebounced()
    },
  }
}

// One-shot migration for `labels` shape churn. haloWidth has now been
// fontSize-relative TWICE with an intervening absolute-meters epoch
// (3a7ec00 flipped to meters, this commit flips back). Any stored
// value > 0.21 is in the absolute-meters range and would render as a
// massive outline (e.g. 0.3 → 30% of glyph height) when re-interpreted
// as a percentage — reset those to the canonical default.

// ── Per-Look design block — ONE source of truth ─────────────────────────────
// These design fields were hand-maintained in THREE places (two hydrate blocks
// + the save writer); they had to stay byte-identical or a saved-but-not-
// hydrated field got clobbered by init defaults on the next save. That drift
// already cost 3 hero keyframes → 2 (feedback_dual_hydration_paths_drift) — and
// the stopgap then was to copy lines into the third list. THIS is the real fix:
// one descriptor. Each field knows how to hydrate from a fetched design.json
// (its migration/default); it serializes uniformly as the live state value.
// hydrateDesign() drives both hydrate paths, serializeDesign() the save writer,
// so the set can never diverge again. Order = on-disk JSON key order (matches
// the prior save writer → keeps design.json diffs clean). Add a future channel
// in ONE place here.
// ── Kit defaults for the inherit-shaped channels ────────────────────────────
// ⛔ These four hydrated as `d.X || get().X` — "absent ⇒ keep whatever the
// PREVIOUSLY-OPENED Look left in the store". That is not a default, it is a
// carry: open Lafayette Square, open a fresh pour, and the fresh pour DISPLAYS
// LS's values; the next save writes them to its design.json. A11's Look-seed
// strip closed the seeding path and this reopened it through the front door
// (A11:230, feedback_absence_means_inherit_in_authored_blocks).
// ⭐ Absent now means THE KIT DEFAULT — a fixed constant, never another town's
// live state. Referenced by both the hydrator and the initial state so the two
// cannot drift (the same one-descriptor rule the block below was written for).
// 12 generic tints. Genuinely a KIT default — no town's authoring in it; the
// bake carries the same list as DEFAULT_PALETTE (bake-buildings.js:702).
const BUILDING_PALETTE_DEFAULT = [
  '#dcdcdc', '#a0522d', '#cd853f', '#8b2500',
  '#d2b48c', '#778899', '#8b4513', '#a52a2a',
  '#f5deb3', '#696969', '#b22222', '#808080',
]
// Length + mode are a CADENCE, not a place — portable between towns. Only read
// once a Look has 2+ keys; one key is a static shot and needs no motion.
const HERO_MOTION_DEFAULT = { length: 360, mode: 'bounce' }
// ⛔⛔ THE KIT STORES NO CAMERA. There is deliberately no default hero path.
// The pair that stood here — [-540,55,362] / [-260,55,98] — is Lafayette
// Square's, and it was handed to every Look whose design.json omitted the
// channel. Jacob, 2026-09-19: "the camera motion is not something that carries
// realistically from hood to hood"; absent a designated hero object the opening
// view is DERIVED from the scene's own extent (Scene.jsx's derivedHeroPose
// already does this — bounds-framed, never LS's coordinate).
// ⭐ Same rule `browseFrame` below already states: a kit default here would be
// LS's coordinates handed to every town. Empty ⇒ the consumer derives or shouts.
const HERO_KEYFRAMES_DEFAULT = []

// ⭐⭐ ONE DEFINITION OF "IS THIS A STAGE SHOT", because there were three and one
// of them disagreed. `setShot` cleared the panel tool on `shot !== 'designer'` —
// which is not "is a Stage shot", it is "is anything else", and that includes
// `extent`. Eight lines below it the SAME FUNCTION said the opposite in words:
// "'extent' is a pre-skeleton destination, not a Stage shot". The tool-init said
// it correctly too. Two right, one wrong, all spelled out separately.
// ⛔ The cost: Designer → Extent → Designer destroyed the operator's tool instead
// of parking it — `tool: null` AND `cartograph-tool := 'design'` — so they came
// back with NO tool where they left Survey, and the persisted key stayed wrong
// across reloads, defeating the 2026-06-21 ruling quoted at `tool:` below
// ("Restore the EXACT tool + shot the operator left"). Introduced by 1452bdfe,
// the commit that split the Tool/Shot axes; reported from the screen 2026-09-19.
const STAGE_SHOTS = ['browse', 'hero', 'street']
export const isStageShot = (shot) => STAGE_SHOTS.includes(shot)
// Every valid destination. ⛔ NOT a superset to test Stage-ness with: 'designer'
// and 'extent' are here precisely because they are NOT Stage shots.
const ALL_SHOTS = ['designer', ...STAGE_SHOTS, 'extent']
// ⭐ WHERE THE PAGE OPENS (Phase 2 A; Jacob's ruling 2026-10-04): the URL's `?shot=`, then the saved shot, then the
// Designer. The URL is written back as you move (CartographApp, `?scene=&look=&shot=`), so a copied link reopens
// in the shot it was copied from. It replaces "every Stage shot reloads as Hero" (2026-09-26).
function initialShot() {
  const { url, stored } = readAddress()
  if (ALL_SHOTS.includes(url.shot)) return url.shot
  if (url.shot) console.error(`[stage] ⛔ ?shot=${url.shot} is not a shot (have: ${ALL_SHOTS.join(', ')}) — ignored`)
  return ALL_SHOTS.includes(stored.shot) ? stored.shot : 'designer'
}

const _isObj = (v) => v && typeof v === 'object'
// An absent channel hydrates to THE KIT'S DAY where the day keys it (skyLightChannels.js#kitDayChannel), else to the
// flat defaults — so a town inherits the kit's day on every channel it has not authored.
const _kit = (key, d, migrate) => (d[key] == null && kitDayChannel(key)) || migrate(d[key])
const _grp = (key, KEYS, DEFAULTS) => ({ key, hydrate: (d) => _kit(key, d, (v) => migrateGroupChannel(v, KEYS, DEFAULTS)) })
const SHOT_MIGRATIONS = { fill: migrateFill, dof: migrateDof }
const migrateShotLooks = (shotLooks) => Object.fromEntries(Object.entries(shotLooks).map(([shot, block]) => [shot,
  _isObj(block) ? Object.fromEntries(Object.entries(block).map(([ch, v]) => [ch, SHOT_MIGRATIONS[ch] ? SHOT_MIGRATIONS[ch](v) : v])) : block]))

const DESIGN_FIELDS = [
  { key: 'layerVis',     hydrate: (d) => d.layerVis || {} },
  { key: 'layerColors',  hydrate: (d) => d.layerColors || {} },
  { key: 'layerStrokes', hydrate: (d) => d.layerStrokes || {} },
  { key: 'luColors',     hydrate: (d) => d.luColors || {} },
  { key: 'cornerRadiusScale', hydrate: (d) => Number.isFinite(d.cornerRadiusScale) ? d.cornerRadiusScale : 1 },
  { key: 'cornerRadiusOverrides', hydrate: (d) => _isObj(d.cornerRadiusOverrides) ? d.cornerRadiusOverrides : {} },
  { key: 'cornerCornerRadiusOverrides', hydrate: (d) => _isObj(d.cornerCornerRadiusOverrides) ? d.cornerCornerRadiusOverrides : {} },
  // (streetSmooth retired 2026-06-04 — smoothing is always-on at fixed quality,
  // no design-persisted dial; see BlockGeometryV2Debug / smoothCenterline.)
  { key: 'curbWidth',    hydrate: (d) => Number.isFinite(d.curbWidth) ? d.curbWidth : 0.1524 },
  // Operator override for the park title's world position ([x,z]); null = the
  // computed default. Persisted + baked like every other design field so the
  // move survives and ships.
  { key: 'parkTitlePos', hydrate: (d) => Array.isArray(d.parkTitlePos) && d.parkTitlePos.length === 2 ? d.parkTitlePos : null },
  { key: 'alleyCap',     hydrate: (d) => ['square', 'rounded', 'round'].includes(d.alleyCap) ? d.alleyCap : 'square' },
  // Only the fields a reader uses: the rot a Look still carries (bg, tierScale, …) falls away at its next save.
  { key: 'labels',       hydrate: (d) => authoredLabelStyle(_isObj(d.labels) ? d.labels : {}) },
  { key: 'blockCustoms', hydrate: (d) => _isObj(d.blockCustoms) ? d.blockCustoms : {} },
  // The blessed Survey "Default" (Set Default snapshots the curated state here;
  // Revert to Default restores it). null until the operator blesses one.
  { key: 'surveyDefault', hydrate: (d) => _isObj(d.surveyDefault) ? d.surveyDefault : null },
  { key: 'blockLandUse', hydrate: (d) => _isObj(d.blockLandUse) ? d.blockLandUse : {} },
  { key: 'materialColors',  hydrate: (d) => d.materialColors || {} },
  { key: 'materialPhysics', hydrate: (d) => d.materialPhysics || {} },
  { key: 'buildingPalette', hydrate: (d) => d.buildingPalette || [...BUILDING_PALETTE_DEFAULT] },
  // ⭐ Keys Stage has no controls for yet but a bake reads: carried through untouched, because the
  // autosave REPLACES design.json with this store's fields — a key missing here is wiped on the next
  // save (2026-09-26: `surfaces`, the operator layer of cartograph/surfaces.mjs, was). ▶ checks/
  // claims-autosave-keeps-what-bakes-read.mjs fails on a design.json key a bake reads that is not listed here.
  { key: 'surfaces',     hydrate: (d) => _isObj(d.surfaces) ? d.surfaces : null },
  // How the town looks — mark, accent, rating mark, lit tint (src/lib/townIdentity.js), authored in the Identity panel.
  // Only what the town chose; an unchosen channel is absent (the kit's neutral value is the reader's, never written).
  { key: 'identity',     hydrate: (d) => _isObj(d.identity) ? d.identity : {} },
  { key: 'wallMix',      hydrate: (d) => _isObj(d.wallMix) ? d.wallMix : null },       // bake-buildings: undescribed walls
  { key: 'wallPalettes', hydrate: (d) => _isObj(d.wallPalettes) ? d.wallPalettes : null },
  { key: 'lamps',        hydrate: (d) => _isObj(d.lamps) ? d.lamps : null },             // bake-lamps: { derive: false } = surveyed + authored only
  { key: 'terrainExag',  hydrate: (d) => Number.isFinite(d.terrainExag) ? d.terrainExag : null }, // bake-scene: the town's authored exaggeration
  { key: 'lampGlow',     hydrate: (d) => _kit('lampGlow', d, migrateLampGlow) },
  _grp('bloom',          BLOOM_FIELD_KEYS,          BLOOM_FLAT_DEFAULTS),
  _grp('warmth',         WARMTH_FIELD_KEYS,         WARMTH_FLAT_DEFAULTS),
  // Shadow lift's 0–2 `value` → Shadow crush's `crush` (skyLightChannels).
  { key: 'fill', hydrate: (d) => _kit('fill', d, (v) => migrateGroupChannel(migrateFill(v), FILL_FIELD_KEYS, FILL_FLAT_DEFAULTS)) },
  _grp('exposure',       EXPOSURE_FIELD_KEYS,       EXPOSURE_FLAT_DEFAULTS),
  _grp('ao',             AO_FIELD_KEYS,             AO_FLAT_DEFAULTS),
  _grp('mist',           MIST_FIELD_KEYS,           MIST_FLAT_DEFAULTS),
  // The town's faded edge, per Look (was Extent's; moved to Stage 2026-10-06): the band in METRES — absent ⇒ every
  // reader takes 5% of the radius and says so (boundaryRecords.mjs#edgeBandOf) — and the ruffle, a TOD channel.
  { key: 'edgeFadeBand', hydrate: (d) => Number.isFinite(d.edgeFadeBand) ? d.edgeFadeBand : null },
  _grp('edgeRuffle',     EDGE_RUFFLE_FIELD_KEYS,    EDGE_RUFFLE_FLAT_DEFAULTS),
  _grp('halo',           HALO_FIELD_KEYS,           HALO_FLAT_DEFAULTS),
  _grp('skyGain',        SKY_GAIN_FIELD_KEYS,       SKY_GAIN_FLAT_DEFAULTS),
  // stars had channel actions (a Stage control) but no field here, so its edits were never saved.
  _grp('stars',          STARS_FIELD_KEYS,          STARS_FLAT_DEFAULTS),
  _grp('grade',          GRADE_FIELD_KEYS,          GRADE_FLAT_DEFAULTS),
  _grp('grain',          GRAIN_FIELD_KEYS,          GRAIN_FLAT_DEFAULTS),
  // Focus has no On switch: a legacy `enabled` folds into Blur so the slider is live (skyLightChannels#migrateDof).
  { key: 'dof', hydrate: (d) => _kit('dof', d, (v) => migrateGroupChannel(migrateDof(v), DOF_FIELD_KEYS, DOF_FLAT_DEFAULTS)) },
  _grp('shadow',         SHADOW_FIELD_KEYS,         SHADOW_FLAT_DEFAULTS),
  _grp('canopy',         CANOPY_FIELD_KEYS,         CANOPY_FLAT_DEFAULTS),
  // No panel edits it (no knobs, 2026-10-05); kept so a value a town authors in design.json reaches Stage and the bake.
  _grp('treeWind',       TREE_WIND_FIELD_KEYS,      TREE_WIND_FLAT_DEFAULTS),
  _grp('constellations', CONSTELLATIONS_FIELD_KEYS, CONSTELLATIONS_FLAT_DEFAULTS),
  _grp('milkyWay',       MILKYWAY_FIELD_KEYS,       MILKYWAY_FLAT_DEFAULTS),
  _grp('neon',           NEON_FIELD_KEYS,           NEON_FLAT_DEFAULTS),
  { key: 'sky', hydrate: (d) => migrateSkyChannel(d.sky) },
  _grp('ambient',        AMBIENT_FIELD_KEYS,        AMBIENT_FLAT_DEFAULTS),
  _grp('hemi',           HEMI_FIELD_KEYS,           HEMI_FLAT_DEFAULTS),
  _grp('dirSun',         DIRSUN_FIELD_KEYS,         DIRSUN_FLAT_DEFAULTS),
  _grp('dirMoon',        DIRMOON_FIELD_KEYS,        DIRMOON_FLAT_DEFAULTS),
  { key: 'heroSubject',   hydrate: (d) => d.heroSubject || null },
  { key: 'heroKeyframes', hydrate: (d) => Array.isArray(d.heroKeyframes) ? d.heroKeyframes : [...HERO_KEYFRAMES_DEFAULT] },
  { key: 'heroMotion',    hydrate: (d) => {
    // ⛔ A pre-timeline motion ({ period, easing }) is not merged onto the default:
    // its keys carry no times either, and Stage refuses them loudly on open.
    // Migrate with scratch/keyframe-timeline-migrate.mjs (BRIEF-keyframe-timeline).
    if (d.heroMotion && !('length' in d.heroMotion)) {
      console.error('[design] heroMotion predates the keyframe timeline — migrate it', d.heroMotion)
    }
    return { ...HERO_MOTION_DEFAULT, length: d.heroMotion?.length ?? HERO_MOTION_DEFAULT.length,
      mode: d.heroMotion?.mode ?? HERO_MOTION_DEFAULT.mode }
  } },
  // SC.5 — shots is nested per-shot; merge shallowly against defaults so a
  // partial author (e.g. only shots.values.hero.fov) inherits the rest.
  { key: 'shots', hydrate: (d) => d.shots?.values
    ? { values: {
        // ⛔ No default box is merged in: it was LS's footprint, autosaved into every town (SHOTS_FLAT_DEFAULTS).
        browse: { ...SHOTS_FLAT_DEFAULTS.browse, ...(d.shots.values.browse || {}) },
        hero:   { ...SHOTS_FLAT_DEFAULTS.hero,   ...(d.shots.values.hero   || {}) },
        street: { ...SHOTS_FLAT_DEFAULTS.street, ...(d.shots.values.street || {}) },
      } }
    : { values: JSON.parse(JSON.stringify(SHOTS_FLAT_DEFAULTS)) } },
  // SC.5 — the authored Browse FRAME. Sits beside browseHeading (top-level, not
  // inside `shots`) because it is a PLACE, not a style: `shots` carries fov /
  // padding, which are meant to travel to another town's Look, and a frame is
  // the one thing that must not. Declared in serve.js's
  // SCENE_KEYED_DESIGN_FIELDS so seeding a new town's Look strips it.
  // ⛔ null = not authored: Browse opens on the town's OWN disc (browseFrame.js), never a kit value — a kit
  // default here would be LS's coordinates handed to every town.
  { key: 'browseFrame', hydrate: (d) => authoredBrowseFrame(d.browseFrame) },
  { key: 'browseHeading', hydrate: (d) => d.browseHeading?.values
    ? { values: { ...BROWSE_HEADING_FLAT_DEFAULTS, ...d.browseHeading.values } }
    : { values: { ...BROWSE_HEADING_FLAT_DEFAULTS } } },
  // The arch is a STAGE SET-PIECE a Look INSTALLS by carrying an `arch` block —
  // the same presence rule every other look-keyed consumer already runs on (no
  // baked citymodel ⇒ no CityModel; no baked landscape ⇒ no MountainBackdrop).
  // Not a plain _grp: _grp seeds ARCH_FLAT_DEFAULTS for a Look that has no block,
  // which is what installed an identical arch in all six design.json files and
  // forced the renderer to gate on a look NAME instead. Absent ⇒ null ⇒ absent.
  { key: 'arch', hydrate: (d) => d.arch
    ? migrateGroupChannel(d.arch, ARCH_FIELD_KEYS, ARCH_FLAT_DEFAULTS)
    : null },
  // Landscape is NOT a plain _grp: migrateGroupChannel returns { values } and drops
  // every sibling key, which would silently EAT `source` — the Stage upload's opt-in
  // that the bake gates on (serve.js:1795). Nothing sets `source` yet ("Until the
  // Stage upload flow sets that, the pour emits no landscape"), so today this is
  // latent — but the day that flow lands, the first design autosave after an upload
  // would delete the operator's mountain and the next bake would quietly drop it.
  // Carry `source` through hydrate→serialize so the Designer can never destroy a
  // Stage intake it doesn't own.
  { key: 'landscape', hydrate: (d) => {
    const grp = migrateGroupChannel(d.landscape, LANDSCAPE_FIELD_KEYS, LANDSCAPE_FLAT_DEFAULTS)
    return d.landscape?.source ? { ...grp, source: d.landscape.source } : grp
  } },
  { key: 'archLight', hydrate: (d) => migrateArchLight(d) },
  _grp('setPieceLight',  ARCHLIGHT_FIELD_KEYS,      ARCHLIGHT_FLAT_DEFAULTS),   // the town's set-piece uplights (same fields)
  _grp('lantern',        LANTERN_FIELD_KEYS,        LANTERN_FLAT_DEFAULTS),
  { key: 'clouds', hydrate: (d) => d.clouds?.values
    ? { values: { ...CLOUDS_FLAT_DEFAULTS, ...d.clouds.values } }
    : { values: { ...CLOUDS_FLAT_DEFAULTS } } },
  // Channel-variant cascade (Phase 2): per-shot whole-look forks. Keyed by shot
  // (browse|street); each value is a full copy of the SHOT_LOOK_CHANNELS the
  // operator forked. Absent shot = follows base (the top-level channels). Sparse
  // → a Look with no forks serializes/bakes byte-identically to before.
  // A shot's fork holds whole channels, so a scale migration reaches it too, or the fork keeps the old key.
  { key: 'shotLooks', hydrate: (d) => _isObj(d.shotLooks) ? migrateShotLooks(d.shotLooks) : {} },
  { key: 'openSections', hydrate: (d) => d.openSections || {} },
]

// Build the design-state patch from a fetched design.json (both hydrate paths).
// ⛔ `get` is deliberately NOT forwarded to the hydrators. A hydrate that can
// reach live store state can write "whatever the last Look left here" into the
// Look being opened — that is exactly how the LS carry survived A11's seed
// strip. A hydrator sees the fetched design.json and module-scope kit defaults,
// nothing else. Adding a `get` back re-arms the bleed; checks/claims-look-default-
// has-no-town.mjs asserts no DESIGN_FIELDS hydrator declares a second parameter.
function hydrateDesign(design) {
  const out = {}
  for (const f of DESIGN_FIELDS) out[f.key] = f.hydrate(design)
  return out
}
// Build the design.json payload from live state (the save writer).
function serializeDesign(s) {
  const out = {}
  for (const f of DESIGN_FIELDS) out[f.key] = s[f.key]
  // ⛔ The landscape is a STAGE SET-PIECE the operator uploads per-Look, opted into
  // by `design.landscape.source` (a20619cc) — it is NOT a Look knob-set that every
  // hood carries. The store seeds the knobs from LANDSCAPE_FLAT_DEFAULTS so the
  // Stage panel has something to drive, but those defaults hold the REAL San Gabriel
  // values (snowline 1500, distance 5400 — the misnaming is a known debt), so
  // serializing them unconditionally wrote a mountain config into Lafayette
  // Square's Look on the operator's first Section edit (2026-07-15). Inert — the
  // bake gates on `source`, not on `values` — but it is exactly the "opportunity for
  // confusion or accidental reading/load-in" the intake/Stage separation exists to
  // prevent. No source ⇒ no landscape ⇒ the key is ABSENT and the knobs re-seed from
  // defaults on hydrate.
  if (!out.landscape?.source) delete out.landscape
  // Same rule for the arch set-piece (see the `arch` hydrate above): a Look that
  // doesn't carry the block must not acquire one on its next autosave.
  if (!out.arch) delete out.arch
  // …and the identity block: a Look that chose nothing carries none.
  if (!Object.keys(out.identity || {}).length) delete out.identity
  // ⭐ A channel still equal to THE KIT'S DAY is not written (Jacob, 2026-09-27: "Code default … should [reach
  // existing towns], now"). Writing it would freeze today's default into the town, and the next change to the
  // kit's day would never reach it. Only what the operator actually authored is the town's.
  for (const k of KIT_DAY_CHANNELS) if (k in out && JSON.stringify(out[k]) === JSON.stringify(kitDayChannel(k))) delete out[k]
  return out
}

// The kit is installation-agnostic: any neighborhood opens BY ID (its data is
// fetched per-scene from serve.js). The name below is NOT a registry of
// installations — it's the only one with a bundled fast-path: the default
// installation ('lafayette-square'). A new installation (hipointedemun,
// provincetown, …) is never added here; it fetches. Nothing enumerates the set
// of installations in code.
// The one town whose ribbons ship as a static import (src/data/ribbons.json) — named, not a default: Stage opens no
// town until one is chosen (Jacob's standing order, 2026-09-28: Lafayette Square is never the fallback).
const BUNDLED_MAPS = new Set(['lafayette-square'])
// A scene id is any lowercase slug; existence is validated by the server (a
// missing installation just serves empty). No hardcoded installation list.

// In-flight _loadCenterlines, KEYED BY SCENE — see the dedupe note on
// _loadCenterlines. The key is not optional: _loadCenterlinesImpl captures
// `get().scene` at its start, so a scene-blind promise hands the WRONG hood's
// load to the next caller.
let _clInFlight = null   // { scene, promise } | null

const useCartographStore = create((set, get) => ({
  // ── Layer visibility + colors ─────────────────────────────
  // Hydrated from the active Look's design.json on _loadCenterlines.
  // Stage's StyleEditor and Designer's Panel both read these directly;
  // setters below also call _saveDesignDebounced so edits autosave to the
  // active Look without going through a local-state-mirror dance.
  layerVis: {},
  layerColors: {},
  layerStrokes: {},
  luColors: {},
  // Per-shot whole-look forks (channel-variant cascade, Phase 2). { browse?,
  // street? } → a full copy of the forked SHOT_LOOK_CHANNELS; hydrated from /
  // serialized to design.json via DESIGN_FIELDS. Empty = every shot follows base.
  shotLooks: {},
  // Look-level multiplier on every street-corner radius. 1 = AASHTO/NACTO
  // baseline (4.5m residential, larger for arterials). >1 → bubblier corners
  // (sponsored-event "retro" mode); <1 → tighter / more square. Applies on
  // top of per-IX cornerRadius overrides AND the default-table value, so
  // operators can still author specific corners without losing the global
  // dial. Persists in design.json; consumed by `buildBlockGeometryV2`
  // (Designer live render + the bake) via the corner-radius authoring kit.
  cornerRadiusScale: 1,
  // Look-level street-label style. Drives the shared label pipeline
  // (streetLabels.js polylines → labelLayout.js → StreetLabels/SceneLabel)
  // for both Cartograph's Designer + Preview/LS. SIZE LAW: fontSize = k ×
  // widthM, floored for legibility, no ceiling — proportions fall out of the
  // real street widths. `sizeK` is the proportional Size knob: ABSENT = Auto
  // (the codebase's inherit-on-absent pattern), a number = override scale
  // (1 = Auto baseline). `haloWidth` is in fontSize units (Troika
  // `outlineWidth`) so the outline scales with the type. `case` applies
  // UPPER/lower at render. `fontFamily` is a fontsource id (empty =
  // Troika default, Roboto). Landmark labels (park title, etc.) are authored
  // directly in their components — singular, not part of this kit.
  labels: { ...LABEL_STYLE_DEFAULT },
  // Look-level global curb width (meters). V2 emits the curb as a single
  // unified stroke around the rounded asphalt boundary, so width is
  // global (not per-side, not per-chain). Default 6 inches = 0.1524 m;
  // operator can dial up/down via the Streets > Curb slider.
  curbWidth: 0.1524,
  edgeFadeBand: null,
  // [x,z] override for the park title center; null = computed default (LafayettePark).
  parkTitlePos: null,
  // Universal alley end-cap mode. One global dial — every alley in the
  // Look terminates the same way:
  //   - 'square'  flush butt cut at the endpoint
  //   - 'rounded' squared pad with filleted corners (rounded-rectangle)
  //   - 'round'   true semicircle
  // Other path kinds use per-kind defaults in buildPathRibbons (all 'round').
  alleyCap: 'square',
  // Per-segment per-side measure overrides — the "block-customs" model
  // that replaces V1's couplers/segmentMeasures authoring. The OPERATOR
  // model is per-block ("Adjust this block"); the storage is keyed by
  // (chainIdx, natural-segment-ordinal, side) since each natural segment
  // (the stretch of chain between two IXs) IS one block edge. Real
  // block ids would require planar-subdivision face computation; per-
  // segment keying is functionally equivalent for ribbon widths and
  // ships today. Shape (W1 chain-anchored, via feCustomKey):
  //   blockCustoms[skelId][side][segOrd] = { pavementHW, treelawn, sidewalk, terminal }
  // Keyed off the STABLE authored input (chain skelId + side + natural-
  // segment ordinal), never the drift-prone derived block. The chain's
  // global measure is the default; the operator right-clicks (or panel-
  // toggles) Custom mode and drags to write a per-segment-side override.
  // Editing the chain's global measure clears the chain's customs (globals
  // are truth; customs are local deviations).
  blockCustoms: {},
  // The blessed Survey "Default" (deep copy of blockCustoms + corner maps +
  // scale). Set by Set Default; Revert to Default restores it. Persisted via
  // DESIGN_FIELDS so it survives reload. null until the operator blesses one.
  surveyDefault: null,
  // Per-block land-use overrides. Keyed by stable centroid hash
  // (`${cx.toFixed(2)},${cy.toFixed(2)}` of the block's outer ring).
  // Empty by default → buildBlockGeometryV2 falls through to a weighted
  // deterministic hash of the centroid for variety. Real
  // blocks would seed this map from `ribbons.faces[].use`.
  //   blockLandUse[blockKey] = 'residential' | 'commercial' | …
  blockLandUse: {},
  // Measure tool's edit mode.
  //   'block' (default) — drag writes a per-segment-per-side override in
  //     blockCustoms keyed by (skelId, side, segOrd). Operator-time
  //     authoring is per-block; the segment is implicit in the click
  //     anchor's position along the chain.
  //   'global' — drag writes chain.measure (the universal default for
  //     every block edge along the chain). Toggling INTO this mode also
  //     wipes the chain's existing per-block customs (globals are truth;
  //     per-block customs are local deviations that don't survive a
  //     universal redefinition). Toggling back to 'block' has no side
  //     effect; subsequent drags resume per-segment authoring.
  // Default is per-block because that's the bulk of authoring time;
  // operators set the universal value once per chain at survey time and
  // spend the rest of the session refining individual blocks.
  // Whole-chain is the canonical authoring mode: drag a handle and the
  // change propagates to every block-edge the chain borders. Operators
  // set the universal cross-section first, then opt INTO per-block
  // (`{ type: 'block' }`) when a specific block diverges.
  measureMode: { type: 'global' },
  // Mirror-edit toggle (transient — NOT persisted). When false (default),
  // an edit mirrors to the opposite-side fe ("symmetric" authoring); when
  // true, sides are edited independently. Post-redesign "symmetric" is a
  // property of the operator's CURRENT SELECTION, not stored chain data:
  // chain.measure.symmetric stays a read-only pipeline hint used only to
  // initialize this toggle on selection (see selectStreet). No authoring
  // path writes the chain flag.
  editSidesSeparately: false,
  setEditSidesSeparately: (v) => set({ editSidesSeparately: !!v }),
  _v2FrontageEdges: [],
  // ⭐⭐⭐ THE FRONTAGES THE PAINT ACTUALLY USES — ①'s runs off the frozen shape. `SECTION §7` T3.
  // ⛔ `_v2FrontageEdges` is the CHAIN partition (`resolveChainSegmentation` → `naturalSegments`)
  // and the band is painted from ①'s stamp; measured, the two disagree on 441 of LS's 450
  // (skelId, side) pairs. So a click resolved against v2 writes a slot the paint reads somewhere
  // else — *(Jacob, 2026-09-07)* "when I click the top, the customs in the adjacent block to the
  // left change instead." One question, two answers.
  _protoFrontageEdges: [],
  // Dead-end CAP handles, surfaced from the frozen tile topology (ribbons
  // .tiles[].caps) so the Measure tool can flip a cul-de-sac cap like a leg.
  // Each: { skelId, chainName, capEnd, tip:[x,z] } — the flip resolves the cap
  // slot via makeCapFe(skelId, capEnd). One source (the freeze), never re-derived.
  _v2Caps: [],
  // Per-IX corner-radius overrides, keyed by quantized point ("x.xxx,z.zzz").
  // Operator-authored via the Corner-edit center handles. Per-Look (lives in
  // design.json) so duplicating a Look carries the operator's IX-by-IX work
  // forward; revert-to-default clears the map. Resolution priority:
  //   per-corner override → IX override → ix.cornerRadius (data-file) → 4.5m,
  // then * cornerRadiusScale.
  cornerRadiusOverrides: {},
  // Per-corner overrides for true corner cases (Phase 3). Keyed by
  //   "<pointKey>|<legKeyA>|<legKeyB>"
  // where legKey = "<skelId>:<dir>" with dir ∈ {b,f}, and the two legKeys
  // are sorted alphabetically so the composite key is invariant under
  // (A,B)↔(B,A) swap. Identity loses validity only if one of the named
  // legs is removed from the IX — the explicit point of leg-pair keys
  // over CCW-ordinal indices. Resolved before the per-IX map.
  cornerCornerRadiusOverrides: {},
  // Transient: the ACHIEVED per-corner fillet from the live tile build
  // ({ cornerKey → {C,r,tA,tB} }). Published by BlockGeometryV2Debug so the
  // corner-edit handle draws the REAL curb arc (one corner truth, no drift).
  // Not persisted — it's derived geometry, rebuilt every tile build.
  tileCornerFillets: {},
  setTileCornerFillets: (m) => set({ tileCornerFillets: m || {} }),
  // Transient: the INJECTIVE corner set from the live tile build — one entry per
  // sharp tile corner ({ key, V, legA, legB, vertR, fillet }). Published by
  // BlockGeometryV2Debug so the corner-edit handle sources its corner LIST from
  // the corners actually drawn (the tile graph), not the legacy
  // `ribbons.intersections` (T3, HANDOFF-tile-T3-corner-handles.md). Not
  // persisted — derived geometry, rebuilt every tile build.
  tileCorners: [],
  setTileCorners: (c) => set({ tileCorners: c || [] }),
  // Every JUNCTION corner Section painted, with what it draws and its corner key (where its curb cut is authored)
  // (`tileGround.js#curbCutsOnJunctionCorners` → `sectionOpen().curbCutCorners`). Published by BlockGeometryV2Debug so
  // the curb-cut markers ARE the painter's records — a click selects the corner by identity, never by nearness.
  // Not persisted — derived, rebuilt every Section pass. `selectedCurbCorner` = { tile, si, arc } of the open popover.
  curbCutCorners: [],
  setCurbCutCorners: (c) => set({ curbCutCorners: c || [] }),
  selectedCurbCorner: null,
  selectCurbCorner: (c) => set({ selectedCurbCorner: c ? { tile: c.tile, si: c.si, arc: c.arc } : null }),
  // ⭐ AUTHOR ONE CORNER'S CURB CUT (Jacob, 2026-10-07: "every corner should be authorable on its own"): `cut` in the
  // corner's ONE entry of `cornerCornerRadiusOverrides`, by its own key — beside the radius and the corner's existence
  // Survey writes there. `style` null = back to what the corner draws unauthored.
  setCornerCurbCut: (corner, style) => {
    if (!corner?.key) return
    get()._writeCornerEntry(corner.key, { cut: style ?? null })
  },
  // ⭐ ONE MAP, THREE FIELDS, TWO OWNERS — each tool's revert touches only its own: SURVEY draws the corner (its radius
  // `r`, whether it is one `corner`), SECTION paints it (`cut`).
  _CORNER_SURVEY_FIELDS: ['r', 'corner'],
  _CORNER_SECTION_FIELDS: ['cut'],
  // the corner map with `fields` taken from `from` (a map, or null = cleared) and every other field kept as it is
  _cornerMapWith: (fields, from = null) => {
    const asObj = (v) => v == null ? {} : (typeof v === 'object' ? { ...v } : { r: v })
    const cur = get().cornerCornerRadiusOverrides || {}, out = {}
    for (const k of new Set([...Object.keys(cur), ...Object.keys(from || {})])) {
      const e = asObj(cur[k]), d = asObj(from?.[k])
      for (const f of fields) { if (d[f] != null) e[f] = d[f]; else delete e[f] }
      const ks = Object.keys(e); if (!ks.length) continue
      out[k] = ks.length === 1 && ks[0] === 'r' ? e.r : e
    }
    return out
  },
  // The frozen curb (iA) rings the Section FILL strokes off — published so the
  // Measure handles anchor to the SAME geometry the FILL uses (one *geometry*
  // truth, SECTION.md §5), not a centreline ruler. Empty outside frozen Section.
  sectionCurbRings: [],
  setSectionCurbRings: (r) => set({ sectionCurbRings: r || [] }),
  // Transient UI mode — when true, the Corner-edit handles surface in the
  // 3D scene. Not persisted (operators don't want a Look to load in edit
  // mode); toggled from the Streets > Corners subsection in Panel.
  cornerEditMode: false,
  // 3D-scene material colors (walls, roofs, neon, trees, infra, park) — these
  // never reach the SVG bake but live in the same per-Look design.json so
  // switching Looks swaps the whole visual identity in one place.
  materialColors: {},
  // Per-material shader knobs — roughness, metalness, texture id, texture scale,
  // texture strength, emissive (color + intensity). Authored by the Surfaces
  // panel; consumed live by LafayetteScene materials via useFrame.
  materialPhysics: {},
  // 12-slot building tint palette. Each building deterministically picks
  // palette[hash(building.id) % 12]. Operator authors per-Look; per-building
  // overrides (cartograph/data/<town>/building-overrides.json) can still trump the palette so
  // landmarks/known-real colors lock to specific values.
  buildingPalette: [...BUILDING_PALETTE_DEFAULT],
  // ── Time-of-day slots ───────────────────────────────────────
  // The TOD vocabulary is the same 7 SunCalc waypoints the DawnTimeline
  // card renders (Dawn / Sunrise / Noon / Golden / Sunset / Dusk / Night),
  // defined in animatedParam.js. Animatable parameters key into them by
  // id; per-slot minutes are computed live from SunCalc each frame so the
  // envelope shifts seasonally. There is no per-Look slot CRUD and no
  // separate "parked" state — the playhead position IS the parked state.
  // (project_stage_keyframe_authoring_rule)

  // THE KIT'S DAY — every channel the day keys starts at it (skyLightChannels.js#kitDayChannel); a Look's
  // hydrate replaces what it authored.
  ...Object.fromEntries(KIT_DAY_CHANNELS.map(k => [k, kitDayChannel(k)])),
  // SC.5 — per-shot framing knobs (FOVs, Browse bounds/padding, Street
  // eye height). Single flat-value channel; hand-rolled setShots because
  // values are nested per-shot objects (not the factory's flat scalar
  // tuples). Runtime inputs (Browse altitude, Hero target, Street
  // position/target) are explicitly NOT here.
  shots:         { values: JSON.parse(JSON.stringify(SHOTS_FLAT_DEFAULTS)) },
  browseHeading: { values: { ...BROWSE_HEADING_FLAT_DEFAULTS } },
  browseFrame:   null,   // SC.5 — authored Browse frame {center:[x,z], altitude}; null = Browse opens on the town's disc
  // SC.7 — arch + horizon channels (Hero & Horizon card). Replaces the
  // module-scope archState bridge in src/stage/StageApp.jsx.
  // arch starts ABSENT: it's a set-piece the Look installs by carrying the block
  // (hydrate fills it in for a Look that has one). A seeded default here would
  // stand an arch over any Look whose design.json failed to load.
  arch:    null,
  landscape: { values: { ...LANDSCAPE_FLAT_DEFAULTS } },
  // SC.6 — Meteorologist coupler scaffolding. v1 has no Stage UI; field
  // round-trips through design.json → bake → scene.json so Atmosphere
  // v3 has it ready. preset='auto' = consult the Almanac at runtime.
  clouds:  { values: { ...CLOUDS_FLAT_DEFAULTS } },
  // Stage-only QA toggle. Bypasses LafayetteScene's openPlaces
  // business-hours filter so the operator can preview neon visibility
  // at any TOD without scrubbing to night / waiting for open hours.
  // Session-only: NOT serialized to design.json, NOT emitted to
  // scene.json. Production never sees this — the prop chain stops at
  // Stage's StageEnvironment. Doctrine: slab-carries-full-authored-product
  // counter-rule (session UI state ≠ authored product).
  neonForceOn:    false,
  // Stage-only neon DENSITY (0..1): the share of neon buildings shown while testing — Jacob, 2026-09-26: "It's
  // meant to test the Neon, not the schedules." Session-only like neonForceOn; production shows every building.
  neonDensity:    1,
  // Stage-only weather switch: 'live' polls the town's real weather; a
  // WEATHER_PRESETS key (clear / overcast / rain / snow) stands the scene in it.
  // Session-only, like neonForceOn: never saved, never baked (Jacob, 2026-09-26:
  // "it's hard to test looks while it's raining IRL").
  // ⭐ Stage opens in CLEAR, and a reload keeps what the operator chose (Jacob, 2026-09-27: "The system should default
  // to Clear (not live) and the user must select live"). Live weather is an opt-in, like the live clock.
  weatherMode:    (() => { try { return sessionStorage.getItem('stage-weather') || 'clear' } catch { return 'clear' } })(),
  // Lighting unit — 4 single-value channels, intensity multipliers on
  // the existing scene lights in CelestialBodies. Defaults 1.0 = current
  // behavior. Author 0 at Night to drop world lighting (fixes "bright
  // sidewalks at night").
  ambient:        { values: { ...AMBIENT_FLAT_DEFAULTS } },
  hemi:           { values: { ...HEMI_FLAT_DEFAULTS } },
  dirSun:         { values: { ...DIRSUN_FLAT_DEFAULTS } },
  dirMoon:        { values: { ...DIRMOON_FLAT_DEFAULTS } },
  // Sky gradient — 2D color matrix, see skyGrid.js. 4 vertical bands
  // (horizon/low/mid/high) + sun-glow row × 7 TOD slots (Dawn 4 cols,
  // Sunrise 4, Noon 1, Golden 4, Sunset 4, Dusk 4, Night 1) = 22
  // columns total. Defaults seeded to match CelestialBodies.jsx's hardcoded
  // keyframe ladder so unauthored Looks render unchanged. The cartograph
  // chunk threads this channel as `skyOverride` into CelestialBodies via
  // CartographApp.StageEnvironment; production omits the override and
  // reads scene.sky frozen-at-bake (SC.1, commit c333e50).
  sky:            { overrides: [] },
  // The designated set-piece `{ kind, id }` (ROADMAP H-7). ⛔ NO CAMERA READS IT
  // (BRIEF-camera-regimes, 2026-09-26) — shots are the keyframes below. Its one
  // reader today is the Stage "Hero & Horizon" card (landscape vs arch knobs).
  heroSubject: null,
  // Authored Hero camera path. Each keyframe = { position: [x,y,z],
  // target: [x,y,z], fov } — its own aim; every runtime refuses one without
  // (heroAnim.js#assertKeyframesAimed). Empty by default (the kit stores no
  // camera); hydrated from per-Look design.json on switch.
  // ⛔ Empty, not a pair. See HERO_KEYFRAMES_DEFAULT — the kit stores no camera.
  heroKeyframes: [...HERO_KEYFRAMES_DEFAULT],
  // Authored motion params (preview/speed are transient runtime UI, not here)
  heroMotion: { ...HERO_MOTION_DEFAULT },
  openSections: {},
  bgColor: '#1a1a18',
  _designHydrated: false,

  // ── Style setters (used by StyleEditor and any other styling UI) ──
  // Each writes the new value into the store, triggers a debounced save
  // to /looks/<activeLookId>/design, and stales the bake.
  // design.json#surfaces.params.<surface>.<key> — a surface's authored look (Surfaces › Water: clarity, deep
  // see-through). `value` null removes the key, so the kit's neutral default applies again.
  setSurfaceParam: (surface, key, value) => {
    set(s => {
      const params = { ...(s.surfaces?.params || {}) }
      const one = { ...(params[surface] || {}) }
      if (value == null) delete one[key]; else one[key] = value
      if (Object.keys(one).length) params[surface] = one; else delete params[surface]
      return { surfaces: { ...(s.surfaces || {}), params } }
    })
    get()._saveDesignDebounced()
  },
  setLayerColor: (id, color) => {
    set(s => ({ layerColors: { ...s.layerColors, [id]: color } }))
    get()._saveDesignDebounced()
  },
  setLuColor: (id, color) => {
    set(s => ({ luColors: { ...s.luColors, [id]: color } }))
    get()._saveDesignDebounced()
  },
  // Look-level global curb width (meters). Clamp to a sane band — at 0
  // the curb stroke vanishes; at ~1 m it visually overruns the band stack.
  setCurbWidth: (v) => {
    const n = Math.max(0, Math.min(1.0, Number(v) || 0))
    set({ curbWidth: n })
    get()._saveDesignDebounced()
  },
  // The faded edge's band, metres (Stage › Horizon › Edge). `null` = unauthored: the 5%-of-radius default, said.
  // ⛔ A negative band would put fade.inner past the rim — refused, not clamped.
  setEdgeFadeBand: (v) => {
    if (v === null) { set({ edgeFadeBand: null }); get()._saveDesignDebounced(); return }
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0) throw new Error(`[edge] ⛔ fade band must be a width in metres, ≥ 0 — got ${JSON.stringify(v)}`)
    set({ edgeFadeBand: n })
    get()._saveDesignDebounced()
  },
  // Move the park title. pos = [x,z] world, or null to reset to the default.
  // The Identity panel: choose one channel (src/lib/townIdentity.js), or `null` to un-choose it (the kit's neutral
  // value shows). A malformed value, or one under the contrast policy's hard floor, THROWS — nothing is saved.
  setIdentityChannel: (channel, value) => {
    const next = { ...get().identity }
    if (value == null) delete next[channel]
    else next[channel] = value
    const identity = validateIdentity(next, 'Identity')
    assertHardPolicy({ identity }, 'Identity')     // the contrast policy's hard tier (src/lib/colourPolicy.js)
    set({ identity, bakeStale: true })
    get()._saveDesignDebounced()
  },
  setParkTitlePos: (pos) => {
    set({ parkTitlePos: Array.isArray(pos) ? [Math.round(pos[0] * 100) / 100, Math.round(pos[1] * 100) / 100] : null, bakeStale: true })
    get()._saveDesignDebounced()
  },
  setAlleyCap: (v) => {
    const ALLEY_CAPS = ['square', 'rounded', 'round']
    if (!ALLEY_CAPS.includes(v)) return
    set({ alleyCap: v })
    get()._saveDesignDebounced()
  },
  // Patch-merge into labels. Caller passes a partial like { size: 6 } or
  // { fill: '#ff8800', haloWidth: 2 }; missing keys keep their current value.
  setLabelStyle: (patch) => {
    if (!patch || typeof patch !== 'object') return
    set(s => ({ labels: { ...(s.labels || {}), ...patch } }))
    get()._saveDesignDebounced()
  },
  // D.5: Designer pushes the latest frontageEdges array here so the
  // Measure UI can resolve a clicked chain point → (blockKey, edgeOrd)
  // for per-block-edge customs authoring.
  _setV2FrontageEdges: (fes) => set({ _v2FrontageEdges: Array.isArray(fes) ? fes : [] }),
  _setProtoFrontageEdges: (fes) => set({ _protoFrontageEdges: Array.isArray(fes) ? fes : [] }),
  _setV2Caps: (caps) => set({ _v2Caps: Array.isArray(caps) ? caps : [] }),
  // Measure-mode setter. 'block' is the default; 'global' is the
  // whole-chain authoring mode (= edit chain.measure).
  setMeasureMode: (mode) => {
    const t = mode?.type === 'global' ? 'global' : 'block'
    set({ measureMode: { type: t } })
  },
  // W1: Write a per-block-edge measure override, keyed by the fe's
  // CHAIN-ANCHORED identity (skelId, side, segOrd) via feCustomKey — the
  // stable authored input, not the drift-prone derived (blockKey, edgeOrd).
  // The caller passes the fe it already resolved (findFeForSide); the store
  // is the SINGLE site that turns it into the storage key. The measure shape
  // mirrors chain.measure[side]: { terminal, treelawn, sidewalk, pavementHW }.
  setBlockEdgeCustom: (fe, measure) => {
    const k = feCustomKey(fe)
    if (!k || !measure) return
    const [skel, side] = k
    const next = { ...(get().blockCustoms || {}) }
    next[skel] = { ...(next[skel] || {}) }
    next[skel][side] = { ...(next[skel][side] || {}) }
    const kept = keepAuthorable(measure, [...get()._SURVEY_FE_FIELDS, ...get()._SECTION_FE_FIELDS])   // never a derived field
    for (const so of feSegOrds(fe, k)) next[skel][side][so] = { ...kept }
    set({ blockCustoms: next })
    get()._saveDesignDebounced()
  },
  // Batched per-fe custom write. entries: [{ fe, measure }].
  // One store mutation → one V2 rebuild regardless of fan-out size. This is
  // how a whole-chain edit lands: the chain SELECTS its fes, the write fans
  // per-fe through here — never to chain.measure (data-wall doctrine). Also
  // backs the symmetric mirror (two entries: dragged side + opposite fe).
  // Keyed by feCustomKey (skelId, side, segOrd) — one slot per fe.
  writeBlockEdgeCustoms: (entries) => {
    if (!Array.isArray(entries) || !entries.length) return
    const next = { ...(get().blockCustoms || {}) }
    let changed = false
    for (const { fe, measure } of entries) {
      const k = feCustomKey(fe)
      if (!k || !measure) continue
      const [skel, side] = k
      next[skel] = { ...(next[skel] || {}) }
      next[skel][side] = { ...(next[skel][side] || {}) }
      const kept = keepAuthorable(measure, [...get()._SURVEY_FE_FIELDS, ...get()._SECTION_FE_FIELDS])   // never a derived field
      for (const so of feSegOrds(fe, k)) next[skel][side][so] = { ...kept }   // fan (see feSegOrds)
      changed = true
    }
    if (!changed) return
    set({ blockCustoms: next })
    get()._saveDesignDebounced()
  },
  setBlockLandUse: (blockKey, lu) => {
    if (!blockKey) return
    const next = { ...(get().blockLandUse || {}) }
    if (lu == null) delete next[blockKey]
    else next[blockKey] = String(lu)
    set({ blockLandUse: next })
    get()._saveDesignDebounced()
  },
  clearBlockLandUse: () => {
    set({ blockLandUse: {} })
    get()._saveDesignDebounced()
  },
  // W1: chain-wide wipe in the chain-anchored (skelId, side, segOrd) shape.
  // Walks the published v2FrontageEdges for any fe whose chain identity
  // matches the given streetIdx (centerlineData order) and deletes the
  // matching blockCustoms entry via feCustomKey, pruning empty parents.
  clearBlockEdgeCustomsForChain: (streetIdx) => {
    const st = get().centerlineData?.streets?.[streetIdx]
    if (!st) return
    // Match MeasureOverlay/MeasurePanel: centerlineData carriageway
    // identity lives on .id (sometimes .skelId). Fall through both so
    // divided-road wipes hit every per-carriageway fe.
    const idKey = st.skelId || st.id || null
    const nameKey = st.name || null
    const fes = get()._v2FrontageEdges || []
    const cur = get().blockCustoms || {}
    const next = { ...cur }
    let changed = false
    for (const fe of fes) {
      const idMatches = idKey && fe.chainSkelId === idKey
      const nameMatches = !idKey && nameKey && fe.chainName === nameKey
      if (!idMatches && !nameMatches) continue
      const k = feCustomKey(fe)
      if (!k) continue
      const [skel, side] = k
      if (!next[skel]?.[side]) continue
      const segs = feSegOrds(fe, k)                              // fan-aware (see feSegOrds)
      if (!segs.some(seg => seg in next[skel][side])) continue
      next[skel] = { ...next[skel] }
      next[skel][side] = { ...next[skel][side] }
      for (const seg of segs) delete next[skel][side][seg]
      if (Object.keys(next[skel][side]).length === 0) delete next[skel][side]
      if (Object.keys(next[skel]).length === 0) delete next[skel]
      changed = true
    }
    if (!changed) return
    set({ blockCustoms: next })
    get()._saveDesignDebounced()
  },
  // ── REVERT (Survey/Section · Skeleton/Default) ────────────────────────────
  // Authoring overrides live in blockCustoms (per-fe — Survey owns pavementHW +
  // terminal; Section owns treelawn/sidewalk/materials) + the corner-radius maps
  // (Survey). Every drag autosaves, so there is no commit step — these are the
  // way back. Layers, matching the pipeline:
  //   • SKELETON  = zero of YOUR edits → the frame as delivered (surveyed widths,
  //     AASHTO radii). Survey only.
  //   • DEFAULT   = the blessed state. Survey: surveyDefault (Set Default). Section:
  //     the calculation re-seeds (gleaned treelawn + ADA) — clearing the override
  //     IS reverting to default, no snapshot needed.
  // Field-SCOPED so reverting Survey never wipes Section and vice-versa.
  _SURVEY_FE_FIELDS: ['pavementHW', 'terminal'],
  // ⭐ `capFlip` IS a Section field. It is authored in Measure (MeasureOverlay's
  // cap ⌃-click) and it INVERTS THE MATERIALS at the cap — `tileGround.js:1668`,
  // `capFlipped ? (m === 'LU' ? 'SW' : 'LU') : m`. It is a sidewalk↔treelawn swap
  // by another name, so it belongs to the same revert scope as `materials`.
  // ⛔ It was in NEITHER list until 2026-08-06, which meant NO revert path
  // anywhere cleared it: the operator flipped a cap, hit "Revert to Default",
  // the tool reported success, and the inversion silently survived. The scene
  // then claims to be at default and is not — the silent-substitution shape
  // `CLAUDE.md` Layer 0 q2 forbids, inside the one control whose entire promise
  // is "you are now at the calculated default". Measured on LS: 5 flipped caps
  // outliving a whole-scene revert, so every measurement ever taken of "the
  // default arrangement" on this scene was contaminated by up to 5 material
  // inversions — including the DEFAULT-FILL front's own diagnosis.
  // ⚠️ There is no PER-CAP revert gesture: ⌃-click on a cap IS the flip
  // (MeasureOverlay.jsx:796), so the manual way back is flipping twice. This
  // list governs the whole-scene revert, which is the path that was lying.
  // Guard: `node checks/claims-revert-field-coverage.mjs` fails if any authored
  // blockCustoms field is absent from BOTH lists (the class, not this instance).
  _SECTION_FE_FIELDS: ['treelawn', 'sidewalk', 'materials', 'capFlip'],
  // blockCustoms with `fields` stripped from every fe slot (empty slots pruned).
  _blockCustomsStripped: (fields) => {
    const cur = get().blockCustoms || {}
    const next = {}
    for (const skel of Object.keys(cur)) for (const side of Object.keys(cur[skel])) for (const seg of Object.keys(cur[skel][side])) {
      const kept = { ...cur[skel][side][seg] }
      for (const f of fields) delete kept[f]
      if (Object.keys(kept).length) { (next[skel] ||= {})[side] ||= {}; next[skel][side][seg] = kept }
    }
    return next
  },
  // blockCustoms with `fields` restored from surveyDefault (live values of those
  // fields dropped, the blessed default's re-applied; other fields untouched).
  _blockCustomsFieldsFromDefault: (fields) => {
    const next = get()._blockCustomsStripped(fields)
    const base = get().surveyDefault?.blockCustoms || {}
    for (const skel of Object.keys(base)) for (const side of Object.keys(base[skel])) for (const seg of Object.keys(base[skel][side])) {
      const m = base[skel][side][seg], add = {}
      for (const f of fields) if (m[f] !== undefined) add[f] = m[f]
      if (!Object.keys(add).length) continue
      ;(next[skel] ||= {})[side] ||= {}; next[skel][side][seg] = { ...(next[skel][side][seg] || {}), ...add }
    }
    return next
  },
  // Bless the current Survey state as the Default (persisted).
  setSurveyDefault: () => {
    const s = get()
    set({ surveyDefault: {
      blockCustoms: JSON.parse(JSON.stringify(s.blockCustoms || {})),
      cornerRadiusOverrides: { ...(s.cornerRadiusOverrides || {}) },
      cornerCornerRadiusOverrides: { ...(s.cornerCornerRadiusOverrides || {}) },
      cornerRadiusScale: Number.isFinite(s.cornerRadiusScale) ? s.cornerRadiusScale : 1,
    } })
    get()._saveDesignDebounced()
  },
  hasSurveyDefault: () => !!get().surveyDefault,
  // SURVEY · Revert to Skeleton — clear EVERY Survey edit → the frame as delivered
  // (surveyed widths + AASHTO radii). Survey edits live in TWO places: blockCustoms
  // (per-block mode) AND the chain measure / segmentMeasures on centerlineData
  // (global mode → overlay). Both must clear. No
  // rebake — Survey re-renders live off centerlineData.
  revertSurveyToSkeleton: () => {
    const cd = get().centerlineData
    const streets = (cd?.streets || []).map(s => (s.measure || s.segmentMeasures) ? { ...s, measure: undefined, segmentMeasures: undefined } : s)
    set({
      blockCustoms: get()._blockCustomsStripped(get()._SURVEY_FE_FIELDS),
      cornerRadiusOverrides: {}, cornerCornerRadiusOverrides: {}, cornerRadiusScale: 1,
      ...(cd ? { centerlineData: { ...cd, streets } } : {}),
    })
    get()._saveDesignDebounced()
    get()._saveOverlay()   // persist the cleared chain measures
  },
  // SURVEY · Revert to Default — restore the blessed surveyDefault (Survey fields only).
  revertSurveyToDefault: () => {
    const b = get().surveyDefault; if (!b) return
    set({ blockCustoms: get()._blockCustomsFieldsFromDefault(get()._SURVEY_FE_FIELDS), cornerRadiusOverrides: { ...b.cornerRadiusOverrides }, cornerCornerRadiusOverrides: get()._cornerMapWith(get()._CORNER_SURVEY_FIELDS, b.cornerCornerRadiusOverrides), cornerRadiusScale: b.cornerRadiusScale })
    get()._saveDesignDebounced()
  },
  // SECTION · Revert to Default — clear the ped overrides → the calculation re-seeds.
  revertSectionToDefault: () => {
    set({ blockCustoms: get()._blockCustomsStripped(get()._SECTION_FE_FIELDS), cornerCornerRadiusOverrides: get()._cornerMapWith(get()._CORNER_SECTION_FIELDS) })
    get()._saveDesignDebounced()
  },
  // ── per-element revert to Default (⌃-click a handle) ──────────────────────
  // One fe's Survey fields → surveyDefault's value (or cleared → surveyed if the
  // default has none for this fe). Section variant just clears → recalc.
  _revertFeFields: (fe, fields, fromDefault) => {
    const k = feCustomKey(fe); if (!k) return
    const [skel, side] = k
    const cur = get().blockCustoms || {}
    const next = { ...cur }
    next[skel] = { ...(next[skel] || {}) }; next[skel][side] = { ...(next[skel][side] || {}) }
    for (const seg of feSegOrds(fe, k)) {                        // fan-aware (see feSegOrds)
      const def = fromDefault ? (get().surveyDefault?.blockCustoms?.[skel]?.[side]?.[seg] || null) : null
      const slot = { ...(next[skel][side][seg] || {}) }
      for (const f of fields) { delete slot[f]; if (def && def[f] !== undefined) slot[f] = def[f] }
      if (Object.keys(slot).length) next[skel][side][seg] = slot
      else delete next[skel][side][seg]
    }
    if (next[skel][side] && !Object.keys(next[skel][side]).length) delete next[skel][side]
    if (next[skel] && !Object.keys(next[skel]).length) delete next[skel]
    set({ blockCustoms: next }); get()._saveDesignDebounced()
  },
  revertFeSurveyToDefault: (fe) => get()._revertFeFields(fe, get()._SURVEY_FE_FIELDS, true),
  revertFeSectionToDefault: (fe) => get()._revertFeFields(fe, get()._SECTION_FE_FIELDS, false),
  // Corner → surveyDefault's radius (or cleared → AASHTO). Reuses the setters.
  revertIxToDefault: (point) => { const d = get().surveyDefault?.cornerRadiusOverrides?.[get().ixPointKey(point)]; get().setIxCornerRadius(point, d != null ? d : null) },
  // the corner's WHOLE entry (radius and existence) back to the blessed Default
  // the corner's SURVEY fields (radius, existence) back to the blessed Default; its curb-cut style is Section's and stays
  revertCornerToDefault: (point, legKeyA, legKeyB) => { const key = get().cornerKey(point, legKeyA, legKeyB), d = get().surveyDefault?.cornerCornerRadiusOverrides?.[key]
    const asObj = (v) => v == null ? {} : (typeof v === 'object' ? v : { r: v })
    get()._writeCornerEntry(key, { r: asObj(d).r ?? null, corner: asObj(d).corner ?? null }) },
  // Counts for button enable/label (how much there is to revert).
  surveyOverrideCount: () => {
    const bc = get().blockCustoms || {}; let n = 0
    for (const skel of Object.keys(bc)) for (const side of Object.keys(bc[skel])) for (const seg of Object.keys(bc[skel][side])) {
      const m = bc[skel][side][seg]; if (get()._SURVEY_FE_FIELDS.some(f => m[f] !== undefined)) n++
    }
    n += Object.keys(get().cornerRadiusOverrides || {}).length + Object.values(get().cornerCornerRadiusOverrides || {}).filter(v => v != null && (typeof v !== 'object' || v.r != null || v.corner != null)).length
    // global-mode width edits live on the chain measure (centerlineData → overlay),
    // not blockCustoms — count them too so Revert to Skeleton enables.
    n += (get().centerlineData?.streets || []).filter(s => s.measure || s.segmentMeasures).length
    return n
  },
  sectionOverrideCount: () => {
    const bc = get().blockCustoms || {}; let n = 0
    for (const skel of Object.keys(bc)) for (const side of Object.keys(bc[skel])) for (const seg of Object.keys(bc[skel][side])) {
      const m = bc[skel][side][seg]; if (get()._SECTION_FE_FIELDS.some(f => m[f] !== undefined)) n++
    }
    for (const v of Object.values(get().cornerCornerRadiusOverrides || {})) if (v != null && typeof v === 'object' && v.cut != null) n++
    return n
  },
  // Look-level corner-radius multiplier. Clamp at 0 (square) and a
  // generous upper bound to keep the slider sane.
  setCornerRadiusScale: (v) => {
    // Cap matches the per-IX setter cap (50m) divided by the residential
    // baseline (4.5m) so the global slider's range matches what an operator
    // can author with a per-IX center handle.
    const n = Math.max(0, Math.min(11, Number(v) || 0))
    // Slider preserves authored overrides. Render-time R = override × scale,
    // so authored values participate in the global multiplier without being
    // wiped when the operator dials the slider. Operator workflow: author
    // per-IX / per-corner radii to taste, "Save as 1×" to freeze that as
    // the baseline, then dial the slider for global variations from that
    // baseline. With no baseline saved and no overrides, the slider acts
    // on AASHTO/data-table defaults (the original pre-baseline behavior).
    set({ cornerRadiusScale: n })
    get()._saveDesignDebounced()
  },
  // Transient UI toggle — drives whether CornerEditHandles render.
  setCornerEditMode: (on) => set({ cornerEditMode: !!on }),
  // Quantize a [x,z] point to a stable string key. 3 decimal places (mm
  // precision) is plenty — IX points come from derive's deterministic
  // clustering so they don't drift between runs.
  // Exposed on the store so Designer code, geometry, and bake all use one
  // canonical key form.
  ixPointKey: (point) => {
    if (!point || point.length < 2) return ''
    return `${(+point[0]).toFixed(3)},${(+point[1]).toFixed(3)}`
  },
  // Write a per-IX corner-radius override. Pass null/undefined for r to
  // remove the override (revert that IX to its data-file / default value).
  // IX commit RESETS per-corner overrides at this IX — operator's mental
  // model: dragging the IX center handle "homogenizes" the IX to a single
  // radius, clobbering any per-corner detail at that IX. Per-corner work
  // on OTHER IXs is preserved.
  setIxCornerRadius: (point, r) => {
    const key = get().ixPointKey(point)
    if (!key) return
    const ixPrefix = key + '|'
    set(s => {
      const nextIx = { ...s.cornerRadiusOverrides }
      if (r == null || !Number.isFinite(r)) {
        delete nextIx[key]
      } else {
        nextIx[key] = Math.max(0, Math.min(50, +r))   // clamp to sane meters
      }
      // Drop per-corner overrides whose key starts with this IX's pointKey.
      const nextCorner = {}
      for (const [k, v] of Object.entries(s.cornerCornerRadiusOverrides || {})) {
        if (!k.startsWith(ixPrefix)) nextCorner[k] = v
      }
      return { cornerRadiusOverrides: nextIx, cornerCornerRadiusOverrides: nextCorner }
    })
    get()._saveDesignDebounced()
  },
  // Revert corners to default — wipes per-IX + per-corner overrides AND
  // resets the global scale to 1. With overrides empty and scale=1, every
  // corner renders at its AASHTO/data-table default (cornerRadiusFor
  // keyed on highway class). Operator's "back to a clean slate" action.
  clearAllIxCornerRadii: () => {
    set({
      cornerRadiusScale: 1,
      cornerRadiusOverrides: {},
      cornerCornerRadiusOverrides: get()._cornerMapWith(get()._CORNER_SURVEY_FIELDS),   // Section's curb-cut styles stay
    })
    get()._saveDesignDebounced()
  },
  // Stable identifier for one leg of an IX. dir = 'b' (back from V toward
  // the previous chain vertex) or 'f' (forward toward the next). Pair this
  // with chain.skelId (or chain.name as fallback) and you get a leg
  // identity that survives chain reroute / vertex re-splice as long as
  // the leg itself still exists.
  legKey: (skelOrName, dir) => `${skelOrName || '?'}:${dir === -1 || dir === 'b' ? 'b' : 'f'}`,
  // Composite key for one corner = (IX point, two leg keys). The leg keys
  // are sorted alphabetically so authoring is invariant under A/B swap.
  cornerKey: (point, legKeyA, legKeyB) => {
    const pk = `${(+point[0]).toFixed(3)},${(+point[1]).toFixed(3)}`
    const [a, b] = (legKeyA <= legKeyB) ? [legKeyA, legKeyB] : [legKeyB, legKeyA]
    return `${pk}|${a}|${b}`
  },
  // One corner's entry is a radius (a number) or `{ r?, corner? }` — the corner's existence rides the same entry
  // (Jacob, 2026-10-07: Survey owns whether a corner is one). Writing one part keeps the other; an empty entry is removed.
  _writeCornerEntry: (key, patch) => {
    set(s => {
      const next = { ...s.cornerCornerRadiusOverrides }, cur = next[key]
      const e = { ...(cur != null && typeof cur === 'object' ? cur : (cur != null ? { r: cur } : {})), ...patch }
      for (const k of Object.keys(e)) if (e[k] == null) delete e[k]
      if (!Object.keys(e).length) delete next[key]
      else next[key] = Object.keys(e).length === 1 && 'r' in e ? e.r : e      // a bare radius stays a number
      return { cornerCornerRadiusOverrides: next }
    })
    get()._saveDesignDebounced()
  },
  // Write a per-corner radius. Pass null/undefined for r to clear it (the corner's flag, if any, stays).
  setCornerCornerRadius: (point, legKeyA, legKeyB, r) => {
    const key = get().cornerKey(point, legKeyA, legKeyB)
    if (!key) return
    get()._writeCornerEntry(key, { r: (r == null || !Number.isFinite(r)) ? null : Math.max(0, Math.min(50, +r)) })
  },
  // Say whether this arc IS a corner: false = not a corner (the walk and lawn run through), true = a corner here (a
  // bend's pad), null = the default (junction yes, bend no). Survey's corner handle writes it.
  setCornerExists: (point, legKeyA, legKeyB, corner) => {
    const key = get().cornerKey(point, legKeyA, legKeyB)
    if (!key) return
    get()._writeCornerEntry(key, { corner: typeof corner === 'boolean' ? corner : null })
  },
  // A category's colour — its neon and its Ward chips (src/lib/categoryColor.js), chosen in the Identity panel. Stored
  // where it always was, materialColors.neon_<category>; `null` un-chooses it (the kit's neutral hue shows).
  setCategoryNeon: (category, hex) => {
    if (hex != null && !/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`neon_${category} = ${JSON.stringify(hex)} — must be '#rrggbb'`)
    if (hex != null) assertHardPolicy({ materialColors: { [`neon_${category}`]: hex } }, 'Identity')   // its chip ≥ 3:1
    set(s => {
      const next = { ...s.materialColors }
      if (hex == null) delete next[`neon_${category}`]
      else next[`neon_${category}`] = hex
      return { materialColors: next }
    })
    get()._saveDesignDebounced()
  },
  setMaterialColor: (id, color) => {
    set(s => ({ materialColors: { ...s.materialColors, [id]: color } }))
    get()._saveDesignDebounced()
  },
  // Patch is a partial { roughness?, metalness?, texture?, textureScale?,
  // textureStrength?, emissive?, emissiveIntensity? }. Values merge over
  // existing per-id record. Missing fields fall back to MATERIAL_PHYSICS_DEFAULTS
  // at read time.
  setMaterialPhysics: (id, patch) => {
    set(s => ({
      materialPhysics: {
        ...s.materialPhysics,
        [id]: { ...(s.materialPhysics[id] || {}), ...patch },
      },
    }))
    get()._saveDesignDebounced()
  },
  resetMaterialPhysics: (id) => {
    set(s => {
      const next = { ...s.materialPhysics }
      delete next[id]
      return { materialPhysics: next }
    })
    get()._saveDesignDebounced()
  },
  setBuildingPaletteEntry: (index, color) => {
    set(s => {
      const next = s.buildingPalette.slice()
      next[index] = color
      return { buildingPalette: next }
    })
    get()._saveDesignDebounced()
  },
  resetBuildingPalette: () => {
    set({ buildingPalette: [
      '#dcdcdc', '#a0522d', '#cd853f', '#8b2500',
      '#d2b48c', '#778899', '#8b4513', '#a52a2a',
      '#f5deb3', '#696969', '#b22222', '#808080',
    ] })
    get()._saveDesignDebounced()
  },
  // ── Lamp Glow group actions ─────────────────────────────────
  // Write one channel's value (grass | trees | pool).
  //   • Flat: writes lampGlow.values[channel].
  //   • Animated: writes lampGlow.values[playheadSlot][channel]. Playhead
  //     slot = whatever named TOD slot the playhead is sitting on within
  //     tolerance. Silently no-ops if the playhead isn't on an attached
  //     slot — UI also gates this.
  setLampGlow: (channel, value) => {
    set(s => {
      // Stamped before the edit, so a radius written now (0 = off) is never read under the old scale.
      const lg = stampLampGlowRadius(activeChannel(s, 'lampGlow') || { values: {} })
      if (!lg.animated) {
        return channelPatch(s, 'lampGlow', { ...lg, values: { ...(lg.values || {}), [channel]: value } })
      }
      const tod = useTimeOfDay.getState()
      const minute = tod.getMinuteOfDay()
      const sid = todSlotAtMinute(minute, tod.currentTime)
      if (!sid || !(sid in (lg.values || {}))) return s
      const triple = { ...(lg.values[sid] || {}), [channel]: value }
      return channelPatch(s, 'lampGlow', { ...lg, values: { ...lg.values, [sid]: triple } })
    })
    get()._saveDesignDebounced()
  },
  // Turn on group animation. The operator must already be parked on a
  // named TOD slot (UI gates the entry). Seeds that slot with the current
  // flat triple so the visual doesn't change.
  animateLampGlow: (slotId) => {
    if (!slotId || !NAMED_TOD_SLOTS_BY_ID[slotId]) return
    set(s => {
      const lg = activeChannel(s, 'lampGlow')
      if (lg?.animated) return s
      const triple = {
        grass: Number(lg?.values?.grass) || 0,
        trees: Number(lg?.values?.trees) || 0,
        pool:  lg?.values?.pool == null ? 1.0 : Number(lg.values.pool),
      }
      return channelPatch(s, 'lampGlow', {
        animated: 'tod',
        transitionIn: 30,
        transitionOut: 30,
        values: { [slotId]: triple },
      })
    })
    get()._saveDesignDebounced()
  },
  // Collapse animation back to flat. Uses the playhead slot's triple if
  // the playhead is on an attached slot; otherwise the first authored
  // slot's triple.
  unanimateLampGlow: () => {
    set(s => {
      const lg = activeChannel(s, 'lampGlow')
      if (!lg?.animated) return s
      const tod = useTimeOfDay.getState()
      const phId = todSlotAtMinute(tod.getMinuteOfDay(), tod.currentTime)
      const slotIds = Object.keys(lg.values || {})
      const useId = phId && slotIds.includes(phId) ? phId : slotIds[0]
      const triple = useId ? lg.values[useId] : { grass: 0, trees: 0, pool: 1.0 }
      return channelPatch(s, 'lampGlow', { values: { ...triple } })
    })
    get()._saveDesignDebounced()
  },
  // Attach lampGlow to a named TOD slot. Seeds it from the envelope-
  // resolved value at that slot's minute so adding is a visual no-op.
  // Caller must already have the playhead parked on the slot (UI gates).
  addLampGlowSlot: (slotId) => {
    if (!slotId || !NAMED_TOD_SLOTS_BY_ID[slotId]) return
    const slotMinutes = getTodSlotMinutes(useTimeOfDay.getState().currentTime)
    const minute = slotMinutes[slotId]
    if (minute == null) return
    set(s => {
      const lg = activeChannel(s, 'lampGlow')
      if (!lg?.animated) return s
      if (slotId in (lg.values || {})) return s
      const seed = resolveLampGlowAtMinute(lg, minute, slotMinutes)
      return channelPatch(s, 'lampGlow', { ...lg, values: { ...lg.values, [slotId]: seed } })
    })
    get()._saveDesignDebounced()
  },
  removeLampGlowSlot: (slotId) => {
    set(s => {
      const lg = activeChannel(s, 'lampGlow')
      if (!lg?.animated || !(slotId in (lg.values || {}))) return s
      const values = { ...lg.values }
      const removedTriple = values[slotId]
      delete values[slotId]
      // If lampGlow now has 0 authored slots, collapse to flat using the
      // removed slot's triple as the new flat values (preserves visual at
      // moment of removal).
      const lampGlow = Object.keys(values).length === 0
        ? { values: { ...removedTriple } }
        : { ...lg, values }
      return channelPatch(s, 'lampGlow', lampGlow)
    })
    get()._saveDesignDebounced()
  },
  setLampGlowTransition: (slotId, fade, minutes) => {
    set(s => {
      const lg = activeChannel(s, 'lampGlow')
      if (!lg?.animated) return s
      return channelPatch(s, 'lampGlow', todEdgePatch(lg, slotId, fade, minutes))
    })
    get()._saveDesignDebounced()
  },
  revertLampGlow: () => {
    set(s => channelRevert(s, 'lampGlow', kitDayChannel('lampGlow')))
    get()._saveDesignDebounced()
  },
  // ── Group-channel action factory ────────────────────────────
  // Generates the 6 standard actions any group-shape TOD channel needs
  // (set / animate / unanimate / addSlot / removeSlot / setTransition).
  // Action names follow set<Cap> / animate<Cap> / unanimate<Cap> /
  // add<Cap>Slot / remove<Cap>Slot / set<Cap>Transition. Spread the
  // returned object into the store body. LampGlow's hand-written actions
  // remain (proven, no benefit to disturbing); new channels go through
  // this factory.
  ...createGroupChannelActions({
    name: 'bloom',
    fieldKeys: BLOOM_FIELD_KEYS,
    flatDefaults: BLOOM_FLAT_DEFAULTS,
  }, set, get),
  ...createGroupChannelActions({
    name: 'warmth',
    fieldKeys: WARMTH_FIELD_KEYS,
    flatDefaults: WARMTH_FLAT_DEFAULTS,
  }, set, get),
  ...createGroupChannelActions({
    name: 'fill',
    fieldKeys: FILL_FIELD_KEYS,
    flatDefaults: FILL_FLAT_DEFAULTS,
  }, set, get),
  ...createGroupChannelActions({
    name: 'exposure',
    fieldKeys: EXPOSURE_FIELD_KEYS,
    flatDefaults: EXPOSURE_FLAT_DEFAULTS,
  }, set, get),
  ...createGroupChannelActions({
    name: 'ao',
    fieldKeys: AO_FIELD_KEYS,
    flatDefaults: AO_FLAT_DEFAULTS,
  }, set, get),
  ...createGroupChannelActions({
    name: 'mist',
    fieldKeys: MIST_FIELD_KEYS,
    flatDefaults: MIST_FLAT_DEFAULTS,
  }, set, get),
  ...createGroupChannelActions({
    name: 'edgeRuffle',
    fieldKeys: EDGE_RUFFLE_FIELD_KEYS,
    flatDefaults: EDGE_RUFFLE_FLAT_DEFAULTS,
  }, set, get),
  ...createGroupChannelActions({
    name: 'halo',
    fieldKeys: HALO_FIELD_KEYS,
    flatDefaults: HALO_FLAT_DEFAULTS,
  }, set, get),
  ...createGroupChannelActions({
    name: 'skyGain',
    fieldKeys: SKY_GAIN_FIELD_KEYS,
    flatDefaults: SKY_GAIN_FLAT_DEFAULTS,
  }, set, get),
  ...createGroupChannelActions({
    name: 'stars',
    fieldKeys: STARS_FIELD_KEYS,
    flatDefaults: STARS_FLAT_DEFAULTS,
  }, set, get),
  ...createGroupChannelActions({
    name: 'grade',
    fieldKeys: GRADE_FIELD_KEYS,
    flatDefaults: GRADE_FLAT_DEFAULTS,
  }, set, get),
  ...createGroupChannelActions({
    name: 'grain',
    fieldKeys: GRAIN_FIELD_KEYS,
    flatDefaults: GRAIN_FLAT_DEFAULTS,
  }, set, get),
  ...createGroupChannelActions({
    name: 'shadow',
    fieldKeys: SHADOW_FIELD_KEYS,
    flatDefaults: SHADOW_FLAT_DEFAULTS,
  }, set, get),
  ...createGroupChannelActions({
    name: 'canopy',
    fieldKeys: CANOPY_FIELD_KEYS,
    flatDefaults: CANOPY_FLAT_DEFAULTS,
  }, set, get),
  ...createGroupChannelActions({
    name: 'browseHeading',
    fieldKeys: BROWSE_HEADING_FIELD_KEYS,
    flatDefaults: BROWSE_HEADING_FLAT_DEFAULTS,
  }, set, get),
  ...createGroupChannelActions({
    name: 'arch',
    fieldKeys: ARCH_FIELD_KEYS,
    flatDefaults: ARCH_FLAT_DEFAULTS,
  }, set, get),
  ...createGroupChannelActions({
    name: 'landscape',
    fieldKeys: LANDSCAPE_FIELD_KEYS,
    flatDefaults: LANDSCAPE_FLAT_DEFAULTS,
  }, set, get),
  ...createGroupChannelActions({
    name: 'archLight',
    fieldKeys: ARCHLIGHT_FIELD_KEYS,
    flatDefaults: ARCHLIGHT_FLAT_DEFAULTS,
  }, set, get),
  ...createGroupChannelActions({
    name: 'setPieceLight',
    fieldKeys: ARCHLIGHT_FIELD_KEYS,
    flatDefaults: ARCHLIGHT_FLAT_DEFAULTS,
  }, set, get),
  ...createGroupChannelActions({
    name: 'lantern',
    fieldKeys: LANTERN_FIELD_KEYS,
    flatDefaults: LANTERN_FLAT_DEFAULTS,
  }, set, get),

  // SC.6 — clouds hand-rolled actions. Values aren't flat scalars
  // (preset is a string, overrides is null|object) so the
  // createGroupChannelActions factory doesn't fit. No TOD animation —
  // preset selection is either authored (override) or weather-driven
  // (Almanac at runtime). v1 has no UI; these actions exist so a future
  // Stage Clouds row plugs in without further wiring.
  setClouds: (patch) => {
    set(s => channelPatch(s, 'clouds', {
      values: { ...(activeChannel(s, 'clouds')?.values || CLOUDS_FLAT_DEFAULTS), ...(patch || {}) }
    }))
    get()._saveDesignDebounced()
  },
  revertClouds: () => {
    set(s => channelRevert(s, 'clouds', { values: { ...CLOUDS_FLAT_DEFAULTS } }))
    get()._saveDesignDebounced()
  },

  // SC.5 — `shots` hand-rolled actions. Values are nested per-shot
  // objects so the createGroupChannelActions flat-scalar factory doesn't
  // fit. Shots is not TOD-animated (FOV doesn't change through the day),
  // so we only need set + revert; no animate / addSlot / etc.
  setShots: (patch) => {
    set(s => {
      const cur = s.shots?.values || {}
      // Shallow-merge each shot's tuple, so {browse: {fov: 50}} keeps browse.padding. Written by Stage's Camera
      // card (Browse FOV · Street FOV and Eye Height).
      const next = { ...cur }
      for (const k of Object.keys(patch || {})) next[k] = { ...(cur[k] || {}), ...(patch[k] || {}) }
      return { shots: { values: next } }
    })
    get()._saveDesignDebounced()
  },
  revertShots: () => {
    set({ shots: { values: JSON.parse(JSON.stringify(SHOTS_FLAT_DEFAULTS)) } })
    get()._saveDesignDebounced()
  },

  // The authored Browse frame — what the town opens on in playback (src/camera/browseFrame.js). Written only by the
  // Camera card's "Set as Browse frame" (Jacob, 2026-10-04); where the operator pans is the working view, not this.
  setBrowseFrame: (center, altitude) => {
    set({ browseFrame: { center: [center[0], center[1]], altitude } })
    get()._saveDesignDebounced()
  },
  clearBrowseFrame: () => {
    set({ browseFrame: null })
    get()._saveDesignDebounced()
  },
  ...createGroupChannelActions({
    name: 'dof',
    fieldKeys: DOF_FIELD_KEYS,
    flatDefaults: DOF_FLAT_DEFAULTS,
  }, set, get),
  ...createGroupChannelActions({
    name: 'constellations',
    fieldKeys: CONSTELLATIONS_FIELD_KEYS,
    flatDefaults: CONSTELLATIONS_FLAT_DEFAULTS,
  }, set, get),
  ...createGroupChannelActions({
    name: 'milkyWay',
    fieldKeys: MILKYWAY_FIELD_KEYS,
    flatDefaults: MILKYWAY_FLAT_DEFAULTS,
  }, set, get),
  ...createGroupChannelActions({
    name: 'neon',
    fieldKeys: NEON_FIELD_KEYS,
    flatDefaults: NEON_FLAT_DEFAULTS,
  }, set, get),
  // Stage-only QA toggle. Intentionally does NOT call
  // _saveDesignDebounced — see initial-state comment on neonForceOn.
  setNeonForceOn: (on) => { set({ neonForceOn: !!on }) },
  setNeonDensity: (d) => { set({ neonDensity: Math.min(1, Math.max(0, Number(d) || 0)) }) },
  // Session-only, no _saveDesignDebounced (see weatherMode).
  setWeatherMode: (mode) => { set({ weatherMode: mode }); try { sessionStorage.setItem('stage-weather', mode) } catch { /* storage blocked */ } },
  ...createGroupChannelActions({
    name: 'ambient',
    fieldKeys: AMBIENT_FIELD_KEYS,
    flatDefaults: AMBIENT_FLAT_DEFAULTS,
  }, set, get),
  ...createGroupChannelActions({
    name: 'hemi',
    fieldKeys: HEMI_FIELD_KEYS,
    flatDefaults: HEMI_FLAT_DEFAULTS,
  }, set, get),
  ...createGroupChannelActions({
    name: 'dirSun',
    fieldKeys: DIRSUN_FIELD_KEYS,
    flatDefaults: DIRSUN_FLAT_DEFAULTS,
  }, set, get),
  ...createGroupChannelActions({
    name: 'dirMoon',
    fieldKeys: DIRMOON_FIELD_KEYS,
    flatDefaults: DIRMOON_FLAT_DEFAULTS,
  }, set, get),

  // Sky overrides — paint a single (hour, band) cell on top of the
  // procedural-canon mosaic. The override resolver in skyGrid.js bleeds
  // each override across its king-move neighborhood (d=1 at 50%) and ramps
  // 15 min on either side of the override hour.
  //   hour:  integer 0..23 (clock hour)
  //   band:  'horizon' | 'low' | 'mid' | 'high' | 'sunGlow'
  //   hex:   '#rrggbb'
  // Replaces any existing override at (hour, band).
  addSkyOverride: (hour, band, hex) => {
    if (typeof hour !== 'number' || hour < 0 || hour >= SKY_HOURS) return
    if (!SKY_BANDS.includes(band)) return
    if (typeof hex !== 'string') return
    set(s => {
      const sky = activeChannel(s, 'sky') || { overrides: [] }
      const existing = Array.isArray(sky.overrides) ? sky.overrides : []
      const filtered = existing.filter(o => !(o.hour === hour && o.band === band))
      filtered.push({ hour, band, hex })
      return channelPatch(s, 'sky', { ...sky, overrides: filtered })
    })
    get()._saveDesignDebounced()
  },
  removeSkyOverride: (hour, band) => {
    set(s => {
      const sky = activeChannel(s, 'sky') || { overrides: [] }
      const existing = Array.isArray(sky.overrides) ? sky.overrides : []
      const filtered = existing.filter(o => !(o.hour === hour && o.band === band))
      return channelPatch(s, 'sky', { ...sky, overrides: filtered })
    })
    get()._saveDesignDebounced()
  },
  // Clear every override; sky reverts to pure procedural-canon mosaic — in the active shot too. (channelRevert
  // would drop a Browse/Street fork instead, and the shot would then show Hero's overrides: not what ↺ says.)
  revertSky: () => {
    set(s => channelPatch(s, 'sky', { ...(activeChannel(s, 'sky') || {}), overrides: [] }))
    get()._saveDesignDebounced()
  },

  // ── Channel-variant cascade — "Reset to Hero" ──────────────────────────────
  // Drop ALL of a shot's recorded overrides at once → the shot follows base
  // (Hero) again for every channel. (Per-channel revert lives on each channel's
  // header via channelRevert; this is the shot-level clear behind the "Reset to
  // Hero" button that appears once a shot has any override.) Overrides are
  // recorded implicitly on edit — there is no explicit "fork" action.
  resetShotToBase: (shotKey) => {
    set(s => {
      if (!s.shotLooks?.[shotKey]) return s
      const next = { ...s.shotLooks }
      delete next[shotKey]
      return { shotLooks: next }
    })
    get()._saveDesignDebounced()
  },
  // Scrub the TOD clock onto a named slot's SunCalc-computed minute. Used
  // when the operator clicks an attached chip to "park" there — really
  // just a clock scrub; the playhead's position is the only park state.
  scrubToTodSlot: (id) => {
    if (!id) return
    const m = getTodSlotMinutes(useTimeOfDay.getState().currentTime)[id]
    if (m != null) useTimeOfDay.getState().setMinuteOfDay(m)
  },
  // Designate (or clear) the Hero subject. Pass null to clear.
  // subject = { kind: 'building'|'landmark'|'arch', id: string }
  setHeroSubject: (subject) => {
    set({ heroSubject: subject || null })
    get()._saveDesignDebounced()
  },
  setHeroKeyframes: (keyframes) => {
    set({ heroKeyframes: keyframes })
    get()._saveDesignDebounced()
  },
  // Keys + motion in ONE write, for an edit that changes both (the Loop toggle
  // redistributes the keys' times): the runtime refuses a shot whose last key
  // disagrees with its mode, so the two must never be seen apart.
  setHeroShot: (keyframes, patch) => {
    set(s => ({ heroKeyframes: keyframes, heroMotion: { ...s.heroMotion, ...patch } }))
    get()._saveDesignDebounced()
  },
  // Patch motion partial — { length?, mode? }. preview/speed are not stored.
  setHeroMotion: (patch) => {
    set(s => ({ heroMotion: { ...s.heroMotion, ...patch } }))
    get()._saveDesignDebounced()
  },
  setLayerVis: (id, visible) => {
    set(s => ({ layerVis: { ...s.layerVis, [id]: !!visible }, bakeStale: true }))
    get()._saveDesignDebounced()
  },
  toggleLayerVis: (id) => {
    set(s => ({
      layerVis: { ...s.layerVis, [id]: s.layerVis[id] === false },
      bakeStale: true,
    }))
    get()._saveDesignDebounced()
  },
  // Bulk visibility update — used by Section header "all on / all off".
  setLayersVis: (ids, visible) => {
    const v = !!visible
    set(s => {
      const next = { ...s.layerVis }
      for (const id of ids) next[id] = v
      return { layerVis: next, bakeStale: true }
    })
    get()._saveDesignDebounced()
  },
  setLayerStroke: (id, patch) => {
    set(s => ({
      layerStrokes: { ...s.layerStrokes, [id]: { ...s.layerStrokes[id], ...patch } },
    }))
    get()._saveDesignDebounced()
  },
  setOpenSections: (next) => {
    set(s => ({ openSections: typeof next === 'function' ? next(s.openSections) : { ...s.openSections, ...next } }))
    get()._saveDesignDebounced()
  },

  // Engineering visibility — Designer-only, session-ephemeral. NOT in
  // design.json, NOT per-Look. Used while doing Survey / Measure / aerial
  // alignment work to temporarily declutter the canvas (e.g., hide buildings
  // to verify their footprints against the aerial). Resets on reload.
  // Effective hidden layers in Designer = layerVis(false) ∪ engineeringHidden.
  // Stage ignores this map entirely.
  engineeringHidden: {},
  toggleEngineeringHidden: (id) => {
    set(s => ({ engineeringHidden: { ...s.engineeringHidden, [id]: !s.engineeringHidden[id] } }))
  },
  setEngineeringHiddenSection: (ids, hidden) => {
    set(s => {
      const next = { ...s.engineeringHidden }
      for (const id of ids) next[id] = !!hidden
      return { engineeringHidden: next }
    })
  },
  clearEngineeringHidden: () => set({ engineeringHidden: {} }),

  // ── Map visibility (global, crosses all modes) ────────────
  // Both fills and aerial are orientation toggles, not styling — they live
  // in the toolbar alongside each other, not in the design panel.
  fillsVisible: true,
  toggleFills: () => set(s => ({ fillsVisible: !s.fillsVisible })),

  // Background view: aerialVisible=false → curated SVG cartograph,
  // aerialVisible=true → aerial photo. Same in pure Design and in tools.
  // Ribbons + tool affordances always render on top of either background.
  // AerialTiles stays mounted regardless so tiles preload in the
  // background; this flag only gates render.
  aerialVisible: false,
  toggleAerial: () => set(s => ({ aerialVisible: !s.aerialVisible })),
  setAerialVisible: (v) => set({ aerialVisible: !!v }),

  // ── Looks ────────────────────────────────────────────────
  // A Look is a styling snapshot — `{ layerColors, luColors, layerStrokes, … }`
  // plus the per-Look bake bundle (public/baked/<id>/ground.json + bin +
  // lightmap + buildings + lamps + scene). `lafayette-square` is the project's 0-state
  // and can't be deleted; user-created Looks ('Valentines', 'Cardinals Win',
  // …) sit alongside it. The active Look's design block is what Designer's
  // panel binds to — autosave goes to `/looks/<id>/design`, not /overlay.
  // Geometry (centerlines, measures, caps, couplers) stays in overlay.json
  // and is shared across every Look — Looks vary styling, not shape.
  looks: [],
  // Provisional until _loadLooks resolves the address against the index: the URL's Look, else the remembered one.
  activeLookId: (({ url, stored }) => url.look || stored.look)(readAddress()),
  // The served 0-state Look id (index.json `default`). null until _loadLooks.
  defaultLookId: null,
  // Set when a ?look= link was refused (it names no Look, or disagrees with ?scene=): no town is resolved, and
  // nothing may quietly resolve one (Toolbar's self-correction stands down) until the operator picks a Look.
  lookRefused: null,
  _looksHydrated: false,

  _loadLooks: async () => {
    try {
      const idx = await fetchLooks()
      const looks = Array.isArray(idx.looks) ? idx.looks : []
      const defaultLookId = idx.default || null
      // ⭐ ONE RESOLVER (Phase 2 A): the address — URL, else remembered — against the index, by the same function
      // src/instance.js asks for the page's INSTANCE (`resolveTown`). The URL mirrors the store once hydrated
      // (CartographApp), so a warm call resolves from where the store already is.
      // ⭐ A ?look= LINK OPENS THAT LOOK AND ITS SCENE — never the default town (measured 2026-09-28: ?look=huron opened
      // Lafayette Square). A link naming no Look, or disagreeing with ?scene=, resolves NO town and says why.
      // ▶ node checks/claims-a-look-link-opens-that-town.mjs
      const town = resolveTown(looks, readAddress())
      if (town.dropped) {
        // ⛔ A stored Look the index no longer has resolves NOTHING — it used to fall to the index default.
        console.error(`[looks] the stored Look "${town.dropped}" is not in the index — no town is opened`)
        try { localStorage.removeItem(ACTIVE_LOOK_KEY) } catch { /* ignore */ }
      }
      if (town.refused) {
        console.error(`[looks] ⛔ ${town.refused} — no town is opened`)
        set({ looks, defaultLookId, activeLookId: null, lookRefused: town.refused, lookMissingForScene: town.missing, status: town.refused, _looksHydrated: true })
        return
      }
      if (town.missing) console.error(`[looks] no Look belongs to scene "${town.missing}" — Designer edits will not save`)
      if (town.lookId) { try { localStorage.setItem(ACTIVE_LOOK_KEY, town.lookId) } catch { /* ignore */ } }
      const cur = get().scene
      // A store booted with no town takes the resolved one directly (CartographApp's loaders follow `scene`); a store
      // already on another town switches through setScene, the one path that drops the old town.
      const sceneUpdate = town.scene && !isValidMapId(cur) ? { scene: town.scene } : {}
      if (sceneUpdate.scene) { try { localStorage.setItem(ADDRESS_STORAGE.scene, sceneUpdate.scene) } catch { /* ignore */ } }
      set({ looks, defaultLookId, activeLookId: town.lookId, lookMissingForScene: town.missing, _looksHydrated: true, ...sceneUpdate })
      get()._measureSlabAge()
      // Not awaited: this may run inside another scene's load, which sees the scene move and stands down.
      if (town.scene && isValidMapId(cur) && town.scene !== cur) get().setScene(town.scene)
    } catch (err) {
      console.warn('[looks] load failed:', err)
      set({ _looksHydrated: true })
    }
  },

  setActiveLook: async (id) => {
    if (!id || id === get().activeLookId) return
    const entry = get().looks.find(l => l.id === id)
    // ⛔ A Look with no scene (the kit default) is not a town's: with a town open, its design would autosave the
    // town's state into the kit's 0-state. It is edited with no town open.
    if (entry && !entry.scene && isValidMapId(get().scene)) {
      console.error(`[looks] "${id}" has no town; close the town to edit the kit default`)
      set({ status: `"${entry.name || id}" has no town — close the town to edit the kit default` })
      return
    }
    try { localStorage.setItem(ACTIVE_LOOK_KEY, id) } catch { /* ignore */ }
    if (get().lookRefused) set({ lookRefused: null })
    const newScene = entry?.scene || get().scene
    const sceneChanged = newScene !== get().scene
    set({ activeLookId: id })
    // Each Look points at a scene (its centerlines + overlay dataset).
    // Switching Looks across scenes requires reloading geometry, not just
    // the design palette. Single-scene switches (e.g. between two LS
    // Looks) keep this path light: design hydrate only, geometry stays.
    if (sceneChanged) {
      // setScene is the one switch path: it drops the old town and reloads geometry AND this Look's design.
      await get().setScene(newScene)
      return
    }
    // Hydrate the panel from the new Look's design.json, and measure its slab's age.
    try {
      const design = await fetchLookDesign(id)
      set(hydrateDesign(design))
      get()._measureSlabAge()
    } catch (err) {
      console.warn('[looks] hydrate failed for', id, err)
    }
  },

  createLook: async (name, { fromActive = true } = {}) => {
    try {
      const fromLookId = fromActive ? get().activeLookId : null
      const r = await apiCreateLook({ name, fromLookId })
      // Re-fetch index so the new Look shows up in dropdowns immediately,
      // then switch to it.
      await get()._loadLooks()
      await get().setActiveLook(r.id)
      // Auto-bake the new Look so its bake bundle (ground.json + bin +
      // lightmap + buildings + lamps + scene) exists from the moment it
      // becomes active. Without this, BakedGround would 404 on first load.
      await get().runBake()
      return r.id
    } catch (err) {
      console.warn('[looks] create failed:', err)
      throw err
    }
  },

  deleteActiveLook: async () => {
    const id = get().activeLookId
    // The 0-state Look is undeletable — but WHICH id that is comes from the
    // served index, not a literal. (The server enforces this too; this only
    // keeps the button honest.)
    const defaultId = get().defaultLookId
    if (!id || !defaultId || id === defaultId) return
    try {
      await apiDeleteLook(id)
      await get().setActiveLook(defaultId)
      await get()._loadLooks()
    } catch (err) {
      console.warn('[looks] delete failed:', err)
    }
  },

  // Bake state. Per-Look bake: writes the bundle to public/baked/<activeLookId>/.
  // `bakeStale` flips true on every authoring edit; `bakeRunning` drives the
  // modal. After a successful bake we hand off to Hero.
  bakeRunning: false,
  bakeStale: true,           // true on app boot, until _measureSlabAge answers
  // ⭐ THE SLAB'S AGE, MEASURED (Phase 2 A): null = not yet measured · { stale: [{ step, why }], bakedAt } = the bake
  // route's own plan (serve.js GET /looks/<id>/bake) · { error }. It was `bakeStale = !entry.bakedAt` — "ever baked",
  // so a slab older than an overlay, skeleton or code edit opened in Stage as current. StatusBar alarms on it in Stage.
  // ▶ node checks/claims-a-stage-entry-knows-its-slab-age.mjs
  slabAge: null,
  _measureSlabAge: async () => {
    const lookId = get().activeLookId
    if (!lookId) { set({ slabAge: null }); return }
    set({ slabAge: null })
    let slabAge
    try { slabAge = await fetchBakePlan(lookId) } catch (e) { slabAge = { error: e.message || String(e) } }
    if (get().activeLookId !== lookId) return   // the Look moved on while we asked
    if (slabAge.error) console.error(`[stage] ⛔ could not measure the age of "${lookId}"'s slab: ${slabAge.error}`)
    else if (slabAge.stale.length) console.warn(`[stage] "${lookId}"'s slab is older than what the bake reads:`, slabAge.stale)
    set({ slabAge, bakeStale: !!slabAge.error || slabAge.stale.length > 0 })
  },
  bakeLastMs: null,
  bakeError: null,
  markBakeStale: () => set({ bakeStale: true }),
  // Loud signal for the silent-save-abort. `_saveOverlay` bails (to avoid
  // clobbering overlay.json with an empty dict) when the store is un-hydrated
  // — typically after a Vite HMR reset that resets state without re-firing
  // _loadCenterlines. Surfaced in StatusBar so the operator SEES that Survey
  // edits are not persisting and can hard-refresh to re-sync (instead of the
  // edit silently vanishing on the next reload).
  overlaySaveBlocked: false,
  // ⛔⛔ [ROADMAP A02] THE WALL MUST NOT DEGRADE SILENTLY. Outside Survey the
  // frozen `shape.json` OWNS the render — that is the Data Wall's whole promise.
  // When the freeze is ABSENT or its fetch FAILS, the view falls through to a
  // live `buildTileGround`, which draws a map that looks exactly like the frozen
  // one. Until 2026-07-31 that was a bare `console.warn`, so the operator was
  // shown a plausible map and never learned the wall had not held.
  //
  // ⭐ Why this is invisible where you would look for it: Lafayette Square ALWAYS
  // has a freeze, so the fallback never fires in the scene you would use to prove
  // the wall works. It fires on the town nobody has inspected — which is exactly
  // the shape `CLAUDE.md` Layer 0 names as the worst outcome a kit can have
  // (a fallback turns a failure into a plausible-looking success).
  //
  // Null when the wall is holding. Otherwise a reason string, rendered as a
  // non-dismissable red StatusBar banner — the same loud surface as
  // `overlaySaveBlocked` above. The live build still draws (a fresh pour with no
  // freeze yet is a legitimate state, and refusing to draw would make onboarding
  // town #2 impossible) — but it is now LABELLED as a live re-derivation instead
  // of masquerading as the frozen shape. The defect was the silence, not the draw.
  shapeFreezeMissing: null,
  setShapeFreezeMissing: (reason) => {
    if (get().shapeFreezeMissing !== reason) set({ shapeFreezeMissing: reason })
  },
  // ── [ROADMAP A07] WHICH PRODUCER BUILT THE CURB ──────────────────────────
  // The docs promise one producer — "the curb is a concentric offset". There are
  // two, and until now the tool could not tell you which one drew the block you
  // are looking at. Read off the frozen artifact's per-tile `producer` stamp, so
  // it costs nothing and is true of the shape actually on screen.
  // ⛔ This is an ACCOUNT, not an alarm — a median or a sliver taking the carve is
  // the RIGHT answer. It renders as plain status, never as a warning.
  curbProducerCensus: null,
  setCurbProducerCensus: (c) => set({ curbProducerCensus: c }),
  // ── The SHAPE freeze (the Data Wall, autosaved on Survey-exit) ────────────
  // `shapeFrozenMs` bumps when the frozen `shape.json` is rewritten, so the
  // Section surface re-opens the fresh freeze (cache-bust). This is the LIGHT
  // freeze (the per-tile curb/corner silhouette only) — decoupled from the
  // heavy slab bake, so leaving Survey re-freezes the eye-gated shape WITHOUT
  // the operator ever running a bake (`PIPELINE.md` §5 (the Wall); "autosave on exit").
  shapeFrozenMs: null,
  // The in-flight shape-freeze promise (null when idle). runBake's settle-gate
  // awaits it so a fast "exit Survey → bake" never reads a half-written
  // shape.json — the freeze is fired async + unawaited from the Survey-exit
  // effect in BlockGeometryV2Debug (HANDOFF-authoring-session-hardening §B).
  shapeFreezePending: null,
  freezeShape: async (artifact) => {
    // Artifact is the { tiles, highway } freeze object (G1). Skip empties so we
    // never persist a hollow freeze.
    const tiles = artifact?.tiles
    if (!tiles || !tiles.length) return
    const scene = get().scene
    const p = saveShapeFreeze(artifact, scene)
      .then(() => set({ shapeFrozenMs: Date.now() }))
      .catch((err) => console.warn('[freeze] shape freeze failed:', err))
    set({ shapeFreezePending: p })
    await p
    // Clear only if no newer freeze superseded this one.
    if (get().shapeFreezePending === p) set({ shapeFreezePending: null })
  },
  // → re-reads a poured town's ribbons + map.json after a bake and rebuilds the 2D map from them in place.
  // The bundled scene (LS) reads a static import and is refreshed by the dev server, not here.
  _refreshPouredMap: async () => {
    const sc = get().scene, held = get().sceneRibbons
    if (BUNDLED_MAPS.has(sc) || !held) return
    let why = null
    try {
      const fresh = await fetchRibbons(sc)
      if (get().scene !== sc || JSON.stringify(fresh) === JSON.stringify(held)) return
      const map = await fetchMap(sc)
      if (get().scene !== sc) return
      const before = get().centerlineData
      set({ sceneRibbons: fresh, sceneMap: { scene: sc, map }, mapRefreshing: true })
      try { await get()._loadCenterlines({ design: false }) } finally { set({ mapRefreshing: false }) }
      // the loader swallows its own errors (it logs them) — so ask whether it actually rebuilt from the fresh copy
      if (get().scene === sc && (get().centerlineData === before || !get()._designHydrated)) why = 'the scene loader did not rebuild from them (see the console)'
    } catch (e) { why = e.message || String(e) }
    if (why) set({ ribbonsStale: `the 2D map could not be refreshed after the bake: ${why}` })
  },
  runBake: async ({ force = false, repour = false } = {}) => {
    if (get().bakeRunning) return
    // ── The settle-gate (2026-06-21, HANDOFF-authoring-session-hardening §2) ──
    // (a) REFUSE to bake on an un-hydrated store (real boot before
    // _loadCenterlines completes, or a Vite-HMR reset where _saveOverlay/
    // _saveDesign silently bail). Baking here would pour a STALE slab from a
    // design.json/overlay.json the store can't write — surface it loudly (the
    // red StatusBar banner via overlaySaveBlocked) instead of shipping stale.
    if (!get()._designHydrated || get().overlaySaveBlocked) {
      // SELF-HEAL (2026-06-21) instead of refuse: a Vite-HMR reset leaves the
      // store un-hydrated (CartographApp's _loadCenterlines effect has deps []
      // and doesn't re-fire on HMR), which previously made the bake silently
      // refuse → "click Stage, nothing happens." Re-hydrate from disk, then
      // proceed. Only refuse if re-hydration genuinely fails — so we still never
      // pour a stale slab, but a normal dev bake after an HMR just works.
      try { await get()._loadCenterlines() } catch { /* surfaced below */ }
      if (!get()._designHydrated) {
        set({ overlaySaveBlocked: true, bakeError: 'Bake blocked: could not re-sync the store — hard-refresh (Cmd-R) and retry.' })
        return
      }
    }
    set({ bakeRunning: true, bakeError: null, bakeProgress: null })
    try {
      // (b) SETTLE pending writes before the bake reads disk — WITHOUT bumping
      // input mtimes (that defeats the bake's incremental dirty-skip → an
      // UNCHANGED bake does full work; regression found 2026-06-21):
      //   - the in-flight SHAPE freeze: await it (it only wrote if dirty).
      //   - the design debounce: flush() is a no-op when nothing's pending.
      // ⛔ Do NOT re-save the overlay here. It autosaves IMMEDIATELY on every
      // edit, so it's already on disk by bake time; re-writing overlay.json each
      // bake gave it a fresh mtime → the dirty-check re-ran everything even with
      // zero edits (and the slow bake widened the concurrent-bake 409 window).
      const freeze = get().shapeFreezePending
      if (freeze) { try { await freeze } catch { /* freezeShape logs its own */ } }
      // Drain the 300 ms autosave debounce so design.json reflects the latest
      // edits before the bake reads it (NOTES.md §"Autosave debounce must flush
      // before /bake", 2026-05-18). No-op when nothing is pending.
      await get()._saveDesignDebounced.flush()
      // ⭐ the operator watches the bake: poll its steps once a second while it runs (BakeModal renders them)
      const lookId = get().activeLookId
      const poll = setInterval(() => { fetchBakeStatus(lookId).then(p => { if (get().bakeRunning) set({ bakeProgress: p }) }).catch(() => {}) }, 1000)
      let r
      try { r = await bakeLook(lookId, { force, repour }) } finally { clearInterval(poll) }
      // bakeLastMs is the cache-bust signal for BakedGround / InstancedTrees
      // (`?t=${bakeLastMs}`). Must be unique per bake-completion or the
      // browser will hit cache and show stale geometry. r.ms (duration) is
      // not unique — incremental bakes can return identical small durations.
      // Use Date.now() to guarantee uniqueness.
      set({ bakeRunning: false, bakeStale: false, bakeLastMs: Date.now(), bakeDurationMs: r.ms })
      // ⭐ THE 2D MAP REFRESHES ITSELF (Jacob, 2026-09-26: "it should always update"). It is built from the ribbons +
      // map.json this page fetched at scene load, and a bake can re-pour both (pipeline + promote), as can a CLI
      // pour — measured 2026-09-24: huron's verges drawn as curbed blocks from pre-re-pour ribbons. So after a bake,
      // re-read the ribbons; if they differ, take them AND map.json, and re-run the scene loader, which rebuilds
      // every store derived from them (centerlines, ①, the measure seed, the design hydrate).
      // ⛔ Never a silent stale map: the modal appears only when that refresh FAILS, and says so.
      await get()._refreshPouredMap()
      get()._measureSlabAge()
    } catch (err) {
      // the server stopped before a CODE-driven re-pour: ask, and remember how to resume (BakeModal)
      if (err.code === 'REPOUR_CONFIRM') { set({ bakeRunning: false, repourConfirm: { ...(err.repour || {}), resume: { force } } }); return }
      set({ bakeRunning: false, bakeError: String(err.message || err) })
    }
  },

  // ── Tool + Shot ───────────────────────────────────────────
  // Two orthogonal axes:
  //   tool = authoring tool, only meaningful in the Designer (shot==='designer')
  //          (null | 'surveyor' | 'measure').  null = neutral "Design" state.
  //   shot = which camera/environment preset is active
  //          ('designer' | 'browse' | 'hero' | 'street')
  // markerActive = overlay toggle, independent of tool
  // Restore the EXACT tool + shot the operator left (2026-06-21, drops the old
  // cold-boot-to-Designer guard). Rationale (Jacob): the status card covers any
  // load, and the dirty-skipping bake (serve.js runIfDirty) is fast unless lots
  // changed — so landing a refresh back in a Stage shot is fine. Coherence: a
  // Stage shot (browse/hero/street) carries NO panel tool, so force tool=null
  // there regardless of the saved tool. `cartograph-shot` is written by setShot;
  // `cartograph-tool` is written by setTool ('design' encodes the null/neutral).
  tool: (() => {
    try {
      if (isStageShot(initialShot())) return null
      const savedTool = localStorage.getItem('cartograph-tool')
      if (savedTool === 'surveyor' || savedTool === 'measure') return savedTool
      if (savedTool === 'design') return null
    } catch { /* ignore */ }
    return 'surveyor'
  })(),
  // ⛔ ALL_SHOTS, deliberately: every VALID destination, not the Stage subset (see STAGE_SHOTS above).
  shot: initialShot(),
  // Scene = what geometry we're looking at — the dataset name that data/<scene>/
  // holds (any installation id). Mirrored from the active Look's
  // `scene` field so selecting a Look determines the scene; setActiveLook is
  // the canonical way to switch.
  // Provisional until _loadLooks resolves the address: ?scene= wins, then the remembered town, else NO town — the
  // Look picker offers them all (never a default town).
  scene: (({ url, stored }) => isValidMapId(url.scene) ? url.scene : isValidMapId(stored.scene) ? stored.scene : null)(readAddress()),
  // Active installation's data, loaded BY ID (null until fetched). The bundled
  // fast-path scene (the default) leaves sceneRibbons null and reads its
  // static import; every other installation fetches these per-scene.
  sceneRibbons: null,
  // Set when the server's ribbons no longer match the copy this page loaded (BakeModal shows it, with Reload).
  ribbonsStale: null,
  mapRefreshing: false,   // the 2D map is being rebuilt from a re-poured town's data (_refreshPouredMap)
  // the running bake's steps — { steps: [{ label, state, t0, t1, est, lastLine, frac, sub, why, error }], current, now }
  bakeProgress: null,
  // { scene, files, resume } — a Bake refused because the pour's code changed; BakeModal asks before re-pouring
  repourConfirm: null,
  mapGeography: null,   // fetched geography.json (lat/lon/tz/projection/bbox)
  sceneBoundary: null,    // fetched neighborhood_boundary.json (raw)
  // ⛔ THE ONE SCENE SWITCH. It cleared three keys and loaded nothing, so a caller that switched scene without
  // also switching Look and reloading (Extent's openScene) left the old town's streets on screen AND its Look
  // active — the next Designer edit autosaved into the other town's design.json (2026-09-25). Now: every key a
  // scene loader writes goes back to empty, the design is un-hydrated (so neither autosave can fire mid-switch),
  // the Look becomes the scene's own, and the three loaders run. `checks/claims-a-scene-switch-drops-the-old-town.mjs`
  // reads the loaders' set() calls and fails if a key they write is not reset here.
  setScene: async (scene) => {
    if (!isValidMapId(scene) || scene === get().scene) return
    try { localStorage.setItem(ADDRESS_STORAGE.scene, scene) } catch { /* ignore */ }
    const s = get()
    const activeLookId = s._looksHydrated ? lookForScene(s.looks, scene, s.activeLookId) : s.activeLookId
    if (s._looksHydrated && !activeLookId) console.error(`[looks] no Look belongs to scene "${scene}" — Designer edits will not save`)
    if (activeLookId) { try { localStorage.setItem(ACTIVE_LOOK_KEY, activeLookId) } catch { /* ignore */ } }
    set({
      scene, activeLookId, lookMissingForScene: s._looksHydrated && !activeLookId ? scene : null,
      sceneRibbons: null, mapGeography: null, sceneBoundary: null,
      centerlineData: { streets: [] }, protopolygon: null, svOriginals: null, corridorByIdx: new Map(),
      measurements: [], markerStrokes: [],
      selectedStreet: null, selectedNode: null, selectedMeasurePoint: null, selectedSegmentOrdinal: null, selectedMeasurement: null,
      ...hydrateDesign({}), _designHydrated: false,
    })
    await Promise.all([get()._loadCenterlines(), get()._loadMeasurements(), get()._loadMarkers()])
  },
  // A scene no Look belongs to (see lookForScene) — the StatusBar alarms while it is set.
  lookMissingForScene: null,
  markerActive: false,
  setTool: (newTool) => {
    const prev = get().tool
    // Persist the active tool so a reload restores the exact place ('design'
    // encodes the null/neutral Designer state). Paired with the tool-init above.
    const persistTool = (t) => { try { localStorage.setItem('cartograph-tool', t ?? 'design') } catch { /* ignore */ } }
    if (prev === newTool) {
      set({ tool: null, status: '' }); persistTool(null)
      if (prev === 'surveyor') set({ selectedStreet: null, selectedNode: null })
      return
    }
    if (prev === 'surveyor') set({ selectedStreet: null, selectedNode: null })
    if (newTool === 'surveyor') {
      set({ tool: 'surveyor', status: 'Click a street to inspect.' }); persistTool('surveyor')
    } else if (newTool === 'measure') {
      set({ tool: 'measure', status: 'Click a street to adjust its cross-section.' }); persistTool('measure')
    } else {
      set({ tool: null, status: '' }); persistTool(null)
    }
  },
  // Tree variant style gate. Each Look chooses which style sets are
  // eligible for the runtime picker (e.g. realistic-only daytime, vs
  // a winter Look that activates 'winter' alongside 'realistic').
  // Stored as Array for serialization; converted to Set on read.
  activeStyles: (() => {
    try {
      const saved = localStorage.getItem('cartograph-active-styles')
      if (saved) return JSON.parse(saved)
    } catch {}
    return ['realistic']
  })(),
  setActiveStyles: (arr) => {
    const next = Array.isArray(arr) ? [...new Set(arr)] : ['realistic']
    try { localStorage.setItem('cartograph-active-styles', JSON.stringify(next)) } catch {}
    set({ activeStyles: next })
  },
  toggleActiveStyle: (style) => {
    const cur = new Set(get().activeStyles)
    if (cur.has(style)) cur.delete(style); else cur.add(style)
    get().setActiveStyles([...cur])
  },

  setShot: (shot) => {
    // ⛔ Was `shot !== 'designer'`, which swept in `extent` — see STAGE_SHOTS above.
    // Entering a Stage shot clears the panel tool — keep the persisted tool
    // coherent so a reload doesn't restore a stale 'surveyor' (the tool-init
    // also guards this by shot, but don't leave a stale key behind).
    if (get().shot === 'designer' && isStageShot(shot)) {
      set({ tool: null, selectedStreet: null, selectedNode: null, markerActive: false, markerEraserActive: false })
      try { localStorage.setItem('cartograph-tool', 'design') } catch { /* ignore */ }
    }
    // ⭐⭐ EXTENT → DESIGNER LANDS IN SURVEY, by every route. Jacob: "When I click
    // 'Designer' from the Extent tool, the first stop MUST be the Survey tool."
    // Survey is SHAPE (chain step 4); whatever tool was open before Extent may be
    // FILL, and a changed frame means a shape nobody has inspected yet. Enforced
    // HERE, not at each button: ExtentApp has three exits (the ← Designer nav and
    // both pour hand-offs) and the nav button was the one that got missed.
    // ⛔ Set directly, never via setTool — setTool TOGGLES, so it switched Survey
    // OFF whenever Survey was already the tool.
    // ▶ node checks/claims-extent-lands-in-survey.mjs
    if (get().shot === 'extent' && shot === 'designer') {
      set({ tool: 'surveyor', status: 'Click a street to inspect.' })
      try { localStorage.setItem('cartograph-tool', 'surveyor') } catch { /* ignore */ }
    }
    try { localStorage.setItem(ADDRESS_STORAGE.shot, shot) } catch { /* ignore */ }
    // The last Stage shot is also recorded for PREVIEW, which opens on it (its own ruling, 2026-09-05).
    if (isStageShot(shot)) {
      try { localStorage.setItem('cartograph-last-stage-shot', shot) } catch { /* ignore */ }
    }
    // ⭐ ONE WAY INTO STAGE (Jacob, 2026-10-04: "this shouldn't be baking if it's not dirty, and it shouldn't open in
    // Stage without a note if it's dirty"). Entering Stage never bakes; it asks the bake's one plan how old the slab is,
    // and StatusBar's alarm (with its Bake button) says so when it is stale. A reload or a link measures at load
    // (`_loadLooks`); moving in from the Designer or Extent measures here. ▶ node checks/claims-one-way-into-stage.mjs
    const entering = isStageShot(shot) && !isStageShot(get().shot)
    set({ shot, status: '' })
    if (entering) get()._measureSlabAge()
  },
  toggleMarker: () => {
    const cur = get().markerActive
    set({
      markerActive: !cur,
      markerEraserActive: cur ? false : get().markerEraserActive,
      status: cur ? '' : 'Draw on the map to mark areas.',
    })
  },

  markerEraserActive: false,
  toggleMarkerEraser: () => {
    const on = !get().markerEraserActive
    set({
      markerEraserActive: on,
      status: on ? 'Click a stroke to erase it.' : 'Draw on the map to mark areas.',
    })
  },

  // ── Status ────────────────────────────────────────────────
  status: '',
  setStatus: (status) => set({ status }),

  // ── Space key (pan override) ──────────────────────────────
  spaceDown: false,
  setSpaceDown: (v) => set({ spaceDown: v }),

  // ── Cursor (set by overlays on hover) ─────────────────────
  hoverTarget: false,
  setHoverTarget: (v) => set({ hoverTarget: v }),

  // ── Copied profile (for measure paste) ────────────────────
  _copiedProfile: null,

  // ── Marker ────────────────────────────────────────────────
  markerStrokes: [],
  _loadMarkers: async () => {
    try {
      const scene = get().scene
      if (!isValidMapId(scene)) return   // no town open
      const data = await fetchMarkers(scene)
      if (get().scene !== scene) return   // switched mid-fetch — never land one town's strokes in another
      set({ markerStrokes: Array.isArray(data) ? data : [] })
    } catch { /* ignore */ }
  },
  addMarkerStroke: (stroke) => {
    const strokes = [...get().markerStrokes, stroke]
    set({ markerStrokes: strokes, status: strokes.length + ' stroke(s)' })
    saveMarkers(strokes, get().scene)
  },
  undoMarkerStroke: () => {
    const strokes = get().markerStrokes.slice(0, -1)
    set({ markerStrokes: strokes, status: strokes.length ? strokes.length + ' stroke(s)' : '' })
    saveMarkers(strokes, get().scene)
  },
  clearMarkerStrokes: () => {
    set({ markerStrokes: [], status: 'Cleared.' })
    saveMarkers([], get().scene)
  },
  deleteMarkerStroke: (idx) => {
    const strokes = get().markerStrokes
    if (idx < 0 || idx >= strokes.length) return
    const next = strokes.slice(0, idx).concat(strokes.slice(idx + 1))
    set({ markerStrokes: next, status: next.length ? next.length + ' stroke(s)' : '' })
    saveMarkers(next, get().scene)
  },

  // ── Surveyor ──────────────────────────────────────────────
  centerlineData: { streets: [] },
  protopolygon: null,
  corridorByIdx: new Map(),
  selectedStreet: null,
  selectedNode: null,
  // Measure mode: where on the selected centerline the user clicked.
  // Handles anchor to this point instead of the street midpoint.
  selectedMeasurePoint: null,

  // Load streets from skeleton.json. Skeleton is the geometric source of
  // truth — regeneratable from OSM. Non-geometric operator intent (caps,
  // couplers, measurements) currently back-filled from legacy
  // centerlines.json by name; a proper overlay file is TBD.
  // ⛔ Concurrency dedupe. Two callers fire this on a single dev page load —
  // React StrictMode double-invokes CartographApp's mount effect (the module-scope
  // HMR load that made it three is gone, 2026-09-28). The guards below
  // (`!fetchedRibbons`, `!get().mapGeography`) are read-BEFORE-await, so
  // concurrent callers all sail past them → 2-3x the 13.9 MB ribbons + 3.4 MB
  // skeleton on the wire, and every downstream memo (sectionOpen, tileGeos)
  // re-runs per duplicate set() — sectionOpen was observed running TWICE on an
  // Altadena load (9.1s + 5.6s). An in-flight promise is the only thing that can
  // dedupe callers that race the await. Sequential calls (a Looks reload, the
  // post-bake settle) still re-run normally — this only collapses OVERLAP.
  _loadCenterlines: async (opts) => {
    // ⛔ SCENE-KEYED. _loadCenterlinesImpl captures `get().scene` at its start, so
    // an unkeyed in-flight promise is a SCENE BLEED: switch hoods while a load is
    // still running (Altadena takes 20-70s — near-certain) and the new scene's
    // caller gets handed the OLD scene's promise. The new hood never loads and the
    // Designer shows the previous hood's centerlines under the new hood's name —
    // observed 2026-07-15: LS selected, Altadena's centerlines on screen. That is
    // the same class as the Looks-pulldown masquerade (79bc1584), and it is how one
    // hood's authoring lands on another's slab. Dedupe only ever collapses callers
    // that want the SAME scene.
    const scene = get().scene
    // No town open: load the Looks index (the picker's list) and nothing else — no town's data is fetched.
    if (!isValidMapId(scene)) { await get()._loadLooks(); return }
    if (_clInFlight && _clInFlight.scene === scene) return _clInFlight.promise
    const promise = (async () => {
      try { return await get()._loadCenterlinesImpl(opts) } finally {
        // Only clear if we're still the current in-flight — a scene switch may have
        // replaced us, and clearing then would strand the newer load's dedupe.
        if (_clInFlight && _clInFlight.promise === promise) _clInFlight = null
      }
    })()
    _clInFlight = { scene, promise }
    return promise
  },
  // opts.design === false: rebuild the map only and keep the in-memory design — the post-bake refresh. The bake read
  // the design this store flushed, so re-hydrating it only hands blockCustoms a new identity and re-runs sectionOpen
  // (15–25 s on huron) on top of the run the bake's fresh shape.json already causes.
  _loadCenterlinesImpl: async (opts) => {
    try {
      const scene = get().scene
      // ⛔ STALE-SCENE GUARD. Every set() below lands AFTER an await. Altadena takes
      // 20-70s to load, so switching hoods mid-flight is ordinary — and without this
      // the old hood's load completes and writes ITS ribbons / boundary / centerlines
      // / design into the NEW hood's store. That is a scene bleed on PROD-adjacent
      // data (LS), the same family as the Looks-pulldown masquerade (79bc1584).
      // Bail at every resumption point where the scene has moved on.
      const stale = () => get().scene !== scene
      const [skel, legacy, overlay] = await Promise.all([
        fetchSkeleton(scene),
        fetchCenterlines(scene).catch(() => ({ streets: [] })),
        fetchOverlay(scene).catch(() => ({ version: 1, streets: {} })),
      ])
      // Load the active installation's data BY ID. The bundled fast-path scene
      // (the default) reads a static import for ribbons; every other installation
      // fetches ribbons + its geography + boundary per-scene. Geography/boundary
      // are fetched for ALL scenes (small) so the kit reads them uniformly.
      let fetchedRibbons = get().sceneRibbons
      if (!BUNDLED_MAPS.has(scene) && !fetchedRibbons) {
        fetchedRibbons = await fetchRibbons(scene).catch(() => null)
        if (stale()) return
        if (fetchedRibbons) set({ sceneRibbons: fetchedRibbons })
      }
      if (!get().mapGeography || !get().sceneBoundary) {
        const [geo, bnd] = await Promise.all([
          fetchGeography(scene).catch(() => null),
          fetchBoundary(scene).catch(() => null),
        ])
        if (stale()) return
        set({ mapGeography: geo, sceneBoundary: bnd })
      }
      const skelStreets = (skel && skel.streets) || []
      const legacyStreets = (legacy && legacy.streets) || []
      const overlayById = (overlay && overlay.streets) || {}

      // Build name → legacy entry map for fallback migration only. Couplers
      // are intentionally ignored (point-index-based, tied to stale geometry).
      // Score prefers entries with the richest remaining authored data.
      const byName = new Map()
      const score = (s) => (s.measure ? 8 : 0)
        + (s.segmentMeasures ? 4 : 0)
        + ((s.capStart || s.capEnd) ? 1 : 0)
      for (const ls of legacyStreets) {
        if (!ls.name) continue
        const prev = byName.get(ls.name)
        if (!prev || score(ls) > score(prev)) byName.set(ls.name, ls)
      }

      // Skeleton owns id/geometry/highway/oneway/couplers (geometric ones);
      // overlay (skelId-keyed) owns measure, segmentMeasures, caps, anchor
      // override, and any operator-authored couplers. Legacy centerlines.json
      // is fallback only, matched by name — used to seed the overlay on first
      // run. anchor + innerSign + pairId are auto-detected by derive.js for
      // divided carriageways and forwarded via ribbons.json.
      // Scene-aware fixture: the third-tier measure/cap fallback (rb?.*)
      // must read the SAME ribbons the scene renders — a scene-blind LS lookup
      // leaves every other town's chain with `undefined` measure → MeasureOverlay
      // renders no handles. Mirror CartographApp's sceneCfg.ribbons keying.
      // The bundled towns' ribbons load as their OWN chunk, only for that town. A static import put
      // them in every town's bundle — 6 MB of one town's ribbons downloaded by all of them
      // (docs/briefs/BRIEF-slab-loading.md ③; ▶ node checks/claims-no-town-rides-in-the-bundle.mjs).
      // Same stale() guard as every other await in this loader.
      let bundledRibbons = null
      if (BUNDLED_MAPS.has(scene)) {
        bundledRibbons = (await import('../../data/ribbons.json')).default
        if (stale()) return
      }
      const ribbonsFixture = bundledRibbons ?? (fetchedRibbons || { streets: [] })
      // ⭐ Register THIS scene's fixture as the Measure seed source. Was a static
      // LS import inside measureModel (BRIEF-ls-bleed-excision site 9) — every
      // scene seeded its widths from Lafayette Square, keyed by street name.
      setSceneMeasureSource(ribbonsFixture, scene)
      const ribbonById = new Map((ribbonsFixture.streets || []).map(r => [r.skelId, r]))
      const streets = skelStreets.map((s) => {
        const ov = overlayById[s.id]
        const legacy = ov ? null : byName.get(s.name)
        const rb = ribbonById.get(s.id)
        // derive.js OWNS divided-carriageway geometry — it auto-detects
        // anchor/innerSign/pairId AND computes the 3a per-side widths, all
        // forwarded via ribbons.json. The pre-divided legacy centerlines.json
        // has ONE undivided by-name entry per road (e.g. "South Jefferson
        // Avenue" 9.16/7.72, "Lafayette Avenue" 10.56) that, matched by NAME,
        // would stamp the WHOLE-ROAD width onto each carriageway → carriageways
        // overrun the median gap → the malformed/annihilated median that loads
        // on refresh and only clears via revert-to-skeleton (it bypasses legacy).
        // So for a divided carriageway the ribbons baseline WINS over legacy.
        const isDividedCarriageway = /carriageway/.test(rb?.phase?.role || '')
        const legacyMeasure = isDividedCarriageway ? undefined : legacy?.measure
        const legacySegMeasures = isDividedCarriageway ? undefined : legacy?.segmentMeasures
        // Prefer ribbons.json's points + intersections over skeleton's.
        // derive.js INSERTS extra vertices at every detected IX, so a
        // chain that has 21 points in skeleton can have 34 in ribbons.json
        // (the IX-vertex insertions split each segment). MeasureOverlay
        // reads centerlineData; V2 reads ribbons.json. If centerlineData
        // uses skeleton's 21-point polyline, segI / natural-segment math
        // diverges from V2's 34-point math — drag a handle and the
        // override lands on the wrong segment. Use ribbons.json's points
        // when available so both consumers walk the same polyline.
        const rbPoints = rb?.points
        const points = (rbPoints && rbPoints.length >= 2)
          ? rbPoints.map(p => Array.isArray(p) ? [p[0], p[1]] : [p.x, p.z])
          : (s.points || []).map(p => [p.x, p.z])
        const rbIntersections = rb?.intersections
        return {
          id: s.id,
          name: s.name,
          type: s.highway || 'residential',
          oneway: !!s.oneway,
          points,
          // [curve-primitive] sparse, self-contained curve segments (HANDOFF-curve-
          // primitive-skeleton.md). `points` above is their DENSE tessellation (smooth
          // navy + ix parity); `segments` is the sparse companion the editor draws as
          // "few nodes (≈2 with tangents)". Undefined on straight chains → legacy node
          // display off `points`.
          segments: rb?.segments,
          divided: !!s.divided,
          // IX vertex indices on this chain. Indices reference `points`
          // above — must come from the SAME source the points came from
          // (ribbons.json's intersections.ix index into ribbons' point
          // array). Falling back to skeleton's intersections only if we
          // had to fall back to skeleton's points too.
          intersections: rbPoints && rbPoints.length >= 2 && Array.isArray(rbIntersections)
            ? rbIntersections.map(ix => ({ ix: ix.ix, withStreets: ix.withStreets }))
            : (Array.isArray(s.intersections)
              ? s.intersections.map(ix => ({ ix: ix.ix, withStreets: ix.withStreets }))
              : []),
          // Operator can hide individual chains (echo hunting, suppress OSM
          // junk centerlines). Hidden chains still appear in Measure (dim,
          // re-selectable) so you can toggle them back on.
          disabled: !!ov?.disabled,
          // Measure resolution: operator overlay > legacy centerlines.json >
          // derive.js's ribbons.json baseline. The third tier was missing,
          // so chains the operator hadn't touched ended up with `undefined`
          // measure on the live store — MeasureOverlay's sideBoundaries
          // returns [] for an undefined side and renders no handles, even
          // though the chain became selectable + translucent. V2 already
          // does this fallback inside mergeLiveRibbons; this keeps the
          // live store's per-chain measure consistent with what V2 sees.
          measure: ov?.measure ?? legacyMeasure ?? rb?.measure,
          // [E1] Provenance for the save guard: only persist a measure that
          // the operator actually owns (came from overlay) or that diverges
          // from the baked baseline. Without this, every chain loads a truthy
          // measure (rb?.measure) and _saveOverlay re-broadcasts the BASELINE
          // into overlay.json wholesale — the shadow that buried the
          // survey/seed width base (all 220 LS chains had overlay measures).
          _measureFromOverlay: !!ov?.measure,
          _baselineMeasure: rb?.measure,
          segmentMeasures: ov?.segmentMeasures ?? legacySegMeasures,
          // Effective cap = overlay (operator) > legacy (centerlines.json) >
          // ribbons.json (what derive.js actually rendered). The fallback
          // chain keeps the Survey dropdown in sync with the viewer when an
          // overlay/legacy entry is missing or stripped of caps. `null` from
          // an overlay or legacy entry is an explicit "no cap" and wins over
          // any underlying ribbons.json default — only `undefined` falls
          // through.
          capStart: ov && 'capStart' in ov ? ov.capStart
            : legacy && 'capStart' in legacy ? legacy.capStart
            : rb?.capEnds?.start ?? null,
          capEnd: ov && 'capEnd' in ov ? ov.capEnd
            : legacy && 'capEnd' in legacy ? legacy.capEnd
            : rb?.capEnds?.end ?? null,
          // Baseline = ribbons.json default. Save logic uses this to detect
          // operator overrides to null (suppressing an auto cap).
          _baselineCapStart: rb?.capEnds?.start ?? null,
          _baselineCapEnd: rb?.capEnds?.end ?? null,
          couplers: ov?.couplers ?? s.couplers ?? [],
          smooth: ov?.smooth ?? 0,
          // Anchor: operator override wins; otherwise auto-detected from
          // derive's divided-pair pass. innerSign and pairId always come
          // from auto-detection (geometric, not operator intent).
          anchor: ov?.anchor ?? rb?.anchor ?? 'center',
          _autoAnchor: rb?.anchor ?? 'center',
          innerSign: rb?.innerSign ?? 0,
          pairId: rb?.pairId ?? null,
          _skeleton: s,
          _legacyMatched: !!legacy,
        }
      })

      const matchedNames = new Set(streets.filter(s => s._legacyMatched).map(s => s.name))
      const orphans = legacyStreets.filter(ls =>
        ls.name && !matchedNames.has(ls.name) && score(ls) > 0)
      if (orphans.length) {
        console.warn(`[skeleton] ${orphans.length} legacy centerlines with operator intent have no skeleton match:`,
          orphans.map(o => `${o.name} (${score(o)})`))
      }

      const originals = new Map()
      for (const st of streets) originals.set(st.id, st.points.map(p => [p[0], p[1]]))

      // Build corridor lookup: for each skeleton street id, the SET of
      // street indices that belong to the same corridor. Click any one
      // chain → the whole corridor lights up. The corridor is the
      // "these chains are one road" link (two divided carriageways +
      // their bidirectional continuation are one corridor).
      const corridorByIdx = new Map() // streetIdx → Set<streetIdx>
      const idToIdx = new Map(streets.map((s, i) => [s.id, i]))
      for (const corridor of (ribbonsFixture.corridors || [])) {
        const members = new Set()
        for (const phase of corridor.phases) {
          for (const cid of phase.chainIds) {
            const idx = idToIdx.get(cid)
            if (idx !== undefined) members.add(idx)
          }
        }
        for (const idx of members) corridorByIdx.set(idx, members)
      }

      // Set centerline state immediately so Designer geometry can render.
      // Design (layer visibility/colors/strokes/land-use colors) hydrates
      // separately from the *active Look's* design.json — overlay.json no
      // longer carries a design block. See _loadLooks + setActiveLook.
      // ⛔ This is the write that put ALTADENA's centerlines on screen with LS
      // selected (2026-07-15). Guard it like the rest.
      if (stale()) return
      set({
        centerlineData: { streets },
        // ⭐ ① travels with the scene's fixture. `SKELETON §0.1` — the skeleton is
        // the SSoT and ① is minted from it; Survey's navy renders ①, not the
        // chains (Jacob, 2026-09-06: "the navy blue should exist in Survey but it
        // should be the protopoly! Not the chains!"). Null when the scene has not
        // been poured since ① started freezing — SurveyorOverlay says so LOUDLY
        // rather than pretending the chains are ①.
        protopolygon: ribbonsFixture.protopolygon || null,
        svOriginals: originals,
        corridorByIdx,
      })
      if (opts?.design === false) return
      // Kick off the active Look's design hydrate. setActiveLook needs the
      // Looks index loaded so it can validate the id, so chain through that.
      await get()._loadLooks()
      if (stale()) return
      // ⛔ No `.catch(() => ({}))`: a failed fetch hydrated the kit defaults and marked the store hydrated, so the
      // next edit autosaved defaults over the town's Look. A failure now stays un-hydrated, and the banner says so.
      // No Look for the scene (lookForScene) ⇒ the kit defaults, with nothing to save them to.
      const lookId = get().activeLookId
      let design = {}
      if (lookId) {
        try { design = await fetchLookDesign(lookId) } catch (err) {
          console.error(`[looks] design for "${lookId}" failed to load — edits blocked:`, err)
          if (!stale()) set({ overlaySaveBlocked: true })
          return
        }
      }
      if (stale()) return
      // Re-hydrated from disk → _saveOverlay's guard will pass again; clear
      // the loud save-blocked flag.
      set({ ...hydrateDesign(design), _designHydrated: true, overlaySaveBlocked: false })
    } catch (e) {
      // ⛔ LOUD: a failed skeleton load leaves the Designer with no centerlines — edits would save over a town that did
      // not load. Block them and say so (it was a console.warn that the Designer never showed).
      console.error('[skeleton] ⛔ the town\'s authoring data failed to load — edits are blocked:', e)
      set({ overlaySaveBlocked: true, status: `The town's authoring data failed to load (${e?.message || e}) — edits are blocked until it loads` })
    }
  },

  // Persistence write path. Builds the skelId-keyed overlay JSON from
  // current centerlineData state and POSTs to /overlay. Streets without
  // any authored intent (no measure/segmentMeasures/caps/couplers) are
  // omitted so the overlay file stays compact. Called by every authoring
  // action after the in-memory state is updated.
  _saveOverlay: () => {
    const { centerlineData, _designHydrated } = get()
    // Refuse to write while the store is in its uninitialized state — saving
    // an empty streets dict here clobbers operator edits in overlay.json.
    // The store reaches uninitialized state on real boot (before
    // _loadCenterlines completes) AND on Vite HMR of this module (state
    // resets to defaults but no remount of CartographApp re-fires
    // _loadCenterlines). In both cases an immediate save would wipe disk.
    if (!centerlineData.streets || centerlineData.streets.length === 0) {
      console.warn('[overlay] save aborted: centerlineData not loaded')
      set({ overlaySaveBlocked: true })
      return
    }
    if (!_designHydrated) {
      console.warn('[overlay] save aborted: design not hydrated')
      set({ overlaySaveBlocked: true })
      return
    }
    // Geometry edits stale the active Look's bake (centerlines/measures/caps
    // change the SVG geometry). Stage button shows it; the modal re-runs on
    // next click. Cheap to flip; doesn't auto-bake.
    if (!get().bakeStale) set({ bakeStale: true })
    // [E1] Measure equality vs the baked baseline (epsilon on numbers; exact
    // on terminal/material). Used so untouched chains don't persist their
    // baseline measure — overlay.json carries TWEAKS ONLY, the width base
    // lives in the skeleton seed (custom → OSM lanes → AASHTO).
    const sideEq = (a, b) => {
      if (!a || !b) return a === b
      const num = (k) => Math.abs((a[k] || 0) - (b[k] || 0)) < 1e-6
      return num('pavementHW') && num('treelawn') && num('sidewalk')
        && (a.terminal || 'sidewalk') === (b.terminal || 'sidewalk')
        && (a.material || null) === (b.material || null)
    }
    const measureEq = (a, b) => !!a && !!b && sideEq(a.left, b.left) && sideEq(a.right, b.right)
    const out = {}
    for (const st of centerlineData.streets || []) {
      if (!st.id) continue
      // Persist a measure the operator owns (loaded from overlay) or that
      // diverges from the baked baseline (a fresh edit). A chain whose live
      // measure merely echoes ribbons.json stays measure-free on disk.
      const hasMeasure = !!st.measure
        && (st._measureFromOverlay || !measureEq(st.measure, st._baselineMeasure))
      const hasSegM = st.segmentMeasures && Object.keys(st.segmentMeasures).length > 0
      const capStart = st.capStart ?? null
      const capEnd = st.capEnd ?? null
      const baseStart = st._baselineCapStart ?? null
      const baseEnd = st._baselineCapEnd ?? null
      // Persist caps when the operator state differs from the ribbons.json
      // baseline (including explicit override-to-null) OR when there's any
      // non-null cap to remember.
      const hasCaps = capStart !== baseStart || capEnd !== baseEnd || !!capStart || !!capEnd
      const hasCouplers = Array.isArray(st.couplers) && st.couplers.length > 0
      const hasSmooth = (st.smooth || 0) > 0
      // Anchor is persisted only when it differs from the auto-detected
      // default (from ribbons.json). _autoAnchor is set on load.
      const hasAnchorOverride = st.anchor && st.anchor !== (st._autoAnchor || 'center')
      const hasDisabled = !!st.disabled
      if (!hasMeasure && !hasSegM && !hasCaps && !hasCouplers && !hasAnchorOverride && !hasDisabled && !hasSmooth) continue
      out[st.id] = {
        name: st.name,
        ...(hasMeasure ? { measure: st.measure } : {}),
        ...(hasSegM ? { segmentMeasures: st.segmentMeasures } : {}),
        ...(hasCaps ? { capStart, capEnd } : {}),
        ...(hasCouplers ? { couplers: st.couplers } : {}),
        ...(hasAnchorOverride ? { anchor: st.anchor } : {}),
        ...(hasDisabled ? { disabled: true } : {}),
        ...(hasSmooth ? { smooth: st.smooth } : {}),
      }
    }
    // overlay.json carries geometry only — design has moved to the active
    // Look's design.json (see _saveDesignDebounced). Returned so callers that
    // POST a dependent /bake can await the write landing
    // first — the flush-before-dependent-POST hazard.
    // The save is going through — clear any prior loud "edits not saving" flag.
    if (get().overlaySaveBlocked) set({ overlaySaveBlocked: false })
    return saveOverlay({ version: 1, streets: out }, get().scene)
  },

  // Debounced save for design-panel edits. Writes the active Look's
  // design.json (NOT overlay.json — design has moved to per-Look files).
  // Color pickers fire `onInput` many times per drag; coalesce to a single
  // network write 300 ms after the last change.
  _saveDesignDebounced: (() => {
    let t = null
    // Last pending save body, captured at debounce-fire time. `flush()`
    // (called from runBake) drains this synchronously so the /bake POST
    // can't race a still-pending /design POST. Without this, a layer
    // toggle followed by a Stage click within 300 ms shipped stale
    // design.json to the bake — see 2026-05-18 NOTES entry.
    const runSave = () => {
      t = null
      const s = get()
      if (!s._designHydrated || !s._looksHydrated) return Promise.resolve()
      const id = s.activeLookId
      if (!id) return Promise.resolve()
      if (!get().bakeStale) set({ bakeStale: true })
      const design = serializeDesign(s)
      return saveLookDesign(id, design).catch(err =>
        console.warn('[looks] design save failed:', err))
    }
    const fn = () => {
      if (t) clearTimeout(t)
      t = setTimeout(runSave, 300)
    }
    // An edit whose save has not gone out yet — a page switch now would drop it.
    fn.pending = () => t !== null
    fn.flush = () => {
      if (t === null) return Promise.resolve()
      clearTimeout(t)
      return runSave()
    }
    return fn
  })(),
  // Back-compat alias for older callers that still invoke _saveCenterlines.
  _saveCenterlines: () => { get()._saveOverlay() },

  // Override the anchor for a street ('center' | 'inner-edge'). Auto-detection
  // sets a default at load time; this lets the operator override per chain.
  // Persists to overlay only when the override differs from the auto value.
  setAnchor: (streetIdx, anchor) => {
    const { centerlineData } = get()
    const st = centerlineData.streets[streetIdx]
    if (!st) return
    // Pair-aware: if this chain has a divided-pair mate, flip its anchor
    // too. `pairId` carries the MATE's skelId (not a shared pair-group
    // identifier), so look up by skelId match.
    const mateIdx = st.pairId
      ? centerlineData.streets.findIndex(s => s.skelId === st.pairId)
      : -1
    // Inner-edge and Asymmetric are INDEPENDENT operator concepts (park-edge
    // streets are a common asymmetric-center case). setAnchor never clobbers
    // operator-authored asymmetric values.
    //   - Flip TO inner-edge from symmetric: force `symmetric = false`, seed
    //     `inboard.pavementHW = 0` (visible feedback; operator widens inboard
    //     to eat into the median).
    //   - Flip TO inner-edge from asymmetric: anchor only; leave measure alone
    //     (operator's per-side authoring is intentional).
    //   - Un-flip TO center: detect the unmodified inner-edge footprint
    //     (symmetric=false AND inboard pavementHW exactly 0) and clean it up
    //     by restoring symmetric=true + mirroring outboard onto inboard.
    //     Anything else (operator widened inboard from zero, or had asymmetric
    //     pre-existing) → leave measure alone.
    const flipMeasure = (m, innerSign, newAnchor) => {
      if (!m || !innerSign) return m
      const wasSymmetric = m.symmetric !== false
      const inboardKey = innerSign === +1 ? 'right' : 'left'
      const outboardKey = inboardKey === 'left' ? 'right' : 'left'
      if (newAnchor === 'inner-edge' && wasSymmetric) {
        return {
          ...m,
          symmetric: false,
          [inboardKey]: { ...(m[inboardKey] || {}), pavementHW: 0 },
        }
      }
      if (newAnchor === 'center' && !wasSymmetric && (m[inboardKey]?.pavementHW || 0) === 0) {
        return {
          ...m,
          symmetric: true,
          [inboardKey]: { ...(m[outboardKey] || {}) },
        }
      }
      return m
    }
    const flipStreet = (s) => {
      const updates = { ...s, anchor }
      if (s.measure) updates.measure = flipMeasure(s.measure, s.innerSign, anchor)
      if (s.segmentMeasures) {
        const newSm = {}
        for (const k of Object.keys(s.segmentMeasures)) {
          newSm[k] = flipMeasure(s.segmentMeasures[k], s.innerSign, anchor)
        }
        updates.segmentMeasures = newSm
      }
      return updates
    }
    const streets = centerlineData.streets.map((s, i) =>
      i === streetIdx || i === mateIdx ? flipStreet(s) : s
    )
    set({ centerlineData: { ...centerlineData, streets } })
    get()._saveOverlay()
  },

  // Active segment ordinal (0 = first segment, 1 = second, ...) for the
  // selected street in measure mode. Ordinal keys are stable across coord
  // systems (skeleton vs. ribbons polylines), unlike point-index ranges.
  selectedSegmentOrdinal: null,
  selectStreet: (idx) => {
    // Initialize the transient mirror toggle from the chain's pipeline
    // symmetric hint (a READ, not a write): asymmetric chains (divided
    // carriageways carry symmetric:false) open with sides editable
    // separately, preserving the prior panel display.
    // ⛔ Seed it ONLY when the selection actually MOVES to a different chain.
    // Survey re-calls selectStreet on every click on the already-selected
    // street's centerline (SurveyorOverlay ~:375) — and that same click is what
    // seeds the drag anchor. Re-seeding there silently reset an operator who had
    // just ticked "Asymmetric", so the width drag mirrored and pulled the
    // block-facing curb along with the median-facing one (Waverly Place, whose
    // chains carry symmetric:true). The click you need in order to use the
    // setting must not be the click that destroys it.
    const prev = get().selectedStreet
    const st = get().centerlineData?.streets?.[idx]
    set({
      selectedStreet: idx, selectedNode: null, selectedSegmentOrdinal: null,
      ...(prev === idx ? {} : { editSidesSeparately: st?.measure?.symmetric === false }),
    })
  },
  selectNode: (idx) => set({ selectedNode: idx }),
  deselectStreet: () => set({ selectedStreet: null, selectedNode: null, selectedMeasurePoint: null, selectedSegmentOrdinal: null }),
  setMeasurePoint: (pt) => set({ selectedMeasurePoint: pt }),
  setSegmentOrdinal: (ord) => set({ selectedSegmentOrdinal: ord }),

  // In-memory only. These writes don't persist — the overlay file that
  // will back caps / couplers / measure is TBD. Current callers
  // (SurveyorPanel, MeasurePanel) mutate centerlineData for live feedback;
  // edits evaporate on reload.
  updateStreetField: (field, value) => {
    const { selectedStreet, centerlineData } = get()
    if (selectedStreet === null) return
    const streets = centerlineData.streets.map((s, i) =>
      i === selectedStreet ? { ...s, [field]: value } : s
    )
    set({ centerlineData: { ...centerlineData, streets } })
    get()._saveOverlay()
  },

  // Survey asphalt-edge authoring — set a chain's per-side asphalt half-width
  // (the outward stroke). Writes the per-STREET measure (centerlineData), the
  // field the TILE construction consumes via mergeLiveRibbons → effectiveMeasure
  // (blockCustoms are a figure-ground/Section concern and never reach tiles).
  // Same flow as Survey's existing caps/anchor/smooth authoring — live edit
  // rebuilds liveRibbons → the tile asphalt follows (WYSIWYG). mergeLiveRibbons
  // only carries a measure when BOTH sides are present, so always write a full
  // {left,right} seeded from the current measure. `mirror` writes both sides.
  setStreetPavementHW: (streetIdx, side, hw, mirror) => {
    const { centerlineData } = get()
    const st = centerlineData?.streets?.[streetIdx]
    if (!st) return
    const v = Math.min(30, Math.max(0.5, Number.isFinite(+hw) ? +hw : 0))
    const seedSide = (m) => ({ pavementHW: 5, treelawn: 1.5, sidewalk: 1.5, terminal: 'sidewalk', ...(m || {}) })
    const base = {
      left: seedSide(st.measure?.left),
      right: seedSide(st.measure?.right),
      symmetric: st.measure?.symmetric,
    }
    const other = side === 'left' ? 'right' : 'left'
    base[side] = { ...base[side], pavementHW: v }
    if (mirror) base[other] = { ...base[other], pavementHW: v }
    const streets = centerlineData.streets.map((s, i) =>
      i === streetIdx ? { ...s, measure: base } : s
    )
    set({ centerlineData: { ...centerlineData, streets } })
    get()._saveOverlay()
  },

  // Toggle a chain's `disabled` flag. Disabled chains stop contributing
  // ribbon geometry, edge strokes, silhouette, AND face-clip — but stay
  // selectable in Measure (dimmed) so the operator can re-enable.
  setStreetDisabled: (streetIdx, disabled) => {
    const { centerlineData } = get()
    const st = centerlineData.streets[streetIdx]
    if (!st) return
    const streets = centerlineData.streets.map((s, i) =>
      i === streetIdx ? { ...s, disabled: !!disabled } : s
    )
    set({ centerlineData: { ...centerlineData, streets } })
    get()._saveOverlay()
  },

  // Toggle a coupler at the given point index on the selected street.
  // Couplers carry world coords (x, z) so they re-project onto whichever
  // polyline a consumer is indexing (skeleton vs. ribbons differ in vertex
  // count). Endpoints can't be couplers — they're already chain boundaries.
  //
  // segmentMeasures is keyed by ordinal segment index (0 = first segment,
  // 1 = second, ...). Adding a coupler splits one segment into two: both new
  // ordinals inherit the parent's measure. Removing a coupler merges two
  // adjacent segments into one: the merged ordinal inherits the lower
  // (leftmost) segment's measure.
  toggleCoupler: (streetIdx, pointIdx) => {
    const { centerlineData } = get()
    const st = centerlineData.streets[streetIdx]
    if (!st) return
    const n = st.points.length
    if (pointIdx <= 0 || pointIdx >= n - 1) return
    const cur = (st.couplers || []).map(c => typeof c === 'number'
      ? { kind: 'split', pointIdx: c, x: st.points[c]?.[0], z: st.points[c]?.[1] }
      : c)
    const has = cur.findIndex(c => c.pointIdx === pointIdx) >= 0
    const next = has
      ? cur.filter(c => c.pointIdx !== pointIdx)
      : [...cur, { kind: 'split', pointIdx, x: st.points[pointIdx][0], z: st.points[pointIdx][1] }]
    next.sort((a, b) => a.pointIdx - b.pointIdx)

    // Map old ordinals → new ordinals to migrate segmentMeasures.
    const idxsBefore = cur.filter(c => c.kind === 'split').map(c => c.pointIdx).sort((a, b) => a - b)
    const idxsAfter = next.filter(c => c.kind === 'split').map(c => c.pointIdx).sort((a, b) => a - b)
    const oldSm = st.segmentMeasures || {}
    const newSm = {}
    if (idxsAfter.length === idxsBefore.length + 1) {
      // Added one coupler. The split ordinal is where the new index appears.
      const added = idxsAfter.find(i => !idxsBefore.includes(i))
      const splitOrd = idxsAfter.indexOf(added) // both new segments share this old ordinal
      for (let oldOrd = 0; oldOrd <= idxsBefore.length; oldOrd++) {
        const v = oldSm[String(oldOrd)]
        if (!v) continue
        if (oldOrd < splitOrd) newSm[String(oldOrd)] = v
        else if (oldOrd === splitOrd) {
          newSm[String(splitOrd)] = v
          newSm[String(splitOrd + 1)] = { left: { ...v.left }, right: { ...v.right }, symmetric: v.symmetric }
        } else newSm[String(oldOrd + 1)] = v
      }
    } else if (idxsAfter.length === idxsBefore.length - 1) {
      // Removed one coupler. The two segments at ordinal R and R+1 merge
      // into one new ordinal R, which inherits old R's measure.
      const removed = idxsBefore.find(i => !idxsAfter.includes(i))
      const mergeOrd = idxsBefore.indexOf(removed) // old ordinal of left half
      for (let oldOrd = 0; oldOrd <= idxsBefore.length; oldOrd++) {
        const v = oldSm[String(oldOrd)]
        if (!v) continue
        if (oldOrd <= mergeOrd) newSm[String(oldOrd)] = v
        else if (oldOrd === mergeOrd + 1) continue // dropped (merged into mergeOrd)
        else newSm[String(oldOrd - 1)] = v
      }
    } else {
      // No structural change — copy as-is.
      Object.assign(newSm, oldSm)
    }
    const streets = centerlineData.streets.map((s, i) =>
      i === streetIdx ? { ...s, couplers: next, segmentMeasures: newSm } : s
    )
    set({ centerlineData: { ...centerlineData, streets } })
    get()._saveOverlay()
  },

  // (Retired in the measure-authoring redesign: setStreetMeasure +
  // setSegmentMeasure were the chain-scope write paths. All authoring now
  // writes per-fe via setBlockEdgeCustom / writeBlockEdgeCustoms — the data
  // wall holds at the authoring surface. chain.measure / segmentMeasures
  // remain read-only pipeline inputs; no UI mutates them.)

  // ── Measurements ──────────────────────────────────────────
  measurements: [],
  selectedMeasurement: null, // { id, type, which?, index? }

  _loadMeasurements: async () => {
    try {
      const scene = get().scene
      if (!isValidMapId(scene)) return   // no town open
      const data = await fetchMeasurements(scene)
      if (get().scene !== scene) return   // switched mid-fetch — never land one town's measurements in another
      const ms = ((data && data.measurements) || []).map(m => {
        const ts = m.ts || []
        const mats = m.materials && m.materials.length === ts.length + 1
          ? m.materials
          : new Array(ts.length + 1).fill('none')
        return { ...m, ts, materials: mats }
      })
      set({ measurements: ms })
    } catch { /* ignore */ }
  },
  _saveMeasurements: () => {
    saveMeasurements({ measurements: get().measurements }, get().scene)
  },
  addMeasurement: (m) => {
    const ms = [...get().measurements, m]
    set({ measurements: ms })
    saveMeasurements({ measurements: ms }, get().scene)
  },
  deleteMeasurement: (id) => {
    const ms = get().measurements.filter(m => m.id !== id)
    const sel = get().selectedMeasurement
    set({
      measurements: ms,
      selectedMeasurement: sel && sel.id === id ? null : sel,
    })
    saveMeasurements({ measurements: ms }, get().scene)
  },
  updateMeasurementName: (id, name) => {
    const ms = get().measurements
    const m = ms.find(x => x.id === id)
    if (m) m.name = name
    set({ measurements: [...ms] })
    get()._saveMeasurements()
  },
  updateMeasurementMaterial: (id, segIdx, matId) => {
    const ms = get().measurements
    const m = ms.find(x => x.id === id)
    if (m) {
      if (!m.materials) m.materials = new Array((m.ts || []).length + 1).fill('none')
      m.materials[segIdx] = matId
    }
    set({ measurements: [...ms] })
    get()._saveMeasurements()
  },
  setSelectedMeasurement: (sel) => set({ selectedMeasurement: sel }),

  moveMeasurementPoint: (id, which, x, z) => {
    // which: 'p1' | 'p2'
    const ms = get().measurements
    const m = ms.find(v => v.id === id)
    if (m) { m[which] = { x, z } }
    set({ measurements: [...ms] })
  },

  moveMeasurementWaypoint: (id, wpIdx, t) => {
    const ms = get().measurements
    const m = ms.find(v => v.id === id)
    if (m) {
      m.ts[wpIdx] = Math.max(0.001, Math.min(0.999, t))
      m.ts.sort((a, b) => a - b)
    }
    set({ measurements: [...ms] })
  },

  addMeasurementWaypoint: (id, t) => {
    const ms = get().measurements
    const m = ms.find(v => v.id === id)
    if (m) {
      m.ts.push(t)
      m.ts.sort((a, b) => a - b)
      // Add a 'none' material for the new segment
      const segIdx = m.ts.indexOf(t)
      m.materials.splice(segIdx + 1, 0, 'none')
    }
    set({ measurements: [...ms] })
    get()._saveMeasurements()
  },

  finishMeasurementDrag: () => {
    get()._saveMeasurements()
  },
}))

export default useCartographStore

// Dev hook: expose the store on window for quick inspection.
if (typeof window !== 'undefined') window.cs = useCartographStore

// ⛔ No module-scope load (removed 2026-09-28). An `if (import.meta.hot) { … _loadCenterlines() … }` block here ran the
// WHOLE authoring load on every module evaluation under a dev server — not only on a hot swap — so any page that
// imported this store (the renderer's label pieces did) fetched a town's skeleton, overlay and design from
// /api/cartograph (the Ward's `[skeleton] load failed`). The authoring app loads its own data (CartographApp); a store
// edit now hot-reloads up to it, and a full reload re-runs that load. ▶ node checks/claims-a-town-page-fetches-no-authoring.mjs
