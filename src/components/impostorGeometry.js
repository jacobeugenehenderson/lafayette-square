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

// Deterministic pseudo-random in [0,1) — stable across rebuilds so the foliage
// layout doesn't shuffle every render (no Math.random).
function _h3(a, b, c) {
  const x = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453
  return x - Math.floor(x)
}

/**
 * buildOverheadHulaGeometry — the OVERHEAD impostor: a stack of horizontal
 * "cake-layer" canopies of FLAT LEAF CARDS, seen from directly above (Browse /
 * plan view). Doctrine: HANDOFF-overhead-hula-impostor.md.
 *
 * Where the front-on `buildImpostorGeometry` emits vertical cross-cards, this
 * fills each cake-layer with a field of small alpha-cutout leaf cards (each card
 * samples the WHOLE leaf tile, so it reads as foliage from above — not one
 * stretched leaf) scattered on a jittered polar grid, at rising heights. Cards
 * get slightly varied normals so the studio light DAPPLES them into a canopy
 * instead of a flat plate. The shared-material vertex shader layers three
 * animated deformers on top (treeAtlasMaterial.js#injectFoliageSway):
 *   1. ruche-flex   — the shader flexes a STANDING azimuthal scallop baked per
 *                     card (aRuffle = sin(FOLDS·θ), NO travel term) → uRuffleDepth
 *   2. hula-rock    — each layer rocks on a slowly-drifting horizontal axis,
 *                     base-anchored + phase-lagged up the stack → uHulaAmount
 *   3. shared wind  — the SAME treeSwayUniforms the mesh trees use leans + gusts
 *                     the whole stack downwind (aWindTier=3 → full canopy flutter).
 * Per-instance fold phase is FREE: the scallop is baked in local space; the
 * per-placement rotY (instance matrix) shifts its world phase → no stamped grid.
 *
 * @param {object} rec     { heightM, canopyRadiusM, trunkFrac, leafRect } (or an
 *                         impostorBySpecies[species] record with those fields)
 * @param {string} season  'summer' | 'winter' | 'spring' | 'fall'
 * @param {object} opts    { folds, layers, rings, sectors, cardScale } overrides
 */
