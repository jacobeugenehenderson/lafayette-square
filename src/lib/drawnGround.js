// drawnGround.js — THE DRAWN GROUND'S HEIGHT AT (x, z): ONE HOME (Boz, 2026-10-11; one field, 2026-10-21).
//
// The ground the slab renders is `field × uExag + y` per vertex (BRIEF-the-ground-stands-on-one-field): the town's one
// height field sampled at each vertex (terrainShader.js `_terrainRaw`, the CPU sampler's own bilinear) or the vertex's own pin (below), and y the mesh's
// own kerb part; the raster interpolates both linearly across each triangle. Anything that must sit ON that ground — a
// tree, a lamp, a building at bake time; a mover, the user's dot at runtime — reads it HERE, barycentric over the
// triangle of the top-most group at that point, so it reads what is DRAWN (the field at the triangle's corners), not
// the field at the point. ⛔ Never a second copy of this function: the bake's anchors (`cartograph/groundSampler.js`)
// and the runtime import this one, so the two cannot drift.
// ⭐ VIEWS, NOT COPIES: positions and indices are read as typed-array views on the bin the caller already holds, and the
//   field is read at a triangle's three corners per query; the only new memory is the triangle grid (two Int32Arrays)
//   and a pinned group's pins, expanded (drawnPinsOf).
// ⭐⭐ A VERTEX MAY CARRY ITS OWN RAW HEIGHT (Jacob, 2026-10-27: "yes pin the coast"). The bake pins every ground vertex ON
//   ①'s coast to HIGH and clamps the vertices beside it by side (bake-ground#pinTheCoast), so the drawn shore IS the line.
//   ground.json `drawnRaw` names the format; a group that carries any has `drawnRawByteOffset` + `drawnRawCount`: that many
//   records of (vertex u32, raw f32, ∂raw/∂x f32, ∂raw/∂z f32). Expanded per vertex to (has, raw, ∂x, ∂z): has = 0 is the
//   sentinel "read the field", never a stored height. ONE rule, two twins: `DRAWN_RAW_GLSL` (the shader, terrainShader.js
//   patchTerrain `drawn`) and `drawnRaw` (here, so every CPU reader of the drawn ground). ▶ node checks/claims-the-drawn-raw-is-one-function.mjs
export const DRAWN_RAW_GLSL = `
attribute vec4 aDrawnRaw;
float _drawnRaw(vec4 pin, float field) { return pin.x > 0.5 ? pin.y : field; }
vec2 _drawnSlope(vec4 pin, vec2 fieldSlope, float exag) { return pin.x > 0.5 ? pin.zw * exag : fieldSlope; }`
/** The drawn raw height of vertex v: its own pin, else the field there. `pins` is drawnPinsOf's array, or null (none). */
export const drawnRaw = (pins, v, field) => pins !== null && pins[v * 4] > 0.5 ? pins[v * 4 + 1] : field

/** A group's pins expanded per vertex (has, raw, ∂raw/∂x, ∂raw/∂z), or null when it carries none.
 *  ⭐ Keyed on the file's OWN FORMAT: a ground with no `drawnRaw` record was baked before the pin and drawn from the field
 *  everywhere, so its pins ARE none (a true statement about that file); `predatesThePin(manifest)` lets a caller say so. */
export function drawnPinsOf(manifest, g, bin) {
  if (manifest.drawnRaw == null || g.drawnRawByteOffset == null) return null
  const n = g.drawnRawCount
  if (!(n > 0)) throw new Error(`drawnGround: group ${g.id} names a drawnRaw section with ${n} records`)
  const U = new Uint32Array(bin, g.drawnRawByteOffset, n * 4), F = new Float32Array(bin, g.drawnRawByteOffset, n * 4)
  const pins = new Float32Array(g.vertexCount * 4)
  for (let r = 0; r < n; r++) {
    const v = U[r * 4]
    if (v >= g.vertexCount) throw new Error(`drawnGround: group ${g.id}'s pin ${r} names vertex ${v} of ${g.vertexCount}`)
    pins[v * 4] = 1; pins[v * 4 + 1] = F[r * 4 + 1]; pins[v * 4 + 2] = F[r * 4 + 2]; pins[v * 4 + 3] = F[r * 4 + 3]
  }
  return pins
}
/** Every vertex's drawn raw in group g: its pin, else the field there (`rawAt`). What a reader that judges the drawn
 *  ground per vertex reads, never the field alone. */
