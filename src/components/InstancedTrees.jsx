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
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
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
  injectImpostorBillboard,
} from './treeAtlasMaterial'
import { buildXImpostorGeometry, buildOpaqueCanopyGeometry } from './impostorGeometry.js'
import { useImpostorCaptures } from './captureImpostor.js'
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

// Trees are baked once globally (not per-Look) since species placement
// is data, not styling. Path stays at /baked/default.json for now —
// Arborist's auto-bake hook writes there.
const BAKE_URL = `${import.meta.env.BASE_URL}baked/default.json`

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

function VariantInstances({ url, instances, treeMaterial, barkSettings, gradientSlot, detailSlot, posterizedSlot, deformerRange }) {
  const { scene } = useGLTF(url)

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

  // Per-instance hero-tier code for the QC overlay (0 = mesh, 1 = impostor,
  // 2 = cull, 3 = opaque). From the baked `heroTier` field. Drives the read-only
  // QC tint (treeHeroTierQC). Absent field → 0 (mesh). NB: these are all `mesh`-
  // role placements here, so this is effectively all 0 — the attribute exists so
  // the shared shader's aHeroTier is always valid; OpaqueSpecies/XImpostor
  // fill their own tier code.
  const heroTiers = useMemo(() => {
    const arr = new Float32Array(instances.length)
    for (let i = 0; i < instances.length; i++) {
      const t = instances[i].heroTier
      arr[i] = t === 'cull' ? 2 : t === 'impostor' ? 1 : t === 'opaque' ? 3 : 0
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

function SubmeshInstances({ geometry, material, localMatrix, placementMatrices, lampGlows, heroTiers, barkSettings, gradientSlot, detailSlot, posterizedSlot, deformerRange }) {
  const ref = useRef(null)
  const camera = useThree(s => s.camera)

  // Robust per-tile frustum cull (2026-06-25). Each SubmeshInstances covers ONE
  // bake-tile's instances of one species (~103 m footprint, 4×4 grid), so in a
  // telephoto hero/street framing most tiles are off-screen and skippable —
  // 18.5M mesh tris/frame is otherwise drawn regardless of view.
  //
  // Why manual (not three's `frustumCulled`): the InstancedMesh auto-cull tests
  // a bound that does NOT include the RUNTIME terrain lift + sway the vertex
  // shader adds, so a tile's bound can sit off-screen while its displaced
  // geometry is on-screen → "trees randomly turn on" (the 2026-06-21 regression
  // that forced frustumCulled=false). Here we build a GENEROUSLY-PADDED
  // world-space sphere (instance positions + canopy radius + tree height +
  // terrain-lift/sway headroom) and test it ourselves. Over-padding is safe:
  // slightly less culling at tile edges, never a false drop. [[tree-building-frustum-culling]]
  const cullSphere = useMemo(() => {
    if (!placementMatrices?.length) return null
    if (geometry && !geometry.boundingBox) geometry.computeBoundingBox()
    const bb = geometry?.boundingBox
    const treeTop = bb ? Math.max(bb.max.y, 1) : 25
    const canopyR = bb
      ? Math.max(Math.abs(bb.max.x), Math.abs(bb.min.x), Math.abs(bb.max.z), Math.abs(bb.min.z), 1)
      : 6
    const box = new THREE.Box3()
    const p = new THREE.Vector3()
    for (const m of placementMatrices) { p.setFromMatrixPosition(m); box.expandByPoint(p) }
    const sphere = new THREE.Sphere()
    box.getBoundingSphere(sphere)
    // Instance positions are trunk bases (y≈0); raise the centre to cover the
    // canopy column and pad for spread + runtime lift/sway.
    sphere.center.y += treeTop * 0.5
    const TERRAIN_SWAY_PAD = 10   // generous headroom: terrain lift (≤V_EXAG×relief) + sway
    sphere.radius += canopyR + treeTop * 0.5 + TERRAIN_SWAY_PAD
    return sphere
  }, [placementMatrices, geometry])

  const _frustum = useMemo(() => new THREE.Frustum(), [])
  const _frMat = useMemo(() => new THREE.Matrix4(), [])
  useFrame(() => {
    const im = ref.current
    if (!im || !cullSphere) return
    _frMat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    _frustum.setFromProjectionMatrix(_frMat)
    im.visible = _frustum.intersectsSphere(cullSphere)
  })
  // Attach the per-instance lamp-glow + hero-tier attributes to the geometry.
  // Each unique GLB has a unique geometry instance (per url×tile), so these
  // don't bleed across variants. Consumed by the shader injection in
  // treeAtlasMaterial.js (aLampGlow → emissive; aHeroTier → QC tint).
  useEffect(() => {
    if (!geometry) return
    if (lampGlows) geometry.setAttribute('aLampGlow', new THREE.InstancedBufferAttribute(lampGlows, 1))
    if (heroTiers) geometry.setAttribute('aHeroTier', new THREE.InstancedBufferAttribute(heroTiers, 1))
  }, [geometry, lampGlows, heroTiers])
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
  }, [placementMatrices, localMatrix])

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

// XImpostor (Arc 2, Phase 1 — captured-impostor arc) — renders all impostor-ROLE
// placements of one species as a single InstancedMesh of ONE "X" cross-billboard
// textured with a render-to-texture CAPTURE of the real tree (captureImpostor.js).
//
// This REPLACES the FAILED analytic impostor (cross-quads sampling the bark/leaf
// atlas TILES, which read as dark leaf-slabs + a stone trunk at every distance —
// operator-rejected 2026-06-25). Because the billboard is textured with an actual
// RENDER of the species, the silhouette is correct BY CONSTRUCTION, and capturing
// through the shared treeMaterial gives automatic color/season parity with the
// near trees. The win is unchanged: TWO quads per species (one geometry, instanced
// across every impostor-role placement) replace ~15K overdrawing alpha leaf cards
// per tree — the standing perf fix the impostor arc exists for.
//
// The billboard rides full optical parity: its own slim tone-mapped + fogged
// MeshStandardMaterial (so DoF / fog / bloom all apply), base-anchored sway off
// the SHARED treeSwayUniforms (the whole forest moves as one weather system), and
// the lamp-glow emissive — all via injectImpostorBillboard. aHeroTier = 1 so
// ?heroTierQC=1 still tints these magenta (the shared QC uniform is read by the
// mesh material; here we tint inline below so the QC eye-gate covers impostors too).
function XImpostor({ species, record, texture, instances }) {
  const ref = useRef(null)

  // One X geometry per species, sized to the tree's real height × 2·canopyRadius
  // (base at y=0). The captured texture spans full-quad UVs (0..1).
  const geometry = useMemo(
    () => buildXImpostorGeometry(record?.heightM, record?.canopyRadiusM),
    [record?.heightM, record?.canopyRadiusM],
  )

  // One billboard material per species, owning the captured texture as `map`.
  // alphaTest 0.5 (opaque → early-Z) + DoubleSide (the cross's back faces show
  // as the camera orbits). Tone-mapped + fogged (MeshStandardMaterial defaults)
  // so the billboard rides DoF/fog/bloom like real geometry.
  const material = useMemo(() => {
    if (!texture) return null
    const m = new THREE.MeshStandardMaterial({
      map: texture,
      transparent: false,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 1,
      metalness: 0,
    })
    m.name = `impostor-billboard:${species}`
    injectImpostorBillboard(m)
    return m
    // species is stable per mount; texture identity drives the rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texture])

  // Dispose the per-species billboard material when it's replaced/unmounted
  // (the captured texture is owned by the module cache — NOT disposed here).
  useEffect(() => () => { try { material?.dispose() } catch {} }, [material])

  // Per-instance world matrices (translation + Y-rotation; scale baked into the
  // billboard's real-metre dims, like the mesh path). VERBATIM from the old path.
  const matrices = useMemo(() => {
    const arr = new Array(instances.length)
    const T = new THREE.Matrix4(), R = new THREE.Matrix4()
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i]
      T.makeTranslation(inst.x, inst.y || 0, inst.z)
      R.makeRotationY(inst.rotY || 0)
      arr[i] = T.multiply(R)
    }
    return arr
  }, [instances])

  // Per-instance lamp-glow + hero-tier attributes. aHeroTier = 1 (impostor) so
  // the QC overlay tints these magenta. VERBATIM from the old path.
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

  useEffect(() => {
    if (!geometry) return
    geometry.setAttribute('aLampGlow', new THREE.InstancedBufferAttribute(lampGlows, 1))
    geometry.setAttribute('aHeroTier', new THREE.InstancedBufferAttribute(heroTiers, 1))
  }, [geometry, lampGlows, heroTiers])

  useEffect(() => {
    const im = ref.current
    if (!im) return
    for (let i = 0; i < matrices.length; i++) im.setMatrixAt(i, matrices[i])
    im.instanceMatrix.needsUpdate = true
    if (im.computeBoundingSphere) im.computeBoundingSphere()
  }, [matrices])

  // Early-return null until the capture exists (TDZ/first-frame safety —
  // mirrors the plan's "XImpostor must early-return null until its texture
  // exists"). The material is null without a texture, so this also guards it.
  if (!geometry || !material || !texture || instances.length === 0) return null

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, instances.length]}
      castShadow={false}
      receiveShadow={false}
      frustumCulled={false}
    />
  )
}

