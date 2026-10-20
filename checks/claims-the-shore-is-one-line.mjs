// claims-the-shore-is-one-line.mjs — THE SHORE MEDIAN CLOSES AGAINST ①'s COAST INK: the two tile, and no line lies inside.
//
// ⭐ RIBBONS §1 (ruled 2026-09-20): the coast is stroked into ① at ε, a chain like any street, and yields TWO objects — the
// water FACE and the INK; the land closes against ①'s own edge. bake-ground paints the coast's ink AND the shore median
// into one `shore` group. So the median must close against the ink: seaward on its water edge, landward on its land
// edge. ⛔ Cut from the water face instead, it overlapped the ink's water half and left the face's line ε inside the
// shore — Huron's ground refused at a shore vertex on that line (2 cross-group T-junctions, 2026-10-16).
//
// Two claims, per town with a coast ink and a median:
//   ① no median AREA lies in the ink (beyond one lattice step × the overlap's perimeter, lattice.js);
//   ② no median VERTEX lies inside the ink farther than one lattice step from its edges — a line inside the shore.
// Each failure is printed with its site. Reads: lattice.js, each town's clean/map.json (① — rings, labels, owners, eps,
// split by `inkByOwner`, the producer's own function) and its shore-median.json — never a copy of either.
//
//   node checks/claims-the-shore-is-one-line.mjs [--scene=<id> …] [--median-dir=<dir>] [--root=<checkout>]
//   (<dir>/<scene>/shore-median.json; --root: the checkout holding the towns' data, which is not in git)
// It first judges three drawn cases (a median ON the ink's edge, one reaching 2 mm into it, one 1.5 m clear) and stops
// RED if it misjudges any.
//
// ⭐ MUTATION TEST, run 2026-10-17 — each turns this RED: the vertex test's `d > LATTICE_M` → `d > 1` with
// MUTATE_AREA_TOL=1e6 · the vertex test removed (the area test alone passes the 2 mm case: the vertices carry the claim)
// · a boundary point counted inside with no lattice step (the case ON the edge fails) · every town read as inland
// (nothing checked) · a median cut from the water face (RED on Huron and PTown).
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import clipperLib from 'clipper-lib'
import { LATTICE_M, CLIP_SCALE } from '../src/lib/lattice.js'
import { inkByOwner } from '../src/lib/tileGround.js'
import { coastVerdict } from '../cartograph/shoreRuns.mjs'

const args = process.argv.slice(2)
const ROOT = (args.find(a => a.startsWith('--root=')) || '').slice(7) || join(dirname(fileURLToPath(import.meta.url)), '..')
const medDir = (args.find(a => a.startsWith('--median-dir=')) || '').slice(13) || null
let scenes = args.filter(a => a.startsWith('--scene=')).map(a => a.slice(8))
if (!scenes.length) scenes = readdirSync(join(ROOT, 'cartograph', 'data')).filter(s => existsSync(join(ROOT, 'cartograph', 'data', s, 'clean', 'map.json')))
const AREA_TOL = Number(process.env.MUTATE_AREA_TOL || 1)   // mutation test only

const { Clipper, ClipType, PolyType, PolyFillType } = clipperLib
const P = (r) => r.map(([x, z]) => ({ X: Math.round(x * CLIP_SCALE), Y: Math.round(z * CLIP_SCALE) }))
const R = (p) => p.map(q => [q.X / CLIP_SCALE, q.Y / CLIP_SCALE])
const clip = (op, a, b) => { const c = new Clipper(), out = []; c.AddPaths(a.map(P), PolyType.ptSubject, true); c.AddPaths(b.map(P), PolyType.ptClip, true)
  c.Execute(op, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return out.map(R) }
const area = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0) / 2
const perim = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + Math.hypot(q[0] - p[0], q[1] - p[1]) }, 0)
const segD = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
const bbOf = (r) => { let a = [Infinity, Infinity, -Infinity, -Infinity]; for (const [x, z] of r) a = [Math.min(a[0], x), Math.min(a[1], z), Math.max(a[2], x), Math.max(a[3], z)]; return a }

// judge(median rings, ink rings) → { overM2, tolM2, inside: [{ v, d }] }
function judge(med, ink) {
  const over = clip(ClipType.ctIntersection, med, ink).filter(r => r.length >= 3)
  const overM2 = Math.abs(over.reduce((t, r) => t + area(r), 0)), tolM2 = AREA_TOL * LATTICE_M * over.reduce((t, r) => t + perim(r), 0)
  // inside the ink: non-zero winding over its rings (Clipper's own point test; -1 = on a boundary, never inside)
  const inkP = ink.map(P), bb = ink.map(bbOf)
  const inside = (v) => { let w = 0; const q = { X: Math.round(v[0] * CLIP_SCALE), Y: Math.round(v[1] * CLIP_SCALE) }
    for (let k = 0; k < inkP.length; k++) { const b = bb[k]; if (v[0] < b[0] || v[0] > b[2] || v[1] < b[1] || v[1] > b[3]) continue
      const s = Clipper.PointInPolygon(q, inkP[k]); if (s === -1) return false; if (s) w += Clipper.Orientation(inkP[k]) ? 1 : -1 } return w !== 0 }
  const out = []
  for (const r of med) for (const v of r) {
    if (!inside(v)) continue
    let d = Infinity; ink.forEach((ir, k) => { const b = bb[k]; if (v[0] < b[0] - 1 || v[0] > b[2] + 1 || v[1] < b[1] - 1 || v[1] > b[3] + 1) return
      for (let i = 0; i < ir.length; i++) d = Math.min(d, segD(v, ir[i], ir[(i + 1) % ir.length])) })
    if (d > LATTICE_M) out.push({ v, d })
  }
  return { overM2, tolM2, inside: out }
}