export function drawnRawOf(manifest, g, bin, rawAt) {
  const P = new Float32Array(bin, g.vertexByteOffset, g.vertexCount * 3), pins = drawnPinsOf(manifest, g, bin)
  return Float64Array.from({ length: g.vertexCount }, (_, v) => drawnRaw(pins, v, rawAt(P[v * 3], P[v * 3 + 2])))
}
/** A COASTAL ground baked on a terrain before the pin existed: its shore is the field's own contour, not ①'s line. Coastal is
 *  read off the file itself: the bed (`mat:bed`) is drawn only under ①'s water face. An inland ground has no shore to misdraw. */
export const predatesThePin = (manifest) => manifest.drawnRaw == null && manifest.groundShape?.terrain === true
  && (manifest.groups || []).some(g => g.kind === 'mat' && g.id === 'bed')
/** A terrain whose stamp only SHAPES THE BED: its record says so, `shapes: 'bed'` (shoreStamp.mjs#stampCoast). Such a field
 *  no longer meets ①'s line on its own: only a pinned ground does. ⛔ Read from the marker, never from absent keys. */
export const stampShapesBedOnly = (stamp) => stamp?.shapes === 'bed'
/** ⛔ THE ONE BAD MIX (Ward-seat review, Boz 2026-10-27): a bed-only terrain under a ground with no pins draws the shore off
 *  ①'s line, with nothing to say so. Returns the refusal's reason, or null when the pair is drawable. */
export function pinsMissingUnder(manifest, terrainMeta) {
  if (!stampShapesBedOnly(terrainMeta?.stamp) || manifest?.drawnRaw != null) return null
  return 'its terrain.json stamp shapes the bed only (the field no longer meets ①\'s line) and its ground.json carries no drawnRaw pins — the shore would be drawn off the line. ▶ re-bake the ground'
}

/** @param manifest ground.json ({ groups, bbox }) · @param bin ground.bin as an ArrayBuffer
 *  @param opts.rawAt (x, z) → the town's height field, raw (required) · opts.groups (g) → whether this group is sampled
 *  (default: every group) · opts.cell grid cell in metres (default 8)
 *  @returns { partsAt(x, z) → { raw, y, group } | null, heightAt(x, z, exag) → number | null, triCount } */
