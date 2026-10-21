// cutthrough.mjs <scene> <x,z;…> [--out=dir] — PROXY of the protruding-tip ruling (Boz, 2026-10-18; RIBBONS §3.5's "the paving
// across a median's tip is the neighbouring blocks' walks crossing it"): at each tip, what crosses its island —
//   DATA   a recorded crossing (`crosswalkEnds`) landing on its sides: a strip across the island, the norm's width, on the
//          crossing's own line (its two landed ends);
//   WALKS  else, a neighbouring corner's walk run straight on across the street whose first road edge is the tip's ring (and
//          which does not run alongside one of the tip's own streets): that walk's own band, carried across the island;
// each strip paved across, with a ramp at each road edge (the strip within the warning depth of the edge); the nose paved
// as one only where something lands ON it, else it keeps its curb. Drawn over this tree's paint. ⛔ Not built; for Jacob's eye.
import sharp from 'sharp'
import clipperLib from 'clipper-lib'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { feed } from '../../_proto-feed.mjs'
import { resolveCurbCutNorm } from '../../../cartograph/curb-cut-norm.mjs'
import { readSources } from '../../../cartograph/sources.js'
import { intersectRings, differenceRings } from '../../../src/lib/buildBlockGeometryV2.js'
const { buildTileGround } = await import('../../../src/lib/tileGround.js')
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const args = process.argv.slice(2), [scene, sites = ''] = args.filter(a => !a.startsWith('--'))
const OUT = resolve(ROOT, (args.find(a => a.startsWith('--out=')) || '--out=scratch/perp-depths-out').slice(6))
const HALF = +(process.env.HALF || 12), PPM = +(process.env.PPM || 34)
const f = feed(scene), src = readSources(scene), nm = resolveCurbCutNorm(scene, src.declared ? src.state : null)
const pl = console.log, pw = console.warn; console.log = () => {}; console.warn = () => {}
const R = buildTileGround({ ...f.ribbons, curbCutNorm: nm }, { grout: 'proto', smooth: 0, stencil: f.stencil, curbWidth: f.curbWidth, curbedMinWidth: f.curbedMinWidth, blockCustoms: f.blockCustoms, blockLandUse: f.blockLandUse, cornerCornerRadiusOverrides: f.cornerCornerRadiusOverrides, cornerRadiusOverrides: f.cornerRadiusOverrides, cornerRadiusScale: f.cornerRadiusScale ?? 1, protoProducer: true })
console.log = pl; console.warn = pw
const T = R.protoShapeTiles || [], W = nm.width, D = nm.warningDepth
const S = 1000, inset = (rings, d) => { const co = new clipperLib.ClipperOffset(); for (const r of rings) co.AddPath(r.map(([x, z]) => ({ X: Math.round(x * S), Y: Math.round(z * S) })), clipperLib.JoinType.jtMiter, clipperLib.EndType.etClosedPolygon)
  const out = []; co.Execute(out, -d * S); return out.map(p => p.map(q => [q.X / S, q.Y / S])) }
const recs = (R.curbCutRecs || []).filter(r => r.along && r.face)
const edges = []; T.forEach((t, ti) => (t?.iaFull || []).forEach((ring, si) => { for (let k = 0; k < ring.length; k++) edges.push({ ti, si, a: ring[k], b: ring[(k + 1) % ring.length] }) }))
const firstHit = (O, d, maxL = 60) => { let best = null
  for (const e of edges) { const ex = e.b[0] - e.a[0], ez = e.b[1] - e.a[1], den = d[0] * ez - d[1] * ex; if (Math.abs(den) < 1e-12) continue
    const wx = e.a[0] - O[0], wz = e.a[1] - O[1], s = (wx * ez - wz * ex) / den, t = (wx * d[1] - wz * d[0]) / den
    if (t >= 0 && t <= 1 && s > 0.2 && s < maxL && (!best || s < best.s)) best = { s, e, P: [O[0] + d[0] * s, O[1] + d[1] * s] } }
  return best }
