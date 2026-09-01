/**
 * CityModel — the acquired CITY LOD2 building model consumer.
 *
 * Some installations can obtain a real municipal 3D city model: solids with
 * ACTUAL ROOF GEOMETRY (ridges, hips, gables, dormers), rather than the
 * flat-topped extrusions our own bake derives from OSM footprints. Łódź is the
 * first — the city publishes a LOD2 makieta of its revitalization area, which
 * covers Księży Młyn.
 *
 * Renders NOTHING when the look ships no `citymodel/citymodel.json` — the same
 * generic, no-LS rule MountainBackdrop follows. LS has none, so this cannot
 * regress it.
 *
 * ── The buildings are DYNAMIC, not scenery ───────────────────────────────
 * That is the whole point. Imported geometry that can't be clicked, lit by
 * neon, or joined to a listing is a diorama. So each vendor solid carries our
 * own `osm-<id>`:
 *
 *   1. scratch/join-citymodel-to-osm.mjs matches every solid to a baked
 *      footprint offline (centroid-in-polygon, then an area-overlap fallback
 *      for concave/courtyard blocks) and writes `<tile>_buildings.ids.json`,
 *      keyed by mesh NAME so runtime order can never drift from the join.
 *   2. here, that id becomes a per-vertex `aBuildingId` — the SAME numeric id
 *      SlabBuildings bakes, resolved through the SAME `useSlabBuildingIndex`.
 *      So raycast → id → select/hover works identically, and every downstream
 *      consumer (place cards, neon, selection ring) needs no special case.
 *
 * SlabBuildings still mounts (index-only) as the single hydration path for that
 * index — see its `renderGeometry` prop. We consume it; we never rebuild it.
 *
 * A solid with NO match (id -1) still RENDERS but is not clickable. Those are
 * real structures the city surveyed and OSM never mapped — courtyard
 * outbuildings, sheds, garages (median ~94 m², ~4 m tall, vs ~466 m²/5.6 m for
 * matched). Measured across 11 tiles: 71.6% of solids inside our extent carry an
 * id, and ZERO unmatched solids sit on a baked footprint — i.e. the join misses
 * nothing it should have caught; the remainder is genuine OSM under-coverage.
 * Rendering them is a FEATURE: the city model knows about buildings we didn't.
 *
 * ── Why merge ────────────────────────────────────────────────────────────
 * A tile arrives as ~1000 separate meshes = ~1000 draw calls, which would wreck
 * PAN, the only perf target that matters. We bake each mesh's world matrix into
 * its vertices and merge to ONE geometry per tile.
 *
 * ── Roof vs wall without materials ───────────────────────────────────────
 * The vendor ships one undifferentiated material per building. We classify at
 * load by face normal (near-up = roof) into a vertex attribute, so the Look can
 * address roofs and walls separately as the slab bake does.
 *
 * Stock MeshStandardMaterial patched via onBeforeCompile so the scene's TOD
 * light rig applies for free AND three keeps injecting log-depth chunks
 * (`feedback_raw_shadermaterial_needs_logdepth_chunks`).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh'
import { applyWeatherToShader } from '../lib/weather-uniforms.js'
import useTimeOfDay from '../hooks/useTimeOfDay'
import { ASSET_BASE } from '../lib/bakedUrl.js'
import { IS_MOBILE } from '../lib/isMobile.js'
import { INSTANCE } from '../instance.js'
import useSlabBuildingIndex from '../hooks/useSlabBuildingIndex'
import useSelectedBuilding from '../hooks/useSelectedBuilding'
import useCityModelActive from '../hooks/useCityModelActive'

const _fetchOpts = import.meta.env.DEV ? { cache: 'no-store' } : undefined

// A face whose normal points this far up is a ROOF. 0.5 ≈ 60° from vertical —
// generous enough for shallow pitches, steep enough to exclude walls.
const ROOF_NORMAL_Y = 0.5

const baseUrl = (lookId) => `${ASSET_BASE}baked/${lookId}/citymodel/`

// Placeholder albedo until the city model gets its own Look channel — the vendor
// ships no materials, so these two values ARE the palette right now. Brick wall /
// slate roof, chosen to sit with the LS-derived building palette.
const WALL_HEX = '#8d5a49'
const ROOF_HEX = '#4a4a52'
// Camera x-ray, same figures SlabBuildings uses (its `window.__bldgXray` knobs).
const XRAY_DIST = 12
const XRAY_BAND = 9

// ── Textures ──────────────────────────────────────────────────────────────
// WALL comes from the data: every Łódź building bakes `wallMaterial:'brick_red'`,
// which is also the correct read of a 19th-c. mill district.
//
// ROOF is a JUDGEMENT, and worth flagging. Our bake stamps `roofMaterial:'flat'`
// on every building — true of the OSM-derived EXTRUSION, which had no roof, and
// false of the city model, which ships real pitched roofs with ridges and hips.
// So 'flat' (which maps to no texture and a near-black constant) would be the
// wrong surface here. Slate is the honest stand-in for tiled Łódź roofs until
// this becomes a proper Look channel.
const WALL_TEX_ID = 'brick_red'
const ROOF_TEX_ID = 'slate'
// Matching SlabBuildings' scene.materialPhysics defaults.
const TEX_STRENGTH = 0.4
const TEX_SCALE = 1

// Same overlay blend the slab uses, so a textured LOD2 wall and a textured slab
// wall composite identically against their base colour.
const GLSL_OVERLAY = `
vec3 cmOverlay(vec3 base, vec3 tex) {
  return mix(2.0 * base * tex, 1.0 - 2.0 * (1.0 - base) * (1.0 - tex), step(0.5, base));
}`

const _texCache = new Map()
function loadTexture(id) {
  if (!id || id === 'none' || IS_MOBILE) return null   // mobile stays untextured, like the slab
  if (_texCache.has(id)) return _texCache.get(id)
  const t = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/buildings/${id}.jpg`)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  _texCache.set(id, t)
  return t
}

// Drag-vs-click guard, same contract as SlabBuildings: a pan should not select.
let _pdx = 0, _pdy = 0
const isDrag = (e) => Math.abs(e.clientX - _pdx) > 4 || Math.abs(e.clientY - _pdy) > 4

/**
 * Bake world matrices into vertices, stamp roof/wall + building id per vertex,
 * merge to ONE geometry. `idFor(meshName)` returns the numeric building id.
 */
