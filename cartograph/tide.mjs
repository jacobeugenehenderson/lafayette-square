/**
 * tide.mjs — THE TIDE AT A TIME, from a station's harmonic constituents (BRIEF-tide).
 *
 * A tide is a sum of known harmonic constituents. NOAA CO-OPS publishes each station's (amplitude H, Greenwich
 * phase G, speed); the bake keeps those few dozen numbers (terrain.json `water.tide`) and this computes the height
 * for any date, forever, with no live API and no table of predictions in the slab. One module for the bake, the
 * checks and the player (like waterLevel.mjs).
 *
 *   h(t) = Z0 + Σ f·H·cos(V(t) + u − G)          Z0 = mean sea level above the datum (MLLW)
 *
 * V is the constituent's equilibrium argument from the mean longitudes (Schureman, "Manual of Harmonic Analysis and
 * Prediction of Tides", SP 98), u and f its nodal corrections. Each constituent is written as its multiples of
 * (T, s, h, p, p₁) plus a phase constant and a nodal rule, so its SPEED follows from the definition — and
 * ▶ node checks/claims-tide-matches-noaa.mjs holds every derived speed to NOAA's published one before it compares a
 * single height against NOAA's own predictions.
 * ⛔ A constituent NOAA publishes that is not defined here THROWS — it is never skipped: a dropped constituent is a
 * wrong tide that looks like a tide.
 *
 * ⭐ THE RULING (Jacob, 2026-09-28): *"we decide the 'high' and 'low' tides, and clamp them to the times."* The water
 * stands at the TOWN's own low and high (terrain.json `water`); NOAA gives only the TIMING — `tidePhaseClock` is 1 at
 * each predicted high, 0 at each low, a half-cosine between, so it is inside [0, 1] by construction. The Almanac's
 * high/low times come from the same `tideExtrema`: one timing source.
 * ⭐ AND KEEP THE DATA (Jacob: "in case we ever sophisticate into using it"): the record carries every constituent
 * and datum unrounded, and `tideAt` returns real heights today. Drawing the real heights later is one line where the
 * phase is read — never a re-acquisition.
 */

const D = Math.PI / 180
const norm = (a) => ((a % 360) + 360) % 360

// Mean longitudes (degrees) at Julian centuries T from 1900 Jan 0.5 (JD 2415020.0) — Schureman Table 1.
function longitudes(jc) {
  const T2 = jc * jc, T3 = T2 * jc
  return {
    s: 270.434164 + 481267.8831 * jc - 0.001133 * T2 + 0.0000019 * T3,   // moon
    h: 279.696678 + 36000.768925 * jc + 0.0003025 * T2,                   // sun
    p: 334.329556 + 4069.0340329 * jc - 0.0103217 * T2 - 0.0000125 * T3,  // lunar perigee
    N: 259.183275 - 1934.1420 * jc + 0.002078 * T2 + 0.0000022 * T3,     // lunar ascending node
    p1: 281.220844 + 1.719175 * jc + 0.000453 * T2 + 0.000003 * T3,       // solar perigee
  }
}
// Rates, degrees per hour, of the same (d/dt of the leading terms) — for the speed check.
const HOURS_PER_CENTURY = 36525 * 24
export const RATES = { T: 15, s: 481267.8831 / HOURS_PER_CENTURY, h: 36000.768925 / HOURS_PER_CENTURY, p: 4069.0340329 / HOURS_PER_CENTURY, p1: 1.719175 / HOURS_PER_CENTURY }

const OMEGA = 23.452 * D, INC = 5.145 * D   // obliquity of the ecliptic; inclination of the lunar orbit (Schureman)

