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

// Deterministic hash in [0,1) for the procedural branch layout (no Math.random,
// so the skeleton is stable across rebuilds; per-instance variety comes from the
// instance rotY, not a reseed).
function _bh(a, b) {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return x - Math.floor(x)
}

/**
 * buildBranchSkeleton — the procedural woody backbone of the overhead impostor
 * (Stage 1). A few primary limbs radiate from the crown centre, tapering
 * uniformly base→tip, rising then reaching outward, forking once; flat, tapered
 * horizontal ribbons so from directly above they read as branches radiating out
 * through the canopy gaps (and, in winter, ARE the impostor). Opaque + flat-
 * shaded (cheap, writes depth). The umbrella lobes + leaf clusters hang off the
 * tips in later stages. Carries aOverhead/aTreeHeightNorm/aRuffle/aWindTier so the
 * flat wiggle material (injectOverheadWiggle) sways the whole skeleton in x/y.
 *
 * @param {object} rec  { heightM, canopyRadiusM, trunkFrac }
 * @param {object} opts { primary, seed, baseWidth, tipWidth, forkChance } overrides
 */
// Shared procedural branch LAYOUT — the limb node-paths + their tip positions.
// Both buildBranchSkeleton (draws the ribbons) and buildUmbrellaShell (bulges its
// lobes at the tips) consume this, so the canopy shape follows the branches. Same
// seed → same layout, so they register perfectly.
function generateBranches(rec, opts = {}) {
  const H = rec.heightM || 14
  const R = Math.max(0.5, rec.canopyRadiusM || 5)
  const trunkFrac = Math.min(0.6, Math.max(0, rec.trunkFrac ?? 0.15))
  const crownBaseY = trunkFrac * H
  const crownSpan = Math.max(1, H - crownBaseY)
  const NPRIMARY = Math.max(3, Math.round(opts.primary ?? 6))
  const seed = opts.seed ?? 1
  const baseW = opts.baseWidth ?? Math.max(0.25, R * 0.05)
  const tipW = opts.tipWidth ?? baseW * 0.18
  const forkChance = opts.forkChance ?? 0.6

  const buildPath = (az, reach, rise, segs, wBase, wTip, salt) => {
    const nodes = []
    const bendPhase = _bh(salt, 30) * 6.2831853
    const bendAmp = 0.18 + 0.30 * _bh(salt, 31)
    const bendFreq = 1.0 + 1.6 * _bh(salt, 32)
    for (let s = 0; s <= segs; s++) {
      const t = s / segs
      const r = reach * t
      const y = crownBaseY + crownSpan * rise * (t * (2 - t))
                + (_bh(salt, s + 40) - 0.5) * crownSpan * 0.07
      const azWander = Math.sin(t * Math.PI * bendFreq + bendPhase) * bendAmp * t
      const azNoise = (_bh(salt, s + 3) - 0.5) * 0.18
      const azS = az + azWander + azNoise
      const taperW = wBase + (wTip - wBase) * t
      const wJit = 0.72 + 0.56 * _bh(salt, s + 50)
      nodes.push({ x: r * Math.cos(azS), z: r * Math.sin(azS), y, w: taperW * wJit })
    }
    return nodes
  }

  const limbs = []
  const tips = []
  for (let i = 0; i < NPRIMARY; i++) {
    const salt = seed * 17 + i * 7
    const az = ((i + 0.5) / NPRIMARY) * Math.PI * 2 + (_bh(salt, 1) - 0.5) * 0.4
    // Reach stays INSIDE the canopy (leaves extend past the tips), so branches
    // don't poke out as spider-legs.
    const reach = R * (0.5 + 0.22 * _bh(salt, 2))
    const rise = 0.55 + 0.35 * _bh(salt, 5)
    const primary = buildPath(az, reach, rise, 6, baseW, tipW, salt)
    limbs.push(primary)
    const pt = primary[primary.length - 1]
    tips.push({ x: pt.x, z: pt.z, y: pt.y, az, reach })

    if (_bh(salt, 9) < forkChance) {
      const anchor = primary[Math.min(primary.length - 1, 3)]
      const fAz = az + (_bh(salt, 11) < 0.5 ? -1 : 1) * (0.4 + 0.3 * _bh(salt, 12))
      const fReach = reach * (0.35 + 0.25 * _bh(salt, 13))
      const fork = []
      const segs = 4
      for (let s = 0; s <= segs; s++) {
        const t = s / segs
        const azS = fAz + Math.sin(t * Math.PI * 1.4 + _bh(salt, 15) * 6.28) * 0.22 * t
                        + (_bh(salt, s + 20) - 0.5) * 0.18
        const r = fReach * t
        const wJit = 0.72 + 0.56 * _bh(salt, s + 60)
        fork.push({
          x: anchor.x + r * Math.cos(azS),
          z: anchor.z + r * Math.sin(azS),
          y: anchor.y + crownSpan * 0.12 * t + (_bh(salt, s + 70) - 0.5) * crownSpan * 0.05,
          w: anchor.w * 0.7 * (1 - 0.7 * t) * wJit,
        })
      }
      limbs.push(fork)
      const ft = fork[fork.length - 1]
      tips.push({ x: ft.x, z: ft.z, y: ft.y, az: Math.atan2(ft.z, ft.x), reach: Math.hypot(ft.x, ft.z) })
    }
  }
  return { limbs, tips, H, R, crownBaseY, crownSpan }
}

