/**
 * shoreFill.js — the shore median's fill as geometry: a pure module (no React, no vite), so a check imports exactly
 * what the map draws. The component is `src/components/ShoreFill.jsx`; the rules are in its header.
 */
import * as THREE from 'three'
import { REVETMENT_STONE_COLOR } from '../components/revetmentMaterial.js'
import { SURFACES } from '../../cartograph/surfaces.mjs'
import { slopeDeg, grainFromSlope } from '../../cartograph/shoreGrain.mjs'

export const FILLED = ['seaward', 'landward', 'drawn-water-dry', 'lidar-ends']

/** The ramp's colour at t, linear between its stops. */
function rampAt(stops, t) {
  if (!Array.isArray(stops) || !stops.length) throw new Error('ShoreFill: the sand ramp has no stops')
  let a = stops[0], b = stops[stops.length - 1]
  for (let i = 1; i < stops.length; i++) if (stops[i].t >= t) { a = stops[i - 1]; b = stops[i]; break }
  const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0
  return new THREE.Color(a.color).lerp(new THREE.Color(b.color), Math.max(0, Math.min(1, k)))
}

/** Pure: the artifact → position/colour arrays (metres, raw heights) and what was filled. Exported for checks. */
export function shoreFillBuffers(doc) {
  if (!doc || doc.version !== 1) throw new Error(`ShoreFill: unsupported shore-median.json version ${doc && doc.version}`)
  const joinM = doc.gridM
  if (!(joinM > 0)) throw new Error('ShoreFill: shore-median.json carries no gridM')
  const sand = rampAt(SURFACES.sand.params.sandRamp.default, 0.5)
  const stone = new THREE.Color(REVETMENT_STONE_COLOR)
  const filled = new Set(FILLED.map(k => doc.kinds.indexOf(k)))
  if (filled.has(-1)) throw new Error(`ShoreFill: shore-median.json is missing a kind it should name (${FILLED.join(', ')})`)
  const p = [], c = []
  let filledM = 0, brokenM = 0
  for (const f of doc.faces) {
    if (!Array.isArray(f.he)) throw new Error('ShoreFill: shore-median.json has no `he` — re-bake the median (bake-shore-median.mjs)')
    const ok = (i) => filled.has(f.k[i]) && f.w[i] > 0 && Number.isFinite(f.h[i]) && Number.isFinite(f.he[i])
    for (let i = 0; i + 1 < f.xs.length; i++) {
      const segM = Math.hypot(f.xs[i + 1] - f.xs[i], f.zs[i + 1] - f.zs[i])
      if (!ok(i) || !ok(i + 1)) continue
      if (Math.hypot(f.ex[i + 1] - f.ex[i], f.ez[i + 1] - f.ez[i]) > joinM) { brokenM += segM; continue }
      const g0 = grainFromSlope(slopeDeg(f.h[i], f.he[i], f.w[i])), g1 = grainFromSlope(slopeDeg(f.h[i + 1], f.he[i + 1], f.w[i + 1]))
      const c0 = sand.clone().lerp(stone, g0), c1 = sand.clone().lerp(stone, g1)
      const a = [f.xs[i], f.h[i], f.zs[i]], b = [f.xs[i + 1], f.h[i + 1], f.zs[i + 1]]
      const e = [f.ex[i], f.he[i], f.ez[i]], q = [f.ex[i + 1], f.he[i + 1], f.ez[i + 1]]
      p.push(...a, ...b, ...q, ...a, ...q, ...e)
      for (const col of [c0, c1, sand, c0, sand, sand]) c.push(col.r, col.g, col.b)
      filledM += segM
    }
  }
  return { p, c, filledM, brokenM }
}

