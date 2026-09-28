/**
 * bake-scene.js — write the Look's authoring snapshot to
 * `public/baked/<look>/scene.json`.
 *
 * scene.json is the contract Preview reads. v1 fields:
 *   - look          — Look id
 *   - generatedAt   — ms epoch
 *   - palette       — 12-color building tint palette
 *   - materialPhysics — per-material shader knobs (roughness/metalness/textureScale/textureStrength/emissive/emissiveIntensity)
 *   - materialColors  — per-material default colors (foundation, etc.)
 *   - layerColors / luColors — kept for potential future runtime use
 *
 * Channels baked as of 015d8e0 (SC.1 + SC.2 + SC.3): sky, ambient, hemi,
 * dirSun, dirMoon, constellations, milkyWay (SC.1); bloom, ao, exposure,
 * warmth, fill, mist, halo, grade, grain, shadow (SC.2/SC.3); skyGain
 * (sky-layer night-dim gain, 2026-06-07). Channels
 * still pending bake: per-shot camera tuning (SC.5), arch tuning (SC.7),
 * meteorologist clouds consumer-side decision (SC.6). Time-of-day defaults
 * & sun-curve overrides (SC.4) were audited empty — DawnTimeline doesn't
 * persist anything to bake yet. Tracked as "Slab completeness" in
 * `cartograph/BACKLOG.md` (sub-phases SC.5–SC.7 remaining); load-bearing
 * principle in `cartograph/FEATURES.md` "The slab carries the operator's
 * *full* authored product" and memory `slab-carries-full-authored-product`.
 */

// ⛔ DECLARED NON-SCENE-KEYED WRITER — checks/claims-writers-name-the-scene.mjs reads this
// marker and will FAIL if it is absent from a writer that is reachable as a CLI entry point.
// A writer is guilty until this line says otherwise, with a reason.
// @scene-independent: LOOK-KEYED. Reads public/looks/<look>/design.json and writes
//     public/baked/<look>/scene.json. Touches no data/<scene>/ path, so an explicit scene
//     would be a refusal the operator cannot act on. --scene is accepted for CLI uniformity
//     and says out loud that it is ignored.
import { authoredCategories } from '../src/lib/categoryColor.js'
import { validateIdentity } from '../src/lib/townIdentity.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { writeIfChanged } from './io.js'
import { assertBakeTarget } from './bake-target.js'
import { migrateSkyChannel } from '../src/cartograph/skyGrid.js'
import { assertKeyframesAimed, assertHeroMotion } from '../src/preview/heroAnim.js'
import {
  SHOTS_FLAT_DEFAULTS, BROWSE_HEADING_FLAT_DEFAULTS, migrateArchLight, CLOUDS_FLAT_DEFAULTS, kitDayChannel,
} from '../src/cartograph/skyLightChannels.js'

// SC.5 — strip transient runtime-UI fields (preview, speed) off the
// heroMotion artifact before baking. Production has no use for them.
function stripTransientHeroMotion(m) {
  if (!m || typeof m !== 'object') return null
  const { length, mode } = m
  return { length, mode }
}

import { DEFAULT_PALETTE } from '../src/lib/buildingTint.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')