/**
 * buildBranchSkeleton — draws the procedural limbs as continuous mitered ribbons
 * (see generateBranches). Flat, tapered, opaque; the woody backbone read from
 * directly above (and the whole impostor in winter).
 */
export function buildBranchSkeleton(rec, opts = {}) {
  if (!rec) return null
  const { limbs, H } = generateBranches(rec, opts)

  const positions = []
  const normals = []
  const aWindTier = []
  const aTreeHeightNorm = []
  const aRuffle = []
  const aOverhead = []
  const indices = []

  const emitLimb = (nodes) => {
    const L = nodes.length
    if (L < 2) return
    const startBase = positions.length / 3
    for (let k = 0; k < L; k++) {
      let ix = 0, iz = 0, ox = 0, oz = 0
      if (k > 0) {
        ix = nodes[k].x - nodes[k - 1].x; iz = nodes[k].z - nodes[k - 1].z
        const l = Math.hypot(ix, iz) || 1; ix /= l; iz /= l
      }
      if (k < L - 1) {
        ox = nodes[k + 1].x - nodes[k].x; oz = nodes[k + 1].z - nodes[k].z
        const l = Math.hypot(ox, oz) || 1; ox /= l; oz /= l
      }
      let dx = ix + ox, dz = iz + oz
      const dl = Math.hypot(dx, dz)
      if (dl < 1e-4) { dx = ox || ix; dz = oz || iz } else { dx /= dl; dz /= dl }
      const px = -dz, pz = dx
      const n = nodes[k], w = n.w * 0.5
      positions.push(n.x - px * w, n.y, n.z - pz * w)
      positions.push(n.x + px * w, n.y, n.z + pz * w)
      const h = Math.min(1, Math.max(0, n.y / H))
      for (let v = 0; v < 2; v++) {
        normals.push(0, 1, 0)
        aWindTier.push(1); aTreeHeightNorm.push(h); aRuffle.push(0); aOverhead.push(1)
      }
    }
    for (let k = 0; k < L - 1; k++) {
      const a = startBase + k * 2, b = a + 1
      const c = startBase + (k + 1) * 2, d = c + 1
      indices.push(a, b, d, a, d, c)
    }
  }

  for (const limb of limbs) emitLimb(limb)

  if (positions.length === 0) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  g.setAttribute('aWindTier', new THREE.Float32BufferAttribute(aWindTier, 1))
  g.setAttribute('aTreeHeightNorm', new THREE.Float32BufferAttribute(aTreeHeightNorm, 1))
  g.setAttribute('aRuffle', new THREE.Float32BufferAttribute(aRuffle, 1))
  g.setAttribute('aOverhead', new THREE.Float32BufferAttribute(aOverhead, 1))
  g.setIndex(indices)
  g.computeBoundingSphere()
  return g
}

