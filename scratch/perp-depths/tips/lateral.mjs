// lateral.mjs <scene> — per protruding tip (a perpendicular corner under 60° between its legs, the norm the pour would freeze
// now): what reaches its island. (1) DATA: recorded crossings (`crosswalkEnds`, landed on the frozen curb by the pour) with an
// end on the tip's own ring — at its NOSE (on its arc) or LATERAL (on its sides). (2) NO DATA: the neighbouring corners' walks,
// each run straight on from its ramp across the street to the first road edge it meets — those whose first edge is the tip's
// ring, at the nose or lateral. Census bound: 15 m of ring either side of the nose (a bound on this count, not a rule).
// Measures only.
import { feed } from '../../_proto-feed.mjs'
import { resolveCurbCutNorm } from '../../../cartograph/curb-cut-norm.mjs'
import { readSources } from '../../../cartograph/sources.js'
const { buildTileGround } = await import('../../../src/lib/tileGround.js')
const scene = process.argv[2], f = feed(scene), src = readSources(scene), nm = resolveCurbCutNorm(scene, src.declared ? src.state : null)
const pl = console.log, pw = console.warn; console.log = () => {}; console.warn = () => {}
const R = buildTileGround({ ...f.ribbons, curbCutNorm: nm }, { grout: 'proto', smooth: 0, stencil: f.stencil, curbWidth: f.curbWidth, curbedMinWidth: f.curbedMinWidth, blockCustoms: f.blockCustoms, blockLandUse: f.blockLandUse, cornerCornerRadiusOverrides: f.cornerCornerRadiusOverrides, cornerRadiusOverrides: f.cornerRadiusOverrides, cornerRadiusScale: f.cornerRadiusScale ?? 1, protoProducer: true })
console.log = pl; console.warn = pw
const T = R.protoShapeTiles || []
const ang = (u, v) => Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))))) * 180 / Math.PI
const recs = (R.curbCutRecs || []).filter(r => r.along && r.face)
// every road edge, by tile and ring: the rays below ask which one they meet first
const edges = []; T.forEach((t, ti) => (t?.iaFull || []).forEach((ring, si) => { for (let k = 0; k < ring.length; k++) edges.push({ ti, si, k, a: ring[k], b: ring[(k + 1) % ring.length] }) }))
const firstHit = (O, d, maxL = 60) => { let best = null
  for (const e of edges) { const ex = e.b[0] - e.a[0], ez = e.b[1] - e.a[1], den = d[0] * ez - d[1] * ex; if (Math.abs(den) < 1e-12) continue
    const wx = e.a[0] - O[0], wz = e.a[1] - O[1], s = (wx * ez - wz * ex) / den, t = (wx * d[1] - wz * d[0]) / den
    if (t >= 0 && t <= 1 && s > 0.2 && s < maxL && (!best || s < best.s)) best = { s, e, P: [O[0] + d[0] * s, O[1] + d[1] * s] } }
  return best }
// ring arclength between two points on one ring (shorter way), and the arc's own span on it
const ringPos = (ring, P) => { let cum = 0, best = null; for (let k = 0; k < ring.length; k++) { const U = ring[k], V = ring[(k + 1) % ring.length], dx = V[0] - U[0], dz = V[1] - U[1], L2 = dx * dx + dz * dz, L = Math.sqrt(L2)
  const t = L2 ? Math.max(0, Math.min(1, ((P[0] - U[0]) * dx + (P[1] - U[1]) * dz) / L2)) : 0, d = Math.hypot(P[0] - U[0] - t * dx, P[1] - U[1] - t * dz)
  if (!best || d < best.d) best = { d, s: cum + t * L }; cum += L } return { ...best, len: cum } }
