// grade-crossings.mjs — two rows per town, read-only, from clean/skeleton.json (the chains, with `sources` = osm ids) and
// raw/osm.json (the source ways' own tags and lines) (Boz, 2026-10-18, after the HPDM stripe/crease site at (575.6, 1165.6):
// motorway-link-1, gradeSeparated, crosses Clayton Avenue — bridge:true, layer 1, gradeSeparated:false — with no node).
//   (1) a gradeSeparated chain whose line crosses an at-grade chain's line with no vertex of either within NODE_M of the
//       crossing. Each crossing is classed by the two SOURCE WAYS that carry it there (nearest source way of each chain):
//       OSM separates them (bridge / tunnel / layer differ) or OSM puts both at grade.
//   (2) chains carrying bridge / tunnel / layer ≠ 0 on some source way that are NOT gradeSeparated, with the off-grade
//       length (sum of those source ways) against the chain's.
// The flag is set in cartograph/skeleton.js `gradeFields`: gradeSeparated = gradeFacts(sources).entirelyOffGrade (EVERY source
// way bridge / tunnel / layer ≠ 0) || (LIMITED_ACCESS class && not a two-way motorway). A partly-off-grade chain is
// therefore at grade by design (the comment above `gradeFields(highway, chain.sources)`: "Mississippi Ave … still bounds blocks").
//   [GX_AT=x,z] node scratch/footprint-census/grade-crossings.mjs [town …]
import { readFileSync, existsSync, readdirSync } from 'fs'
const NODE_M = 1.0, AT = process.env.GX_AT?.split(',').map(Number)   // GX_AT=x,z also prints every crossing within 3 m of it
const towns = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync('cartograph/data').filter(t => existsSync(`cartograph/data/${t}/clean/skeleton.json`) && existsSync(`cartograph/data/${t}/raw/osm.json`) && !t.endsWith('-staging'))
const off = (t) => (!!t?.bridge && t.bridge !== 'no') || (!!t?.tunnel && t.tunnel !== 'no') || ((parseInt(t?.layer, 10) || 0) !== 0)
const lay = (t) => (parseInt(t?.layer, 10) || 0) + ((!!t?.bridge && t.bridge !== 'no') ? 0.5 : 0) - ((!!t?.tunnel && t.tunnel !== 'no') ? 0.5 : 0)
const len = (c) => c.reduce((s, p, i) => i ? s + Math.hypot(p.x - c[i - 1].x, p.z - c[i - 1].z) : 0, 0)
const segD = (p, a, b) => { const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz) }
const lineD = (p, c) => { let d = Infinity; for (let i = 0; i + 1 < c.length; i++) d = Math.min(d, segD(p, c[i], c[i + 1])); return d }
const X = (a, b, c, d) => { const r = { x: b.x - a.x, z: b.z - a.z }, s = { x: d.x - c.x, z: d.z - c.z }, den = r.x * s.z - r.z * s.x; if (Math.abs(den) < 1e-12) return null
  const t = ((c.x - a.x) * s.z - (c.z - a.z) * s.x) / den, u = ((c.x - a.x) * r.z - (c.z - a.z) * r.x) / den; return t > 0 && t < 1 && u > 0 && u < 1 ? { x: a.x + t * r.x, z: a.z + t * r.z } : null }
