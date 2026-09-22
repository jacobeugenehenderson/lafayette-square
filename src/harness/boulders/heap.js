/**
 * heap.js — A REVETMENT IS A SLOPED HEAP OF GRADED STONE, laid out from numbers
 * the ground already knows.
 *
 * ⚠️ HARNESS-LOCAL ON PURPOSE. Real placement along huron's shore is a BAKE-TIME
 * job (`BRIEF-boulder-revetment §8`, beside `bake-lamps.js`) and is explicitly
 * out of this probe's bounds. This file exists so the geometry can be LOOKED AT
 * in the arrangement it will actually be seen in — a boulder judged in isolation
 * tells you nothing about whether a revetment reads.
 *
 * ⛔ NO AUTHORED PARAMETERS. The only constants it imports are the two material
 * ones that already exist in `cartograph/shore-armour.mjs` — properties of rock,
 * not of a town. Everything else is a function of the crest height, which the
 * terrain supplies per vertex.
 *
 * ⭐⭐ THE TRAP THIS FILE EXISTS TO AVOID: evenly-spaced identical rocks read as a
 * BEADED NECKLACE, instantly, and worse than a plain grey line. `mode: 'necklace'`
 * builds exactly that, on purpose, so the two can be seen side by side.
 * Jitter, rotation, scale variance and deliberate overlap are the feature.
 */

import { rng, seedAt } from '../../lib/boulderGeometry.js'
import { MIN_ARMOUR_D50_M, RIPRAP_REPOSE_DEG } from '../../../cartograph/shore-armour.mjs'

const TAN_REPOSE = Math.tan((RIPRAP_REPOSE_DEG * Math.PI) / 180)

/** Points every `step` metres along a polyline in XZ, each carrying the outward
 *  (right-hand) normal and its arc fraction. The caller walks the shore so that
 *  the right-hand normal points at the water. */
function stations(poly, step) {
  const out = []
  const segs = []
  let total = 0
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], b = poly[i]
    const L = Math.hypot(b.x - a.x, b.z - a.z)
    if (L < 1e-9) continue
    segs.push({ a, b, L, s0: total }); total += L
  }
  for (let s = step * 0.5; s < total; s += step) {
    const sg = segs.find(g => s < g.s0 + g.L) || segs[segs.length - 1]
    const f = (s - sg.s0) / sg.L
    const ux = (sg.b.x - sg.a.x) / sg.L, uz = (sg.b.z - sg.a.z) / sg.L
    out.push({
      x: sg.a.x + (sg.b.x - sg.a.x) * f,
      z: sg.a.z + (sg.b.z - sg.a.z) * f,
      nx: uz, nz: -ux,
      t: s / total,
    })
  }
  out.total = total
  return out
}

/** Shoemake's uniform random quaternion. ⛔ Three random Euler angles are NOT
 *  uniform — they clump toward the poles, and it shows as a herd of stones
 *  sharing a tilt, which is the necklace failure wearing a disguise. */
const randQuat = (r) => {
  const u1 = r(), u2 = r(), u3 = r()
  const s1 = Math.sqrt(1 - u1), s2 = Math.sqrt(u1)
  return [s1 * Math.sin(2 * Math.PI * u2), s1 * Math.cos(2 * Math.PI * u2),
          s2 * Math.sin(2 * Math.PI * u3), s2 * Math.cos(2 * Math.PI * u3)]
}

/** Top fraction of the slope face that counts as "the crest line". */
const CREST_BAND = 0.72

const d50For = h => Math.max(MIN_ARMOUR_D50_M, Math.min(1.5, h * 0.45))

/**
 * @param poly        [{x,z}] shoreline; right-hand normal points at the water
 * @param crestAt     (arcFraction 0..1) => metres of wall above the water plane
 * @param paletteSize number of distinct geometries available
 * @param waterY      the water plane, metres
 * @param mode        'heap' (the real thing) | 'necklace' (the trap, for comparison)
 *                    | 'crest' (⭐ the HYBRID's half: stone only along the crest
 *                      line, which is where a drape's unbroken silhouette shows.
 *                      A line is not an area, so it is cheap.)
 * @param tRange      [t0,t1] fraction of the shore to cover — lets the harness put
 *                    two approaches on one shoreline for a side-by-side.
 */
