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
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useTreeAtlas, treeSwayUniforms } from './treeAtlasMaterial'
import useCartographStore from '../cartograph/stores/useCartographStore'

const PARK_GRID_ROTATION = -9.2 * (Math.PI / 180)
// Trees are baked once globally (not per-Look) since species placement
// is data, not styling. Path stays at /baked/default.json for now —
// Arborist's auto-bake hook writes there.
const BAKE_URL = '/baked/default.json'

function VariantInstances({ url, instances, treeMaterial }) {
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
      collected.push(g)
    })
    if (collected.length === 0) return []

    // Verify all geometries share the same attribute keys before merging.
    // If something diverges (rare, but a future tree variant could ship
    // vertex colors on bark only), fall back to per-primitive submeshes.
    const keys = Object.keys(collected[0].attributes).sort().join('|')
    const merge = collected.every(g => Object.keys(g.attributes).sort().join('|') === keys)

    if (merge) {
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
        />
      ))}
    </>
  )
}

function SubmeshInstances({ geometry, material, localMatrix, placementMatrices, lampGlows }) {
  const ref = useRef(null)
  // Attach the per-instance lamp-glow attribute to the geometry. Each
  // unique GLB has a unique geometry instance, so this doesn't bleed
  // across variants. The attribute is consumed by the shader injection
  // in treeAtlasMaterial.js.
  useEffect(() => {
    if (!geometry || !lampGlows) return
    geometry.setAttribute('aLampGlow', new THREE.InstancedBufferAttribute(lampGlows, 1))
  }, [geometry, lampGlows])
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

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, placementMatrices.length]}
      castShadow={false}
      receiveShadow={false}
      frustumCulled={true}
    />
  )
}

function SwayDriver() {
  useFrame((_, delta) => {
    treeSwayUniforms.uTime.value += delta
  })
  return null
}

function ParkPopulation({ maxVariants, lookId: propLookId, bakeUrl = BAKE_URL }) {
  const [bake, setBake] = useState(null)
  const [sceneLayerVis, setSceneLayerVis] = useState(null)
  useEffect(() => {
    let cancelled = false
    fetch(bakeUrl + '?t=' + Date.now())
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (!cancelled) setBake(j) })
      .catch(e => console.warn('[InstancedTrees] bake fetch failed:', e))
    return () => { cancelled = true }
  }, [bakeUrl])

  // Honor the Look's per-layer visibility from scene.json. Cartograph also
  // gates this component externally via store hiddenLayers, so this fetch
  // is mainly the path for Preview / standalone surfaces.
  useEffect(() => {
    if (!propLookId) return
    let cancelled = false
    fetch(`/baked/${propLookId}/scene.json?t=${Date.now()}`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (!cancelled) setSceneLayerVis(j?.layerVis || null) })
      .catch(() => { /* optional */ })
    return () => { cancelled = true }
  }, [propLookId])

  // Active Look + atlas: filter placement instances to species/variants in
  // this Look's roster, swap GLB URLs to the per-Look rewritten paths, and
  // hand atlas materials to each VariantInstances. Look resolution:
  //   1. explicit prop `lookId` (caller-provided) — used by Preview which
  //      reads `?look=` from URL.
  //   2. cartograph store activeLookId — used by cartograph Stage.
  const storeLookId = useCartographStore(s => s.activeLookId)
  const lookName = propLookId || storeLookId
  const atlas = useTreeAtlas(lookName)

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
      byCategory.get(cat).push({ key, species: inst.species, variantId: inst.variantId, url: inst.url })
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

    const m = new Map()  // lookUrl -> Map<tileId, instances[]>
    let dropped = 0
    let substituted = 0
    bake.instances.forEach((inst, idx) => {
      const key = `${inst.species}:${inst.variantId}`
      let url = inst.url
      if (!atlas.roster.has(key)) {
        const sub = fallbackFor(inst, idx)
        if (!sub) { dropped++; return }
        url = sub.url
        substituted++
      }
      // Cache-bust GLB URLs against the atlas manifest's generatedAt so an
      // open Preview/Stage tab picks up rewritten UVs after a rebake instead
      // of holding drei's useGLTF cache for the same path indefinitely.
      const lookUrl = url.startsWith('/trees/')
        ? `/baked/${lookName}${url}${atlasVersion}`
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
    console.log(`[InstancedTrees] roster=${atlas.roster.size} placements=${bake.instances.length} substituted=${substituted} dropped=${dropped} variants=${m.size} tiles=${tileSet.size} meshGroups=${meshCount} (${tileMeta ? `${tileMeta.cols}×${tileMeta.rows} bake-tiles` : 'no tiles in bake'})`)
    return m
  }, [bake, maxVariants, atlas, lookName])

  if (!groups || atlas.status !== 'ready') return null
  if (sceneLayerVis?.tree === false) return null

  return (
    <>
      <SwayDriver />
      <group rotation={[0, PARK_GRID_ROTATION, 0]}>
        {Array.from(groups.entries()).flatMap(([url, byTile]) =>
          Array.from(byTile.entries()).map(([tileId, instances]) => (
            <Suspense key={`${url}#${tileId}`} fallback={null}>
              <VariantInstances
                url={url}
                instances={instances}
                treeMaterial={atlas.treeMaterial}
              />
            </Suspense>
          )),
        )}
      </group>
    </>
  )
}

export default function InstancedTrees({ maxVariants, lookId, bakeUrl } = {}) {
  // No default maxVariants — atlas collapses materials to 2 shared instances,
  // so unbounded variant count is now safe.
  return <ParkPopulation maxVariants={maxVariants} lookId={lookId} bakeUrl={bakeUrl} />
}
