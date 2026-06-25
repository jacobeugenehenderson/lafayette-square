/**
 * bake-impostors.js — the offline IMPOSTOR-capture step (Phase 1, Hero).
 *
 * ══ What an impostor is (doctrine, BATON-tree-render-next.md) ═══════════════
 * The cheapest tier of the geometry ladder (lod0 / lod1 / lod2 / impostor). The
 * `impostor` ROLE is decided at bake by bake-trees#classifyHeroTiers (per
 * placement, against the known hero camera track) — NOT by live camera
 * distance. An impostor-role tree renders as the WHOLE tree stamped into a
 * handful of 2D layer cards (trunk card + canopy slabs), hula-ing together but
 * anchored at the base, instead of thousands of overdrawing alpha leaf cards.
 * That's the standing perf fix: ~a dozen quads vs ~15K leaf cards per tree.
 *
 * ══ Phase-1 capture approach (a deliberate, documented tradeoff) ════════════
 * The ideal capture renders each species' real lod0 geometry to slice textures
 * offline (octahedral multi-view + normal map). That needs a headless GL
 * rasterizer in node — and this repo has NONE installed (`gl`, `canvas`,
 * `puppeteer` are all absent; bake-look reads GLBs via gltf-transform, which is
 * geometry-only, no rasterizer). Adding a heavy native GL dep is a poor first
 * increment.
 *
 * So Phase 1 captures the impostor ANALYTICALLY from assets the bake already
 * produces: the unified tree atlas (the SAME color+normal PNG the real trees
 * sample) + the per-species canopy dims. We do NOT render new textures. Instead
 * we emit, per species, a thin `impostor` record:
 *   - the species' BARK atlas UV rect  (offset+scale into the unified atlas)
 *   - the species' LEAF atlas UV rect
 *   - heightM, canopyRadiusM, trunkFrac (canopy-base Y ÷ height)
 *   - per-season layer plans (summer = full canopy slabs; winter = bare, no
 *     foliage slabs — leaves dropped, branch/trunk card kept).
 *
 * The runtime (impostorMaterial.js / ImpostorTrees) builds the layer cards as
 * textured quads that sample those atlas rects. Consequences — all GOOD and all
 * required by the doctrine:
 *   - Color / normal / season / posterize MATCH the near trees exactly (same
 *     atlas, same pixels). No separate art, no material pop (3A.1 + 3A.2 + 3A.5).
 *   - Rides the SAME atlas texture → one shader program family → Bloom-stable,
 *     gets DoF'd/fogged/graded like real geometry (3A.4, the optical-parity
 *     capstone invariant).
 *   - Season-parameterized FROM THE START (3A summer ships; winter plan is
 *     emitted so it can't be painted into a corner).
 *
 * ⚠️ EXPLICITLY DEFERRED to a later phase (do not attempt here):
 *   - True octahedral / multi-view capture (render-to-texture from real geo) —
 *     the azimuth-stable silhouette polish. Phase 1 canopy slabs are
 *     camera-facing (cylindrically symmetric leaf texture reads acceptably from
 *     any azimuth at Hero distance; wrong-silhouette is the #1 tell at close
 *     range, but impostor-role trees are by-definition far/occluded).
 *   - The Browse overhead "cake-layer" impostor + its own role oracle.
 *   - Winter RUNTIME switching (the plan is baked; the runtime wire is Phase 2).
 *
 * Pure module: no I/O. `captureImpostor()` takes already-loaded inputs and
 * returns a plain record; bake-look.js owns the loop + the manifest write.
 */

// Canopy-slab count for the summer Hero impostor. A handful of horizontal-ish
// billboard slabs stacked up the canopy gives real vertical motion-parallax
// under the hula (a single flat card can't) while staying ~a dozen quads total.
// Tuned conservative for Phase 1; the Browse "cake" can stack more later.
export const HERO_CANOPY_SLABS = 4

/**
 * Measure the canopy-base fraction (trunkFrac) by separating bark vs leaf
 * primitive bounds in the clean, scale-applied doc. trunkFrac = the Y at which
 * the foliage starts, as a fraction of total tree height — so the runtime knows
 * how tall the bare trunk card is vs where the canopy slabs stack.
 *
 * Reads `prim.getExtras().atlasKind` ('bark' | 'leaf'), which bake-look stamps
 * during the GLB rewrite (the same signal the runtime uses for aBark). Falls
 * back to a sane default (0.35) when a doc has no classified leaf prims.
 *
 * @param {import('@gltf-transform/core').Document} doc  scale-applied tree doc
 * @returns {{ heightM:number|null, trunkFrac:number, canopyBaseY:number|null }}
 */
