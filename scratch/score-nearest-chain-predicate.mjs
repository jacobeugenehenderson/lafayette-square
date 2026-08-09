#!/usr/bin/env node
/**
 * SCORING RUN — "a loop is tangent to chains" (Jacob, 2026-08-09), as the
 * NEAREST-CHAIN / WRONG-SIDE reading. Scored against the ground truth already
 * built: the 193 minting tiles.
 *
 * ⛔ BUILD NOTHING. No detector, no guard, no cure, no constant chosen.
 * ⛔ Nothing re-poured, nothing re-baked; live source untouched (instrumented COPY,
 *    declared edits, each asserted to match exactly once).
 *
 * WHY THE PREDICATE IS EVEN COMPUTABLE — verified in source, because the whole
 * reading depends on it: `buildCurbRings` offsets `tile.ring` INWARD by the
 * half-width (`tileGround.js` — "iA = the per-edge parallel OFFSET polygon …
 * chain ⊕ pavementHW"). ⇒ **tile.ring IS the chain**, the face walk over street
 * centerlines, and the curb is its inset. So "the nearest chain to this curb
 * vertex" is an argmin over ring edges, and A10-③'s stamp already says which ring
 * edge is the vertex's OWN. No new identity, no new key, nothing chain-shaped
 * imported past the Wall — this is the SHAPE pass, where the chain legitimately
 * lives (`freezeCurbEdgeFacts` is the chain-derived half by design).
 *
 * ⛔ THIS IS NOT CHECK A, AND MUST NOT INHERIT ITS TRAP. Check A asks "is this curb
 * parallel to its OWN edge", is blind in the ~9 m junction zone because a fillet is
 * non-parallel on purpose, and — its headline defect — runs `blockCustoms: null`,
 * scoring the operator's authored width as damage (Layer 0 q3). This run loads each
 * scene's `blockCustoms`. A wide loop passes parallelism (every segment correctly
 * offset from its own street) while the ring still crosses itself; that is exactly
 * why the OTHER reading is the one being scored.
 *
 * THE TWO PREDICATES, both parameterless:
 *   NEAREST — the ring edge nearest a curb vertex is neither its source edge nor
 *      the edge preceding it. (Vertex i sits between edges i-1 and i, so BOTH are
 *      legitimately "its own" — a structural exclusion, not a tuned one.) An argmin,
 *      never a cutoff: no distance threshold appears anywhere.
 *   SIDE — the vertex lies on the OUTWARD side of a foreign ring edge: sign of
 *      (v − ring[e]) · inwardNormal(e) < 0, tested only where the closest point on
 *      that segment is interior to it (t ∈ (0,1)), which keeps a non-convex ring
 *      from being judged against an infinite line. Pure sign, no epsilon.
 *
 * ⚠️ TWO NUMBERS, NEVER ONE. A fold (the offset crossed itself) and a legitimately
 *    narrow block (the offset genuinely does not fit) will trip the same predicate.
 *    Both are "the offset does not fit here" and both are silently repaired by the
 *    boolean today — but that is a decision to take on two numbers, so the control
 *    group (offset tiles that do NOT mint) is scored too and reported beside it.
 *
 * Usage:  node scratch/score-nearest-chain-predicate.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRCDIR = path.join(ROOT, 'src/lib')
const TG = path.join(SRCDIR, 'tileGround.js')
const TMP = path.join(ROOT, 'scratch/.fold-probe')

const EDITS = [{
  why: 'dump EVERY offset tile (not just the refusing ones) with its pre-union walk',
  find: /    return keep\.map\(k => uni\[k\]\)\n/,
  to: `    if (stamp && globalThis.__allDump) globalThis.__allDump.push({ minted: stamp.refused === 'clipper-minted-vertex', refused: stamp.refused || null, ring, W, WL })
    return keep.map(k => uni[k])
`,
}, {
  why: 'same on the clean (curved-tile) path',
  find: /  if \(stamp && rl && !rl\.refused\) stamp\.labels = outL\n/,
  to: `  if (stamp && rl && !rl.refused) stamp.labels = outL
  if (stamp && globalThis.__allDump) globalThis.__allDump.push({ minted: stamp.refused === 'clipper-minted-vertex', refused: stamp.refused || null, ring, W: W0, WL: L0 })
`,
}]

const load = async () => {
  let out = fs.readFileSync(TG, 'utf8')
  for (const e of EDITS) {
    const hits = out.match(new RegExp(e.find.source, 'g')) || []
    if (hits.length !== 1) {
      console.error(`⛔ INSTRUMENT ANCHOR DRIFTED — matched ${hits.length}×, expected 1:\n   ${e.why}`)
      console.error('   The edit would be silently unapplied and every number below would be a FALSE GREEN.')
      process.exit(2)
    }
    out = out.replace(e.find, e.to)
  }
  out = out.replace(/(from\s*['"])(\.[^'"]*)(['"])/g, (_, a, s, z) => a + path.resolve(SRCDIR, s) + z)
  fs.mkdirSync(TMP, { recursive: true })
  const p = path.join(TMP, 'tileGround.score.mjs')
  fs.writeFileSync(p, out)
  return await import(p)
}

// ── plane geometry ──────────────────────────────────────────────────────────
const SPUR_COS = Math.cos(165 * Math.PI / 180)
const signedArea = (r) => { let a = 0; for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1] } return a / 2 }
// distance from v to segment ring[e]→ring[e+1], plus the parameter t
const toSeg = (v, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy
  let t = L2 > 0 ? ((v[0] - a[0]) * dx + (v[1] - a[1]) * dy) / L2 : 0
  const tc = Math.max(0, Math.min(1, t))
  const px = a[0] + dx * tc, py = a[1] + dy * tc
  return { d: Math.hypot(v[0] - px, v[1] - py), t }
}

const analyse = (ring, W, WL) => {
  const n = ring.length, m = W.length
  const ccw = signedArea(ring) > 0
  // inward normal per edge, computed exactly as offsetRingVariable does
  const nrm = []
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n]
    let dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L
    nrm.push(ccw ? [-dy, dx] : [dy, -dx])
  }
  let nearest = false, side = false, spur = 0, rev = 0
  for (let k = 0; k < m; k++) {
    const v = W[k], own = WL[k], ownPrev = (own - 1 + n) % n
    let best = Infinity, bestE = -1
    for (let e = 0; e < n; e++) {
      const { d, t } = toSeg(v, ring[e], ring[(e + 1) % n])
      if (d < best) { best = d; bestE = e }
      // SIDE — outward of a FOREIGN chain, tested only where the foot is interior
      if (e !== own && e !== ownPrev && t > 0 && t < 1) {
        if ((v[0] - ring[e][0]) * nrm[e][0] + (v[1] - ring[e][1]) * nrm[e][1] < 0) side = true
      }
    }
    if (bestE !== own && bestE !== ownPrev) nearest = true
  }
  // the two existing predicates, recomputed here so the comparison is like-for-like
  for (let k = 0; k < m; k++) {
    const a = W[(k - 1 + m) % m], v = W[k], b = W[(k + 1) % m]
    const ix = v[0] - a[0], iy = v[1] - a[1], ox = b[0] - v[0], oy = b[1] - v[1]
    const li = Math.hypot(ix, iy) || 1, lo = Math.hypot(ox, oy) || 1
    if ((ix / li) * (ox / lo) + (iy / li) * (oy / lo) < SPUR_COS) spur++
    const s = WL[k], t2 = WL[(k + 1) % m]
    if (s === t2) continue
    const e = [ring[(s + 1) % n][0] - ring[s][0], ring[(s + 1) % n][1] - ring[s][1]]
    const o = [W[(k + 1) % m][0] - W[k][0], W[(k + 1) % m][1] - W[k][1]]
    if (e[0] * o[0] + e[1] * o[1] < 0) rev++
  }
  return { nearest, side, p1: spur > 0, p2: rev > 0 }
}

// ── states, each WITH its own blockCustoms (Layer 0 q3) ─────────────────────
const OPTS = { stencil: null, curbWidth: 0.15, smooth: 0, blockLandUse: null, cornerRadiusScale: 1, cornerRadiusOverrides: null, cornerCornerRadiusOverrides: null, emitArtifact: true }
const states = [{ id: 'lafayette-square', p: 'src/data/ribbons.json' }, { id: 'toy', p: 'src/data/toy/toy-ribbons.json' }]
for (const d of fs.readdirSync(path.join(ROOT, 'cartograph/data')).sort()) {
  if (['toy', 'lafayette-square', 'clean', 'raw'].includes(d)) continue
  const p = `cartograph/data/${d}/clean/ribbons.json`
  if (fs.existsSync(path.join(ROOT, p))) states.push({ id: d, p })
}
const bcFor = (id) => {
  const f = path.join(ROOT, `public/looks/${id}/design.json`)
  if (!fs.existsSync(f)) return { bc: null, note: 'no design.json — bare defaults' }
  const bc = JSON.parse(fs.readFileSync(f, 'utf8')).blockCustoms || null
  const nSlot = bc ? Object.values(bc).reduce((s, x) => s + Object.values(x).reduce((y, z) => y + Object.keys(z).length, 0), 0) : 0
  return { bc, note: nSlot ? `${nSlot} authored slot(s) LOADED` : 'design.json carries ZERO blockCustoms' }
}

const { buildTileGround } = await load()
const quiet = (f) => { const w = console.log; console.log = () => {}; try { return f() } finally { console.log = w } }

console.log('\n⭐ SCORING — NEAREST-CHAIN / WRONG-SIDE, against the 193 minting tiles')
console.log('   ⛔ Build nothing. No constant chosen. Nothing re-baked.')
console.log('   ⛔ NOT Check A: this is not "parallel to its own edge" — a fillet is non-parallel on')
console.log('      purpose and a wide loop passes parallelism while the ring still crosses itself.\n')

const M = { n: 0, nearest: 0, side: 0, either: 0, p1: 0, p2: 0, neither12: 0, neither12Caught: 0 }
const C = { n: 0, nearest: 0, side: 0, either: 0 }
const perScene = []

for (const s of states) {
  if (!fs.existsSync(path.join(ROOT, s.p))) continue
  const { bc, note } = bcFor(s.id)
  globalThis.__allDump = []
  try { quiet(() => buildTileGround(JSON.parse(fs.readFileSync(path.join(ROOT, s.p))), { ...OPTS, blockCustoms: bc })) }
  catch (e) { console.log(`  ⛔ ${s.id} NOT MEASURED — ${e.message.slice(0, 60)}`); continue }
  const rowsM = { n: 0, nearest: 0, side: 0, either: 0 }, rowsC = { n: 0, nearest: 0, side: 0, either: 0 }
  for (const d of globalThis.__allDump) {
    const r = analyse(d.ring, d.W, d.WL)
    const hit = r.nearest || r.side
    const T = d.minted ? M : C, R = d.minted ? rowsM : rowsC
    T.n++; R.n++
    if (r.nearest) { T.nearest++; R.nearest++ }
    if (r.side) { T.side++; R.side++ }
    if (hit) { T.either++; R.either++ }
    if (d.minted) {
      if (r.p1) M.p1++
      if (r.p2) M.p2++
      if (!r.p1 && !r.p2) { M.neither12++; if (hit) M.neither12Caught++ }
    }
  }
  perScene.push({ id: s.id, note, rowsM, rowsC })
}

console.log('── per scene — MINTING tiles (the target) · authoring state named ──')
for (const p of perScene) {
  console.log(`  ${p.id.padEnd(24)} ${String(p.rowsM.either).padStart(4)}/${String(p.rowsM.n).padStart(4)} caught` +
    `   (nearest ${p.rowsM.nearest} · side ${p.rowsM.side})    [${p.note}]`)
}
console.log('\n── per scene — CONTROL: offset tiles that do NOT mint (the false-positive side) ──')
for (const p of perScene) {
  const pct = p.rowsC.n ? (100 * p.rowsC.either / p.rowsC.n).toFixed(1) : '—'
  console.log(`  ${p.id.padEnd(24)} ${String(p.rowsC.either).padStart(4)}/${String(p.rowsC.n).padStart(4)} trip it (${pct}%)   (nearest ${p.rowsC.nearest} · side ${p.rowsC.side})`)
}

console.log('\n══ THE SCORE ══')
console.log(`   ${'predicate'.padEnd(52)} ${'minting caught'.padStart(15)}`)
console.log(`   ${'vertex-level ≥165° reversal (dropFoldSpurs today)'.padEnd(52)} ${(M.p1 + ' / ' + M.n).padStart(15)}`)
console.log(`   ${'segment-level sign against source edge'.padEnd(52)} ${(M.p2 + ' / ' + M.n).padStart(15)}`)
console.log(`   ${'⭐ nearest-chain OR wrong-side'.padEnd(52)} ${(M.either + ' / ' + M.n).padStart(15)}`)
console.log(`   ${'   · nearest-chain alone'.padEnd(52)} ${(M.nearest + ' / ' + M.n).padStart(15)}`)
console.log(`   ${'   · wrong-side alone'.padEnd(52)} ${(M.side + ' / ' + M.n).padStart(15)}`)
console.log(`\n   ⚠️ THE SECOND NUMBER — control: ${C.either}/${C.n} NON-minting offset tiles also trip it` +
  ` (${C.n ? (100 * C.either / C.n).toFixed(1) : '—'}%)`)
console.log(`   ⭐ THE 44: tiles caught by NEITHER existing predicate = ${M.neither12}; this one sees ${M.neither12Caught} of them.`)

// ── IS THE CONTROL GROUP FALSE POSITIVES, OR FOLDS THE GROUND TRUTH MISSED? ──
// A tile can have a self-intersecting W and still not mint: Clipper only mints a
// vertex where the crossing lands OFF its integer grid, and a fold entirely inside
// a discarded lobe never reaches the kept ring. So "trips the predicate but does
// not mint" is NOT automatically a false positive — it may be a real fold whose
// mint the ground truth cannot see. Separating the two is the whole interpretation.
const segX = (p1, p2, p3, p4) => {
  const ax = p2[0] - p1[0], ay = p2[1] - p1[1], bx = p4[0] - p3[0], by = p4[1] - p3[1]
  const den = ax * by - ay * bx
  if (Math.abs(den) < 1e-12) return false
  const t = ((p3[0] - p1[0]) * by - (p3[1] - p1[1]) * bx) / den
  const u = ((p3[0] - p1[0]) * ay - (p3[1] - p1[1]) * ax) / den
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9
}
const selfInt = (W) => {
  const n = W.length
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue
    if (segX(W[i], W[(i + 1) % n], W[j], W[(j + 1) % n])) return true
  }
  return false
}
let cTrip = 0, cTripCrosses = 0, cCleanCrosses = 0, mMiss = 0, mMissCrosses = 0
for (const s of states) {
  if (!fs.existsSync(path.join(ROOT, s.p))) continue
  const { bc } = bcFor(s.id)
  globalThis.__allDump = []
  try { quiet(() => buildTileGround(JSON.parse(fs.readFileSync(path.join(ROOT, s.p))), { ...OPTS, blockCustoms: bc })) } catch (e) { continue }
  for (const d of globalThis.__allDump) {
    const r = analyse(d.ring, d.W, d.WL), hit = r.nearest || r.side
    if (!d.minted && hit) { cTrip++; if (selfInt(d.W)) cTripCrosses++ }
    if (!d.minted && !hit && selfInt(d.W)) cCleanCrosses++
    if (d.minted && !hit) { mMiss++; if (selfInt(d.W)) mMissCrosses++ }
  }
}
console.log('\n── INTERPRETING THE SECOND NUMBER — do the control tiles actually fold? ──')
console.log(`   control tiles tripping the predicate            : ${cTrip}`)
console.log(`     · of which W GENUINELY SELF-INTERSECTS        : ${cTripCrosses}   ⇒ real folds the mint test cannot see`)
console.log(`     · of which W is simple (a true false positive): ${cTrip - cTripCrosses}`)
console.log(`   control tiles NOT tripping it that still fold   : ${cCleanCrosses}   (the predicate's own misses in the control)`)
console.log(`   minting tiles the predicate MISSES              : ${mMiss} (of which W self-intersects: ${mMissCrosses})`)

// ── WHAT THE PREDICATE IS BEING COMPARED AGAINST ────────────────────────────
// ⭐ The control above was computed with `selfInt(W)` — a direct segment-pair
// crossing test. That is not a predictor of folds; it IS the fold, by definition:
// 193/193 recall, 0 false positives, no constant, no epsilon. Jacob's ruling
// ("stop predicting folds, detect them") is what the scoring harness itself used.
// The only open question is cost, so measure it rather than assert it.
let pairs = 0, tiles = 0
const Ws = []
for (const s of states) {
  if (!fs.existsSync(path.join(ROOT, s.p))) continue
  const { bc } = bcFor(s.id)
  globalThis.__allDump = []
  try { quiet(() => buildTileGround(JSON.parse(fs.readFileSync(path.join(ROOT, s.p))), { ...OPTS, blockCustoms: bc })) } catch (e) { continue }
  for (const d of globalThis.__allDump) { tiles++; const n = d.W.length; pairs += n * (n - 1) / 2; Ws.push(d.W) }
}
const t0 = process.hrtime.bigint()
for (const W of Ws) selfInt(W)
const ms = Number(process.hrtime.bigint() - t0) / 1e6
console.log('\n── COST OF DIRECT DETECTION (the thing the predicate is a proxy for) ──')
console.log(`   ${tiles} offset tiles · ${(pairs / 1e6).toFixed(2)}M segment pairs worst-case`)
console.log(`   naive O(n\u00b2) crossing test over EVERY offset tile of ALL 7 SCENES: ${ms.toFixed(0)} ms`)
console.log('   \u2b50 That is the whole map, every town, brute force, with no spatial index and no early exit')
console.log('      beyond the first hit. Paid ONCE at the freeze; in Survey, only for the one tile under')
console.log('      the operator\'s hand. ORIENTATION\'s "a freeze is a performance move" holds comfortably.')
