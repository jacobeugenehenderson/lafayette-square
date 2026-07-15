/**
 * t4-fe-parity — [T4 2026-07-15]
 *
 * The gate for T4's emitter cut. `_v2FrontageEdges` is V2's ONLY live output —
 * Survey/Measure read it, and `blockCustoms` is keyed off `feCustomKey(fe)` =
 * [chainSkelId, side, min(segOrds)]. If the cut perturbs a single fe identity,
 * authored customs across every hood silently orphan (the same failure mode as
 * the LS re-center hazard). So: snapshot the fe set before the cut, compare
 * after, and demand an exact match.
 *
 * usage:
 *   node scratch/t4-fe-parity.mjs <scene> capture <out.json>
 *   node scratch/t4-fe-parity.mjs <scene> compare <baseline.json>
 */
import { readFileSync, writeFileSync } from 'fs'
import { buildBlockGeometryV2 } from '../src/lib/buildBlockGeometryV2.js'
import { feCustomKey } from '../src/lib/feCustomKey.js'

const scene = process.argv[2]
const mode = process.argv[3]
const file = process.argv[4]
const ROOT = '/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const rd = p => readFileSync(`${ROOT}/${p}`, 'utf8')

const ribPath = scene === 'lafayette-square'
  ? 'src/data/ribbons.json' : `cartograph/data/${scene}/clean/ribbons.json`
const ribbons = JSON.parse(rd(ribPath))
const nb = JSON.parse(rd(`cartograph/data/${scene}/neighborhood_boundary.json`))
let design = {}
try { design = JSON.parse(rd(`public/looks/${scene}/design.json`)) } catch {}

const targetR = (nb?.streetFade?.outer ?? nb.radius) + 50
const sc0 = targetR / nb.radius
const [cx, cz] = nb.center
const stencil = nb.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])

const t0 = performance.now()
const v2 = buildBlockGeometryV2(ribbons, {
  stencil,
  blockCustoms: design.blockCustoms || null,
  cornerRadiusScale: design.cornerRadiusScale,
  cornerRadiusOverrides: design.cornerRadiusOverrides,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides,
  curbWidth: design.curbWidth ?? 0.15,
  blockLandUse: design.blockLandUse,
  useRingBandEmitter: true,
})
const ms = performance.now() - t0

// The identity + the scalars the live consumers actually read. Geometry (`poly`)
// is included via a length+first/last-vertex fingerprint: full vertex dumps are
// huge, but a moved edge still trips the check.
const fp = (fe) => ({
  key: feCustomKey(fe),
  chainIdx: fe.chainIdx,
  chainSkelId: fe.chainSkelId ?? null,
  chainName: fe.chainName ?? null,
  side: fe.side ?? null,
  segOrds: fe.segOrds ?? null,
  blockKey: fe.blockKey ?? null,
  edgeOrd: fe.edgeOrd ?? null,
  measure: fe.measure ?? null,
  nPts: fe.poly?.length ?? fe.points?.length ?? null,
  p0: (fe.poly || fe.points)?.[0] ?? null,
  pN: (fe.poly || fe.points)?.slice(-1)[0] ?? null,
})

const fes = (v2.frontageEdges || []).map(fp)
console.log(`${scene}: ${fes.length} frontageEdges · buildBlockGeometryV2 ${ms.toFixed(0)} ms`)

if (mode === 'capture') {
  writeFileSync(file, JSON.stringify(fes, null, 0))
  console.log(`  captured → ${file}`)
} else {
  const base = JSON.parse(readFileSync(file, 'utf8'))
  const a = JSON.stringify(base), b = JSON.stringify(fes)
  if (a === b) {
    console.log(`  ✅ PARITY EXACT — ${fes.length} fes identical (keys, scalars, geometry fingerprint)`)
  } else {
    console.log(`  ❌ PARITY BROKEN — baseline ${base.length} fes vs now ${fes.length}`)
    let shown = 0
    for (let i = 0; i < Math.max(base.length, fes.length) && shown < 5; i++) {
      const x = JSON.stringify(base[i]), y = JSON.stringify(fes[i])
      if (x !== y) { console.log(`   [${i}]\n     was: ${x}\n     now: ${y}`); shown++ }
    }
    process.exit(1)
  }
}