// OpaqueSpecies (Arc 2, Phase B — the "opaque-articulated" MIDDLE tier) —
// renders all opaque-ROLE placements of one species as TWO instanced meshes:
//
//   1. the REAL bark prims of the species' lod GLB (articulated trunk/branches)
//      on the SHARED alpha-tested treeMaterial. Bark fragments are alpha=1 so
//      they pass the cutoff trivially — no overdraw concern on thin wood, and we
//      keep the genuine 3D structure (this tier is "more 3D than a billboard").
//
//   2. a SINGLE solid OPAQUE canopy SHELL (an ellipsoid, foliage-textured from
//      the species' leaf atlas rect) on the sibling OPAQUE material (alphaTest
//      OFF → writes depth → early-Z → ~zero overdraw). This REPLACES the
//      thousands of alpha-tested leaf cards that are the overdraw hog: alphaTest
//      defeats early-Z, so every leaf card's pixels are shaded then discarded;
//      an opaque hull shades each canopy pixel exactly once. That is the whole
//      perf point of the tier — cheaper than mesh, more form than an impostor.
//
// Both ride the SHARED sway/bark/QC/terrain uniforms (base-anchored hula ∝ height
// off the same wind), so the canopy sways with the rest of the forest. Per the
// role-at-bake doctrine this is chosen at BAKE (heroTier === 'opaque'), not by
// live camera distance.
function OpaqueSpecies({ url, record, instances, treeMaterial, opaqueCanopyMaterial, barkSettings, gradientSlot, detailSlot, posterizedSlot, deformerRange }) {
  const { scene } = useGLTF(url)

  // Extract ONLY the bark prims from the GLB (the articulated trunk/branches),
  // merged into a single geometry — mirrors VariantInstances#meshes' merge but
  // drops the leaf prims (the opaque canopy SHELL stands in for them). The
  // per-vertex attributes the shared shader needs (aBark, aBarkRegion, aWindTier,
  // aTreeHeightNorm) are stamped here exactly as the mesh path does.
  const barkGeometry = useMemo(() => {
    scene.updateMatrixWorld(true)
    const collected = []
    let chassisMinY = Infinity, chassisMaxY = -Infinity
    scene.traverse(o => {
      if (!o.isMesh) return
      const pos = o.geometry?.attributes?.position
      if (!pos) return
      const atlasKind = o.geometry?.userData?.atlasKind
        ?? o.userData?.atlasKind
        ?? o.userData?.gltfExtras?.atlasKind
      if (atlasKind !== 'bark') return   // bark prims only — the shell replaces leaves
      const g = o.geometry.clone()
      g.applyMatrix4(o.matrixWorld)
      g.computeBoundingBox()
      if (g.boundingBox) {
        if (g.boundingBox.min.y < chassisMinY) chassisMinY = g.boundingBox.min.y
        if (g.boundingBox.max.y > chassisMaxY) chassisMaxY = g.boundingBox.max.y
      }
      collected.push({ g, barkRegion: o.geometry?.userData?.barkRegion ?? o.userData?.barkRegion ?? o.userData?.gltfExtras?.barkRegion })
    })
    if (collected.length === 0) return null
    if (!Number.isFinite(chassisMinY)) chassisMinY = 0
    const chassisYRange = Math.max(1e-4, chassisMaxY - chassisMinY)
    for (const { g, barkRegion } of collected) {
      const gp = g.attributes.position
      const n = gp.count
      const aBarkArr = new Float32Array(n); aBarkArr.fill(1)         // all bark
      const aRegionArr = new Float32Array(n); if (barkRegion === 'trunk') aRegionArr.fill(1)
      const aWindArr = new Float32Array(n)
      const aHeightArr = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        const x = gp.getX(i), y = gp.getY(i), z = gp.getZ(i)
        const r = Math.sqrt(x * x + z * z)
        aWindArr[i] = (r > 0.15 && y < 3.0) ? 0 : r > 0.06 ? 1 : 2   // trunk/branch/twig
        const t = (y - chassisMinY) / chassisYRange
        aHeightArr[i] = t < 0 ? 0 : t > 1 ? 1 : t
      }
      g.setAttribute('aBark', new THREE.BufferAttribute(aBarkArr, 1))
      g.setAttribute('aBarkRegion', new THREE.BufferAttribute(aRegionArr, 1))
      g.setAttribute('aWindTier', new THREE.BufferAttribute(aWindArr, 1))
      g.setAttribute('aTreeHeightNorm', new THREE.BufferAttribute(aHeightArr, 1))
    }
    const geos = collected.map(c => c.g)
    const keys = Object.keys(geos[0].attributes).sort().join('|')
    const sameKeys = geos.every(g => Object.keys(g.attributes).sort().join('|') === keys)
    const noInterleaved = geos.every(g => Object.values(g.attributes).every(a => !a.isInterleavedBufferAttribute))
    if (sameKeys && noInterleaved) {
      const merged = mergeGeometries(geos, false)
      if (merged) return merged
    }
    return geos[0]   // degenerate fallback: first bark prim (rare attribute mismatch)
  }, [scene])

  // The opaque canopy shell geometry (one per species; summer). Null when the
  // record has no usable shell (winter/bare) → bark-only render.
  const shellGeometry = useMemo(() => buildOpaqueCanopyGeometry(record, 'summer'), [record])

  // Per-instance world matrices (translation + Y-rotation; scale baked into the
  // GLB / the shell's real-metre dims, like the mesh + impostor paths).
  const matrices = useMemo(() => {
    const arr = new Array(instances.length)
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i]
      const T = new THREE.Matrix4().makeTranslation(inst.x, inst.y || 0, inst.z)
      const R = new THREE.Matrix4().makeRotationY(inst.rotY || 0)
      arr[i] = T.multiply(R)
    }
    return arr
  }, [instances])

  const lampGlows = useMemo(() => {
    const a = new Float32Array(instances.length)
    for (let i = 0; i < instances.length; i++) a[i] = Number(instances[i].lampGlow) || 0
    return a
  }, [instances])
  // aHeroTier = 3 (opaque) so the QC overlay tints these ORANGE and the shared
  // shader treats them consistently with the mesh/impostor paths.
  const heroTiers = useMemo(() => {
    const a = new Float32Array(instances.length); a.fill(3); return a
  }, [instances])

  if ((!barkGeometry && !shellGeometry) || instances.length === 0) return null

  return (
    <>
      {barkGeometry && (
        <SubmeshInstances
          geometry={barkGeometry}
          material={treeMaterial}
          localMatrix={IDENTITY_MATRIX}
          placementMatrices={matrices}
          lampGlows={lampGlows}
          heroTiers={heroTiers}
          barkSettings={barkSettings}
          gradientSlot={gradientSlot}
          detailSlot={detailSlot}
          posterizedSlot={posterizedSlot}
          deformerRange={deformerRange}
        />
      )}
      {shellGeometry && (
        <SubmeshInstances
          geometry={shellGeometry}
          material={opaqueCanopyMaterial}
          localMatrix={IDENTITY_MATRIX}
          placementMatrices={matrices}
          lampGlows={lampGlows}
          heroTiers={heroTiers}
          barkSettings={barkSettings}
          gradientSlot={gradientSlot}
          detailSlot={detailSlot}
          posterizedSlot={posterizedSlot}
          deformerRange={deformerRange}
        />
      )}
    </>
  )
}

