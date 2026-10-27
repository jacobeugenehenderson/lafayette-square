/**
 * shoreStamp.mjs — the bed ramps to ①'s coast (BRIEF-the-shore-is-one-line §3 step 2b; the line itself is the ground's pin, coastPins.mjs). A pure function, so
 * bake-terrain runs it and checks/claims-the-shore-meets-the-field-at-high.mjs exercises it, the same code.
 */
import { waterLevels as levelsOf } from './waterLevel.mjs'

// ⭐⭐ THE STAMP SHAPES THE BED, AND ONLY THE BED (BRIEF-the-shore-is-one-line §3 step 2b; Jacob 2026-10-27 "yes pin the
// coast"). The drawn shore is ①'s line because the GROUND is pinned there (coastPins.mjs: every vertex on the line at HIGH,
// its neighbours clamped by side), so the field no longer has to carry the line. What the field still owes is a beach: at the
// SEAWARD corner nodes of every grid cell ①'s coast crosses, h = HIGH + s·d (d the node's signed distance to the crossing
// segment, negative seaward; s ONE slope per ring), so the bed rises to meet the shore instead of standing off it as a step.
// On a tidal town the ramp continues two cells into the water as max(ramp, bed): the tide spans at least two cells (Zob's
// cap) and real flats still meet the beach. ⛔ LAND IS NEVER WRITTEN: not raised, not lowered (a bluff, a seawall, a polder
// all stand as the lidar has them). A water node at or above HIGH is counted and named, the kept rock
// (bake-terrain#rockCells: breakwaters and groynes, ruled stone) apart. s = the bed's own gradient two to four cells seaward
// (median over the ring), capped at (HIGH − LOW) / 2 cells where HIGH > LOW. ⛔ s ≤ 0 on a ring REFUSES by name. The
// stamped nodes are recorded (row runs).
/** The crossed node nearest (i, j) within four cells, Euclidean over the whole 9 × 9 square (Zob, 2026-10-26: a diagonal
 *  at three cells is farther than a straight one at four), as { ri, dist }, or null. It names the ring a bed node's slope
 *  sample belongs to. */
export function nearestCrossed(best, i, j, width, height, sx, sz) {
  let near = null
  for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) {
    if (j + dj < 0 || i + di < 0 || i + di >= width || j + dj >= height) continue
    const b2 = best.get((j + dj) * width + (i + di)), dist = Math.hypot(di * sx, dj * sz)
    if (b2 && b2.crossed && (!near || dist < near.dist)) near = { ri: b2.ri, dist } }
  return near
}

