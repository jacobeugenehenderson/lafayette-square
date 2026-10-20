// census.mjs <scene> — READ-ONLY sidewalk / crossing / kerb census of one town's raw OSM + poured skeleton, plus a
// count-based re-read of Loess's corner-style run (scratch/ground-budget/corner-style/out/<scene>.json, 37c3201b).
// Writes scratch/sidewalk-evidence/out/<scene>.json only. Every proximity association here is CENSUS-ONLY, labelled.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { ROAD, buildCurbCutEvidence, buildCrosswalkEvidence } from '../../cartograph/curb-cut-evidence.mjs'
const scene = process.argv[2]; if (!scene) throw new Error('census.mjs <scene>')
const D = `cartograph/data/${scene}`
const B = JSON.parse(readFileSync(`${D}/neighborhood_boundary.json`, 'utf8'))
const [cx, cz] = B.center, R = B.radius; if (!Number.isFinite(R)) throw new Error(`${scene}: boundary has no radius`)
const inDisc = (x, z) => Math.hypot(x - cx, z - cz) <= R
const osm = JSON.parse(readFileSync(`${D}/raw/osm.json`, 'utf8'))
const ways = osm.ground.highway
const lenIn = (C) => { let L = 0; for (let i = 0; i + 1 < C.length; i++) { const a = C[i], b = C[i + 1]
  if (inDisc((a.x + b.x) / 2, (a.z + b.z) / 2)) L += Math.hypot(b.x - a.x, b.z - a.z) } return L }
const anyIn = (C) => C.some(c => inDisc(c.x, c.z))
const inc = (o, k, v = 1) => { o[k] = (o[k] || 0) + v }
const out = { scene, disc: { center: B.center, radius: R } }

// ── Q1 coverage + way tags
const q1 = { roadLen: 0, roadLenNonService: 0, roadWays: 0, roadWaysNonService: 0, sidewalkLen: 0, sidewalkWays: 0,
  sidewalkTag: {}, sidewalkSubTag: {}, roadWaysWithAnySidewalkTag: 0, roadWaysNonServiceWithAnySidewalkTag: 0, lenNonServiceWithSidewalkTag: 0,
  roadKerbTags: {}, footwayKerbTags: {}, footwayValues: {}, skelLen: 0, skelLenNonService: 0 }
for (const w of ways) { const t = w.tags || {}; if (!anyIn(w.coords)) continue
  if (t.highway === 'footway') inc(q1.footwayValues, t.footway ?? '(none)')
  if (t.footway === 'sidewalk') { q1.sidewalkWays++; q1.sidewalkLen += lenIn(w.coords) }
  const kk = Object.keys(t).filter(k => k === 'kerb' || k.startsWith('kerb:'))
  if (ROAD.has(t.highway)) { const L = lenIn(w.coords), ns = t.highway !== 'service'
    q1.roadWays++; q1.roadLen += L; if (ns) { q1.roadWaysNonService++; q1.roadLenNonService += L }
    const sk = Object.keys(t).filter(k => k === 'sidewalk' || k.startsWith('sidewalk:'))
    if (t.sidewalk != null) inc(q1.sidewalkTag, `${ns ? '' : 'service:'}${t.sidewalk}`)
    for (const k of sk) if (k !== 'sidewalk') inc(q1.sidewalkSubTag, `${k}=${t[k]}`)
    if (sk.length) { q1.roadWaysWithAnySidewalkTag++; if (ns) { q1.roadWaysNonServiceWithAnySidewalkTag++; q1.lenNonServiceWithSidewalkTag += L } }
    for (const k of kk) inc(q1.roadKerbTags, `${k}=${t[k]}`) }
  else if (t.highway === 'footway' || t.highway === 'path') for (const k of kk) inc(q1.footwayKerbTags, `${t.footway ?? t.highway}:${k}=${t[k]}`) }
const skel = JSON.parse(readFileSync(`${D}/clean/skeleton.json`, 'utf8')).streets
const sLen = (P) => { let L = 0; for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1]; if (inDisc((a.x + b.x) / 2, (a.z + b.z) / 2)) L += Math.hypot(b.x - a.x, b.z - a.z) } return L }
for (const s of skel) { if (!ROAD.has(s.highway)) continue; const L = sLen(s.points); q1.skelLen += L; if (s.highway !== 'service') q1.skelLenNonService += L }
out.q1 = q1

