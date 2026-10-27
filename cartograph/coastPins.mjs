/**
 * coastPins.mjs — THE DRAWN SHORE IS ①'s LINE (Jacob, 2026-10-27: "yes pin the coast"; Zob's order, step 2). A pure
 * function, so bake-ground runs it and checks/claims-the-shore-meets-the-field-at-high.mjs exercises it, the same code.
 *
 * The water sheet stands at its level and the ground is the field lifted per vertex, so the shore on screen is wherever
 * the two cross INSIDE the triangles: the field's own contour, which no grid of box-means can put on ①'s line. Here the
 * mesh is made to carry the line instead:
 *   · every ground vertex ON ①'s coast (an edge of ①'s waterRings, the refinement's splits of it included) is PINNED to
 *     HIGH there, so along every coast edge the drawn ground is exactly HIGH — the line, at every exaggeration;
 *   · every other vertex of a triangle that touches the line (LINE-ADJACENT) is CLAMPED by its side of ①'s face: land
 *     max(field, HIGH), water min(field, HIGH), so no line-adjacent triangle crosses HIGH except AT the line. ⛔ Only
 *     line-adjacent triangles, never whole faces: land below HIGH away from the line (a polder, the back of a dyke) is
 *     land at its own height, and stays so.
 * A vertex is keyed by its exact position, so one point in several groups (the partition's shared edges, the kerb's split,
 * the riser) takes one height and the ground cannot crack. Each pinned or clamped vertex carries the drawn surface's own
 * slope there (area-weighted over its triangles), which the shader lights it by (drawnGround.js `_drawnSlope`).
 * ⭐ A STREET DECK'S EDGE IS NOT THE HIGH-WATER LINE (Boz, 2026-10-27): ① subtracts each street deck from the water, so its
 *    edge is in waterRings, but the deck stands at its root's height above the water (shoreStamp#deckHeights). Its vertices
 *    are neither pinned nor clamped, and are counted (`deckEdgeVerts`). A deck is known by IDENTITY, the frozen
 *    streetDecks record ①'s water was cut by (map.json layers.ribbons.streetDecks), never by a shape found in the data;
 *    its edge is read on that record's own rings at the on-line tolerance.
 * ⛔ Refuses, by name: a coast vertex inside the drawing, off every deck's edge, with no ground vertex on it (the line is
 *    not in the mesh).
 */

const keyOf = (x, z) => `${x},${z}`

/** The on-line tolerance: the lattice's own rounding (half a step's diagonal) plus one Float32 step at the drawing's extent. */
export function onLineTolerance(latticeM, maxAbs) {
  return latticeM * Math.SQRT1_2 + 2 ** (Math.floor(Math.log2(Math.max(1, maxAbs))) - 23)
}

/**
 * @param groups [{ id, positions: Float32Array (x, y, z), indices: Uint32Array }] — the ground as drawn (not the water sheet)
 * @param rings ①'s waterRings ([[x, z], …], outers positive, holes negative)
 * @param inDrawing (x, z) → whether the point is inside the drawing's clip
 * @param rawAt (x, z) → the field, raw · highAt (x, z) → HIGH, raw · tol → onLineTolerance
 * @param decks the street decks' rings (map.json layers.ribbons.streetDecks[].ring), [] when there are none
 * @returns { pins: Map key → [raw, ∂raw/∂x, ∂raw/∂z], sectionFor(positions) → Float32Array | null, stats }
 */
