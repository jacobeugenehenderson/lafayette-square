/**
 * InstancedTrees — reads a pre-resolved bake file and instances each
 * referenced GLB at its assigned park positions.
 *
 * The live picker (rated pool, species map, hash assignments) used to
 * run in the browser. That was the GPU bottleneck for the cartograph
 * and would have been disastrous on mobile. The bake step (run via
 * `node arborist/bake-trees.js`) does that work once at author-time
 * and writes a static `public/baked/<look>.json` containing pre-
 * resolved `{x, z, url, scale, rotY, species, variantId}` per park
 * position.
 *
 * Runtime path (here): fetch the bake, group by unique GLB URL, drop
 * one InstancedMesh per submesh per variant. No picker, no overrides,
 * no index.json. Same shape Stage / mobile would consume.
 */
import { Suspense, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  useTreeAtlas,
  treeSwayUniforms,
  applyBarkUniforms,
  applyDeformerUniforms,
  treeBarkTierUniform,
  treeBarkTierPinned,
} from './treeAtlasMaterial'
import { buildImpostorGeometry } from './impostorGeometry.js'
import { useOverheadMode, useOverheadWarm, useOverheadAssets, OverheadSpecies, OverheadLightDriver, treeDbg } from './OverheadTrees.jsx'
import { useHeroImpostorAssets, HeroImpostorSpecies } from './HeroImpostorTrees.jsx'
import { getElevationRaw } from '../utils/elevation'
import { useSceneJson } from '../lib/useSceneJson.js'
import { INSTANCE } from '../instance.js'
import useAtmosphere from '../hooks/useAtmosphere.js'
import { defaultWindState, resolveWindState } from '../lib/wind-field.js'

