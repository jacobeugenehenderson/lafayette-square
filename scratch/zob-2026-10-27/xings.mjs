// Zob's census of 2026-10-27 (Boz, for Jacob: "fortify the kit"), kept so it reproduces. Run from the repo root:
//   node scratch/zob-2026-10-27/xings.mjs <town> <clean/skeleton.json> <public/looks/<look>/design.json> <neighborhood_boundary.json> <coast.json|none> <ribbons.json>
// ⛔ Its CROSSINGS line is WITHDRAWN: grade through segmentWays ranges was unverified and disagreed with the check that owns it,
// checks/claims-a-nodeless-crossing-is-grade-separated.mjs (the census used that check unchanged). Its ENDS lines stand.
// census at the skeleton's exit: (1) chain × chain crossings without a shared node, by grade; (2) chain ends that are no node,
// bucketed against other streets' half-widths (seed and every authored value in the home Look's blockCustoms: min and max);
// (3) rim and coast. Read-only, the skeleton artifact as written.
import { readFileSync, existsSync } from 'node:fs'
const W = new URL('../..', import.meta.url).pathname.replace(/\/$/, '')
const { isOffGradeWay } = await import(W + '/src/cartograph/streetClass.js'), BR = await import(W + '/cartograph/boundaryRecords.mjs')
const [town, skelPath, designPath, nbPath, coastPath, ribPath] = process.argv.slice(2)
const RIB = new Map((JSON.parse(readFileSync(ribPath, 'utf8')).streets || []).map(r => [r.skelId, r]))
const S = JSON.parse(readFileSync(skelPath, 'utf8')), D = JSON.parse(readFileSync(designPath, 'utf8')), BC = D.blockCustoms || {}
const P = (p) => Array.isArray(p) ? p : [p.x, p.z]
const ch = S.streets.map(s => ({ id: s.id, pts: s.points.map(P), s }))
// per-segment grade: each point segment k → the ways of the segmentWays run holding it
const segOff = (c, k) => { const sw = (c.s.segmentWays || []).find(r => k >= r.from && k < r.to); if (!sw) return { off: null, layer: null }
  const ts = sw.ways.map(id => c.s.ways?.[id]).filter(Boolean); if (!ts.length) return { off: null, layer: null }
  const off = ts.some(t => isOffGradeWay(t)), layer = ts.reduce((m, t) => { const L = parseInt(t.layer ?? 0, 10) || 0; return Math.abs(L) > Math.abs(m) ? L : m }, 0)
  const kind = ts.some(t => t.tunnel && t.tunnel !== 'no') ? 'tunnel' : ts.some(t => t.bridge && t.bridge !== 'no') ? 'bridge' : off ? 'layer' : 'grade'
  return { off, layer, kind } }
const partOff = (c) => { const n = c.pts.length - 1; let a = 0, b = 0; for (let k = 0; k < n; k++) { const g = segOff(c, k); if (g.off === true) a++; else if (g.off === false) b++ } return a > 0 && b > 0 }
// half-widths: seed, and every authored pavementHW for that skelId (both sides, every block)
const noHW = []
const hw = new Map(ch.map(c => { const m = RIB.get(c.id)?.measure, base = m ? Math.min(m.left?.pavementHW, m.right?.pavementHW) : NaN; if (!Number.isFinite(base)) noHW.push(c.id); const vals = m ? [m.left?.pavementHW, m.right?.pavementHW] : []
  for (const side of ['left', 'right']) for (const b of Object.values(BC[c.id]?.[side] || {})) if (Number.isFinite(b?.pavementHW)) vals.push(b.pavementHW)
  const v = vals.filter(Number.isFinite); return [c.id, { base, min: v.length ? Math.min(...v) : NaN, max: v.length ? Math.max(...v) : NaN }] }))