export function pinTheCoast({ groups, rings, inDrawing, rawAt, highAt, tol, decks }) {
  if (!Array.isArray(decks)) throw new Error('⛔ the pin: no street-deck list given (pass [] for a town with none) — a deck edge would be pinned unseen')
  const segs = []
  for (const r of rings) for (let m = 0; m < r.length; m++) segs.push([r[m], r[(m + 1) % r.length]])
  const stats = { tolM: +tol.toExponential(3), coastVertsInDrawing: 0, deckEdgeVerts: 0, pinned: 0, clampedLand: 0, clampedWater: 0, keptLand: 0, keptWater: 0, pinnedEdgeM: 0 }
  if (!segs.length) return { pins: new Map(), sectionFor: () => null, stats }
  // the coast's edges, gridded at their median length
  const lens = segs.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1])).sort((p, q) => p - q)
  const C = Math.max(lens[lens.length >> 1], tol * 4), grid = new Map()
  const cellKey = (i, j) => i * 2097152 + j
  segs.forEach(([a, b], s) => {
    for (let i = Math.floor((Math.min(a[0], b[0]) - tol) / C); i <= Math.floor((Math.max(a[0], b[0]) + tol) / C); i++)
      for (let j = Math.floor((Math.min(a[1], b[1]) - tol) / C); j <= Math.floor((Math.max(a[1], b[1]) + tol) / C); j++) {
        const k = cellKey(i, j); (grid.get(k) || grid.set(k, []).get(k)).push(s) } })
  const onLine = (x, z) => {
    for (const s of grid.get(cellKey(Math.floor(x / C), Math.floor(z / C))) || []) {
      const [a, b] = segs[s], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz
      const u = L2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0
      if (Math.hypot(x - a[0] - u * dx, z - a[1] - u * dz) <= tol) return true }
    return false }
  // ①'s face, even-odd over every ring (an island is a hole; a lake on an island is water again), by z-bands
  const band = new Map()
  segs.forEach(([a, b], s) => { if (a[1] === b[1]) return
    for (let j = Math.floor(Math.min(a[1], b[1]) / C); j <= Math.floor(Math.max(a[1], b[1]) / C); j++) (band.get(j) || band.set(j, []).get(j)).push(s) })
  const inWater = (x, z) => { let c = false
    for (const s of band.get(Math.floor(z / C)) || []) { const [a, b] = segs[s]
      if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c }
    return c }

  // the street decks' own edges (by their record), each point tested only once it is on the coast
  const onDeckEdge = (x, z) => decks.some(r => r.some((a, m) => { const b = r[(m + 1) % r.length], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz
    const u = L2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0
    return Math.hypot(x - a[0] - u * dx, z - a[1] - u * dz) <= tol }))
  const deckKeys = new Set()

  // 1. PINNED: every ground vertex on the line → HIGH there; a deck's edge is not the line
  const pin = new Map(), field = new Map(), pinGap = []
  const isPin = groups.map(({ positions: P }) => { const flag = new Uint8Array(P.length / 3)
    for (let v = 0; v < P.length; v += 3) { const x = P[v], z = P[v + 2]
      if (!onLine(x, z)) continue
      if (decks.length && onDeckEdge(x, z)) { deckKeys.add(keyOf(x, z)); continue }
      flag[v / 3] = 1; const k = keyOf(x, z)
      if (pin.has(k)) continue
      const H = highAt(x, z), f = rawAt(x, z); pin.set(k, H); field.set(k, f); pinGap.push(f - H) }
    return flag })
  stats.pinned = pin.size
  stats.deckEdgeVerts = deckKeys.size
  // ⛔ the line must be IN the mesh: every coast vertex inside the drawing, off the decks' edges, is a pinned ground vertex
  { const C2 = Math.max(tol * 64, C / 8), pg = new Map()
    for (const k of pin.keys()) { const [x, z] = k.split(',').map(Number), q = cellKey(Math.floor(x / C2), Math.floor(z / C2)); (pg.get(q) || pg.set(q, []).get(q)).push([x, z]) }
    const missing = []
    for (const r of rings) for (const [x, z] of r) {
      if (!inDrawing(x, z) || (decks.length && onDeckEdge(x, z))) continue
      stats.coastVertsInDrawing++
      let hit = false
      for (let di = -1; di <= 1 && !hit; di++) for (let dj = -1; dj <= 1 && !hit; dj++)
        for (const [px, pz] of pg.get(cellKey(Math.floor(x / C2) + di, Math.floor(z / C2) + dj)) || []) if (Math.hypot(px - x, pz - z) <= tol) { hit = true; break }
      if (!hit) missing.push([x, z]) }
    if (missing.length) throw new Error(`⛔ the pin: ${missing.length} of ①'s ${stats.coastVertsInDrawing} coast vertices inside the drawing have no ground vertex within ${(tol * 1000).toFixed(2)} mm — first at ${missing.slice(0, 5).map(p => `(${p[0].toFixed(3)}, ${p[1].toFixed(3)})`).join(' · ')}. The line is not in the mesh, so it cannot be pinned`)
  }
  // 2. LINE-ADJACENT: the other corners of every triangle that touches the line, clamped by side
  const raw = new Map(pin)
  const sideOf = new Map()
  groups.forEach(({ positions: P, indices: I }, gi) => { for (let t = 0; t < I.length; t += 3) {
    if (!isPin[gi][I[t]] && !isPin[gi][I[t + 1]] && !isPin[gi][I[t + 2]]) continue
    const ks = [I[t], I[t + 1], I[t + 2]].map(v => keyOf(P[v * 3], P[v * 3 + 2]))
    for (let c = 0; c < 3; c++) { const k = ks[c]
      if (pin.has(k)) { const a = keyOf(P[I[t + (c + 1) % 3] * 3], P[I[t + (c + 1) % 3] * 3 + 2])
        if (pin.has(a)) stats.pinnedEdgeM += Math.hypot(P[I[t + (c + 1) % 3] * 3] - P[I[t + c] * 3], P[I[t + (c + 1) % 3] * 3 + 2] - P[I[t + c] * 3 + 2]) / 2
        continue }
      if (sideOf.has(k) || deckKeys.has(k)) continue   // a deck's edge is neither pinned nor clamped
      const v = I[t + c], x = P[v * 3], z = P[v * 3 + 2], H = highAt(x, z), f = rawAt(x, z), wet = inWater(x, z)
      sideOf.set(k, wet); field.set(k, f)
      if (wet) { if (f > H) { raw.set(k, H); stats.clampedWater++ } else stats.keptWater++ }
      else if (f < H) { raw.set(k, H); stats.clampedLand++ } else stats.keptLand++
    }
  } })
  // which vertices carry a height of their own, per group (a coarse cell filter first, so the far ground builds no key)
  const nearCell = new Set([...raw.keys()].map(k => { const [x, z] = k.split(',').map(Number); return cellKey(Math.floor(x / C), Math.floor(z / C)) }))
  const isOver = groups.map(({ positions: P }) => { const flag = new Uint8Array(P.length / 3)
    for (let v = 0; v < P.length; v += 3) if (nearCell.has(cellKey(Math.floor(P[v] / C), Math.floor(P[v + 2] / C))) && raw.has(keyOf(P[v], P[v + 2]))) flag[v / 3] = 1
    return flag })
  stats.pinnedEdgeM = Math.round(stats.pinnedEdgeM)   // each shared edge is met from both of its triangles
  // 3. the drawn slope at every pinned or clamped vertex, area-weighted over its triangles (a vertical riser has none)
  const slope = new Map()
  const drawn = (k, x, z) => raw.has(k) ? raw.get(k) : (field.has(k) ? field.get(k) : rawAt(x, z))
  groups.forEach(({ positions: P, indices: I }, gi) => { for (let t = 0; t < I.length; t += 3) {
    if (!isOver[gi][I[t]] && !isOver[gi][I[t + 1]] && !isOver[gi][I[t + 2]]) continue
    const v = [I[t], I[t + 1], I[t + 2]], ks = v.map(w => keyOf(P[w * 3], P[w * 3 + 2]))
    const x = v.map(w => P[w * 3]), z = v.map(w => P[w * 3 + 2]), h = ks.map((k, c) => drawn(k, x[c], z[c]))
    const d = (x[1] - x[0]) * (z[2] - z[0]) - (x[2] - x[0]) * (z[1] - z[0]), A = Math.abs(d) / 2
    if (!(A > tol * tol)) continue
    const gx = ((h[1] - h[0]) * (z[2] - z[0]) - (h[2] - h[0]) * (z[1] - z[0])) / d
    const gz = ((x[1] - x[0]) * (h[2] - h[0]) - (x[2] - x[0]) * (h[1] - h[0])) / d
    for (const k of ks) if (raw.has(k)) { const s = slope.get(k) || slope.set(k, [0, 0, 0]).get(k); s[0] += gx * A; s[1] += gz * A; s[2] += A }
  } })
  const pins = new Map()
  for (const [k, r] of raw) { const s = slope.get(k); pins.set(k, s && s[2] > 0 ? [r, s[0] / s[2], s[1] / s[2]] : [r, 0, 0]) }
  pinGap.sort((p, q) => p - q)
  const q = (p) => pinGap.length ? +pinGap[Math.min(pinGap.length - 1, Math.floor(p * pinGap.length))].toFixed(3) : null
  stats.fieldMinusHighAtPinsM = { p10: q(0.1), p50: q(0.5), p90: q(0.9), min: pinGap.length ? +pinGap[0].toFixed(3) : null, max: pinGap.length ? +pinGap[pinGap.length - 1].toFixed(3) : null }

  /** A group's sparse section: (vertex u32, raw f32, ∂x f32, ∂z f32) per pinned or clamped vertex, or null when it has none. */
  const sectionFor = (P) => {
    const rec = []
    for (let v = 0; v < P.length / 3; v++) { if (!nearCell.has(cellKey(Math.floor(P[v * 3] / C), Math.floor(P[v * 3 + 2] / C)))) continue
      const p = pins.get(keyOf(P[v * 3], P[v * 3 + 2])); if (p) rec.push(v, p) }
    if (!rec.length) return null
    const out = new Float32Array(rec.length * 2), U = new Uint32Array(out.buffer)
    for (let r = 0; r < rec.length / 2; r++) { U[r * 4] = rec[r * 2]; out.set(rec[r * 2 + 1], r * 4 + 1) }
    return out
  }
  return { pins, sectionFor, stats }
}