/** Nodal quantities (radians) from the node's longitude N: I, ν, ξ, ν′, 2ν″, and the perigee terms for L2 / M1. */
function nodal(N, p) {
  const n = norm(N + 180) - 180                                   // (−180, 180]: ½N stays in (−90, 90)
  const I = Math.acos(Math.cos(OMEGA) * Math.cos(INC) - Math.sin(OMEGA) * Math.sin(INC) * Math.cos(n * D))
  const tHalfN = Math.tan(n * D / 2)
  const A = Math.atan(Math.cos((OMEGA - INC) / 2) / Math.cos((OMEGA + INC) / 2) * tHalfN)   // ½(N − ξ + ν)
  const B = Math.atan(Math.sin((OMEGA - INC) / 2) / Math.sin((OMEGA + INC) / 2) * tHalfN)   // ½(N − ξ − ν)
  const nu = A - B, xi = n * D - (A + B)
  const s2I = Math.sin(2 * I), sI2 = Math.sin(I) ** 2
  const nuP = Math.atan2(s2I * Math.sin(nu), s2I * Math.cos(nu) + 0.3347)
  const nuPP2 = Math.atan2(sI2 * Math.sin(2 * nu), sI2 * Math.cos(2 * nu) + 0.0727)
  const P = p * D - xi
  const tH = Math.tan(I / 2) ** 2
  const Ra = 1 / Math.sqrt(1 - 12 * tH * Math.cos(2 * P) + 36 * tH * tH)
  const R = Math.atan2(Math.sin(2 * P), 1 / (6 * tH) - Math.cos(2 * P))
  const cI = Math.cos(I), cH2 = Math.cos(I / 2) ** 2
  const Qa = 1 / Math.sqrt(0.25 + 1.5 * cI * Math.cos(2 * P) / cH2 + 2.25 * cI * cI / (cH2 * cH2))
  const Q = Math.atan2((5 * cI - 1) * Math.sin(P), (7 * cI + 1) * Math.cos(P))
  return { I, nu, xi, nuP, nuPP2, Ra, R, Qa, Q, P }
}

// Nodal rules → { f, u (degrees) } (Schureman formulas 73–79, 207, 215, 227, 235 and Table 2).
const RULE = {
  one:  () => ({ f: 1, u: 0 }),
  Mm:   (q) => ({ f: (2 / 3 - Math.sin(q.I) ** 2) / 0.5021, u: 0 }),
  Mf:   (q) => ({ f: Math.sin(q.I) ** 2 / 0.1578, u: -2 * q.xi / D }),
  O1:   (q) => ({ f: Math.sin(q.I) * Math.cos(q.I / 2) ** 2 / 0.3800, u: (2 * q.xi - q.nu) / D }),
  J1:   (q) => ({ f: Math.sin(2 * q.I) / 0.7214, u: -q.nu / D }),
  OO1:  (q) => ({ f: Math.sin(q.I) * Math.sin(q.I / 2) ** 2 / 0.0164, u: (-2 * q.xi - q.nu) / D }),
  M2:   (q) => ({ f: Math.cos(q.I / 2) ** 4 / 0.9154, u: (2 * q.xi - 2 * q.nu) / D }),
  K1:   (q) => ({ f: Math.sqrt(0.8965 * Math.sin(2 * q.I) ** 2 + 0.6001 * Math.sin(2 * q.I) * Math.cos(q.nu) + 0.1006), u: -q.nuP / D }),
  K2:   (q) => ({ f: Math.sqrt(19.0444 * Math.sin(q.I) ** 4 + 2.7702 * Math.sin(q.I) ** 2 * Math.cos(2 * q.nu) + 0.0981), u: -q.nuPP2 / D }),
  M3:   (q) => ({ f: (Math.cos(q.I / 2) ** 4 / 0.9154) ** 1.5, u: (3 * q.xi - 3 * q.nu) / D }),
  L2:   (q) => ({ f: RULE.M2(q).f / q.Ra, u: (2 * q.xi - 2 * q.nu - q.R) / D }),
  // NOAA's M1 carries the perigee in V (its speed is T − s + h + p), so Schureman's Q loses the P it contains.
  M1:   (q) => ({ f: RULE.O1(q).f / q.Qa, u: (q.xi - q.nu + q.Q - q.P) / D }),
}

