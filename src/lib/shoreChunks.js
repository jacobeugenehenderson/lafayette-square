/**
 * shoreChunks.js — THE STONES ARE A FUNCTION OF POSITION, NOT A LIST.
 *
 * ⭐ Promoted out of `src/harness/boulders/` 2026-09-23 when the revetment was
 * installed in the map. ⛔ It was never harness-specific — every input is a
 * parameter — and the alternative was a second copy in the player, which is the
 * one thing this project will not have: one painter, not two that agree today.
 *
 * ⭐⭐ WHY: Jacob, 2026-09-21 — *"we build everything anticipating that if it looks
 * nice we'll get close to it to show it off sometimes."* ⇒ "it is only seen from
 * far" is not an available argument, the close read decides, and the stones are
 * required. But a stored transform list for 26.22 km of shore is ~432,000 stones
 * and ~33 MB of slab. ⭐ It does not have to be stored: placement that is a
 * deterministic function of world position costs ZERO slab bytes — the slab keeps
 * the drape (the bed) and a seed, and the player generates the stone it can see.
 *
 * ⛔⛔ AND THE HARD PART IS THE SETTLE, WHICH IS ORDER-DEPENDENT BY CONSTRUCTION.
 * `heap.js` sorts every stone low-to-high and drops each against the ones already
 * placed — that is global. Chunked generation has to reproduce it LOCALLY and
 * IDENTICALLY from either side of a boundary, or stones pop, overlap and seam as
 * the camera moves. ▶ `verifySeams()` below is the falsifiable test and it was
 * written BEFORE anything rendered.
 *
 * ⭐ HOW DETERMINISM IS BOUGHT — two rules, both order-free:
 *   ① Candidates are generated per chunk from a hash of the CHUNK INDEX, so the
 *     same chunk yields the same candidates no matter who asks or when.
 *   ② Acceptance and settling run over the candidates of a MARGIN of neighbouring
 *     chunks, in a global priority order that is a hash of the candidate's own
 *     identity — never the order they were visited in. Two different chunks
 *     therefore process the same overlapping candidates in the same sequence.
 * ⚠️ Rule ② bounds the dependency at `margin` chunks. It is not self-evident that
 * the dependency chain STAYS inside that bound — a rejection can cascade — so the
 * margin is not argued, it is MEASURED. ▶ `verifySeams()` reports the mismatch at
 * each margin and that number is the answer.
 */

import { rng, seedAt } from './boulderGeometry.js'
import { MIN_ARMOUR_D50_M, RIPRAP_REPOSE_DEG } from '../../cartograph/shore-armour.mjs'

const TAN_REPOSE = Math.tan((RIPRAP_REPOSE_DEG * Math.PI) / 180)
const d50For = h => Math.max(MIN_ARMOUR_D50_M, Math.min(1.5, h * 0.45))

/** Chunk length along the shore, metres. ⛔ A budget, not a look: it sets how much
 *  work one camera step can trigger and how many chunks a view spans. */
export const CHUNK_M = 12

/** How many darts to throw per stone-sized disc of band area. ⛔ THE DOMINANT COST
 *  AND IT IS MEASURED, NOT GUESSED: a rejection sampler spends nearly all of its
 *  time on darts it throws away, and the window resolves five chunks, so this
 *  multiplies by five. MEASURED sweep, 12 m chunks, margin 2, seams exact at every
 *  setting: 45 → 86.3 ms/chunk & 2,907 stones/100 m · 20 → 30.4 & 2,140 ·
 *  ⭐ 10 → 15.8 & 1,686 · 5 → 12.2 & 1,295. ⭐ 10 reproduces the stored version's
 *  density (1,650 stones/100 m at the same packing) for a fifth of the time, so the
 *  45 was buying nothing but latency. */
export const DART_OVERSAMPLE = 10

const hashU32 = (a, b, c = 0) => {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b9)
  h = Math.imul(h ^ (h >>> 15), 0x2545f491)
  return (h ^ (h >>> 13)) >>> 0
}

const randQuat = (r) => {
  const u1 = r(), u2 = r(), u3 = r()
  const s1 = Math.sqrt(1 - u1), s2 = Math.sqrt(u1)
  return [s1 * Math.sin(2 * Math.PI * u2), s1 * Math.cos(2 * Math.PI * u2),
          s2 * Math.sin(2 * Math.PI * u3), s2 * Math.cos(2 * Math.PI * u3)]
}