console.log(`   (${noHW.length} chain(s) with no half-width in ribbons.json: ${noHW.slice(0, 5).join(' · ')})`)
const K = (p) => Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000)
const vertexOwners = new Map(); ch.forEach((c, ci) => c.pts.forEach(p => { const k = K(p); (vertexOwners.get(k) || vertexOwners.set(k, new Set()).get(k)).add(ci) }))
// grid of segments
const G = 50, grid = new Map(), segs = []
ch.forEach((c, ci) => { for (let k = 0; k + 1 < c.pts.length; k++) { const a = c.pts[k], b = c.pts[k + 1], e = segs.push({ ci, k, a, b }) - 1
  for (let gx = Math.floor(Math.min(a[0], b[0]) / G); gx <= Math.floor(Math.max(a[0], b[0]) / G); gx++) for (let gz = Math.floor(Math.min(a[1], b[1]) / G); gz <= Math.floor(Math.max(a[1], b[1]) / G); gz++) { const key = gx + ',' + gz; (grid.get(key) || grid.set(key, []).get(key)).push(e) } } })
const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
const xs = [], seen = new Set()
for (const cell of grid.values()) for (let i = 0; i < cell.length; i++) for (let j = i + 1; j < cell.length; j++) { const A = segs[cell[i]], B = segs[cell[j]]; if (A.ci === B.ci) continue
  const key = cell[i] < cell[j] ? cell[i] + ':' + cell[j] : cell[j] + ':' + cell[i]; if (seen.has(key)) continue; seen.add(key)
  const d1 = cr(B.a, B.b, A.a), d2 = cr(B.a, B.b, A.b), d3 = cr(A.a, A.b, B.a), d4 = cr(A.a, A.b, B.b)
  if (!((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) || !((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) continue   // proper interior crossing only
  const t = d1 / (d1 - d2), at = [A.a[0] + (A.b[0] - A.a[0]) * t, A.a[1] + (A.b[1] - A.a[1]) * t]
  const gA = segOff(ch[A.ci], A.k), gB = segOff(ch[B.ci], B.k)
  xs.push({ a: ch[A.ci].id, b: ch[B.ci].id, at, gA, gB, partA: partOff(ch[A.ci]), partB: partOff(ch[B.ci]) }) }
const atGrade = xs.filter(x => x.gA.off === false && x.gB.off === false), sep = xs.filter(x => x.gA.off === true || x.gB.off === true), unk = xs.filter(x => x.gA.off === null || x.gB.off === null)
const sameLayerOff = sep.filter(x => x.gA.off === true && x.gB.off === true && x.gA.layer === x.gB.layer)
const kinds = {}; for (const x of sep) { const k = [x.gA.kind, x.gB.kind].sort().join('×'); kinds[k] = (kinds[k] || 0) + 1 }
const partAtGrade = atGrade.filter(x => x.partA || x.partB), partSep = sep.filter(x => (x.partA && x.gA.off) || (x.partB && x.gB.off))
console.log(`${town}: ${ch.length} chains · CROSSINGS without a shared vertex: ${xs.length} — at grade both: ${atGrade.length}${atGrade.length ? ` (e.g. ${atGrade.slice(0, 4).map(x => `${x.a}×${x.b}@(${x.at.map(v => v.toFixed(1)).join(',')})`).join(' · ')})` : ''} · grade-separated: ${sep.length} ${JSON.stringify(kinds)}${sameLayerOff.length ? ` (both off grade at the SAME layer: ${sameLayerOff.length})` : ''} · grade unknown: ${unk.length}`)
console.log(`   part-off-grade chains: crossing on their AT-GRADE part ${partAtGrade.length}${partAtGrade.length ? ` (${partAtGrade.slice(0, 3).map(x => `${x.a}×${x.b}`).join(' · ')})` : ''} · on their off-grade part ${partSep.length}`)
// ends
let disc = null; try { disc = BR.discOf(BR.splitBoundary(JSON.parse(readFileSync(nbPath, 'utf8')), town).disc, town) } catch (e) { console.log('   (no disc: ' + e.message.slice(0, 80) + ')') }
const coast = coastPath && existsSync(coastPath) ? JSON.parse(readFileSync(coastPath, 'utf8')).water.flatMap(b => [b.outer, ...b.holes]) : []
const segd = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
const ringD = (p, r) => { let m = Infinity; for (let i = 0; i < r.length; i++) m = Math.min(m, segd(p, r[i], r[(i + 1) % r.length])); return m }
const bk = { a: [], aAmb: [], b: [], c: [], loop: [] }
ch.forEach((c, ci) => [0, c.pts.length - 1].forEach(ix => { const p = c.pts[ix], own = vertexOwners.get(K(p)); if (own && own.size > 1) return   // a node: another chain has this vertex
  if (ix === 0 && K(c.pts[0]) === K(c.pts[c.pts.length - 1])) { bk.loop.push(c.id); return }
  if (ix > 0 && K(c.pts[0]) === K(p)) return
  const myHW = Number.isFinite(hw.get(c.id).base) ? hw.get(c.id).base : 0
  if ((disc && Math.abs(disc.dist(p[0], p[1]) - disc.R) <= myHW) || (disc && ringD(p, disc.ring) <= myHW) || (coast.length && coast.some(r => ringD(p, r) <= myHW))) { bk.c.push({ id: c.id, p }); return }
  let best = null
  for (let gx = Math.floor((p[0] - 60) / G); gx <= Math.floor((p[0] + 60) / G); gx++) for (let gz = Math.floor((p[1] - 60) / G); gz <= Math.floor((p[1] + 60) / G); gz++) for (const e of grid.get(gx + ',' + gz) || []) { const s = segs[e]; if (s.ci === ci) continue
    const d = segd(p, s.a, s.b), h = hw.get(ch[s.ci].id); if (!Number.isFinite(h.min)) continue; if (!best || d - h.min < best.d - best.h.min) best = { d, h, id: ch[s.ci].id } }
  if (best && best.d <= best.h.min) bk.a.push({ id: c.id, into: best.id, d: best.d, hw: best.h, p })
  else if (best && best.d <= best.h.max) bk.aAmb.push({ id: c.id, into: best.id, d: best.d, hw: best.h, p })
  else bk.b.push({ id: c.id, p, gap: best ? best.d - best.h.min : Infinity, into: best?.id, own: myHW }) }))
const f = (v) => v.toFixed(2)
console.log(`   ENDS that are no node: ${bk.a.length + bk.aAmb.length + bk.b.length + bk.c.length} — (a) inside another roadway ${bk.a.length}${bk.aAmb.length ? ` + ${bk.aAmb.length} only under an AUTHORED width` : ''} · (b) outside every roadway ${bk.b.length} · (c) rim/coast ${bk.c.length} · self-loops (ends one point, no other chain) ${bk.loop.length}`)
if (bk.a.length) { const ds = bk.a.map(x => x.d).sort((a, b) => a - b); console.log(`   (a) distance to that street's centreline: min ${f(ds[0])} · median ${f(ds[ds.length >> 1])} · max ${f(ds[ds.length - 1])} m; as a share of its half-width: max ${f(Math.max(...bk.a.map(x => x.d / x.hw.min)))} · e.g. ${bk.a.slice(0, 4).map(x => `${x.id}→${x.into} ${f(x.d)}/${f(x.hw.min)} m`).join(' · ')}`) }
for (const x of bk.aAmb) console.log(`   (a?) ${x.id}→${x.into} ${f(x.d)} m, inside only if authored (hw ${f(x.hw.min)}…${f(x.hw.max)})`)
const reach = bk.b.filter(x => x.gap <= x.own)
console.log(`   (b′) of (b), its OWN roadway reaches the other's (gap ≤ its own half-width): ${reach.length}${reach.length ? ' · ' + reach.slice(0, 5).map(x => `${x.id}→${x.into} ${f(x.gap)}≤${f(x.own)}`).join(' · ') : ''}`)
const bs = bk.b.filter(x => Number.isFinite(x.gap)).sort((a, b) => a.gap - b.gap)
console.log(`   (b) nearest-roadway gap, closest: ${bs.slice(0, 6).map(x => `${x.id}→${x.into} ${f(x.gap)} m`).join(' · ') || '—'}${bk.b.length - bs.length ? ` · ${bk.b.length - bs.length} with no street within 60 m` : ''}`)
