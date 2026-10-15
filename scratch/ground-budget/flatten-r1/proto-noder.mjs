// proto-noder.mjs — the per-piece evidence cut, STAMPED: the RAW land evidence (ribbons.landEvidence, prepared as the painter
// does) and the tile's block contours (iaFull, iA) are noded ONCE by stampCrossings — every crossing computed from its two
// segments, rounded once, written into both — and only then is each piece of iA⁺ intersected with the stamped evidence.
// Measures, against the frozen evidenceByPiece: the near-T count (an evidence vertex 0 < d ≤ 5 mm off an iA⁺ edge, not a
// vertex of it), the area held (sanity), and the cross-class overlap (stampTally's measure until Cairn's is in hand).
import { readFileSync } from 'fs'
import { stampCrossings, intersectRings, prepareEvidence, piecesOfIA, ringsArea } from './tileGround.proto.js'
const town = process.argv[2] || 'hipointedemun'
const T = JSON.parse(readFileSync(`/Users/jacobhenderson/Desktop/lafayette-square.nosync/public/baked/${town}/shape.json`, 'utf8')).tiles
const groups = prepareEvidence(JSON.parse(readFileSync(`/Users/jacobhenderson/Desktop/lafayette-square.nosync/cartograph/data/${town}/clean/ribbons.json`, 'utf8')).landEvidence)
const sd = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
const bbOf = (rs) => { const b = [Infinity, -Infinity, Infinity, -Infinity]; for (const r of rs) for (const p of r) { b[0] = Math.min(b[0], p[0]); b[1] = Math.max(b[1], p[0]); b[2] = Math.min(b[2], p[1]); b[3] = Math.max(b[3], p[1]) } return b }
const nearT = (iA, evList) => { const keys = new Set(iA.flat().map(v => v.join(','))); let n = 0
  for (const e of evList || []) for (const r of e.rings) for (const p of r) { if (keys.has(p.join(','))) continue
    let d = Infinity; for (const ring of iA) for (let k = 0; k < ring.length && d > 0; k++) d = Math.min(d, sd(p, ring[k], ring[(k + 1) % ring.length]))
    if (d > 0 && d <= 0.005) { n++; if (process.env.DUMP && evList.stamped) console.log("   near-T", p.join(","), e.ev, "d", (d * 1000).toFixed(3), "mm") } } return n }
const overlap = (list) => { let pairs = 0, m2 = 0; for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) { if (list[a].lu === list[b].lu) continue
  const o = ringsArea(intersectRings(list[a].rings, list[b].rings)); if (o > 0) { pairs++; m2 += o } } return { pairs, m2 } }
const tot = { tiles: 0, ntF: 0, ntP: 0, aF: 0, aP: 0, ovF: 0, ovFm2: 0, ovP: 0, ovPm2: 0, refused: 0, ms: 0 }
for (const [ti, st] of T.entries()) { if (!Array.isArray(st?.evidenceByPiece) || !st.iaFull?.length) continue
  const t0 = Date.now(), bb = bbOf(st.iaFull)
  const near = groups.map(g => ({ g, rings: g.rings.filter(x => !(x.bb[0] > bb[1] || x.bb[1] < bb[0] || x.bb[2] > bb[3] || x.bb[3] < bb[2])).map(x => x.r) })).filter(x => x.rings.length)
  const items = [...st.iaFull.map(r => ({ k: 'b', r })), ...st.iA.map(r => ({ k: 'b', r, cut: true })), ...near.flatMap((x, gi) => x.rings.map(r => ({ k: 'e', gi, r })))]
  let out; try { out = stampCrossings(items.map(x => x.r), (a, b) => items[a].k === items[b].k) } catch (e) { tot.refused++; continue }
  const iAp = [], evRings = near.map(() => []); items.forEach((x, n) => { const pts = out[n].map(v => v.p); if (x.k === 'e') evRings[x.gi].push(pts); else if (x.cut) iAp.push(pts) })
  const proto = st.iA.map(() => null)
  for (const p of piecesOfIA(iAp)) { if (st.evidenceByPiece[p.i] == null) continue
    const parts = []; near.forEach((x, gi) => { const r = intersectRings([p.outer, ...p.holes], evRings[gi]); if (r.length) parts.push({ lu: x.g.paint, ev: x.g.lu, rings: r }) }); proto[p.i] = parts }
  tot.ms += Date.now() - t0; tot.tiles++
  const fz = st.evidenceByPiece.flatMap(l => l || []), pr = proto.flatMap(l => l || [])
  tot.ntF += nearT(st.iA, fz); pr.stamped = true; tot.ntP += nearT(iAp, pr); tot.aF += fz.reduce((t, e) => t + ringsArea(e.rings), 0); tot.aP += pr.reduce((t, e) => t + ringsArea(e.rings), 0)
  for (const l of st.evidenceByPiece) if (l) { const o = overlap(l); tot.ovF += o.pairs; tot.ovFm2 += o.m2 }
  for (const l of proto) if (l) { const o = overlap(l); tot.ovP += o.pairs; tot.ovPm2 += o.m2 }
}
console.log(`${town}: ${tot.tiles} tiles (${tot.refused} refused) · near-T frozen ${tot.ntF} → stamped ${tot.ntP} · area held ${tot.aF.toFixed(1)} → ${tot.aP.toFixed(1)} m² · overlap ${tot.ovF} pairs ${tot.ovFm2.toFixed(3)} m² → ${tot.ovP} pairs ${tot.ovPm2.toFixed(3)} m² · ${(tot.ms / 1000).toFixed(1)} s`)
