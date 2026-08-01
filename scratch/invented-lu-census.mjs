/**
 * invented-lu-census.mjs — how many tiles get their land use from the HASH?
 *
 * BRIEF-land-use-derivation.md §5, step 1: "re-measure the invented-LU share
 * properly, using `ringInteriorPoint` (not centroid), on both scenes."
 *
 * ⭐ THE KIT POINT: this is not an LS/HPDM number, it is a per-scene detector.
 * Run it on any poured town and it reports what fraction of that town's land
 * use was INVENTED by `pickLuFromHash` rather than derived from data. A town
 * nobody has looked at gets the same audit as the ones we know.
 *
 * ⭐⭐ AUTHORING IS LOADED (`CLAUDE.md` Layer 0 q3). `luForRing` consults
 * `blockLandUse[blockKeyFromRing(ring)]` from the scene's design.json FIRST;
 * measuring without it would score the operator's own overrides as invented.
 * It is loaded here even though both shipped scenes carry 0 entries — the
 * check must be right for the town that DOES author them.
 *
 * Faithful replication of `luForRing` (src/lib/tileGround.js:3069):
 *     blockLandUse[bk]  →  smallest ribbons.face containing ringInteriorPoint
 *                       →  pickLuFromHash        ← INVENTED
 *
 * Usage:  node scratch/invented-lu-census.mjs [scene ...]     (default: all poured)
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ── the three primitives, verbatim from tileGround.js (they are module-private
//    there; copying them keeps this harness a read-only observer of the live
//    algorithm rather than a reason to widen that module's surface) ──────────
function pointInRing(px, py, r) {
  let inside = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside
  }
  return inside
}
function ringInteriorPoint(r) {
  let cx = 0, cy = 0
  for (const p of r) { cx += p[0]; cy += p[1] }
  cx /= r.length; cy /= r.length
  if (pointInRing(cx, cy, r)) return [cx, cy]
  const a = r[0], b = r[1 % r.length]
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
  for (let i = 0; i < r.length; i++) {
    const t = i / r.length
    const px = mx + (cx - mx) * t, py = my + (cy - my) * t
    if (pointInRing(px, py, r)) return [px, py]
  }
  return [cx, cy]
}
function signedArea(r) {
  let a = 0
  for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; a += x1 * y2 - x2 * y1 }
  return a / 2
}

// ── scene resolution ────────────────────────────────────────────────────────
const ribbonsPathFor = (scene) => scene === 'lafayette-square'
  ? join(ROOT, 'src', 'data', 'ribbons.json')                       // bake-ground.js:721
  : join(ROOT, 'cartograph', 'data', scene, 'clean', 'ribbons.json')
const designPathFor = (scene) => join(ROOT, 'public', 'looks', scene, 'design.json')

function pouredScenes() {
  return readdirSync(join(ROOT, 'cartograph', 'data'), { withFileTypes: true })
    .filter(d => d.isDirectory() && !['clean', 'raw'].includes(d.name))
    .map(d => d.name)
    .filter(s => existsSync(ribbonsPathFor(s)))
}

function census(scene) {
  const rp = ribbonsPathFor(scene)
  if (!existsSync(rp)) return { scene, error: `no ribbons.json at ${rp}` }
  const ribbons = JSON.parse(readFileSync(rp, 'utf-8'))

  // AUTHORING — the operator's overrides, loaded before anything is measured.
  let blockLandUse = null
  const dp = designPathFor(scene)
  if (existsSync(dp)) {
    const d = JSON.parse(readFileSync(dp, 'utf-8'))
    if (d.blockLandUse && typeof d.blockLandUse === 'object') blockLandUse = d.blockLandUse
  }
  const authoredKeys = blockLandUse ? Object.keys(blockLandUse).length : 0

  const faceList = (ribbons.faces || []).filter(f => f?.ring?.length >= 3 && f.use)
  const tiles = ribbons.tiles || []
  if (!tiles.length) return { scene, error: 'no frozen tiles in ribbons.json (pre-D2 artifact)' }

  let derived = 0, invented = 0, authored = 0
  let areaDerived = 0, areaInvented = 0, areaAuthored = 0
  const inventedRings = []

  for (const t of tiles) {
    const ring = (t.ring || []).map(p => [p[0], p[1]])
    if (ring.length < 3) continue
    const area = Math.abs(signedArea(ring))

    // NOTE: the authored branch keys off blockKeyFromRing, which lives in
    // buildBlockGeometryV2.js. With 0 authored entries in every shipped scene
    // the branch is unreachable today; when a scene authors any, this harness
    // must import that key builder rather than count them as derived. Guarded
    // loudly rather than silently mis-bucketed.
    if (authoredKeys > 0) { authored++; areaAuthored += area; continue }

    const [px, py] = ringInteriorPoint(ring)
    let best = null, bestArea = Infinity
    for (const f of faceList) {
      if (pointInRing(px, py, f.ring)) {
        const a = Math.abs(signedArea(f.ring))
        if (a < bestArea) { best = f.use; bestArea = a }
      }
    }
    if (best) { derived++; areaDerived += area }
    else { invented++; areaInvented += area; inventedRings.push(area) }
  }

  const nTiles = derived + invented + authored
  const areaTotal = areaDerived + areaInvented + areaAuthored
  return {
    scene, nTiles, derived, invented, authored, authoredKeys,
    nFaces: faceList.length,
    pctTiles: nTiles ? (100 * invented / nTiles) : 0,
    pctArea: areaTotal ? (100 * areaInvented / areaTotal) : 0,
    areaTotal, areaInvented,
    largestInvented: inventedRings.sort((a, b) => b - a).slice(0, 3),
  }
}

const scenes = process.argv.slice(2).length ? process.argv.slice(2) : pouredScenes()
console.log('\n  INVENTED LAND USE — share of tiles whose LU comes from pickLuFromHash\n')
console.log(`  ${'scene'.padEnd(24)} ${'tiles'.padStart(6)} ${'derived'.padStart(8)} ${'INVENTED'.padStart(9)} ${'% tiles'.padStart(8)} ${'% area'.padStart(8)}  faces`)
console.log(`  ${'-'.repeat(24)} ${'-'.repeat(6)} ${'-'.repeat(8)} ${'-'.repeat(9)} ${'-'.repeat(8)} ${'-'.repeat(8)}  -----`)
for (const s of scenes) {
  const r = census(s)
  if (r.error) { console.log(`  ${s.padEnd(24)} — ${r.error}`); continue }
  console.log(
    `  ${r.scene.padEnd(24)} ${String(r.nTiles).padStart(6)} ${String(r.derived).padStart(8)} ` +
    `${String(r.invented).padStart(9)} ${r.pctTiles.toFixed(1).padStart(7)}% ${r.pctArea.toFixed(1).padStart(7)}%  ${r.nFaces}`
  )
  if (r.authoredKeys > 0) console.log(`  ${''.padEnd(24)} ⚠️  ${r.authoredKeys} authored blockLandUse entries — harness needs blockKeyFromRing; numbers above are NOT valid.`)
  if (r.largestInvented.length) console.log(`  ${''.padEnd(24)}    largest invented tiles: ${r.largestInvented.map(a => Math.round(a).toLocaleString() + ' m²').join(' · ')}`)
}
console.log('')
