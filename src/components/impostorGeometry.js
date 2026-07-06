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
 * buildOverheadHulaGeometry — the OVERHEAD impostor's carrier geometry: a short
 * stack of tessellated horizontal discs ("cake-layers"), each meant to be SKINNED
 * with a top-down RTT CAPTURE of the real tree (captureImpostor.js#captureTreeOverhead)
 * — the actual canopy-from-above, not procedural leaves. Doctrine + history:
 * HANDOFF-overhead-hula-impostor.md, and the captured-impostor arc (bake-impostors
 * / captureImpostor). The disc carries planar [0,1] UVs so the square capture maps
 * straight on. The shared-material vertex shader then layers three deformers:
 *   1. ruche-flex — a STANDING rim scallop (aRuffle = sin(FOLDS·θ)·radialFrac, NO
 *                   travel term) whose amplitude flexes with uRuffleDepth
 *   2. hula-rock  — each disc rocks base-anchored + phase-lagged up the stack (uHulaAmount)
 *   3. shared wind — treeSwayUniforms leans + gusts the stack downwind.
 * Per-instance fold phase is free: the scallop is baked local; instance rotY
 * shifts its world phase → no stamped grid across a neighbourhood.
 *
 * @param {object} rec     { heightM, canopyRadiusM, trunkFrac }
 * @param {string} season  'summer' | 'winter' | 'spring' | 'fall' (unused here; kept for parity)
 * @param {object} opts    { folds, layers, perimeter, radialRings, pad } overrides
 */
export function buildOverheadHulaGeometry(rec, season = 'summer', opts = {}) {
  if (!rec) return null

  const H = rec.heightM || 14
  const R = Math.max(0.5, rec.canopyRadiusM || 5)
  const pad = opts.pad ?? 1.5                     // must match captureTreeOverhead's FRAME_PAD_M
  const discR = R + pad                           // disc extent = capture frame half-extent

  const FOLDS = Math.max(3, Math.round(opts.folds ?? 7))          // rim scallop count
  const P = Math.max(3 * FOLDS, Math.round(opts.perimeter ?? 48)) // angular segments
  const RR = Math.max(2, Math.round(opts.radialRings ?? 6))       // radial tessellation
  const NLAYERS = Math.max(1, Math.round(opts.layers ?? 2))       // stacked discs (parallax)
  // The stack sits at the crown — a thin canopy shell [yLo,1] so the hula is
  // base-anchored (lower discs barely move, the top rocks) but all discs read
  // from above. yLo defaults just below the crown.
  const yLo = opts.yLo ?? 0.82
  // Dome height — the canopy mounds toward its centre (a parabolic cap) so it
  // reads as a 3D crown from above (catches light, tilts under the hula) instead
  // of a flat plate. Fraction of canopy radius.
  const domeH = discR * (opts.dome ?? 0.4)

  const positions = []
  const uvs = []
  const normals = []
  const aWindTier = []
  const aTreeHeightNorm = []
  const aRuffle = []
  const aOverhead = []
  const aBark = []
  const indices = []

  for (let li = 0; li < NLAYERS; li++) {
    const lt = NLAYERS === 1 ? 1 : li / (NLAYERS - 1)
    const yNorm = yLo + (1 - yLo) * lt
    const y = yNorm * H
    // Slight per-layer size taper (upper discs a touch smaller) for gentle dome.
    const layerR = discR * (0.9 + 0.1 * lt)
    const base = positions.length / 3

    // Slope of the dome normal's horizontal component (∂y/∂r = -2·domeH·r/R²).
    const nh = domeH > 0 ? 2 * domeH / (layerR * layerR) : 0

    // Center vertex — top of the dome.
    positions.push(0, y + domeH, 0)
    uvs.push(0.5, 0.5)
    normals.push(0, 1, 0)
    aWindTier.push(3); aTreeHeightNorm.push(yNorm); aRuffle.push(0); aOverhead.push(1); aBark.push(0)

    // Radial rings × angular segments.
    for (let ri = 1; ri <= RR; ri++) {
      const rFrac = ri / RR
      const rad = layerR * rFrac
      // Parabolic dome: full height at the centre, 0 at the rim.
      const domeY = y + domeH * (1 - rFrac * rFrac)
      for (let j = 0; j < P; j++) {
        const theta = (j / P) * Math.PI * 2
        const cx = rad * Math.cos(theta)
        const cz = rad * Math.sin(theta)
        positions.push(cx, domeY, cz)
        // Planar UV [0,1] over the disc's own extent → the full square capture.
        uvs.push(0.5 + 0.5 * cx / layerR, 0.5 + 0.5 * cz / layerR)
        // Dome normal — points up + radially outward (mound shading).
        const nx = nh * cx, nz = nh * cz
        const nl = Math.hypot(nx, 1, nz)
        normals.push(nx / nl, 1 / nl, nz / nl)
        aWindTier.push(3); aTreeHeightNorm.push(yNorm)
        // Rim-weighted standing scallop: 0 at center, full at the rim.
        aRuffle.push(Math.sin(FOLDS * theta) * rFrac)
        aOverhead.push(1); aBark.push(0)
      }
    }

    // Indices: center fan to ring 1, then quad strips between rings.
    for (let j = 0; j < P; j++) {
      const a = base + 1 + j
      const b = base + 1 + ((j + 1) % P)
      indices.push(base, a, b)
    }
    for (let ri = 0; ri < RR - 1; ri++) {
      const r0 = base + 1 + ri * P
      const r1 = base + 1 + (ri + 1) * P
      for (let j = 0; j < P; j++) {
        const jn = (j + 1) % P
        indices.push(r0 + j, r0 + jn, r1 + j)
        indices.push(r0 + jn, r1 + jn, r1 + j)
      }
    }
  }

  if (positions.length === 0) return null

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  // Dome normals (up + radially outward) so the crown catches light as a mound.
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  g.setAttribute('aWindTier', new THREE.Float32BufferAttribute(aWindTier, 1))
  g.setAttribute('aTreeHeightNorm', new THREE.Float32BufferAttribute(aTreeHeightNorm, 1))
  g.setAttribute('aRuffle', new THREE.Float32BufferAttribute(aRuffle, 1))
  g.setAttribute('aOverhead', new THREE.Float32BufferAttribute(aOverhead, 1))
  // aBark=0 everywhere → the shared material's bark path is skipped; the disc
  // shows the raw map sample (the overhead capture) on the leaf path.
  g.setAttribute('aBark', new THREE.Float32BufferAttribute(aBark, 1))
  g.setIndex(indices)
  g.computeBoundingSphere()
  return g
}