// The constituents: [T, s, h, p, p1] multiples, phase constant (°), nodal rule — or a compound of others.
// Schureman Table 2 (V₀ arguments), NOAA's 37-constituent set.
const BASE = {
  M2:   [[2, -2, 2, 0, 0], 0, 'M2'],     S2:   [[2, 0, 0, 0, 0], 0, 'one'],
  N2:   [[2, -3, 2, 1, 0], 0, 'M2'],     K2:   [[2, 0, 2, 0, 0], 0, 'K2'],
  K1:   [[1, 0, 1, 0, 0], -90, 'K1'],    O1:   [[1, -2, 1, 0, 0], 90, 'O1'],
  P1:   [[1, 0, -1, 0, 0], 90, 'one'],   Q1:   [[1, -3, 1, 1, 0], 90, 'O1'],
  '2Q1': [[1, -4, 1, 2, 0], 90, 'O1'],   RHO:  [[1, -3, 3, -1, 0], 90, 'O1'],
  M1:   [[1, -1, 1, 1, 0], -90, 'M1'],   J1:   [[1, 1, 1, -1, 0], -90, 'J1'],
  OO1:  [[1, 2, 1, 0, 0], -90, 'OO1'],   S1:   [[1, 0, 0, 0, 0], 180, 'one'],
  '2N2': [[2, -4, 2, 2, 0], 0, 'M2'],    MU2:  [[2, -4, 4, 0, 0], 0, 'M2'],
  NU2:  [[2, -3, 4, -1, 0], 0, 'M2'],    LAM2: [[2, -1, 0, 1, 0], 180, 'M2'],
  L2:   [[2, -1, 2, -1, 0], 180, 'L2'],  T2:   [[2, 0, -1, 0, 1], 0, 'one'],
  R2:   [[2, 0, 1, 0, -1], 180, 'one'],  '2SM2': [[2, 2, -2, 0, 0], 0, 'M2', true],
  M3:   [[3, -3, 3, 0, 0], 0, 'M3'],
  MM:   [[0, 1, 0, -1, 0], 0, 'Mm'],     MF:   [[0, 2, 0, 0, 0], 0, 'Mf'],
  MSF:  [[0, 2, -2, 0, 0], 0, 'M2', true],
  SA:   [[0, 0, 1, 0, 0], 0, 'one'],     SSA:  [[0, 0, 2, 0, 0], 0, 'one'],
}
// Compounds: sums of base constituents (their V, u add; their f multiply). A negative count subtracts.
const COMPOUND = {
  M4: { M2: 2 }, M6: { M2: 3 }, M8: { M2: 4 }, S4: { S2: 2 }, S6: { S2: 3 },
  MN4: { M2: 1, N2: 1 }, MS4: { M2: 1, S2: 1 }, MK3: { M2: 1, K1: 1 }, '2MK3': { M2: 2, K1: -1 },
}

function vOf(coef, phase, a) {
  const [cT, cs, ch, cp, cp1] = coef
  return cT * a.T + cs * a.s + ch * a.h + cp * a.p + cp1 * a.p1 + phase
}

/** Every constituent's { V (°), u (°), f } at one instant. `names` limits the work to a station's set. */
function argumentsAt(date, names) {
  const jd = date.getTime() / 86400000 + 2440587.5
  const L = longitudes((jd - 2415020.0) / 36525)
  const hoursUT = ((date.getTime() / 3600000) % 24 + 24) % 24
  const a = { T: 180 + 15 * hoursUT, s: L.s, h: L.h, p: L.p, p1: L.p1 }
  const q = nodal(L.N, L.p)
  const base = (name) => {
    const [coef, phase, rule, sunBeforeMoon] = BASE[name]
    const fu = RULE[rule](q)
    // 2SM2 and MSF are the solar/lunar DIFFERENCE: the M2 nodal terms enter with the opposite sign.
    return { V: vOf(coef, phase, a), u: sunBeforeMoon ? -fu.u : fu.u, f: fu.f }
  }
  const out = {}
  for (const n of names) {
    if (BASE[n]) { out[n] = base(n); continue }
    const c = COMPOUND[n]
    if (!c) throw new Error(`[tide] ⛔ constituent "${n}" is not defined here — it would be dropped from the tide. Define it (Schureman Table 2).`)
    let V = 0, u = 0, f = 1
    for (const [b, k] of Object.entries(c)) { const x = base(b); V += k * x.V; u += k * x.u; f *= x.f ** Math.abs(k) }
    out[n] = { V, u, f }
  }
  return out
}