// Shared identity local-matrix for opaque-tier SubmeshInstances (the bark prims
// already carry their baked world transform; the shell is in tree-local metres).
const IDENTITY_MATRIX = new THREE.Matrix4()

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
  useFrame((_, delta) => {
    treeSwayUniforms.uTime.value += delta
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

function ParkPopulation({ maxVariants, lookId: propLookId, bakeLastMs, bakeUrl = BAKE_URL }) {
  // Active Look: explicit prop wins; otherwise URL `?look=` fallback; final
  // default 'lafayette-square'. Cartograph passes the active Look explicitly
  // via the StageEnvironment thread; Preview reads ?look= from the URL.
  const lookName = resolveLookId(propLookId)
  const scene = useSceneJson(lookName, bakeLastMs)
  const cacheBust = bakeLastMs ?? scene?.bakedAt ?? null

  const [bake, setBake] = useState(null)
  useEffect(() => {
    if (cacheBust == null) return
    let cancelled = false
    fetch(bakeUrl + '?t=' + cacheBust)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (!cancelled) setBake(j) })
      .catch(e => console.warn('[InstancedTrees] bake fetch failed:', e))
    return () => { cancelled = true }
  }, [bakeUrl, cacheBust])

  const atlas = useTreeAtlas(lookName)

  // Impostor records (Arc 2, Phase 1) — per-species height/canopyRadius specs
  // baked by arborist/bake-impostors.js into the atlas manifest. Keyed by
  // species; the grouping memo (below) routes impostor-role placements here, and
  // XImpostor sizes one captured X cross-billboard per species from the record.
  // Declared BEFORE the `groups` memo that depends on it (TDZ-safe).
  const impostorRecords = useMemo(() => {
    return atlas?.manifest?.impostorBySpecies || null
  }, [atlas?.manifest?.impostorBySpecies])

  // Opaque records (Arc 2, Phase B) — per-species canopy-shell specs baked by
  // arborist/bake-impostors.js#captureOpaque into the atlas manifest. Keyed by
  // species; the grouping memo routes opaque-role placements to OpaqueSpecies,
  // which keeps the species' real bark prims + builds one opaque canopy shell.
  // Declared BEFORE the `groups` memo that depends on it (TDZ-safe, mirrors
  // impostorRecords).
  const opaqueRecords = useMemo(() => {
    return atlas?.manifest?.opaqueBySpecies || null
  }, [atlas?.manifest?.opaqueBySpecies])

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

    // Tile bucketing. When the bake carries `tiles`, instances are split
    // per-(url × tile) so each InstancedMesh's bounding sphere lives over a
    // ~tileW × tileD footprint and culls naturally off-screen. Without
    // tiles, fall back to one bucket per url (legacy bakes).
    const tileMeta = bake.tiles
    const tileOf = tileMeta
      ? (x, z) => {
          const tx = Math.min(tileMeta.cols - 1, Math.max(0, Math.floor((x - tileMeta.minX) / tileMeta.tileW)))
          const tz = Math.min(tileMeta.rows - 1, Math.max(0, Math.floor((z - tileMeta.minZ) / tileMeta.tileD)))
          return tz * tileMeta.cols + tx
        }
      : () => 0

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

    const m = new Map()  // lookUrl -> Map<tileId, instances[]>  (mesh role)
    const impostors = new Map()  // species -> instances[]  (impostor role)
    const impostorGlb = new Map()  // species -> look-prefixed lod1 GLB url (for the capture)
    const opaques = new Map()    // lookUrl -> { species, instances[] }  (opaque role)
    let dropped = 0
    let substituted = 0
    let impostorCount = 0
    let opaqueCount = 0
    bake.instances.forEach((inst, idx) => {
      // Baked-role cull: always-occluded "specks behind specks" are dropped.
      if (inst.heroTier === 'cull') { dropped++; return }

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

      // Impostor ROLE → captured X cross-billboard path. One bucket per rendered
      // species; the per-species billboard is textured with a render-to-texture
      // CAPTURE of that species' real lod1 GLB (captureImpostor.js). Record a
      // representative look-prefixed lod1 URL so the capture loads the same GLB
      // the mesh path would (in-roster → this inst's lods; substituted → the
      // substitute's lods, so the capture matches the rendered species).
      if (inst.heroTier === 'impostor' && impostorRecords?.[renderSpecies]) {
        if (!impostors.has(renderSpecies)) impostors.set(renderSpecies, [])
        impostors.get(renderSpecies).push(inst)
        impostorCount++
        if (!impostorGlb.has(renderSpecies)) {
          const lods = inRoster ? inst.lods : sub?.lods
          const lod1 = lods?.lod1 || lods?.lod0 || (inRoster ? inst.url : sub?.url)
          if (lod1) {
            const capUrl = lod1.startsWith('/trees/')
              ? `${import.meta.env.BASE_URL}baked/${lookName}${lod1}${atlasVersion}`
              : lod1
            impostorGlb.set(renderSpecies, capUrl)
          }
        }
        return
      }

      // Resolve the species' lod GLB url (mesh + opaque both load it; opaque
      // keeps only the bark prims, mesh keeps everything).
      const url = inRoster ? lodUrlOf(inst, inst) : lodUrlOf(sub, inst)

      // Opaque ROLE → articulated-bark + opaque-canopy-shell path. Bucketed by
      // GLB url (OpaqueSpecies loads it for the bark prims) and carries the
      // rendered species so the shell record (opaqueBySpecies) resolves. Falls
      // through to the mesh path when no baked shell record exists for the
      // species (so the tree still renders, full leaves).
      if (inst.heroTier === 'opaque' && opaqueRecords?.[renderSpecies]) {
        const lookUrl = url.startsWith('/trees/')
          ? `${import.meta.env.BASE_URL}baked/${lookName}${url}${atlasVersion}`
          : url
        let entry = opaques.get(lookUrl)
        if (!entry) { entry = { species: renderSpecies, instances: [] }; opaques.set(lookUrl, entry) }
        entry.instances.push(inst)
        opaqueCount++
        return
      }

      // Mesh ROLE (or impostor/opaque with no baked record → fall back to real geo).
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
    console.log(`[InstancedTrees] roster=${atlas.roster.size} placements=${bake.instances.length} substituted=${substituted} dropped=${dropped} opaque=${opaqueCount}(${opaques.size}url) impostors=${impostorCount}(${impostors.size}sp) meshVariants=${m.size} tiles=${tileSet.size} meshGroups=${meshCount} (${tileMeta ? `${tileMeta.cols}×${tileMeta.rows} bake-tiles` : 'no tiles in bake'})`)
    return { meshGroups: m, impostors, impostorGlb, opaques }
  }, [bake, maxVariants, atlas, lookName, impostorRecords, opaqueRecords])

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

  // Impostor capture set (Arc 2, Phase 1 — captured-impostor arc). One entry per
  // impostor-role species: { species, glbUrl (look-prefixed lod1), heightM,
  // canopyRadiusM (from the baked impostor record) }. Derived from the groups
  // memo's per-species GLB map; the capture hook renders each species' real tree
  // to a texture ONCE and returns the per-species texture map. Declared BEFORE
  // the early returns + the consuming JSX so React's hook order is stable
  // (Rules of Hooks) regardless of atlas-ready state, and BEFORE the captures
  // hook that depends on it (TDZ-safe — mirrors impostorRecords/opaqueRecords).
  const captureSpecies = useMemo(() => {
    if (!groups?.impostors || !groups?.impostorGlb || !impostorRecords) return []
    const out = []
    for (const species of groups.impostors.keys()) {
      const rec = impostorRecords[species]
      const glbUrl = groups.impostorGlb.get(species)
      if (!rec || !glbUrl) continue
      out.push({
        species,
        glbUrl,
        heightM: rec.heightM || 12,
        canopyRadiusM: Math.max(0.5, rec.canopyRadiusM || 4),
      })
    }
    return out
  }, [groups, impostorRecords])

  // Run the render-to-texture captures (once per species; useEffect-gated inside
  // the hook, never useFrame). Returns { textures: Map<species,Texture>, ready }.
  // Called unconditionally (hook-order stable) with the shared LS tree material
  // so captures render with full atlas/bark parity.
  const { textures: impostorTextures } = useImpostorCaptures({
    lookName,
    treeMaterial: atlas?.treeMaterial || null,
    species: captureSpecies,
  })

  if (!groups || atlas.status !== 'ready') return null
  if (scene?.layerVis?.tree === false) return null

  const { meshGroups, impostors, opaques } = groups

  return (
    <>
      <SwayDriver />
      <TierDriver />
      {/* Mesh-role trees: real 3D geometry (lod1). */}
      {Array.from(meshGroups.entries()).flatMap(([url, byTile]) =>
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
      {/* Opaque-role trees: articulated bark prims + one SOLID OPAQUE canopy
          shell (Arc 2, Phase B — the 2nd-row middle tier). Bucketed by GLB url
          (OpaqueSpecies loads it for the real trunk/branches); the shell record
          resolves by the carried species. The shell is OPAQUE (early-Z → no
          overdraw — the perf point); bark rides the shared alpha material. */}
      {opaques && opaqueRecords && Array.from(opaques.entries()).map(([url, entry]) => {
        const species = entry.species
        const variantId = urlToVariantId(url)
        const barkSettings = barkBySpeciesEffective[species] || null
        const gradientSlot = (species && variantId)
          ? (barkGradientByVariant[species]?.[variantId] || barkGradientByVariant[species]?.[Number(variantId)] || null)
          : null
        const detailSlot = barkDetailBySpecies[species] || null
        const posterizedSlot = barkPosterizedBySpecies[species] || null
        const deformerRange = deformerBySpecies[species]?.range || null
        return (
          <Suspense key={`opaque#${url}`} fallback={null}>
            <OpaqueSpecies
              url={url}
              record={opaqueRecords[species]}
              instances={entry.instances}
              treeMaterial={atlas.treeMaterial}
              opaqueCanopyMaterial={atlas.opaqueCanopyMaterial}
              barkSettings={barkSettings}
              gradientSlot={gradientSlot}
              detailSlot={detailSlot}
              posterizedSlot={posterizedSlot}
              deformerRange={deformerRange}
            />
          </Suspense>
        )
      })}
      {/* Impostor-role trees: captured X cross-billboards (Arc 2, Phase 1 —
          captured-impostor arc). One billboard per rendered species, textured
          with a render-to-texture CAPTURE of the real tree (silhouette correct
          by construction), instanced across placements. Its own tone-mapped +
          fogged material → full optical parity (DoF/fog/bloom). A species whose
          capture isn't ready yet renders nothing this frame (XImpostor early-
          returns null until its texture exists) — it pops in once captured. */}
      {impostors && impostorRecords && Array.from(impostors.entries()).map(([species, instances]) => (
        <XImpostor
          key={`impostor#${species}`}
          species={species}
          record={impostorRecords[species]}
          texture={impostorTextures.get(species) || null}
          instances={instances}
        />
      ))}
    </>
  )
}

export default function InstancedTrees({ maxVariants, lookId, bakeLastMs, bakeUrl } = {}) {
  // No default maxVariants — atlas collapses materials to 2 shared instances,
  // so unbounded variant count is now safe.
  return <ParkPopulation maxVariants={maxVariants} lookId={lookId} bakeLastMs={bakeLastMs} bakeUrl={bakeUrl} />
}
