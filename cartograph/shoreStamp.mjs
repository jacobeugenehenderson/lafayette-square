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
// is only ever RAISED (max: a bluff or a seawall above HIGH stands); seaward, at those nodes, it is the ramp, or where a
// kept landward corner rises steeper, that rise REFLECTED across the line (lowering only water), so the contour is on the
// line at a wall too. On a tidal town the ramp continues two cells into the water as max(ramp, bed): the tide spans at
// least two cells (Zob's cap) and real flats still meet the beach. A water node at or above HIGH is counted and named. s = the bed's own gradient two to four cells seaward (median over the ring), capped at
// (HIGH − LOW) / 2 cells where HIGH > LOW. ⛔ s ≤ 0 on a ring REFUSES by name. Land outside ①'s water is land at every
// level: nothing beyond these nodes is touched. The stamped nodes are recorded (row runs) for the contour gate.
export function stampCoast(normalized, width, height, bounds, face, bb, mask, water) {
  const L = levelsOf(water)
  const sx = (bounds.maxX - bounds.minX) / (width - 1), sz = (bounds.maxZ - bounds.minZ) / (height - 1), cell = Math.min(sx, sz)
  const X = (i) => bounds.minX + i * sx, Z = (j) => bounds.minZ + j * sz
  const onBB = (p) => [['x0', 0], ['x1', 0], ['z0', 1], ['z1', 1]].filter(([k, a]) => Math.abs(p[a] - bb[k]) < 1e-3).map(([k]) => k)
  const sameSide = (a, b) => onBB(a).some(k => onBB(b).includes(k))
  const best = new Map()                                     // node → { d (signed m), ring, crossed }
  const crossedCells = new Set()                             // 'ci,cj' of every cell ①'s line passes through
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
      for (const c of cells) { crossedCells.add(c); const [ci, cj] = c.split(',').map(Number)
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
    if (!v.length) {                                         // ⛔ never a bare skip: an unstamped shore is the raw contour, the defect
      const len = face[ri].reduce((t, p, m) => { const q = face[ri][(m + 1) % face[ri].length]; return sameSide(p, q) ? t : t + Math.hypot(q[0] - p[0], q[1] - p[1]) }, 0)
      throw new Error(`⛔ the stamp: ①'s coast ring ${ri} (${len.toFixed(0)} m of shore in the drawing) has no bed two to four cells seaward to take a slope from — its shore cannot be stamped`)
    }
    v.sort((p, q) => p - q)
    let s = v[v.length >> 1]
    const cap = tidal ? (L.range.high[1] - L.range.low[0]) / (2 * cell) : Infinity
    if (s > cap) s = cap
    if (!(s > 0)) throw new Error(`⛔ the stamp: ①'s coast ring ${ri} has a bed that does not fall seaward (median gradient ${v[v.length >> 1].toFixed(4)} over ${v.length} node(s)) — no ramp can meet it at HIGH`)
    return +s.toFixed(5)
  })
  const stamped = new Uint8Array(width * height)
  let raised = 0, kept = 0, ramped = 0, walled = 0, bedWon = 0
  const keptRise = new Map()                                 // landward node kept above the ramp → its rise (h − HIGH)/d
  // 1. LANDWARD, never lowered: the ramp where it is higher; where the land stands above it (a wall), the land, and its rise
  for (const [k, b] of best) {
    if (b.d < 0) continue
    const i = k % width, j = (k - i) / width, H = L.highAt(X(i), Z(j)), ramp = H + sOf[b.ri] * b.d
    if (ramp > normalized[k]) { normalized[k] = ramp; raised++ } else { kept++; if (b.d > 0) keptRise.set(k, (normalized[k] - H) / b.d) }
    stamped[k] = 1
  }
  // the wall slope a seaward node owes: the steepest kept landward corner of any crossed cell it shares (Zob, 2026-10-26)
  const wallS = new Map()
  for (const c of crossedCells) { const [ci, cj] = c.split(',').map(Number)
    const corners = [[ci, cj], [ci + 1, cj], [ci, cj + 1], [ci + 1, cj + 1]].filter(([i, j]) => i >= 0 && j >= 0 && i < width && j < height).map(([i, j]) => j * width + i)
    const sw = Math.max(0, ...corners.map(k => keptRise.get(k) ?? 0))
    if (sw > 0) for (const k of corners) if (best.get(k)?.d < 0) wallS.set(k, Math.max(wallS.get(k) || 0, sw)) }
  // 2. SEAWARD: at a crossed cell's corner, the ramp, or the wall's own reflection (no tidal cap: at a wall the waterline
  //    stays on the wall at every level); in the tide's extension, max(ramp, bed), so real flats still meet the beach
  for (const [k, b] of best) {
    if (b.d >= 0) continue
    const i = k % width, j = (k - i) / width, H = L.highAt(X(i), Z(j)), ramp = H + sOf[b.ri] * b.d
    if (b.crossed) {
      const sw = wallS.get(k)
      if (sw && H - sw * -b.d < ramp) { normalized[k] = H - sw * -b.d; walled++ } else { normalized[k] = ramp; ramped++ }
      stamped[k] = 1
    } else if (ramp > normalized[k]) { normalized[k] = ramp; ramped++; stamped[k] = 1 } else bedWon++
  }
  // ⛔ a bed standing at or above HIGH inside ①'s water is ① contradicting the lidar: counted and named, never clamped
  const above = []
  for (let k = 0; k < width * height; k++) if (mask[k] && !stamped[k] && normalized[k] >= L.highAt(X(k % width), Z((k - k % width) / width))) above.push(k)
  if (above.length) console.warn(`  ⛔ STAMP: ${above.length.toLocaleString()} node(s) of ①'s water stand at or above HIGH (① and the lidar disagree), first at ${above.slice(0, 5).map(k => `(${Math.round(X(k % width))}, ${Math.round(Z((k - k % width) / width))})`).join(' · ')}`)
  const runs = []
  for (let j = 0; j < height; j++) { let i0 = -1
    for (let i = 0; i <= width; i++) { const v = i < width && stamped[j * width + i]
      if (v && i0 < 0) i0 = i; else if (!v && i0 >= 0) { runs.push(j, i0, i - 1); i0 = -1 } } }
  console.log(`  STAMP: ①'s coast at HIGH — ${stamped.reduce((t, v) => t + v, 0).toLocaleString()} node(s): ${raised.toLocaleString()} land raised to the ramp, ${kept.toLocaleString()} land kept (above it), ${ramped.toLocaleString()} water on the ramp, ${walled.toLocaleString()} water off a wall · ${bedWon.toLocaleString()} where the bed stood higher (flats, not stamped) · ${above.length.toLocaleString()} water node(s) at or above HIGH · slope per ring ${sOf.map(v => v ?? '—').join(', ')} · cell ${cell.toFixed(2)} m${tidal ? ' · tidal: two cells of tide seaward' : ''}`)
  return { cellM: +cell.toFixed(4), slopePerRing: sOf, raised, kept, ramped, walled, bedWon, aboveHigh: above.length, tidal, runs }
}