const out = []
let skipped = 0, nbAlongside = 0
for (const c of (R.curbCutCorners || []).filter(c => c.wedge && c.arcPts)) {
  const rs = recs.filter(r => r.tile === c.tile && r.si === c.si && r.arc === c.arc)
  if (rs.length !== 2) continue
  // the tip's own streets: the two its ramps serve (each ramp crosses one, its walk runs along the other)
  const own = new Set(rs.flatMap(r => (r.serves || []).flatMap(v => [v.leg?.skelId, v.other?.skelId])).filter(Boolean))
  // ⛔ SKIPPED BY NAME, for this census only (Boz, 2026-10-18): HPDM's heels-path / wheels-path "tips" are named footways drawn
  // as streets (the A19 question, with Jacob) — not a rule, and not in any painter
  if ([...own].some(k => /^(heels|wheels)-path/.test(k))) { skipped++; continue }
  const a = ang(rs[0].along, rs[1].along); if (!(a < 60)) continue
  const ring = T[c.tile]?.iaFull?.[c.si]; if (!ring) continue
  const pa = ringPos(ring, c.arcPts[0]), pb = ringPos(ring, c.arcPts[c.arcPts.length - 1])
  const near = (P) => { const p = ringPos(ring, P); if (p.d > 0.05) return null
    const dd = (x, y) => Math.min(Math.abs(x - y), p.len - Math.abs(x - y))
    const lo = Math.min(pa.s, pb.s), hi = Math.max(pa.s, pb.s), inArc = (hi - lo) < p.len / 2 ? (p.s >= lo - 0.05 && p.s <= hi + 0.05) : (p.s <= lo + 0.05 || p.s >= hi - 0.05)
    if (inArc) return 'nose'; return Math.min(dd(p.s, pa.s), dd(p.s, pb.s)) <= 15 ? 'lateral' : null }
  // (1) recorded crossings landed on this ring
  const ev = { nose: new Set(), lateral: new Set() }
  for (const x of (T[c.tile]?.crosswalkEnds || []).filter(x => x.si === c.si)) { const w = near(x.at); if (w) ev[w].add(x.osmId) }
  // (2) neighbouring corners' walks run straight across the street: is the first road edge they meet this tip's ring?
  const nb = { nose: 0, lateral: 0 }
  for (const r of recs) { if (r.tile === c.tile && r.si === c.si) continue
    // a walk CROSSES to the tip only if it does not run alongside one of the tip's own streets (its identity, never a distance)
    const alongside = (r.serves || []).some(v => own.has(v.other?.skelId)); if (alongside) { nbAlongside++; continue }
    if (Math.hypot(r.at[0] - c.at[0], r.at[1] - c.at[1]) > 60) continue
    const l = Math.hypot(...r.along), d = [-r.along[0] / l, -r.along[1] / l], M = [(r.face[0][0] + r.face[1][0]) / 2, (r.face[0][1] + r.face[1][1]) / 2]
    const h = firstHit(M, d); if (!h || h.e.ti !== c.tile || h.e.si !== c.si) continue
    const w = near(h.P); if (w) nb[w]++ }
  out.push({ at: c.at, angle: a, ev: { nose: ev.nose.size, lateral: ev.lateral.size }, nb })
}
const k = (o) => o.ev.lateral ? 'data: lateral' : o.nb.lateral ? 'walks: lateral' : 'nothing lateral'
const tally = {}; for (const o of out) tally[k(o)] = (tally[k(o)] || 0) + 1
const nose = out.filter(o => o.ev.nose || o.nb.nose).length
console.log(`${scene}: ${out.length} protruding tip(s) (< 60°, two ramps)${skipped ? ` · ${skipped} skipped by name (heels/wheels-path)` : ''} · ${nbAlongside} neighbouring walk(s) set aside as running alongside a tip street`)
console.log(`  lateral crossing — ${Object.entries(tally).map(([a, b]) => `${a}: ${b}`).join(' · ')}`)
console.log(`  blended nose (a recorded crossing or a neighbouring walk lands ON the nose): ${nose} — by data ${out.filter(o => o.ev.nose).length}, by walks only ${out.filter(o => !o.ev.nose && o.nb.nose).length}`)
for (const o of out.sort((p, q) => p.angle - q.angle).slice(0, 10)) console.log(`    (${o.at.map(v => v.toFixed(1))}) ${o.angle.toFixed(0)}° · recorded: nose ${o.ev.nose}, lateral ${o.ev.lateral} · walks: nose ${o.nb.nose}, lateral ${o.nb.lateral}`)