function flattenTile(gltfScene, idFor) {
  const geoms = []
  gltfScene.updateMatrixWorld(true)
  let n = 0
  gltfScene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return
    const name = o.name || `mesh_${n}`
    n++
    const g = o.geometry.clone()
    g.applyMatrix4(o.matrixWorld)
    for (const k of Object.keys(g.attributes)) {
      if (k !== 'position' && k !== 'normal') g.deleteAttribute(k)
    }
    if (!g.attributes.normal) g.computeVertexNormals()
    // Non-indexed so roof/wall is per-triangle-vertex: an indexed vertex shared
    // between a wall face and a roof face could only carry ONE classification,
    // bleeding roof colour down the wall beneath it.
    const flat = g.index ? g.toNonIndexed() : g
    const count = flat.attributes.position.count
    const num = idFor(name)
    flat.setAttribute('aBuildingId', new THREE.BufferAttribute(new Float32Array(count).fill(num), 1))
    geoms.push(flat)
  })
  if (!geoms.length) return null
  const merged = mergeGeometries(geoms, false)
  if (!merged) return null

  const nrm = merged.attributes.normal
  const roof = new Float32Array(nrm.count)
  for (let i = 0; i < nrm.count; i++) roof[i] = nrm.getY(i) > ROOF_NORMAL_Y ? 1 : 0
  merged.setAttribute('aRoof', new THREE.BufferAttribute(roof, 1))
  merged.computeBoundingSphere()
  merged.computeBoundingBox()
  // BVH — R3F raycasts every mesh carrying a pointer handler on EVERY pointermove.
  // Brute-forcing 399k triangles measured 6.0 ms per pointer event (~36% of a core
  // at 60Hz), which is felt as drag lag across the whole authoring surface. The
  // tree is built once at load; raycasts then cost microseconds.
  merged.boundsTree = new MeshBVH(merged)
  return merged
}