function resolveLookId(propLookId) {
  if (propLookId) return propLookId
  if (typeof window === 'undefined') return INSTANCE.lookId
  const m = window.location.search.match(/look=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : INSTANCE.lookId
}

// URL → species. The rewritten GLB path is
// `<base>/baked/<look>/trees/<species>/skeleton-<variantId>-<lod>.glb`
// (and the cache-bust `?v=...` may trail). Parse the species segment so
// VariantInstances can look up barkBySpecies even when out-of-roster
// substitution rewrites inst.species away from the GLB's actual species.
function urlToSpecies(url) {
  const m = url.match(/\/trees\/([^/]+)\//)
  return m ? m[1] : null
}

// Brief 2 (Holm): URL → variantId. The rewritten GLB filename is
// `skeleton-<variantId>-<lod>.glb` (possibly suffixed `?v=...`). Parsed so
// the runtime can look up the per-variant gradient slot in the atlas
// manifest. Returns the variantId as a STRING so callers can index either
// numeric or string variant keys in barkGradientByVariant without coercion
// drift (manifest keys come from JSON.stringify of whatever the species
// manifest stores — integer in lidar publishes, string in some salon
// publishes).
function urlToVariantId(url) {
  const m = url.match(/skeleton-([^-/]+)-lod\d/)
  return m ? m[1] : null
}

// frameloop="demand" + Suspense gotcha: when a <Suspense>-wrapped useGLTF
// boundary RESOLVES, R3F commits the new mesh into the scene but does NOT
// reliably schedule the frame that draws it. With a locked camera (hero) the
// loop is idle, so freshly loaded trees stay invisible until something else
// invalidates — the "nudge a knob and they pop on" symptom. A single commit-time
// invalidate() races the GPU upload and gets dropped; a short rAF-spaced BURST
// after each variant resolves reliably paints it, no poke needed. Pumps ~15
// frames (~250ms) then stops. (2026-06-28 — the hero "trees don't relieve" bug.)
function pumpFramesAfterLoad(invalidate, frames = 15) {
  let id, i = 0
  const tick = () => { invalidate(); if (++i < frames) id = requestAnimationFrame(tick) }
  id = requestAnimationFrame(tick)
  return () => { if (id) cancelAnimationFrame(id) }
}

function VariantInstances({ url, instances, treeMaterial, barkSettings, gradientSlot, detailSlot, posterizedSlot, deformerRange }) {
  const { scene } = useGLTF(url)
  // This component only mounts AFTER useGLTF resolves (it's inside <Suspense>),
  // so this effect runs exactly when the GLB has loaded — the moment we must
  // wake the demand loop. See pumpFramesAfterLoad above.
  const invalidate = useThree(s => s.invalidate)
  useEffect(() => pumpFramesAfterLoad(invalidate), [invalidate])

  // Walk the rewritten GLB, baking each primitive's world matrix into its
  // vertices, then merge all primitives that share attribute layout into a
  // SINGLE BufferGeometry. Every primitive already uses the same shared
  // treeMaterial (the unified atlas covers bark + leaves), so the only
  // reason they're split is how the source FBX was authored. Merging at
  // load time collapses one (url × tile) → one InstancedMesh, where it
  // would otherwise have been (4 primitives × 154 mesh groups) ≈ 616
  // draws per frame for trees alone. Falls back to per-primitive if
  // attribute sets diverge across primitives.
  //
  // Phase B (2026-05-15): stamp a per-vertex `aBark` attribute on each
  // cloned geometry based on `mesh.userData.atlasKind` (set by bake-look's
  // rewriter — 'bark' or 'leaf' per the source material classification).
  // After mergeGeometries this gives the fragment shader a per-fragment
  // signal to gate the bark-retint logic — so leaf fragments pass through
  // untouched while bark fragments pick up uBarkTintBase × per-instance
  // jitter from the shared material's per-draw uniforms.
  const meshes = useMemo(() => {
    scene.updateMatrixWorld(true)
    const collected = []
    scene.traverse(o => {
      if (!o.isMesh) return
      const pos = o.geometry?.attributes?.position
      if (!pos) return
      for (let i = 0; i < pos.count; i++) {
        if (!Number.isFinite(pos.getX(i)) ||
            !Number.isFinite(pos.getY(i)) ||
            !Number.isFinite(pos.getZ(i))) return
      }
      // Bake the primitive's world transform into a cloned geometry so
      // the merge sees vertices already in mesh-local frame.
      const g = o.geometry.clone()
      g.applyMatrix4(o.matrixWorld)
      // Phase B per-vertex bark gate. atlasKind is 'bark' or 'leaf'; older
      // bakes may carry 'unified' (pre-Phase-B classification was collapsed).
      // Default to 0 (treated as leaf — no retint) so legacy bakes
      // gracefully no-op rather than tinting everything.
      // GLTFLoader assigns primitive-level extras to geometry.userData
      // (not mesh.userData — see three's GLTFLoader.js:4649); B-core
      // missed this and shipped with all aBark=0 silently. Fixed in B.1.a
      // so the retint + UV-wrap paths actually fire on bark fragments.
      const atlasKind = o.geometry?.userData?.atlasKind
        ?? o.userData?.atlasKind
        ?? o.userData?.gltfExtras?.atlasKind
      const isBark = atlasKind === 'bark'
      const aBarkArr = new Float32Array(pos.count)
      if (isBark) aBarkArr.fill(1)
      g.setAttribute('aBark', new THREE.BufferAttribute(aBarkArr, 1))
      // Phase L Cycle 2: per-region bark gate. bake-look stamps
      // extras.barkRegion ('trunk' or 'branch') from the primitive's
      // owning mesh name; absent on procedural bakes (legacy single-spec
      // path). Default 0 (branch) is benign — the fragment shader's
      // uBarkRegionSplit uniform decides whether to use the region
      // selector at all per-draw.
      const barkRegion = o.geometry?.userData?.barkRegion
        ?? o.userData?.barkRegion
        ?? o.userData?.gltfExtras?.barkRegion
      const aBarkRegionArr = new Float32Array(pos.count)
      if (barkRegion === 'trunk') aBarkRegionArr.fill(1)
      g.setAttribute('aBarkRegion', new THREE.BufferAttribute(aBarkRegionArr, 1))
      // Brief 9a (Sough) per-vertex wind tier (0=trunk, 1=branch, 2=twig,
      // 3=leaf) — drives multi-scale damping in the shared shader's sway
      // block. Computed at runtime-merge time so chassis GLBs +
      // trees-atlas.json stay byte-identical (AC #12). Leaves always get
      // tier 3; bark vertices classify by radial distance from the
      // tree-local Y-axis (we read g.attributes.position AFTER applyMatrix4,
      // so XZ is tree-local thanks to the bake's clean coordinate frame —
      // trunks sit at X≈Z≈0). The runtime-merge per-vertex slot stays open
      // for the next consumer; Brief 10A explored using it for an aerial-tier
      // gradient axis but retired the attribute in favor of per-pixel
      // luminance after operator review (camera-angle independence).
      const aWindTierArr = new Float32Array(pos.count)
      const gpos = g.attributes.position
      if (!isBark) {
        // Leaf cards: tier 3 unconditionally.
        aWindTierArr.fill(3)
      } else {
        for (let i = 0; i < gpos.count; i++) {
          const x = gpos.getX(i)
          const y = gpos.getY(i)
          const z = gpos.getZ(i)
          const r = Math.sqrt(x * x + z * z)
          // Thresholds tuned against the v1.5 chassis stock (alaskan_cedar,
          // broadleaf_rt3, generic_leaf_tree, etc.) — trunk radii sit at
          // ~0.15–0.5m, secondary branches 0.05–0.15m, twigs <0.05m. The
          // Y<3.0 gate on trunk-class prevents tall thick trunks above
          // ~3m being misread as twigs.
          let tier
          if (r > 0.15 && y < 3.0) tier = 0  // trunk
          else if (r > 0.06)       tier = 1  // major branch
          else                     tier = 2  // twig
          aWindTierArr[i] = tier
        }
      }
      g.setAttribute('aWindTier', new THREE.BufferAttribute(aWindTierArr, 1))
      collected.push(g)
    })
    if (collected.length === 0) return []

    // Brief 3A (Cant) — chassis-wide trunk-base→top Y range, shared across all
    // collected primitives so aTreeHeightNorm normalizes consistently (a leaf
    // card high in the canopy and a trunk vertex at the base land on the same
    // [0,1] axis). Cork's 10A pivot removed the equivalent scan when it retired
    // aBarkWorldYNorm — the scan itself was sound (only the camera-angle-
    // dependent bark CONSUMER was wrong); the deformer's height-norm is a
    // legitimate consumer, so it's reintroduced here. Geometries are already in
    // the merged frame (world transform baked via applyMatrix4 above), matching
    // the existing aWindTier classifier's coordinate assumptions.
    let chassisMinY = Infinity, chassisMaxY = -Infinity
    for (const g of collected) {
      g.computeBoundingBox()
      if (g.boundingBox) {
        if (g.boundingBox.min.y < chassisMinY) chassisMinY = g.boundingBox.min.y
        if (g.boundingBox.max.y > chassisMaxY) chassisMaxY = g.boundingBox.max.y
      }
    }
    if (!Number.isFinite(chassisMinY)) chassisMinY = 0
    const chassisYRange = Math.max(1e-4, chassisMaxY - chassisMinY)
    for (const g of collected) {
      const gp = g.attributes.position
      const arr = new Float32Array(gp.count)
      for (let i = 0; i < gp.count; i++) {
        const t = (gp.getY(i) - chassisMinY) / chassisYRange
        arr[i] = t < 0 ? 0 : t > 1 ? 1 : t
      }
      g.setAttribute('aTreeHeightNorm', new THREE.BufferAttribute(arr, 1))
    }

    // Verify all geometries share the same attribute keys before merging.
    // If something diverges (rare, but a future tree variant could ship
    // vertex colors on bark only), fall back to per-primitive submeshes.
    const keys = Object.keys(collected[0].attributes).sort().join('|')
    const sameKeys = collected.every(g => Object.keys(g.attributes).sort().join('|') === keys)

    // Also reject merge if any attribute is interleaved — mergeGeometries
    // doesn't support InterleavedBufferAttribute and would otherwise spam
    // the console with "mergeAttributes() failed" thousands of times per
    // mount. Per-primitive fallback handles interleaved fine.
    const noInterleaved = collected.every(g =>
      Object.values(g.attributes).every(a => !a.isInterleavedBufferAttribute)
    )

    if (sameKeys && noInterleaved) {
      const merged = mergeGeometries(collected, false)
      if (merged) {
        // Identity local matrix — vertices already carry their original
        // primitive's transform.
        return [{ geometry: merged, material: treeMaterial, localMatrix: new THREE.Matrix4() }]
      }
    }
    return collected.map(g => ({
      geometry: g,
      material: treeMaterial,
      localMatrix: new THREE.Matrix4(),
    }))
  }, [scene, treeMaterial])

  if (meshes.length === 0) return null

  // Build per-instance world matrices once. Scale is baked into the GLB at
  // Arborist publish time (bake-look), so runtime applies translation +
  // rotation only.
  const matrices = useMemo(() => {
    const arr = new Array(instances.length)
    const T = new THREE.Matrix4(), R = new THREE.Matrix4()
    const M = new THREE.Matrix4()
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i]
      T.makeTranslation(inst.x, inst.y || 0, inst.z)
      R.makeRotationY(inst.rotY)
      M.identity().multiply(T).multiply(R)
      arr[i] = M.clone()
    }
    return arr
  }, [instances])

  // Per-instance lamp-glow buffer. Pre-sampled at bake time
  // (`arborist/bake-trees.js` evaluates the gaussian over street_lamps.json
  // at each tree's world position). Each tree contributes one float; the
  // leaf shader multiplies by the per-Look TOD-driven uniform.
  const lampGlows = useMemo(() => {
    const arr = new Float32Array(instances.length)
    for (let i = 0; i < instances.length; i++) {
      arr[i] = Number(instances[i].lampGlow) || 0
    }
    return arr
  }, [instances])

  // Phase A (Azimuth) — per-instance hero-tier (0 = mesh, 1 = impostor, 2 = cull)
  // from the baked `heroTier` field. Drives the read-only QC tint (treeHeroTierQC);
  // later phases consume it to split the hero-shot render (cull = dropped entirely).
  // Absent field → 0 (mesh).
  const heroTiers = useMemo(() => {
    const arr = new Float32Array(instances.length)
    for (let i = 0; i < instances.length; i++) {
      const t = instances[i].heroTier
      arr[i] = t === 'cull' ? 2 : t === 'impostor' ? 1 : 0
    }
    return arr
  }, [instances])

  // Per-instance ground anchor (groundSampler, baked per-look as tree-anchors).
  // The raw field where the DRAWN ground sits under each tree → the trunk lands
  // exactly on the rendered surface (no float), via patchTerrainInstancedBaked.
  // Falls back to the smooth field for any instance missing an anchor.
  const groundRaws = useMemo(() => {
    const arr = new Float32Array(instances.length)
    for (let i = 0; i < instances.length; i++) {
      const g = instances[i].groundRaw
      arr[i] = typeof g === 'number' ? g : getElevationRaw(instances[i].x, instances[i].z)
    }
    return arr
  }, [instances])

  // One log per (url × tile) saying how many submeshes we ended up with.
  // After the primitive-merge optimization this should be 1 for all variants
  // — if any logs show >1, the merge fell back (attribute-set mismatch).
  if (typeof window !== 'undefined' && !window.__treeMergeLogged) {
    window.__treeMergeLogged = new Set()
  }
  if (typeof window !== 'undefined' && !window.__treeMergeLogged.has(url)) {
    window.__treeMergeLogged.add(url)
    console.log(`[VariantInstances] ${url.split('/trees/')[1]?.split('?')[0] || url}: ${meshes.length} submesh${meshes.length === 1 ? '' : 'es'} after merge × ${instances.length} instances`)
  }

  return (
    <>
      {meshes.map((m, i) => (
        <SubmeshInstances
          key={i}
          geometry={m.geometry}
          material={m.material}
          localMatrix={m.localMatrix}
          placementMatrices={matrices}
          lampGlows={lampGlows}
          heroTiers={heroTiers}
          groundRaws={groundRaws}
          barkSettings={barkSettings}
          gradientSlot={gradientSlot}
          detailSlot={detailSlot}
          posterizedSlot={posterizedSlot}
          deformerRange={deformerRange}
        />
      ))}
    </>
  )
}

