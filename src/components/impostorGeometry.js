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

/**
 * buildOverheadHulaGeometry — the OVERHEAD impostor: a stack of horizontal
 * "cake-layer" discs meant to be seen from directly above (Browse / plan view).
 * Doctrine: HANDOFF-overhead-hula-impostor.md.
 *
 * Where the front-on `buildImpostorGeometry` above emits vertical cross-cards,
 * this emits a handful of FLAT, ALPHA-CUTOUT leaf discs at rising heights. Each
 * disc's rim is *ruched* — gathered into a fixed set of scallops around its
 * circumference (`aRuffle = sin(FOLDS·θ)`, a STANDING corrugation baked into the
 * geometry, NO travel term). The shared-material vertex shader then layers three
 * animated deformers on top (treeAtlasMaterial.js#injectFoliageSway):
 *   1. ruche-flex   — the shader flexes the baked scallop's amplitude (uRuffleDepth)
 *   2. hula-rock    — each disc rocks on a slowly-rotating horizontal axis,
 *                     base-anchored + phase-lagged up the stack (uHulaAmount)
 *   3. shared wind  — the SAME treeSwayUniforms the mesh trees use leans + gusts
 *                     the whole stack downwind (aWindTier=3 → full canopy flutter).
 * Per-instance fold phase is FREE: the scallop is baked in local space, and the
 * per-placement `rotY` in the instance matrix shifts its world phase — so 7,167
 * discs seen at once don't stamp into a synced grid.
 *
 * Stacked alpha-cutout discs (not one solid disc) give real vertical motion
 * parallax from above: you see through the leaf holes to the layers below.
 *
 * @param {object} rec     impostorBySpecies[species] from trees-atlas.json
 * @param {string} season  'summer' | 'winter' | 'spring' | 'fall'
 * @param {object} opts    { folds=7, perimeter=24, layers } overrides
 */
export function buildOverheadHulaGeometry(rec, season = 'summer', opts = {}) {
  if (!rec) return null

  const H = rec.heightM || 14
  const R = Math.max(0.5, rec.canopyRadiusM || 5)
  const trunkFrac = Math.min(0.6, Math.max(0, rec.trunkFrac ?? 0.15))
  const leafRect = rec.leafRect
    || (rec.seasons?.[season] || rec.seasons?.summer || []).find(l => l.kind !== 'bark')?.atlasRect
    || { offsetU: 0, offsetV: 0, scaleU: 1, scaleV: 1 }

  const FOLDS = Math.max(3, Math.round(opts.folds ?? 7))   // scallop count around the rim
  const P = Math.max(3 * FOLDS, Math.round(opts.perimeter ?? 24))  // perimeter segments
  // One disc per baked canopy slab (fall back to 5). Discs rise through the
  // CANOPY vertical extent [trunkFrac, 1] — the woody trunk isn't a ruched disc.
  const canopySlabs = (rec.seasons?.[season] || rec.seasons?.summer || [])
    .filter(l => l.kind !== 'bark').length
  const NLAYERS = Math.max(3, opts.layers ?? canopySlabs ?? 5)

  const positions = []
  const uvs = []
  const aBark = []
  const aBarkRegion = []
  const aWindTier = []
  const aTreeHeightNorm = []
  const aRuffle = []
  const aOverhead = []
  const indices = []

  const { offsetU, offsetV, scaleU, scaleV } = leafRect

  for (let li = 0; li < NLAYERS; li++) {
    const t = NLAYERS === 1 ? 0.5 : li / (NLAYERS - 1)     // 0 = lowest canopy disc, 1 = crown
    const yNorm = trunkFrac + (1 - trunkFrac) * t          // base-anchored height [trunkFrac,1]
    const y = yNorm * H
    // Canopy profile — full mid, tapering top+bottom (a soft dome from above).
    const radius = R * (0.55 + 0.45 * Math.sin(Math.PI * (0.15 + 0.85 * t)))

    const centerBase = positions.length / 3
    // Center vertex of the fan (samples the tile centre; no ruffle).
    positions.push(0, y, 0)
    uvs.push(offsetU + 0.5 * scaleU, offsetV + 0.5 * scaleV)
    aBark.push(0); aBarkRegion.push(0); aWindTier.push(3)
    aTreeHeightNorm.push(yNorm); aRuffle.push(0); aOverhead.push(1)

    for (let j = 0; j < P; j++) {
      const theta = (j / P) * Math.PI * 2
      const cx = Math.cos(theta), cz = Math.sin(theta)
      positions.push(radius * cx, y, radius * cz)
      // Planar UV: rim maps to the leaf tile's edges, so from above the disc
      // reads as the leaf cutout stamped into a circle.
      uvs.push(offsetU + (0.5 + 0.5 * cx) * scaleU, offsetV + (0.5 + 0.5 * cz) * scaleV)
      aBark.push(0); aBarkRegion.push(0); aWindTier.push(3)
      aTreeHeightNorm.push(yNorm)
      // Standing scallop — sin(FOLDS·θ). Baked in LOCAL space; the per-instance
      // rotY (instance matrix) rotates it → per-tree world phase (anti-stamping).
      aRuffle.push(Math.sin(FOLDS * theta))
      aOverhead.push(1)
    }
    // Triangle-fan: center → rim(j) → rim(j+1), wrapping.
    for (let j = 0; j < P; j++) {
      const a = centerBase + 1 + j
      const b = centerBase + 1 + ((j + 1) % P)
      indices.push(centerBase, a, b)
    }
  }

  if (positions.length === 0) return null

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  // Discs are horizontal → normal points +Y (up) so they light from the sky
  // (correct for the overhead plan view). The atlas normal map relights detail.
  const nrm = new Float32Array(positions.length)
  for (let i = 0; i < nrm.length; i += 3) { nrm[i] = 0; nrm[i + 1] = 1; nrm[i + 2] = 0 }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  g.setAttribute('aBark', new THREE.Float32BufferAttribute(aBark, 1))
  g.setAttribute('aBarkRegion', new THREE.Float32BufferAttribute(aBarkRegion, 1))
  g.setAttribute('aWindTier', new THREE.Float32BufferAttribute(aWindTier, 1))
  g.setAttribute('aTreeHeightNorm', new THREE.Float32BufferAttribute(aTreeHeightNorm, 1))
  // Overhead-only deformer attributes. Mesh trees lack these (default 0) → the
  // shader's ruche+hula block is a no-op on them (bit-exact regression-safe).
  g.setAttribute('aRuffle', new THREE.Float32BufferAttribute(aRuffle, 1))
  g.setAttribute('aOverhead', new THREE.Float32BufferAttribute(aOverhead, 1))
  g.setIndex(indices)
  g.computeBoundingSphere()
  return g
}
