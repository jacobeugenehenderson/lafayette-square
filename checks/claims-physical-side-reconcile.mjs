#!/usr/bin/env node
// THE CHECK: does reconciling a road's pavementHW by the PHYSICAL side instead
// of the point-order-relative side LABEL remove the width step at a seam?
//
// Applies derive.js's new physical-side reconcile to the CURRENT ribbons.json
// IN MEMORY, then builds the curb both ways and diffs. ⛔ WRITES NOTHING — the
// real reconcile lives in derive.js and only lands on a re-pour, which is a
// shared artifact; this predicts the outcome without touching it.
//
//   node scratch/claims-physical-side-reconcile.mjs
//
// ⛔ Loads the scene's authored blockCustoms (Layer 0 q3).
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const { buildTileGround } = await import(path.join(ROOT, 'src/lib/tileGround.js'))
const SCENE = 'lafayette-square'

const DESIGN = path.join(ROOT, `public/looks/${SCENE}/design.json`)
if (!fs.existsSync(DESIGN)) { console.log(`⛔ no design.json — refusing to measure without the authored state`); process.exit(2) }
const design = JSON.parse(fs.readFileSync(DESIGN, 'utf8'))
const RIB = path.join(ROOT, 'src/data/ribbons.json')

// ── the reconcile under test, verbatim in shape from derive.js ──────────────
function physicalSideReconcile(streets, { verbose = false } = {}) {
  const parent = new Map()
  const add = (k) => { if (!parent.has(k)) parent.set(k, k) }
  const find = (k) => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k) } return k }
  const union = (a, b) => { add(a); add(b); const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb) }
  const sideKey = (st, side) => `${st.skelId}|${side}`
  for (const st of streets) for (const side of ['left', 'right']) add(sideKey(st, side))

  const byRoad = new Map()
  for (const st of streets) {
    const rid = st.roadId || st.skelId
    if (!byRoad.has(rid)) byRoad.set(rid, [])
    byRoad.get(rid).push(st)
  }
  // ⭐ Join only at a DEGREE-2 end. "Shares an endpoint" is NOT "is continuous
  // with": where three or more of a road's chains meet (a Y, or a chain
  // rejoining its own road), the pair is not a pass-through and the hand does
  // not carry across it. Unioning there manufactures a false orientation cycle
  // that then reads as a contradiction and suppresses the whole road's
  // reconcile. Count the chain-ends at each node first; union only the 2-ended
  // ones, where "continuous" is unambiguous.
  const EPS = 0.15                                   // = tileGround's ENDPOINT_SNAP
  const nodeKey = (p) => `${Math.round(p[0] / EPS)},${Math.round(p[1] / EPS)}`
  let joins = 0, flips = 0, skippedDeg = 0, ambiguous = 0
  for (const group of byRoad.values()) {
    const ends = new Map()                           // node → [{ st, isStart }]
    for (const st of group) {
      const p = st.points
      if (!p?.length) continue
      for (const [pt, isStart] of [[p[0], true], [p[p.length - 1], false]]) {
        const k = nodeKey(pt)
        if (!ends.has(k)) ends.set(k, [])
        ends.get(k).push({ st, isStart })
      }
    }
    for (const [, inc] of ends) {
      if (inc.length !== 2) { if (inc.length > 2) skippedDeg++; continue }
      const [X, Y] = inc
      if (X.st === Y.st) continue                    // a chain closing on itself
      // Labels agree iff the shared node is one chain's END and the other's
      // START; start-to-start or end-to-end means the point orders oppose.
      const reversed = X.isStart === Y.isStart
      joins++; if (reversed) flips++
      union(sideKey(X.st, 'left'), sideKey(Y.st, reversed ? 'right' : 'left'))
      union(sideKey(X.st, 'right'), sideKey(Y.st, reversed ? 'left' : 'right'))
    }
  }

  const contradicted = new Set()
  for (const st of streets) {
    if (find(sideKey(st, 'left')) === find(sideKey(st, 'right'))) {
      contradicted.add(find(sideKey(st, 'left')))
      console.log(`   ⛔ CONTRADICTION ${st.skelId}: left and right are one physical side — left UNRECONCILED`)
    }
  }
  const maxByGroup = new Map()
  for (const st of streets) for (const side of ['left', 'right']) {
    const v = st.measure?.[side]?.pavementHW
    if (v == null) continue
    const g = find(sideKey(st, side))
    if (contradicted.has(g)) continue
    if (!maxByGroup.has(g) || v > maxByGroup.get(g)) maxByGroup.set(g, v)
  }
  const changes = []
  for (const st of streets) for (const side of ['left', 'right']) {
    const m = st.measure?.[side]
    if (!m || m.pavementHW == null) continue
    const mx = maxByGroup.get(find(sideKey(st, side)))
    if (mx != null && mx - m.pavementHW > 1e-3) { changes.push({ skelId: st.skelId, side, from: m.pavementHW, to: mx }); m.pavementHW = mx }
  }
  return { changes, joins, flips, ambiguous, skippedDeg }
}

