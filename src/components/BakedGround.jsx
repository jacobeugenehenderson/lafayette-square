/**
 * BakedGround — the shared ground-bake consumer used by both Stage shots
 * and Preview. Reads the per-Look bundle (manifest + binary + AO lightmap)
 * written by `cartograph/bake-ground.js` and `bake-ground-ao.js`, and
 * mounts one Mesh per material/face group.
 *
 * Coplanar surfaces stack via baked per-group geometric Y (renderOrder × EPS,
 * bake-ground.js) — polygonOffset is inert under the log-depth canvas; renderOrder
 * still orders the transparent draws.
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
import { makeGravelPathMaterial } from './gravelPathMaterial'
import { getLampLightmap } from './lampLightmap'
import useTimeOfDay from '../hooks/useTimeOfDay'
import { terrainExag, patchTerrain, V_EXAG } from '../utils/terrainShader'
import { applyWeatherToShader } from '../lib/weather-uniforms.js'
import { lampGlow as _lampGlow } from '../preview/lampGlowState'
import { setGroundColorMap } from './groundColorState'
import { useSceneJson } from '../lib/useSceneJson.js'
import { INSTANCE } from '../instance.js'

// Material-kind groups that render with the noise-based grass shader
// (lawn = block interior, treelawn = curb→sidewalk strip, median = between
// paired carriageways).
const GRASS_MATERIALS = new Set(['lawn', 'treelawn', 'median'])

// Face-kind (land-use) groups that render with grass too. Mirrors
// StreetRibbons.jsx — park and residential face fills both go through
// makeGrassMaterial in LS, so Stage/Preview must follow.
const GRASS_FACES = new Set(['park', 'residential', 'recreation'])

// Per-LU treelawn variants ('treelawn:residential', 'treelawn:park', etc.)
// inherit the parcel's material treatment: grass-LU variants route through
// GrassMesh (procedural green); other LU variants render flat via
// FadeMesh in the LU's authored color. Bare 'treelawn' is always grass.
function isGrassGroup(group) {
  if (group.kind === 'face') return GRASS_FACES.has(group.id)
  const colonIdx = group.id.indexOf(':')
  if (colonIdx < 0) return GRASS_MATERIALS.has(group.id)
  const bareKind = group.id.slice(0, colonIdx)
  if (!GRASS_MATERIALS.has(bareKind)) return false
  const variant = group.id.slice(colonIdx + 1)
  return GRASS_FACES.has(variant)
}

// Ground groups that render with the park gravel (Voronoi pebble) shader.
const GRAVEL_MATERIALS = new Set(['park_path'])
function isGravelGroup(group) {
  return group.kind !== 'face' && GRAVEL_MATERIALS.has(group.id)
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
  // Per-LU material variants (e.g., 'treelawn:residential') resolve
  // visibility against the bare layer toggle ('treelawn').
  const colonIdx = group.id.indexOf(':')
  const bareId = colonIdx < 0 ? group.id : group.id.slice(0, colonIdx)
  const layerId = BAND_TO_LAYER[bareId] || bareId
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

function GroundMeshes({ manifest, bin, scene, bakeLastMs }) {
  const layerVis = scene?.layerVis
  const stencil = manifest.stencil || null
  // Cache-bust the lightmap URL with the same `?t=` token used for ground.json /
  // ground.bin. useLoader caches THREE.TextureLoader results by URL across
  // mounts, so without this query param a re-bake leaves the OLD AO texture
  // painted on the new geometry — the operator sees stale shadows that look
  // like the edit "didn't take" even though ground.bin is fresh.
  const lightmapUrl = manifest.lightmap
    ? import.meta.env.BASE_URL + 'baked/' + manifest.look + '/' + manifest.lightmap.image + (bakeLastMs ? '?t=' + bakeLastMs : '')
    : null
  const lightmap = lightmapUrl ? useLoader(THREE.TextureLoader, lightmapUrl) : null

  useEffect(() => {
    if (lightmap) {
      lightmap.colorSpace = THREE.NoColorSpace
      lightmap.flipY = false
      lightmap.needsUpdate = true
    }
  }, [lightmap])

  // Lamp light-pool map — baked additive ring profile, sampled by the
  // ground shaders (grass + FadeMesh) at world-XZ × the TOD Pool value.
  const poolMeta = manifest.poolmap || null
  const poolmapUrl = poolMeta
    ? import.meta.env.BASE_URL + 'baked/' + manifest.look + '/' + poolMeta.image + (bakeLastMs ? '?t=' + bakeLastMs : '')
    : null
  const poolmap = poolmapUrl ? useLoader(THREE.TextureLoader, poolmapUrl) : null
  useEffect(() => {
    if (poolmap) {
      poolmap.colorSpace = THREE.NoColorSpace
      poolmap.flipY = false
      poolmap.needsUpdate = true
    }
  }, [poolmap])

  // Ground-color map — per-Look albedo raster. Published into the shared
  // groundColor uniforms (groundColorState) so the tree trunk shader blends
  // each trunk base toward the ground beneath it. Color texture → sRGB so the
  // sample decodes to linear and mixes correctly with the (linear) trunk diffuse.
  const colorMeta = manifest.colormap || null
  const colormapUrl = colorMeta
    ? import.meta.env.BASE_URL + 'baked/' + manifest.look + '/' + colorMeta.image + (bakeLastMs ? '?t=' + bakeLastMs : '')
    : null
  const colormap = colormapUrl ? useLoader(THREE.TextureLoader, colormapUrl) : null
  useEffect(() => {
    if (colormap) {
      colormap.colorSpace = THREE.SRGBColorSpace
      colormap.flipY = false
      colormap.needsUpdate = true
      setGroundColorMap(colormap, colorMeta.min, colorMeta.span)
    }
    return () => setGroundColorMap(null)
  }, [colormap])

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
        const key = group.kind + ':' + group.id
        if (isGravelGroup(group))
          return <GravelMesh key={key} group={group} geometry={geometry} lightmap={lightmap}
            tintHex={scene?.layerColors?.[group.id]}
            roughness={scene?.materialPhysics?.[group.id]?.roughness}
            scale={scene?.materialPhysics?.[group.id]?.scale} />
        return isGrassGroup(group)
          ? <GrassMesh key={key} group={group} geometry={geometry} lightmap={lightmap} fade={fade} poolmap={poolmap} poolMeta={poolMeta} />
          : <FadeMesh  key={key} group={group} geometry={geometry} lightmap={lightmap} fade={fade} poolmap={poolmap} poolMeta={poolMeta} />
      })}
    </group>
  )
}

function FadeMesh({ group, geometry, lightmap, fade, poolmap, poolMeta }) {
  const hasPool = !!poolmap
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: group.color,
      roughness: 0.95,
      metalness: 0,
      // No polygonOffset — it's INERT under the log-depth canvas (the
      // <logdepthbuf_fragment> writes gl_FragDepth, bypassing GL_POLYGON_OFFSET_FILL).
      // Coplanar groups now separate by baked geometric Y (renderOrder × EPS,
      // bake-ground.js) + renderOrder for transparent draw-order. ARCHITECTURE §8.
    })
    if (fade) mat.transparent = true
    mat.onBeforeCompile = (shader) => {
      applyWeatherToShader(shader)  // Phase 7b/c: wet + snow opt-in
      // Inject a shared world-XZ varying + the fade discard and/or the lamp
      // light-pool add (additive warm, baked ring profile × TOD Pool value —
      // see grassMaterial for the matching grass-side term). Skip entirely
      // when neither is needed (the cheap plain asphalt path).
      if (fade || hasPool) {
        shader.vertexShader = shader.vertexShader.replace(
          '#include <common>', '#include <common>\nvarying vec3 vGndPos;')
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n vGndPos = (modelMatrix * vec4(position, 1.0)).xyz;')
        let decls = 'varying vec3 vGndPos;\n'
        if (fade)    decls += 'uniform vec2 uFadeCenter; uniform float uFadeInner; uniform float uFadeOuter;\n'
        if (hasPool) decls += 'uniform sampler2D uPoolMap; uniform vec2 uPoolMin; uniform vec2 uPoolSpan; uniform float uPoolScale; uniform float uPool; uniform float uShadowStr; uniform vec3 uLampColor;\n'
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>', '#include <common>\n' + decls)
        if (fade) {
          shader.uniforms.uFadeCenter = { value: new THREE.Vector2(fade.center[0], fade.center[1]) }
          shader.uniforms.uFadeInner  = { value: fade.inner }
          shader.uniforms.uFadeOuter  = { value: fade.outer }
        }
        if (hasPool) {
          shader.uniforms.uPoolMap   = { value: poolmap }
          shader.uniforms.uPoolMin   = { value: new THREE.Vector2(poolMeta?.min?.[0] ?? 0, poolMeta?.min?.[1] ?? 0) }
          shader.uniforms.uPoolSpan  = { value: new THREE.Vector2(poolMeta?.span?.[0] ?? 1, poolMeta?.span?.[1] ?? 1) }
          shader.uniforms.uPoolScale = { value: poolMeta?.scale ?? 1 }
          shader.uniforms.uPool      = _lampGlow.poolUniform
          shader.uniforms.uShadowStr = { value: 0.5 }
          shader.uniforms.uLampColor = _lampGlow.colorUniform
        }
        let post = '#include <dithering_fragment>\n'
        if (hasPool) post +=
          `{ vec2 puv = (vGndPos.xz - uPoolMin) / uPoolSpan;
             if (all(greaterThanEqual(puv, vec2(0.0))) && all(lessThanEqual(puv, vec2(1.0)))) {
               vec4 gfx = texture2D(uPoolMap, puv);
               gl_FragColor.rgb *= (1.0 - gfx.g * uShadowStr);                  // contact shadow
               gl_FragColor.rgb += uLampColor * gfx.r * uPoolScale * uPool;     // lamp pool (lamp colour)
             } }\n`
        if (fade) post +=
          `gl_FragColor.a *= 1.0 - smoothstep(uFadeInner, uFadeOuter, length(vGndPos.xz - uFadeCenter));\n`
        shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', post)
      }
    }
    mat.customProgramCacheKey = () =>
      `bg-${fade ? `fade-${fade.inner}-${fade.outer}` : 'plain'}-${hasPool ? 'pool' : 'nopool'}-wx1`
    // Terrain displacement applied last so its onBeforeCompile wraps any
    // earlier ones (fade, etc.) — patchTerrain runs first, then calls prev.
    // Drives off the shared terrainExag uniform.
    patchTerrain(mat, { perVertex: true })
    return mat
  }, [group.color, group.polygonOffsetUnits, fade?.center?.[0], fade?.center?.[1], fade?.inner, fade?.outer, hasPool, poolmap])

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

function GrassMesh({ group, geometry, lightmap, fade, poolmap, poolMeta }) {
  const { material, shaderRef } = useMemo(
    () => {
      const built = makeGrassMaterial({
        color: group.color,
        lampLightmap: getLampLightmap(),
        fade,
        poolMap: poolmap || null,
        poolMin: poolMeta?.min,
        poolSpan: poolMeta?.span,
        poolScale: poolMeta?.scale ?? 1,
      })
      // No polygonOffset (inert under log-depth). Grass faces separate from
      // adjacent FadeMesh faces by baked geometric Y (renderOrder × EPS) +
      // renderOrder. The 2026-05-13 "green faces invisible in Stage" symptom —
      // caused by relying on the inert polygonOffset at y=0 — is resolved by the
      // Y stack. (z-fight fix 2026-06-17, ARCHITECTURE §8.)
      // Same parity move as FadeMesh — every BakedGround material rises
      // with the shared terrain displacement.
      patchTerrain(built.material, { perVertex: true })
      return built
    },
    [group.color, group.polygonOffsetUnits, fade?.center?.[0], fade?.center?.[1], fade?.inner, fade?.outer, poolmap]
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

// Park footpaths — the Voronoi pebble gravel shader, shared with the live
// lake-bridge overlay (gravelPathMaterial). Rides terrain via patchTerrain
// (applied inside the factory) like every other ground group; drives its own
// time-of-day uniform. Phase 3 promotes the look-tunable bits to a scene-
// driven Stage material card.
function GravelMesh({ group, geometry, lightmap, tintHex, roughness, scale }) {
  const { material, shaderRef } = useMemo(
    () => makeGravelPathMaterial({ tintHex, roughness, scale }),
    [tintHex, roughness, scale]
  )
  useEffect(() => {
    material.aoMap = lightmap || null
    material.aoMapIntensity = 1
    material.needsUpdate = true
  }, [material, lightmap])
  useFrame(() => {
    if (shaderRef.current) {
      shaderRef.current.uniforms.uSunAltitude.value = useTimeOfDay.getState().getLightingPhase().sunAltitude
    }
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
  if (typeof window === 'undefined') return INSTANCE.lookId
  const m = window.location.search.match(/look=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : INSTANCE.lookId
}

/**
 * @param {object} props
 * @param {string} [props.lookId]      — explicit Look id; falls back to URL param.
 * @param {number} [props.bakeLastMs]  — Stage-authoring cache-bust override.
 *                                       Pass the cartograph store's `bakeLastMs`
 *                                       so the slab re-fetches when ↻ completes.
 *                                       Production omits this; the component
 *                                       falls back to `scene.bakedAt` (baked
 *                                       into scene.json per couplers plan CC.7).
 * @param {number} [props.targetExag]  — terrain exaggeration target. Defaults
 *                                       to V_EXAG (~Hero/Browse drama). Pass 1
 *                                       for street-level, 0 for flat top-down.
 */
