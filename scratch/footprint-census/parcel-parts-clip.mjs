// parcel-parts-clip.mjs — derive's own `clipParcelsToRoundedBlocks`, run IN MEMORY (nothing written, no derive run) on each
// town's raw parcels against its emitted `block` layer, the source as it stands against the one at a git rev (default
// HEAD, the rings[0] reader, rebuilt from its own text). Per town: the parts lost (a part of a multipart parcel with block
// ground and no emitted cover, as checks/claims-a-parcel-keeps-all-its-parts.mjs judges them) under each, and whether every
// single-part parcel's emitted rings are identical under both. --mutant=vertex-mean: the source as it stands, rebuilt from its
// text with a part's test point put back to its vertex mean (must lose PTown's seashore part). --towns=a,b: only those.
//   node scratch/footprint-census/parcel-parts-clip.mjs [--rev=HEAD] [--mutant=vertex-mean] [--towns=…]
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import clipperLib from 'clipper-lib'
import { readSources } from '../../cartograph/sources.js'
import { clipParcelsToRoundedBlocks as nowClip } from '../../cartograph/derive.js'
import { parcelParts, pointInside } from '../../cartograph/parcelParts.js'
const ROOT = new URL('../../', import.meta.url).pathname
const { Clipper, Paths, IntPoint, PolyType, ClipType, PolyFillType } = clipperLib
const rev = process.argv.find(a => a.startsWith('--rev='))?.slice(6) || 'HEAD'
const SRC = execSync(`git show ${rev}:cartograph/derive.js`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 })
const SCALE = Number(SRC.match(/^const SCALE = (\d+)$/m)[1])
const body = SRC.match(/function clipParcelsToRoundedBlocks\(parcels, roundedBlocks, classify\) \{[\s\S]*?\n\}\n/)[0]
const toClipper = (x, z) => new IntPoint(Math.round(x * SCALE), Math.round(z * SCALE)), pathFromClipper = (p) => p.map(q => ({ x: q.X / SCALE, z: q.Y / SCALE }))
const build = (src) => new Function('Clipper', 'Paths', 'IntPoint', 'PolyType', 'ClipType', 'PolyFillType', 'toClipper', 'pathFromClipper', 'SCALE', 'parcelParts', 'pointInside', 'pointInRing',
  `${src}; return clipParcelsToRoundedBlocks`)(Clipper, Paths, IntPoint, PolyType, ClipType, PolyFillType, toClipper, pathFromClipper, SCALE, parcelParts, pointInside, pointInRing)
const pointInRing = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i].x, zi = r[i].z, xj = r[j].x, zj = r[j].z; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const oldClip = build(body)
const mutant = process.argv.find(a => a.startsWith('--mutant='))?.slice(9)
let clipParcelsToRoundedBlocks = nowClip
if (mutant === 'vertex-mean') { const cur = readFileSync(join(ROOT, 'cartograph/derive.js'), 'utf8').match(/export function clipParcelsToRoundedBlocks\(parcels, roundedBlocks, classify\) \{[\s\S]*?\n\}\n/)[0].replace('export ', '')
  const a = 'const [tx, tz] = own ? p.centroid : pointInside(outer)'; if (cur.split(a).length !== 2) throw new Error(`--mutant=vertex-mean: anchor not found once — ${a}`)
  clipParcelsToRoundedBlocks = build(cur.replace(a, 'const [tx, tz] = own ? p.centroid : outer.reduce((s, q) => [s[0] + q[0] / outer.length, s[1] + q[1] / outer.length], [0, 0])')); console.log('MUTANT: vertex mean') }
else if (mutant) throw new Error(`unknown --mutant=${mutant}`)
const towns = process.argv.find(a => a.startsWith('--towns='))?.slice(8).split(',') || ['hipointedemun', 'huron', 'jacksonheights', 'lafayette-square', 'provincetown']
const toC = (r) => r.map(p => ({ X: Math.round((p.x ?? p[0]) * SCALE), Y: Math.round((p.z ?? p[1]) * SCALE) }))
const area = (P) => Math.abs(P.reduce((a, p) => a + Clipper.Area(p), 0)) / (SCALE * SCALE)
const meet = (a, b) => { const c = new Clipper(); c.AddPaths(a, PolyType.ptSubject, true); c.AddPaths(b, PolyType.ptClip, true); const o = new Paths(); c.Execute(ClipType.ctIntersection, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return o }
const lostOf = (parcels, emitted, B) => { const E = emitted.map(e => toC(e.ring)); let n = 0
  for (const p of parcels) { const parts = parcelParts(p.rings); if (parts.length < 2) continue
    for (const { outer } of parts) { const inB = meet([toC(outer)], B); if (area(inB) > 0 && !(area(meet(inB, E)) > 0)) n++ } } return n }
for (const town of towns) {
  const S = readSources(town), mp = join(ROOT, 'cartograph/data', town, 'clean/map.json'); if (!S.parcels?.length || !existsSync(mp)) { console.log(`${town}: not checked`); continue }
  const L = JSON.parse(readFileSync(mp, 'utf8')), layers = L.layers || L, B = (layers.block || []).map(e => toC(e.ring))
  const parcels = S.parcels.flatMap(w => Object.values(JSON.parse(readFileSync(join(ROOT, 'cartograph/data', town, 'raw', w.file), 'utf8')).parcels || {}))
  const one = (clip) => parcels.map(p => clip([p], B, () => null))
  const now = one(clipParcelsToRoundedBlocks), was = one(oldClip)
  let same = 0, diff = 0; parcels.forEach((p, i) => { if (parcelParts(p.rings).length > 1) return; JSON.stringify(now[i]) === JSON.stringify(was[i]) ? same++ : diff++ })
  console.log(`${town}: parts lost — ${rev} ${lostOf(parcels, was.flat(), B)} · now ${lostOf(parcels, now.flat(), B)} · single-part parcels emitted identically ${same}, differently ${diff} · emitted rings ${was.flat().length} → ${now.flat().length}`) }
