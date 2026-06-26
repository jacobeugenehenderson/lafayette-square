/**
 * impostorGeometry.js — build the layer-card geometry for a Hero tree impostor.
 *
 * The impostor is the WHOLE tree as a handful of stamped 2D layer cards
 * (doctrine: BATON-tree-render-next.md): a trunk card (bark) + N canopy slabs
 * (leaves), all anchored at the base and hula-ing together. This module turns
 * one species' baked impostor record (trees-atlas.json#impostorBySpecies, from
 * arborist/bake-impostors.js) into a single merged BufferGeometry whose UVs
 * sample the SAME unified tree atlas the near trees use — so it rides the exact
 * same shared material (one shader program, Bloom-stable, DoF'd/fogged/graded
 * like real geometry).
 *
 * Why this is cheap: ~a dozen quads per species (one geometry, instanced across
 * every impostor-role placement) replaces ~15K overdrawing alpha leaf cards per
 * tree. That's the standing perf fix the impostor arc exists for.
 *
 * The geometry carries the SAME per-vertex attributes the runtime-merge stamps
 * onto real trees (aBark, aBarkRegion, aWindTier, aTreeHeightNorm, aHeroTier)
 * so the shared material's bark-retint + sway + QC paths all light up
 * identically — base-anchored hula (sway ∝ position.y), trunk barely moves,
 * canopy slabs flutter (aWindTier 0 vs 3).
 */
import * as THREE from 'three'

// Each canopy slab is a CROSS of two perpendicular quads (a "+" billboard) so
// the silhouette reads from any azimuth without a true octahedral capture
// (deferred to Phase 2). The trunk is a single cross too. Cheap: a 4-slab
// summer impostor = (1 trunk + 4 canopy) × 2 quads × 2 tris = 20 tris.
const CROSS_PLANES = 2

/**
 * Build one impostor geometry for a species from its baked record + the season
 * plan to render (default 'summer'). Returns a THREE.BufferGeometry in tree-
 * local metres (base at y=0, +y up), ready to instance — or null if the record
 * has no usable layers.
 *
 * @param {object} rec   impostorBySpecies[species] from trees-atlas.json
 * @param {string} season  'summer' | 'winter' | 'spring' | 'fall'
 */
export function buildImpostorGeometry(rec, season = 'summer') {
  if (!rec) return null
  const layers = rec.seasons?.[season] || rec.seasons?.summer || []
  if (!layers.length) return null

  const heightM = rec.heightM || 12
  const radiusM = Math.max(0.5, rec.canopyRadiusM || 4)
  // Trunk half-width: a fraction of canopy radius (a slab card reads as a
  // trunk when it's narrow). Tuned visual proxy, not a measured trunk radius.
  const trunkHalfW = Math.max(0.15, radiusM * 0.12)

  const positions = []
  const uvs = []
  const aBark = []
  const aBarkRegion = []
  const aWindTier = []
  const aTreeHeightNorm = []
  const indices = []

  // Emit one camera-agnostic CROSS (two perpendicular quads) for a layer band
  // [yLo, yHi] (normalized height), with the given half-width + atlas rect.
  const pushCross = (yLo, yHi, halfW, rect, isBark) => {
    const y0 = yLo * heightM
    const y1 = yHi * heightM
    for (let p = 0; p < CROSS_PLANES; p++) {
      // Plane 0 spans X (faces ±Z); plane 1 spans Z (faces ±X).
      const base = positions.length / 3
      const ax = p === 0 ? halfW : 0
      const az = p === 0 ? 0 : halfW
      // 4 corners: (-h, y0) (+h, y0) (+h, y1) (-h, y1)
      positions.push(-ax, y0, -az,  ax, y0, az,  ax, y1, az,  -ax, y1, -az)
      // Sample the atlas rect: U across the card width, V across its height.
      // offset+scale map [0,1]→the species' tile sub-region of the unified atlas.
      const { offsetU, offsetV, scaleU, scaleV } = rect
      uvs.push(
        offsetU,           offsetV + scaleV,   // bottom-left
        offsetU + scaleU,  offsetV + scaleV,   // bottom-right
        offsetU + scaleU,  offsetV,            // top-right
        offsetU,           offsetV,            // top-left
      )
      const tier = isBark ? 0 : 3   // trunk barely sways; canopy flutters
      const region = isBark ? 1 : 0 // trunk card → 'trunk' region
      for (let v = 0; v < 4; v++) {
        aBark.push(isBark ? 1 : 0)
        aBarkRegion.push(region)
        aWindTier.push(tier)
        // aTreeHeightNorm normalizes the vertex's Y up the tree [0,1] so the
        // deformer + sway anchor at the base and grow with height (real wood).
        const vy = (v === 0 || v === 1) ? yLo : yHi
        aTreeHeightNorm.push(Math.min(1, Math.max(0, vy)))
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }

  for (const layer of layers) {
    if (!layer.atlasRect) continue
    const isBark = layer.kind === 'bark'
    const halfW = isBark ? trunkHalfW : radiusM
    pushCross(layer.yLo, layer.yHi, halfW, layer.atlasRect, isBark)
  }

  if (positions.length === 0) return null

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  // The shared tree material samples `map` via the standard <map_fragment>
  // chunk → uv → vMapUv. NORMAL: a flat +Z normal per card is fine; the
  // atlas normal map relights it (3A.2). We give every vertex a +Z normal;
  // the cross's two planes face different ways but a flat lit billboard at
  // Hero distance reads acceptably (true per-card normals = Phase 2 polish).
  const nrm = new Float32Array(positions.length)
  for (let i = 0; i < nrm.length; i += 3) { nrm[i] = 0; nrm[i + 1] = 0; nrm[i + 2] = 1 }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  g.setAttribute('aBark', new THREE.Float32BufferAttribute(aBark, 1))
  g.setAttribute('aBarkRegion', new THREE.Float32BufferAttribute(aBarkRegion, 1))
  g.setAttribute('aWindTier', new THREE.Float32BufferAttribute(aWindTier, 1))
  g.setAttribute('aTreeHeightNorm', new THREE.Float32BufferAttribute(aTreeHeightNorm, 1))
  g.setIndex(indices)
  g.computeBoundingSphere()
  return g
}
