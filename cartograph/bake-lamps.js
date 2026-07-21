/**
 * bake-lamps.js — passthrough bake of street_lamps.json into the Look's
 * baked folder. Lamp placements aren't authored per-Look today; this
 * step exists so Preview reads only from the bake bundle (matches the
 * pure-Three-bake architecture).
 *
 * Future: per-Look lamp authoring (different lamp models, per-Look
 * positioning, color overrides) writes here.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { writeIfChanged } from './io.js'
import { loadSceneTerrain } from './terrainLoad.js'
import { makeGroundSampler } from './groundSampler.js'
import { makeMembership } from './neighborhood-membership.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// Read a .bin as a clean ArrayBuffer (Buffer is a view into a shared pool).
function readAB(path) {
  const u8 = readFileSync(path)
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)
}

// Bake the per-lamp ground anchor: the raw field where the DRAWN ground sits
// under each lamp (groundSampler over the look's baked ground mesh), so the
// runtime rigid-lifts the lamp onto the rendered surface instead of the smooth
// field — no float. Mutates each lamp with `groundRaw`. Needs the look's ground
// bake to exist (it runs earlier in the chain); skips with a warning otherwise.
function anchorLampsToGround(lamps, outDir, scene) {
  const groundJsonPath = join(outDir, 'ground.json')
  const groundBinPath  = join(outDir, 'ground.bin')
  if (!existsSync(groundJsonPath) || !existsSync(groundBinPath)) return 0
  const gj = JSON.parse(readFileSync(groundJsonPath, 'utf-8'))
  const gAB = readAB(groundBinPath)
  // Per-scene terrain (cartograph/data/<scene>/clean/terrain.*); flat fallback
  // if this installation has none baked yet.
  const terrain = loadSceneTerrain(scene) || { getElevationRaw: () => 0 }
  const sampler = makeGroundSampler(gj, gAB, terrain)
  for (const l of lamps) l.groundRaw = sampler.groundRawAt(l.x, l.z)
  return lamps.length
}

// Scene-keyed lamp SOURCE (the old TODO step C, resolved 2026-07-09). A scene
// with its own municipal/OSM lamps (`raw/osm_street_lamps.json`) derives real
// placements PROJECTED THROUGH ITS CURRENT `geography.json` — so lamps share the
// building frame and re-derive correctly on every re-center (the raw keeps
// lon/lat, so there's no stale-frame trap like the assessor parcels had; see
// cartograph/INTAKE.md). LS has no OSM lamp file → falls back to its hand/
// procedural `src/data/street_lamps.json` (already in the local frame).
// The OSM lamp fetch is wider than the poured hood, so lamps are bounded by the
// neighborhood — the SAME membership test buildings and trees use
// (`neighborhood-membership.mjs`, `NEIGHBORHOOD-INPUTS §5.2`).
//
// ⭐ A DISSOLVE, not a cut (Jacob 2026-07-15: literal inside the neighborhood
// proper; outside, inside the radius, we watch for GPU — and *"I'd rather a
// dissolve [than an] on/off edge fade dichotomy"*). This used to hard-clip at the
// polygon, which ended the lamps at a seam the ground doesn't have. Now they thin
// across the ground's own authored fade band and reach zero at the rim.
//
// Was a private copy of the point-in-polygon membership test; folded onto the
// shared one so the hood's edge means one thing for every object standing in it.
function clipToBoundary(lamps, scene) {
  const bp = join(ROOT, 'cartograph', 'data', scene, 'neighborhood_boundary.json')
  if (!existsSync(bp)) return lamps
  const m = makeMembership(bp)
  const kept = lamps.filter(l => m.keep(l.x, l.z, 23))
  const inHood = kept.filter(l => m.isInside(l.x, l.z)).length
  console.log(`  Lamps: ${inHood} inside the neighborhood proper (literal) / ${kept.length - inHood} dissolving through the greater circle` +
    (m.hasPolygon ? '' : '  ⚠️ no boundary-street polygon — disc standing in'))
  return kept
}

function loadLampsForScene(scene) {
  const osmPath = join(ROOT, 'cartograph', 'data', scene, 'raw', 'osm_street_lamps.json')
  const geoPath = join(ROOT, 'cartograph', 'data', scene, 'geography.json')
  if (existsSync(osmPath) && existsSync(geoPath)) {
    const g = JSON.parse(readFileSync(geoPath, 'utf-8'))
    const toLocal = (lon, lat) => [
      Math.round((lon - g.lon) * g.lonToMeters * 10) / 10,
      Math.round((g.lat - lat) * g.latToMeters * 10) / 10,
    ]
    const raw = JSON.parse(readFileSync(osmPath, 'utf-8'))
    const els = raw.elements || raw
    const lamps = []
    for (const e of (Array.isArray(els) ? els : [])) {
      if (e?.tags?.highway !== 'street_lamp') continue
      if (typeof e.lat !== 'number' || typeof e.lon !== 'number') continue
      const [x, z] = toLocal(e.lon, e.lat)
      lamps.push({ x, z, park: false })
    }
    const clipped = clipToBoundary(lamps, scene)
    console.log(`[bake-lamps] scene=${scene}: derived ${lamps.length} OSM street lamps → ${clipped.length} inside the boundary (projected to current frame)`)
    return clipped
  }
  // No per-scene lamp source. `src/data/street_lamps.json` is LAFAYETTE SQUARE'S
  // OWN census — it predates the per-scene convention and is still LS's canonical
  // file, so LS legitimately reads it here. EVERY OTHER SCENE GETS NOTHING.
  //
  // This used to be unconditional, which meant any town without lamp data baked
  // LS's 80 lamps under its own name, in its own coordinate frame — plausible
  // enough that nobody investigated. Absence must render nothing, never another
  // installation's data (`BRIEF-ls-bleed-excision.md` site 1).
  if (scene === 'lafayette-square') {
    const raw = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'street_lamps.json'), 'utf-8'))
    return raw.lamps || raw
  }
  console.warn(
    `[bake-lamps] scene=${scene}: no raw/osm_street_lamps.json (or geography.json) — ` +
    `baking ZERO lamps. This scene has no lamp census; acquire one via the Intake ` +
    `panel (OSM highway=street_lamp). Refusing to substitute another scene's lamps.`)
  return []
}

export async function bakeLamps({ look = 'default', scene = 'lafayette-square' } = {}) {
  const outDir  = join(ROOT, 'public', 'baked', look)
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

  const lamps = loadLampsForScene(scene)
  const anchored = anchorLampsToGround(lamps, outDir, scene)
  const out = {
    version: 1,
    look,
    count: lamps.length,
    lamps,
  }
  const outPath = join(outDir, 'lamps.json')
  const wrote = writeIfChanged(outPath, JSON.stringify(out, null, 2))
  console.log(`[bake-lamps] ${wrote ? 'wrote' : 'unchanged'} ${outPath} (${lamps.length} lamps${anchored ? `, ${anchored} ground-anchored` : ' — NO ground bake, un-anchored'})`)
}

async function main() {
  let look = 'default', scene = 'lafayette-square'
  for (const arg of process.argv.slice(2)) {
    let m
    if ((m = arg.match(/^--look=(.+)$/)))      look  = m[1]
    else if ((m = arg.match(/^--scene=(.+)$/))) scene = m[1]
  }
  await bakeLamps({ look, scene })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1) })
}