export default function BakedGround({ lookId, bakeLastMs, targetExag = V_EXAG } = {}) {
  const [data, setData] = useState(null)
  const resolvedLookId = resolveLookId(lookId)

  // Scene.json comes through the slab data adapter (couplers plan §1).
  // Passing bakeLastMs as cacheBust makes Stage authoring reactive to ↻
  // rebakes; production passes undefined, so the hook uses its MODE-keyed
  // default and the module-scope memo keeps the fetch warm within a session.
  const scene = useSceneJson(resolvedLookId, bakeLastMs)

  // Effective cache-bust for the heavy artifacts (manifest, bin, lightmap):
  // Stage's explicit bakeLastMs wins; production falls back to scene.bakedAt
  // (the bake's completion epoch, baked into scene.json per CC.7). This
  // replaces the previous Date.now() fallback that defeated browser caching
  // on every page load.
  const cacheBust = bakeLastMs ?? scene?.bakedAt ?? null

  useEffect(() => {
    if (cacheBust == null) return
    let cancelled = false
    ;(async () => {
      try {
        const manifestUrl = `${import.meta.env.BASE_URL}baked/${resolvedLookId}/ground.json?t=${cacheBust}`
        const m = await fetch(manifestUrl).then(r => r.json())
        const bin = await fetch(import.meta.env.BASE_URL + 'baked/' + m.look + '/' + m.bin + '?t=' + cacheBust)
          .then(r => r.arrayBuffer())
        if (!cancelled) setData({ manifest: m, bin })
      } catch (e) {
        console.warn('[BakedGround] load failed:', e)
      }
    })()
    return () => { cancelled = true }
  }, [resolvedLookId, cacheBust])

  return (
    <>
      <TerrainExagDriver target={targetExag} />
      {/* Keyed by cacheBust so a re-bake REMOUNTS GroundMeshes with a fresh
          hook order — the lightmap/poolmap useLoaders are conditional on the
          manifest (poolmap may flip absent→present across a bake), and a bare
          re-render would change hook order and crash. Remount is fine: the
          geometry already rebuilds on manifest change. */}
      {data && scene && <GroundMeshes key={cacheBust ?? 'static'} manifest={data.manifest} bin={data.bin} scene={scene} bakeLastMs={cacheBust} />}
    </>
  )
}
