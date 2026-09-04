#!/usr/bin/env node
/**
 * claims-cards-light-from-the-scene-key — THE IMPOSTOR CARDS MUST LIGHT FROM THE
 * SCENE'S KEY LIGHT, AND THERE MUST BE EXACTLY ONE DERIVATION OF WHERE THAT IS.
 *
 * ⛔ THE DEFECT THIS PINS (measured 2026-09-03). Tree impostor cards are
 * MeshBasicMaterial by design — they cannot join three's light rig, so they cannot
 * see the sun the way the mesh trees beside them do. Their entire light model was
 * two scalars, `uAmbient + uSun * ao`: a global DIMMER. The cards were dimmed by the
 * weather and never lit by anything, so the two representations of the same tree
 * disagreed about where the light was.
 *
 * ⭐⭐ WHY THIS NEEDS A CHECK RATHER THAN A COMMENT. The fix is a DIRECTION, and a
 * direction is the easiest thing in this repo to derive twice. The scene already
 * computes the key light's world position; the tempting shortcut is to recompute a
 * sun vector at the consumer from time-of-day. Two derivations of one physical fact
 * is the failure that produced BOTH the tree-height bug and the capture-frame bug
 * (`arborist/ARCHITECTURE.md`: "one record, two frames, and nothing said a word").
 * A second derivation does not throw — it drifts, and it drifts most at exactly the
 * moments the light is most interesting: dawn, dusk, and after dark, when the key
 * stops being the sun and becomes the sun→moon blend.
 *
 * ⭐ Nothing here is enumerated or restated: every assertion greps the live source,
 * so it cannot go stale the way a written-down number can.
 *
 *   node scratch/claims-cards-light-from-the-scene-key.mjs
 *   exit 0 = one publisher, one consumer chain · exit 2 = the chain is broken or forked
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8')

const CELESTIAL = 'src/components/CelestialBodies.jsx'
const SKYSTATE = 'src/hooks/useSkyState.js'
const DRIVER = 'src/components/OverheadTrees.jsx'
const MATERIAL = 'src/components/treeAtlasMaterial.js'

const celestial = read(CELESTIAL)
const sky = read(SKYSTATE)
const driver = read(DRIVER)
const material = read(MATERIAL)

let failed = 0
const check = (ok, label, detail) => {
  if (ok) { console.log(`  ✅ ${label}`) }
  else { failed++; console.log(`  ⛔ ${label}\n       ${detail}`) }
}

console.log('The impostor cards light from the scene key — one fact, one publisher\n')

// ── 1. THE PUBLISHER ─────────────────────────────────────────────────────────
// The key direction must be taken off `primary.lightPosition` — the very object the
// <directionalLight> is constructed from — and not from a private re-derivation.
check(
  /_keyD\.copy\(primary\.lightPosition\)\.normalize\(\)/.test(celestial),
  'CelestialBodies derives the key direction from primary.lightPosition',
  `${CELESTIAL}: expected \`_keyD.copy(primary.lightPosition).normalize()\`. If the key `
  + `direction is computed any other way it is a SECOND derivation of the light's position.`,
)
check(
  /_celestial:\s*\{[\s\S]{0,400}?keyDirection:\s*_keyD\.clone\(\)/.test(celestial),
  'CelestialBodies publishes keyDirection on the celestial payload',
  `${CELESTIAL}: \`keyDirection\` is missing from the _celestial object, so nothing outside `
  + `the component can see it.`,
)

// ⛔ THE FORK GUARD. The night key is the sun→moon BLEND, so a consumer that lights
// from `sunDirection` lights from below the horizon at midnight while every mesh in
// the frame lights from the moon. The cards must not read the sun.
check(
  !/uKeyDir\.value\.copy\(\s*\w+\.sunDirection\s*\)/.test(driver),
  'the card driver does NOT light from sunDirection',
  `${DRIVER}: the driver copies \`sunDirection\` into uKeyDir. sunDirection is the SUN; `
  + `after dusk the scene's key light is the sun→moon blend. Read \`keyDirection\`.`,
)

// ── 2. THE STORE ─────────────────────────────────────────────────────────────
check(
  /keyDirection:\s*new THREE\.Vector3\(/.test(sky),
  'useSkyState declares keyDirection',
  `${SKYSTATE}: no \`keyDirection\` field — the publisher writes into nothing.`,
)
check(
  /if \(data\.keyDirection\) state\.keyDirection\.copy\(data\.keyDirection\)/.test(sky),
  'setCelestial copies keyDirection into the store vector',
  `${SKYSTATE}: setCelestial ignores data.keyDirection, so the published value is dropped `
  + `silently and every consumer keeps the initial default — which POINTS STRAIGHT UP and `
  + `looks like plausible overhead lighting rather than a broken wire.`,
)

// ── 3. THE CONSUMER ──────────────────────────────────────────────────────────
check(
  /uKeyDir\.value\.copy\(\s*\w+\.keyDirection\s*\)/.test(driver),
  'the card driver copies useSkyState.keyDirection into uKeyDir',
  `${DRIVER}: nothing writes uKeyDir from the store, so the cards keep the default (0,1,0).`,
)
check(
  /const \w+ = useSkyState\.getState\(\)/.test(driver),
  'the card driver reads the sky store directly (no re-render cascade)',
  `${DRIVER}: expected a getState() read inside the frame loop.`,
)

// ── 4. BOTH CARRIERS, ONE MODEL ──────────────────────────────────────────────
// The hero billboard and the overhead disc are two constructions of ONE tree. If only
// one of them binds the light uniforms, the map lights inconsistently by camera mode
// — and Browse vs Hero is exactly the seam nobody looks at twice.
const binder = material.match(/function bindCardLightUniforms\(shader\)\s*\{[\s\S]*?\n\}/)
check(
  !!binder && /uKeyDir/.test(binder[0]) && /uKeyColor/.test(binder[0]) && /uLitCards/.test(binder[0]),
  'bindCardLightUniforms binds the key direction, colour and flag',
  `${MATERIAL}: bindCardLightUniforms is missing or does not bind the light uniforms.`,
)
for (const stamp of ['injectOverheadStamp', 'injectHeroImpostorStamp']) {
  const body = material.match(new RegExp(`export function ${stamp}\\([\\s\\S]*?\\n\\}\\n`))
  check(
    !!body && /bindCardLightUniforms\(shader\)/.test(body[0]),
    `${stamp} binds the shared card light uniforms`,
    `${MATERIAL}: ${stamp} does not call bindCardLightUniforms, so its carrier keeps the `
    + `old scalar dimmer while the other carrier lights directionally.`,
  )
}

// ── 5. DEFAULT OFF ───────────────────────────────────────────────────────────
// The rule this surface runs on (InstancedTrees.jsx): a shared change ships as a knob
// defaulting to TODAY'S values, so the map is unchanged until someone turns it.
check(
  /uLitCards:\s*\{ value: 0 \}/.test(material),
  'uLitCards defaults to 0 — the map is unchanged until someone turns the knob',
  `${MATERIAL}: uLitCards does not default to 0. A shared render change that defaults ON `
  + `moves every town's map without anyone asking for it.`,
)
check(
  /if \(uLitCards <= 0\.0\) return flatC;/.test(material),
  'the flag-off path returns the old value by construction, not by arithmetic',
  `${MATERIAL}: expected an early return in litCardsRelight. Relying on mix(x, y, 0.0) `
  + `makes "unchanged when off" a floating-point claim instead of a structural one.`,
)

// ── 6. THE AUTHORED CHANNEL REACHES THE SLAB ────────────────────────────────
// ⛔⛔ THE TRAP THIS EXISTS FOR: design.json is NOT scene.json. `bake-scene.js` builds
// its output as an EXPLICIT object literal, not a spread of design.json, so a channel
// can persist in Stage, preview perfectly, survive a reload — and reach no viewer,
// because nothing named it on that line. It fails in the worst possible direction:
// the operator authors, watches it work, and the slab quietly carries nothing.
const CHANNELS = 'src/cartograph/skyLightChannels.js'
const STORE = 'src/cartograph/stores/useCartographStore.js'
const BAKE = 'cartograph/bake-scene.js'
const SURFACES = 'src/cartograph/CartographSurfaces.jsx'
const TREES = 'src/components/InstancedTrees.jsx'

const channels = read(CHANNELS)
const store = read(STORE)
const bake = read(BAKE)
const surfaces = read(SURFACES)
const trees = read(TREES)

check(
  /export const CANOPY_FLAT_DEFAULTS = \{ directional: 0,/.test(channels),
  'the canopy channel defaults to directional: 0 — the historical look',
  `${CHANNELS}: a shared render channel that defaults to anything else moves every `
  + `already-poured town's map without anyone asking for it.`,
)
check(
  /_grp\('canopy',/.test(store),
  'the store hydrates + persists the canopy channel to design.json',
  `${STORE}: no _grp('canopy', …) in DESIGN_FIELDS, so the operator's edit does not survive a reload.`,
)
check(
  /canopy:\s+design\.canopy\s+\|\|/.test(bake),
  'bake-scene names `canopy` — the channel actually reaches scene.json',
  `${BAKE}: \`canopy\` is missing from the scene object. This is the one that does not `
  + `announce itself: Stage will author it, persist it and preview it correctly, and the `
  + `SLAB WILL CARRY NOTHING. If it is not baked in, the public never sees it.`,
)
check(
  /canopyChannel=\{scene\?\.canopy\}/.test(trees),
  'the runtime reads the BAKED channel off scene, not design.json',
  `${TREES}: the driver is not fed scene?.canopy, so the slab's authored value is ignored.`,
)
check(
  /kind: 'canopy_light'/.test(surfaces) && /function CanopyLightEditor/.test(surfaces),
  'Surfaces → Trees carries the Canopy Light control',
  `${SURFACES}: the operator has no way to author this without a URL parameter, which `
  + `does not ship.`,
)
// The live dial must LATCH, or the per-frame channel resolve overwrites the operator's
// A/B 60x a second and the dial silently appears to do nothing.
check(
  /if \(!litCards\.overridden\)/.test(read(DRIVER)),
  'the live dial latches over the authored channel while A/B-ing',
  `${DRIVER}: the frame loop writes the authored value unconditionally, so __setLitCards `
  + `is overwritten every frame and reads as broken.`,
)

console.log()
if (failed) {
  console.log(`⛔ ${failed} link(s) in the card-lighting chain are broken or forked.`)
  process.exit(2)
}
console.log('✅ one key-light derivation, published once, consumed by both card carriers.')
