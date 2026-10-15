// drawnGround.js — THE DRAWN GROUND'S HEIGHT AT (x, z): ONE HOME (Boz, 2026-10-11; BRIEF-the-ground-knows-its-height).
//
// The ground the slab renders is `aRaw × uExag + y` per vertex (terrainShader.js `baked`): aRaw the bake's terrain part
// (`groundDeformer.mjs`), y the mesh's own kerb part. Anything that must sit ON that ground — a tree, a lamp, a
// building at bake time; a mover, the user's dot at runtime — reads it HERE, barycentric over the triangle of the
// top-most group at that point. ⛔ Never a second copy of this function: the bake's anchors (`cartograph/groundSampler.js`)
// and the runtime import this one, so the two cannot drift.
// ⭐ VIEWS, NOT COPIES: positions, indices and aRaw are read as typed-array views on the bin the caller already holds;
//   the only new memory is the triangle grid (two Int32Arrays). The old sampler copied 13 floats per triangle into a JS
//   array (~100 MB at HPDM's 1.9M triangles).
// ⚠️ THE MIGRATION PATH: a group whose bake predates the deformer carries no aRaw; its terrain part is the field at each
//   vertex (`rawAt`), which is exactly what the runtime draws for it (the texture). Said once per call, by the caller,
//   from `path` — and deleted once every slab carries the sections.

import { isWaterGroupId } from '../components/waterMaterial.js'

/** The groups the RUNTIME's drawn ground samples: the land the slab draws, never its water, never a group kept out of the
 *  partition. ONE predicate, read by BakedGround and by the revetment's worker, so the two cannot sample different grounds. */
export const isDrawnGroundGroup = (g) => !isWaterGroupId(g.id) && g.partition !== false

/** The drawn ground's two parts at (x, z), or the FIELD with y 0 off the mesh (`offMesh: true`) — what stands on the
 *  ground falls to where nothing is drawn. ONE home for that fall, read by `utils/elevation` and by the revetment's worker.
 *  @param drawn a makeDrawnGround result, or null before the ground has loaded · @param rawAt (x, z) → the field */
export function partsOrField(drawn, rawAt, x, z) {
  const p = drawn ? drawn.partsAt(x, z) : null
  return p ? { raw: p.raw, y: p.y } : { raw: rawAt(x, z), y: 0, offMesh: true }
}

/** @param manifest ground.json ({ groups, bbox }) · @param bin ground.bin as an ArrayBuffer
 *  @param opts.groups (g) → whether this group is sampled (default: every group) · opts.rawAt (x, z) → the field, for a
 *  group with no aRaw (required if any sampled group lacks one) · opts.cell grid cell in metres (default 8)
 *  @returns { partsAt(x, z) → { raw, y, group } | null, heightAt(x, z, exag) → number | null, triCount, path, source }
 *  ⭐ `source` is what this was built from — the manifest narrowed to the sampled groups, and the same bin — so another
 *  thread can build the IDENTICAL ground with `makeDrawnGround(source.manifest, source.bin, { rawAt, cell: source.cell })`
 *  (the revetment's worker). The narrowing keeps the groups' order, which is the tie-break order. */
export function makeDrawnGround(manifest, bin, { groups: pick = () => true, rawAt = null, cell = 8 } = {}) {
  const G = []
  let baked = 0, field = 0
  for (const g of manifest.groups) {
    if (!pick(g)) continue
    const P = new Float32Array(bin, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(bin, g.indexByteOffset, g.indexCount)
    let R
    if (g.rawByteOffset != null) { R = new Float32Array(bin, g.rawByteOffset, g.vertexCount); baked++ }
    else {
      if (!rawAt) throw new Error(`drawnGround: group ${g.id} carries no baked terrain part and no field was given to read it from`)
      R = new Float32Array(g.vertexCount); for (let v = 0; v < g.vertexCount; v++) R[v] = rawAt(P[v * 3], P[v * 3 + 2]); field++
    }
    G.push({ g, P, I, R, ro: g.renderOrder })
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
    const { P, I, R } = G[gi], a = I[t], b = I[t + 1], c = I[t + 2]
    const ax = P[a * 3], az = P[a * 3 + 2], bx = P[b * 3], bz = P[b * 3 + 2], cxx = P[c * 3], czz = P[c * 3 + 2]
    const v0x = cxx - ax, v0z = czz - az, v1x = bx - ax, v1z = bz - az, v2x = px - ax, v2z = pz - az
    const d00 = v0x * v0x + v0z * v0z, d01 = v0x * v1x + v0z * v1z, d11 = v1x * v1x + v1z * v1z
    const d20 = v2x * v0x + v2z * v0z, d21 = v2x * v1x + v2z * v1z
    const denom = d00 * d11 - d01 * d01
    if (Math.abs(denom) < 1e-12) return null
    const wc = (d11 * d20 - d01 * d21) / denom, wb = (d00 * d21 - d01 * d20) / denom, wa = 1 - wc - wb
    const EPS = 1e-4
    if (wa < -EPS || wb < -EPS || wc < -EPS) return null
    return { raw: R[a] * wa + R[b] * wb + R[c] * wc, y: P[a * 3 + 1] * wa + P[b * 3 + 1] * wb + P[c * 3 + 1] * wc }
  }
  /** The drawn ground at (x, z): the top-most group's triangle → { raw, y, group }, or null off the mesh. */
  function partsAt(x, z) {
    const k = cz(z) * nx + cx(x)
    let best = null, bestRO = -Infinity, bestG = null
    for (let r = count[k]; r < count[k + 1]; r++) {
      const gi = refG[r], ro = G[gi].ro
      if (ro < bestRO) continue
      const s = sample(gi, refT[r], x, z)
      if (s !== null) { best = s; bestRO = ro; bestG = G[gi].g.id }
    }
    return best && { ...best, group: bestG }
  }
  const heightAt = (x, z, exag) => { const p = partsAt(x, z); return p ? p.raw * exag + p.y : null }
  const path = field === 0 ? 'baked' : baked === 0 ? 'field' : 'mixed'
  const source = { manifest: { groups: G.map(({ g }) => g), bbox: manifest.bbox }, bin, cell }
  return { partsAt, heightAt, triCount, path, groupsBaked: baked, groupsField: field, source }
}