// Brief 7 (Cambium): applyBarkUniforms moved to treeAtlasMaterial.js so the
// Salon preview path (SpecimenViewport) reuses the SAME per-draw uniform
// setup as the LS runtime. Imported above.

function SubmeshInstances({ geometry, material, localMatrix, placementMatrices, lampGlows, heroTiers, groundRaws, barkSettings, gradientSlot, detailSlot, posterizedSlot, deformerRange }) {
  const ref = useRef(null)
  // Canvas runs frameloop="demand": R3F auto-invalidates on React reconciliation
  // (mount) but NOT on the imperative matrix/attribute fills below. Without an
  // explicit invalidate the mesh paints ONCE at mount with empty matrices, then
  // the effects fill the real matrices but no frame is requested → trees stay
  // invisible until a camera nudge wakes the loop. invalidate() after each fill
  // is the fix. (2026-06-28 — the "trees don't load until something wakes it" bug.)
  const invalidate = useThree(s => s.invalidate)
  // Trees ALWAYS render — the per-tile frustum cull was excised 2026-06-27. It
  // over-culled (its padded world-sphere vs the runtime terrain-lift/sway) and
  // made trees "not reliably render". `frustumCulled={false}` stays below. If a
  // phone tier ever needs visibility culling it's a fresh robust build — and
  // impostors are the real far-tree perf lever (role-at-bake), not runtime camera
  // culling. [[tree-building-frustum-culling]]
  // Attach the per-instance lamp-glow + hero-tier attributes to the geometry.
  // Each unique GLB has a unique geometry instance (per url×tile), so these
  // don't bleed across variants. Consumed by the shader injection in
  // treeAtlasMaterial.js (aLampGlow → emissive; aHeroTier → QC tint).
  useEffect(() => {
    if (!geometry) return
    if (lampGlows) geometry.setAttribute('aLampGlow', new THREE.InstancedBufferAttribute(lampGlows, 1))
    if (heroTiers) geometry.setAttribute('aHeroTier', new THREE.InstancedBufferAttribute(heroTiers, 1))
    if (groundRaws) geometry.setAttribute('aGroundRaw', new THREE.InstancedBufferAttribute(groundRaws, 1))
    invalidate()
  }, [geometry, lampGlows, heroTiers, groundRaws, invalidate])
  useEffect(() => {
    const im = ref.current
    if (!im) return
    const tmp = new THREE.Matrix4()
    for (let i = 0; i < placementMatrices.length; i++) {
      tmp.copy(placementMatrices[i]).multiply(localMatrix)
      im.setMatrixAt(i, tmp)
    }
    im.instanceMatrix.needsUpdate = true
    // The merged geometry's local bounding sphere may not be tight around
    // (0,0,0); recompute it to reflect baked-in primitive offsets, then
    // recompute the InstancedMesh bound that wraps it across all instances.
    if (im.geometry?.computeBoundingSphere) im.geometry.computeBoundingSphere()
    if (im.computeBoundingSphere) im.computeBoundingSphere()
    invalidate()   // demand-mode: paint the just-filled matrices (see note at top of component)
  }, [placementMatrices, localMatrix, invalidate])

  // Phase B onBeforeRender — mutate the shared material's bark uniforms
  // for THIS draw call only. Since the material is shared across every
  // species' InstancedMesh, the prior draw's species values are still on
  // the uniforms; we overwrite right before three.js submits the draw,
  // and three.js uploads uniform values per draw.
  const onBeforeRender = useMemo(() => {
    return () => {
      applyBarkUniforms(material, barkSettings, gradientSlot, detailSlot, posterizedSlot)
      // Brief 3A (Cant) — per-draw deformer range (LS seed stays 0; real
      // per-instance anchors supply the spread). Same shared-material per-draw
      // mutation as bark; a species with no authored deformer resets to (0,0).
      applyDeformerUniforms(material, deformerRange)
    }
  }, [material, barkSettings, gradientSlot, detailSlot, posterizedSlot, deformerRange])

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, placementMatrices.length]}
      castShadow={false}
      receiveShadow={false}
      frustumCulled={false}   /* manual per-tile cull above (cullSphere + useFrame) sets .visible; three's auto-cull bound ignores runtime terrain-lift/sway → false drops, so it stays off */
      onBeforeRender={onBeforeRender}
    />
  )
}

