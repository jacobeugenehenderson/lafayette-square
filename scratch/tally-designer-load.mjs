/**
 * tally-designer-load — [LOAD-FORENSIC 2026-07-14] throwaway
 *
 * Mirrors the Designer's load-time call sequence for a frozen (Design-view)
 * scene, stage by stage, in Node — the same way sectionOpen=12,868ms was
 * measured standalone. Adapted from scratch/section-open.mjs.
 *
 * Measures the CPU-bound stages only. Fetch/React-commit/GPU-upload are
 * browser-side and are NOT covered here (see DESIGNER-LOAD-FORENSIC.md).
 *
 * usage: node scratch/tally-designer-load.mjs <scene> [dataRoot]
 */
import { readFileSync } from 'fs'
import { sectionOpen } from '../src/lib/tileGround.js'
import { ringsToFlatGeo } from '../src/lib/ringsToFlatGeo.js'
import { buildBlockGeometryV2 } from '../src/lib/buildBlockGeometryV2.js'

const scene = process.argv[2] || 'altadena'
// Altadena's data is UNTRACKED — it lives only in the main tree, so this
// worktree reads it by absolute path. Read-only; nothing is written there.
const ROOT = process.argv[3] || '/Users/jacobhenderson/Desktop/lafayette-square.nosync'

const T = []
function time(label, fn) {
  const t0 = performance.now()
  let out, err = null
  try { out = fn() } catch (e) { err = e }
  const ms = performance.now() - t0
  T.push({ label, ms, err: err ? String(err.message || err).slice(0, 90) : null })
  console.log(`  ${err ? '✗' : '✓'} ${label.padEnd(46)} ${ms.toFixed(0).padStart(7)} ms${err ? '  ERR: ' + T[T.length - 1].err : ''}`)
  if (err) return null
  return out
}
const rd = p => readFileSync(`${ROOT}/${p}`, 'utf8')

console.log(`\n=== tally-designer-load — scene=${scene} ===\n`)