const strip = (P0, d, half, L = 80) => { const n = [-d[1], d[0]]; return [[P0[0] + n[0] * half - d[0] * 0.5, P0[1] + n[1] * half - d[1] * 0.5], [P0[0] + n[0] * half + d[0] * L, P0[1] + n[1] * half + d[1] * L], [P0[0] - n[0] * half + d[0] * L, P0[1] - n[1] * half + d[1] * L], [P0[0] - n[0] * half - d[0] * 0.5, P0[1] - n[1] * half - d[1] * 0.5]] }
const at = sites.split(';').filter(Boolean).map(s => s.split(',').map(Number))
const notes = []
for (const [i, [cx, cz]] of at.entries()) {
  const c = (R.curbCutCorners || []).filter(c => c.arcPts && c.wedge).sort((a, b) => Math.hypot(a.at[0] - cx, a.at[1] - cz) - Math.hypot(b.at[0] - cx, b.at[1] - cz))[0]
  const ring = T[c.tile].iaFull[c.si], island = [ring]
  const rs = recs.filter(r => r.tile === c.tile && r.si === c.si && r.arc === c.arc)
  const own = new Set(rs.flatMap(r => (r.serves || []).flatMap(v => [v.leg?.skelId, v.other?.skelId])).filter(Boolean))
  const A = c.arcPts, onNose = (P) => { let d = Infinity; for (let k = 1; k < A.length; k++) { const a = A[k - 1], b = A[k], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz
    const t = L2 ? Math.max(0, Math.min(1, ((P[0] - a[0]) * dx + (P[1] - a[1]) * dz) / L2)) : 0; d = Math.min(d, Math.hypot(P[0] - a[0] - t * dx, P[1] - a[1] - t * dz)) } return d < 0.05 }
  const strips = []; let nose = false, nData = 0, nWalk = 0
  // DATA: recorded crossings landed on this ring, on its own line (its two ends)
  const byId = new Map(); T.forEach(t => (t?.crosswalkEnds || []).forEach(x => (byId.get(x.osmId) || byId.set(x.osmId, []).get(x.osmId)).push(x)))
  for (const x of (T[c.tile].crosswalkEnds || []).filter(x => x.si === c.si && Math.hypot(x.at[0] - cx, x.at[1] - cz) < 25)) {
    const other = (byId.get(x.osmId) || []).find(y => y !== x); if (!other) continue
    const d0 = [x.at[0] - other.at[0], x.at[1] - other.at[1]], l = Math.hypot(...d0); if (!(l > 0.1)) continue
    if (onNose(x.at)) nose = true; else { strips.push(...intersectRings([strip(x.at, [d0[0] / l, d0[1] / l], W / 2)], island)); nData++ } }
  // WALKS: neighbouring corners' walks run straight across the street onto this ring
  if (!nData) for (const r of recs) { if (r.tile === c.tile && r.si === c.si) continue
    if (Math.hypot(r.at[0] - cx, r.at[1] - cz) > 60 || (r.serves || []).some(v => own.has(v.other?.skelId))) continue
    const l = Math.hypot(...r.along), d = [-r.along[0] / l, -r.along[1] / l], M = [(r.face[0][0] + r.face[1][0]) / 2, (r.face[0][1] + r.face[1][1]) / 2]
    const h = firstHit(M, d); if (!h || h.e.ti !== c.tile || h.e.si !== c.si || Math.hypot(h.P[0] - cx, h.P[1] - cz) > 25) continue
    if (onNose(h.P)) { nose = true; continue }
    const half = Math.hypot(r.face[1][0] - r.face[0][0], r.face[1][1] - r.face[0][1]) / 2
    strips.push(...intersectRings([strip(h.P, d, half)], island)); nWalk++ }
  const inner = inset(island, D), ramps = strips.length ? differenceRings(strips, inner) : []
  const pad = nose ? (() => { const pts = [...A]; const cuts = intersectRings(R.curbCut || [], [[[cx - 6, cz - 6], [cx + 6, cz - 6], [cx + 6, cz + 6], [cx - 6, cz + 6]]]); pts.push(...cuts.flat())
    const hull = (P) => { P = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = [], up = []
      for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p) }
      for (const p of P.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p) }
      return lo.slice(0, -1).concat(up.slice(0, -1)) }
    return intersectRings([hull(pts)], island) })() : []
  notes.push({ i, at: [cx, cz], nData, nWalk, nose })
  const P = ([x, z]) => `${((x - cx + HALF) * PPM).toFixed(1)},${((z - cz + HALF) * PPM).toFixed(1)}`
  const vis = (rr) => rr.some(([x, z]) => Math.abs(x - cx) < HALF * 3 && Math.abs(z - cz) < HALF * 3)
  const path = (rs2) => (rs2 || []).filter(vis).map(rr => 'M' + rr.map(P).join('L') + 'Z').join(' ')
  const base = [['asphalt', R.asphalt, '#3b3b3b'], ['lu', Object.values(R.luByClass || {}).flat(), '#d9cfb8'], ['lawn', Object.values(R.treelawnByLu || {}).flat(), '#6fa35a'], ['walk', R.sidewalk, '#c9c9c4'], ['curb', R.curb, '#8a8a85'], ['cut', R.curbCut, '#e2a514']]
  for (const [tag, L, what] of [['built', base, 'AS BUILT: the kit default'], ['cross', [...base, ['strip', strips, '#c9c9c4'], ['ramp', ramps, '#e2a514'], ['pad', pad, '#e2a514']], `PROPOSAL: ${nData ? `${nData} recorded crossing(s)` : nWalk ? `${nWalk} neighbouring walk(s)` : 'nothing'} across the island${nose ? ', nose paved' : ', nose kept'} — not built`]]) {
    const Wd = 2 * HALF * PPM, t = `PROXY — ${scene} (${cx}, ${cz}) — ${what} — not the operator's eye-gate`
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Wd}" height="${Wd}"><rect width="100%" height="100%" fill="#222"/>` + L.map(([, rs2, col]) => `<path d="${path(rs2)}" fill="${col}" fill-rule="nonzero" stroke="none"/>`).join('') +
      `<rect x="0" y="0" width="${Wd}" height="22" fill="#000" opacity="0.7"/><text x="6" y="15" font-family="Helvetica" font-size="11" fill="#fff">${t}</text>` +
      `<line x1="${Wd - 6 - PPM * 2}" y1="${Wd - 10}" x2="${Wd - 6}" y2="${Wd - 10}" stroke="#fff" stroke-width="2"/><text x="${Wd - 6 - PPM * 2}" y="${Wd - 14}" font-family="Helvetica" font-size="11" fill="#fff">2 m</text></svg>`
    await sharp(Buffer.from(svg)).png().toFile(`${OUT}/${scene}-cross-${i}-${tag}.png`) }
}
console.log(JSON.stringify(notes))
