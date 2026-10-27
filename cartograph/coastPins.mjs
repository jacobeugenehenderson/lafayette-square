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
 *    are neither pinned nor clamped, and are counted (`deckEdgeVerts`); a point where a deck edge meets a real coast edge is
 *    pinned and counted (`deckJunctions`). A deck is known by IDENTITY, the frozen
 *    streetDecks record ①'s water was cut by (map.json layers.ribbons.streetDecks), never by a shape found in the data;
 *    its edge is read on that record's own rings at the on-line tolerance.
 * ⭐ A BRIDGE IS PAINTED ACROSS THE WATER (Jacob, 2026-10-27, (b)): under an off-grade span's paint the line is not ground,
 *    so a coast vertex inside or on a span's painted footprint has no ground vertex to pin. It is skipped and counted per
 *    street (`underSpan`). A span is known by IDENTITY: the record ①'s mint writes for every off-grade piece it leaves out
 *    of the ink (map.json layers.ribbons.protopolygon.offGradeSpans, each { street, ring }), read the way the decks are.
 * ⭐ ITS PAINT LIES ON THE WATER (Boz's ruling, 2026-10-27, on Jacob's (b): "the road is painted on top of the water,
 *    continuous but flat at water level"): every ground vertex of a span's paint group (`spanGroups`) inside that span's
 *    footprint and in ①'s water takes raw = HIGH, counted per span (`bridgeLifted`), so the paint reads on the water and never
 *    as the bed seen through it, and meets each bank at HIGH like the pinned line. ⛔ Those vertices are EXEMPT from the side
 *    clamp: they are on the water by ruling, not beside the line. Not a raised deck (filed: "deck later").
 * ⛔ Refuses, by name: a coast vertex inside the drawing, off every deck's edge and under no span, with no ground vertex on
 *    it (the line is not in the mesh) · no span list given · no span paint group list given.
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
 * @param spans the off-grade spans over the water ([{ street, ring }], protopolygon.offGradeSpans), [] when there are none
 * @param spanGroups the ids of the groups a span's paint is drawn in (H's `mat:highway`, the bridges overlay's), [] for none
 * @returns { pins: Map key → [raw, ∂raw/∂x, ∂raw/∂z], sectionFor(positions) → Float32Array | null, stats }
 */
export function pinTheCoast({ groups, rings, inDrawing, rawAt, highAt, tol, decks, spans, spanGroups }) {
  if (!Array.isArray(spanGroups)) throw new Error('⛔ the pin: no span paint group list given (pass [] for none) — a bridge over the water would be left on the bed unseen')
  if (!Array.isArray(spans)) throw new Error('⛔ the pin: no off-grade span list given (pass [] for a town with none) — a coast vertex under a bridge would read as missing from the mesh, or be skipped unseen')
  if (!Array.isArray(decks)) throw new Error('⛔ the pin: no street-deck list given (pass [] for a town with none) — a deck edge would be pinned unseen')
  const segs = []
  for (const r of rings) for (let m = 0; m < r.length; m++) segs.push([r[m], r[(m + 1) % r.length]])
  const stats = { tolM: +tol.toExponential(3), coastVertsInDrawing: 0, deckEdgeVerts: 0, deckJunctions: 0, underSpan: 0, underSpanByStreet: {}, bridgeLifted: 0, bridgeLiftedByStreet: {}, pinned: 0, clampedLand: 0, clampedWater: 0, keptLand: 0, keptWater: 0, pinnedEdgeM: 0 }
  if (!segs.length) return { pins: new Map(), sectionFor: () => null, stats }
  // the coast's edges, gridded at their median length
  const lens = segs.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1])).sort((p, q) => p - q)
  const C = Math.max(lens[lens.length >> 1], tol * 4), grid = new Map()
  const cellKey = (i, j) => i * 2097152 + j
  segs.forEach(([a, b], s) => {
    for (let i = Math.floor((Math.min(a[0], b[0]) - tol) / C); i <= Math.floor((Math.max(a[0], b[0]) + tol) / C); i++)
      for (let j = Math.floor((Math.min(a[1], b[1]) - tol) / C); j <= Math.floor((Math.max(a[1], b[1]) + tol) / C); j++) {
        const k = cellKey(i, j); (grid.get(k) || grid.set(k, []).get(k)).push(s) } })
  const onSegs = (x, z) => (grid.get(cellKey(Math.floor(x / C), Math.floor(z / C))) || []).filter(s => {
    const [a, b] = segs[s], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz
    const u = L2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0
    return Math.hypot(x - a[0] - u * dx, z - a[1] - u * dz) <= tol })
  const onLine = (x, z) => onSegs(x, z).length > 0
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
  // ⭐ a point on a deck's edge is the deck's only if EVERY coast edge it lies on is a deck edge (each tested at its midpoint,
  // Zob's read 2026-10-27): the vertex where a deck meets the real coast ends a coast edge too, so it is pinned (a junction)
  const deckOnly = (x, z) => onSegs(x, z).every(q => { const [a, b] = segs[q]; return onDeckEdge((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) })
  const deckKeys = new Set(), junctions = new Set()
  // the span whose painted footprint holds (x, z) — inside its ring, or on it within the on-line tolerance — or null
  const spanBB = spans.map(sp => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of sp.ring) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z) } return [a - tol, b - tol, c + tol, d + tol] })
  const spanAt = (x, z) => spans.find((sp, i) => { const bb = spanBB[i], r = sp.ring
    if (x < bb[0] || x > bb[2] || z < bb[1] || z > bb[3]) return false
    let inside = false; for (let m = 0, n = r.length - 1; m < r.length; n = m++) { const a = r[m], b = r[n]
      if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside }
    if (inside) return true
    return r.some((a, m) => { const b = r[(m + 1) % r.length], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz
      const u = L2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0
      return Math.hypot(x - a[0] - u * dx, z - a[1] - u * dz) <= tol }) }) || null

  // 1. PINNED: every ground vertex on the line → HIGH there; a deck's edge is not the line
  const pin = new Map(), field = new Map(), pinGap = []
  const isPin = groups.map(({ positions: P }) => { const flag = new Uint8Array(P.length / 3)
    for (let v = 0; v < P.length; v += 3) { const x = P[v], z = P[v + 2]
      if (!onLine(x, z)) continue
      if (decks.length && onDeckEdge(x, z)) { if (deckOnly(x, z)) { deckKeys.add(keyOf(x, z)); continue } junctions.add(keyOf(x, z)) }
      flag[v / 3] = 1; const k = keyOf(x, z)
      if (pin.has(k)) continue
      const H = highAt(x, z), f = rawAt(x, z); pin.set(k, H); field.set(k, f); pinGap.push(f - H) }
    return flag })
  stats.pinned = pin.size
  stats.deckEdgeVerts = deckKeys.size
  stats.deckJunctions = junctions.size
  // ⛔ the line must be IN the mesh: every coast vertex inside the drawing, off the decks' edges and under no span, is a pinned ground vertex
  { const C2 = Math.max(tol * 64, C / 8), pg = new Map()
    for (const k of pin.keys()) { const [x, z] = k.split(',').map(Number), q = cellKey(Math.floor(x / C2), Math.floor(z / C2)); (pg.get(q) || pg.set(q, []).get(q)).push([x, z]) }
    const missing = []
    for (const r of rings) for (const [x, z] of r) {
      if (!inDrawing(x, z) || (decks.length && onDeckEdge(x, z) && deckOnly(x, z))) continue
      const sp = spans.length ? spanAt(x, z) : null
      if (sp) { stats.underSpan++; stats.underSpanByStreet[sp.street] = (stats.underSpanByStreet[sp.street] || 0) + 1; continue }   // under a bridge's paint: not ground
      stats.coastVertsInDrawing++
      let hit = false
      for (let di = -1; di <= 1 && !hit; di++) for (let dj = -1; dj <= 1 && !hit; dj++)
        for (const [px, pz] of pg.get(cellKey(Math.floor(x / C2) + di, Math.floor(z / C2) + dj)) || []) if (Math.hypot(px - x, pz - z) <= tol) { hit = true; break }
      if (!hit) missing.push([x, z]) }
    if (missing.length) {
      // measured, on the failure path only: how far each missing coast vertex is from the nearest ground vertex, and whose
      const G = 4, vg = new Map()
      groups.forEach(({ id, positions: P }) => { for (let v = 0; v < P.length; v += 3) { const q = cellKey(Math.floor(P[v] / G), Math.floor(P[v + 2] / G)); (vg.get(q) || vg.set(q, []).get(q)).push([P[v], P[v + 2], id]) } })
      const near = missing.map(([x, z]) => { let bd = Infinity, who = null
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (const [px, pz, id] of vg.get(cellKey(Math.floor(x / G) + di, Math.floor(z / G) + dj)) || []) { const d = Math.hypot(px - x, pz - z); if (d < bd) { bd = d; who = id } }
        return { d: bd, who } })
      const ds = near.map(n => n.d).filter(Number.isFinite).sort((p, q) => p - q), q = (f) => ds.length ? (ds[Math.min(ds.length - 1, Math.floor(f * ds.length))] * 1000).toFixed(2) : '—'
      const by = {}; for (const n of near) by[n.who ?? `none within ${G} m`] = (by[n.who ?? `none within ${G} m`] || 0) + 1
      throw new Error(`⛔ the pin: ${missing.length} of ①'s ${stats.coastVertsInDrawing} coast vertices inside the drawing have no ground vertex within ${(tol * 1000).toFixed(2)} mm — first at ${missing.slice(0, 5).map(p => `(${p[0].toFixed(3)}, ${p[1].toFixed(3)})`).join(' · ')}. `
        + `The nearest ground vertex to each: p10 ${q(0.1)} · p50 ${q(0.5)} · p90 ${q(0.9)} · max ${q(1)} mm (${missing.length - ds.length} with none within ${G} m); nearest group ${Object.entries(by).sort((p, q) => q[1] - p[1]).slice(0, 4).map(([k, v]) => `${k} ${v}`).join(' · ')}. The line is not in the mesh, so it cannot be pinned`)
    }
  }
  // 1b. A BRIDGE'S PAINT LIES ON THE WATER: a span paint group's vertex inside its span's footprint and in ①'s water → HIGH
  const lifted = new Map()
  if (spans.length && spanGroups.length) { const want = new Set(spanGroups)
    for (const { id, positions: P } of groups) { if (!want.has(id)) continue
      for (let v = 0; v < P.length; v += 3) { const x = P[v], z = P[v + 2], k = keyOf(x, z)
        if (pin.has(k) || lifted.has(k)) continue
        const sp = spanAt(x, z); if (!sp || !inWater(x, z)) continue
        lifted.set(k, highAt(x, z)); stats.bridgeLiftedByStreet[sp.street] = (stats.bridgeLiftedByStreet[sp.street] || 0) + 1 } } }
  stats.bridgeLifted = lifted.size
  // 2. LINE-ADJACENT: the other corners of every triangle that touches the line, clamped by side (a lifted bridge vertex is
  //    on the water by ruling, so it is exempt)
  const raw = new Map([...pin, ...lifted])
  const sideOf = new Map()
  groups.forEach(({ positions: P, indices: I }, gi) => { for (let t = 0; t < I.length; t += 3) {
    if (!isPin[gi][I[t]] && !isPin[gi][I[t + 1]] && !isPin[gi][I[t + 2]]) continue
    const ks = [I[t], I[t + 1], I[t + 2]].map(v => keyOf(P[v * 3], P[v * 3 + 2]))
    for (let c = 0; c < 3; c++) { const k = ks[c]
      if (pin.has(k)) { const a = keyOf(P[I[t + (c + 1) % 3] * 3], P[I[t + (c + 1) % 3] * 3 + 2])
        if (pin.has(a)) stats.pinnedEdgeM += Math.hypot(P[I[t + (c + 1) % 3] * 3] - P[I[t + c] * 3], P[I[t + (c + 1) % 3] * 3 + 2] - P[I[t + c] * 3 + 2]) / 2
        continue }
      if (sideOf.has(k) || deckKeys.has(k) || lifted.has(k)) continue   // a deck's edge is neither pinned nor clamped; a bridge's paint on the water is its own
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