// ── Stage 1: the artifacts the Designer fetches ──────────────────────────
const shapeRaw = time('read shape.json (bytes)', () => rd(`public/baked/${scene}/shape.json`))
const shape = time('JSON.parse shape.json', () => JSON.parse(shapeRaw))
// LS/toy are BUNDLED scenes — their ribbons are a static vite import from
// src/data, not the per-scene clean/ artifact the generic path fetches.
const ribPath = scene === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${scene}/clean/ribbons.json`
const ribRaw = time('read ribbons.json (bytes)', () => rd(ribPath))
const ribbons = time('JSON.parse ribbons.json', () => JSON.parse(ribRaw))
const mapRaw = time('read map.json (bytes)', () => rd(`cartograph/data/${scene}/clean/map.json`))
const mapJson = time('JSON.parse map.json', () => JSON.parse(mapRaw))

const nb = JSON.parse(rd(`cartograph/data/${scene}/neighborhood_boundary.json`))
let design = {}
try { design = JSON.parse(rd(`public/looks/${scene}/design.json`)) } catch { console.log('  (no design.json — defaults)') }

// stencilFromBoundary — CartographApp.jsx:658, verbatim
const targetR = (nb?.streetFade?.outer ?? nb.radius) + 50
const sc0 = targetR / nb.radius
const [cx, cz] = nb.center
const stencil = nb.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])

const tiles = Array.isArray(shape) ? shape : shape?.tiles || []
const highway = Array.isArray(shape) ? [] : shape?.highway || []
const detailClip = Array.isArray(shape?.detailClip) && shape.detailClip.length ? shape.detailClip : null
const blockCustoms = design.blockCustoms || null
const curbWidth = design.curbWidth ?? 0.15

console.log(`\n  inputs: ${tiles.length} tiles · ${(ribbons.streets || []).length} streets · stencil ${stencil.length} pts`)
console.log(`          shape ${(shapeRaw.length / 1e6).toFixed(1)}MB · ribbons ${(ribRaw.length / 1e6).toFixed(1)}MB · map ${(mapRaw.length / 1e6).toFixed(1)}MB`)
console.log(`          detailClip ${detailClip ? detailClip.length + ' rings' : 'none'} · blockCustoms ${blockCustoms ? Object.keys(blockCustoms).length + ' keys' : 'none'}\n`)

// V2_ONLY=1 skips the section stages when profiling V2's internal phases.
const V2_ONLY = process.env.V2_ONLY === '1'

// ── Stage 2: sectionOpen — the frozen Design path (BlockGeometryV2Debug:722)
const sg = V2_ONLY ? null : time(`sectionOpen (${tiles.length} tiles)`, () =>
  sectionOpen(tiles, curbWidth, { outer: 'LU', inner: 'SW' }, stencil, blockCustoms, new Map(), null, detailClip))

// ── Stage 3: ringsToFlatGeo composition — OUTSIDE the existing timer ─────
// BlockGeometryV2Debug.jsx:725-753. This is the uninstrumented tail.
if (sg) {
  const perLu = (byLu, yLift) => Object.entries(byLu || {})
    .map(([lu, rings]) => ({ lu, geo: ringsToFlatGeo(rings, yLift, true) }))
    .filter(e => e.geo)
  const ringCount = r => (r || []).length
  console.log(`\n  ring counts → asphalt ${ringCount(sg.asphalt)} · sidewalk ${ringCount(sg.sidewalk)} · curb ${ringCount(sg.curb)} · block ${ringCount(sg.block)}`)
  console.log(`                lu classes ${Object.keys(sg.luByClass || {}).length} · treelawn lus ${Object.keys(sg.treelawnByLu || {}).length}\n`)

  time('  ↳ ringsToFlatGeo lu (perLu)', () => perLu(sg.luByClass, 0.010))
  time('  ↳ ringsToFlatGeo treelawn (perLu)', () => perLu(sg.treelawnByLu, 0.020))
  time('  ↳ ringsToFlatGeo sidewalk', () => ringsToFlatGeo(sg.sidewalk, 0.030, true))
  time('  ↳ ringsToFlatGeo curb', () => ringsToFlatGeo(sg.curb, 0.035, true))
  time('  ↳ ringsToFlatGeo asphalt', () => ringsToFlatGeo(sg.asphalt, 0.040, true))
  time('  ↳ ringsToFlatGeo highway', () => ringsToFlatGeo(highway, 0.015, true))
  time('  ↳ ringsToFlatGeo block', () => ringsToFlatGeo(sg.block, 0.008, true))
}

// ── Stage 4: buildBlockGeometryV2 — runs UNCONDITIONALLY (:426) ──────────
// No sectionFrozen gate; its meshes never mount (isTileScene===true).
time('buildBlockGeometryV2 (dead-in-render)', () =>
  buildBlockGeometryV2(ribbons, {
    stencil,
    blockCustoms,
    cornerRadiusScale: design.cornerRadiusScale,
    cornerRadiusOverrides: design.cornerRadiusOverrides,
    cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides,
    curbWidth,
    blockLandUse: design.blockLandUse,
    smooth: design.streetSmooth,
    useRingBandEmitter: true,
  }))

// ── Budget ───────────────────────────────────────────────────────────────
const top = T.filter(t => !t.label.startsWith('  ↳'))
const total = top.reduce((a, b) => a + b.ms, 0)
const flat = T.filter(t => t.label.startsWith('  ↳')).reduce((a, b) => a + b.ms, 0)
console.log(`\n=== BUDGET (CPU-bound, Node) ===`)
for (const t of top) {
  const pct = (t.ms / total * 100).toFixed(1)
  console.log(`  ${t.label.padEnd(46)} ${t.ms.toFixed(0).padStart(7)} ms  ${pct.padStart(5)}%`)
}
console.log(`  ${'(of which: ringsToFlatGeo tail)'.padEnd(46)} ${flat.toFixed(0).padStart(7)} ms`)
console.log(`  ${'TOTAL'.padEnd(46)} ${total.toFixed(0).padStart(7)} ms  = ${(total / 1000).toFixed(1)} s\n`)