export function makeDrawnGround(manifest, bin, { groups: pick = () => true, rawAt, cell = 8 } = {}) {
  if (typeof rawAt !== 'function') throw new Error('drawnGround: no height field given (opts.rawAt) — the drawn ground is the field plus the mesh\'s own y')
  const G = []
  for (const g of manifest.groups) {
    if (!pick(g)) continue
    G.push({ g, P: new Float32Array(bin, g.vertexByteOffset, g.vertexCount * 3), I: new Uint32Array(bin, g.indexByteOffset, g.indexCount), ro: g.renderOrder, pins: drawnPinsOf(manifest, g, bin) })
  }
  const minX = manifest.bbox.min[0], minZ = manifest.bbox.min[2], maxX = manifest.bbox.max[0], maxZ = manifest.bbox.max[2]
  const nx = Math.max(1, Math.ceil((maxX - minX) / cell)), nz = Math.max(1, Math.ceil((maxZ - minZ) / cell))
  const cx = (x) => Math.max(0, Math.min(nx - 1, Math.floor((x - minX) / cell)))
  const cz = (z) => Math.max(0, Math.min(nz - 1, Math.floor((z - minZ) / cell)))
  // CSR grid: two passes (count, then fill), in group order then triangle order — the order the old sampler used, so a
  // tie between two triangles of equal renderOrder resolves the same way
  const count = new Int32Array(nx * nz + 1)
  const span = (P, I, t, f) => { const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3
    for (let gz = cz(Math.min(P[a + 2], P[b + 2], P[c + 2])); gz <= cz(Math.max(P[a + 2], P[b + 2], P[c + 2])); gz++)
      for (let gx = cx(Math.min(P[a], P[b], P[c])); gx <= cx(Math.max(P[a], P[b], P[c])); gx++) f(gz * nx + gx) }
  let triCount = 0
  for (const { P, I } of G) for (let t = 0; t < I.length; t += 3) { triCount++; span(P, I, t, (k) => count[k + 1]++) }
  for (let k = 0; k < nx * nz; k++) count[k + 1] += count[k]
  const fill = count.slice(), refG = new Int32Array(count[nx * nz]), refT = new Int32Array(count[nx * nz])
  G.forEach(({ P, I }, gi) => { for (let t = 0; t < I.length; t += 3) span(P, I, t, (k) => { refG[fill[k]] = gi; refT[fill[k]] = t; fill[k]++ }) })

  // barycentric at (px, pz) in triangle t of group gi, or null outside it (the old sampler's own math and tolerance)
  function sample(gi, t, px, pz) {
    const { P, I, pins } = G[gi], a = I[t], b = I[t + 1], c = I[t + 2]
    const ax = P[a * 3], az = P[a * 3 + 2], bx = P[b * 3], bz = P[b * 3 + 2], cxx = P[c * 3], czz = P[c * 3 + 2]
    const v0x = cxx - ax, v0z = czz - az, v1x = bx - ax, v1z = bz - az, v2x = px - ax, v2z = pz - az
    const d00 = v0x * v0x + v0z * v0z, d01 = v0x * v1x + v0z * v1z, d11 = v1x * v1x + v1z * v1z
    const d20 = v2x * v0x + v2z * v0z, d21 = v2x * v1x + v2z * v1z
    const denom = d00 * d11 - d01 * d01
    if (Math.abs(denom) < 1e-12) return null
    const wc = (d11 * d20 - d01 * d21) / denom, wb = (d00 * d21 - d01 * d20) / denom, wa = 1 - wc - wb
    const EPS = 1e-4
    if (wa < -EPS || wb < -EPS || wc < -EPS) return null
    return { raw: drawnRaw(pins, a, rawAt(ax, az)) * wa + drawnRaw(pins, b, rawAt(bx, bz)) * wb + drawnRaw(pins, c, rawAt(cxx, czz)) * wc,
      y: P[a * 3 + 1] * wa + P[b * 3 + 1] * wb + P[c * 3 + 1] * wc, inside: Math.min(wa, wb, wc) }
  }
  /** The drawn ground at (x, z): the top-most group's triangle → { raw, y, group }, or null off the mesh.
   *  ⭐ Among triangles of one renderOrder, the one that CONTAINS the point wins (the largest smallest weight), so a neighbour
   *  the tolerance also admits is never EXTRAPOLATED: at a point 3.8e-5 outside it, a corner 151 mm away read the shore
   *  5.7 µm off a line its own triangle holds exactly (Huron, 2026-10-27). The GPU's raster never extrapolates; this matches it.
   *  Ties of equal containment keep the last, as before. */
  function partsAt(x, z) {
    const k = cz(z) * nx + cx(x)
    let best = null, bestRO = -Infinity, bestG = null
    for (let r = count[k]; r < count[k + 1]; r++) {
      const gi = refG[r], ro = G[gi].ro
      if (ro < bestRO) continue
      const s = sample(gi, refT[r], x, z)
      if (s !== null && (ro > bestRO || s.inside >= best.inside)) { best = s; bestRO = ro; bestG = G[gi].g.id }
    }
    return best && { raw: best.raw, y: best.y, group: bestG }
  }
  const heightAt = (x, z, exag) => { const p = partsAt(x, z); return p ? p.raw * exag + p.y : null }
  return { partsAt, heightAt, triCount }
}