// ImpostorSpecies (Arc 2, Phase 1) — renders all impostor-ROLE placements of
// one species as a single InstancedMesh of cheap stamped-2D layer cards.
//
// The geometry (impostorGeometry.js) is the WHOLE tree as a handful of
// billboard quads (trunk card + canopy slabs) whose UVs sample the SAME unified
// atlas the near trees use — so it mounts the SAME shared treeMaterial. That's
// the whole win: one shader program (Bloom-stable), full optical parity (the
// cards get DoF'd/fogged/graded/terrain-lifted exactly like real geometry), and
// the cards hula off the SHARED wind uniforms (base-anchored sway ∝ height) with
// zero per-frame geometry cost — ~a dozen quads replace ~15K leaf cards.
function ImpostorSpecies({ species, record, instances, treeMaterial, barkSettings, detailSlot, posterizedSlot, deformerRange }) {
  const ref = useRef(null)
  // demand-mode frame request after imperative fills — same reason as
  // SubmeshInstances (see the note there).
  const invalidate = useThree(s => s.invalidate)

  // One geometry per species per season. Phase 1 = summer; the winter plan is
  // already baked (record.seasons.winter) for the Phase-2 runtime switch.
  const geometry = useMemo(() => buildImpostorGeometry(record, 'summer'), [record])

  // Per-instance world matrices (translation + Y-rotation; scale is baked into
  // the impostor geometry's real-metre layer heights, like the GLB path).
  const matrices = useMemo(() => {
    const arr = new Array(instances.length)
    const T = new THREE.Matrix4(), R = new THREE.Matrix4()
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i]
      T.makeTranslation(inst.x, inst.y || 0, inst.z)
      R.makeRotationY(inst.rotY || 0)
      // clone(): multiply() mutates + returns the receiver (T), so an un-cloned
      // arr[i] would alias the one scratch matrix and every instance would land
      // on the LAST placement. Same idiom as OverheadSpecies / VariantInstances.
      arr[i] = T.multiply(R).clone()
    }
    return arr
  }, [instances])

  // Per-instance lamp-glow + hero-tier attributes (mirror SubmeshInstances).
  // aHeroTier = 1 (impostor) so the QC overlay tints these magenta and the
  // shared shader treats them consistently with the mesh path.
  const lampGlows = useMemo(() => {
    const a = new Float32Array(instances.length)
    for (let i = 0; i < instances.length; i++) a[i] = Number(instances[i].lampGlow) || 0
    return a
  }, [instances])
  const heroTiers = useMemo(() => {
    const a = new Float32Array(instances.length)
    a.fill(1)   // impostor
    return a
  }, [instances])
  const groundRaws = useMemo(() => {
    const a = new Float32Array(instances.length)
    for (let i = 0; i < instances.length; i++) {
      const g = instances[i].groundRaw
      a[i] = typeof g === 'number' ? g : getElevationRaw(instances[i].x, instances[i].z)
    }
    return a
  }, [instances])

  useEffect(() => {
    if (!geometry) return
    geometry.setAttribute('aLampGlow', new THREE.InstancedBufferAttribute(lampGlows, 1))
    geometry.setAttribute('aHeroTier', new THREE.InstancedBufferAttribute(heroTiers, 1))
    geometry.setAttribute('aGroundRaw', new THREE.InstancedBufferAttribute(groundRaws, 1))
    invalidate()
  }, [geometry, lampGlows, heroTiers, groundRaws, invalidate])

  useEffect(() => {
    const im = ref.current
    if (!im) return
    for (let i = 0; i < matrices.length; i++) im.setMatrixAt(i, matrices[i])
    im.instanceMatrix.needsUpdate = true
    if (im.computeBoundingSphere) im.computeBoundingSphere()
    invalidate()   // demand-mode: paint the just-filled matrices
  }, [matrices, invalidate])

  // Per-draw bark uniforms — same shared-material mutation as the mesh path so
  // the impostor's bark/leaf fragments pick up this species' tint/gradient/
  // posterize (color match with the near trees, 3A.5). gradientSlot omitted
  // (the impostor samples the species' primary bark/leaf rect, not a per-variant
  // gradient — Phase 1).
  const onBeforeRender = useMemo(() => {
    return () => {
      applyBarkUniforms(treeMaterial, barkSettings, null, detailSlot, posterizedSlot)
      applyDeformerUniforms(treeMaterial, deformerRange)
    }
  }, [treeMaterial, barkSettings, detailSlot, posterizedSlot, deformerRange])

  if (!geometry || instances.length === 0) return null

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, treeMaterial, instances.length]}
      castShadow={false}
      receiveShadow={false}
      frustumCulled={false}
      onBeforeRender={onBeforeRender}
    />
  )
}

// Brief 9a (Sough) — wind-field consumer. Resolves the directive into a
// `windState` once per frame via the shared wind-field.js seam, then
// writes the drift component + gust parameters into the shared sway
// uniforms. The vertex shader synthesises its own per-tree spatially-
// advected gust spikes from `uGustsScale` + `uGustEnvelope` +
// `uGustFrontVelocity`, so spatial advection (AC #5) is preserved
// without uploading per-instance attributes per frame.
const _swayWindState = defaultWindState()

// Brief 11 lightweight (Plumb) — LS-runtime bark-tier auto-bind. Mirrors
// Vantage's Salon-side DollyCam binding (SpecimenViewport.jsx) so operator
// iterating in Salon can predict LS behavior: one shared uniform, one
// shared pin, recognizably the same algorithm.
//
// LS has no "tree at origin" the way Salon does; the discriminating signal
// is camera altitude (y-up world frame). Calibration against Scene.jsx
// PRESETS: HERO_CENTER y = 55m, browse default y = 600m (zoom range
// 50–4000m), street eyeHeight = 1.73m. Thresholds pick the gaps:
//   y > 150 → aerial (browse default 600 well above; hero 55 well below)
//   y < 5   → street (eyeHeight 1.73 well below; hero 55 well above)
//   else    → hero
// Snap only — no hysteresis, mirroring Vantage. If operator zooms browse
// in past minDistance 50 (below the 150 threshold), tier flips to hero,
// which is the correct quality level for that close a framing.
const TIER_AERIAL_MIN_ALTITUDE = 150
const TIER_STREET_MAX_ALTITUDE = 5

function computeTier(camera) {
  const y = camera.position.y
  if (y > TIER_AERIAL_MIN_ALTITUDE) return 0
  if (y < TIER_STREET_MAX_ALTITUDE) return 2
  return 1
}

function TierDriver() {
  const camera = useThree(s => s.camera)
  useFrame(() => {
    if (treeBarkTierPinned.value) return
    const desired = computeTier(camera)
    if (treeBarkTierUniform.value !== desired) {
      treeBarkTierUniform.value = desired
    }
  })
  return null
}

// GeoTierDriver (the runtime camera-altitude geometry-LOD swap) RETIRED
// 2026-06-25 — it served the cut-trunk lod2 to high telephoto / shallow-browse
// framings. Geometry is now chosen by baked role (heroTier), not live distance
// (role-at-bake doctrine). `computeTier` is kept below for TierDriver (bark
// shader detail, a uniform — not geometry).

