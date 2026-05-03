/**
 * BakedGround — the shared ground-bake consumer used by both Stage shots
 * and Preview. Reads the per-Look bundle (manifest + binary + AO lightmap)
 * written by `cartograph/bake-ground.js` and `bake-ground-ao.js`, and
 * mounts one Mesh per material/face group.
 *
 * Coplanar surfaces stack via per-material polygonOffset (no Y offsets).
 * AO is a single texture sample — no real-time AO post-FX needed.
 *
 * Parity rule: Stage and Preview MUST mount the same component reading
 * the same artifact. If you find yourself adding a Stage-only or
 * Preview-only branch in here, stop and reconsider — the whole point of
 * this component is that what Stage shows is what Preview shows is what
 * Publish ships. Differences belong upstream (in the bake) or downstream
 * (lighting environment), not in the consumer.
 */
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { useLoader, useFrame } from '@react-three/fiber'
import { BAND_TO_LAYER } from '../cartograph/m3Colors'
import { makeGrassMaterial } from './grassMaterial'
import { getLampLightmap } from './lampLightmap'
import useTimeOfDay from '../hooks/useTimeOfDay'
import { terrainExag, patchTerrain, V_EXAG } from '../utils/terrainShader'

// Material-kind groups that render with the noise-based grass shader
// (lawn = block interior, treelawn = curb→sidewalk strip, median = between
// paired carriageways).
const GRASS_MATERIALS = new Set(['lawn', 'treelawn', 'median'])

// Face-kind (land-use) groups that render with grass too. Mirrors
// StreetRibbons.jsx — park and residential face fills both go through
// makeGrassMaterial in LS, so Stage/Preview must follow.
const GRASS_FACES = new Set(['park', 'residential', 'recreation'])

function isGrassGroup(group) {
  return group.kind === 'face'
    ? GRASS_FACES.has(group.id)
    : GRASS_MATERIALS.has(group.id)
}

// Resolve a group's effective layer-visibility from scene.json. Material
// groups (asphalt, sidewalk, …) map through BAND_TO_LAYER to a layer
// id in layerVis. Face groups (residential, commercial, …) check
// luColors-keyed visibility if/when that lands; for now they're always
// visible (treat layerVis['lu-residential'] etc. as the lookup, which
// the Designer doesn't currently write but reserves the namespace).
function isGroupVisible(group, layerVis) {
  if (!layerVis) return true
  if (group.kind === 'face') {
    const key = 'lu-' + group.id
    return layerVis[key] !== false
  }
  const layerId = BAND_TO_LAYER[group.id] || group.id
  return layerVis[layerId] !== false
}

// Pick the radial-fade band for a group based on its kind. Faces dissolve
// on the inner band; ribbon materials use the wider band so streets trail
// past the dissolved blocks (the "soft neighborhood edge" aesthetic).
function fadeForGroup(group, stencil) {
  if (!stencil) return null
  const band = group.kind === 'face' ? stencil.fade : stencil.streetFade
  if (!band) return null
  return { center: stencil.center, inner: band.inner, outer: band.outer }
}

function GroundMeshes({ manifest, bin, scene }) {
  const layerVis = scene?.layerVis
  const stencil = manifest.stencil || null
  const lightmapUrl = manifest.lightmap
    ? '/baked/' + manifest.look + '/' + manifest.lightmap.image
    : null
  const lightmap = lightmapUrl ? useLoader(THREE.TextureLoader, lightmapUrl) : null

  useEffect(() => {
    if (lightmap) {
      lightmap.colorSpace = THREE.NoColorSpace
      lightmap.flipY = false
      lightmap.needsUpdate = true
    }
  }, [lightmap])

  const meshes = useMemo(() => {
    const bbox = manifest.bbox
    const W = bbox.max[0] - bbox.min[0]
    const H = bbox.max[2] - bbox.min[2]
    return manifest.groups.map(g => {
      const positions = new Float32Array(bin, g.vertexByteOffset, g.vertexCount * 3)
      const indices   = new Uint32Array(bin,  g.indexByteOffset,  g.indexCount)
      // Planar UV (and identical UV2): u = (x - minX)/W, v = (z - minZ)/H.
      // Matches the AO baker's texel→world mapping exactly.
      const uv = new Float32Array(g.vertexCount * 2)
      for (let i = 0; i < g.vertexCount; i++) {
        uv[i * 2]     = (positions[i * 3]     - bbox.min[0]) / W
        uv[i * 2 + 1] = (positions[i * 3 + 2] - bbox.min[2]) / H
      }
      const geom = new THREE.BufferGeometry()
      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geom.setAttribute('uv',  new THREE.BufferAttribute(uv, 2))
      geom.setAttribute('uv2', new THREE.BufferAttribute(uv, 2))  // aoMap slot
      geom.setIndex(new THREE.BufferAttribute(indices, 1))
      geom.computeVertexNormals()
      return { group: g, geometry: geom }
    })
  }, [manifest, bin])

  return (
    <group>
      {meshes.filter(({ group }) => isGroupVisible(group, layerVis)).map(({ group, geometry }) => {
        const fade = fadeForGroup(group, stencil)
        return isGrassGroup(group)
          ? <GrassMesh key={group.kind + ':' + group.id} group={group} geometry={geometry} lightmap={lightmap} fade={fade} />
          : <FadeMesh  key={group.kind + ':' + group.id} group={group} geometry={geometry} lightmap={lightmap} fade={fade} />
      })}
    </group>
  )
}

