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
 * Channels baked as of c333e50 (SC.1): sky, ambient, hemi, dirSun, dirMoon,
 * constellations, milkyWay. Channels still pending bake: post-FX (bloom/
 * AO/DOF/grade/grain), exposure/tonemapping, per-shot camera tuning, arch
 * tuning, meteorologist clouds (consumer side). Time-of-day defaults &
 * sun-curve overrides (SC.4) were audited empty — DawnTimeline doesn't
 * persist anything to bake yet. Tracked as "Slab completeness" in
 * `cartograph/BACKLOG.md` (sub-phases SC.2–SC.7 remaining); load-bearing
 * principle in `cartograph/FEATURES.md` "The slab carries the operator's
 * *full* authored product" and memory `slab-carries-full-authored-product`.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { writeIfChanged } from './io.js'
import { SKY_DEFAULTS } from '../src/cartograph/skyGrid.js'
import {
  AMBIENT_FLAT_DEFAULTS, HEMI_FLAT_DEFAULTS,
  DIRSUN_FLAT_DEFAULTS, DIRMOON_FLAT_DEFAULTS,
  CONSTELLATIONS_FLAT_DEFAULTS, MILKYWAY_FLAT_DEFAULTS,
  BLOOM_FLAT_DEFAULTS, AO_FLAT_DEFAULTS, EXPOSURE_FLAT_DEFAULTS,
  WARMTH_FLAT_DEFAULTS, FILL_FLAT_DEFAULTS,
  MIST_FLAT_DEFAULTS, HALO_FLAT_DEFAULTS,
  GRADE_FLAT_DEFAULTS, GRAIN_FLAT_DEFAULTS, SHADOW_FLAT_DEFAULTS,
} from '../src/cartograph/skyLightChannels.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const DEFAULT_PALETTE = [
  '#dcdcdc', '#a0522d', '#cd853f', '#8b2500',
  '#d2b48c', '#778899', '#8b4513', '#a52a2a',
  '#f5deb3', '#696969', '#b22222', '#808080',
]

export async function bakeScene({ look = 'default' } = {}) {
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
    materialPhysics: design.materialPhysics || {},
    materialColors:  design.materialColors  || {},
    layerColors:     design.layerColors     || {},
    luColors:        design.luColors        || {},
    layerVis:        design.layerVis        || {},
    lampGlow:        design.lampGlow        || { grass: 0.06, trees: 0.40, pool: 1.0 },
    neon:            design.neon            || { values: { core: 0, tube: 0, bleed: 0 } },
    // SC.1 — sky / lighting / celestial. Operator authors via Sky & Light
    // panel; defaults seeded from skyGrid.js + skyLightChannels.js so an
    // unauthored Look renders identically to today's hardcoded shader.
    sky:            design.sky            || { values: { ...SKY_DEFAULTS } },
    ambient:        design.ambient        || { values: { ...AMBIENT_FLAT_DEFAULTS } },
    hemi:           design.hemi           || { values: { ...HEMI_FLAT_DEFAULTS } },
    dirSun:         design.dirSun         || { values: { ...DIRSUN_FLAT_DEFAULTS } },
    dirMoon:        design.dirMoon        || { values: { ...DIRMOON_FLAT_DEFAULTS } },
    constellations: design.constellations || { values: { ...CONSTELLATIONS_FLAT_DEFAULTS } },
    milkyWay:       design.milkyWay       || { values: { ...MILKYWAY_FLAT_DEFAULTS } },
    // SC.2 + SC.3 — post-FX channels (Post card + Sky & Light). Operator
    // authors via cartograph sliders; defaults seeded from
    // skyLightChannels.js so an unauthored Look renders identically to
    // today's hardcoded post-FX literals.
    bloom:    design.bloom    || { values: { ...BLOOM_FLAT_DEFAULTS } },
    ao:       design.ao       || { values: { ...AO_FLAT_DEFAULTS } },
    exposure: design.exposure || { values: { ...EXPOSURE_FLAT_DEFAULTS } },
    warmth:   design.warmth   || { values: { ...WARMTH_FLAT_DEFAULTS } },
    fill:     design.fill     || { values: { ...FILL_FLAT_DEFAULTS } },
    mist:     design.mist     || { values: { ...MIST_FLAT_DEFAULTS } },
    halo:     design.halo     || { values: { ...HALO_FLAT_DEFAULTS } },
    grade:    design.grade    || { values: { ...GRADE_FLAT_DEFAULTS } },
    grain:    design.grain    || { values: { ...GRAIN_FLAT_DEFAULTS } },
    shadow:   design.shadow   || { values: { ...SHADOW_FLAT_DEFAULTS } },
    // SC.4 — time defaults / sun-curve overrides. DawnTimeline today is
    // purely a Stage-scrub UI (calls setTime on useTimeOfDay directly);
    // no design.time or sun-curve override is persisted. Field omitted
    // until DawnTimeline grows a "save default hour" or curve surface.
  }

  const outPath = join(outDir, 'scene.json')
  const wrote = writeIfChanged(outPath, JSON.stringify(scene, null, 2))
  console.log(`[bake-scene] ${wrote ? 'wrote' : 'unchanged'} ${outPath}`)
  return scene
}

async function main() {
  let look = 'default', _scene = 'lafayette-square'
  for (const arg of process.argv.slice(2)) {
    let m
    if ((m = arg.match(/^--look=(.+)$/)))      look   = m[1]
    else if ((m = arg.match(/^--scene=(.+)$/))) _scene = m[1]
  }
  // bake-scene reads design.json only (per-Look); --scene is accepted for
  // CLI uniformity but doesn't change the inputs today.
  await bakeScene({ look })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1) })
}