export async function bakeScene({ look } = {}) {
  assertBakeTarget('bake-scene', look)
  const designPath = join(ROOT, 'public', 'looks', look, 'design.json')
  const outDir     = join(ROOT, 'public', 'baked', look)
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

  let design = {}
  if (existsSync(designPath)) {
    design = JSON.parse(readFileSync(designPath, 'utf-8'))
  } else {
    console.warn(`[bake-scene] no design.json at ${designPath}; using defaults`)
  }

  const scene = {
    version: 1,
    look,
    bakedAt:         Date.now(),
    palette:         design.buildingPalette || DEFAULT_PALETTE,
    // The wall materials' own swatches — the player's live recolour needs them beside the base palette (v3).
    wallPalettes:    design.wallPalettes || {},
    materialPhysics: design.materialPhysics || {},
    materialColors:  design.materialColors  || {},
    // The categories whose neon colour the Look authored (materialColors.neon_<id>); every other category draws the
    // kit's neutral default. Its presence also marks a scene baked with the town-palette rule (src/lib/categoryColor.js).
    neonAuthored:    authoredCategories(design.materialColors),
    // How the town looks — mark, accent, rating mark, lit tint (src/lib/townIdentity.js): only what the Look authored,
    // checked here (a malformed channel fails the bake). Its presence marks a scene baked with the identity block.
    identity:        validateIdentity(design.identity, `${look}'s design.json`),
    layerColors:     design.layerColors     || {},
    luColors:        design.luColors        || {},
    layerVis:        design.layerVis        || {},
    // ⛔ THE TOWN'S VERTICAL EXAGGERATION — authored, and it MUST ship in the slab or the
    // runtime falls back to the kit default and the operator's dial does nothing.
    // `?? 1`, never `|| 1`: an authored 0 means FLAT and is a real choice a sentinel would eat.
    // Was a hardcoded 1.5 in src/lib/terrainCommon.js, chosen against LS's 35 m of relief and
    // applied to altadena's 1,480 m (BRIEF-ls-bleed-excision site 15, ruled 2026-09-20).
    terrainExag:     design.terrainExag ?? 1,
    // ⭐ THE SURFACE OVERRIDES — the operator's sparse layer over the kit's surface table
    // (`cartograph/surfaces.mjs`): `{ classes: { <lu>: <surface> | null }, params: { <surface>:
    // { <param>: value } } }`. Carried verbatim; the runtime validates and names bad rows.
    // Absent ⇒ {} ⇒ the kit table, which is the honest default, not a stand-in.
    surfaces:        design.surfaces        ?? {},
    lampGlow:        design.lampGlow        || kitDayChannel('lampGlow'),
    neon:            design.neon            || kitDayChannel('neon'),
    // SC.1 — sky / lighting / celestial. Sky pivoted (2026-05-20 ADR) to
    // kit-canonical 4 anchor cards in skyGrid.js + per-Look sparse
    // overrides in scene.json. migrateSkyChannel normalizes any legacy
    // shape (1-layer, 4-anchor bff87b5, or new) to { overrides: [...] }.
    sky:            migrateSkyChannel(design.sky),
    ambient:        design.ambient        || kitDayChannel('ambient'),
    hemi:           design.hemi           || kitDayChannel('hemi'),
    dirSun:         design.dirSun         || kitDayChannel('dirSun'),
    dirMoon:        design.dirMoon        || kitDayChannel('dirMoon'),
    constellations: design.constellations || kitDayChannel('constellations'),
    stars:          design.stars          || kitDayChannel('stars'),
    milkyWay:       design.milkyWay       || kitDayChannel('milkyWay'),
    // SC.2 + SC.3 — post-FX channels (Post card + Sky & Light). An unauthored channel bakes THE KIT'S DAY
    // (skyLightChannels.js#kitDayChannel) — the same channel Stage hydrates and production first-paints.
    bloom:    design.bloom    || kitDayChannel('bloom'),
    ao:       design.ao       || kitDayChannel('ao'),
    exposure: design.exposure || kitDayChannel('exposure'),
    warmth:   design.warmth   || kitDayChannel('warmth'),
    fill:     design.fill     || kitDayChannel('fill'),
    mist:     design.mist     || kitDayChannel('mist'),
    halo:     design.halo     || kitDayChannel('halo'),
    // Sky Layer Gain — exposure scoped to the sky dome.
    skyGain:  design.skyGain  || kitDayChannel('skyGain'),
    grade:    design.grade    || kitDayChannel('grade'),
    grain:    design.grain    || kitDayChannel('grain'),
    dof:      design.dof      || kitDayChannel('dof'),
    shadow:   design.shadow   || kitDayChannel('shadow'),
    // Canopy Light (Surfaces → Trees) — how the tree impostor CARDS answer to the
    // scene's key light. Every town carries it, and an unauthored one carries
    // `directional: 0` = the historical flat dimmer, so emitting it unconditionally
    // changes no existing map. ⛔ It has to be named HERE or it does not ship:
    // this object is an explicit list, not a spread of design.json, so a channel
    // that persists and previews perfectly in Stage still reaches no viewer until
    // it appears on this line. That is the design.json-is-not-scene.json trap, and
    // it fails in the worst direction — the operator authors, sees it work, and
    // the slab quietly carries nothing.
    canopy:   design.canopy   || kitDayChannel('canopy'),
    // SC.5 — per-shot camera + Hero authoring + Browse heading. Runtime
    // inputs (Browse altitude, Hero target, Street position/target)
    // explicitly NOT baked: they come from computeBrowseAltitude(aspect),
    // Hero subject centroid, and the double-click handler respectively.
    // See `hardwires-come-out-when-channels-install` category 3.
    shots:         design.shots         || { values: JSON.parse(JSON.stringify(SHOTS_FLAT_DEFAULTS)) },
    browseHeading: design.browseHeading || { values: { ...BROWSE_HEADING_FLAT_DEFAULTS } },
    // SC.5 — the authored Browse frame. null when the town is unframed; ⛔ NO
    // default, so an unframed town bakes `null` and each camera derives as before.
    browseFrame:   design.browseFrame || null,
    heroSubject:   design.heroSubject   || null,
    dofFocus:      design.dofFocus      || null,   // the picked focus point, or null = the camera's aim
    // ⭐ THE HERO SHOT — keys `{ position, target, fov, t }` (t = a fraction of
    // the length; the first at 0) and, for 2+ keys, motion `{ length (s), mode:
    // 'bounce' | 'loop' }`. Every key carries its own aim and its own time, and
    // both are refused loudly here if missing (heroAnim.js#assertKeyframesAimed).
    heroKeyframes: assertKeyframesAimed(design.heroKeyframes || [], `bake-scene ${look}`),
    // ⛔ No default motion: a static shot (0–1 key) needs none, and an animated
    // one without its own { length, mode } is refused here, before it ships.
    heroMotion:    assertHeroMotion(design.heroKeyframes || [], stripTransientHeroMotion(design.heroMotion), `bake-scene ${look}`),
    // SC.7 — arch + horizon authoring. The Gateway Arch landmark's
    // placement / transform / uplights and the ground disc's radius +
    // feathering. Promoted from the module-scope `archState` bridge in
    // src/stage/StageApp.jsx — operator's arch authoring now persists
    // across reloads and reaches production via the slab.
    // ⛔ The arch is a STAGE SET-PIECE a Look INSTALLS by carrying the block —
    // same rule as the landscape below. Stamping ARCH_FLAT_DEFAULTS into EVERY
    // scene.json is what made the channel's presence meaningless and forced the
    // renderer to gate on a look NAME instead (which then dropped the arch from
    // Hi-Pointe–DeMun, a St. Louis hood that had it). No block ⇒ no arch ⇒ the
    // key is omitted, and the renderer gates on the data like every other
    // look-keyed consumer.
    ...(design.arch ? { arch: design.arch } : {}),
    // ⛔ The landscape is a STAGE SET-PIECE, opted into per-Look via
    // design.landscape.source (a20619cc) — NOT a channel every hood carries. The
    // `|| LANDSCAPE_FLAT_DEFAULTS` fallback stamped a San Gabriel config (snowline
    // 1500, distance 5400 — the defaults are misnamed; they hold the REAL mountain
    // values) into EVERY scene.json, Lafayette Square included. Inert today (no GLB
    // ⇒ nothing renders) but it is the "accidental reading/load-in" the intake↔Stage
    // separation exists to prevent, and it would have landed on LS's slab the next
    // time its Look was baked. No source ⇒ no landscape ⇒ the key is omitted, which
    // is what LS's scene.json already carries today.
    ...(design.landscape?.source ? { landscape: design.landscape } : {}),
    archLight: migrateArchLight(design),
    setPieceLight: design.setPieceLight || kitDayChannel('setPieceLight'),   // the set-piece's uplights
    lantern:   design.lantern   || kitDayChannel('lantern'),
    // SC.6 — Meteorologist coupler scaffolding. Forward-compat field for
    // the future <Atmosphere /> raymarched runtime. v1's CloudDome
    // ignores `clouds`; the field round-trips through bake so Atmosphere
    // v3 plugs in mechanically. `preset: 'auto'` defers selection to the
    // Almanac (public/clouds/almanac.json) at render time per
    // src/lib/almanac-eval.js.
    clouds:  design.clouds  || { values: { ...CLOUDS_FLAT_DEFAULTS } },
    // SC.4 — time defaults / sun-curve overrides. DawnTimeline today is
    // purely a Stage-scrub UI (calls setTime on useTimeOfDay directly);
    // no design.time or sun-curve override is persisted. Field omitted
    // until DawnTimeline grows a "save default hour" or curve surface.
  }

  // Channel-variant cascade (HANDOFF-channel-variant-cascade.md, Phase 3) —
  // per-shot LOOK overrides. SPARSE: emit only when the Look has forks so an
  // unforked Look's scene.json stays byte-identical to before (no key). Each
  // entry is { <shot>: { <channel>: <channel-def> } }; production's
  // useSceneJson resolves the active shot off these (resolveShotScene =
  // {...base, ...shotLooks[shot]}). The Stage writes only valid LOOK channels,
  // so it round-trips verbatim.
  if (design.shotLooks && typeof design.shotLooks === 'object'
      && Object.keys(design.shotLooks).length > 0) {
    scene.shotLooks = design.shotLooks
  }

  const outPath = join(outDir, 'scene.json')
  const wrote = writeIfChanged(outPath, JSON.stringify(scene, null, 2))
  console.log(`[bake-scene] ${wrote ? 'wrote' : 'unchanged'} ${outPath}`)
  return scene
}

async function main() {
  // ⛔ bake-scene is LOOK-KEYED: it reads public/looks/<look>/design.json and
  // nothing scene-derived, so it takes NO scene guard — a refusal the operator
  // cannot act on is noise. But an accepted flag that does nothing is a small
  // silent substitution, and it is how the next reader concludes --scene is
  // honoured here. So it is accepted (serve.js passes it for CLI uniformity)
  // and its being ignored is SAID OUT LOUD, once, when it is actually passed.
  let look = null
  for (const arg of process.argv.slice(2)) {
    let m
    if ((m = arg.match(/^--look=(.+)$/))) look = m[1]
    else if (/^--scene=/.test(arg)) {
      console.log(`[bake-scene] note: ${arg} ignored — this bake is look-keyed (reads looks/<look>/design.json only).`)
    }
  }
  await bakeScene({ look })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1) })
}
