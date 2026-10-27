/**
 * shoreStamp.mjs — the field meets ①'s coast at HIGH (BRIEF-the-shore-is-one-line §3 step 2b). A pure function, so
 * bake-terrain runs it and checks/claims-the-shore-meets-the-field-at-high.mjs exercises it, the same code.
 */
import { waterLevels as levelsOf } from './waterLevel.mjs'

// ⭐⭐ THE STAMP (BRIEF-the-shore-is-one-line §3 step 2b; Jacob 2026-10-25: ①'s coast IS the high-water mark; Zob's rule).
// The shore on screen is where the water sheet (at the level) meets this field by depth test, so the field is made to meet
// ①'s line at HIGH: at the corner nodes of every grid cell ①'s coast crosses, h − HIGH = s·d, with d the node's SIGNED
// distance to the crossing segment (+ landward) and s ONE slope per ring. Bilinear interpolation reproduces a linear
// function, so the HIGH contour lies ON ①'s line along every straight stretch (to a cell at a vertex). Landward the field
// is only ever RAISED (max: a bluff or a seawall above HIGH stands, and there the contour sits within one cell seaward of
// the line, measured by the gate); seaward, at those nodes, it is the ramp. On a tidal town the seaward ramp continues two
// cells into the water, so the tide between LOW and HIGH spans at least two cells (Zob's cap). s = the bed's own gradient two to four cells seaward (median over the ring), capped at
// (HIGH − LOW) / 2 cells where HIGH > LOW. ⛔ s ≤ 0 on a ring REFUSES by name. Land outside ①'s water is land at every
// level: nothing beyond these nodes is touched. The stamped nodes are recorded (row runs) for the contour gate.
export function stampCoast(normalized, width, height, bounds, face, bb, mask, water) {
  const L = levelsOf(water)
  const sx = (bounds.maxX - bounds.minX) / (width - 1), sz = (bounds.maxZ - bounds.minZ) / (height - 1), cell = Math.min(sx, sz)
  const X = (i) => bounds.minX + i * sx, Z = (j) => bounds.minZ + j * sz
  const onBB = (p) => [['x0', 0], ['x1', 0], ['z0', 1], ['z1', 1]].filter(([k, a]) => Math.abs(p[a] - bb[k]) < 1e-3).map(([k]) => k)
  const sameSide = (a, b) => onBB(a).some(k => onBB(b).includes(k))
  const best = new Map()                                     // node → { d (signed m), ring, crossed }
  const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)); return Math.hypot(x - a[0] - u * dx, z - a[1] - u * dz) }
  const tidal = L.range.high[1] > L.range.low[0]
  face.forEach((ring, ri) => {
    for (let m = 0; m < ring.length; m++) {
      const a = ring[m], b = ring[(m + 1) % ring.length]
      if (sameSide(a, b)) continue                           // the bb's own edge: no shore
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (cell / 2)))
      const cells = new Set()
      for (let u = 0; u <= n; u++) { const x = a[0] + (b[0] - a[0]) * u / n, z = a[1] + (b[1] - a[1]) * u / n
        cells.add(`${Math.floor((x - bounds.minX) / sx)},${Math.floor((z - bounds.minZ) / sz)}`) }
      const R2 = tidal ? 2 : 0                               // the tide's two cells, seaward
      for (const c of cells) { const [ci, cj] = c.split(',').map(Number)
        for (let dj = -R2; dj <= 1 + R2; dj++) for (let di = -R2; di <= 1 + R2; di++) {
          const i = ci + di, j = cj + dj
          if (i < 0 || j < 0 || i >= width || j >= height) continue
          const k = j * width + i, crossed = di >= 0 && di <= 1 && dj >= 0 && dj <= 1
          if (!crossed && !mask[k]) continue                 // the tide's extension is seaward only
          const dist = segD(X(i), Z(j), a, b), d = mask[k] ? -dist : dist
          const was = best.get(k)
          if (!was || dist < Math.abs(was.d)) best.set(k, { d, ri, crossed: crossed || !!was?.crossed })
          else if (crossed) was.crossed = true
        } }
    }
  })
  // one slope per ring, from the bed seaward of the stamp
  const slope = face.map(() => [])
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
    const k = j * width + i
    if (!mask[k] || best.has(k)) continue
    // the nearest stamped node within four cells tells this node's ring and distance
    let near = null
    for (let r = 2; r <= 4 && !near; r++) for (let dj = -r; dj <= r && !near; dj++) for (let di = -r; di <= r; di++) {
      const b2 = best.get((j + dj) * width + (i + di)); if (b2 && b2.crossed && j + dj >= 0 && i + di >= 0 && i + di < width && j + dj < height) { near = { ri: b2.ri, dist: Math.hypot(di * sx, dj * sz) }; break } }
    if (near && near.dist > 2 * cell) slope[near.ri].push((L.highAt(X(i), Z(j)) - normalized[k]) / near.dist)
  }
  const sOf = slope.map((v, ri) => {
    if (!v.length) return null                               // a ring the drawing barely meets: no bed beside it
    v.sort((p, q) => p - q)
    let s = v[v.length >> 1]
    const cap = tidal ? (L.range.high[1] - L.range.low[0]) / (2 * cell) : Infinity
    if (s > cap) s = cap
    if (!(s > 0)) throw new Error(`⛔ the stamp: ①'s coast ring ${ri} has a bed that does not fall seaward (median gradient ${v[v.length >> 1].toFixed(4)} over ${v.length} node(s)) — no ramp can meet it at HIGH`)
    return +s.toFixed(5)
  })
  const stamped = new Uint8Array(width * height)
  let raised = 0, kept = 0, ramped = 0
  for (const [k, b] of best) {
    const s = sOf[b.ri]; if (s == null) continue
    const i = k % width, j = (k - i) / width, H = L.highAt(X(i), Z(j)), ramp = H + s * b.d
    if (b.d >= 0) { if (ramp > normalized[k]) { normalized[k] = ramp; raised++ } else kept++ }
    else { normalized[k] = ramp; ramped++ }                  // seaward: the ramp (the tide's two cells keep its cap)
    stamped[k] = 1
  }
  const runs = []
  for (let j = 0; j < height; j++) { let i0 = -1
    for (let i = 0; i <= width; i++) { const v = i < width && stamped[j * width + i]
      if (v && i0 < 0) i0 = i; else if (!v && i0 >= 0) { runs.push(j, i0, i - 1); i0 = -1 } } }
  console.log(`  STAMP: ①'s coast at HIGH — ${stamped.reduce((t, v) => t + v, 0).toLocaleString()} node(s): ${raised.toLocaleString()} land raised to the ramp, ${kept.toLocaleString()} land kept (above it), ${ramped.toLocaleString()} water on the ramp · slope per ring ${sOf.map(v => v ?? '—').join(', ')} · cell ${cell.toFixed(2)} m${tidal ? ' · tidal: two cells of tide seaward' : ''}`)
  return { cellM: +cell.toFixed(4), slopePerRing: sOf, raised, kept, ramped, tidal, runs }
}