export function buildOverheadHulaGeometry(rec, season = 'summer', opts = {}) {
  if (!rec) return null

  const H = rec.heightM || 14
  const R = Math.max(0.5, rec.canopyRadiusM || 5)
  const trunkFrac = Math.min(0.6, Math.max(0, rec.trunkFrac ?? 0.15))
  const leafRect = rec.leafRect
    || (rec.seasons?.[season] || rec.seasons?.summer || []).find(l => l.kind !== 'bark')?.atlasRect
    || { offsetU: 0, offsetV: 0, scaleU: 1, scaleV: 1 }

  const FOLDS = Math.max(3, Math.round(opts.folds ?? 7))       // azimuthal scallop count
  const canopySlabs = (rec.seasons?.[season] || rec.seasons?.summer || [])
    .filter(l => l.kind !== 'bark').length
  const NLAYERS = Math.max(3, opts.layers ?? canopySlabs ?? 5)  // cake layers up the crown
  const RINGS = Math.max(2, Math.round(opts.rings ?? 4))        // radial rings of cards / layer
  const BASE_SECTORS = Math.max(6, Math.round(opts.sectors ?? 16))
  const cardScale = opts.cardScale ?? 0.55                      // card footprint as frac of R

  const positions = []
  const uvs = []
  const normals = []
  const aBark = []
  const aBarkRegion = []
  const aWindTier = []
  const aTreeHeightNorm = []
  const aRuffle = []
  const aOverhead = []
  const indices = []

  const { offsetU, offsetV, scaleU, scaleV } = leafRect
  // Leaf-tile UV corners (bl, br, tr, tl) — the whole tile per card.
  const uvBL = [offsetU, offsetV + scaleV]
  const uvBR = [offsetU + scaleU, offsetV + scaleV]
  const uvTR = [offsetU + scaleU, offsetV]
  const uvTL = [offsetU, offsetV]

  // One flat leaf card: a quad centred at (cx,cy,cz), lying near-horizontal,
  // rotated by phi about Y, with a slightly tilted normal `n` for dapple.
  const pushCard = (cx, cy, cz, size, phi, n, ruffle, yNorm) => {
    const half = size * 0.5
    const c = Math.cos(phi), s = Math.sin(phi)
    // Two in-plane axes (horizontal card, rotated about Y).
    const ux = c * half, uz = s * half
    const vx = -s * half, vz = c * half
    const base = positions.length / 3
    // 4 corners: (-u-v)(+u-v)(+u+v)(-u+v)
    positions.push(cx - ux - vx, cy, cz - uz - vz)
    positions.push(cx + ux - vx, cy, cz + uz - vz)
    positions.push(cx + ux + vx, cy, cz + uz + vz)
    positions.push(cx - ux + vx, cy, cz - uz + vz)
    uvs.push(uvBL[0], uvBL[1], uvBR[0], uvBR[1], uvTR[0], uvTR[1], uvTL[0], uvTL[1])
    for (let v = 0; v < 4; v++) {
      normals.push(n[0], n[1], n[2])
      aBark.push(0); aBarkRegion.push(0); aWindTier.push(3)
      aTreeHeightNorm.push(yNorm); aRuffle.push(ruffle); aOverhead.push(1)
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  const profile = (t) => 0.55 + 0.45 * Math.sin(Math.PI * (0.15 + 0.85 * t))
  const layerThk = Math.max(0.4, H * 0.06)   // vertical scatter within a layer

  for (let li = 0; li < NLAYERS; li++) {
    const t = NLAYERS === 1 ? 0.5 : li / (NLAYERS - 1)
    const yNorm = trunkFrac + (1 - trunkFrac) * t
    const y = yNorm * H
    const radius = R * profile(t)

    // Centre card (fills the middle so the crown isn't hollow from above).
    pushCard(0, y + (_h3(li, 0, 9) - 0.5) * layerThk, 0,
      R * cardScale * 1.1, _h3(li, 0, 1) * Math.PI * 2, [0, 1, 0], 0, yNorm)

    for (let ring = 0; ring < RINGS; ring++) {
      const rFrac = (ring + 0.5) / RINGS
      const ringR = radius * rFrac
      const sectors = Math.max(4, Math.round(BASE_SECTORS * rFrac))
      for (let sct = 0; sct < sectors; sct++) {
        const jr = _h3(li, ring, sct + 1)
        const jt = _h3(li, ring, sct + 51)
        const jp = _h3(li, ring, sct + 101)
        const jn1 = _h3(li, ring, sct + 151)
        const jn2 = _h3(li, ring, sct + 201)
        const theta = (sct + (jt - 0.5) * 0.8) / sectors * Math.PI * 2
        const rr = ringR * (0.85 + 0.3 * jr)
        const cx = rr * Math.cos(theta)
        const cz = rr * Math.sin(theta)
        const cy = y + (jp - 0.5) * layerThk
        // Slightly tilted normal → the studio directional light dapples the
        // canopy instead of lighting every card identically.
        const nx = (jn1 - 0.5) * 0.8, nz = (jn2 - 0.5) * 0.8
        const nl = Math.hypot(nx, 1.5, nz)
        const n = [nx / nl, 1.5 / nl, nz / nl]
        const size = R * cardScale * (0.7 + 0.5 * jr)
        const phi = jp * Math.PI * 2
        // Standing azimuthal scallop, baked local; rotY rotates it per instance.
        const ruffle = Math.sin(FOLDS * theta)
        pushCard(cx, cy, cz, size, phi, n, ruffle, yNorm)
      }
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
  // Overhead-only deformer attributes. Mesh trees lack these (default 0) → the
  // shader's ruche+hula block is a no-op on them (bit-exact regression-safe).
  g.setAttribute('aRuffle', new THREE.Float32BufferAttribute(aRuffle, 1))
  g.setAttribute('aOverhead', new THREE.Float32BufferAttribute(aOverhead, 1))
  g.setIndex(indices)
  g.computeBoundingSphere()
  return g
}
