// census.mjs — every ① vertex offsetRingByRects turns at by LESS than the corner tolerance (FILLET_TURN_TOL, read from
// tileGround.js's source, never restated), with its join (miter · chord · none) and its ORIGIN, classed at the mint's own
// inputs (the chains — the one place reading a chain is legitimate):
//   (a) a curve sample: the ① vertex sits on a ribbon point (within the ink's width) that is NOT a skeleton anchor
//       (tessellateAdaptive emitted it inside a bezier);
//   (b) a chain cut: its two ① edges carry different skelIds or segOrds of ONE road (the road runs straight through);
//   (b′) two different roads meeting at a shallow turn;
//   (c) union / lattice rounding: no chain point within the ink's width — Clipper or the lattice made it;
//   (d) a skeleton vertex: the ribbon point it sits on IS a skeleton anchor (a node of the source line, a real small turn);
//   (t) a dead-end cap or the two sides of one chain; (u) an edge with no owner.
// Optionally joins the short ② edges (stamp-audit's 77: their shared ① vertex) and counts what "no join below the
// tolerance" would remove, and the gap it would open on the convex side (2·d·sin(θ/2)).
//   node scratch/ground-budget/join-census/census.mjs --census=<json> --ribbons=<json> --skeleton=<json> --tileground=<tileGround.js> [--short=<stamp4 json>] [--show=3]
import { readFileSync } from 'fs'
import { LATTICE_M } from '../../../src/lib/lattice.js'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const SHOW = +(arg('show') || 3)
const m = readFileSync(arg('tileground'), 'utf8').match(/const FILLET_TURN_TOL = (\d+(?:\.\d+)?) \* Math\.PI \/ 180/)
if (!m) throw new Error('census: FILLET_TURN_TOL not found in tileGround.js — the corner rule cannot be read')
const TOL = +m[1]
const C = JSON.parse(readFileSync(arg('census'), 'utf8'))
const rib = JSON.parse(readFileSync(arg('ribbons'), 'utf8')).streets || [], skel = JSON.parse(readFileSync(arg('skeleton'), 'utf8')).streets || []
const EPS = 0.005, NEAR = 2 * EPS + 2 * LATTICE_M     // the ink's width (2ε) and two grid steps of rounding
const anchors = new Set(skel.flatMap(s => (s.points || []).map(q => Array.isArray(q) ? `${q[0]},${q[1]}` : `${q.x},${q.z}`)))
const CELL = 1, grid = new Map()
for (const s of rib) for (const p of s.points || []) { const k = `${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`; (grid.get(k) || grid.set(k, []).get(k)).push({ p, id: s.skelId }) }
const nearestRib = (v) => { let best = null, bd = Infinity; const cx = Math.floor(v[0] / CELL), cz = Math.floor(v[1] / CELL)
  for (let x = cx - 1; x <= cx + 1; x++) for (let z = cz - 1; z <= cz + 1; z++) for (const e of grid.get(`${x},${z}`) || []) { const d = Math.hypot(e.p[0] - v[0], e.p[1] - v[1]); if (d < bd) { bd = d; best = e } }
  return { d: bd, e: best } }
const road = (id) => String(id ?? '').replace(/-\d+$/, '')
const origin = (r) => {
  const a = r.oA, b = r.oS
  if (!a || !b) return 'u · an edge with no owner'
  if (a[3] || b[3] || (a[0] === b[0] && a[1] !== b[1])) return 't · a dead-end cap / the two sides of one chain'
  if (a[0] !== b[0] || a[2] !== b[2]) return road(a[0]) === road(b[0]) ? 'b · a chain cut (one road runs straight through)' : 'b′ · two different roads at a shallow turn'
  const n = nearestRib(r.v)
  if (!(n.d <= NEAR)) return 'c · no chain point within the ink: union / lattice rounding'
  return anchors.has(`${n.e.p[0]},${n.e.p[1]}`) ? 'd · a skeleton anchor (a node of the source line)' : 'a · a curve sample (tessellateAdaptive, inside a bezier)'
}
const sub = C.filter(r => r.turnDeg < TOL)
const bins = [0.01, 0.1, 1, 5, TOL], bin = (t) => bins.find(b => t < b)
const byO = new Map()
for (const r of sub) { r.o = origin(r); const s = byO.get(r.o) || { n: 0, join: 0, miter: 0, chord: 0, bins: new Map(), ex: [] }
  s.n++; if (r.join === 'miter' || r.join === 'chord') { s.join++; s[r.join]++ }
  const bb = bin(r.turnDeg); s.bins.set(bb, (s.bins.get(bb) || 0) + 1); if (s.ex.length < SHOW && (r.join === 'chord' || r.join === 'miter')) s.ex.push(r); byO.set(r.o, s) }