function SwayDriver() {
  const lastMs = useRef(0)
  useFrame(() => {
    // Advance the sway clock off WALL-CLOCK, not the R3F delta: under
    // frameloop='demand' (browse/street) the R3F clock reads ~2fps (Scene.jsx
    // CameraRig note), so `+= delta` froze the ambient canopy motion. Wall-clock
    // keeps uTime smooth as long as FrameLimiter pumps invalidate (~30fps non-hero).
    const now = performance.now()
    const dt = lastMs.current ? Math.min(0.1, (now - lastMs.current) / 1000) : 0
    lastMs.current = now
    treeSwayUniforms.uTime.value += dt
    const directive = useAtmosphere.getState().tweenedDirective
    resolveWindState(directive, _swayWindState)
    // Drift = baseDirection × baseSpeedMps (constant across the scene).
    treeSwayUniforms.uWindForce.value
      .copy(_swayWindState.baseDirection)
      .multiplyScalar(_swayWindState.baseSpeedMps)
    treeSwayUniforms.uWindIntensity.value = _swayWindState.baseSpeedMps
    // Gust parameters drive the shader's per-tree spike computation.
    treeSwayUniforms.uGustFrontVelocity.value.copy(_swayWindState.gustFrontVelocity)
    treeSwayUniforms.uGustsScale.value   = _swayWindState.gustsScale
    treeSwayUniforms.uGustEnvelope.value = _swayWindState.gustEnvelope
  })
  return null
}