// ── Q2 crossings + kerb nodes
const q2 = { crossingWays: 0, crossingWayTag: {}, crossingMarkings: {}, crossingNodes: Array.isArray(osm.pois) ? 0 : 'NOT IN osm.json (no pois key)',
  crossingNodeTag: {}, crossingNodeKerb: {}, kerbFile: existsSync(`${D}/raw/osm_kerbs.json`), kerbNodes: 0, kerbKind: {}, kerbNodeIsCrossingNode: 0 }
for (const w of ways) { const t = w.tags || {}; if (t.footway !== 'crossing' || !anyIn(w.coords)) continue
  q2.crossingWays++; inc(q2.crossingWayTag, t.crossing ?? '(none)'); inc(q2.crossingMarkings, t['crossing:markings'] ?? '(none)') }
if (Array.isArray(osm.pois)) for (const p of osm.pois) { if (p.tags?.highway !== 'crossing') continue; const c = p.coords[0]; if (!inDisc(c.x, c.z)) continue
  q2.crossingNodes++; inc(q2.crossingNodeTag, p.tags.crossing ?? '(none)'); inc(q2.crossingNodeKerb, p.tags.kerb ?? '(none)') }
if (q2.kerbFile) { const K = JSON.parse(readFileSync(`${D}/raw/osm_kerbs.json`, 'utf8'))
  for (const n of K.nodes) { if (!inDisc(n.x, n.z)) continue; q2.kerbNodes++; inc(q2.kerbKind, n.tags?.kerb ?? 'unspecified'); if (n.tags?.highway === 'crossing') q2.kerbNodeIsCrossingNode++ } }
// the kit's own identity binding (whole fetch bbox, not the disc) — the census derive.js prints as [curb cuts] / [crosswalks]
const E = buildCurbCutEvidence({ osmPath: `${D}/raw/osm.json`, kerbsPath: `${D}/raw/osm_kerbs.json`, skeletonPath: `${D}/clean/skeleton.json` })
const X = buildCrosswalkEvidence({ osmPath: `${D}/raw/osm.json`, skeletonPath: `${D}/clean/skeleton.json` })
q2.kitKerbCensus = E.census; q2.kitCrosswalkCensus = X.census
out.q2 = q2

// ── Q3 count-based re-read of Loess's per-corner rows (no new landing)
const L = JSON.parse(readFileSync(`scratch/ground-budget/corner-style/out/${scene}.json`, 'utf8'))
const nodeCrossing = new Map(); for (const r of E.records || []) (nodeCrossing.get(r.osmId) || nodeCrossing.set(r.osmId, new Set()).get(r.osmId)).add(r.crossing)
const q3 = { corners: L.rows.length, tally: L.tally, legEnds: L.legEnds, byCount: {}, kerbXwalkShareCrossing: { both: 0, allKerbOnLandedCrossing: 0 } }
for (const r of L.rows) {
  const ids = new Set(r.xwalkEnds.map(e => e.osmId)), n = ids.size
  const perp = r.xwalkEnds.filter(e => e.imp === 'perpendicular'), mid = r.xwalkEnds.filter(e => e.imp === 'diagonal')
  const pIds = new Set(perp.map(e => e.osmId)), mIds = new Set(mid.map(e => e.osmId))
  const k = n === 0 ? '0 crossings' : n === 1 && mIds.size === 1 && !pIds.size ? '1 crossing, mid-arc (apex)'
    : n === 1 && pIds.size === 1 && !mIds.size ? '1 crossing, outer/tangent (one leg)'
    : n >= 2 && !mIds.size ? `${n >= 3 ? '3+' : '2'} crossings, all outer/tangent` : n >= 2 && !pIds.size ? '2+ crossings, all mid-arc' : '2+ crossings, mixed'
  inc(q3.byCount, k)
  if (n >= 2 && !mIds.size) { const lo = perp.some(e => e.f != null && e.f < 1 / 3), hi = perp.some(e => e.f != null && e.f > 2 / 3)
    inc(q3.byCount, `  of which: ends on BOTH outer thirds (two legs shown)`, lo && hi ? 1 : 0); if (!(lo && hi)) inc(q3.byCount, `  of which: legs not separable (nearTangent / one third)`) }
  if (r.verdict) { q3.kerbXwalkShareCrossing.both++
    const kc = r.kerbF.filter(x => ['lowered', 'flush', 'no'].includes(x.kind)).map(x => nodeCrossing.get(x.osmId) || new Set())
    if (kc.length && kc.every(s => [...s].some(c => ids.has(c)))) q3.kerbXwalkShareCrossing.allKerbOnLandedCrossing++ } }
