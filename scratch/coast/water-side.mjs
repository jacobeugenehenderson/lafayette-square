// water-side.mjs — WHAT THE GROUND DOES ON THE WATER SIDE OF THE LIDAR COAST. READ-ONLY.
// Every 1 m along clean/coast.json's arcs: the terrain raw (the slab's terrain part, metres above zero) at offsets
// across the line, on the water side and the land side, against the town's HIGH and LOW (waterLevel.mjs). The
// water side is the side inside coast.json's water (even-odd over outers + holes), never a winding guess.
// Prints: the step at the line (high − ground 1 m water-side), the run from the line to LOW, and the slope.
// Stations outside the town's disc are skipped (the terrain stops at radius + buffer and clamps past it).
// Usage: CARTOGRAPH_TERRAIN_DIR=<scratch terrain> node scratch/coast/water-side.mjs <scene>
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadSceneTerrain } from '../../cartograph/terrainLoad.js'
import { waterLevels } from '../../cartograph/waterLevel.mjs'
import { COAST_FILE } from '../../cartograph/coastFile.mjs'

const scene = process.argv[2]
const root = new URL('../../', import.meta.url).pathname
const coast = JSON.parse(readFileSync(join(root, 'cartograph/data', scene, 'clean', COAST_FILE)))
const T = loadSceneTerrain(scene); if (!T) throw new Error(`${scene}: no terrain`)
const raw = T.getElevationRaw, L = waterLevels(T.water)
const disc = JSON.parse(readFileSync(join(root, 'cartograph/data', scene, 'neighborhood_boundary.json')))   // the drawn disc: the terrain clamps past its extent
const inDisc = (x, z) => Math.hypot(x - disc.center[0], z - disc.center[1]) <= disc.radius
const rings = coast.water.flatMap(b => [b.outer, ...(b.holes || [])])
const inWater = (x, z) => { let c = false
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j]
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c }
  return c }
const OFF = [0.5, 1, 2, 5, 10, 20, 40]
const q = (a, p) => a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN
const st = { n: 0, outside: 0, noSide: 0, stepAt1: [], landAt1: [], runToLow: [], neverLow: 0, aboveHigh1: 0 }
for (const arc of coast.arcs) for (let i = 0; i + 1 < arc.length; i++) {
  const [a, b] = [arc[i], arc[i + 1]], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!(len > 0)) continue
  const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len, nx = -uz, nz = ux
  for (let s = 0; s < len; s += 1) {
    const x = a[0] + ux * s, z = a[1] + uz * s
    if (!inDisc(x, z)) { st.outside++; continue }
    const wl = inWater(x + nx * 0.5, z + nz * 0.5), wr = inWater(x - nx * 0.5, z - nz * 0.5)
    if (wl === wr) { st.noSide++; continue }
    const sx = wl ? nx : -nx, sz = wl ? nz : -nz
    const hi = L.highAt(x, z), lo = L.lowAt(x, z)
    st.n++
    const w1 = raw(x + sx, z + sz), l1 = raw(x - sx, z - sz)
    st.stepAt1.push(hi - w1); st.landAt1.push(l1 - hi)
    if (w1 > hi) st.aboveHigh1++
    let run = null
    for (const d of OFF) if (raw(x + sx * d, z + sz * d) <= lo) { run = d; break }
    if (run == null) st.neverLow++; else st.runToLow.push(run)
  }
}
for (const k of ['stepAt1', 'landAt1', 'runToLow']) st[k].sort((p, r) => p - r)
const f = (v) => Number.isFinite(v) ? v.toFixed(3) : '—'
console.log(`${scene}: ${st.n} stations (1 m) on ${coast.arcs.length} arcs · ${st.outside} outside the disc · ${st.noSide} with water on both sides or neither (skipped)`)
console.log(`  levels: ${L.lowName} ${L.range.low.map(f).join('…')} · ${L.highName} ${L.range.high.map(f).join('…')} m above zero (baseElev ${T.baseElev})`)
console.log(`  step at the line (HIGH − ground 1 m water-side): p10 ${f(q(st.stepAt1, .1))} · p50 ${f(q(st.stepAt1, .5))} · p90 ${f(q(st.stepAt1, .9))} · p99 ${f(q(st.stepAt1, .99))} m · ${st.aboveHigh1} stations where the water side stands ABOVE high`)
console.log(`  land 1 m inland above HIGH: p10 ${f(q(st.landAt1, .1))} · p50 ${f(q(st.landAt1, .5))} · p90 ${f(q(st.landAt1, .9))} m`)
console.log(`  run from the line to LOW (first of ${OFF.join('/')} m at or below it): p10 ${f(q(st.runToLow, .1))} · p50 ${f(q(st.runToLow, .5))} · p90 ${f(q(st.runToLow, .9))} m · ${st.neverLow} stations never reach LOW within ${OFF.at(-1)} m`)