function ParkPopulation({ maxVariants, lookId: propLookId, bakeLastMs, bakeUrl }) {
  // Active Look: explicit prop wins; otherwise URL `?look=` fallback; final
  // default 'lafayette-square'. Cartograph passes the active Look explicitly
  // via the StageEnvironment thread; Preview reads ?look= from the URL.
  const lookName = resolveLookId(propLookId)
  const scene = useSceneJson(lookName, bakeLastMs)
  const cacheBust = bakeLastMs ?? scene?.bakedAt ?? null

  // Placement source: an explicit bakeUrl prop (Preview/Stage/toy, where the
  // scene and the Look differ) wins as-is; otherwise it is the Look's own
  // placements. Every neighbourhood ships baked/<scene>/trees.json — LS
  // included, since 2026-07-15. There is no global fallback any more: the old
  // baked/default.json was LS's census under a fossil name, and a "fallback"
  // that silently hands LS's 745 trees to a neighbourhood whose bake is missing
  // is a bug that hides a bug.
  const placementsUrl = bakeUrl || `${import.meta.env.BASE_URL}baked/${lookName}/trees.json`

  const [bake, setBake] = useState(null)
  useEffect(() => {
    if (cacheBust == null) return
    let cancelled = false
    // The ground anchor that seats each trunk on the DRAWN ground is PER-LOOK
    // (tree-anchors.json, groundSampler bake). Fetch placements + anchors and
    // inject groundRaw into each instance; if anchors are absent/stale, the
    // per-instance memos fall back to the smooth field.
    const anchorsUrl = `${import.meta.env.BASE_URL}baked/${lookName}/tree-anchors.json`
    // A missing placements file may 404 OR (on SPA-fallback hosts) return a 200
    // HTML page, so `instances` is validated rather than trusted. Absent → no
    // trees, which is the honest answer for a neighbourhood that has no census
    // yet (the Arborist ships it a blank grove).
    const tryJson = (url) => fetch(url + '?t=' + cacheBust).then(r => r.ok ? r.json().catch(() => null) : null)
    const fetchPlacements = tryJson(placementsUrl).then(j => (j && j.instances) ? j : null)
    Promise.all([
      fetchPlacements,
      fetch(anchorsUrl + '?t=' + cacheBust).then(r => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(([j, anchorsDoc]) => {
        if (cancelled) return
        const anchors = anchorsDoc?.anchors
        if (j?.instances && Array.isArray(anchors) && anchors.length === j.instances.length) {
          for (let i = 0; i < j.instances.length; i++) j.instances[i].groundRaw = anchors[i]
        }
        setBake(j)
      })
      .catch(e => console.warn('[InstancedTrees] bake fetch failed:', e))
    return () => { cancelled = true }
  }, [placementsUrl, cacheBust, lookName, bakeUrl])

  const atlas = useTreeAtlas(lookName)

  // Impostor records (Arc 2, Phase 1) — per-species layer-card plans baked by
  // arborist/bake-impostors.js into the atlas manifest. Keyed by species; the
  // grouping memo (below) routes impostor-role placements here, ImpostorSpecies
  // builds one geometry per species (sampling the SAME atlas) and instances it.
  // Declared BEFORE the `groups` memo that depends on it (TDZ-safe).
  const impostorRecords = useMemo(() => {
    return atlas?.manifest?.impostorBySpecies || null
  }, [atlas?.manifest?.impostorBySpecies])

  // HERO canopy-impostor foundation (Phase 2). The manifest's heroImpostorBySpecies
  // (baked side-on, all-azimuth variety pool) is the FOUNDATION: every tree paints as
  // a canopy impostor by default; geometry is layered onto the TALL ∩ FOREGROUND trees
  // (Jacob 2026-07-17). The split is stable at load (dbh proxy for height now; the
  // pan-distance band folds in with the bake), NOT a per-frame camera swap.
  const heroImpostorRecords = useMemo(() => atlas?.manifest?.heroImpostorBySpecies || null, [atlas?.manifest?.heroImpostorBySpecies])
  const heroFoundationEnabled = !!heroImpostorRecords && scene?.heroImpostor !== false && !treeDbg('noHeroImpostor')
  // Geometry budget = fraction of trees (tallest-first by dbh) that KEEP mesh geometry;
  // the rest drop to the impostor foundation. A pyramid bracket / the Phase-4 Stage
  // knob. Tunable live via ?heroGeom=0.15. (The "∩ foreground" axis lands with the bake.)
  const heroGeomFraction = useMemo(() => {
    const q = new URLSearchParams(window.location.search).get('heroGeom')
    const v = q != null ? parseFloat(q) : 0.15
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.15
  }, [])

  // Geometry representation is a per-placement ROLE decided at BAKE, NOT a live
  // camera-distance/altitude swap (role-at-bake doctrine, 2026-06-25 — see
  // [[project_tree_lod_role_at_bake_not_distance]] + TREE-GROUND-ELEVATION-FORENSIC.md).
  // The old GeoTierDriver swapped lod0/1/2 by camera.y, which served the
  // cut-trunk lod2 (browse tier) to high telephoto / shallow-browse framings →
  // "floating, cut-off trunks." Retired. Depth gauges (DoF/fog) own visual
  // distance; geometry follows the baked heroTier role (see lodForRole below).

  // Group bake instances by URL. Instances whose (species, variantId) is
  // in the Look's roster render as themselves; out-of-roster placements
  // are substituted with a same-category roster variant (deterministic by
  // hash) so the park's full 644 placements survive partial rosters.
  const groups = useMemo(() => {
    if (!bake?.instances || !atlas?.roster || atlas.status !== 'ready') return null

    const generatedAt = atlas.manifest?.generatedAt
    const atlasVersion = generatedAt ? `?v=${encodeURIComponent(generatedAt)}` : ''

    // Build category → list-of-roster-keys index by sweeping the bake.
    // Every roster entry that has at least one matching placement gets
    // its category captured here; that's the substitute pool.
    const byCategory = new Map()  // category -> [ "species:vid", ... ]
    const seenRosterKeys = new Set()
    for (const inst of bake.instances) {
      const key = `${inst.species}:${inst.variantId}`
      if (!atlas.roster.has(key) || seenRosterKeys.has(key)) continue
      seenRosterKeys.add(key)
      const cat = inst.category || 'broadleaf'
      if (!byCategory.has(cat)) byCategory.set(cat, [])
      byCategory.get(cat).push({ key, species: inst.species, variantId: inst.variantId, url: inst.url, lods: inst.lods })
    }
    // Flat fallback pool used when no same-category roster entry exists.
    const flatPool = []
    for (const arr of byCategory.values()) flatPool.push(...arr)
    if (flatPool.length === 0) return new Map()

    const fallbackFor = (inst, idx) => {
      const cat = inst.category || 'broadleaf'
      const pool = byCategory.get(cat) || flatPool
      // Deterministic per-placement: same input → same substitute, so the
      // park doesn't shimmer when the bake re-runs.
      const seed = Math.imul(((inst.x * 1000) | 0) ^ idx * 73856093,
                             ((inst.z * 1000) | 0) ^ 19349663)
      let h = (seed | 0) >>> 0
      h = Math.imul(h ^ (h >>> 16), 2246822507)
      h ^= h >>> 13
      return pool[(h >>> 0) % pool.length]
    }

    // Tile bucketing — COLLAPSED 2026-06-30 (the de-dup fix). VariantInstances
    // above clones + merges a GLB's geometry into its OWN resident
    // BufferGeometry per bucket. When trees were split per-(url × tile), 14
    // unique GLBs spread across the 16-tile grid produced ~173 resident
    // geometry copies (~400–650 MB) for 14 GLBs' worth of distinct mesh — the
    // mobile OOM (iOS "page cannot be opened" WebKit kill). The split ONLY ever
    // existed to scope per-tile bounding spheres for a frustum cull that was
    // EXCISED 2026-06-27 (see line ~356) — so today it is pure cost, zero
    // benefit. Collapsing to ONE bucket per url merges each GLB's geometry
    // EXACTLY ONCE and instances it across all its placements: visually
    // identical, FEWER draws, ~400–650 MB reclaimed. `tileMeta` is retained
    // only for the diagnostic log below.
    // ⚠️ If a real per-tile visibility cull is ever wanted, it must be a MANUAL
    // world-space `.visible` pass with generous STATIC AABBs — NOT a return to
    // this clone-per-tile split (which costs resident memory, not just draws).
    // [[tree-building-frustum-culling]]
    const tileMeta = bake.tiles
    const tileOf = () => 0

    // Geometry by BAKED ROLE (heroTier: mesh|impostor|cull from
    // bake-trees#classifyHeroTiers), NOT live camera distance.
    //   mesh     → real 3D geometry (lod1, full canopy + full trunk).
    //   impostor → cheap stamped-2D layer-card billboard (ImpostorTrees), the
    //              perf fix for far/occluded/fill trees. Rides the SAME atlas +
    //              material (full optical parity). Phase 1 (Hero) — Arc 2.
    //   cull     → dropped entirely (always-occluded "specks behind specks").
    // lod2 (the cut-trunk browse tier) is never selected at runtime, so no
    // camera angle can pull a cut trunk into view. The impostor record is keyed
    // by SPECIES (impostorBySpecies in the atlas manifest); a per-species
    // impostor geometry is instanced across all impostor-role placements.
    const lodForRole = (_inst) => 'lod1'   // mesh role → full-trunk lod1
    const lodUrlOf = (o, inst) => (o && o.lods && o.lods[lodForRole(inst)]) || (o && o.url)

    // HERO foundation split threshold — the dbh cut so the TALLEST `heroGeomFraction`
    // keep mesh geometry (the anchors) and the rest drop to the impostor foundation.
    // Computed from the placements' own dbh distribution → scene-generic (no magic px).
    let heroDbhCut = Infinity
    if (heroFoundationEnabled && heroGeomFraction < 1) {
      const dbhs = bake.instances.map(i => Number(i.dbh) || 0).sort((a, b) => a - b)
      const idx = Math.floor((1 - heroGeomFraction) * (dbhs.length - 1))
      heroDbhCut = dbhs[Math.max(0, Math.min(dbhs.length - 1, idx))]
    }

    const m = new Map()  // lookUrl -> Map<tileId, instances[]>  (mesh role)
    const impostors = new Map()  // species -> instances[]  (impostor role)
    const heroImpostors = new Map()  // species -> instances[]  (hero canopy foundation)
    let heroFoundationCount = 0
    // ALL non-culled instances by rendered species — the WHOLE-SCENE overhead
    // (Browse) path swaps every tree to its species' 3-slice snapshot at once, so
    // it groups by species independent of the mesh/impostor role split below.
    const bySpecies = new Map()  // species -> instances[]  (overhead snapshot)
    let dropped = 0
    let heroCulled = 0
    let substituted = 0
    let impostorCount = 0
    bake.instances.forEach((inst, idx) => {
      // Resolve the rendered species (out-of-roster placements substitute a
      // same-category roster variant — the impostor must use that species'
      // atlas rects, same as the mesh path uses its GLB).
      const key = `${inst.species}:${inst.variantId}`
      const inRoster = atlas.roster.has(key)
      let sub = null
      if (!inRoster) {
        sub = fallbackFor(inst, idx)
        if (!sub) { dropped++; return }
        substituted++
      }
      const renderSpecies = inRoster ? inst.species : sub.species

      // WHOLE-SCENE overhead: EVERY placement joins its species bucket
      // (regardless of hero role) so plan-view can swap all trees at once.
      if (!bySpecies.has(renderSpecies)) bySpecies.set(renderSpecies, [])
      bySpecies.get(renderSpecies).push(inst)

      // HERO canopy-impostor FOUNDATION (Phase 2) — this REPLACES the old hero-pan
      // prominence tiers (mesh/opaque/impostor/cull) for the whole neighborhood. Every
      // tree paints as a side-on canopy card UNLESS it's tall enough (dbh ≥ cut) to earn
      // geometry (the sprinkled anchors → fall through to mesh). Crucially it runs
      // BEFORE — and RETIRES — the legacy `heroTier==='cull'` verdict, which was scored
      // for the hero-pan shot and over-culled ~69% of placements (the "drastic reduction"
      // + bare shadow-spots). The foundation paints the whole neighborhood; impostors are
      // cheap billboards, so nothing gets dropped. (∩-foreground pan-distance axis: later.)
      if (heroFoundationEnabled && heroImpostorRecords) {
        if (heroImpostorRecords[renderSpecies] && (Number(inst.dbh) || 0) < heroDbhCut) {
          if (!heroImpostors.has(renderSpecies)) heroImpostors.set(renderSpecies, [])
          heroImpostors.get(renderSpecies).push(inst)
          heroFoundationCount++
          return
        }
        // else → mesh (tall anchor, or a species with no baked hero record). No cull.
      } else {
        // Legacy prominence behavior (no foundation) — the hero-pan cull + impostor role.
        if (inst.heroTier === 'cull') { heroCulled++; return }
        if (inst.heroTier === 'impostor' && impostorRecords?.[renderSpecies]) {
          if (!impostors.has(renderSpecies)) impostors.set(renderSpecies, [])
          impostors.get(renderSpecies).push(inst)
          impostorCount++
          return
        }
      }

      // Mesh ROLE — the tall anchors (foundation on), or the full mesh path (foundation
      // off; the legacy cull/impostor role handled above). Impostor with no baked record
      // also falls through here → real geometry, never blank.
      const url = inRoster ? lodUrlOf(inst, inst) : lodUrlOf(sub, inst)
      // Cache-bust GLB URLs against the atlas manifest's generatedAt so an
      // open Preview/Stage tab picks up rewritten UVs after a rebake instead
      // of holding drei's useGLTF cache for the same path indefinitely.
      const lookUrl = url.startsWith('/trees/')
        ? `${import.meta.env.BASE_URL}baked/${lookName}${url}${atlasVersion}`
        : url
      let byTile = m.get(lookUrl)
      if (!byTile) {
        if (maxVariants && m.size >= maxVariants) {
          const fallbackKey = m.keys().next().value
          if (fallbackKey) {
            const fb = m.get(fallbackKey)
            const tid = tileOf(inst.x, inst.z)
            if (!fb.has(tid)) fb.set(tid, [])
            fb.get(tid).push(inst)
          }
          return
        }
        byTile = new Map(); m.set(lookUrl, byTile)
      }
      const tid = tileOf(inst.x, inst.z)
      if (!byTile.has(tid)) byTile.set(tid, [])
      byTile.get(tid).push(inst)
    })
    let meshCount = 0
    let tileSet = new Set()
    for (const byTile of m.values()) {
      meshCount += byTile.size
      for (const tid of byTile.keys()) tileSet.add(tid)
    }
    const overheadTotal = [...bySpecies.values()].reduce((n, a) => n + a.length, 0)
    const heroFoundationTotal = [...heroImpostors.values()].reduce((n, a) => n + a.length, 0)
    console.log(`[InstancedTrees] roster=${atlas.roster.size} placements=${bake.instances.length} substituted=${substituted} dropped=${dropped} heroCulled=${heroCulled}(hero-only) heroFoundation=${heroFoundationCount}(${heroImpostors.size}sp, dbhCut=${heroDbhCut === Infinity ? 'off' : heroDbhCut.toFixed(2)}) impostors=${impostorCount}(${impostors.size}sp) meshVariants=${m.size} tiles=${tileSet.size} meshGroups=${meshCount} overhead=${overheadTotal}/${bySpecies.size}sp (${tileMeta ? `${tileMeta.cols}×${tileMeta.rows} bake-tiles` : 'no tiles in bake'})`)
    return { meshGroups: m, impostors, bySpecies, heroImpostors }
  }, [bake, maxVariants, atlas, lookName, impostorRecords, heroImpostorRecords, heroFoundationEnabled, heroGeomFraction])

  // ── Cold-load reconcile flush (the REAL fix) ───────────────────────────
  // The Canvas runs frameloop="demand". On a COLD load each per-variant
  // <Suspense> useGLTF resolves and React commits the VariantInstances fiber,
  // but R3F does NOT attach the new instancedMesh to the three.scene until the
  // NEXT reconcile pass. So the trees sit committed-but-UNATTACHED and stay
  // invisible until ANY state change triggers a reconcile — confirmed by the
  // operator: navigating Browse↔Hero, or nudging Exposure and back, makes them
  // appear. It is NOT a missing frame: continuous invalidate() does nothing, and
  // it also failed under frameloop="always" (Preview/Stage). Rendering ≠
  // reconciling. So we self-poke: force a few re-renders across the cold-load
  // window so each variant flushes/attaches as its GLB resolves, then stop. This
  // is the automated equivalent of the operator's Exposure-nudge. The visible
  // result is the sub-second shimmer-fill. (2026-06-28 — the hero "trees don't
  // relieve until a poke" bug.)
  const [, forceReconcile] = useReducer(x => (x + 1) & 0xffff, 0)
  useEffect(() => {
    if (!groups) return
    let id, n = 0
    const KICKS = 20            // ~8s of flushes (every 400ms), then stop
    const tick = () => { forceReconcile(); if (++n < KICKS) id = setTimeout(tick, 400) }
    id = setTimeout(tick, 400)
    return () => clearTimeout(id)
  }, [groups])

  // Phase B (2026-05-15): per-species bark settings carried in the atlas
  // manifest, with per-Look palette override (scene.materialColors[<species>])
  // taking precedence over the species default tintBase. Computed once per
  // (atlas, scene) and looked up by URL at VariantInstances mount.
  // Hook MUST run on every render (Rules of Hooks); kept above the early
  // returns so React's hook order is stable when atlas isn't ready yet.
  // UV tiling is pre-baked into the atlas tile content at publish time
  // (see arborist/generate-procedural.js preTileBark); the runtime no
  // longer needs to know tile bounds or uvScale.
  const barkBySpeciesEffective = useMemo(() => {
    const base = atlas?.manifest?.barkBySpecies || {}
    const overrides = scene?.materialColors || {}
    const out = {}
    for (const [species, spec] of Object.entries(base)) {
      const tintBase = overrides[species] || spec.tintBase || '#ffffff'
      out[species] = { ...spec, tintBase }
    }
    return out
  }, [atlas?.manifest?.barkBySpecies, scene?.materialColors])

  // Brief 2 (Holm): per-variant gradient slots from the atlas manifest.
  // Indexed by [species][variantId] — the GLB URL encodes both, parsed at
  // draw time. Variants without an entry render through the legacy
  // single-tint path (uUseBarkGradient stays 0). Pass-through memo on the
  // manifest field so cache-busting still works.
  const barkGradientByVariant = useMemo(() => {
    return atlas?.manifest?.barkGradientByVariant || {}
  }, [atlas?.manifest?.barkGradientByVariant])

  // Brief 2.1a (Cinder): per-species detail uvTransform + bark-tile bounds.
  // Looked up by URL→species at draw time. Variants without an entry render
  // through identity (composite short-circuits when slot is missing).
  const barkDetailBySpecies = useMemo(() => {
    return atlas?.manifest?.barkDetailBySpecies || {}
  }, [atlas?.manifest?.barkDetailBySpecies])

  // Brief 10B (Vellum): per-species posterized substrate uvTransform. Same
  // URL→species lookup pattern as detail; absent slot → identity-safe
  // (uBarkPosterizedTileScale=0 → vendor color flows through unchanged).
  const barkPosterizedBySpecies = useMemo(() => {
    return atlas?.manifest?.barkPosterizedBySpecies || {}
  }, [atlas?.manifest?.barkPosterizedBySpecies])

  // Brief 3A (Cant): per-species deformer ranges from trees-atlas.json (bake-
  // look surfaces manifest.json#deformer.range into deformerBySpecies, same
  // single-spec-per-species model as barkBySpecies). Looked up by URL→species
  // at draw time; absent → null → identity uniforms (no deformation).
  const deformerBySpecies = useMemo(() => {
    return atlas?.manifest?.deformerBySpecies || {}
  }, [atlas?.manifest?.deformerBySpecies])

  // ── Overhead SNAPSHOT (Browse) — whole-scene camera-height swap ─────────────
  // The 3-slice overhead asset (baked into the slab as overheadBySpecies) swaps in
  // when the camera pulls up to plan height. Hooks run unconditionally (Rules of
  // Hooks) with graceful nulls; enabled only when the look actually carries the
  // baked asset (so LS stays all-mesh until its slab is baked + the flag flips).
  const overheadBySpecies = useMemo(() => atlas?.manifest?.overheadBySpecies || null, [atlas?.manifest?.overheadBySpecies])
  const overheadEnabled = !!overheadBySpecies && scene?.overheadImpostor !== false
  const overheadMode = useOverheadMode(overheadEnabled)
  // Load-gate: defer the overhead disc PNGs past the hero-frame startup path
  // (idle-warm or on Browse-entry), so they don't compete with the mesh GLBs +
  // atlas the first frame needs. The SWAP still keys on overheadMode above.
  const overheadWarm = useOverheadWarm(overheadEnabled)
  const overheadSpeciesList = useMemo(
    () => (groups?.bySpecies ? Array.from(groups.bySpecies.keys()) : []),
    [groups],
  )
  const overheadAssets = useOverheadAssets({ enabled: overheadWarm, lookName, overheadBySpecies, species: overheadSpeciesList })

  // HERO canopy-impostor foundation assets — the side-on variety pool, loaded for
  // every species that has foundation instances. Eager (it's hero-critical, not a
  // Browse-only deferral like overhead): the impostor sea IS the first frame.
  const heroSpeciesList = useMemo(
    () => (groups?.heroImpostors ? Array.from(groups.heroImpostors.keys()) : []),
    [groups],
  )
  const heroAssets = useHeroImpostorAssets({ enabled: heroFoundationEnabled, lookName, heroImpostorBySpecies: heroImpostorRecords, species: heroSpeciesList })

  if (!groups || atlas.status !== 'ready') return null
  if (scene?.layerVis?.tree === false) return null

  const { meshGroups, impostors, bySpecies, heroImpostors } = groups

  return (
    <>
      <SwayDriver />
      <TierDriver />
      <OverheadLightDriver enabled={overheadEnabled || heroFoundationEnabled} />
      {/* All-mesh (+ hero impostor) render — hidden as a GROUP when the camera pulls
          up to plan height and the whole scene swaps to the overhead snapshot. */}
      <group visible={!overheadMode}>
      {/* HERO canopy-impostor FOUNDATION: every non-anchor tree as a billboarded
          side-on card (leaf shells + rear woody), per-instance azimuth variety. */}
      {heroAssets && !treeDbg('noTrees') && Array.from(heroImpostors.entries()).map(([species, instances]) => {
        const asset = heroAssets.get(species)
        return asset
          ? <HeroImpostorSpecies key={`hero#${species}`} asset={asset} instances={instances} visible={!overheadMode} />
          : null
      })}
      {/* Mesh-role trees: real 3D geometry (lod1). */}
      {!treeDbg('noMesh') && !treeDbg('noTrees') && Array.from(meshGroups.entries()).flatMap(([url, byTile]) =>
        Array.from(byTile.entries()).map(([tileId, instances]) => {
          const species = urlToSpecies(url)
          const variantId = urlToVariantId(url)
          const barkSettings = species ? barkBySpeciesEffective[species] : null
          const gradientSlot = (species && variantId)
            ? (barkGradientByVariant[species]?.[variantId] || barkGradientByVariant[species]?.[Number(variantId)] || null)
            : null
          const detailSlot = species ? (barkDetailBySpecies[species] || null) : null
          const posterizedSlot = species ? (barkPosterizedBySpecies[species] || null) : null
          const deformerRange = species ? (deformerBySpecies[species]?.range || null) : null
          return (
            <Suspense key={`${url}#${tileId}`} fallback={null}>
              <VariantInstances
                url={url}
                instances={instances}
                treeMaterial={atlas.treeMaterial}
                barkSettings={barkSettings}
                gradientSlot={gradientSlot}
                detailSlot={detailSlot}
                posterizedSlot={posterizedSlot}
                deformerRange={deformerRange}
              />
            </Suspense>
          )
        }),
      )}
      {/* Impostor-role trees: cheap stamped-2D layer cards (Arc 2, Phase 1).
          One geometry per rendered species, instanced across placements. Rides
          the SAME shared atlas material → full optical parity (DoF/fog/bloom). */}
      {!treeDbg('noImpostor') && !treeDbg('noTrees') && impostors && impostorRecords && Array.from(impostors.entries()).map(([species, instances]) => {
        const barkSettings = barkBySpeciesEffective[species] || null
        const detailSlot = barkDetailBySpecies[species] || null
        const posterizedSlot = barkPosterizedBySpecies[species] || null
        const deformerRange = deformerBySpecies[species]?.range || null
        return (
          <ImpostorSpecies
            key={`impostor#${species}`}
            species={species}
            record={impostorRecords[species]}
            instances={instances}
            treeMaterial={atlas.treeMaterial}
            barkSettings={barkSettings}
            detailSlot={detailSlot}
            posterizedSlot={posterizedSlot}
            deformerRange={deformerRange}
          />
        )
      })}
      </group>
      {/* Overhead SNAPSHOT (Browse): one instanced disc-stack per species, shown as
          a group when the camera is at plan height. Lazy-loaded behind the hero
          shot; a species with no baked asset simply stays on mesh (never blank). */}
      {overheadAssets && (
        <group visible={overheadMode && !treeDbg('noOverhead') && !treeDbg('noTrees')}>
          {Array.from(bySpecies.entries()).map(([species, instances]) => {
            const asset = overheadAssets.get(species)
            return asset
              ? <OverheadSpecies key={`overhead#${species}`} asset={asset} instances={instances} visible={overheadMode} />
              : null
          })}
        </group>
      )}
    </>
  )
}

export default function InstancedTrees({ maxVariants, lookId, bakeLastMs, bakeUrl } = {}) {
  // No default maxVariants — atlas collapses materials to 2 shared instances,
  // so unbounded variant count is now safe.
  return <ParkPopulation maxVariants={maxVariants} lookId={lookId} bakeLastMs={bakeLastMs} bakeUrl={bakeUrl} />
}