for (const town of towns) {
  const S = JSON.parse(readFileSync(`cartograph/data/${town}/clean/skeleton.json`, 'utf8')).streets
  const W = new Map((JSON.parse(readFileSync(`cartograph/data/${town}/raw/osm.json`, 'utf8')).ground?.highway || []).map(f => [f.osmId, f]))
  const bb = (c) => c.reduce((b, p) => [Math.min(b[0], p.x), Math.min(b[1], p.z), Math.max(b[2], p.x), Math.max(b[3], p.z)], [Infinity, Infinity, -Infinity, -Infinity])
  const B = S.map(s => bb(s.points))
  const localWay = (s, p) => { let best = null, bd = Infinity; for (const id of s.sources || []) { const w = W.get(id); if (!w?.coords?.length) continue; const d = lineD(p, w.coords); if (d < bd) { bd = d; best = w } } return best }
  // (1)
  const gs = S.map((s, i) => i).filter(i => S[i].gradeSeparated), at = S.map((s, i) => i).filter(i => !S[i].gradeSeparated)
  let n = 0, sep = 0, bothAt = 0, noWay = 0; const ex = [], byCls = {}
  for (const i of gs) for (const j of at) { const a = B[i], b = B[j]; if (a[0] > b[2] || b[0] > a[2] || a[1] > b[3] || b[1] > a[3]) continue
    const P = S[i].points, Q = S[j].points
    for (let k = 0; k + 1 < P.length; k++) for (let l = 0; l + 1 < Q.length; l++) { const x = X(P[k], P[k + 1], Q[l], Q[l + 1]); if (!x) continue
      if ([P[k], P[k + 1], Q[l], Q[l + 1]].some(v => Math.hypot(v.x - x.x, v.z - x.z) < NODE_M)) continue
      n++; const wa = localWay(S[i], x), wb = localWay(S[j], x), key = `${S[i].highway}×${S[j].highway}`; byCls[key] = (byCls[key] || 0) + 1
      let cls; if (!wa || !wb) { noWay++; cls = 'no source way' } else if (lay(wa.tags) !== lay(wb.tags)) { sep++; cls = 'OSM separates' } else { bothAt++; cls = 'OSM same grade' }
      if (ex.length < 6 || cls === 'OSM same grade' && ex.filter(e => e.includes('same grade')).length < 6 || AT && Math.hypot(x.x - AT[0], x.z - AT[1]) < 3) ex.push(`(${x.x.toFixed(1)}, ${x.z.toFixed(1)}) ${S[i].id} [${S[i].highway}${wa ? ` · way ${wa.osmId} layer ${wa.tags.layer ?? 0}${off(wa.tags) && wa.tags.bridge ? ' bridge' : ''}${wa.tags.tunnel && wa.tags.tunnel !== 'no' ? ' tunnel' : ''}` : ''}] × ${S[j].id} [${S[j].highway}${wb ? ` · way ${wb.osmId} layer ${wb.tags.layer ?? 0}${wb.tags.bridge && wb.tags.bridge !== 'no' ? ' bridge' : ''}${wb.tags.tunnel && wb.tags.tunnel !== 'no' ? ' tunnel' : ''}` : ''}]: ${cls}`) } }
  console.log(`GX ${town}: (1) ${gs.length} gradeSeparated chain(s), ${at.length} at grade · crossings with no vertex within ${NODE_M} m: ${n} · OSM separates the two source ways ${sep} · OSM puts both at the same grade ${bothAt} · a chain with no source way found ${noWay}`)
  console.log(`GX   by class pair (gradeSeparated × at grade): ${Object.entries(byCls).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
  for (const e of ex) console.log(`GX     ${e}`)
  // (2)
  let m = 0, mOffLen = 0, mLen = 0; const ex2 = [], byH = {}
  for (const s of S) { if (s.gradeSeparated) continue; const ws = (s.sources || []).map(id => W.get(id)).filter(Boolean); const o = ws.filter(w => off(w.tags)); if (!o.length) continue
    m++; const ol = o.reduce((t, w) => t + len(w.coords), 0), tl = ws.reduce((t, w) => t + len(w.coords), 0); mOffLen += ol; mLen += tl; byH[s.highway] = (byH[s.highway] || 0) + 1
    if (ex2.length < 6) ex2.push(`${s.id} [${s.highway}]: ${o.length} of ${ws.length} source way(s) off grade, ${ol.toFixed(0)} of ${tl.toFixed(0)} m (${o.map(w => `${w.osmId}${w.tags.bridge && w.tags.bridge !== 'no' ? ' bridge' : ''}${w.tags.tunnel && w.tags.tunnel !== 'no' ? ' tunnel' : ''} layer ${w.tags.layer ?? 0}`).slice(0, 3).join(', ')})`) }
  console.log(`GX   (2) chains off grade on some source way but NOT gradeSeparated: ${m} · their off-grade length ${mOffLen.toFixed(0)} m of ${mLen.toFixed(0)} m · by class: ${Object.entries(byH).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
  for (const e of ex2) console.log(`GX     ${e}`)
}