export default function CityModel({ lookId: propLookId, interactive = true } = {}) {
  const lookId = propLookId || INSTANCE.lookId
  const [manifest, setManifest] = useState(null)
  const [tiles, setTiles] = useState([])
  const shadersRef = useRef([])

  const idToNum = useSlabBuildingIndex((s) => s.index?.idToNum)
  const select = useSelectedBuilding((s) => s.select)
  const setHovered = useSelectedBuilding((s) => s.setHovered)
  const clearHovered = useSelectedBuilding((s) => s.clearHovered)
  const getLightingPhase = useTimeOfDay((s) => s.getLightingPhase)
  const setCityActive = useCityModelActive((s) => s.setActive)
  const setCoveredIds = useCityModelActive((s) => s.setCoveredIds)

  // `?slab=1` restores the extruded buildings for an A/B — the city model then
  // stands down rather than z-fighting the extrusions it replaces.
  const slabWins = typeof window !== 'undefined' && /[?&]slab=1/.test(window.location.search)

  useEffect(() => {
    let dead = false
    setManifest(null); setTiles([])
    fetch(`${baseUrl(lookId)}citymodel.json`, _fetchOpts)
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (dead) return
        setManifest(m)
        // Publish on MANIFEST resolve so SlabBuildings stands down before our
        // geometry arrives — a beat of no buildings beats a beat of doubled ones.
        setCityActive(!!m?.tiles?.length && !slabWins)
      })
      .catch(() => {})            // absent manifest is the normal case, not an error
    return () => { dead = true; setCityActive(false); setCoveredIds(null) }
  }, [lookId, slabWins, setCityActive])

  // Geometry build WAITS on the identity index — stamping aBuildingId needs
  // idToNum, and rebuilding geometry later just to add ids would double the work.
  useEffect(() => {
    if (!manifest?.tiles?.length || slabWins || !idToNum) return
    let dead = false
    const loader = new GLTFLoader()
    const base = baseUrl(lookId)
    const out = []
    const coveredAcc = new Set()
    let pending = manifest.tiles.length
    const done = () => { if (--pending === 0 && !dead) setTiles(out) }

    for (const t of manifest.tiles) {
      // Ids sidecar is optional: without it the tile still renders, just inert.
      fetch(`${base}${t.id}_buildings.ids.json`, _fetchOpts)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
        .then((sidecar) => {
          const ids = sidecar?.ids || {}
          // Tell the slab which buildings we are drawing, so it suppresses ONLY
          // those and keeps rendering the ~46% the city model has no solid for.
          for (const v of Object.values(ids)) if (v) coveredAcc.add(v)
          setCoveredIds(new Set(coveredAcc))
          const idFor = (name) => {
            const osmId = ids[name]
            if (!osmId) return -1
            const num = idToNum.get(osmId)
            return num == null ? -1 : num
          }
          loader.load(
            `${base}${t.asset}`,
            (gltf) => {
              if (dead) return
              const geom = flattenTile(gltf.scene, idFor)
              if (geom) out.push({ id: t.id, geom, origin: t.origin || { x: 0, y: 0, z: 0 } })
              done()
            },
            undefined,
            (err) => { console.error(`[citymodel] tile ${t.id} failed —`, err); done() },
          )
        })
    }
    return () => { dead = true }
  }, [manifest, lookId, slabWins, idToNum, setCoveredIds])

  const material = useMemo(() => {
    const wallTex = loadTexture(WALL_TEX_ID)
    const roofTex = loadTexture(ROOF_TEX_ID)
    // flatShading — the slab buildings are faceted, and smooth-shaded LOD2 next
    // to faceted extrusions reads as a different material entirely (this is what
    // "not connected to the lighting the same way" looked like).
    const m = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.9, metalness: 0.05, flatShading: true,
    })

    const wall = new THREE.Color(WALL_HEX).convertSRGBToLinear()
    const roof = new THREE.Color(ROOF_HEX).convertSRGBToLinear()
    // Night target: the EXACT shift the slab bakes into aNightColor
    // (h+0.03, s×0.55, l×0.32 — LafayetteScene Building.nightColor). We hold one
    // uniform instead of a per-vertex attribute because our albedo is uniform.
    const hsl = {}
    wall.getHSL(hsl)
    const wallNight = new THREE.Color().setHSL(hsl.h + 0.03, hsl.s * 0.55, hsl.l * 0.32)

    m.onBeforeCompile = (shader) => {
      // Weather FIRST: it appends after <color_fragment>, so calling it before our
      // own albedo replace lands the final order as albedo → weather, matching the
      // live building. Reversing this puts wetness/snow underneath the albedo.
      applyWeatherToShader(shader)

      shader.uniforms.uWallColor = { value: wall }
      shader.uniforms.uWallNight = { value: wallNight }
      shader.uniforms.uRoofColor = { value: roof }
      shader.uniforms.uDarkFactor = { value: 0 }
      shader.uniforms.uSelectedId = { value: -1 }
      shader.uniforms.uHoveredId = { value: -1 }
      shader.uniforms.uCamPos = { value: new THREE.Vector3() }
      shader.uniforms.uDissolveDist = { value: XRAY_DIST }
      shader.uniforms.uDissolveBand = { value: XRAY_BAND }

      if (wallTex) { shader.uniforms.uWallTex = { value: wallTex } }
      if (roofTex) { shader.uniforms.uRoofTex = { value: roofTex } }
      if (wallTex || roofTex) {
        shader.uniforms.uTexStrength = { value: TEX_STRENGTH }
        shader.uniforms.uTexScale = { value: TEX_SCALE }
      }

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>',
          `#include <common>
           attribute float aRoof;
           attribute float aBuildingId;
           varying float vRoof;
           varying float vBId;
           varying vec3 vBPos;
           varying vec3 vBNorm;`)
        .replace('#include <begin_vertex>',
          `#include <begin_vertex>
           vRoof = aRoof;
           vBId = aBuildingId;
           vBPos = (modelMatrix * vec4(position, 1.0)).xyz;
           vBNorm = normalize(mat3(modelMatrix) * normal);`)

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>',
          `#include <common>
           varying float vRoof;
           varying float vBId;
           varying vec3 vBPos;
           varying vec3 vBNorm;
           uniform vec3 uWallColor;
           uniform vec3 uWallNight;
           uniform vec3 uRoofColor;
           uniform float uDarkFactor;
           uniform float uSelectedId;
           uniform float uHoveredId;
           uniform vec3 uCamPos;
           uniform float uDissolveDist;
           uniform float uDissolveBand;
           ${wallTex ? 'uniform sampler2D uWallTex;' : ''}
           ${roofTex ? 'uniform sampler2D uRoofTex;' : ''}
           ${(wallTex || roofTex) ? 'uniform float uTexStrength;\nuniform float uTexScale;' : ''}
           ${GLSL_OVERLAY}`)
        // Camera x-ray, same contract as SlabBuildings: fragments the camera is
        // inside dither-discard, so flying through a building never shows the
        // hollow cross-section the near-clip would slice.
        .replace('#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
           if (uDissolveDist > 0.0) {
             float camDist = distance(vBPos, uCamPos);
             float keep = smoothstep(uDissolveDist, uDissolveDist + uDissolveBand, camDist);
             if (keep < 1.0) {
               float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
               if (keep < ign) discard;
             }
           }`)
        // Albedo + night shift + texture, matching the slab: walls LERP toward the
        // HSL-shifted night colour, roofs MULTIPLY by (1 − darkFactor·0.75), and
        // each is overlay-blended with its texture at uTexStrength.
        //
        // Walls sample TRIPLANAR off world position — the vendor geometry carries
        // no UVs at all, so world-space projection is the only option, and it also
        // keeps brick coursing continuous across a corner instead of restarting
        // per face. Axis picked by the dominant horizontal normal.
        .replace('#include <color_fragment>',
          `#include <color_fragment>
           vec3 cmWall = mix(uWallColor, uWallNight, uDarkFactor);
           vec3 cmRoof = uRoofColor * (1.0 - uDarkFactor * 0.75);
           ${wallTex ? `
           vec2 wuv = (abs(vBNorm.x) > abs(vBNorm.z))
             ? vec2(vBPos.z, vBPos.y) * 0.25 / uTexScale
             : vec2(vBPos.x, vBPos.y) * 0.25 / uTexScale;
           vec3 wts = texture2D(uWallTex, wuv).rgb;
           cmWall = mix(cmWall, cmOverlay(cmWall, wts), uTexStrength);` : ''}
           ${roofTex ? `
           vec2 ruv = vBPos.xz * 0.2 / uTexScale;
           vec3 rts = texture2D(uRoofTex, ruv).rgb;
           cmRoof = mix(cmRoof, cmOverlay(cmRoof, rts), uTexStrength);` : ''}
           diffuseColor.rgb *= mix(cmWall, cmRoof, step(0.5, vRoof));`)
        // Selection / hover in-shader — one shared material can't set per-building
        // emissive. Same strengths as SlabBuildings, so a selected building reads
        // identically whichever geometry is drawing it.
        .replace('#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           float selT = step(abs(vBId - uSelectedId), 0.5);
           float hovT = step(abs(vBId - uHoveredId), 0.5);
           totalEmissiveRadiance += vec3(selT * 0.2 + (1.0 - selT) * hovT * 0.133);`)

      shadersRef.current.push(shader)
    }
    m.customProgramCacheKey = () => `citymodel-lod2-${wallTex ? 'w' : ''}${roofTex ? 'r' : ''}`
    return m
  }, [])

  // Drive the per-frame uniforms. This MUST be useFrame, not useEffect: shaders
  // register at COMPILE time, which happens after the first render, so an effect
  // keyed on selection would miss shaders that compiled later and leave them
  // frozen at their initial uniform values.
  useFrame((state) => {
    const shaders = shadersRef.current
    if (!shaders.length) return
    const { sunAltitude } = getLightingPhase()
    const darkFactor = Math.min(1, Math.max(0, (0.2 - sunAltitude) / 0.35))
    const { selectedId: sel, hoveredId: hov } = useSelectedBuilding.getState()
    const selNum = (idToNum && sel != null) ? (idToNum.get(sel) ?? -1) : -1
    const hovNum = (idToNum && hov != null) ? (idToNum.get(hov) ?? -1) : -1
    const cam = state.camera.position
    for (const sh of shaders) {
      if (!sh?.uniforms) continue
      sh.uniforms.uDarkFactor.value = darkFactor
      sh.uniforms.uSelectedId.value = selNum
      sh.uniforms.uHoveredId.value = hovNum
      sh.uniforms.uCamPos.value.set(cam.x, cam.y, cam.z)
    }
  })

  // Resolve a raycast hit to a building id via aBuildingId — same as SlabBuildings.
  const idAtFace = (e) => {
    if (!e.face) return null
    const attr = e.object?.geometry?.attributes?.aBuildingId
    if (!attr) return null
    const num = attr.getX(e.face.a)
    if (num < 0) return null
    return useSlabBuildingIndex.getState().index?.byNum[num]?.id ?? null
  }

  if (!tiles.length) return null
  return (
    <group name="citymodel" onPointerDown={(e) => { _pdx = e.clientX; _pdy = e.clientY }}>
      {tiles.map((t) => (
        <mesh
          key={t.id}
          geometry={t.geom}
          material={material}
          raycast={acceleratedRaycast}
          position={[t.origin.x, t.origin.y || 0, t.origin.z]}
          castShadow
          receiveShadow
          frustumCulled={false}
          onPointerMove={interactive ? (e) => { e.stopPropagation(); const id = idAtFace(e); if (id) { setHovered(id); document.body.style.cursor = 'pointer' } } : undefined}
          onPointerOut={interactive ? () => { clearHovered(); document.body.style.cursor = 'auto' } : undefined}
          onClick={interactive ? (e) => { e.stopPropagation(); if (isDrag(e)) return; const id = idAtFace(e); if (id) select(id) } : undefined}
        />
      ))}
    </group>
  )
}
