/**
 * shoreFill.js — the shore median's fill as geometry: a pure module (no React, no vite), so a check imports exactly
 * what the map draws. The component is `src/components/ShoreFill.jsx`; the rules are in its header.
 *
 * ⭐ THREE BANDS ACROSS EVERY STRIP, so it blends instead of standing out (Jacob, 2026-10-04: "we should likely design a
 * little around color as that would help blend the surfaces together, if they were closer in color"):
 *   the edge that meets LAND takes the land's own colour (the town's baked ground-colour map, sampled just beyond the
 *   edge) · the MIDDLE takes the grain's colour (the bed's sand → the revetment's stone, by the slope) · the edge that
 *   meets the drawn WATER takes the bed's colour (the town's sand under the water, `ground.json` group `bed`).
 * Which edge meets which: 'seaward' / 'drawn-water-dry' / 'lidar-ends' run from the drawn shore OUT over the water, so
 * the shoreline edge meets land and the far edge the bed; 'landward' runs from the drawn shore IN, so the shoreline
 * edge meets the bed and the far edge land.
 */
import * as THREE from 'three'
import { REVETMENT_STONE_COLOR } from '../components/revetmentMaterial.js'
import { slopeDeg, grainFromSlope } from '../../cartograph/shoreGrain.mjs'

export const FILLED = ['seaward', 'landward', 'drawn-water-dry', 'lidar-ends']

/**
 * Pure: the artifact → position/colour arrays (metres, raw heights) and what was filled. Exported for checks.
 * @param doc       shore-median.json
 * @param bedColor  the town's bed colour (ground.json group `bed`) — the sand end of the grain, and the water edge
 * @param landAt    (x, z) => THREE.Color | null — the town's ground colour there; null where the map has none
 * @param landOffM  how far beyond a land edge to sample, metres — the caller passes one-and-a-half of the colour map's
 *                  own pixels, so the sample lands on the land and not on the shore's own pixel
 */
export function shoreFillBuffers(doc, { bedColor, landAt, landOffM }) {
  if (!doc || doc.version !== 1) throw new Error(`ShoreFill: unsupported shore-median.json version ${doc && doc.version}`)
  const joinM = doc.gridM
  if (!(joinM > 0)) throw new Error('ShoreFill: shore-median.json carries no gridM')
  if (!(bedColor instanceof THREE.Color)) throw new Error('ShoreFill: no bed colour — the town\'s ground.json has no `bed` group')
  if (typeof landAt !== 'function' || !(landOffM > 0)) throw new Error('ShoreFill: no ground-colour sampler — the town has no ground.colormap.png')
  const stone = new THREE.Color(REVETMENT_STONE_COLOR)
  const filled = new Set(FILLED.map(k => doc.kinds.indexOf(k)))
  if (filled.has(-1)) throw new Error(`ShoreFill: shore-median.json is missing a kind it should name (${FILLED.join(', ')})`)
  const landward = doc.kinds.indexOf('landward')
  const p = [], c = []
  let filledM = 0, brokenM = 0, offMap = 0
  for (const f of doc.faces) {
    if (!Array.isArray(f.he)) throw new Error('ShoreFill: shore-median.json has no `he` — re-bake the median (bake-shore-median.mjs)')
    const ok = (i) => filled.has(f.k[i]) && f.w[i] > 0 && Number.isFinite(f.h[i]) && Number.isFinite(f.he[i])
    // One station's three vertices (near · middle · far) and their colours.
    const row = (i) => {
      const ux = (f.ex[i] - f.xs[i]) / f.w[i], uz = (f.ez[i] - f.zs[i]) / f.w[i]
      const grain = bedColor.clone().lerp(stone, grainFromSlope(slopeDeg(f.h[i], f.he[i], f.w[i])))
      const land = (x, z) => { const col = landAt(x, z); if (col) return col; offMap++; return grain }
      const inward = f.k[i] === landward
      const nearCol = inward ? bedColor : land(f.xs[i] - ux * landOffM, f.zs[i] - uz * landOffM)
      const farCol = inward ? land(f.ex[i] + ux * landOffM, f.ez[i] + uz * landOffM) : bedColor
      return {
        v: [[f.xs[i], f.h[i], f.zs[i]], [(f.xs[i] + f.ex[i]) / 2, (f.h[i] + f.he[i]) / 2, (f.zs[i] + f.ez[i]) / 2], [f.ex[i], f.he[i], f.ez[i]]],
        col: [nearCol, grain, farCol],
      }
    }
    for (let i = 0; i + 1 < f.xs.length; i++) {
      const segM = Math.hypot(f.xs[i + 1] - f.xs[i], f.zs[i + 1] - f.zs[i])
      if (!ok(i) || !ok(i + 1)) continue
      if (Math.hypot(f.ex[i + 1] - f.ex[i], f.ez[i + 1] - f.ez[i]) > joinM) { brokenM += segM; continue }
      const A = row(i), B = row(i + 1)
      for (let r = 0; r < 2; r++) {                                    // near→middle, then middle→far
        const quad = [[A, r], [B, r], [B, r + 1], [A, r], [B, r + 1], [A, r + 1]]
        for (const [S, k] of quad) { p.push(...S.v[k]); c.push(S.col[k].r, S.col[k].g, S.col[k].b) }
      }
      filledM += segM
    }
  }
  return { p, c, filledM, brokenM, offMap }
}
