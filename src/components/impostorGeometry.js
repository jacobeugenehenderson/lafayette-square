/**
 * impostorGeometry.js — billboard geometry for the captured-texture tree
 * impostors (Arc 2, Phase 1 — captured-impostor arc).
 *
 *   buildXImpostorGeometry  — the HERO impostor: an "X" cross of two
 *                             perpendicular quads, FULL-quad UVs (0..1), sized
 *                             to the tree's real height × 2·canopyRadius, base
 *                             at y=0. Textured (in InstancedTrees#XImpostor)
 *                             with a render-to-texture CAPTURE of the real tree
 *                             (captureImpostor.js) — so the silhouette is
 *                             correct BY CONSTRUCTION, not sampled from atlas
 *                             tiles. This replaces the FAILED analytic impostor
 *                             (cross-quads sampling bark/leaf atlas TILES, which
 *                             read as dark leaf-slabs + a stone trunk at every
 *                             distance — operator-rejected 2026-06-25).
 *
 *   buildOpaqueCanopyGeometry — unchanged; the Phase-B opaque-articulated middle
 *                             tier's solid canopy shell.
 *
 * Why this is cheap: TWO quads per species (one geometry, instanced across every
 * impostor-role placement) replaces ~15K overdrawing alpha leaf cards per tree.
 * That's the standing perf fix the impostor arc exists for.
 *
 * The X geometry carries the per-vertex attributes the captured-impostor
 * material reads for base-anchored sway (aTreeHeightNorm) — the canopy hulas off
 * the SAME shared wind uniforms, trunk-base planted, sway growing with height.
 */
import * as THREE from 'three'

/**
 * Build the HERO X-impostor geometry: two perpendicular quads (an "X"/"+"
 * billboard) so the silhouette reads from any azimuth without an octahedral
 * capture (deferred). FULL-quad UVs (0..1) — the captured texture IS the tree,
 * so each quad spans the whole capture, NOT an atlas sub-rect. Sized to real
 * metres: height = heightM, width = 2·canopyRadiusM, base anchored at y=0.
 *
 * @param {number} heightM        real tree height (metres)
 * @param {number} canopyRadiusM  real canopy half-width (metres)
 * @returns {THREE.BufferGeometry}
 */
export function buildXImpostorGeometry(heightM, canopyRadiusM) {
  const h = Math.max(1, heightM || 12)
  const halfW = Math.max(0.5, canopyRadiusM || 4)

  const positions = []
  const normals = []
  const uvs = []
  const aTreeHeightNorm = []
  const indices = []

  // Two quads: plane 0 spans X (faces ±Z), plane 1 spans Z (faces ±X). Both run
  // full-height (0 → h) and full-width (-halfW → +halfW), full-quad UVs.
  for (let p = 0; p < 2; p++) {
    const base = positions.length / 3
    const ax = p === 0 ? halfW : 0
    const az = p === 0 ? 0 : halfW
    // 4 corners: (-w, 0) (+w, 0) (+w, h) (-w, h)
    positions.push(-ax, 0, -az,  ax, 0, az,  ax, h, az,  -ax, h, -az)
    // Capture is rendered +Y up, front-on; the RT texture is NOT flipped, so V=0
    // is the texture's top row = canopy. Map quad-bottom→V=1, quad-top→V=0 so
    // the world tree's base reads the capture's base. U across the width.
    uvs.push(
      0, 1,   // bottom-left
      1, 1,   // bottom-right
      1, 0,   // top-right
      0, 0,   // top-left
    )
    // Normals face UP — a billboard lit like a canopy reads acceptably flat-lit
    // from any azimuth (the capture already baked the tree's own shading; this
    // just keeps it from going black sideways under a low sun). Octahedral
    // per-azimuth normals are deferred (BATON-tree-render-next.md).
    for (let v = 0; v < 4; v++) {
      normals.push(0, 1, 0)
      // Base-anchored sway axis: 0 at the trunk base, 1 at the canopy top.
      aTreeHeightNorm.push((v === 0 || v === 1) ? 0 : 1)
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
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
