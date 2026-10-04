/**
 * bake-lamps.js — the lamp CENSUS for a Look: every well unioned, each lamp stamped
 * with where it came from, then seated on the drawn ground.
 *
 * ⭐ REAL WHERE REAL, DERIVED WHERE NECESSARY (Jacob, 2026-09-21; ROADMAP H-17) — the
 * tree pattern (`arborist/bake-trees.js`), copied rather than reinvented:
 *   · THREE WELLS, provenance per lamp — `SOURCE_BY_WELL`:
 *       authored  `data/<scene>/authored_lamps.json` (+ LS's legacy path)  the operator's
 *       osm       `raw/osm.json#pois` + `raw/osm_street_lamps.json`         surveyed reality
 *       derived   `clean/derived_lamps.json` (cartograph/derive-lamps.mjs)  invented fill
 *   · CROSS-WELL DEDUP KEEPS THE RICHEST — authored > osm > derived. A derived lamp within
 *     half its own spacing of a real one is the same light twice and goes.
 *   · SURVEYED IS NUDGED, INVENTED IS DROPPED — on the frozen shape's painted zones. The
 *     operator's authored lamps are never moved: the override is the product.
 *   · THE DISSOLVE — derived lamps thin across the ground's fade band; real ones are only
 *     bounded by the rim.
 * ⛔ An absent well is zero lamps from that well, never another scene's.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { writeIfChanged } from './io.js'
import { assertBakeTarget } from './bake-target.js'
import { SCENE, requireExplicitMap } from './scene.js'
import { requireSceneTerrain } from './terrainLoad.js'
import { readTownDesign } from './lookDesign.mjs'
import { makeGroundSampler } from './groundSampler.js'
import { makeMembership } from './neighborhood-membership.mjs'
import { makeZoneTester } from './forbidden-surface.mjs'
import { readSurveyedLamps, spacingForScene } from './lamp-spacing.mjs'
import { overlapReach } from '../src/lib/lampPool.js'
import { DERIVED_LEGAL } from './derive-lamps.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

/** Well → the `source` stamped on each lamp, and its rank in the cross-well dedup (higher wins). */
export const SOURCE_BY_WELL = { authored: 'authored', osm: 'osm', derived: 'derived' }
const SOURCE_RANK = { authored: 3, osm: 2, derived: 1 }
/** Surveyed ↔ authored: the same physical lamp digitized twice (stable anywhere in 2–6 m, measured on LS). */
const DEDUPE_M = 4
/** Ground a SURVEYED lamp is nudged off. `pavement` is the drawn carriageway (a centreline reads `pavement`), so it is here.
 *  A derived lamp is judged the other way round — it must stand on `DERIVED_LEGAL` (derive-lamps.mjs), or it goes. */
const SURVEYED_ILLEGAL = new Set(['asphalt', 'pavement', 'curb', 'building', 'water', 'asphalt-or-unpoured'])
const isIllegal = (source, zone) => source === 'derived' ? !DERIVED_LEGAL.has(zone) : SURVEYED_ILLEGAL.has(zone)

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
  if (!existsSync(groundJsonPath) || !existsSync(groundBinPath)) return null
  const gj = JSON.parse(readFileSync(groundJsonPath, 'utf-8'))
  const gAB = readAB(groundBinPath)
  // ⛔ No flat fallback: a hilly town missing its terrain fails here, loudly (flat only on the record).
  const terrain = requireSceneTerrain(scene, 'bake-lamps')
  const sampler = makeGroundSampler(gj, gAB, terrain)
  for (const l of lamps) l.groundRaw = sampler.groundRawAt(l.x, l.z)
  // The heightfield these anchors were sampled from; the runtime refuses them against any other.
  return { count: lamps.length, terrain: { key: terrain.identity ?? 'none', baseElev: terrain.baseElev ?? null } }
}

// The AUTHORED lamp well — hand-placed lamps OSM doesn't carry, per scene.
//
// ⚠️ LS's authored well still lives at the shared default path
// `src/data/street_lamps.json` (80 lamps, all inside Lafayette Park). That path
// is the LS-bleed root: it is simultaneously "the shared default" and "LS's own
// data" (`EXTENT-DESIGN §2.1`). It is read here ONLY for lafayette-square and
// never as a fallback for anyone else — absence must render nothing, never
// another installation's lamps (`docs/briefs/BRIEF-ls-bleed-excision.md` site 1; before that
// guard, any lampless town baked LS's 80 under its own name, in its own frame).
//
// ▶ The clean end-state is a per-scene `data/<scene>/authored_lamps.json`; moving
// LS's file there retires one of the 13 name-imports and this special case with
// it. Kept as-is for now so the move is one deliberate commit, not a side effect.
function loadAuthoredLamps(scene) {
  const perScene = join(ROOT, 'cartograph', 'data', scene, 'authored_lamps.json')
  if (existsSync(perScene)) {
    const raw = JSON.parse(readFileSync(perScene, 'utf-8'))
    return raw.lamps || raw
  }
  if (scene === 'lafayette-square') {
    const p = join(ROOT, 'src', 'data', 'street_lamps.json')
    if (!existsSync(p)) return []
    const raw = JSON.parse(readFileSync(p, 'utf-8'))
    return raw.lamps || raw
  }
  return []
}