const joinsAll = C.filter(r => r.join === 'miter' || r.join === 'chord').length
console.log(`${arg('census')}: ${C.length} ① vertices offset (outer rings and holes) · ${joinsAll} build a join · corner tolerance ${TOL}° (tileGround.js FILLET_TURN_TOL)`)
console.log(`below it: ${sub.length} vertices · ${sub.filter(r => r.join === 'miter' || r.join === 'chord').length} build a join (depth on a side and a turn > 1e-12) · ${sub.filter(r => r.join === 'none (no depth)').length} none (no depth) · ${sub.filter(r => r.join === 'none (straight)').length} none (exactly straight)`)
const allBins = new Map(); for (const r of sub) { const bb = bin(r.turnDeg); allBins.set(bb, (allBins.get(bb) || 0) + 1) }
console.log(`  turn bins: ${bins.map(b => `< ${b}° ${allBins.get(b) || 0}`).join(' · ')}`)
// the short ② edges' ① vertices (stamp-audit, run4's capture): the shared vertex of two adjacent ① edges among their operands
const shortV = new Set(); let shortN = 0
if (arg('short')) { const S = JSON.parse(readFileSync(arg('short'), 'utf8')), recs = (S.offNull || []).filter(o => o.ops)
  const unst = []; for (const t of S.tiles) (t.iaFull || []).forEach((ring, ri) => ring.forEach((p, i) => { if (t.iaStamp?.[ri]?.[i] == null && t.iaCap?.[ri]?.[i] == null) unst.push(p) }))
  for (const p of unst) { let o = null, bd = 1e-3; for (const r of recs) { const d = Math.hypot(r.p[0] - p[0], r.p[1] - p[1]); if (d < bd) { bd = d; o = r } } if (!o) continue
    const L = [...new Map(o.ops.map(op => [op.lab, op])).values()]
    for (const x of L) for (const y of L) if (x !== y && x.ring[1][0] === y.ring[0][0] && x.ring[1][1] === y.ring[0][1]) { shortV.add(`${x.ring[1][0]},${x.ring[1][1]}`) }
    shortN++ } }
const recAt = new Map(C.map(r => [`${r.v[0]},${r.v[1]}`, r]))
console.log('\nby origin (below the tolerance):')
for (const [o, s] of [...byO].sort((a, b) => b[1].n - a[1].n)) {
  const held = [...shortV].filter(k => recAt.get(k)?.o === o).length
  console.log(`  ${String(s.n).padStart(6)}  ${o} · build a join ${s.join} (miter ${s.miter} · chord ${s.chord}) · ${bins.map(b => `<${b}° ${s.bins.get(b) || 0}`).join(' ')}${arg('short') ? ` · short-edge vertices ${held}` : ''}`) }
if (arg('short')) {
  const at = [...shortV].map(k => recAt.get(k)), found = at.filter(Boolean)
  console.log(`\nthe ${shortN} short ② edges sit at ${shortV.size} distinct ① vertices · ${found.length} found in the census · turn < ${TOL}°: ${found.filter(r => r.turnDeg < TOL).length} · ≥: ${found.filter(r => r.turnDeg >= TOL).length}`)
  console.log(`  "no join below the tolerance" would remove the join at ${found.filter(r => r.turnDeg < TOL).length} of those ${shortV.size} vertices (the short edges' own construction); at ${found.filter(r => r.turnDeg >= TOL).length} the join stays, a corner`) }
// what "no join" would open: the convex-side gap between the two bands' ends, 2·d·sin(θ/2), at every sub-tolerance join
const gaps = sub.filter(r => r.join === 'miter' || r.join === 'chord').map(r => 2 * Math.max(r.dA, r.dS) * Math.sin(r.turnDeg * Math.PI / 360)).sort((a, b) => a - b)
if (gaps.length) { const q = (p) => gaps[Math.floor(p * (gaps.length - 1))]
  console.log(`\nif those joins were not built: the gap between the two bands' ends, 2·d·sin(θ/2): p50 ${(q(0.5) * 1000).toFixed(1)} mm · p90 ${(q(0.9) * 1000).toFixed(1)} mm · max ${(gaps.at(-1)).toFixed(3)} m · ≤ LATTICE_M ${gaps.filter(g => g <= LATTICE_M).length} · > 1 cm ${gaps.filter(g => g > 0.01).length} · > 10 cm ${gaps.filter(g => g > 0.1).length} (of ${gaps.length})`) }
console.log('\nworked sites (joins built), per origin:')
for (const [o, s] of byO) for (const r of s.ex) console.log(`  ${o.split(' ·')[0]} · ① vertex (${r.v[0].toFixed(3)}, ${r.v[1].toFixed(3)}) · turn ${r.turnDeg.toFixed(4)}° · ${r.join} · depths ${r.dA.toFixed(3)}/${r.dS.toFixed(3)} m · edges ${r.oA ? `${r.oA[0]}:${r.oA[1]}:${r.oA[2]}` : '∅'} → ${r.oS ? `${r.oS[0]}:${r.oS[1]}:${r.oS[2]}` : '∅'}${(() => { const n = nearestRib(r.v); return n.e ? ` · nearest ribbon point ${(n.d * 1000).toFixed(1)} mm (${n.e.id}${anchors.has(`${n.e.p[0]},${n.e.p[1]}`) ? ', a skeleton anchor' : ''})` : '' })()}`)