out.q3 = q3

// ── Q4 CENSUS-ONLY proximity: per skeleton chain edge ≥ 10 m, per side, the nearest roughly-parallel footway=sidewalk way,
// with skeleton.js#chainSidewalkDistances' own gates (|cos| ≥ 0.85, along within len/2 + 10, perp in (2, 20) m), but kept
// per edge instead of min per chain. gap = d − (that side's poured pavementHW + curb).
const sws = ways.filter(w => w.tags?.footway === 'sidewalk' && w.coords.length >= 2)
const q4 = { edgeSides: 0, withSidewalk: 0, dHist: {}, gapHist: {}, gaps: [], pavementSource: {} }
const DB = [3, 5, 7, 9, 11, 13, 15, 20], GB = [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 6]
const bin = (v, E) => { const i = E.findIndex(e => v < e); return i < 0 ? `≥${E[E.length - 1]}` : i === 0 ? `<${E[0]}` : `${E[i - 1]}–${E[i]}` }
for (const s of skel) { if (!ROAD.has(s.highway) || s.highway === 'service' || s.gradeSeparated) continue
  const P = s.points
  for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1], dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz)
    if (len < 10 || !inDisc((a.x + b.x) / 2, (a.z + b.z) / 2)) continue
    const nx = -dz / len, nz = dx / len, mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2
    let mL = null, mR = null
    for (const sw of sws) { const sc = sw.coords, sdx = sc[sc.length - 1].x - sc[0].x, sdz = sc[sc.length - 1].z - sc[0].z, sl = Math.hypot(sdx, sdz)
      if (sl < 3 || Math.abs(dx * sdx + dz * sdz) / (len * sl) < 0.85) continue
      const smx = (sc[0].x + sc[sc.length - 1].x) / 2, smz = (sc[0].z + sc[sc.length - 1].z) / 2
      if (Math.abs(((smx - mx) * dx + (smz - mz) * dz) / len) > len / 2 + 10) continue
      const perp = (smx - mx) * nx + (smz - mz) * nz, d = Math.abs(perp); if (d <= 2 || d >= 20) continue
      if (perp > 0) { if (mR == null || d < mR) mR = d } else if (mL == null || d < mL) mL = d }
    for (const [side, d] of [['left', mL], ['right', mR]]) { q4.edgeSides++; if (d == null) continue; q4.withSidewalk++
      const sd = s.seed?.[side], hw = sd?.pavementHW ?? s.seed?.pavementHW, curb = s.seed?.curb ?? 0
      inc(q4.pavementSource, sd?.source ?? (s.seed ? 'class seed' : 'none'))
      inc(q4.dHist, bin(d, DB)); if (Number.isFinite(hw)) { const g = d - hw - curb; q4.gaps.push(+g.toFixed(2)); inc(q4.gapHist, bin(g, GB)) } } } }
const g = [...q4.gaps].sort((x, y) => x - y), q = (p) => g.length ? g[Math.min(g.length - 1, Math.floor(p * g.length))] : null
q4.gapQuartiles = [q(0.25), q(0.5), q(0.75)]; delete q4.gaps
out.q4 = q4
mkdirSync('scratch/sidewalk-evidence/out', { recursive: true })
writeFileSync(`scratch/sidewalk-evidence/out/${scene}.json`, JSON.stringify(out, null, 1))
console.log(JSON.stringify(out))