/** Freeze the shore into something chunk indices can be computed against. */
export function shoreContext({ poly, crestAt, waterY = 0, packing = 0.62, paletteSize = 12, seed = 4242, oversample = DART_OVERSAMPLE }) {
  const segs = []
  let total = 0
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], b = poly[i]
    const L = Math.hypot(b.x - a.x, b.z - a.z)
    if (L < 1e-9) continue
    segs.push({ a, b, L, s0: total }); total += L
  }
  const at = (s) => {
    const sg = segs.find(g => s < g.s0 + g.L) || segs[segs.length - 1]
    const f = (s - sg.s0) / sg.L
    const ux = (sg.b.x - sg.a.x) / sg.L, uz = (sg.b.z - sg.a.z) / sg.L
    return { x: sg.a.x + (sg.b.x - sg.a.x) * f, z: sg.a.z + (sg.b.z - sg.a.z) * f, nx: uz, nz: -ux, t: s / total }
  }
  return { at, total, crestAt, waterY, packing, paletteSize, seed, nChunks: Math.ceil(total / CHUNK_M), _cand: new Map(), oversample }
}

/**
 * The candidates of ONE chunk — a pure function of its index. ⛔ No neighbour is
 * consulted here; that is the point. The count is fixed by the chunk's own band
 * area so density does not depend on who generated it.
 */
function candidatesOf(ctx, ci) {
  // ⭐ MEMOISED, and it is safe BECAUSE the function is pure in (ctx, ci): a window
  // of 5 chunks regenerated its neighbours' candidates every time, so the same darts
  // were thrown five times over. ⛔ The cache changes cost only — the seam verifier
  // is the proof, and it still reports 0 mismatches with the cache in place.
  const hit = ctx._cand.get(ci)
  if (hit) return hit
  const out = []
  const sA = ci * CHUNK_M, sB = Math.min(ctx.total, sA + CHUNK_M)
  if (sB <= sA) return out
  const r = rng(hashU32(ci, ctx.seed, 0x51ed))
  // Band area of this chunk, sampled — the dart budget must not depend on how many
  // neighbours happen to be loaded.
  let area = 0
  const N = 12
  for (let k = 0; k < N; k++) {
    const st = ctx.at(sA + ((sB - sA) * (k + 0.5)) / N)
    const h = ctx.crestAt(st.t)
    area += Math.hypot(h / TAN_REPOSE, h) * ((sB - sA) / N)
  }
  const dMid = d50For(ctx.crestAt(ctx.at((sA + sB) / 2).t))
  const darts = Math.ceil((area / (Math.PI * Math.pow(dMid * 0.5, 2))) * (ctx.oversample ?? DART_OVERSAMPLE))
  for (let k = 0; k < darts; k++) {
    const s = sA + r() * (sB - sA)
    const st = ctx.at(s)
    const h = ctx.crestAt(st.t)
    if (h < MIN_ARMOUR_D50_M) continue
    const run = h / TAN_REPOSE
    const len = Math.hypot(run, h) || 1
    const a = r() * len
    const up = 1 - a / len
    const d = d50For(h) * (1 - 0.45 * up) * (0.82 + r() * 0.36)
    const adx = (st.nx * run) / len, ady = -h / len, adz = (st.nz * run) / len
    out.push({
      id: (ci >>> 0) * 100000 + k,
      prio: hashU32(ci, k, ctx.seed ^ 0x7f4a),
      x: st.x + adx * a, y: ctx.waterY + h + ady * a, z: st.z + adz * a,
      d, up, rad: d * 0.5 * ctx.packing,
    })
  }
  ctx._cand.set(ci, out)
  return out
}

/**
 * Generate the stones that BELONG to chunk `ci`, using `margin` chunks of context
 * on each side. ⭐ Returns only the ones inside `ci`, but computes them exactly as
 * chunk `ci±1` would, because the priority order is global.
 */
export function chunkStones(ctx, ci, margin = 2) {
  const lo = ci * 100000, hi = lo + 100000
  return resolveWindow(ctx, ci, margin).filter(st => st.id >= lo && st.id < hi)
}

/**
 * Resolve EVERY stone a window centred on `center` produces. ⛔ The verifier needs
 * this, and needing it is the whole reason the first verifier was worthless: it
 * re-centred the window on the chunk it was checking, so it compared a computation
 * with itself and printed a perfect score. ⭐ A passing check proves nothing until
 * it has been seen to FAIL — this one is mutation-tested by breaking the priority
 * sort, which must turn it red.
 */
