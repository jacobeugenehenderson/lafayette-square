/**
 * SlabBuildings — the slab buildings consumer (slab v2).
 *
 * Loads the merged-mesh buildings bake (`buildings.json` + `.bin`) and draws
 * it as ~9 group meshes (one per material) instead of ~1082 per-building
 * meshes, AND resolves per-building identity (click / hover / neon / place
 * state) against the render-scoped index baked into the manifest. Production
 * and Preview both consume this; nobody imports `src/data/buildings` for the
 * 3D render. See HANDOFF-buildings-bake.md + SLAB-CONTRACT §6.
 *
 * Material parity is the whole game (49/51 doctrine): this must look IDENTICAL
 * to the live `Building` + `Foundations` in LafayetteScene, not flatter. So it
 * ports the live shader exactly:
 *   - albedo from the per-vertex baked color, sRGB→linear converted to match
 *     the live `new THREE.Color(hex)` (ColorManagement is on) — EXCEPT the
 *     flat-roof constant [0.04,0.04,0.045] which the live shader uses raw.
 *   - walls + roofs at roughness 0.9 / metalness 0.05; foundation 0.95 / 0
 *     (the live roof is a Y-branch of the building material, NOT the slab's
 *     per-group slate/metal PBR — that was BakedBuildings-era divergence).
 *   - night shift: walls lerp to an exact HSL-shifted `aNightColor`; roofs
 *     ×(1 − darkFactor·0.75); foundation lerp tan→#3d3530.
 *   - desktop triplanar wall texture + roof texture overlay; mobile untextured.
 *   - weather (wet/snow) via applyWeatherToShader on walls + roofs.
 *   - terrain lift via the baked aCentroidY × shared uExag.
 * Selection / hover highlight in-shader (uSelectedId / uHoveredId vs the
 * per-vertex aBuildingId) since one shared material can't set per-building
 * emissive. Raycast resolves a hit to a building id via aBuildingId.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { terrainExag } from '../utils/terrainShader'
import { applyWeatherToShader } from '../lib/weather-uniforms.js'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useSelectedBuilding from '../hooks/useSelectedBuilding'
import useSlabBuildingIndex from '../hooks/useSlabBuildingIndex'
import { INSTANCE } from '../instance.js'

const _IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
const TEXTURE_BASE = `${import.meta.env.BASE_URL}textures/buildings/`

// Shared texture cache (heavy, shared across material groups + remounts).
const _texCache = new Map()
function loadTexture(id) {
  if (id === 'none' || !id || _IS_MOBILE) return null
  if (_texCache.has(id)) return _texCache.get(id)
  const tex = new THREE.TextureLoader().load(`${TEXTURE_BASE}${id}.jpg`)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  _texCache.set(id, tex)
  return tex
}

// Which texture a group samples. Walls → their id; roofs → slate/metal (flat
// = none); foundation = none. scene.materialPhysics may override.
function textureIdFor(group, scene) {
  const physicsKey = group.kind === 'roof' ? `roof_${group.id}` : group.id
  const texFromPhysics = scene?.materialPhysics?.[physicsKey]?.texture
  if (texFromPhysics && texFromPhysics !== 'none') return texFromPhysics
  if (group.kind === 'wall') return group.id
  if (group.kind === 'roof') return group.id === 'slate' ? 'slate' : group.id === 'metal' ? 'metal' : 'none'
  return 'none'
}

// ── Drag guard (mirrors LafayetteScene) — suppress clicks after a >6px pan ──
let _pdx = 0, _pdy = 0
function isDrag(e) {
  const ce = e.nativeEvent || e
  const dx = ce.clientX - _pdx, dy = ce.clientY - _pdy
  return dx * dx + dy * dy > 36
}

const _NIGHT_FOUND = new THREE.Color('#3d3530') // foundation night target (linear)

function getLookId(propLook) {
  if (propLook) return propLook
  if (typeof window !== 'undefined') {
    const m = window.location.search.match(/look=([^&]+)/)
    if (m) return decodeURIComponent(m[1])
  }
  return INSTANCE.lookId
}

export default function SlabBuildings({ lookId } = {}) {
  const LOOK_ID = useMemo(() => getLookId(lookId), [lookId])
  const [data, setData] = useState(null)   // { manifest, bin }
  const [scene, setScene] = useState(null)
  const setIndex = useSlabBuildingIndex((s) => s.setIndex)

  // ── Load manifest + bin + scene.json ──────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const base = import.meta.env.BASE_URL
        const t = Date.now()
        const m = await fetch(`${base}baked/${LOOK_ID}/buildings.json?t=${t}`).then(r => r.json())
        // Refuse unknown versions (SLAB-CONTRACT §0 / §10.3). v2 added the
        // render-scoped index + footprints section this consumer requires.
        if (m.version !== 2) {
          console.error(`[SlabBuildings] refusing buildings.json version ${m.version} (expected 2)`)
          return
        }
        const bin = await fetch(`${base}baked/${m.look}/${m.bin}?t=${t}`).then(r => r.arrayBuffer())
        const sc = await fetch(`${base}baked/${m.look}/scene.json?t=${t}`)
          .then(r => r.ok ? r.json() : null).catch(() => null)
        if (!cancelled) { setData({ manifest: m, bin }); setScene(sc) }
      } catch (e) {
        console.warn('[SlabBuildings] load failed:', e)
      }
    })()
    return () => { cancelled = true }
  }, [LOOK_ID])

  // ── Parse the index → identity map, publish to the shared store ────
  useEffect(() => {
    if (!data) return
    const { manifest, bin } = data
    const fpView = new Float32Array(bin, manifest.footprintByteOffset, manifest.footprintPointCount * 2)
    const byNum = manifest.buildings.map((b) => {
      const [ptStart, ptCount] = b.footprintRange
      const footprint = new Array(ptCount)
      for (let i = 0; i < ptCount; i++) footprint[i] = [fpView[(ptStart + i) * 2], fpView[(ptStart + i) * 2 + 1]]
      return {
        id: b.id, footprint, centroidY: b.centroidY, baseY: b.baseY,
        wallMaterial: b.wallMaterial, roofMaterial: b.roofMaterial, zoning: b.zoning,
        ranges: b.ranges,
      }
    })
    const byId = new Map(byNum.map(e => [e.id, e]))
    const idToNum = new Map(byNum.map((e, i) => [e.id, i]))
    setIndex({ byNum, byId, idToNum, look: manifest.look })
  }, [data, setIndex])

  // ── Build per-group geometry + stamp aBuildingId from the index ────
  const meshes = useMemo(() => {
    if (!data) return null
    const { manifest, bin } = data
    const groupData = manifest.groups.map((g) => {
      const positions = new Float32Array(bin, g.vertexByteOffset, g.vertexCount * 3).slice()
      const srcColors = new Float32Array(bin, g.colorByteOffset, g.vertexCount * 3)
      const uvs = g.uvByteOffset != null ? new Float32Array(bin, g.uvByteOffset, g.vertexCount * 2).slice() : null
      const centroidYs = g.centroidYByteOffset != null
        ? new Float32Array(bin, g.centroidYByteOffset, g.vertexCount).slice()
        : new Float32Array(g.vertexCount)
      const indices = new Uint32Array(bin, g.indexByteOffset, g.indexCount).slice()

      const isFlatRoof = g.kind === 'roof' && g.id === 'flat'
      const isWall = g.kind === 'wall'
      // Albedo: sRGB→linear to match the live `new THREE.Color(hex)`. The
      // flat-roof constant is a raw linear value in the live shader → keep raw.
      const colors = new Float32Array(g.vertexCount * 3)
      const nightColors = isWall ? new Float32Array(g.vertexCount * 3) : null
      const c = new THREE.Color()
      const hsl = {}
      for (let i = 0; i < g.vertexCount; i++) {
        const r = srcColors[i * 3], gg = srcColors[i * 3 + 1], b = srcColors[i * 3 + 2]
        if (isFlatRoof) { colors[i * 3] = r; colors[i * 3 + 1] = gg; colors[i * 3 + 2] = b }
        else {
          c.setRGB(r, gg, b, THREE.SRGBColorSpace)
          colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b
          if (isWall) {
            // Exact replica of LafayetteScene Building.nightColor.
            c.getHSL(hsl)
            c.setHSL(hsl.h + 0.03, hsl.s * 0.55, hsl.l * 0.32)
            nightColors[i * 3] = c.r; nightColors[i * 3 + 1] = c.g; nightColors[i * 3 + 2] = c.b
          }
        }
      }
      return { group: g, positions, colors, nightColors, uvs, centroidYs, indices, aBuildingId: new Float32Array(g.vertexCount).fill(-1) }
    })

    // Stamp per-vertex aBuildingId from the index ranges (numeric id = index
    // position; matches useSlabBuildingIndex.byNum). Ranges tile each group
    // exactly (asserted at bake), so every vertex gets a real id.
    const byKey = new Map(groupData.map(d => [`${d.group.kind}:${d.group.id}`, d]))
    manifest.buildings.forEach((b, num) => {
      const fill = (kind, mat, range) => {
        if (!range) return
        const d = byKey.get(`${kind}:${mat}`)
        if (!d) return
        const [start, count] = range
        for (let i = 0; i < count; i++) d.aBuildingId[start + i] = num
      }
      fill('wall', b.wallMaterial, b.ranges.wall)
      fill('roof', b.roofMaterial, b.ranges.roof)
      fill('foundation', 'foundation', b.ranges.foundation)
    })

    return groupData.map((d) => {
      const geom = new THREE.BufferGeometry()
      geom.setAttribute('position', new THREE.Float32BufferAttribute(d.positions, 3))
      geom.setAttribute('color', new THREE.Float32BufferAttribute(d.colors, 3))
      geom.setAttribute('aCentroidY', new THREE.Float32BufferAttribute(d.centroidYs, 1))
      geom.setAttribute('aBuildingId', new THREE.Float32BufferAttribute(d.aBuildingId, 1))
      if (d.nightColors) geom.setAttribute('aNightColor', new THREE.Float32BufferAttribute(d.nightColors, 3))
      if (d.uvs) geom.setAttribute('uv', new THREE.Float32BufferAttribute(d.uvs, 2))
      geom.setIndex(new THREE.Uint32BufferAttribute(d.indices, 1))
      geom.computeVertexNormals()
      return { group: d.group, geometry: geom, texId: textureIdFor(d.group, scene) }
    })
  }, [data, scene])

  // ── Selection / night uniform plumbing across all group shaders ────
  // Collected ONCE per material at compile (onBeforeCompile fires once, not
  // per render) — never reset here or the refs would be lost after compile.
  const shadersRef = useRef([])
  const getLightingPhase = useTimeOfDay((s) => s.getLightingPhase)
  const idToNum = useSlabBuildingIndex((s) => s.index?.idToNum)

  useFrame(() => {
    if (shadersRef.current.length === 0) return
    const { sunAltitude } = getLightingPhase()
    const darkFactor = Math.min(1, Math.max(0, (0.2 - sunAltitude) / 0.35))
    const { selectedId, hoveredId } = useSelectedBuilding.getState()
    const selNum = (idToNum && selectedId != null) ? (idToNum.get(selectedId) ?? -1) : -1
    const hovNum = (idToNum && hoveredId != null) ? (idToNum.get(hoveredId) ?? -1) : -1
    for (const sh of shadersRef.current) {
      if (!sh) continue
      sh.uniforms.uDarkFactor.value = darkFactor
      sh.uniforms.uSelectedId.value = selNum
      sh.uniforms.uHoveredId.value = hovNum
    }
  })

  if (!meshes) return null
  if (scene?.layerVis?.building === false) return null

  return (
    <group
      onPointerDown={(e) => { _pdx = e.clientX; _pdy = e.clientY }}
    >
      {meshes.map(({ group, geometry, texId }) => (
        <GroupMesh
          key={`${group.kind}:${group.id}`}
          group={group}
          geometry={geometry}
          texId={texId}
          scene={scene}
          registerShader={(sh) => shadersRef.current.push(sh)}
        />
      ))}
    </group>
  )
}

// overlay() blend (mirrors LafayetteScene) — kept as a glsl string fragment.
const GLSL_OVERLAY = `
vec3 slabOverlay(vec3 base, vec3 tex) {
  return mix(2.0 * base * tex, 1.0 - 2.0 * (1.0 - base) * (1.0 - tex), step(0.5, base));
}`

function GroupMesh({ group, geometry, texId, scene, registerShader }) {
  const tex = useMemo(() => loadTexture(texId), [texId])
  const isRoof = group.kind === 'roof'
  const isWall = group.kind === 'wall'
  const isFoundation = group.kind === 'foundation'
  const select = useSelectedBuilding((s) => s.select)
  const setHovered = useSelectedBuilding((s) => s.setHovered)
  const clearHovered = useSelectedBuilding((s) => s.clearHovered)

  // scene.materialPhysics override (usually empty); mirrors the live useEffect.
  const phys = scene?.materialPhysics?.[isRoof ? `roof_${group.id}` : group.id] || {}
  const texStrength = phys.textureStrength ?? 0.4
  const texScale = phys.textureScale ?? 1

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      // Walls + roofs share the live building material PBR; foundation differs.
      roughness: isFoundation ? (phys.roughness ?? 0.95) : (phys.roughness ?? 0.9),
      metalness: isFoundation ? (phys.metalness ?? 0) : (phys.metalness ?? 0.05),
      side: isRoof ? THREE.DoubleSide : THREE.FrontSide,
    })

    mat.onBeforeCompile = (shader) => {
      // Weather first (it appends after <color_fragment>), matching the live
      // ordering. Foundation gets no weather (live Foundations has none).
      if (!isFoundation) applyWeatherToShader(shader)

      shader.uniforms.uExag = terrainExag
      shader.uniforms.uDarkFactor = { value: 0 }
      shader.uniforms.uSelectedId = { value: -1 }
      shader.uniforms.uHoveredId = { value: -1 }
      if (isFoundation) shader.uniforms.uFoundNight = { value: _NIGHT_FOUND }
      if (tex) {
        shader.uniforms.uTex = { value: tex }
        shader.uniforms.uTexStrength = { value: texStrength }
        shader.uniforms.uTexScale = { value: texScale }
      }

      // ── Vertex: terrain lift + world pos/normal + ids/night passthrough ──
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         attribute float aCentroidY;
         attribute float aBuildingId;
         ${isWall ? 'attribute vec3 aNightColor;\n varying vec3 vNightCol;' : ''}
         uniform float uExag;
         varying vec3 vBPos;
         varying vec3 vBNorm;
         varying float vBId;`
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         // World pos from the UN-lifted baked position (matches live texture
         // anchoring); the lift only displaces the rendered vertex.
         vBPos = (modelMatrix * vec4(position, 1.0)).xyz;
         vBNorm = normalize(mat3(modelMatrix) * normal);
         vBId = aBuildingId;
         ${isWall ? 'vNightCol = aNightColor;' : ''}
         transformed.y += aCentroidY * uExag;`
      )

      // ── Fragment: declarations ──
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         uniform float uDarkFactor;
         uniform float uSelectedId;
         uniform float uHoveredId;
         ${isFoundation ? 'uniform vec3 uFoundNight;' : ''}
         ${isWall ? 'varying vec3 vNightCol;' : ''}
         ${tex ? 'uniform sampler2D uTex;\n uniform float uTexStrength;\n uniform float uTexScale;' : ''}
         varying vec3 vBPos;
         varying vec3 vBNorm;
         varying float vBId;
         ${GLSL_OVERLAY}`
      )

      // ── Fragment: albedo (append after color_fragment so it runs before
      //    weather's FRAG_BODY, exactly like the live Building). ──
      let body
      if (isFoundation) {
        body = `diffuseColor.rgb = mix(vColor, uFoundNight, uDarkFactor);`
      } else if (isWall) {
        const sample = tex
          ? `vec2 wuv;
             if (abs(vBNorm.x) > abs(vBNorm.z)) wuv = vec2(vBPos.z, vBPos.y) * 0.25;
             else wuv = vec2(vBPos.x, vBPos.y) * 0.25 / uTexScale;
             vec3 ts = texture2D(uTex, wuv).rgb;
             vec3 ov = slabOverlay(base, ts);
             diffuseColor.rgb = mix(base, ov, uTexStrength);`
          : `diffuseColor.rgb = base;`
        body = `vec3 base = mix(vColor, vNightCol, uDarkFactor);
                ${sample}`
      } else { // roof
        const tint = `vColor` // baked roof tint (linear) / flat constant
        const sample = tex
          ? `vec2 ruv = vBPos.xz * 0.2 / uTexScale;
             vec3 ts = texture2D(uTex, ruv).rgb;
             vec3 ov = slabOverlay(${tint}, ts);
             diffuseColor.rgb = mix(${tint}, ov, uTexStrength) * bRoofNight;`
          : `diffuseColor.rgb = ${tint} * bRoofNight;`
        body = `float bRoofNight = 1.0 - uDarkFactor * 0.75;
                ${sample}`
      }
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>\n${body}`
      )

      // ── Fragment: selection / hover emissive (per-building via id match).
      //    0x333333 selected (0.2), 0x222222 hover (0.133); selected wins. ──
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         float selT = step(abs(vBId - uSelectedId), 0.5);
         float hovT = step(abs(vBId - uHoveredId), 0.5);
         totalEmissiveRadiance += vec3(selT * 0.2 + (1.0 - selT) * hovT * 0.133);`
      )

      registerShader(shader)
    }
    mat.customProgramCacheKey = () => `slab-bldg-${group.kind}-${group.id}-${tex ? 'tex' : 'flat'}`
    return mat
  }, [tex, isRoof, isWall, isFoundation, texStrength, texScale, group.kind, group.id])

  // Resolve a raycast hit to a building id via the aBuildingId attribute.
  const idAtFace = (e) => {
    if (!e.face) return null
    const num = geometry.attributes.aBuildingId.getX(e.face.a)
    if (num < 0) return null
    return useSlabBuildingIndex.getState().index?.byNum[num]?.id ?? null
  }

  return (
    <mesh
      geometry={geometry}
      material={material}
      renderOrder={group.renderOrder}
      castShadow
      receiveShadow
      frustumCulled={false}
      onPointerMove={(e) => { e.stopPropagation(); const id = idAtFace(e); if (id) { setHovered(id); document.body.style.cursor = 'pointer' } }}
      onPointerOut={() => { clearHovered(); document.body.style.cursor = 'auto' }}
      onClick={(e) => { e.stopPropagation(); if (isDrag(e)) return; const id = idAtFace(e); if (id) select(id) }}
    />
  )
}
