// claims-the-overhead-band-is-two-triangles.mjs — IS EVERY OVERHEAD BAND A 2-TRIANGLE QUAD, AND DOES ITS FLUTTER SLIDE THE PICTURE?
//
// The tree-cost forensic (scratch/tree-cost/VERDICT.md) measured Browse's tree cost as GEOMETRY: each overhead band was
// a 28×28 grid (1,568 triangles) only so its vertices could flutter — 25.36M triangles on LS. The redesign
// (docs/briefs/BRIEF-overhead-impostor-redesign.md) draws each band as 2 triangles and moves the flutter per fragment.
// Holds:
//   ① buildOverheadBandDisc returns 4 vertices / 2 triangles, corners at ±half with UVs 0..1, and no `grid` path survives;
//   ② it refuses a record without measured dims (no default 14 m tree) or a band without its yLo/yHi;
//   ③ the overhead material moves NO vertex for flutter (no CARD_FLUTTER_VERTEX in its begin_vertex) and samples both
//      its albedo and its AO at the flutter-slid ovUv, through the wind sheet's windDetail (no noise of its own).
//
// ▶ MUTATION-TEST IT:
//     · impostorGeometry.js: put the vertex grid back (any N > 1) → ① RED
//     · treeAtlasMaterial.js injectOverheadStamp: add CARD_FLUTTER_VERTEX to its begin_vertex → ③ RED
//
//   node checks/claims-the-overhead-band-is-two-triangles.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8')
const { buildOverheadBandDisc, IMPOSTOR_FRAME_PAD_M } = await import(pathToFileURL(path.join(REPO, 'src/components/impostorGeometry.js')))
let red = 0
const bad = (m) => { red++; console.log(`   ⛔ ${m}`) }
const ok = (m) => console.log(`   ✅ ${m}`)

console.log('① two triangles over the whole frame')
for (const rec of [{ heightM: 9, canopyRadiusM: 3 }, { heightM: 28, canopyRadiusM: 11 }]) {
  const g = buildOverheadBandDisc(rec, { yLoNorm: 0.6, yHiNorm: 1 })
  const tris = g.index.count / 3, verts = g.attributes.position.count
  tris === 2 && verts === 4 ? ok(`${rec.heightM} m tree: ${tris} triangles, ${verts} vertices`) : bad(`${rec.heightM} m tree: ${tris} triangles, ${verts} vertices — the band is tessellated again`)
  const half = rec.canopyRadiusM + IMPOSTOR_FRAME_PAD_M
  const P = g.attributes.position.array, U = g.attributes.uv.array
  let frame = true
  for (let i = 0; i < verts; i++) {
    if (Math.abs(Math.abs(P[i * 3]) - half) > 1e-5 || Math.abs(Math.abs(P[i * 3 + 2]) - half) > 1e-5) frame = false
    if (Math.abs(U[i * 2] - (P[i * 3] / (2 * half) + 0.5)) > 1e-5 || Math.abs(U[i * 2 + 1] - (P[i * 3 + 2] / (2 * half) + 0.5)) > 1e-5) frame = false
  }
  frame ? ok('corners at ±half, uv = position.xz / (2·half) + 0.5 (what the fragment flutter assumes)') : bad('the quad no longer spans the capture frame with planar UVs — the fragment flutter\'s UV-per-metre is wrong')
}
const fnSrc = src('src/components/impostorGeometry.js').match(/export function buildOverheadBandDisc[\s\S]*?\n}\n/)?.[0] || ''
;/\bgrid\b/.test(fnSrc.replace(/\/\/[^\n]*/g, '')) ? bad('buildOverheadBandDisc still reads a `grid` option') : ok('no `grid` path survives in buildOverheadBandDisc')

console.log('② no default tree')
for (const [label, rec, opts] of [['no heightM', { canopyRadiusM: 4 }, { yLoNorm: 0, yHiNorm: 1 }], ['no canopyRadiusM', { heightM: 9 }, { yLoNorm: 0, yHiNorm: 1 }], ['no yLo/yHi', { heightM: 9, canopyRadiusM: 4 }, {}]]) {
  let threw = false
  try { buildOverheadBandDisc(rec, opts) } catch { threw = true }
  threw ? ok(`${label} → throws`) : bad(`${label} → built a band from a default`)
}

console.log('③ the flutter slides the picture, through the sheet')
{
  const s = src('src/components/treeAtlasMaterial.js')
  const fn = s.match(/export function injectOverheadStamp[\s\S]*?\n}\n/)?.[0] || ''
  const begin = fn.match(/'#include <begin_vertex>'[^\n]*/)?.[0] || ''
  !begin ? bad('injectOverheadStamp has no begin_vertex injection — the check and the source have drifted')
    : /CARD_FLUTTER_VERTEX/.test(begin) ? bad('the overhead band flutters its VERTICES — it needs a grid again') : ok('no vertex flutter on the overhead band')
  ;/OVERHEAD_FLUTTER_VERTEX/.test(begin) ? ok('the vertex hands the fragment its world XZ, amplitude and UV basis') : bad('OVERHEAD_FLUTTER_VERTEX is not injected — the fragment flutter reads unwritten varyings')
  ;/map_fragment\.replaceAll\('vMapUv', 'ovUv'\)/.test(fn) && /OVERHEAD_STAMP_FRAG\.replaceAll\('vMapUv', 'ovUv'\)/.test(fn) ? ok('albedo (and its cutout) and AO both read at ovUv') : bad('albedo and AO do not both read at the slid ovUv — the picture and its shading would tear apart')
  const frag = s.match(/const OVERHEAD_FLUTTER_FRAG = `([\s\S]*?)`/)?.[1] || ''
  ;/windDetail\(/.test(frag) && !/fbm|Noise\(|hash/i.test(frag) ? ok('the fragment flutter is windDetail (the sheet\'s), no noise of its own') : bad('the fragment flutter does not read windDetail, or computes noise of its own')
}

console.log(red ? `\n⛔ ${red} claim(s) RED` : '\n✅ every overhead band is two triangles, and its flutter slides the picture')
process.exit(red ? 1 : 0)