// Shared radial-dome mesh builder for the translucent canopy layers (umbrella +
// cloud). radiusFn(theta)→{r, rimY} gives the per-azimuth outer radius + rim
// height; centerY is the dome apex. Planar RADIAL uv (center→0.5, rim→edge) so a
// soft radial-gradient texture reads as opaque-core → transparent-rim. windTier
// sets the sway scale; ruffleRim toggles the standing rim scallop.
function _radialDome({ radiusFn, centerY, H, rings, perim, folds, windTier, ruffleRim }) {
  const positions = [], normals = [], uvs = []
  const aWindTier = [], aTreeHeightNorm = [], aRuffle = [], aOverhead = [], indices = []
  const RR = Math.max(2, rings), P = Math.max(8, perim)

  positions.push(0, centerY, 0); uvs.push(0.5, 0.5); normals.push(0, 1, 0)
  aWindTier.push(windTier); aTreeHeightNorm.push(Math.min(1, centerY / H)); aRuffle.push(0); aOverhead.push(1)

  for (let ri = 1; ri <= RR; ri++) {
    const rFrac = ri / RR
    for (let j = 0; j < P; j++) {
      const theta = (j / P) * Math.PI * 2
      const { r, rimY } = radiusFn(theta)
      const rad = r * rFrac
      const cx = rad * Math.cos(theta), cz = rad * Math.sin(theta)
      // Parabolic dome: apex at centre, drooping to rimY at the rim.
      const y = rimY + (centerY - rimY) * (1 - rFrac * rFrac)
      positions.push(cx, y, cz)
      normals.push(0, 1, 0)                    // translucent layer — soft flat lighting
      uvs.push(0.5 + 0.5 * rFrac * Math.cos(theta), 0.5 + 0.5 * rFrac * Math.sin(theta))
      aWindTier.push(windTier); aTreeHeightNorm.push(Math.min(1, Math.max(0, y / H)))
      aRuffle.push(ruffleRim ? Math.sin(folds * theta) * rFrac : 0); aOverhead.push(1)
    }
  }
  for (let j = 0; j < P; j++) indices.push(0, 1 + j, 1 + ((j + 1) % P))
  for (let ri = 0; ri < RR - 1; ri++) {
    const r0 = 1 + ri * P, r1 = 1 + (ri + 1) * P
    for (let j = 0; j < P; j++) {
      const jn = (j + 1) % P
      indices.push(r0 + j, r0 + jn, r1 + j, r0 + jn, r1 + jn, r1 + j)
    }
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setAttribute('aWindTier', new THREE.Float32BufferAttribute(aWindTier, 1))
  g.setAttribute('aTreeHeightNorm', new THREE.Float32BufferAttribute(aTreeHeightNorm, 1))
  g.setAttribute('aRuffle', new THREE.Float32BufferAttribute(aRuffle, 1))
  g.setAttribute('aOverhead', new THREE.Float32BufferAttribute(aOverhead, 1))
  g.setIndex(indices)
  g.computeBoundingSphere()
  return g
}

/**
 * buildUmbrellaShell — the irregular umbrella: a domed surface whose lobes BULGE
 * at the branch tips (nearest-tip raised-cosine radius) and dip between, apex at
 * the crown top drooping to the tip heights. Semi-transparent, soft-alpha rim
 * (radial-gradient skin), rim-ruched. Rides the hula wiggle.
 */
export function buildUmbrellaShell(rec, opts = {}) {
  if (!rec) return null
  const { tips, H, R, crownBaseY, crownSpan } = generateBranches(rec, opts)
  if (!tips.length) return null
  const meanReach = tips.reduce((a, t) => a + t.reach, 0) / tips.length
  const rmin = meanReach * (opts.dip ?? 0.55)
  const sigma = (Math.PI / Math.max(3, tips.length)) * (opts.lobeWidth ?? 1.0)
  const centerY = crownBaseY + crownSpan * (opts.centerRise ?? 0.98)
  const folds = Math.max(3, Math.round(opts.folds ?? 7))
  const radiusFn = (theta) => {
    let best = 1e9, tip = tips[0]
    for (const t of tips) {
      let d = Math.abs(theta - t.az); d = Math.min(d, 2 * Math.PI - d)
      if (d < best) { best = d; tip = t }
    }
    const inf = Math.exp(-(best / sigma) * (best / sigma))
    return { r: rmin + (tip.reach - rmin) * inf, rimY: tip.y }
  }
  return _radialDome({
    radiusFn, centerY, H,
    rings: opts.rings ?? 6, perim: opts.perimeter ?? 72,
    folds, windTier: 3, ruffleRim: true,
  })
}

/**
 * buildGradientCloud — the hazy mass filling between the limbs: a broad, low,
 * very translucent dome (soft radial-gradient skin), the innermost layer the
 * umbrella + leaves composite over for depth. Doesn't ruffle.
 */
export function buildGradientCloud(rec, opts = {}) {
  if (!rec) return null
  const H = rec.heightM || 14
  const R = Math.max(0.5, rec.canopyRadiusM || 5)
  const trunkFrac = Math.min(0.6, Math.max(0, rec.trunkFrac ?? 0.15))
  const crownBaseY = trunkFrac * H
  const crownSpan = Math.max(1, H - crownBaseY)
  const cloudR = R * (opts.spread ?? 0.95)
  const centerY = crownBaseY + crownSpan * (opts.rise ?? 0.72)
  const rimY = crownBaseY + crownSpan * (opts.rimRise ?? 0.4)
  const radiusFn = () => ({ r: cloudR, rimY })
  return _radialDome({
    radiusFn, centerY, H,
    rings: opts.rings ?? 4, perim: opts.perimeter ?? 48,
    folds: 5, windTier: 2, ruffleRim: false,
  })
}

/**
 * buildLeafClusters — the outer leaf shell (stage 3). Leaf cards CLUSTER at the
 * branch tips (real trees leaf at the twig ends), each card's STEM glued to a
 * point near the tip and its BODY free to flutter on a per-leaf random phase
 * (aLeafBody 0→1 ramps the flutter; aLeafPhase seeds it — see injectOverheadWiggle).
 * Blades fan outward + up so from directly above you read leaf silhouettes
 * radiating at the crown edge. Density ← leaves.occupancy, size ← leaves.scale.
 *
 * @param {object} rec  { heightM, canopyRadiusM, trunkFrac }
 * @param {object} opts { seed, occupancy, leafScale, leavesPerTip } (+ generateBranches opts)
 */
export function buildLeafClusters(rec, opts = {}) {
  if (!rec) return null
  const { limbs, H, R } = generateBranches(rec, opts)
  if (!limbs.length) return null
  const occupancy = Math.min(1, Math.max(0.15, opts.occupancy ?? 0.7))
  const leafScale = opts.leafScale ?? 1
  const way = opts.ways || 'alternate'
  const leafSize = Math.max(0.35, R * 0.2 * leafScale)
  const twigLen = R * 0.42                          // how far a twig reaches off a limb

  const positions = [], uvs = [], normals = []
  const aWindTier = [], aTreeHeightNorm = [], aRuffle = [], aOverhead = []
  const aLeafBody = [], aLeafPhase = [], indices = []

  // One leaf card: stem edge (aLeafBody 0) at anchor, blade edge (aLeafBody 1)
  // at anchor + dir·size; `side` is the in-plane width axis.
  const pushLeaf = (ax, ay, az, dir, side, size, w, phase, hnorm) => {
    const base = positions.length / 3
    const hw = w * 0.5
    const bx = ax + dir[0] * size, by = ay + dir[1] * size, bz = az + dir[2] * size
    positions.push(ax - side[0] * hw, ay - side[1] * hw, az - side[2] * hw)  // stem L
    positions.push(ax + side[0] * hw, ay + side[1] * hw, az + side[2] * hw)  // stem R
    positions.push(bx + side[0] * hw, by + side[1] * hw, bz + side[2] * hw)  // blade R
    positions.push(bx - side[0] * hw, by - side[1] * hw, bz - side[2] * hw)  // blade L
    uvs.push(0, 1, 1, 1, 1, 0, 0, 0)                    // stem at v=1, tip at v=0
    // Face normal = side × dir.
    let nx = side[1] * dir[2] - side[2] * dir[1]
    let ny = side[2] * dir[0] - side[0] * dir[2]
    let nz = side[0] * dir[1] - side[1] * dir[0]
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl
    const lb = [0, 0, 1, 1]
    for (let v = 0; v < 4; v++) {
      normals.push(nx, ny, nz)
      aWindTier.push(3); aTreeHeightNorm.push(hnorm); aRuffle.push(0); aOverhead.push(1)
      aLeafBody.push(lb[v]); aLeafPhase.push(phase)
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  const seed = opts.seed ?? 1

  // Point + XZ tangent along a limb path by param u∈[0,1].
  const limbAt = (limb, u) => {
    const f = u * (limb.length - 1)
    const i = Math.min(limb.length - 2, Math.max(0, Math.floor(f)))
    const fr = f - i
    const a = limb[i], b = limb[i + 1]
    return {
      x: a.x + (b.x - a.x) * fr, y: a.y + (b.y - a.y) * fr, z: a.z + (b.z - a.z) * fr,
      tx: b.x - a.x, tz: b.z - a.z,
    }
  }
  // Leaf-way → which sides carry a leaf at each twig node (the coefficient is the
  // blade's tilt off the twig axis toward that side). This is what makes the
  // arrangement read as REAL — leaves emerge from the twig in an ordered pattern.
  const sidesForWay = (w, ni) => {
    if (w === 'opposite') return [0.95, -0.95]                 // pairs each node
    if (w === 'whorled') return [0.95, -0.95, 0.0]             // 3 around each node
    return [ni % 2 === 0 ? 0.95 : -0.95]                       // alternate: flip each node
  }

  const NODES = 3                                              // leaf nodes per twig
  const SPAWN = 5                                              // twig spawn points along a limb
  const twigsPerSpawn = Math.max(1, Math.round(2 * occupancy) + 1)

  for (let li = 0; li < limbs.length; li++) {
    const limb = limbs[li]
    for (let sp = 0; sp < SPAWN; sp++) {
      const u = 0.12 + 0.84 * ((sp + 0.5) / SPAWN)             // twigs along most of the limb (fills the centre)
      const p = limbAt(limb, u)
      let tx = p.tx, tz = p.tz; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl
      const tangAz = Math.atan2(tz, tx)
      for (let tw = 0; tw < twigsPerSpawn; tw++) {
        const salt = seed * 7 + li * 53 + sp * 11 + tw * 3
        // Twig fans off the limb to alternating sides + up into the crown.
        const twigAz = tangAz + (tw % 2 ? 1 : -1) * (0.45 + 0.6 * _bh(salt, 1))
        const up = 0.28 + 0.4 * _bh(salt, 2)
        let dx = Math.cos(twigAz), dz = Math.sin(twigAz), dy = up
        const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl
        const twigSideX = -Math.sin(twigAz), twigSideZ = Math.cos(twigAz)
        const len = twigLen * (0.7 + 0.5 * _bh(salt, 3))
        const step = len / NODES
        for (let ni = 1; ni <= NODES; ni++) {
          const dd = ni * step
          const curve = Math.sin((ni / NODES) * Math.PI) * len * 0.12
          const nx = p.x + dx * dd + twigSideX * curve * (_bh(salt, ni + 10) - 0.5)
          const ny = p.y + dy * dd
          const nz = p.z + dz * dd + twigSideZ * curve * (_bh(salt, ni + 20) - 0.5)
          const sides = sidesForWay(way, ni)
          for (let si = 0; si < sides.length; si++) {
            const coef = sides[si]
            // Blade points along the twig, tilted to its side + a little up; the
            // petiole (stem edge) sits AT the node on the twig.
            let bx = dx + twigSideX * coef, by = dy + 0.25, bz = dz + twigSideZ * coef
            const bl = Math.hypot(bx, by, bz) || 1; bx /= bl; by /= bl; bz /= bl
            // Card width axis = horizontal perpendicular to the blade azimuth.
            const bAz = Math.atan2(bz, bx)
            const side = [-Math.sin(bAz), 0, Math.cos(bAz)]
            const size = leafSize * (0.8 + 0.4 * _bh(salt, ni * 7 + si + 30))
            const phase = _bh(salt, ni * 5 + si + 40) * 6.2831853
            const hnorm = Math.min(1, Math.max(0, ny / H))
            pushLeaf(nx, ny, nz, [bx, by, bz], side, size, size * 0.72, phase, hnorm)
          }
        }
      }
    }
  }

  if (!positions.length) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  g.setAttribute('aWindTier', new THREE.Float32BufferAttribute(aWindTier, 1))
  g.setAttribute('aTreeHeightNorm', new THREE.Float32BufferAttribute(aTreeHeightNorm, 1))
  g.setAttribute('aRuffle', new THREE.Float32BufferAttribute(aRuffle, 1))
  g.setAttribute('aOverhead', new THREE.Float32BufferAttribute(aOverhead, 1))
  g.setAttribute('aLeafBody', new THREE.Float32BufferAttribute(aLeafBody, 1))
  g.setAttribute('aLeafPhase', new THREE.Float32BufferAttribute(aLeafPhase, 1))
  g.setIndex(indices)
  g.computeBoundingSphere()
  return g
}