const build = (streets) => buildTileGround({ ...JSON.parse(fs.readFileSync(RIB, 'utf8')), streets }, {
  stencil: null, curbWidth: design.curbWidth ?? 0.15, smooth: 0,
  blockLandUse: design.blockLandUse || null,
  cornerRadiusScale: design.cornerRadiusScale ?? 1,
  cornerRadiusOverrides: design.cornerRadiusOverrides || null,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides || null,
  blockCustoms: design.blockCustoms || null, emitArtifact: true,
})

const quiet = () => { const o = console.log; console.log = () => {}; return () => { console.log = o } }

const rb = JSON.parse(fs.readFileSync(RIB, 'utf8'))
let un = quiet(); const before = build(rb.streets); un()

const rb2 = JSON.parse(fs.readFileSync(RIB, 'utf8'))
console.log('── applying the PHYSICAL-SIDE reconcile in memory (writes nothing)')
const res = physicalSideReconcile(rb2.streets, { verbose: true })
console.log(`   chain joins ${res.joins}   orientation FLIPS ${res.flips}   ambiguous ${res.ambiguous}`)
console.log(`   width changes: ${res.changes.length}`)
for (const c of res.changes) console.log(`     ${c.skelId}/${c.side}  ${c.from.toFixed(4)} → ${c.to.toFixed(4)}`)

un = quiet(); const after = build(rb2.streets); un()

// ── diff the curbs, keyed by ring centroid (never by tile index)
const round = (v) => Math.round(v * 100) / 100
const key = (t) => { let x = 0, y = 0; for (const p of t.ring) { x += p[0]; y += p[1] } return `${round(x / t.ring.length)},${round(y / t.ring.length)}` }
const map = (pr) => { const m = new Map(); for (const t of pr._shapeArtifact || []) if (t?.ring?.length) m.set(key(t), (t.iA || []).flat()); return m }
const A = map(before), B = map(after)
const keys = new Set([...A.keys(), ...B.keys()])
let changed = 0
console.log(`\n── curb diff: ${keys.size} tiles`)
for (const k of keys) {
  const a = A.get(k) || [], b = B.get(k) || []
  if (JSON.stringify(a.map(p => [round(p[0]), round(p[1])])) === JSON.stringify(b.map(p => [round(p[0]), round(p[1])]))) continue
  let worst = 0, at = null
  for (const p of b) { let n = Infinity; for (const q of a) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < n) n = d } if (n > worst) { worst = n; at = p } }
  changed++
  console.log(`  tile@${k}  verts ${a.length} → ${b.length}   max displacement ${worst.toFixed(3)} m at [${at?.[0].toFixed(2)}, ${at?.[1].toFixed(2)}]`)
}
console.log(`  CHANGED ${changed} / ${keys.size}`)

// ── the acceptance: the offset profile at the seam must not step
const V = [516.19, -413.38]
function distToRing(p, ring) { let best = 1e9; for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; const dx = b[0] - a[0], dy = b[1] - a[1]; const L2 = dx * dx + dy * dy || 1; let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2; t = Math.max(0, Math.min(1, t)); const d = Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)); if (d < best) best = d } return best }
for (const [label, pr] of [['BEFORE', before], ['AFTER', after]]) {
  for (const t of pr._shapeArtifact || []) {
    if (!t?.ring?.length || !t.iA?.length) continue
    let x = 0, y = 0; for (const p of t.ring) { x += p[0]; y += p[1] }
    const cx = x / t.ring.length, cy = y / t.ring.length
    if (Math.hypot(cx - 549.38, cy + 397.95) > 1 && Math.hypot(cx - 550.72, cy + 380.45) > 1) continue
    const offs = []
    for (const poly of t.iA) for (const p of poly) if (Math.hypot(p[0] - V[0], p[1] - V[1]) < 14) offs.push(distToRing(p, t.ring))
    if (!offs.length) continue
    const mn = Math.min(...offs), mx = Math.max(...offs)
    console.log(`  ${label} tile@${cx.toFixed(2)},${cy.toFixed(2)}  offset ${mn.toFixed(3)} … ${mx.toFixed(3)}   EXCURSION ${(mx - mn).toFixed(3)} m`)
  }
}