/** The derived well, as derive-lamps wrote it. Absent → zero derived lamps, and the bake says so. */
function loadDerivedLamps(scene, derivedPath) {
  const p = derivedPath || join(ROOT, 'cartograph', 'data', scene, 'clean', 'derived_lamps.json')
  if (!existsSync(p)) return { lamps: [], meta: null }
  const w = JSON.parse(readFileSync(p, 'utf-8'))
  return { lamps: w.lamps || [], meta: w.meta || null }
}

/**
 * The census: every well, stamped, deduped richest-first. Exported so a check reads the bake's
 * own census step instead of restating it.
 */
export function readLampCensus(scene, { derivedPath, derive = true } = {}) {
  const sceneDir = join(ROOT, 'cartograph', 'data', scene)
  const hasGeo = existsSync(join(sceneDir, 'geography.json'))
  const wells = {
    authored: loadAuthoredLamps(scene).map(l => ({ x: l.x, z: l.z, park: !!l.park, source: SOURCE_BY_WELL.authored })),
    osm: hasGeo ? readSurveyedLamps(sceneDir).map(l => ({ x: l.x, z: l.z, park: false, source: SOURCE_BY_WELL.osm })) : [],
  }
  const derived = derive ? loadDerivedLamps(scene, derivedPath) : { lamps: [], meta: null }
  wells.derived = derived.lamps.map(l => ({ x: l.x, z: l.z, park: false, source: SOURCE_BY_WELL.derived, spacing: l.spacing }))

  const kept = [], deduped = {}
  const near = (l, r) => kept.some(k => SOURCE_RANK[k.source] > SOURCE_RANK[l.source] && Math.hypot(k.x - l.x, k.z - l.z) <= r)
  for (const src of Object.keys(SOURCE_RANK).sort((a, b) => SOURCE_RANK[b] - SOURCE_RANK[a])) {
    for (const l of wells[src]) {
      // A real lamp is the same lamp twice within DEDUPE_M; a derived one is redundant within half its own spacing.
      const r = src === 'derived' ? l.spacing / 2 : DEDUPE_M
      if (near(l, r)) { deduped[src] = (deduped[src] || 0) + 1; continue }
      kept.push(l)
    }
  }
  const perWell = Object.fromEntries(Object.entries(wells).map(([k, v]) => [k, v.length]))
  return { lamps: kept, perWell, deduped, derivedMeta: derived.meta }
}

// Nearest ground a lamp may stand on, spiralling out — for SURVEYED lamps only. A recorded lamp a
// metre into our guessed roadway is our strip widths being soft, not the city planting a pole in
// the street; reality is moved, never deleted for disagreeing with a guess.
function nudge(zoneOf, x, z, rings = 6, step = 1) {
  for (let ring = 1; ring <= rings; ring++) {
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2
      const nx = +(x + Math.cos(ang) * ring * step).toFixed(1), nz = +(z + Math.sin(ang) * ring * step).toFixed(1)
      if (!SURVEYED_ILLEGAL.has(zoneOf(nx, nz))) return [nx, nz]
    }
  }
  return null
}

/** The town's authored lamp settings (a TOWN field, lookDesign.mjs). `derive: false` = real lamps only; unauthored derives. */
export function lampSettings(scene) {
  return { derive: readTownDesign(scene, 'bake-lamps').lamps?.derive !== false }
}

