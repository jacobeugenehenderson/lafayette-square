#!/usr/bin/env node
/**
 * READ-ONLY. WHY does arc the producer expects to paint at full depth go UNPAINTED?
 *
 * Companion to scratch/sever24-taxonomy.mjs (which established WHERE and HOW MUCH).
 * This one hunts the MECHANISM. Nothing here proposes a fix.
 *
 * §1 SIDE-SKEW, NORMALISED. Unpainted expected-arc metres by side, over TOTAL
 *    expected-arc metres by side, across EVERY banded tile — not just the severed
 *    ones, because a raw right-side majority proves nothing if right-side runs are
 *    the majority of runs. Ratio and denominator, never the count.
 *
 * §2 IS THE ARC OWNED? A run's `poly` is the centreline-side polyline; the curb arc
 *    it owns sits `pavementHW` away from it. So for every point on `iA` the residual
 *      min over runs of | dist(p, run.poly) - basePHW(run) |
 *    is ~0 where some run's offset explains that arc, and LARGE where NO run does.
 *    A large residual means the arc is UNOWNED — a partition fact (SHAPE), not a
 *    painting fact (FILL). This is the layer gate, measured rather than presumed.
 *
 * §3 CO-CLAIM. Is the unpainted arc claimed by an ADJACENT tile and painted there?
 *
 * §4 BARE vs RELEASED. Nothing at all, or painted as land use (A10 — the released
 *    band is GREEN, not missing)? Different defects, different owners.
 *
 * §5 OFFSET-REVERSAL INTERSECTION with scratch/claims-offset-reversal.mjs.
 *
 * Keyed to the RING (rotation/direction-independent vertex multiset hash) throughout.
 * Runs WITH the scene's authored blockCustoms. Expectation resolved the way the
 * PRODUCER resolves it (see sever24-taxonomy.mjs `resolveRun` for the full note:
 * resolvePedDepths reads the override else STD_TREELAWN/ADA_SIDEWALK, NEVER the
 * frozen measure's treelawn/sidewalk/terminal).
 *
 * Usage: node scratch/sever24-mechanism.mjs [--scene <name>] [--tile <ringHash>]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import clipperLib from 'clipper-lib'
import { sectionPassTile, resolvePedDepths } from '../src/lib/tileGround.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const arg = f => process.argv.includes(f)
const argv = f => process.argv[process.argv.indexOf(f) + 1]
const argScene = arg('--scene') ? argv('--scene') : 'lafayette-square'

const shapeP = path.join(ROOT, 'public/baked', argScene, 'shape.json')
const shape = (j => Array.isArray(j) ? j : j.tiles)(JSON.parse(fs.readFileSync(shapeP, 'utf8')))
const designP = path.join(ROOT, 'public/looks', argScene, 'design.json')
const bc = fs.existsSync(designP) ? (JSON.parse(fs.readFileSync(designP, 'utf8')).blockCustoms || null) : null
const CW = 0.381, STRIPMAT = { outer: 'LU', inner: 'SW' }

console.log(`MECHANISM HUNT — ${argScene}`)
console.log(`  shape.json ${shape.length} tiles  sha256 ${crypto.createHash('sha256').update(fs.readFileSync(shapeP)).digest('hex').slice(0, 16)}`)
console.log(`  blockCustoms ${bc ? Object.keys(bc).length + ' streets LOADED' : '⛔ NONE'}\n`)

const Q = 1e4
const vkey = p => `${Math.round(p[0] * Q)},${Math.round(p[1] * Q)}`
const ringKey = ring => {
  const vs = ring.map(vkey); if (vs.length > 1 && vs[0] === vs[vs.length - 1]) vs.pop()
  return crypto.createHash('sha1').update([...vs].sort().join('|')).digest('hex').slice(0, 10)
}
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
const inRings = (rings, p) => { let c = false
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    if ((r[i][1] > p[1]) !== (r[j][1] > p[1]) && p[0] < (r[j][0] - r[i][0]) * (p[1] - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c
  return c }
const d2seg = (p, a, b) => {
  const vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy
  let t = L ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy))
}
// distance to a POLYLINE, plus whether the closest point is INTERIOR (not past an end)
const d2polyEx = (p, poly) => {
  let m = Infinity, interior = false
  for (let i = 0; i + 1 < poly.length; i++) {
    const a = poly[i], b = poly[i + 1]
    const vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy
    let t = L ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L : 0
    const tc = Math.max(0, Math.min(1, t))
    const d = Math.hypot(p[0] - (a[0] + tc * vx), p[1] - (a[1] + tc * vy))
    if (d < m) { m = d; interior = (i > 0 || t > 0.001) && (i + 2 < poly.length || t < 0.999) }
  }
  return { d: m, interior }
}
const basePHW = run => { const v = run.baseMeasure?.[run.side]?.pavementHW; return Number.isFinite(v) ? Math.max(0, v) : 0 }
const custOf = run => bc?.[run.skelId]?.[run.side]?.[run.segOrd] || null
const resolveRun = (st, run) => {
  const pedOff = ((st.tl || 0) + (st.sw || 0)) <= 1e-6
  const noPed = basePHW(run) <= 1e-6
  const c = custOf(run)
  const ped = (pedOff || noPed) ? { tl: 0, sw: 0, hasTL: false } : resolvePedDepths(run.baseMeasure, run.side, c)
  return { expected: (ped.tl + ped.sw) > 1e-6, total: ped.tl + ped.sw }
}

// ---------- walk EVERY banded tile
const tiles = []
for (const [ti, st] of shape.entries()) {
  let out; try { out = sectionPassTile(st, CW, STRIPMAT, bc) } catch { continue }
  const band = unionAll([...(out.Wacc || []), ...Object.values(out.tlByLu || {}).flat()])
  const lu = unionAll(Object.values(out.luByLu || {}).flat())
  const comps = band.filter(r => r.length >= 3 && area(r) > 0.05)
  if (!comps.length) continue                            // no band at all — its own class
  const iA = (st.iA || []).filter(r => r && r.length >= 3)
  const WB = CW + (st.tl || 0) + (st.sw || 0)
  const samples = []
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
        const q = [px + nx * (CW + ((st.tl || 0) + (st.sw || 0)) / 2), py + ny * (CW + ((st.tl || 0) + (st.sw || 0)) / 2)]
        // OWNER + the §2 residual: does ANY run's offset explain this arc?
        let owner = null, od = Infinity, resid = Infinity, ownerResid = null
        for (const r of (st.runs || [])) {
          const { d, interior } = d2polyEx([px, py], r.poly)
          const rr = Math.abs(d - basePHW(r))
          if (rr < resid) { resid = rr; ownerResid = { run: r, d, interior } }
          if (d < od) { od = d; owner = r }
        }
        samples.push({ p: [px, py], q, len: L / steps, painted: inRings(band, q), green: inRings(lu, q),
                       owner, ownerDist: od, resid, byResid: ownerResid })
      }
    }
  }
  tiles.push({ ti, key: ringKey(st.ring), st, band, lu, comps: comps.length, samples, WB, iA })
}
console.log(`banded tiles walked: ${tiles.length} / ${shape.length}\n`)

// ================= §1 SIDE-SKEW, NORMALISED =================
console.log('='.repeat(104))
console.log('§1  SIDE-SKEW — unpainted EXPECTED arc over TOTAL EXPECTED arc, by side. Ratio + denominator.')
console.log('='.repeat(104))
const bySide = {}
const add = (k, side, exp, unp) => { const o = (bySide[k] ||= {}); const v = (o[side] ||= { exp: 0, unp: 0 }); v.exp += exp; v.unp += unp }
for (const t of tiles) for (const s of t.samples) {
  if (!s.owner) continue
  if (!resolveRun(t.st, s.owner).expected) continue
  add('ALL BANDED TILES', s.owner.side, s.len, s.painted ? 0 : s.len)
  if (t.comps > 1) add('SEVERED TILES ONLY', s.owner.side, s.len, s.painted ? 0 : s.len)
}
for (const k of Object.keys(bySide)) {
  console.log(`\n  ${k}`)
  console.log(`    side    expected arc (denominator)   unpainted      RATIO`)
  const o = bySide[k]
  for (const side of Object.keys(o).sort()) {
    const v = o[side]
    console.log(`    ${side.padEnd(7)} ${v.exp.toFixed(0).padStart(12)} m            ${v.unp.toFixed(1).padStart(8)} m   ${(100 * v.unp / v.exp).toFixed(2).padStart(6)}%`)
  }
  const tot = Object.values(o).reduce((a, v) => ({ exp: a.exp + v.exp, unp: a.unp + v.unp }), { exp: 0, unp: 0 })
  console.log(`    TOTAL   ${tot.exp.toFixed(0).padStart(12)} m            ${tot.unp.toFixed(1).padStart(8)} m   ${(100 * tot.unp / tot.exp).toFixed(2).padStart(6)}%`)
  const L = o.left || { exp: 0, unp: 0 }, R = o.right || { exp: 0, unp: 0 }
  const rl = L.exp ? (100 * L.unp / L.exp) : 0, rr = R.exp ? (100 * R.unp / R.exp) : 0
  console.log(`    ⇒ right/left rate ratio ${rl ? (rr / rl).toFixed(2) : 'n/a'}  (left ${rl.toFixed(2)}% · right ${rr.toFixed(2)}%)`)
}

// ================= §2 IS THE ARC OWNED? =================
console.log(`\n${'='.repeat(104)}`)
console.log('§2  IS THE ARC OWNED? residual = min over runs of | dist(pt, run.poly) - basePHW(run) |.')
console.log('    ~0 ⇒ some run\'s offset explains this arc (OWNED). Large ⇒ NO run does (UNOWNED — a')
console.log('    PARTITION fact, SHAPE, upstream of the painter).')
console.log('='.repeat(104))
const OWNED = 0.5
let gExpP = 0, gExpU = 0, gUnownedU = 0, gUnownedP = 0
for (const t of tiles) for (const s of t.samples) {
  if (!s.owner || !resolveRun(t.st, s.owner).expected) continue
  if (s.painted) { gExpP += s.len; if (s.resid > OWNED) gUnownedP += s.len }
  else { gExpU += s.len; if (s.resid > OWNED) gUnownedU += s.len }
}
console.log(`  PAINTED   expected arc ${gExpP.toFixed(0)} m — of which UNOWNED (residual > ${OWNED} m): ${gUnownedP.toFixed(1)} m  (${(100 * gUnownedP / gExpP).toFixed(1)}%)`)
console.log(`  UNPAINTED expected arc ${gExpU.toFixed(0)} m — of which UNOWNED (residual > ${OWNED} m): ${gUnownedU.toFixed(1)} m  (${(100 * gUnownedU / gExpU).toFixed(1)}%)`)
console.log(`  ⇒ if the unpainted share is far higher, the arc is unowned and the layer is SHAPE, not FILL.`)

// ================= per-tile detail on the material holes =================
console.log(`\n${'='.repeat(104)}`)
console.log('PER-TILE — every tile with >0.5 m of unpainted EXPECTED arc. §2 residual · §3 co-claim · §4 bare/green')
console.log('='.repeat(104))
// §3 co-claim: does an ADJACENT tile paint this exact point?
const others = tiles.map(t => ({ key: t.key, band: t.band, iA: t.iA }))
const rows = []
for (const t of tiles) {
  const u = t.samples.filter(s => s.owner && resolveRun(t.st, s.owner).expected && !s.painted)
  const len = u.reduce((a, s) => a + s.len, 0)
  if (len <= 0.5) continue
  // stretches
  const st2 = []; let cur = null
  for (const s of t.samples) {
    const bad = s.owner && resolveRun(t.st, s.owner).expected && !s.painted
    if (bad) { if (!cur) cur = { len: 0, p: s.p, owner: s.owner, n: 0, green: 0, resid: 0, coclaim: 0 }
               cur.len += s.len; cur.n++; if (s.green) cur.green++; cur.resid += s.resid }
    else if (cur) { st2.push(cur); cur = null }
  }
  if (cur) st2.push(cur)
  st2.sort((a, b) => b.len - a.len)
  // co-claim on the biggest stretch's midpoint region (sample up to 40 pts)
  for (const stretch of st2.slice(0, 3)) {
    const pts = u.filter(s => Math.hypot(s.p[0] - stretch.p[0], s.p[1] - stretch.p[1]) < stretch.len).slice(0, 40)
    let co = 0
    for (const s of pts) for (const o of others) {
      if (o.key === t.key) continue
      if (inRings(o.band, s.q)) { co++; break }
    }
    stretch.coclaim = pts.length ? co / pts.length : 0
  }
  rows.push({ t, len, st2, greenAll: u.filter(s => s.green).reduce((a, s) => a + s.len, 0) })
}
rows.sort((a, b) => b.len - a.len)
for (const r of rows) {
  console.log(`\n  ${r.t.key} [s${r.t.ti}]  unpainted-expected ${r.len.toFixed(1)} m   of which GREEN (released→LU) ${r.greenAll.toFixed(1)} m ⇒ ${r.greenAll / r.len > 0.5 ? 'RELEASED, not missing' : 'BARE'}`)
  for (const s of r.st2.slice(0, 3)) {
    console.log(`     ${s.len.toFixed(1).padStart(6)}m  ${s.owner.skelId}|${s.owner.side}|${s.owner.segOrd}  phw ${basePHW(s.owner).toFixed(2)}  meanResid ${(s.resid / s.n).toFixed(2)}m ⇒ ${(s.resid / s.n) > OWNED ? '⛔ UNOWNED arc' : 'owned'}  green ${(100 * s.green / s.n).toFixed(0)}%  co-claimed by a neighbour ${(100 * s.coclaim).toFixed(0)}%`)
  }
}

// ================= §6 WHOLE RUN, OR PART OF ONE? =================
// ⭐ THE DISCRIMINATOR. "A whole leg goes unpainted" smells like the RUN was excluded.
// So measure it per RUN: of the arc this run owns, what fraction is unpainted? ~100%
// means the run produced nothing at all (excluded upstream of the geometry). A partial
// fraction means the run DID paint and the stroke failed over part of its span.
// Attributes are printed alongside so a shared property is visible if one exists.
const TREELAWN_YN_THRESHOLD = 0.6   // tileGround.js:1157
const gleanGap = (m, side) => Math.max(0, Number.isFinite(m?.[side]?.treelawn) ? m[side].treelawn : 0) >= TREELAWN_YN_THRESHOLD
const gleanTreelawn = (m, side) => {           // tileGround.js:1177 — replicated exactly
  const sd = m?.[side]
  if (sd && sd.terminal === 'lawn') {
    const ok = side === 'left' ? 'right' : 'left'
    const o = m?.[ok]
    if (o && o.terminal === 'sidewalk') return gleanGap(m, ok)
  }
  return gleanGap(m, side)
}
console.log(`\n${'='.repeat(104)}`)
console.log('§6  WHOLE RUN OR PART OF ONE? per-run owned arc vs unpainted arc.')
console.log('='.repeat(104))
const runRows = []
for (const t of tiles) {
  const byRun = new Map()
  for (const s of t.samples) {
    if (!s.owner || !resolveRun(t.st, s.owner).expected) continue
    const k = `${s.owner.skelId}|${s.owner.side}|${s.owner.segOrd}`
    const v = byRun.get(k) || { run: s.owner, owned: 0, unp: 0 }
    v.owned += s.len; if (!s.painted) v.unp += s.len
    byRun.set(k, v)
  }
  for (const [k, v] of byRun) if (v.unp > 0.5) {
    const m = v.run.measure?.[v.run.side] || {}
    runRows.push({ key: t.key, ti: t.ti, k, frac: v.unp / v.owned, owned: v.owned, unp: v.unp,
      hasTL: gleanTreelawn(v.run.baseMeasure, v.run.side), term: m.terminal, tlM: m.treelawn, swM: m.sidewalk,
      pts: v.run.poly.length, thru: JSON.stringify(v.run.thruEnds), anchor: v.run.anchor,
      producer: t.st.producer, join: t.st.bandJoin, fillets: (t.st.fillets || []).length, comps: t.comps })
  }
}
runRows.sort((a, b) => b.frac - a.frac || b.unp - a.unp)
console.log(`  runs with >0.5 m unpainted: ${runRows.length}`)
console.log(`  FULLY unpainted (>=95% of owned arc): ${runRows.filter(r => r.frac >= 0.95).length}`)
console.log(`  PARTIAL (<95%):                      ${runRows.filter(r => r.frac < 0.95).length}\n`)
console.log(`  ringHash    [idx] run                                  unp/owned    frac  hasTL term      tlM   swM  pts thruEnds     producer  join   fil comps`)
for (const r of runRows) console.log(`  ${r.key} [s${String(r.ti).padStart(2)}] ${r.k.padEnd(36)} ${r.unp.toFixed(1).padStart(6)}/${r.owned.toFixed(0).padStart(5)}  ${(100 * r.frac).toFixed(0).padStart(3)}%  ${r.hasTL ? ' Y ' : ' N '}  ${String(r.term).padEnd(9)} ${String(r.tlM).padStart(5)} ${String(r.swM).padStart(5)} ${String(r.pts).padStart(4)} ${String(r.thru).padEnd(12)} ${String(r.producer).padEnd(8)} ${String(r.join).padEnd(6)} ${String(r.fillets).padStart(3)} ${String(r.comps).padStart(5)}`)

// shared-property scan over the FULLY unpainted set vs everything else
const full = runRows.filter(r => r.frac >= 0.95)
console.log(`\n  SHARED-PROPERTY SCAN over the ${full.length} fully-unpainted runs:`)
for (const f of ['hasTL', 'term', 'pts', 'thru', 'anchor', 'producer', 'join']) {
  const vals = new Map()
  for (const r of full) vals.set(String(r[f]), (vals.get(String(r[f])) || 0) + 1)
  console.log(`     ${f.padEnd(9)} ${[...vals].sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v}:${n}`).join('  ')}`)
}

// ================= §7 LOCAL WIDTH — the G12 subclass-2 test =================
// ⛔ MY EARLIER G12 KILL WAS UNSOUND and is RETRACTED. I tested `cap === WB`, which
// says only that the CLAMP DID NOT FIRE. RIBBONS §6.1 verbatim: "(2) band-neck /
// partial-degeneracy (the `cap` clamp fires only on FULL collapse; the `thinTile`
// signal is computed but orphaned)." On a partial degeneracy the clamp never fires,
// so cap === WB is exactly what subclass 2 looks like. It was untested, not killed.
//
// ⛔ A whole-tile mean width (2A/P) reads a TAPERING block as ordinary. The test must
// be LOCAL: at each curb sample, cast the inward normal and measure the distance to
// the far side of the tile — the local width — then ask whether the unpainted
// stretches BEGIN and END where that width crosses a threshold.
//
// THRESHOLDS, and why: the band occupies WB inward FROM EACH SIDE. At local width
// < 2*WB the two sides' bands collide and the inward offsets pass the medial axis
// (the G12 condition). At local width < WB the band cannot fit at all. Both reported.
console.log(`\n${'='.repeat(104)}`)
console.log('§7  LOCAL WIDTH (G12 subclass 2). Inward ray from each curb sample to the far side of the tile.')
console.log('='.repeat(104))
const rayWidth = (p, n, rings) => {
  let best = Infinity
  for (const g of rings) for (let i = 0; i < g.length; i++) {
    const a = g[i], b = g[(i + 1) % g.length]
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const det = dx * n[1] - n[0] * dy
    if (Math.abs(det) < 1e-12) continue
    const t = (-(a[0] - p[0]) * dy + dx * (a[1] - p[1])) / det
    const u = (n[0] * (a[1] - p[1]) - n[1] * (a[0] - p[0])) / det
    if (t > 0.05 && u >= 0 && u <= 1 && t < best) best = t
  }
  return best
}
// re-walk at 0.05 m, but only the tiles that HAVE unpainted expected arc
let g2 = { thinUnp: 0, thinP: 0, wideUnp: 0, wideP: 0 }
console.log(`  ringHash    [idx]  unpainted stretches: local width at the stretch vs on the painted arc either side`)
for (const r of rows) {
  const t = r.t
  const samp = []
  for (const ring of t.iA) {
    const sgn = area(ring) > 0 ? 1 : -1, m = ring.length
    for (let i = 0; i < m; i++) {
      const a = ring[i], b = ring[(i + 1) % m]
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-9) continue
      const nx = -sgn * (b[1] - a[1]) / L, ny = sgn * (b[0] - a[0]) / L
      const steps = Math.max(1, Math.ceil(L / 0.05))
      for (let k = 0; k < steps; k++) {
        const tt = (k + 0.5) / steps
        const px = a[0] + (b[0] - a[0]) * tt, py = a[1] + (b[1] - a[1]) * tt
        let owner = null, od = Infinity
        for (const rn of (t.st.runs || [])) { const dd = d2polyEx([px, py], rn.poly).d; if (dd < od) { od = dd; owner = rn } }
        if (!owner || !resolveRun(t.st, owner).expected) continue
        const q = [px + nx * (CW + ((t.st.tl || 0) + (t.st.sw || 0)) / 2), py + ny * (CW + ((t.st.tl || 0) + (t.st.sw || 0)) / 2)]
        samp.push({ p: [px, py], w: rayWidth([px, py], [nx, ny], t.iA), painted: inRings(t.band, q), len: L / steps, owner })
      }
    }
  }
  const W2 = 2 * t.WB
  for (const x of samp) {
    if (x.w < W2) { if (x.painted) g2.thinP += x.len; else g2.thinUnp += x.len }
    else { if (x.painted) g2.wideP += x.len; else g2.wideUnp += x.len }
  }
  const unp = samp.filter(x => !x.painted), pai = samp.filter(x => x.painted)
  const med = arr => { if (!arr.length) return NaN; const v = arr.map(x => x.w).filter(Number.isFinite).sort((a, b) => a - b); return v[Math.floor(v.length / 2)] }
  const belowU = unp.filter(x => x.w < W2).length / (unp.length || 1)
  const belowP = pai.filter(x => x.w < W2).length / (pai.length || 1)
  console.log(`  ${t.key} [s${String(t.ti).padStart(2)}] WB ${t.WB.toFixed(2)} 2WB ${W2.toFixed(2)} | median local width: UNPAINTED ${med(unp).toFixed(1)}m  PAINTED ${med(pai).toFixed(1)}m | share below 2WB: unp ${(100 * belowU).toFixed(0)}%  painted ${(100 * belowP).toFixed(0)}%`)
}
console.log(`\n  ⭐ THE 2x2 over every expected-arc sample on these tiles (0.05 m spacing):`)
console.log(`                       local width < 2*WB      local width >= 2*WB`)
console.log(`     UNPAINTED       ${g2.thinUnp.toFixed(1).padStart(12)} m       ${g2.wideUnp.toFixed(1).padStart(12)} m`)
console.log(`     PAINTED         ${g2.thinP.toFixed(1).padStart(12)} m       ${g2.wideP.toFixed(1).padStart(12)} m`)
const rThin = g2.thinUnp / (g2.thinUnp + g2.thinP), rWide = g2.wideUnp / (g2.wideUnp + g2.wideP)
console.log(`     unpainted RATE  ${(100 * rThin).toFixed(1).padStart(11)}%       ${(100 * rWide).toFixed(1).padStart(11)}%   ⇒ risk ratio ${(rThin / rWide).toFixed(1)}x`)

// ---- RIM split of the material-hole tiles
console.log(`\n${'='.repeat(104)}`)
console.log('RIM vs NON-RIM — a rim tile carries a run with NO baseMeasure (the boundary edge).')
console.log('='.repeat(104))
let rim = 0
for (const r of rows) {
  const isRim = (r.t.st.runs || []).some(x => !x.baseMeasure)
  if (isRim) rim++
  console.log(`  ${r.t.key} [s${String(r.t.ti).padStart(2)}] ${r.len.toFixed(1).padStart(7)}m unpainted   ${isRim ? '⛔ RIM TILE (boundary run, no baseMeasure)' : 'interior'}`)
}
console.log(`\n  RIM ${rim} / ${rows.length}   ·   INTERIOR ${rows.length - rim} / ${rows.length}`)

// ================= §5 offset-reversal intersection =================
console.log(`\n${'='.repeat(104)}`)
console.log('§5  OFFSET-REVERSAL INTERSECTION — see the separate run of scratch/claims-offset-reversal.mjs')
console.log('='.repeat(104))
console.log('  material-hole ring hashes:', rows.map(r => r.t.key).join(' '))
