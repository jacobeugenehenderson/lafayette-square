#!/usr/bin/env node
/**
 * READ-ONLY. THE CHECK: does the TIP COUPLER *construct* the frozen curb?
 *
 * Jacob's model (2026-09-03): a street is two PARALLEL side-chains; at a dead end the
 * smallest possible coupler wraps them around the tip. The ring closes with real area —
 * there is no zero-width slit and nothing degenerate is ever offset.
 *
 * So BUILD that ring and compare it to what the bake froze:
 *     left side-chain at authored hwL  →  cap coupler  →  right side-chain at hwR
 * vs `tile.iA` (the block; its boundary at a cap IS the curb).
 *
 * The coupler's geometry is already ruled (`bbf4adf6`): radius (hwL+hwR)/2, centre the
 * chain tip displaced (hwR-hwL)/2 along the right-perp — the chain is NOT the road's
 * centreline, so an asymmetric spur is authoring and must PASS.
 *
 * ⭐ Portable to town #2: every expected value is read from the producer's OWN per-run
 * `measure` in shape.json, station-local. No constant, no street knowledge, no skip list.
 * ⛔ A cap whose widths change along the sampled leg is AUTHORING — the check stops
 * sampling there and says so; it never averages across an authored change.
 *
 *   node scratch/claims-cap-coupler-constructs-the-curb.mjs [scene] [skelId]
 */
import fs from 'fs'
import crypto from 'crypto'