/** A constituent's speed (°/hour), from its definition — never from NOAA's table. */
export function speedOf(name) {
  const sp = (coef) => coef[0] * RATES.T + coef[1] * RATES.s + coef[2] * RATES.h + coef[3] * RATES.p + coef[4] * RATES.p1
  if (BASE[name]) return sp(BASE[name][0])
  const c = COMPOUND[name]
  if (!c) throw new Error(`[tide] ⛔ constituent "${name}" is not defined here`)
  return Object.entries(c).reduce((a, [b, k]) => a + k * sp(BASE[b][0]), 0)
}

/**
 * The tide record's height above its datum at `date`, metres.
 * @param tide  { datum, mslAboveDatumM, constituents: [{ name, amplitudeM, phaseGMT }] } — terrain.json `water.tide`
 */
export function tideAt(tide, date) {
  const cs = (tide?.constituents || []).filter((c) => c.amplitudeM > 0)
  if (!Number.isFinite(tide?.mslAboveDatumM) || !cs.length) throw new Error('[tide] ⛔ the record has no mean sea level or no constituents — no tide can be computed')
  const args = argumentsAt(date, cs.map((c) => c.name))
  let h = tide.mslAboveDatumM
  for (const c of cs) { const g = args[c.name]; h += g.f * c.amplitudeM * Math.cos((g.V + g.u - c.phaseGMT) * D) }
  return h
}

/**
 * The highs and lows in a window, for the Almanac: [{ at: Date, heightM, kind: 'high'|'low' }].
 * Sampled every `stepMin` minutes, each turning point refined to the minute.
 */
export function tideExtrema(tide, from, hours = 36, stepMin = 6) {
  const t0 = from.getTime(), step = stepMin * 60000, n = Math.ceil(hours * 60 / stepMin)
  const hAt = (ms) => tideAt(tide, new Date(ms))
  const out = []
  let a = hAt(t0 - step), b = hAt(t0)
  for (let i = 1; i <= n; i++) {
    const c = hAt(t0 + i * step)
    if ((b - a) * (c - b) < 0) {
      let lo = t0 + (i - 2) * step, hi = t0 + i * step
      const up = b > a
      for (let k = 0; k < 20; k++) {           // golden-free ternary search for the turning point
        const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3
        if ((hAt(m1) < hAt(m2)) === up) lo = m1; else hi = m2
      }
      const at = Math.round((lo + hi) / 2 / 60000) * 60000
      if (at >= t0) out.push({ at: new Date(at), heightM: hAt(at), kind: up ? 'high' : 'low' })
    }
    a = b; b = c
  }
  return out
}

/**
 * The water's phase on NOAA's clock, at the town's own levels: a function date → [0, 1].
 * 1 at each predicted high, 0 at each predicted low, a half-cosine between adjacent extrema — never outside [0, 1],
 * and no plateau. Extrema are computed a few days at a time and reused while the date stays inside them.
 * ⛔ Two turning points of the same kind in a row would make "between a high and a low" meaningless: it throws.
 */
export function tidePhaseClock(tide, spanHours = 80) {
  let win = null
  const H = 3600000
  const load = (ms) => {
    const from = ms - 26 * H
    win = { from, to: from + spanHours * H, ext: tideExtrema(tide, new Date(from), spanHours) }
  }
  return (date) => {
    const ms = date.getTime()
    if (!win || ms < win.from + 14 * H || ms > win.to - 14 * H) load(ms)
    const e = win.ext
    let i = e.length - 2
    while (i > 0 && e[i].at.getTime() > ms) i--
    const a = e[i], b = e[i + 1]
    if (!a || !b || a.at.getTime() > ms || b.at.getTime() < ms) throw new Error(`[tide] ⛔ no turning points around ${date.toISOString()}`)
    if (a.kind === b.kind) throw new Error(`[tide] ⛔ two ${a.kind}s in a row (${a.at.toISOString()}, ${b.at.toISOString()}) — the phase cannot be timed`)
    const f = (ms - a.at.getTime()) / (b.at.getTime() - a.at.getTime())
    const c = Math.cos(Math.PI * f)
    return a.kind === 'high' ? 0.5 * (1 + c) : 0.5 * (1 - c)
  }
}