export function revetmentHeap({ poly, crestAt, paletteSize, waterY = 0, mode = 'heap', packing = 0.62, tRange = [0, 1] }) {
  if (mode === 'necklace') {
    // ⛔ THE ANTI-PATTERN, BUILT DELIBERATELY: one shape, one size, one rotation,
    // even spacing, no overlap, sitting on the line. This is what a naive
    // lamp-style placement walk gives you for free.
    return stations(poly, 1.0).filter(st => st.t >= tRange[0] && st.t <= tRange[1]).map(st => ({
      p: [st.x, waterY + 0.35, st.z], q: [0, 0, 0, 1], s: [0.7, 0.7, 0.7], i: 0, c: [0.52, 0.52, 0.52],
    }))
  }

  // ── the shore, as a continuous parameterisation ──────────────────────────────
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

  const s0 = tRange[0] * total, s1 = tRange[1] * total
  const r = rng(0x9e37 ^ Math.round(s0 * 7) ^ Math.round(s1 * 13))

  // ⭐⭐ BLUE NOISE, NOT COURSES. ⛔ MEASURED FAILURE, 2026-09-21 (Jacob: *"they're
  // in obvious fakey rows"*): the previous placement walked one course at a time at
  // a fixed along-shore step, which is a LATTICE. Rotation jitter cannot hide a
  // lattice — the POSITIONS are the tell, and the eye finds a row instantly at any
  // amount of per-stone variation. Variable-radius dart throwing gives Poisson-disc
  // spacing: no row, no column, no preferred direction, and a minimum separation
  // that scales with the stone so big armour does not bury the small stuff.
  // ⛔ `packing` < 1 means the discs OVERLAP on purpose. A revetment is dumped, not
  // paved: contact is the read.
  const accepted = []
  const cellFor = (d) => Math.max(0.12, d * packing * 0.7)
  const hash = new Map()
  const key = (cx, cz) => cx * 73856093 ^ cz * 19349663
  let cellSize = 0.4
  const near = (x, z, rad) => {
    const out = []
    const c = Math.ceil(rad / cellSize)
    const cx = Math.floor(x / cellSize), cz = Math.floor(z / cellSize)
    for (let i = -c; i <= c; i++) for (let j = -c; j <= c; j++) {
      const arr = hash.get(key(cx + i, cz + j))
      if (arr) for (const p of arr) out.push(p)
    }
    return out
  }
  const insert = (p) => {
    const k = key(Math.floor(p.x / cellSize), Math.floor(p.z / cellSize))
    if (!hash.has(k)) hash.set(k, [])
    hash.get(k).push(p)
  }

  // Band geometry per station, so a stone knows how big it should be where it lands.
  const faceAt = (s) => {
    const st = at(s)
    const h = crestAt(st.t)
    const run = h / TAN_REPOSE
    return { st, h, run, len: Math.hypot(run, h) || 1 }
  }

  let bandArea = 0, discArea = 0
  const SAMPLES = 200
  for (let k = 0; k < SAMPLES; k++) bandArea += faceAt(s0 + ((s1 - s0) * k) / SAMPLES).len * ((s1 - s0) / SAMPLES)

  // Dart throwing. The attempt budget is proportional to the band's area over the
  // area of a typical stone, so a longer shore gets proportionally more darts and
  // the density does not quietly fall off with length.
  const dMid = d50For(crestAt(0.5))
  const attempts = Math.ceil((bandArea / (Math.PI * Math.pow(dMid * 0.5, 2))) * 45)
  cellSize = Math.max(0.15, dMid * 0.6)
  for (let n = 0; n < attempts; n++) {
    const s = s0 + r() * (s1 - s0)
    const F = faceAt(s)
    if (F.h < MIN_ARMOUR_D50_M) continue      // a kerb, not a revetment
    const a = r() * F.len                     // metres down the slope face from the crest
    const up = 1 - a / F.len                  // 1 at the crest … 0 at the toe
    const d50 = d50For(F.h)
    const d = d50 * (1 - 0.45 * up) * (0.82 + r() * 0.36)
    const rad = d * 0.5 * packing
    // world position on the shell
    const ux = -F.st.nz, uz = F.st.nx
    const adx = (F.st.nx * F.run) / F.len, ady = -F.h / F.len, adz = (F.st.nz * F.run) / F.len
    void ux; void uz
    const x = F.st.x + adx * a
    const y = waterY + F.h + ady * a
    const z = F.st.z + adz * a
    let ok = true
    for (const p of near(x, z, rad + 1.2)) {
      const dx = x - p.x, dz = z - p.z, dy = y - p.y
      if (dx * dx + dy * dy + dz * dz < Math.pow(rad + p.rad, 2)) { ok = false; break }
    }
    if (!ok) continue
    // ⭐ THE HYBRID'S HALF: stone only along the CREST LINE, where a continuous
    // surface's unbroken outline shows against the sky. A line is not an area, so
    // it is a small fraction of the full population — the measured question is how
    // FEW stones buy the read.
    if (mode === 'crest' && up < CREST_BAND) continue
    const pt = { x, y, z, rad, d, up, seed: seedAt(x, z, 17) }
    accepted.push(pt); insert(pt)
    discArea += Math.PI * Math.pow(d * 0.5, 2)
  }

  // ⭐ SETTLE — drop and rest. ⛔ Scatter alone still reads as scatter: what makes a
  // heap is stones RESTING ON EACH OTHER. Each stone falls along the shell normal
  // until it touches a neighbour already placed, so contacts are real rather than
  // implied by overlap. Placed low-to-high so a stone always lands on something
  // that is already settled.
  accepted.sort((A, B) => A.y - B.y)
  const settled = []
  const sHash = new Map()
  const sInsert = (p) => {
    const k = key(Math.floor(p.x / cellSize), Math.floor(p.z / cellSize))
    if (!sHash.has(k)) sHash.set(k, [])
    sHash.get(k).push(p)
  }
  for (const p of accepted) {
    let rest = p.y - p.rad * 0.55       // the shell itself, bedded in a little
    const c = Math.ceil((p.rad + 1.5) / cellSize)
    const cx = Math.floor(p.x / cellSize), cz = Math.floor(p.z / cellSize)
    for (let i = -c; i <= c; i++) for (let j = -c; j <= c; j++) {
      const arr = sHash.get(key(cx + i, cz + j))
      if (!arr) continue
      for (const q of arr) {
        const dx = p.x - q.x, dz = p.z - q.z
        const sep = (p.rad + q.rad) * 0.92        // contact allows a little interpenetration
        const h2 = sep * sep - (dx * dx + dz * dz)
        if (h2 > 0) rest = Math.max(rest, q.y + Math.sqrt(h2))
      }
    }
    p.y = Math.min(p.y, rest)
    settled.push(p); sInsert(p)
  }

  const out = settled.map(p => {
    const rr = rng(p.seed)
    const sv = () => p.d * (0.80 + rr() * 0.40)
    return {
      p: [p.x, p.y, p.z],
      q: randQuat(rr),
      s: [sv(), sv() * 0.82, sv()],
      i: Math.floor(rr() * paletteSize) % paletteSize,
      c: (() => { const g = 0.30 + 0.30 * p.up + (rr() - 0.5) * 0.10; return [g, g * (0.97 + rr() * 0.06), g * (0.93 + rr() * 0.06)] })(),
    }
  })
  // ⭐ The coverage RATIO, reported rather than assumed: disc area over band area.
  // Real dumped riprap packs at roughly 60–80% WITH overlap, so a ratio near or
  // above 1 is expected — it is not an error, it is what "dumped" means.
  out.coverage = bandArea ? discArea / bandArea : 0
  out.bandArea = bandArea
  return out
}