let failed = 0, towns = 0
{ // the three drawn cases: an ink band x ∈ [10, 10.01], a median on its water side starting at three places
  const ink = [[[10, 0], [10.01, 0], [10.01, 10], [10, 10]]], med = (x) => [[[x, 0], [20, 0], [20, 10], [x, 10], [x, 5]]]
  for (const [x, bad, what] of [[10.01, false, 'a median ON the ink\'s water edge'], [10.008, true, 'a median reaching 2 mm into the ink'], [11.51, false, 'a median 1.5 m clear of it']]) {
    const j = judge(med(x), ink), red = j.overM2 > j.tolM2 || j.inside.length > 0
    if (red !== bad) { console.log(`⛔ the check misjudges ${what}: ${red ? 'RED' : 'GREEN'} (overlap ${j.overM2.toFixed(6)} m², tolerance ${j.tolM2.toFixed(6)}, ${j.inside.length} vertices inside)`); failed++ } }
  if (failed) { console.log('\n⛔ RED — the check itself is wrong'); process.exit(1) }
}
for (const scene of scenes) {
  const map = JSON.parse(readFileSync(join(ROOT, 'cartograph', 'data', scene, 'clean', 'map.json'), 'utf8'))
  const Pp = map.layers?.ribbons?.protopolygon
  if (!Pp?.rings?.length || !Pp?.owners?.length || !(Pp.eps > 0)) continue
  const ink = inkByOwner(Pp, Pp.owners, Pp.eps).shoreInk
  if (!ink.length) continue                                     // no coast in ① — no shore to judge
  // whether a median is OWED is the kit's own verdict (shoreRuns.mjs#coastVerdict, as bake-shore-median reads it): an
  // inland town (its terrain's datum is not the water and no __water__ run reaches its drawing) has none, by design
  const tmP = join(ROOT, 'cartograph', 'data', scene, 'clean', 'terrain.json'), shP = join(ROOT, 'public', 'baked', scene, 'shape.json')
  if (!existsSync(tmP) || !existsSync(shP)) { console.log(`⛔ ${scene}: ① has a coast ink but ${existsSync(tmP) ? shP : tmP} is missing — whether a median is owed cannot be judged`); failed++; continue }
  const cv = coastVerdict(JSON.parse(readFileSync(tmP, 'utf8')), JSON.parse(readFileSync(shP, 'utf8')))
  if (cv.agree === 'inland') { console.log(`·  ${scene}: inland (coastVerdict) — no median is owed, nothing to judge`); continue }
  if (cv.agree !== 'build') { console.log(`⛔ ${scene}: coastVerdict says ${cv.agree} — the median cannot be built, so the shore cannot be judged`); failed++; continue }
  const medPath = medDir ? join(medDir, scene, 'shore-median.json') : join(ROOT, 'public', 'baked', scene, 'shore-median.json')
  if (!existsSync(medPath)) { console.log(`⛔ ${scene}: ① has a coast ink but there is no shore median at ${medPath}`); failed++; continue }
  const med = JSON.parse(readFileSync(medPath, 'utf8'))
  const rings = ['seaward', 'landward'].flatMap(k => (med.regions?.[k] || []).flatMap(it => [it.outer, ...(it.holes || [])]))
  towns++
  const j = judge(rings, ink), name = medPath.replace(ROOT + '/', '')
  if (j.overM2 > j.tolM2 || j.inside.length) { failed++
    console.log(`⛔ ${scene} · ${name}: ${j.overM2.toFixed(3)} m² of median lies in ①'s coast ink (tolerance ${j.tolM2.toFixed(3)} m²) · ${j.inside.length} median vertices inside the ink, off its edges — a line inside the shore`)
    for (const { v, d } of j.inside.sort((a, b) => b.d - a.d).slice(0, 4)) console.log(`     (${v[0]}, ${v[1]}) ${(d * 1000).toFixed(3)} mm inside the ink`)
  } else console.log(`✅ ${scene} · ${name}: the median and the coast ink tile — ${j.overM2.toFixed(4)} m² overlap (tolerance ${j.tolM2.toFixed(4)}), no median vertex inside the ink`)
}
if (!towns) { console.log('⛔ no town with a coast ink and a median was read — nothing was checked'); failed++ }
console.log(`\n${failed ? '⛔ RED — the shore median does not close against the coast ink' : '✅ GREEN — every shore median closes against its coast ink'}`)
process.exit(failed ? 1 : 0)