// ⭐ WHICH BED EACH SLOPE MEASURED (Boz's ruling, 2026-10-26): `floor` marks the cells whose bed is a measured survey
// (bake-terrain's bed.floor.runs); each ring records the share of its samples on it (slopeFloorShare, null when
// borrowed), so a slope taken off writeBed's own profile is never mistaken for a measured one.
// ⭐ A NODE CAPPED AT HIGH IS NOT A SLOPE (Boz's ruling, 2026-10-27, on Zob's read of PTown's ring 58, "median gradient −0.0000"):
// `atHigh` marks the bed nodes writeBed clamped to HIGH (bed.atHigh.runs), a survey floor standing above it. Their gradient is
// the cap's, a sentinel, so they are left out of every ring's samples, and counted (slopeCapped); a ring left with none follows
// the rule for no bed (an island borrows its holder's, recorded; an outer refuses), and each refusal names the capped share. At
// a crossed corner over a capped node the stamp takes max(ramp, bed), so no moat is cut round a bar. ⛔ s ≤ 0 on REAL samples
// still refuses.
export function stampCoast(normalized, width, height, bounds, face, bb, mask, water, rock = null, floor = null, atHigh = null) {
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
  const slope = face.map(() => []), onFloor = face.map(() => 0), capped = face.map(() => 0)
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
    const k = j * width + i
    if (!mask[k] || best.has(k)) continue
    const near = nearestCrossed(best, i, j, width, height, sx, sz)
    if (near && near.dist > 2 * cell) { if (atHigh && atHigh[k]) { capped[near.ri]++; continue }
      slope[near.ri].push((L.highAt(X(i), Z(j)) - normalized[k]) / near.dist); if (floor && floor[k]) onFloor[near.ri]++ }
  }
  // ⭐ AN ISLAND (a hole, wound negative) is a shore of the water that holds it. Its own bed gives its slope; an island with
  // no bed of its own two to four cells out (a small one, its water within reach of the other bank's stamp) takes the
  // slope of the water ring that holds it: RECORDED per ring (slopeFrom), never silent. ⛔ An OUTER with none still refuses.
  const signed = (r) => r.reduce((t, p, m) => { const q = r[(m + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0)
  const inRingP = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
  const holder = face.map((r, ri) => { if (signed(r) >= 0) return null
    const outers = face.map((o, oi) => [o, oi, signed(o)]).filter(([o, , a]) => a > 0 && inRingP(r[0][0], r[0][1], o)).sort((p, q) => p[2] - q[2])
    if (!outers.length) throw new Error(`⛔ the stamp: ①'s coast ring ${ri} is an island inside no water ring (at ${r[0].map(Math.round).join(', ')})`)
    return outers[0][1] })
  const slopeFrom = face.map(() => null)
  const sOf = slope.map((v, ri) => {
    if (!v.length && holder[ri] !== null) { slopeFrom[ri] = holder[ri]; return null }   // resolved from its holder below
    if (!v.length) {                                         // ⛔ never a bare skip: an unstamped shore is the raw contour, the defect
      const len = face[ri].reduce((t, p, m) => { const q = face[ri][(m + 1) % face[ri].length]; return sameSide(p, q) ? t : t + Math.hypot(q[0] - p[0], q[1] - p[1]) }, 0)
      throw new Error(`⛔ the stamp: ①'s coast ring ${ri} (${len.toFixed(0)} m of shore in the drawing) has no bed two to four cells seaward to take a slope from${capped[ri] ? ` (${capped[ri]} node(s) there are capped at HIGH, a sentinel, not a slope)` : ''} — its shore cannot be stamped`)
    }
    v.sort((p, q) => p - q)
    let s = v[v.length >> 1]
    const cap = tidal ? (L.range.high[1] - L.range.low[0]) / (2 * cell) : Infinity
    if (s > cap) s = cap
    if (!(s > 0)) throw new Error(`⛔ the stamp: ①'s coast ring ${ri} has a bed that does not fall seaward (median gradient ${v[v.length >> 1].toFixed(4)} over ${v.length} real node(s)${capped[ri] ? `, ${capped[ri]} more capped at HIGH left out (${Math.round(100 * capped[ri] / (capped[ri] + v.length))}%)` : ''}) — no ramp can meet it at HIGH`)
    return +s.toFixed(5)
  })
  for (let ri = 0; ri < face.length; ri++) if (slopeFrom[ri] !== null) sOf[ri] = sOf[slopeFrom[ri]]
  const islands = holder.filter(h => h !== null).length, borrowed = slopeFrom.filter(h => h !== null).length
  // ⛔ AN INVARIANT, ASSERTED (Boz, 2026-10-26; kept 2026-10-27): no written node deeper than the bed's own deepest water node
  // before the stamp (writeBed's cut, or the deepest measured floor). It cannot fire as written: a crossed corner lies within
  // cell·√2 of the line, while the ring's slope is the median of samples two to four cells out, each at least as deep as its
  // own ramp there, so a corner's ramp is shallower than the deepest of them; and the tide's extension never goes below the
  // bed it keeps. It guards the next edit, not this one: refused by name, never clamped.
  let deepest = Infinity; for (let k = 0; k < width * height; k++) if (mask[k] && normalized[k] < deepest) deepest = normalized[k]
  const stamped = new Uint8Array(width * height)
  let ramped = 0, bedWon = 0
  // SEAWARD only: at a crossed cell's corner, the ramp; in the tide's extension, max(ramp, bed), so real flats still meet the beach
  for (const [k, b] of best) {
    if (!mask[k]) continue                                   // land is not ①'s water, by the mask: a node ON the line (d = −0) is water
    const i = k % width, j = (k - i) / width, ramp = L.highAt(X(i), Z(j)) + sOf[b.ri] * b.d
    if (b.crossed && !(atHigh && atHigh[k] && normalized[k] > ramp)) { normalized[k] = ramp; ramped++; stamped[k] = 1 }   // over a capped bar: max(ramp, bed), no moat
    else if (b.crossed) bedWon++
    else if (ramp > normalized[k]) { normalized[k] = ramp; ramped++; stamped[k] = 1 } else bedWon++
  }
  const sunk = []; for (const [k] of best) if (stamped[k] && normalized[k] < deepest - 1e-6) sunk.push(k)
  if (sunk.length) { const w = sunk.reduce((m, k) => normalized[k] < normalized[m] ? k : m, sunk[0])
    throw new Error(`⛔ the stamp: ${sunk.length.toLocaleString()} node(s) written deeper than the deepest bed (${deepest.toFixed(3)} m), the deepest ${normalized[w].toFixed(3)} m at (${Math.round(X(w % width))}, ${Math.round(Z((w - w % width) / width))}); first at ${sunk.slice(0, 5).map(k => `(${Math.round(X(k % width))}, ${Math.round(Z((k - k % width) / width))})`).join(' · ')} — no beach is that deep`) }
  // ⛔ a bed standing at or above HIGH inside ①'s water is ① contradicting the lidar: counted and named, never clamped
  const above = []
  for (let k = 0; k < width * height; k++) if (mask[k] && !stamped[k] && !(rock && rock[k]) && !(atHigh && atHigh[k]) && normalized[k] >= L.highAt(X(k % width), Z((k - k % width) / width))) above.push(k)
  if (above.length) console.warn(`  ⛔ STAMP: ${above.length.toLocaleString()} node(s) of ①'s water stand at or above HIGH (① and the lidar disagree), first at ${above.slice(0, 5).map(k => `(${Math.round(X(k % width))}, ${Math.round(Z((k - k % width) / width))})`).join(' · ')}`)
  const runs = []
  for (let j = 0; j < height; j++) { let i0 = -1
    for (let i = 0; i <= width; i++) { const v = i < width && stamped[j * width + i]
      if (v && i0 < 0) i0 = i; else if (!v && i0 >= 0) { runs.push(j, i0, i - 1); i0 = -1 } } }
  console.log(`  STAMP: the bed ramps to ①'s coast — ${stamped.reduce((t, v) => t + v, 0).toLocaleString()} water node(s) on the ramp (land untouched) · ${bedWon.toLocaleString()} where the bed stood higher (flats, not stamped) · ${above.length.toLocaleString()} water node(s) at or above HIGH · slope per ring ${sOf.map(v => v ?? '—').join(', ')} · on a measured floor ${slope.map((v, ri) => slopeFrom[ri] !== null ? '—' : `${Math.round(100 * onFloor[ri] / v.length)}%`).join(', ')}${islands ? ` · ${islands} island(s), ${borrowed} on the slope of the water holding them` : ''} · cell ${cell.toFixed(2)} m${tidal ? ' · tidal: two cells of tide seaward' : ''}`)
  const slopeFloorShare = slope.map((v, ri) => slopeFrom[ri] !== null ? null : +(onFloor[ri] / v.length).toFixed(3))
  // `shapes: 'bed'`: the record says, positively, that this field only shapes the bed (the line is the ground's pin), so a
  // reader never infers it from absent keys (drawnGround.js#stampShapesBedOnly; Zob's nit, 2026-10-27)
  return { shapes: 'bed', cellM: +cell.toFixed(4), slopePerRing: sOf, slopeFrom, slopeFloorShare, slopeSamples: slope.map(v => v.length), slopeCapped: capped, islands, ramped, bedWon, aboveHigh: above.length, tidal, runs }
}


/**
 * ⭐ THE STREET RIDES THE DECK, ITS HEIGHT (Boz's ruling, 2026-10-26; Jacob 2026-10-25 "a, the street rides the deck"). A
 * bare-earth DEM carries no deck (piers are classified out), so the deck's height is the LAND's at its ROOT, held flat:
 * the root is the land nodes (not ①'s water, outside the footprint) within one cell of the deck's edge, as connected
 * pieces; the deck takes that root's median. Runs after the bed and BEFORE the stamp, so the stamp ramps the water beside
 * it like any coast's. Derived, no constant.
 * ⛔ Refuses, by name: a deck with no land root (it stands clear of the shore: refused at the pour, derive.js) · two or more roots whose
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