export function measureCanopyBase(doc) {
  let minY = Infinity, maxY = -Infinity        // whole-tree Y extent
  let leafMinY = Infinity                       // lowest leaf vertex
  let sawLeaf = false
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    const worldM = nodeWorldMatrix(node)
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')
      if (!pos) continue
      const kind = prim.getExtras()?.atlasKind
      const localMin = pos.getMin([])
      const localMax = pos.getMax([])
      for (let i = 0; i < 8; i++) {
        const y = transformY(worldM,
          (i & 1) ? localMax[0] : localMin[0],
          (i & 2) ? localMax[1] : localMin[1],
          (i & 4) ? localMax[2] : localMin[2])
        if (y < minY) minY = y
        if (y > maxY) maxY = y
        if (kind === 'leaf') { sawLeaf = true; if (y < leafMinY) leafMinY = y }
      }
    }
  }
  if (!isFinite(minY) || !isFinite(maxY)) return { heightM: null, trunkFrac: 0.35, canopyBaseY: null }
  const heightM = maxY - minY
  if (!sawLeaf || !isFinite(leafMinY) || heightM <= 0) {
    // No classified foliage (procedural/legacy bake) — assume a typical
    // broadleaf canopy break at ~1/3 up.
    return { heightM, trunkFrac: 0.35, canopyBaseY: minY + heightM * 0.35 }
  }
  // Clamp so the bare-trunk card is neither nonexistent nor the whole tree.
  const frac = Math.min(0.7, Math.max(0.1, (leafMinY - minY) / heightM))
  return { heightM, trunkFrac: frac, canopyBaseY: minY + heightM * frac }
}

/**
 * Build the per-season layer plans for one species' Hero impostor.
 *
 * Each layer is { kind, atlasRect, yLo, yHi } in NORMALIZED tree height [0,1]
 * (the runtime scales by the per-placement heightM). `atlasRect` is the UV
 * offset+scale into the unified atlas, so the runtime samples the SAME pixels
 * the near trees use.
 *
 *   - trunk card: one vertical bark quad from base → canopyBase.
 *   - canopy slabs: HERO_CANOPY_SLABS leaf quads stacked canopyBase → top.
 *
 * Summer = trunk + all canopy slabs. Winter = trunk only (deciduous bare; the
 * woody silhouette must survive — that's WHY the trunk card is always stamped).
 * Spring/fall are emitted as summer-with-density (the runtime recolor LUT +
 * posterize season path, already in the shared material, handles the palette).
 */
export function buildSeasonLayers({ trunkFrac, barkRect, leafRect }) {
  const trunk = barkRect
    ? { kind: 'bark', atlasRect: barkRect, yLo: 0, yHi: trunkFrac }
    : null

  const slabs = []
  if (leafRect) {
    const lo = trunkFrac, hi = 1.0
    for (let i = 0; i < HERO_CANOPY_SLABS; i++) {
      const a = lo + (hi - lo) * (i / HERO_CANOPY_SLABS)
      const b = lo + (hi - lo) * ((i + 1) / HERO_CANOPY_SLABS)
      slabs.push({ kind: 'leaf', atlasRect: leafRect, yLo: a, yHi: b })
    }
  }

  const summer = []
  if (trunk) summer.push(trunk)
  summer.push(...slabs)

  // Winter: woody only. Keep the trunk card; drop the foliage slabs. (Phase 1
  // captures no separate bare-branch texture — the trunk bark rect carries the
  // woody silhouette; richer winter branch capture is the deferred polish.)
  const winter = trunk ? [trunk] : []

  return {
    // The runtime defaults to `summer`; the others are baked so winter can't be
    // painted into a corner when its runtime switch lands (Phase 2).
    summer,
    winter,
    // spring/fall reuse the summer plan; the season recolor LUT (shared
    // material) supplies the palette shift, density via a runtime dial later.
    spring: summer,
    fall: summer,
  }
}

/**
 * Capture one species' Hero impostor record. Pure: combines the measured
 * canopy base (from the doc) with the atlas UV rects (resolved by bake-look
 * from the unified-atlas tiles) into the manifest record the runtime consumes.
 *
 * @param {object}  args
 * @param {string}  args.species
 * @param {number}  args.variantId          representative variant captured
 * @param {number}  args.heightM            real metres (from computeTreeBounds)
 * @param {number}  args.canopyRadiusM      real metres
 * @param {number}  args.trunkFrac          canopy-base ÷ height (measureCanopyBase)
 * @param {object|null} args.barkRect       {offsetU,offsetV,scaleU,scaleV} | null
 * @param {object|null} args.leafRect       {offsetU,offsetV,scaleU,scaleV} | null
 * @returns {object} impostor record
 */
export function captureImpostor({ species, variantId, heightM, canopyRadiusM, trunkFrac, barkRect, leafRect }) {
  const seasons = buildSeasonLayers({ trunkFrac, barkRect, leafRect })
  return {
    species,
    variantId,
    heightM: heightM ?? null,
    canopyRadiusM: canopyRadiusM ?? null,
    trunkFrac,
    // Phase 1 = camera-facing canopy slabs (octahedral multi-view deferred).
    capture: 'camera-facing',
    canopySlabs: HERO_CANOPY_SLABS,
    barkRect: barkRect ?? null,
    leafRect: leafRect ?? null,
    seasons,
  }
}

// ── small local helpers (no deps; mirror tree-bounds.js math) ───────────────
function nodeWorldMatrix(node) {
  let m = node.getMatrix()
  let p = node.getParentNode ? node.getParentNode() : null
  while (p && typeof p.getMatrix === 'function') {
    m = mul4(p.getMatrix(), m)
    p = p.getParentNode ? p.getParentNode() : null
  }
  return m
}
function mul4(a, b) {
  const out = new Array(16)
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    let s = 0
    for (let k = 0; k < 4; k++) s += a[r * 4 + k] * b[k * 4 + c]
    out[r * 4 + c] = s
  }
  return out
}
function transformY(m, x, y, z) {
  return m[4] * x + m[5] * y + m[6] * z + m[7]
}