function loadLampsForMap(scene, look, derivedPath) {
  const { derive } = lampSettings(scene)
  if (!derive) console.warn(`[bake-lamps] ${look}: design.json#lamps.derive = false — REAL lamps only (surveyed + authored); the derived fill is off by authoring.`)
  const census = readLampCensus(scene, { derivedPath, derive })
  const { perWell, deduped } = census
  console.log(`[bake-lamps] scene=${scene}: wells authored=${perWell.authored} osm=${perWell.osm} derived=${perWell.derived}` +
    (Object.keys(deduped).length ? `; deduped ${JSON.stringify(deduped)} (richest kept: authored > osm > derived)` : ''))
  if (derive && !perWell.derived) console.warn(`[bake-lamps] scene=${scene}: NO derived well (clean/derived_lamps.json) — only surveyed/authored lamps will stand. ▶ node cartograph/derive-lamps.mjs --scene=${scene}`)

  // ── Legal ground: the frozen shape's painted zones (the tree mask's own surfaces) ──
  const shapePath = join(ROOT, 'public', 'baked', look, 'shape.json')
  if (!existsSync(shapePath)) throw new Error(`[bake-lamps] no ${shapePath} — bake the ground first; without it there is no honest answer to "is this lamp in the road?".`)
  const mapPath = join(ROOT, 'cartograph', 'data', scene, 'clean', 'map.json')
  const zoneOf = makeZoneTester({ shapePath, mapPath: existsSync(mapPath) ? mapPath : undefined, scene, quiet: true }).zoneOf

  // ── Bounds: real lamps stop at the rim; invented ones dissolve across the fade band ──
  const bp = join(ROOT, 'cartograph', 'data', scene, 'neighborhood_boundary.json')
  if (!existsSync(bp)) throw new Error(`[bake-lamps] no ${bp} — a lamp census has no edge without the neighborhood.`)
  const m = makeMembership(bp)

  const out = [], tally = { nudged: {}, dropped: {}, dissolved: 0, beyondRim: 0 }
  const bump = (o, k) => { o[k] = (o[k] || 0) + 1 }
  for (const l of census.lamps) {
    if (l.source === 'derived') { if (!m.keep(l.x, l.z, 23)) { tally.dissolved++; continue } }
    else if (m.density(l.x, l.z) <= 0) { tally.beyondRim++; continue }
    if (l.source !== 'authored') {
      const zone = zoneOf(l.x, l.z)
      if (isIllegal(l.source, zone)) {
        const moved = l.source === 'osm' ? nudge(zoneOf, l.x, l.z) : null
        if (!moved) { bump(tally.dropped, `${l.source}:${zone}`); continue }
        l.x = moved[0]; l.z = moved[1]; bump(tally.nudged, zone)
      }
    }
    const { spacing, ...lamp } = l
    out.push(lamp)
  }
  const bySource = {}; for (const l of out) bump(bySource, l.source)
  const inHood = out.filter(l => m.isInside(l.x, l.z)).length
  console.log(`[bake-lamps] scene=${scene}: ${out.length} lamps ${JSON.stringify(bySource)} — ${inHood} inside the neighborhood proper, ${out.length - inHood} in the greater circle` +
    (m.hasPolygon ? '' : '  ⚠️ no boundary-street polygon — disc standing in'))
  if (Object.keys(tally.nudged).length) console.log(`[bake-lamps]   nudged onto legal ground (surveyed lamps kept): ${JSON.stringify(tally.nudged)}`)
  if (Object.keys(tally.dropped).length) console.log(`[bake-lamps]   dropped on illegal ground: ${JSON.stringify(tally.dropped)}`)
  if (tally.dissolved) console.log(`[bake-lamps]   dissolved ${tally.dissolved} derived lamps toward the rim`)
  if (!out.length) console.warn(`[bake-lamps] scene=${scene}: ZERO lamps. No well produced one — run derive-lamps for this scene. Refusing to substitute another scene's lamps.`)
  return { lamps: out, bySource, perWell, deduped, tally, spacing: census.derivedMeta?.spacing ?? null }
}

export async function bakeLamps({ look, scene, outDir: outDirArg, derivedPath } = {}) {
  assertBakeTarget('bake-lamps', look, scene)
  const outDir  = outDirArg || join(ROOT, 'public', 'baked', look)
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

  const r = loadLampsForMap(scene, look, derivedPath)
  const lamps = r.lamps
  // Anchors are sampled from THIS look's ground bake, wherever the output goes.
  const anchoring = anchorLampsToGround(lamps, join(ROOT, 'public', 'baked', look), scene)
  const anchored = anchoring?.count ?? 0
  // ⭐ The pool REACH, derived from the town's own street spacing so neighbouring pools overlap
  // (Jacob, 2026-09-26: "The ground pools should overlap"). Every consumer — the ground's pool map,
  // the trees' glow, the walls — reads it from here. ▶ src/lib/lampPool.js#overlapReach
  const streetSpacing = spacingForScene(join(ROOT, 'cartograph', 'data', scene)).ordinary
  const reach = overlapReach(streetSpacing.spacing)
  console.log(`[bake-lamps] pool reach ${reach} m — overlap at the town's ${streetSpacing.spacing} m spacing (${streetSpacing.from})`)
  const out = {
    version: 3,
    look,
    count: lamps.length,
    reach,
    reachFrom: { spacing: streetSpacing.spacing, from: streetSpacing.from },
    // ⭐ Provenance, per lamp (`source`) and in sum — so the Stage and a check can tell real from invented.
    bySource: r.bySource,
    perWell: r.perWell,
    ...(r.spacing ? { spacing: r.spacing } : {}),
    ...(anchoring ? { terrain: anchoring.terrain } : {}),
    lamps,
  }
  const outPath = join(outDir, 'lamps.json')
  const wrote = writeIfChanged(outPath, JSON.stringify(out, null, 2))
  console.log(`[bake-lamps] ${wrote ? 'wrote' : 'unchanged'} ${outPath} (${lamps.length} lamps${anchored ? `, ${anchored} ground-anchored` : ' — NO ground bake, un-anchored'})`)
}

async function main() {
  const scene = requireExplicitMap('bake-lamps')   // one resolver: --scene= OR CARTOGRAPH_SCENE
  let look = null, outDir = null, derivedPath = null
  for (const arg of process.argv.slice(2)) {
    let m
    if ((m = arg.match(/^--look=(.+)$/)))      look  = m[1]
    if ((m = arg.match(/^--out-dir=(.+)$/)))   outDir = m[1]
    if ((m = arg.match(/^--derived=(.+)$/)))   derivedPath = m[1]   // test a derived well without writing the scene's clean/
  }
  await bakeLamps({ look, scene, outDir, derivedPath })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1) })
}