/**
 * ⭐ THE STREET RIDES THE DECK, ITS HEIGHT (Boz's ruling, 2026-10-26; Jacob 2026-10-25 "a, the street rides the deck"). A
 * bare-earth DEM carries no deck (piers are classified out), so the deck's height is the LAND's at its ROOT, held flat:
 * the root is the land nodes (not ①'s water, outside the footprint) within one cell of the deck's edge, as connected
 * pieces; the deck takes that root's median. Runs after the bed and BEFORE the stamp, so the stamp meets the deck's water
 * edges at HIGH like any coast. Derived, no constant.
 * ⛔ Refuses, by name: a deck with no land root (it stands clear of the shore: an island, step 5) · two or more roots whose
 *    heights differ by more than the lidar's own stated accuracy (`rmsezM`, the registry's f-3dep-ql-rmsez for the
 *    project's QL), never interpolated · a deck whose root stands below HIGH (a deck is above the water).
 * @param decks [{ ring, streets }] — map.json layers.ribbons.streetDecks
 * @returns [{ streets, rootM, roots, nodes }]
 */
export function deckHeights(normalized, width, height, bounds, decks, mask, water, rmsezM) {
  const L = levelsOf(water)
  const sx = (bounds.maxX - bounds.minX) / (width - 1), sz = (bounds.maxZ - bounds.minZ) / (height - 1), cell = Math.min(sx, sz)
  const X = (i) => bounds.minX + i * sx, Z = (j) => bounds.minZ + j * sz
  const inRing = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
  const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)); return Math.hypot(x - a[0] - u * dx, z - a[1] - u * dz) }
  const out = []
  for (const deck of decks || []) {
    const r = deck.ring, name = (deck.streets || []).filter(Boolean).slice(0, 3).join(' / ') || 'a street deck'
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) }
    const i0 = Math.max(0, Math.floor((x0 - cell - bounds.minX) / sx)), i1 = Math.min(width - 1, Math.ceil((x1 + cell - bounds.minX) / sx))
    const j0 = Math.max(0, Math.floor((z0 - cell - bounds.minZ) / sz)), j1 = Math.min(height - 1, Math.ceil((z1 + cell - bounds.minZ) / sz))
    const inside = [], root = new Set()
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * width + i, x = X(i), z = Z(j)
      if (inRing(x, z, r)) { inside.push(k); continue }
      if (mask[k] || !Number.isFinite(normalized[k])) continue
      let near = false
      for (let m = 0; m < r.length && !near; m++) if (segD(x, z, r[m], r[(m + 1) % r.length]) <= cell) near = true
      if (near) root.add(k)
    }
    if (!inside.length) continue                               // the deck falls between grid nodes: nothing to set
    // the root as connected pieces (8-way)
    const seen = new Set(), pieces = []
    for (const k of root) { if (seen.has(k)) continue
      const p = [k]; seen.add(k)
      for (let c = 0; c < p.length; c++) { const m = p[c], i = m % width, j = (m - i) / width
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const q = (j + dj) * width + (i + di); if (root.has(q) && !seen.has(q)) { seen.add(q); p.push(q) } } }
      const hs = p.map(q => normalized[q]).sort((a, b) => a - b)
      pieces.push({ nodes: p.length, h: hs[hs.length >> 1], at: [X(p[0] % width), Z((p[0] - p[0] % width) / width)] }) }
    if (!pieces.length) throw new Error(`⛔ the deck: ${name} has no land root (it stands clear of ①'s land), so no height can be given to it — an island, BRIEF-the-shore-is-one-line §3 step 5`)
    const hs = pieces.map(p => p.h), spread = Math.max(...hs) - Math.min(...hs)
    if (pieces.length > 1 && spread > rmsezM) throw new Error(`⛔ the deck: ${name} has ${pieces.length} land roots at different heights (${pieces.map(p => `${p.h.toFixed(2)} m at (${p.at.map(Math.round).join(', ')})`).join(' · ')}; ${spread.toFixed(2)} m apart, past the lidar's stated ${rmsezM} m). One flat deck cannot meet both; not interpolated (Boz, 2026-10-26)`)
    const rootM = pieces.reduce((t, p) => t + p.h * p.nodes, 0) / pieces.reduce((t, p) => t + p.nodes, 0)
    const lowAt = inside.find(k => rootM < L.highAt(X(k % width), Z((k - k % width) / width)))
    if (lowAt != null) throw new Error(`⛔ the deck: ${name}'s root stands at ${rootM.toFixed(2)} m, below HIGH there — a deck is above the water, so its root is not land the deck can be held at`)
    for (const k of inside) normalized[k] = rootM
    out.push({ streets: deck.streets, rootM: +rootM.toFixed(3), roots: pieces.length, nodes: inside.length })
  }
  if (out.length) console.log(`  DECKS: ${out.map(d => `${(d.streets || []).filter(Boolean)[0] || 'deck'} held at its root, ${d.rootM} m (${d.nodes} node(s), ${d.roots} root piece(s))`).join(' · ')}`)
  return out
}