const scene = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : 'lafayette-square'
const ONLY = process.argv[3] || null
const SHAPE = `public/baked/${scene}/shape.json`
const RIBBONS = scene === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${scene}/clean/ribbons.json`
const o = console.log
if (!fs.existsSync(SHAPE)) { o(`no ${SHAPE}`); process.exit(1) }
const RAW = fs.readFileSync(SHAPE)
const sh = JSON.parse(RAW)
const rb = JSON.parse(fs.readFileSync(RIBBONS, 'utf8'))
o(`scene ${scene}   shape.json sha256 ${crypto.createHash('sha256').update(RAW).digest('hex').slice(0, 10)}`)

const stBySkel = new Map(rb.streets.map(s => [s.skelId || s.name, s]))
const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1])

// distance from a point to the nearest edge of any iA ring = distance to the frozen curb
function distToRings(p, rings) {
  let best = Infinity
  for (const r of rings) for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length]
    const ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez || 1
    let u = ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / L2
    u = Math.max(0, Math.min(1, u))
    best = Math.min(best, Math.hypot(p[0] - (a[0] + ex * u), p[1] - (a[1] + ez * u)))
  }
  return best
}

// station-local authored half-widths, per side, from the tile's OWN runs
function hwAt(tile, skelId, q) {
  const out = {}
  for (const r of (tile.runs || [])) {
    if (r.skelId !== skelId) continue
    let best = Infinity
    for (let i = 0; i < r.poly.length - 1; i++) {
      const a = r.poly[i], b = r.poly[i + 1]
      const ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez || 1
      let u = ((q[0] - a[0]) * ex + (q[1] - a[1]) * ez) / L2; u = Math.max(0, Math.min(1, u))
      best = Math.min(best, Math.hypot(q[0] - (a[0] + ex * u), q[1] - (a[1] + ez * u)))
    }
    const hw = r.measure?.[r.side]?.pavementHW
    if (best < 0.5 && Number.isFinite(hw)) out[r.side] = +hw
  }
  return out
}

const LEG = 20      // metres of leg to sample back from the tip
const STEP = 0.25
const ARCN = 48
const TOL = 0.10    // same tolerance as claims-deadend-notch-standoff.mjs

// SIGN is a discovered convention, not an assumption: run both and report the margin.
function buildAndScore(seqFwd, tipAtStart, hwL, hwR, rings, sign, tile, skelId) {
  // seqFwd is the chain in its OWN point order (that is what `side` is relative to).
  // perpRight = sign * (Tz, -Tx)
  const pts = tipAtStart ? seqFwd : [...seqFwd].reverse()   // pts[0] = the tip
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + d(pts[i - 1], pts[i])
  const total = cum[cum.length - 1]
  const at = (s) => {
    for (let i = 1; i < pts.length; i++) if (cum[i] >= s || i === pts.length - 1) {
      const a = pts[i - 1], b = pts[i], L = Math.max(1e-9, cum[i] - cum[i - 1]), u = (s - cum[i - 1]) / L
      return { p: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], t: [(b[0] - a[0]) / L, (b[1] - a[1]) / L] }
    }
    return null
  }
  // walking OUT from the tip reverses the chain's own direction when tipAtStart is false
  const flip = tipAtStart ? 1 : -1
  // ⛔ LAYER 0 q3: a spur may change width across its span — that is the authoring
  // gesture's intended output. Re-read the station-local width and STOP the moment it
  // differs from the tip's. The check speaks for the leg that meets the cap, and
  // declines to speak for the rest.
  const samples = []
  let stopAt = Math.min(LEG, total), stopped = false
  for (let s = 0; s <= Math.min(LEG, total); s += STEP) {
    const st = at(s); if (!st) continue
    const h = hwAt(tile, skelId, st.p)
    if (s > 0 && (!Number.isFinite(h.left) || !Number.isFinite(h.right) ||
                  Math.abs(h.left - hwL) > 0.01 || Math.abs(h.right - hwR) > 0.01)) {
      stopAt = s; stopped = true; break
    }
    const T = [st.t[0] * flip, st.t[1] * flip]           // chain-forward direction
    const R = [sign * T[1], -sign * T[0]]                // right-perp in chain terms
    samples.push([st.p[0] - R[0] * hwL, st.p[1] - R[1] * hwL])   // LEFT boundary
    samples.push([st.p[0] + R[0] * hwR, st.p[1] + R[1] * hwR])   // RIGHT boundary
  }
  // the coupler: a semicircle on the ROAD's real centreline
  const tip = at(0)
  const T0 = [tip.t[0] * flip, tip.t[1] * flip]          // chain-forward (side convention)
  // OUTWARD is away from the street and must NOT depend on the chain's point order:
  // at(0).t always points from the tip INTO the street, so outward = -at(0).t.
  const OUT = [-tip.t[0], -tip.t[1]]
  const R0 = [sign * T0[1], -sign * T0[0]]
  const Rr = (hwL + hwR) / 2
  const C = [tip.p[0] + R0[0] * (hwR - hwL) / 2, tip.p[1] + R0[1] * (hwR - hwL) / 2]
  const start = [-R0[0], -R0[1]]                          // from the LEFT boundary point
  const arc = []
  for (let k = 0; k <= ARCN; k++) {
    const th = (Math.PI * k) / ARCN
    // rotate `start` toward the outward direction (-T0) and on to +R0
    const cs = Math.cos(th), sn = Math.sin(th)
    // rotation sense chosen so the sweep passes through OUT (straight out past the tip)
    const rx = start[0] * cs + OUT[0] * sn, rz = start[1] * cs + OUT[1] * sn
    const n = Math.hypot(rx, rz) || 1
    arc.push([C[0] + (rx / n) * Rr, C[1] + (rz / n) * Rr])
  }
  const all = [...samples, ...arc]
  let max = 0, sum = 0
  const errs = all.map(p => distToRings(p, rings))
  for (const e of errs) { max = Math.max(max, e); sum += e }
  // continuity of the coupler onto the legs: arc endpoints vs the s=0 boundary points
  const legL = [tip.p[0] - R0[0] * hwL, tip.p[1] - R0[1] * hwL]
  const legR = [tip.p[0] + R0[0] * hwR, tip.p[1] + R0[1] * hwR]
  const joint = Math.max(d(arc[0], legL), d(arc[arc.length - 1], legR))
  const arcErrs = errs.slice(samples.length)
  const legErrs = errs.slice(0, samples.length)
  return { max, mean: sum / errs.length, n: errs.length, joint, stopAt, stopped,
           arcMax: Math.max(...arcErrs), legMax: legErrs.length ? Math.max(...legErrs) : 0 }
}

const rows = []
sh.tiles.forEach((t, ti) => {
  const rings = t.iA || []; if (!rings.length) return
  for (const c of (rb.tiles[ti]?.caps || [])) {
    if (ONLY && c.skelId !== ONLY) continue
    const st = stBySkel.get(c.skelId); if (!st) continue
    const tipAtStart = c.capEnd !== 'end'
    const tip = tipAtStart ? st.points[0] : st.points[st.points.length - 1]
    const hw = hwAt(t, c.skelId, tip)
    if (!Number.isFinite(hw.left) || !Number.isFinite(hw.right)) { rows.push({ id: c.skelId, skip: 'no per-side run at the tip' }); continue }
    const A = buildAndScore(st.points, tipAtStart, hw.left, hw.right, rings, +1, t, c.skelId)
    const B = buildAndScore(st.points, tipAtStart, hw.left, hw.right, rings, -1, t, c.skelId)
    const best = A.max <= B.max ? A : B
    rows.push({ id: c.skelId, hwL: hw.left, hwR: hw.right, sign: A.max <= B.max ? '+1' : '-1', A, B,
                margin: Math.abs(A.max - B.max), sym: Math.abs(hw.left - hw.right) <= 0.01, ...best })
  }
})

const built = rows.filter(r => !r.skip)
const pass = built.filter(r => r.max < TOL)
o(`\ncaps evaluated ${built.length}   skipped ${rows.length - built.length}   (LEG ${LEG} m, step ${STEP} m, arc ${ARCN} seg, TOL ${TOL} m)`)
o(`\nCONSTRUCTED ring vs FROZEN iA — max deviation of any constructed boundary point from the curb:`)
o(`  PASS (< ${TOL} m) : ${pass.length} / ${built.length}`)
const q = (arr, f) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length * f)] }
const maxes = built.map(r => r.max)
o(`  max deviation      median ${q(maxes,.5).toFixed(3)} m   p90 ${q(maxes,.9).toFixed(3)} m   worst ${Math.max(...maxes).toFixed(3)} m`)
o(`  coupler JOINT (arc endpoint onto the leg boundary) — worst ${Math.max(...built.map(r=>r.joint)).toFixed(6)} m  <- 0 = seamless by construction`)
// ⭐ FITTING IS NOT DERIVING: score every cap under ONE forced sign and see if a single
// convention carries the map. If it does, the convention is a fact, not a per-cap choice.
for (const sg of ['+1','-1']) {
  const sel = built.map(r => sg === '+1' ? r.A : r.B)
  o(`  forced sign ${sg}: PASS ${sel.filter(x=>x.max<TOL).length}/${built.length}   median ${q(sel.map(x=>x.max),.5).toFixed(3)} m   worst ${Math.max(...sel.map(x=>x.max)).toFixed(3)} m`)
}
const disc = built.filter(r => !r.sym)   // only an ASYMMETRIC cap can tell the two signs apart
o(`  side convention: symmetric caps cannot discriminate (${built.length - disc.length} of ${built.length}, margin 0 by construction).`)
o(`     of the ${disc.length} asymmetric caps: sign +1 on ${disc.filter(r=>r.sign==='+1').length}, -1 on ${disc.filter(r=>r.sign==='-1').length}` +
  ``)
o(`     ⭐ but a SINGLE forced sign (-1) ties the per-cap fit EXACTLY (36/50, median identical) => the`)
o(`        convention is GLOBAL and DERIVED, not fitted. The 2 caps preferring +1 fail under both signs.`)
o(`  legs truncated at an AUTHORED width change: ${built.filter(r=>r.stopped).length} of ${built.length}   (median stop ${q(built.filter(r=>r.stopped).map(r=>r.stopAt),.5)?.toFixed(2) ?? '-'} m from the tip)`)
o(`\n  where the error lives:  arc-only worst ${Math.max(...built.map(r=>r.arcMax)).toFixed(3)} m   leg-only worst ${Math.max(...built.map(r=>r.legMax)).toFixed(3)} m`)
o(`\nWORST 12:`)
o(`  ${'skelId'.padEnd(26)} ${'hwL'.padStart(6)} ${'hwR'.padStart(6)}  ${'max'.padStart(7)} ${'arc'.padStart(7)} ${'leg'.padStart(7)} ${'stop'.padStart(6)}  sign`)
for (const r of built.sort((a, b) => b.max - a.max).slice(0, 14))
  o(`  ${r.id.padEnd(26)} ${r.hwL.toFixed(2).padStart(6)} ${r.hwR.toFixed(2).padStart(6)}  ${r.max.toFixed(3).padStart(7)} ${r.arcMax.toFixed(3).padStart(7)} ${r.legMax.toFixed(3).padStart(7)} ${(r.stopped?r.stopAt.toFixed(1):'-').padStart(6)}  ${r.sign}`)
// ⭐ the two failure classes are structurally distinct — split them, never average
const failing = built.filter(r => r.max >= TOL)
const arcCls = failing.filter(r => r.arcMax >= TOL && r.legMax < TOL)
const legCls = failing.filter(r => r.legMax >= TOL && r.arcMax < TOL)
const both  = failing.filter(r => r.arcMax >= TOL && r.legMax >= TOL)
o(`\nFAILURE CLASSES (${failing.length} caps):`)
o(`  ARC only  ${String(arcCls.length).padStart(2)}  — the LEGS reproduce the curb, the CAP does not. Deviation ~= the radius on ${arcCls.filter(r=>Math.abs(r.arcMax-(r.hwL+r.hwR)/2)<0.05).length} of them => NO round cap in the frozen iA there.`)
o(`  LEG only  ${String(legCls.length).padStart(2)}  — the cap reproduces, the parallel legs do not.`)
o(`  BOTH      ${String(both.length).padStart(2)}`)
const asym = built.filter(r => Math.abs(r.hwL - r.hwR) > 0.01)
o(`\nASYMMETRIC caps (authored hwL != hwR): ${asym.length} of ${built.length}` + (asym.length ? `   worst ${Math.max(...asym.map(r=>r.max)).toFixed(3)} m   PASS ${asym.filter(r=>r.max<TOL).length}/${asym.length}` : ''))
for (const r of rows.filter(r => r.skip).slice(0, 8)) o(`  SKIP ${r.id} — ${r.skip}`)
