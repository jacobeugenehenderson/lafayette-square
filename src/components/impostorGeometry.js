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
  const normals = []
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
      // Per-card normal. The OLD code gave every card a flat +Z normal, but the
      // cross's plane 1 faces ±X — so under a low sun those cards got no light
      // and rendered as BLACK squares (2026-06-25). Fix: LEAF canopy cards get
      // an UP normal so they're lit from the sky/sun like a real canopy (never
      // fully black sideways); the TRUNK card keeps its true facing normal
      // (a shaded back reads fine on wood). Plane 0 spans X → faces +Z; plane 1
      // spans Z → faces +X.
      const nx = isBark ? (p === 0 ? 0 : 1) : 0
      const ny = isBark ? 0 : 1
      const nz = isBark ? (p === 0 ? 1 : 0) : 0
      for (let v = 0; v < 4; v++) {
        normals.push(nx, ny, nz)
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
  // Per-card normals are built in pushCross (leaf canopy → UP, lit like a
  // canopy; trunk → its facing normal) so a wrong-facing card never renders
  // unlit/black under a low sun. (Separate latent fix from the bloom-pyramid
  // black-square artifact.)
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  g.setAttribute('aBark', new THREE.Float32BufferAttribute(aBark, 1))
  g.setAttribute('aBarkRegion', new THREE.Float32BufferAttribute(aBarkRegion, 1))
  g.setAttribute('aWindTier', new THREE.Float32BufferAttribute(aWindTier, 1))
  g.setAttribute('aTreeHeightNorm', new THREE.Float32BufferAttribute(aTreeHeightNorm, 1))
  g.setIndex(indices)
  g.computeBoundingSphere()
  return g
}

// Tessellation of the opaque canopy ellipsoid. Coarse on purpose — the win is
// ONE opaque hull (early-Z, ~zero overdraw) replacing ~15K alpha leaf cards, so
// a low-poly sphere is exactly what we want. 12×8 → ~192 tris per canopy.
const SHELL_SEG_U = 12   // longitudinal (around)
const SHELL_SEG_V = 8    // latitudinal (pole→pole)

/**
 * Build the OPAQUE canopy-shell geometry for an opaque-articulated tree
 * (Phase B, 2026-06-25). A single foliage-textured ELLIPSOID hull sized from the
 * species' baked `opaque` record (shell.{centerY,radiusXZ,radiusY} in tree-local
 * metres, base at y=0). The whole point: rendered with the OPAQUE canopy material
 * (alphaTest off → writes depth → early-Z), so the canopy's pixels are shaded
 * once instead of the thousands-of-overdrawing-alpha-cards a real canopy is.
 *
 * Carries the SAME per-vertex attributes the shared shader reads (aBark=0 →
 * leaf-path tint; aWindTier=3 → canopy flutter; aTreeHeightNorm → base-anchored
 * sway/deformer; aBarkRegion=0) so it rides the exact same sway/bark/QC/terrain
 * code as every other tree. UVs wrap the whole ellipsoid across the leaf atlas
 * rect, so the shell samples the SAME foliage pixels the near trees use (no
 * material pop). Returns null when the record has no usable shell/leaf rect
 * (e.g. winter / bare ref) — the runtime then renders bark prims only.
 *
 * @param {object} rec   opaqueBySpecies[species] from trees-atlas.json
 * @param {string} season  'summer' | 'winter' | 'spring' | 'fall'
 */
export function buildOpaqueCanopyGeometry(rec, season = 'summer') {
  if (!rec) return null
  const plan = rec.seasons?.[season] || rec.seasons?.summer
  if (plan && plan.shell === false) return null   // deciduous bare — no shell this season
  const shell = rec.shell
  const leaf = rec.leafRect
  if (!shell || !leaf) return null

  const cY = shell.centerY
  const rXZ = Math.max(0.5, shell.radiusXZ)
  const rY = Math.max(0.5, shell.radiusY)

  const positions = []
  const normals = []
  const uvs = []
  const aBark = []
  const aBarkRegion = []
  const aWindTier = []
  const aTreeHeightNorm = []
  const indices = []

  const topY = cY + rY            // for aTreeHeightNorm normalization [0, top]
  // Ellipsoid surface: standard UV-sphere param, scaled per-axis. Normals are
  // the unit ellipsoid gradient (≈ unit sphere normal for a near-spherical hull;
  // good enough for canopy relighting under the sun/moon).
  for (let iv = 0; iv <= SHELL_SEG_V; iv++) {
    const v = iv / SHELL_SEG_V
    const phi = v * Math.PI                 // 0=top pole, π=bottom pole
    const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi)
    for (let iu = 0; iu <= SHELL_SEG_U; iu++) {
      const u = iu / SHELL_SEG_U
      const theta = u * Math.PI * 2
      const nx = sinPhi * Math.cos(theta)
      const ny = cosPhi
      const nz = sinPhi * Math.sin(theta)
      const px = nx * rXZ
      const py = cY + ny * rY
      const pz = nz * rXZ
      positions.push(px, py, pz)
      normals.push(nx, ny, nz)         // unit-sphere normal (canopy relights with TOD)
      // Sample the leaf atlas rect across the hull (u→U, v→V). Spherical
      // foliage texture reads acceptably wrapped — at opaque-tier distance the
      // canopy is a solid green volume, not a per-leaf read.
      uvs.push(
        leaf.offsetU + u * leaf.scaleU,
        leaf.offsetV + v * leaf.scaleV,
      )
      aBark.push(0)                    // leaf path (no bark retint)
      aBarkRegion.push(0)
      aWindTier.push(3)                // canopy tier → full flutter
      aTreeHeightNorm.push(Math.min(1, Math.max(0, topY > 0 ? py / topY : 0)))
    }
  }
  const rowLen = SHELL_SEG_U + 1
  for (let iv = 0; iv < SHELL_SEG_V; iv++) {
    for (let iu = 0; iu < SHELL_SEG_U; iu++) {
      const a = iv * rowLen + iu
      const b = a + 1
      const c = a + rowLen
      const d = c + 1
      indices.push(a, c, b,  b, c, d)
    }
  }

  if (positions.length === 0) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  g.setAttribute('aBark', new THREE.Float32BufferAttribute(aBark, 1))
  g.setAttribute('aBarkRegion', new THREE.Float32BufferAttribute(aBarkRegion, 1))
  g.setAttribute('aWindTier', new THREE.Float32BufferAttribute(aWindTier, 1))
  g.setAttribute('aTreeHeightNorm', new THREE.Float32BufferAttribute(aTreeHeightNorm, 1))
  g.setIndex(indices)
  g.computeBoundingSphere()
  return g
}
