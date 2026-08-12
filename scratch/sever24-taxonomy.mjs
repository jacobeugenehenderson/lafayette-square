#!/usr/bin/env node
/**
 * READ-ONLY. Taxonomy of the SEVERED-and-NOT-RETRACING tiles.
 *
 * Re-derives the severed set from shape.json (predicate 1 of
 * claims-band-is-one-ring.mjs ONLY — SLIT/FLAP are declared UNVALIDATED there and
 * are not touched) and the retrace set from ribbons.json, joined on the RING
 * (rotation/direction-independent vertex multiset hash). Every finding below is
 * keyed to that hash, never to a tile index and never to a count.
 *
 * For each severed tile it LOCATES the breaks by asking the POLYGON:
 *   walk the frozen curb ring `iA`, probe inward across the band depth, and
 *   report the contiguous arcs where NOTHING is painted. For each such arc:
 *     · which of the tile's OWN runs owns it (nearest run.poly — tile-local arc
 *       identity, `skelId·side·segOrd`; ⛔ never a nearest-chain query into
 *       ribbons.streets)
 *     · whether the unpainted arc is instead covered by luByLu (the released
 *       band → land use MISLABEL, not a hole)
 *     · whether the owning run is a NO-PED run (`edgeDepth(baseMeasure)<=0` —
 *       rim / median face: owns its arc at zero depth BY CONSTRUCTION)
 *     · whether the owner carries an authored blockCustoms override
 *     · whether the arc sits at a run-end junction (corner) or mid-leg
 *     · the tile's thin-feature headroom (`st.cap` vs WB = cw+tl+sw) — G12
 *
 * Runs WITH the scene's authored blockCustoms (CLAUDE.md Layer 0 rule 1).
 *
 * Usage: node scratch/sever24-taxonomy.mjs [--scene <name>] [--all] [--gaps]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import clipperLib from 'clipper-lib'
import { sectionPassTile, resolvePedDepths } from '../src/lib/tileGround.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const arg = f => process.argv.includes(f)
const argScene = arg('--scene') ? process.argv[process.argv.indexOf('--scene') + 1] : 'lafayette-square'

const ribbons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ribbons.json'), 'utf8'))
const shapeP = path.join(ROOT, 'public/baked', argScene, 'shape.json')
const shape = (j => Array.isArray(j) ? j : j.tiles)(JSON.parse(fs.readFileSync(shapeP, 'utf8')))
const designP = path.join(ROOT, 'public/looks', argScene, 'design.json')
const bc = fs.existsSync(designP) ? (JSON.parse(fs.readFileSync(designP, 'utf8')).blockCustoms || null) : null
const CW = 0.381, STRIPMAT = { outer: 'LU', inner: 'SW' }

console.log(`SEVER TAXONOMY — ${argScene}`)
console.log(`  shape.json   ${shape.length} tiles  sha256 ${crypto.createHash('sha256').update(fs.readFileSync(shapeP)).digest('hex').slice(0, 16)}`)
console.log(`  ribbons.json ${ribbons.tiles.length} tiles  sha256 ${crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'src/data/ribbons.json'))).digest('hex').slice(0, 16)}`)
console.log(`  blockCustoms ${bc ? Object.keys(bc).length + ' streets LOADED' : '⛔ NONE'}`)
console.log(`  sectionPassTile(cw=${CW}, ${JSON.stringify(STRIPMAT)}) — same parameterisation as claims-band-is-one-ring.mjs\n`)

// ---------- identity
const Q = 1e4
const vkey = p => `${Math.round(p[0] * Q)},${Math.round(p[1] * Q)}`
const ringKey = ring => {
  const vs = ring.map(vkey); if (vs.length > 1 && vs[0] === vs[vs.length - 1]) vs.pop()
  return crypto.createHash('sha1').update([...vs].sort().join('|')).digest('hex').slice(0, 10)
}
const sKey = shape.map(t => ringKey(t.ring))
const rIndex = new Map(); ribbons.tiles.forEach((t, i) => rIndex.set(ringKey(t.ring), i))
if (new Set(sKey).size !== shape.length || sKey.some(k => !rIndex.has(k))) {
  console.log('⛔ JOIN NOT 1:1/TOTAL — stopping.'); process.exit(2)
}

// ---------- retrace (ribbons.json)
const retraceN = ring => {
  const m = ring.length, seen = new Set(); let n = 0
  for (let i = 0; i < m; i++) {
    const a = vkey(ring[i]), b = vkey(ring[(i + 1) % m])
    if (seen.has(`${b}>${a}`)) n++
    seen.add(`${a}>${b}`)
  }
  return n
}
const retraceByKey = new Map()
ribbons.tiles.forEach(t => retraceByKey.set(ringKey(t.ring), retraceN(t.ring)))

// ---------- geometry helpers
const SC = 1e5
const { Clipper, ClipType, PolyType, PolyFillType } = clipperLib
const unionAll = rings => {
  const c = new Clipper(); let n = 0
  for (const r of rings) if (r && r.length >= 3) { c.AddPath(r.map(p => ({ X: Math.round(p[0] * SC), Y: Math.round(p[1] * SC) })), PolyType.ptSubject, true); n++ }
  if (!n) return []
  const out = []; c.Execute(ClipType.ctUnion, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  return out.map(p => p.map(q => [q.X / SC, q.Y / SC]))
}
const area = r => { let a = 0; for (let i = 0; i < r.length; i++) { const j = (i + 1) % r.length; a += r[i][0] * r[j][1] - r[j][0] * r[i][1] } return a / 2 }
// even-odd over ALL rings of a union result (outers + holes) — correct inside test
const inRings = (rings, p) => {
  let c = false
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      if ((r[i][1] > p[1]) !== (r[j][1] > p[1]) &&
          p[0] < (r[j][0] - r[i][0]) * (p[1] - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c
    }
  }
  return c
}
const d2seg = (p, a, b) => {
  const vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy
  let t = L ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy))
}
const d2poly = (p, poly) => { let m = Infinity; for (let i = 0; i + 1 < poly.length; i++) m = Math.min(m, d2seg(p, poly[i], poly[i + 1])); return m }

// ---------- edgeDepth is not exported; reproduce it EXACTLY (tileGround.js:1135):
//   const a = Math.max(0, Number.isFinite(m?.pavementHW) ? m.pavementHW : 0)
//   if (level === 'A' || a <= 0) return a
// ⭐ So an ABSENT baseMeasure resolves to 0 — NOT to "unknown". A run with no
// baseMeasure IS a noPed run: it owns its arc at ZERO ped depth by construction
// (tileGround.js:1616-1633 + its comment: the rim "is not missing, it just owes
// no sidewalk of its own"). On LS every such run also has skelId === null.
const basePHW = run => { const v = run.baseMeasure?.[run.side]?.pavementHW; return Number.isFinite(v) ? Math.max(0, v) : 0 }
const isNoPed = run => basePHW(run) <= 1e-6
const custOf = run => bc?.[run.skelId]?.[run.side]?.[run.segOrd] || null

// ---------- per-tile
const rows = []
for (const [ti, st] of shape.entries()) {
  let out
  try { out = sectionPassTile(st, CW, STRIPMAT, bc) } catch (e) { rows.push({ ti, key: sKey[ti], cls: 'THREW', msg: e.message }); continue }
  const band = unionAll([...(out.Wacc || []), ...Object.values(out.tlByLu || {}).flat()])
  const lu = unionAll(Object.values(out.luByLu || {}).flat())
  const comps = band.filter(r => r.length >= 3 && area(r) > 0.05)
  const rec = { ti, key: sKey[ti], compRings: comps, retrace: retraceByKey.get(sKey[ti]), comps: comps.length, compAreas: comps.map(r => Math.abs(area(r))), gaps: [], st }
  if (!comps.length) { rec.cls = 'NOBAND'; rows.push(rec); continue }
  rec.cls = comps.length > 1 ? 'SEVERED' : 'ONERING'
  if (rec.cls !== 'SEVERED') { rows.push(rec); continue }

  // ---- LOCATE. Walk iA (frozen curb ring), probe inward across the band depth.
  const iA = (st.iA || []).filter(r => r && r.length >= 3)
  const WB = CW + (st.tl || 0) + (st.sw || 0)
  const samples = []
  for (const [ri, ring] of iA.entries()) {
    const sgn = area(ring) > 0 ? 1 : -1          // inward normal side
    const m = ring.length
    for (let i = 0; i < m; i++) {
      const a = ring[i], b = ring[(i + 1) % m]
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-9) continue
      const nx = -sgn * (b[1] - a[1]) / L, ny = sgn * (b[0] - a[0]) / L
      const steps = Math.max(1, Math.ceil(L / 0.5))
      for (let s = 0; s < steps; s++) {
        const t = (s + 0.5) / steps
        const px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t
        // probe across the ped band only (past the curb, short of the inner edge)
        let painted = false, green = false
        for (let d = CW + 0.15; d <= WB - 0.05; d += 0.25) {
          const q = [px + nx * d, py + ny * d]
          if (inRings(band, q)) { painted = true; break }
          if (inRings(lu, q)) green = true
        }
        samples.push({ p: [px, py], painted, green, vtx: i, ring: ri, len: L / steps })
      }
    }
  }
  // contiguous unpainted arcs (per iA ring, cyclically)
  for (const ri of [...new Set(samples.map(s => s.ring))]) {
    const ss = samples.filter(s => s.ring === ri)
    const n = ss.length; if (!n) continue
    if (ss.every(s => !s.painted)) { rec.gaps.push({ ring: ri, whole: true, len: ss.reduce((a, s) => a + s.len, 0), mid: ss[Math.floor(n / 2)].p, green: ss.filter(s => s.green).length / n }); continue }
    let start = 0; while (start < n && !ss[start].painted) start++
    let i = start, run = null
    for (let c = 0; c < n; c++) {
      const s = ss[(start + c) % n]
      if (!s.painted) { if (!run) run = []; run.push(s) }
      else if (run) { rec.gaps.push({ ring: ri, len: run.reduce((a, x) => a + x.len, 0), mid: run[Math.floor(run.length / 2)].p, green: run.filter(x => x.green).length / run.length }); run = null }
    }
    if (run) rec.gaps.push({ ring: ri, len: run.reduce((a, x) => a + x.len, 0), mid: run[Math.floor(run.length / 2)].p, green: run.filter(x => x.green).length / run.length })
  }
  // ---- attribute each gap to one of the TILE'S OWN runs (nearest run.poly)
  const ends = []
  for (const r of (st.runs || [])) { ends.push(r.poly[0], r.poly[r.poly.length - 1]) }
  for (const g of rec.gaps) {
    let best = null, bd = Infinity
    for (const r of (st.runs || [])) { const d = d2poly(g.mid, r.poly); if (d < bd) { bd = d; best = r } }
    g.owner = best ? { skelId: best.skelId, side: best.side, segOrd: best.segOrd } : null
    g.ownerDist = bd
    g.phw = best ? basePHW(best) : null
    g.noPed = best ? isNoPed(best) : null
    const c = best ? custOf(best) : null
    g.cust = c ? JSON.stringify(c) : null
    g.pedRes = best ? resolvePedDepths(best.baseMeasure, best.side, c) : null
    g.dEnd = ends.length ? Math.min(...ends.map(e => Math.hypot(e[0] - g.mid[0], e[1] - g.mid[1]))) : Infinity
  }
  // ---- THE JOINTS. The break is BETWEEN components — locate it directly, so a
  // break the curb walk cannot see (interior pinch, joint off the curb) is still
  // found. MST over components by closest approach: k components ⇒ k-1 breaks.
  const dense = ring => { const o = []
    for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 0.4))
      for (let s = 0; s < n; s++) o.push([a[0] + (b[0] - a[0]) * s / n, a[1] + (b[1] - a[1]) * s / n]) }
    return o }
  const pts = comps.map(dense)
  const near = (i, j) => { let bd = Infinity, bm = null
    for (const p of pts[i]) for (const q of pts[j]) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; bm = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] } }
    return { d: bd, mid: bm } }
  // EXACT min distance between two simple rings: attained at a vertex-segment pair.
  const exactD = (P, Q) => { let m = Infinity
    const one = (A, B) => { for (const p of A) for (let i = 0; i < B.length; i++) m = Math.min(m, d2seg(p, B[i], B[(i + 1) % B.length])) }
    one(P, Q); one(Q, P); return m }
  const inTree = new Set([0]); rec.joints = []
  while (inTree.size < comps.length) {
    let best = null
    for (const i of inTree) for (let j = 0; j < comps.length; j++) { if (inTree.has(j)) continue
      const r = near(i, j); if (!best || r.d < best.d) best = { ...r, i, j } }
    inTree.add(best.j); rec.joints.push(best)
  }
  for (const jt of rec.joints) {
    // ⭐ CONTACT ANATOMY. A 0.000 m "gap" means the two components ABUT. Three very
    // different things look like that, and they are not the same finding:
    //   · a single PINCH POINT  (contact extent ~0)      — band width goes to zero
    //   · a shared BORDER       (contact extent > 0)     — clipper did not merge
    //   · genuine OVERLAP       (intersection area > 0)  — instrument failure
    const A = pts[jt.i], B = pts[jt.j]
    const touch = []
    for (const p of A) for (const q of B) if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.02) touch.push(p)
    // ⛔ A max-pairwise "extent" over the touch set conflates TWO distant touch
    // points with ONE long shared border. Cluster them (1 m single linkage): a
    // ring that splits into two arcs touches at TWO clusters (both arc ends);
    // a genuinely un-merged shared border is ONE cluster that is LONG.
    const clus = []
    for (const p of touch) {
      let hit = null
      for (const c of clus) if (c.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1.0)) { hit = c; break }
      if (hit) hit.push(p); else clus.push([p])
    }
    let merged = true
    while (merged) { merged = false
      outer: for (let i = 0; i < clus.length; i++) for (let j = i + 1; j < clus.length; j++)
        if (clus[i].some(p => clus[j].some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1.0))) { clus[i].push(...clus[j]); clus.splice(j, 1); merged = true; break outer }
    }
    const span = c => { let m = 0; for (const p of c) for (const q of c) m = Math.max(m, Math.hypot(p[0] - q[0], p[1] - q[1])); return m }
    jt.contactPts = touch.length
    jt.clusters = clus.map(c => ({ n: c.length, span: span(c), at: c[Math.floor(c.length / 2)] }))
    jt.contactExtent = jt.clusters.length ? Math.max(...jt.clusters.map(c => c.span)) : 0
    const inter = (() => { const c = new Clipper()
      c.AddPath(comps[jt.i].map(p => ({ X: Math.round(p[0] * SC), Y: Math.round(p[1] * SC) })), PolyType.ptSubject, true)
      c.AddPath(comps[jt.j].map(p => ({ X: Math.round(p[0] * SC), Y: Math.round(p[1] * SC) })), PolyType.ptClip, true)
      const o = []; c.Execute(ClipType.ctIntersection, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
      return o.reduce((s, r) => s + Math.abs(area(r.map(q => [q.X / SC, q.Y / SC]))), 0) })()
    jt.overlapArea = inter
    jt.dExact = exactD(comps[jt.i], comps[jt.j])   // metres; the number that decides touch vs hairline crack
    // distance from the joint to the frozen curb — is the pinch AT the curb, at
    // the band's inner edge, or in the middle of the band?
    jt.dCurb = Math.min(...(st.iA || []).map(r => { let m = Infinity
      for (let i = 0; i < r.length; i++) m = Math.min(m, d2seg(jt.mid, r[i], r[(i + 1) % r.length])); return m }))
    let bo = null, bd = Infinity
    for (const r of (st.runs || [])) { const d = d2poly(jt.mid, r.poly); if (d < bd) { bd = d; bo = r } }
    jt.owner = bo ? `${bo.skelId}|${bo.side}|${bo.segOrd}` : '—'
    jt.noPed = bo ? isNoPed(bo) : null
    jt.ownerDist = bd
    jt.cust = bo ? custOf(bo) : null
    jt.dEnd = ends.length ? Math.min(...ends.map(e => Math.hypot(e[0] - jt.mid[0], e[1] - jt.mid[1]))) : Infinity
    // is the joint bridged by land use? (released band → luRemainder)
    jt.green = inRings(lu, jt.mid)
  }
  // ---- ⭐ THE WALKABILITY MEASUREMENT. "One ring" is a TOPOLOGICAL predicate; the
  // goal is stated MATERIALLY ("a continuous strip around every block"). A union
  // that splits at a zero-width POINT CONTACT reports 2 rings while the material
  // is unbroken. So walk the band's MID-DEPTH line around the curb and report how
  // much of it is actually unpainted, and who owns those stretches.
  {
    const mid = []
    for (const ring of iA) {
      const sgn = area(ring) > 0 ? 1 : -1, m = ring.length
      for (let i = 0; i < m; i++) {
        const a = ring[i], b = ring[(i + 1) % m]
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-9) continue
        const nx = -sgn * (b[1] - a[1]) / L, ny = sgn * (b[0] - a[0]) / L
        const steps = Math.max(1, Math.ceil(L / 0.25))
        for (let s = 0; s < steps; s++) {
          const t = (s + 0.5) / steps
          const px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t
          const d = CW + ((st.tl || 0) + (st.sw || 0)) / 2
          const q = [px + nx * d, py + ny * d]
          let owner = null, od = Infinity
          for (const r of (st.runs || [])) { const dd = d2poly([px, py], r.poly); if (dd < od) { od = dd; owner = r } }
          mid.push({ q, painted: inRings(band, q), green: inRings(lu, q), len: L / steps, noPed: owner ? isNoPed(owner) : false, p: [px, py], owner })
        }
      }
    }
    // ⛔ SELF-CHECK. If the inward normal is wrong anywhere on this ring, the probe
    // point lands OUTSIDE the tile and reads "unpainted" for a reason that is mine,
    // not the map's. Measure it rather than trust it.
    rec.probeOutside = mid.filter(s => !inRings([st.ring], [s.p[0] + (s.q[0] - s.p[0]), s.p[1] + (s.q[1] - s.p[1])])).length
    rec.probeOutsideUnpainted = mid.filter(s => !s.painted && !s.noPed && !inRings([st.ring], s.q)).reduce((a, s) => a + s.len, 0)
    rec.midN = mid.length
    rec.midTotal = mid.reduce((a, s) => a + s.len, 0)
    rec.midUnpaintedNoPed = mid.filter(s => !s.painted && s.noPed).reduce((a, s) => a + s.len, 0)
    rec.midUnpaintedStreet = mid.filter(s => !s.painted && !s.noPed).reduce((a, s) => a + s.len, 0)
    // contiguous unpainted stretches owned by a STREET run (the ones that matter)
    const stretches = []; let cur = null
    for (const s of mid) {
      if (!s.painted && !s.noPed) { if (!cur) cur = { len: 0, p: s.p, owner: s.owner, green: 0, n: 0 }; cur.len += s.len; cur.n++; if (s.green) cur.green++ }
      else if (cur) { stretches.push(cur); cur = null }
    }
    if (cur) stretches.push(cur)
    rec.midStretches = stretches.sort((a, b) => b.len - a.len)
  }
  rec.WB = WB
  rec.cap = st.cap
  rec.noPedRuns = (st.runs || []).filter(isNoPed).length
  rec.nRuns = (st.runs || []).length
  rows.push(rec)
}

// ---------- summary
const by = c => rows.filter(r => r.cls === c)
console.log(`POPULATION  severed ${by('SEVERED').length}  one-ring ${by('ONERING').length}  no-band ${by('NOBAND').length}  threw ${by('THREW').length}`)
const target = by('SEVERED').filter(r => arg('--retrace') ? r.retrace : !r.retrace)
console.log(`TARGET SET — SEVERED × ${arg('--retrace') ? 'RETRACE' : 'NO RETRACE'}: ${target.length}\n`)

// ---- classify each BREAK (joint), then the tile by its breaks.
const jCls = (r, jt) => {
  if (jt.overlapArea > 0.01) return 'X · OVERLAPPING components — ⛔ INSTRUMENT FAILURE (union did not merge)'
  if (jt.dExact <= 1e-6) return 'P · PINCH — exact zero-width contact (pieces TOUCH; no hole exists)'
  if (jt.dExact < 0.05) return `H · HAIRLINE CRACK (${(jt.dExact * 1000).toFixed(1)} mm) — sub-visible gap; the eye sees one band`
  if (jt.noPed && jt.ownerDist < 3) return 'A · NO-PED ARC (rim / no-asphalt edge — zero ped BY CONSTRUCTION)'
  if (Number.isFinite(r.cap) && r.cap < r.WB - 1e-6) return 'C · THIN (frozen cap < WB) — G12'
  if (jt.green) return 'B · RELEASED → luRemainder (gap is painted GREEN)'
  if (jt.dEnd < 6) return 'D · AT A RUN-END JUNCTION (corner)'
  return 'E · MID-LEG, unexplained'
}
const tileCls = r => {
  const cs = [...new Set(r.joints.map(j => jCls(r, j)))].sort()
  return cs.length === 1 ? cs[0] : `MIXED: ${cs.map(c => c[0]).join('+')}`
}
const tally = new Map(), jtally = new Map()
for (const r of target) {
  tally.set(tileCls(r), [...(tally.get(tileCls(r)) || []), r])
  for (const j of r.joints) { const c = jCls(r, j); jtally.set(c, (jtally.get(c) || 0) + 1) }
}
console.log('BREAKS (joints) BY CLASS — every break in the 24, not one per tile')
for (const [c, n] of [...jtally].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${c}`)
console.log('\nTILES BY CLASS')
for (const [c, list] of [...tally].sort((a, b) => b[1].length - a[1].length)) console.log(`  ${String(list.length).padStart(3)}  ${c}`)

console.log(`\nPER TILE (key = ring vertex-multiset sha1/10 — index shown for cross-ref ONLY)`)
for (const r of target.sort((a, b) => tileCls(a).localeCompare(tileCls(b)))) {
  const who = [...new Set((r.st.runs || []).map(x => x.skelId).filter(Boolean))].slice(0, 3).join('/')
  const anyCust = (r.st.runs || []).map(custOf).filter(Boolean)
  console.log(`\n  ${r.key}  [s${r.ti}]  ${tileCls(r)}`)
  console.log(`      comps ${r.comps} areas ${r.compAreas.map(a => a.toFixed(1)).join(',')} | WB ${r.WB.toFixed(2)} cap ${Number.isFinite(r.cap) ? r.cap.toFixed(2) : '—'} | runs ${r.nRuns} (noPed ${r.noPedRuns}) | authored runs ${anyCust.length} | ${who}`)
  console.log(`      PROBE SELF-CHECK: ${r.probeOutsideUnpainted.toFixed(1)}m of the street-unpainted length has its probe point OUTSIDE the tile ring (probe artifact, not a hole)`)
  console.log(`      MID-BAND WALK ${r.midTotal.toFixed(0)}m: unpainted ${r.midUnpaintedStreet.toFixed(1)}m on STREET runs + ${r.midUnpaintedNoPed.toFixed(1)}m on NO-PED runs${r.midStretches.length ? `  ⇒ street stretches: ${r.midStretches.slice(0, 4).map(s => `${s.len.toFixed(1)}m @${s.p[0].toFixed(0)},${s.p[1].toFixed(0)} (${s.owner?.skelId}|${s.owner?.side}|${s.owner?.segOrd})`).join('  ')}` : '  ⇒ NO street stretch unpainted'}`)
  for (const jt of r.joints) {
    console.log(`      BREAK gap ${(jt.dExact * 1000).toFixed(2)}mm @ ${jt.mid[0].toFixed(1)},${jt.mid[1].toFixed(1)}  ${jt.green ? 'GREEN ' : ''}contacts ${jt.clusters.length}× [${jt.clusters.map(c => `${c.span.toFixed(2)}m @${c.at[0].toFixed(0)},${c.at[1].toFixed(0)}`).join(' | ')}] overlap ${jt.overlapArea.toFixed(3)}m²  dCurb ${jt.dCurb.toFixed(2)} dEnd ${jt.dEnd.toFixed(1)}  owner ${jt.owner} (d ${jt.ownerDist.toFixed(2)})${jt.noPed ? ' ⛔NO-PED' : ''}${jt.cust ? `  AUTHORED ${JSON.stringify(jt.cust)}` : ''}`)
    console.log(`            ⇒ ${jCls(r, jt)}`)
  }
  if (arg('--gaps')) for (const g of [...r.gaps].sort((a, b) => b.len - a.len).slice(0, 4))
    console.log(`      curb-arc unpainted ${g.len.toFixed(1)}m @ ${g.mid[0].toFixed(1)},${g.mid[1].toFixed(1)} green ${(g.green * 100).toFixed(0)}% owner ${g.owner ? `${g.owner.skelId}|${g.owner.side}|${g.owner.segOrd}` : '—'}${g.noPed ? ' ⛔NO-PED' : ''}`)
}

// ---------- frozen-field presence (the [THRU-T] / mouth precondition)
console.log(`\nFROZEN FIELDS the FILL reads but the artifact may not carry:`)
for (const f of ['thruNodeEnds', 'mouths', 'iaEdge', 'fillets', 'cap', 'bandJoin']) {
  const n = shape.filter(t => t[f] !== undefined && t[f] !== null && (!Array.isArray(t[f]) || t[f].length)).length
  console.log(`  ${f.padEnd(14)} present+nonempty on ${n} / ${shape.length} tiles`)
}


// ================= FINAL TABLE — the deliverable, keyed by RING HASH =================
// ⭐ The goal is stated MATERIALLY ("a continuous strip around every block"), so the
// verdict axis is the MID-BAND WALK, not the union's ring count. A union splits at a
// zero-width contact; that is a topology event, not a hole the operator can see.
const HOLE = 0.5   // m of unpainted mid-band on a STREET-owned run — below this, nothing to see
console.log(`\n\n${'='.repeat(100)}\nFINAL — SEVERED × NO RETRACE, by ring hash. Verdict axis = unpainted MID-BAND on STREET runs.\n${'='.repeat(100)}`)
console.log(`ringHash    [idx]  streetGap  noPedGap  comps  verdict`)
const mat = [], topo = []
for (const r of target) (r.midUnpaintedStreet > HOLE ? mat : topo).push(r)
for (const r of [...mat].sort((a, b) => b.midUnpaintedStreet - a.midUnpaintedStreet)) {
  const s0 = r.midStretches[0]
  console.log(`${r.key}  [s${String(r.ti).padStart(2)}]  ${r.midUnpaintedStreet.toFixed(1).padStart(7)}m  ${r.midUnpaintedNoPed.toFixed(1).padStart(7)}m  ${String(r.comps).padStart(4)}   MATERIAL HOLE — biggest ${s0.len.toFixed(1)}m on ${s0.owner?.skelId}|${s0.owner?.side}|${s0.owner?.segOrd}, ${(100 * s0.green / s0.n).toFixed(0)}% GREEN, authored ${custOf(s0.owner) ? JSON.stringify(custOf(s0.owner)) : 'no'}`)
}
for (const r of [...topo].sort((a, b) => b.midUnpaintedNoPed - a.midUnpaintedNoPed)) {
  console.log(`${r.key}  [s${String(r.ti).padStart(2)}]  ${r.midUnpaintedStreet.toFixed(1).padStart(7)}m  ${r.midUnpaintedNoPed.toFixed(1).padStart(7)}m  ${String(r.comps).padStart(4)}   TOPOLOGICAL ONLY — no street-owned hole; ${r.midUnpaintedNoPed > 0.5 ? 'band stops at the NO-PED (rim) arc, by construction' : 'band unbroken all the way round'}`)
}
console.log(`\n  ⭐ ARE THE COMPONENTS RADIAL STRIPS OR RING ARCS? For each component, the min/max distance of its`)
console.log(`     vertices from the frozen curb (iA). A component confined to [CW, CW+tl] vs [CW+tl, WB] is a`)
console.log(`     RADIAL strip (treelawn vs sidewalk not fusing). Components each spanning the full depth are`)
console.log(`     RING ARCS (a real break in the walk).`)
for (const r of topo) {
  const iA = (r.st.iA || []).filter(x => x && x.length >= 3)
  const dC = p => Math.min(...iA.map(g => { let m = Infinity; for (let i = 0; i < g.length; i++) m = Math.min(m, d2seg(p, g[i], g[(i + 1) % g.length])); return m }))
  const prof = r.compRings.map(c => { const ds = c.map(dC); return `${Math.min(...ds).toFixed(2)}-${Math.max(...ds).toFixed(2)}` })
  console.log(`     ${r.key} [s${r.ti}] WB ${r.WB.toFixed(2)}  per-component dist-from-curb: ${prof.join('  ')}`)
}
console.log(`\n  ⭐ ZERO-WIDTH CONTACT ANATOMY (TOPOLOGICAL-ONLY set). A contact spanning the band DEPTH is a`)
console.log(`     FULL-DEPTH BUTT JOINT — two abutting claims the union did not fuse; the eye sees nothing.`)
console.log(`     A contact spanning ~0 m is a true POINT PINCH — band width -> 0; the eye sees a notch.`)
for (const r of topo) {
  const depth = r.WB - CW
  const spans = r.joints.flatMap(j => j.clusters.map(c => c.span)).sort((a, b) => b - a)
  const butt = spans.filter(x => Math.abs(x - depth) < 0.15 || Math.abs(x - depth / 2) < 0.15).length
  const pt = spans.filter(x => x < 0.15).length
  console.log(`     ${r.key} [s${r.ti}] depth ${depth.toFixed(2)}  contacts ${spans.length}  butt ${butt}  pinch ${pt}  spans [${spans.map(x => x.toFixed(2)).join(' ')}]`)
}
console.log(`\n  MATERIAL HOLE (>${HOLE} m unpainted mid-band on a street run): ${mat.length}`)
console.log(`  TOPOLOGICAL ONLY (union splits at a zero-width contact):      ${topo.length}`)
console.log(`\n  AUTHORED STATE — blockCustoms streets: ${bc ? Object.keys(bc).join(', ') : 'none'}`)
const authoredInTarget = target.flatMap(r => (r.st.runs || []).map(x => [r.key, x, custOf(x)]).filter(z => z[2]))
console.log(`  authored runs inside the target set: ${authoredInTarget.length}`)
for (const [k, run, c] of authoredInTarget) console.log(`    ${k}  ${run.skelId}|${run.side}|${run.segOrd}  ${JSON.stringify(c)}`)