/** A gently meandering shoreline, ~`length` metres. Harness only.
 *  ⛔ WALKED −x SO THE RIGHT-HAND NORMAL POINTS AT +z, WHICH IS WHERE THE HARNESS
 *  PUTS THE WATER. It used to run +x, so the revetment's water side faced the BANK
 *  plane and its landward side faced the lake — invisible in every oblique view and
 *  only caught when a camera was placed deliberately at the waterline. ⭐ The walk
 *  direction IS the wet side; it is not a cosmetic choice. */
export function demoShoreline({ length = 120, seed = 7 } = {}) {
  const poly = []
  const n = 60
  for (let i = 0; i <= n; i++) {
    const t = i / n
    poly.push({ x: length / 2 - t * length, z: Math.sin(t * 5.1) * 4.5 + Math.sin(t * 11.3) * 1.3 })
  }
  return poly
}

/** huron's shore wall, as measured 2026-09-21: 0.5 m to 3.7 m tall, median ~0.45 m
 *  at the waterline rising to ~1.4 m at p90. ⛔ A HARNESS STAND-IN for the shape of
 *  that distribution — the real profile is read per vertex as terrain minus the
 *  water plane, and nothing downstream may ever read this function. */
export const huronLikeCrest = (f) =>
  0.45 + 1.15 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, f))), 1.4)
       + 1.2 * Math.max(0, Math.sin(f * 17.0) - 0.75)

export { MIN_ARMOUR_D50_M, RIPRAP_REPOSE_DEG }
