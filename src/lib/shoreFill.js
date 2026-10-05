/**
 * shoreFill.js — the shore median's fill as geometry: a pure module (no React, no vite), so a check imports exactly
 * what the map draws.
 *
 * ⭐ THE FILL IS THE TOWN'S OWN SAND (Jacob, 2026-10-04: "supposed to meet with sand, not 'yellow'"). This module builds
 * only the SHAPE; `BakedGround` draws it with the bed group's own surface material — the same generator, ramp, texture
 * and light as the sand it meets — so there is no colour here to drift from it. (A flat vertex colour copied from the
 * bed's hex read yellow beside the bed, because the bed is not drawn in its hex: it goes through the sand generator.)
 *
 * Each station whose median is known gets a strip from the drawn shoreline to the median's other end, at the LIDAR's
 * heights (`h`, `he` — `cartograph/bake-shore-median.mjs`). Filled: 'seaward' · 'landward' · 'drawn-water-dry' (to the
 * drawn water's far edge) · 'lidar-ends' (to the last lidar value). NOT filled, and printed by the bake: 'no-waterline'
 * · 'no-lidar'. Neighbouring stations whose far ends lie more than one terrain grid step apart are not one strip: the
 * fill breaks there and counts it.
 */
export const FILLED = ['seaward', 'landward', 'drawn-water-dry', 'lidar-ends']

/** Pure: the artifact → positions (metres, raw heights above the datum) and what was filled. Exported for checks. */
export function shoreFillBuffers(doc) {
  if (!doc || doc.version !== 1) throw new Error(`ShoreFill: unsupported shore-median.json version ${doc && doc.version}`)
  const joinM = doc.gridM
  if (!(joinM > 0)) throw new Error('ShoreFill: shore-median.json carries no gridM')
  const filled = new Set(FILLED.map(k => doc.kinds.indexOf(k)))
  if (filled.has(-1)) throw new Error(`ShoreFill: shore-median.json is missing a kind it should name (${FILLED.join(', ')})`)
  const p = []
  let filledM = 0, brokenM = 0
  for (const f of doc.faces) {
    if (!Array.isArray(f.he)) throw new Error('ShoreFill: shore-median.json has no `he` — re-bake the median (bake-shore-median.mjs)')
    const ok = (i) => filled.has(f.k[i]) && f.w[i] > 0 && Number.isFinite(f.h[i]) && Number.isFinite(f.he[i])
    for (let i = 0; i + 1 < f.xs.length; i++) {
      const segM = Math.hypot(f.xs[i + 1] - f.xs[i], f.zs[i + 1] - f.zs[i])
      if (!ok(i) || !ok(i + 1)) continue
      if (Math.hypot(f.ex[i + 1] - f.ex[i], f.ez[i + 1] - f.ez[i]) > joinM) { brokenM += segM; continue }
      const a = [f.xs[i], f.h[i], f.zs[i]], b = [f.xs[i + 1], f.h[i + 1], f.zs[i + 1]]
      const e = [f.ex[i], f.he[i], f.ez[i]], q = [f.ex[i + 1], f.he[i + 1], f.ez[i + 1]]
      p.push(...a, ...b, ...q, ...a, ...q, ...e)
      filledM += segM
    }
  }
  return { p, filledM, brokenM }
}