export function resolveWindow(ctx, center, margin = 2) {
  const ci = center
  const pool = []
  for (let c = ci - margin; c <= ci + margin; c++) {
    if (c < 0 || c >= ctx.nChunks) continue
    for (const q of candidatesOf(ctx, c)) pool.push(q)
  }
  // ⛔ ORDER IS BY PRIORITY HASH, NEVER BY VISIT ORDER. This is the whole trick: the
  // sequence a candidate is judged in must not depend on which chunk asked.
  pool.sort((A, B) => (A.prio - B.prio) || (A.id - B.id))

  const cell = 1.2
  const grid = new Map()
  const key = (x, z) => Math.floor(x / cell) * 73856093 ^ Math.floor(z / cell) * 19349663
  const neigh = (x, z, rad) => {
    const res = []
    const c = Math.ceil(rad / cell)
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell)
    for (let i = -c; i <= c; i++) for (let j = -c; j <= c; j++) {
      const arr = grid.get(key((cx + i) * cell, (cz + j) * cell))
      if (arr) for (const p of arr) res.push(p)
    }
    return res
  }
  const put = (p) => {
    const k = key(p.x, p.z)
    if (!grid.has(k)) grid.set(k, [])
    grid.get(k).push(p)
  }

  const accepted = []
  for (const q of pool) {
    let ok = true
    for (const p of neigh(q.x, q.z, q.rad + 1.6)) {
      const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z
      if (dx * dx + dy * dy + dz * dz < Math.pow(q.rad + p.rad, 2)) { ok = false; break }
    }
    if (!ok) continue
    accepted.push(q); put(q)
  }

  // ⭐ SETTLE, in a deterministic order that is NOT "as generated": low-to-high, ties
  // broken by priority. Every loaded chunk sees the same sequence over the same
  // overlapping set, so a stone near a boundary settles onto the same neighbours.
  accepted.sort((A, B) => (A.y - B.y) || (A.prio - B.prio))
  const sGrid = new Map()
  const sPut = (p) => {
    const k = key(p.x, p.z)
    if (!sGrid.has(k)) sGrid.set(k, [])
    sGrid.get(k).push(p)
  }
  for (const p of accepted) {
    let rest = p.y - p.rad * 0.55
    const c = Math.ceil((p.rad + 1.6) / cell)
    const cx = Math.floor(p.x / cell), cz = Math.floor(p.z / cell)
    for (let i = -c; i <= c; i++) for (let j = -c; j <= c; j++) {
      const arr = sGrid.get(key((cx + i) * cell, (cz + j) * cell))
      if (!arr) continue
      for (const q of arr) {
        const dx = p.x - q.x, dz = p.z - q.z
        const sep = (p.rad + q.rad) * 0.92
        const h2 = sep * sep - (dx * dx + dz * dz)
        if (h2 > 0) rest = Math.max(rest, q.y + Math.sqrt(h2))
      }
    }
    p.ry = Math.min(p.y, rest)
    sPut({ ...p, y: p.ry })
  }

  return accepted.map(p => {
    const rr = rng(seedAt(p.x, p.z, 17))
    const sv = () => p.d * (0.80 + rr() * 0.40)
    return {
      id: p.id,
      p: [p.x, p.ry, p.z],
      q: randQuat(rr),
      s: [sv(), sv() * 0.82, sv()],
      i: Math.floor(rr() * ctx.paletteSize) % ctx.paletteSize,
      c: (() => { const g = 0.30 + 0.30 * p.up + (rr() - 0.5) * 0.10; return [g, g * (0.97 + rr() * 0.06), g * (0.93 + rr() * 0.06)] })(),
    }
  })
}

/**
 * ⭐⭐ THE FALSIFIABLE TEST, AND IT WAS BUILT FIRST. For every chunk, recompute its
 * stones as its NEIGHBOUR would — i.e. from a window centred one chunk over — and
 * assert every stone lands in the same place. ⛔ A mismatch is a pop or a seam as
 * the camera moves; there is no threshold at which it is acceptable, so the output
 * is a count, not a score.
 */
export function verifySeams(ctx, margin) {
  let checked = 0, missing = 0, moved = 0, maxDelta = 0
  for (let ci = 1; ci < ctx.nChunks - 1; ci++) {
    const lo = ci * 100000, hi = lo + 100000
    // ⭐ TWO GENUINELY DIFFERENT WINDOWS. One centred on the chunk itself, one
    // centred on its neighbour — which is what the player would be running when the
    // camera is one chunk over. The same stones must come out of both.
    const mine = resolveWindow(ctx, ci, margin).filter(st => st.id >= lo && st.id < hi)
    const theirs = new Map()
    for (const st of resolveWindow(ctx, ci + 1, margin)) if (st.id >= lo && st.id < hi) theirs.set(st.id, st)
    for (const st of mine) {
      checked++
      const other = theirs.get(st.id)
      if (!other) { missing++; continue }
      const delta = Math.hypot(st.p[0] - other.p[0], st.p[1] - other.p[1], st.p[2] - other.p[2])
      maxDelta = Math.max(maxDelta, delta)
      if (delta > 1e-9) moved++
    }
  }
  return { margin, checked, missing, moved, maxDelta }
}