function FadeMesh({ group, geometry, lightmap, fade }) {
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: group.color,
      roughness: 0.95,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: 0,
      polygonOffsetUnits: group.polygonOffsetUnits,
    })
    if (fade) {
      mat.transparent = true
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uFadeCenter = { value: new THREE.Vector2(fade.center[0], fade.center[1]) }
        shader.uniforms.uFadeInner  = { value: fade.inner }
        shader.uniforms.uFadeOuter  = { value: fade.outer }
        shader.vertexShader = shader.vertexShader.replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vFadePos;'
        )
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vFadePos = (modelMatrix * vec4(position, 1.0)).xyz;`
        )
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          `#include <common>
           uniform vec2 uFadeCenter;
           uniform float uFadeInner;
           uniform float uFadeOuter;
           varying vec3 vFadePos;`
        )
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>
           float dFade = length(vFadePos.xz - uFadeCenter);
           gl_FragColor.a *= 1.0 - smoothstep(uFadeInner, uFadeOuter, dFade);`
        )
      }
      mat.customProgramCacheKey = () => `bg-fade-${fade.inner}-${fade.outer}`
    }
    // Terrain displacement applied last so its onBeforeCompile wraps any
    // earlier ones (fade, etc.) — patchTerrain runs first, then calls prev.
    // Drives off the shared terrainExag uniform.
    patchTerrain(mat, { perVertex: true })
    return mat
  }, [group.color, group.polygonOffsetUnits, fade?.center?.[0], fade?.center?.[1], fade?.inner, fade?.outer])

  useEffect(() => {
    material.aoMap = lightmap || null
    material.aoMapIntensity = 1
    material.needsUpdate = true
  }, [material, lightmap])

  return (
    <mesh
      geometry={geometry}
      material={material}
      renderOrder={group.renderOrder}
      receiveShadow
    />
  )
}

function GrassMesh({ group, geometry, lightmap, fade }) {
  const { material, shaderRef } = useMemo(
    () => {
      const built = makeGrassMaterial({
        color: group.color,
        lampLightmap: getLampLightmap(),
        // BakedGround mounts at world origin with no parent rotation in
        // both Stage and Preview. The lamp lightmap is sampled in world
        // space, so identity (cos=1, sin=0).
        lampMapRotation: [1, 0],
        fade,
      })
      // Same parity move as FadeMesh — every BakedGround material rises
      // with the shared terrain displacement.
      patchTerrain(built.material, { perVertex: true })
      return built
    },
    [group.color, fade?.center?.[0], fade?.center?.[1], fade?.inner, fade?.outer]
  )
  useEffect(() => {
    if (lightmap) {
      material.aoMap = lightmap
      material.needsUpdate = true
    }
  }, [material, lightmap])
  useFrame(() => {
    const s = shaderRef.current
    if (!s) return
    s.uniforms.uSunAltitude.value = useTimeOfDay.getState().getLightingPhase().sunAltitude
  })
  return (
    <mesh
      geometry={geometry}
      material={material}
      renderOrder={group.renderOrder}
      receiveShadow
    />
  )
}

// Drive the shared terrain exaggeration uniform toward `target`.
// Mounted unconditionally inside BakedGround so any consumer (Stage,
// Preview, future apps) gets terrain displacement without depending on
// StreetRibbons being mounted somewhere to drive it. `target` is a number;
// callers pick it (V_EXAG for hero/browse, 1 for street/planetarium, 0
// for flat top-down). Lerp matches the existing StreetRibbons cadence so
// transitions read identically wherever exag is consumed.
function TerrainExagDriver({ target }) {
  useFrame(() => {
    const cur = terrainExag.value
    if (Math.abs(cur - target) < 0.01) { terrainExag.value = target; return }
    terrainExag.value += (target - cur) * 0.06
  })
  return null
}

// Look id resolution. Caller may pass `lookId` directly (Stage uses the
// active Look from its store); fallback is the URL `?look=` param so
// Preview's standalone behavior is preserved when no prop is given.
function resolveLookId(propLookId) {
  if (propLookId) return propLookId
  if (typeof window === 'undefined') return 'lafayette-square'
  const m = window.location.search.match(/look=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : 'lafayette-square'
}

/**
 * @param {object} props
 * @param {string} [props.lookId]      — explicit Look id; falls back to URL param.
 * @param {number} [props.bakeLastMs]  — cache-bust signal; pass the store's
 *                                       `bakeLastMs` so Stage re-fetches when
 *                                       a new bake completes.
 * @param {number} [props.targetExag]  — terrain exaggeration target. Defaults
 *                                       to V_EXAG (~Hero/Browse drama). Pass 1
 *                                       for street-level, 0 for flat top-down.
 */
export default function BakedGround({ lookId, bakeLastMs, targetExag = V_EXAG } = {}) {
  const [data, setData] = useState(null)
  const [scene, setScene] = useState(null)

  const resolvedLookId = resolveLookId(lookId)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const t = bakeLastMs ?? Date.now()
        const manifestUrl = `/baked/${resolvedLookId}/ground.json?t=${t}`
        const m = await fetch(manifestUrl).then(r => r.json())
        const bin = await fetch('/baked/' + m.look + '/' + m.bin + '?t=' + t)
          .then(r => r.arrayBuffer())
        const sc = await fetch('/baked/' + m.look + '/scene.json?t=' + t)
          .then(r => r.ok ? r.json() : null).catch(() => null)
        if (!cancelled) { setData({ manifest: m, bin }); setScene(sc) }
      } catch (e) {
        console.warn('[BakedGround] load failed:', e)
      }
    })()
    return () => { cancelled = true }
  }, [resolvedLookId, bakeLastMs])

  return (
    <>
      <TerrainExagDriver target={targetExag} />
      {data && <GroundMeshes manifest={data.manifest} bin={data.bin} scene={scene} />}
    </>
  )
}
