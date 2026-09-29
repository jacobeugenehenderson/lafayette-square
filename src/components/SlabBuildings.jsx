import { attachCSM } from './CascadedShadows.jsx'
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
import { terrainExag, terrainFloorRaw, RISER_LIFT_GLSL } from '../utils/terrainShader'
import { applyWeatherToShader } from '../lib/weather-uniforms.js'
import useTimeOfDay from '../hooks/useTimeOfDay'
import { useTownContext } from './townContext.js'
import useTownHover from './townHover.js'
import useSlabBuildingIndex from '../hooks/useSlabBuildingIndex'
import useCityModelActive from '../hooks/useCityModelActive'
import { lookOf } from '../lib/lookOf.js'
import { IDENTITY_NEUTRAL } from '../lib/townIdentity.js'

import { useQuality } from '../lib/qualityProfile.js'
import { buildingColors } from '../lib/buildingTint.js'
import { slabFetch } from '../lib/slabUrl.js'
import { lampGlow as _lampGlow, lampGrid as _lampGrid } from '../preview/lampGlowState'
import { LAMP_FALLOFF_GLSL, LAMP_WIPE_GLSL } from '../lib/lampPool.js'
import { kitUrl } from '../lib/kitUrl.js'

// ── Camera x-ray — always on (2026-06-28) ─────────────────────────────────
// When the camera passes THROUGH a building (its body within DIST metres of the
// camera) the fragments dither-discard, so you never see the hollow cross-
// section the near-clip would slice — the camera gets a clear shot through.
// Roofs the camera PASSES OVER stay solid (they're DIST+ away, well below), so
// only buildings the camera is genuinely *inside* dissolve. This is artifact
// suppression (like frustum culling), not a look channel — so it's automatic,
// not a knob: there's no value in ever seeing the broken cross-section.
// DIST/BAND are the feel knobs — tune live with `window.__bldgXray(dist, band)`.
// ⚠️ Sky-visibility strength, live for the eye-gate: window.__wallAO = 0..1
// 0 = pre-2026-09-22 behaviour (walls unoccluded), 1 = the full geometric term.
const _wallAO = { value: 1 }
if (typeof window !== 'undefined') {
  Object.defineProperty(window, '__wallAO', {
    get: () => _wallAO.value,
    set: (v) => { _wallAO.value = Math.max(0, Math.min(1, Number(v) || 0)) },
    configurable: true,
  })
}
let _dissolveDist = 12   // m: fragments closer than this fully dissolve (camera is "inside")
let _dissolveBand = 9    // m: soft dither band above the threshold (12→21m fades in)
if (typeof window !== 'undefined') {
  window.__bldgXray = (d, b) => {
    if (d != null) _dissolveDist = d
    if (b != null) _dissolveBand = b
    console.log(`[buildings] x-ray dist=${_dissolveDist}m band=${_dissolveBand}m`)
  }
}

// ── THE LIT SET, ON THE ROOFS (Warden → Jacob, 2026-09-28). An app shows a chosen category or a search by
// passing <Town litIds>; neon alone could not show it, because neon draws only for places OPEN now — at 10 a.m.
// or after hours a chosen category was invisible. So a lit building's ROOF mixes toward the town's lit tint,
// day and night, and the selected building gets the same mix, stronger. Neon still adds on top when open.
// ⭐ The tint is a Look identity channel (`scene.identity.litTint` = { color, strength }, src/lib/townIdentity.js),
// authored per town; absent, the kit's neutral one, which is no town's. One set of uniforms shared by every roof material, so a change
// of lit set or tint re-uploads a small texture and never recompiles a shader.
export const litUniforms = {
  uLitTex: { value: null },
  uLitTexSize: { value: new THREE.Vector2(1, 1) },
  uLitOn: { value: 0 },
  uLitColor: { value: new THREE.Color(IDENTITY_NEUTRAL.litTint.color) },
  uLitStrength: { value: IDENTITY_NEUTRAL.litTint.strength },
}
function litTexture(byNum, litIds) {
  const n = Math.max(1, byNum.length)
  const w = Math.min(n, 2048), h = Math.ceil(n / w)
  const data = new Uint8Array(w * h)
  if (litIds) for (let i = 0; i < byNum.length; i++) if (litIds.has(byNum[i].id)) data[i] = 255
  const t = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.UnsignedByteType)
  t.needsUpdate = true
  return t
}

// Shared texture cache (heavy, shared across material groups + remounts).
const _texCache = new Map()
function loadTexture(id, textured) {
  if (id === 'none' || !id || !textured) return null
  if (_texCache.has(id)) return _texCache.get(id)
  const tex = new THREE.TextureLoader().load(kitUrl(`textures/buildings/${id}.jpg`))
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


/**
 * Stands down to INDEX-ONLY (loads, parses and publishes the identity index, but
 * draws no building meshes) whenever an acquired city LOD2 model is drawing the
 * buildings for this look — see CityModel.jsx + useCityModelActive. Identity must
 * stay on ONE hydration path (this one) or the index and the meshes drift apart
 * (`feedback_dual_hydration_paths_drift`). The selection ring still draws: it
 * traces the baked footprint, which sits directly under the LOD2 solid.
 *
 * Reading the store HERE rather than taking a prop keeps all three hosts
 * (Scene / CartographApp / PreviewApp) identical and scene-generic — none of them
 * can know whether an arbitrary lookId ships a city model.
 * `renderGeometry: false` additionally forces index-only for callers that want it.
 */
// `materialPhysicsOverride`: Stage's live wall/roof physics, laid over the baked scene.materialPhysics so an
// edit shows before a bake (Loupe's audit, 2026-09-26). The building PALETTE is live too, on a v3 slab (below).
// ── THE LIVE PALETTE (BRIEF-live-building-palette; Jacob 2026-09-27: "live retint for every town") ──────────────
// The slab stores each vertex's sRGB colour; the player converts it to linear (and derives the walls' night colour)
// in ONE function, used when the slab loads AND when the palette changes. A v3 slab records each building's tint
// SOURCE (`tint`), so a palette drag recomputes every building through the SAME module the bake uses
// (src/lib/buildingTint.js) and rewrites its vertex range — a live drag equals a re-bake
// (▶ checks/claims-live-palette-equals-the-bake.mjs). A FIXED tint (an operator's override colour) never moves.
// ⛔ A v2 slab does not say which buildings were overridden, so it DRAWS as baked and REFUSES a live palette, loudly
// (Warden's ruling 2026-09-28) — the town gets live retint at its next bake. The v2 path goes when no town is v2.
const _c = new THREE.Color(), _hsl = {}
function writeLinear(r, g, b, isFlatRoof, isWall, colors, nightColors, i) {
  // Albedo: sRGB→linear to match `new THREE.Color(hex)`. The flat-roof constant is a raw value → kept raw.
  if (isFlatRoof) { colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b; return }
  _c.setRGB(r, g, b, THREE.SRGBColorSpace)
  colors[i * 3] = _c.r; colors[i * 3 + 1] = _c.g; colors[i * 3 + 2] = _c.b
  if (isWall) {
    // The night colour: keep the hue, cool and darken (the building's own colour at night).
    _c.getHSL(_hsl)
    _c.setHSL(_hsl.h + 0.03, _hsl.s * 0.55, _hsl.l * 0.32)
    nightColors[i * 3] = _c.r; nightColors[i * 3 + 1] = _c.g; nightColors[i * 3 + 2] = _c.b
  }
}
let _v2Warned = new Set()
function recolour(meshes, manifest, palettes) {
  const byKey = new Map(meshes.map(m => [`${m.group.kind}:${m.group.id}`, m]))
  for (const e of manifest.buildings) {
    const cols = buildingColors(e.id, e.tint, e.roofMaterial, palettes)
    for (const [kind, id, rgb] of [['wall', e.wallMaterial, cols.wall], ['roof', e.roofMaterial, cols.roof]]) {
      const r = e.ranges?.[kind]; const m = r && byKey.get(`${kind}:${id}`); if (!m) continue
      const colors = m.geometry.attributes.color.array
      const night = m.geometry.attributes.aNightColor?.array ?? null
      const flat = kind === 'roof' && id === 'flat', wall = kind === 'wall'
      for (let v = r[0]; v < r[0] + r[1]; v++) writeLinear(rgb[0], rgb[1], rgb[2], flat, wall, colors, night, v)
    }
  }
  for (const m of meshes) {
    m.geometry.attributes.color.needsUpdate = true
    if (m.geometry.attributes.aNightColor) m.geometry.attributes.aNightColor.needsUpdate = true
  }
}

// `litIds` (Set of building ids, <Town litIds>) tints those roofs; `litTintOverride` is Stage's live channel.
// `paletteOverride` / `wallPalettesOverride`: Stage's live palettes (<Town overrides.buildingPalette / .wallPalettes>).
export default function SlabBuildings({ lookId, interactive = true, renderGeometry = true, materialPhysicsOverride, paletteOverride, wallPalettesOverride, litIds, litTintOverride } = {}) {
  const LOOK_ID = lookOf(lookId, 'SlabBuildings')
  const [data, setData] = useState(null)   // { manifest, bin }
  const [bakedScene, setScene] = useState(null)
  const scene = useMemo(() => (materialPhysicsOverride && bakedScene
    ? { ...bakedScene, materialPhysics: materialPhysicsOverride } : bakedScene), [bakedScene, materialPhysicsOverride])
  // The lit set → the shared roof uniforms. Absent litIds: off (the selection tint still reads uSelectedId).
  const litIndex = useSlabBuildingIndex((s) => s.index)
  useEffect(() => {
    if (!litIndex || litIndex.look !== LOOK_ID) return
    const prev = litUniforms.uLitTex.value
    const t = litTexture(litIndex.byNum, litIds)
    litUniforms.uLitTex.value = t
    litUniforms.uLitTexSize.value.set(t.image.width, t.image.height)
    litUniforms.uLitOn.value = litIds ? 1 : 0
    if (prev) prev.dispose()
  }, [litIndex, litIds, LOOK_ID])
  const tint = litTintOverride ?? bakedScene?.identity?.litTint ?? IDENTITY_NEUTRAL.litTint
  useEffect(() => {
    litUniforms.uLitColor.value.set(tint.color)
    litUniforms.uLitStrength.value = tint.strength
  }, [tint.color, tint.strength])
  // The city model covers only the buildings OSM also mapped, so we keep DRAWING
  // and keep the geometry mounted — suppression is PER BUILDING (aCovered below),
  // not wholesale. Hiding everything left ~46% of Łódź as bare ground.
  const cityCoveredIds = useCityModelActive((s) => s.coveredIds)
  const drawGeometry = renderGeometry
  const canInteract = interactive
  const setIndex = useSlabBuildingIndex((s) => s.setIndex)
  const clearIndex = useSlabBuildingIndex((s) => s.clear)

  // Drop the published index on unmount so downstream consumers (SceneNeon,
  // selection) revert to the live path — keeps the Preview slab A/B clean.
  useEffect(() => () => clearIndex(), [clearIndex])

  // ── Load manifest + bin + scene.json ──────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const m = await slabFetch(LOOK_ID, 'buildings.json').then(r => r.json())
        // Refuse unknown versions (SLAB-CONTRACT §0 / §10.3). v2 added the
        // render-scoped index + footprints section this consumer requires.
        // Refuse unknown versions (SLAB-CONTRACT §0 / §10.3). v3 adds each building's tint source (the live
        // palette); v2 still draws, and refuses only the live palette (see recolour above).
        if (m.version !== 2 && m.version !== 3) {
          console.error(`[SlabBuildings] refusing buildings.json version ${m.version} (expected 2 or 3)`)
          return
        }
        const bin = await slabFetch(m.look, m.bin).then(r => r.arrayBuffer())
        const sc = await slabFetch(m.look, 'scene.json')
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
    // roofOutline — the true rooftop-edge ring per building (v2 additive .bin
    // section). SceneNeon traces it instead of the wider footprint. Optional:
    // older bakes without the section leave roofOutline undefined and the neon
    // consumer falls back to the footprint. Hip roofs bake a degenerate ring
    // (1–2 pts); the consumer treats <3 pts as a footprint fallback.
    const roView = manifest.roofOutlineByteOffset != null
      ? new Float32Array(bin, manifest.roofOutlineByteOffset, manifest.roofOutlinePointCount * 2)
      : null
    const byNum = manifest.buildings.map((b) => {
      const [ptStart, ptCount] = b.footprintRange
      const footprint = new Array(ptCount)
      for (let i = 0; i < ptCount; i++) footprint[i] = [fpView[(ptStart + i) * 2], fpView[(ptStart + i) * 2 + 1]]
      let roofOutline
      if (roView && b.roofOutlineRange) {
        const [rStart, rCount] = b.roofOutlineRange
        roofOutline = new Array(rCount)
        for (let i = 0; i < rCount; i++) roofOutline[i] = [roView[(rStart + i) * 2], roView[(rStart + i) * 2 + 1]]
      }
      return {
        id: b.id, footprint, roofOutline, centroidY: b.centroidY, baseY: b.baseY,
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
      for (let i = 0; i < g.vertexCount; i++) writeLinear(srcColors[i * 3], srcColors[i * 3 + 1], srcColors[i * 3 + 2], isFlatRoof, isWall, colors, nightColors, i)
      return { group: g, positions, colors, nightColors, uvs, centroidYs, indices,
               aBuildingId: new Float32Array(g.vertexCount).fill(-1),
               aCovered: new Float32Array(g.vertexCount) }
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
        const covered = cityCoveredIds?.has(b.id) ? 1 : 0
        for (let i = 0; i < count; i++) { d.aBuildingId[start + i] = num; d.aCovered[start + i] = covered }
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
      geom.setAttribute('aCovered', new THREE.Float32BufferAttribute(d.aCovered, 1))
      if (d.nightColors) geom.setAttribute('aNightColor', new THREE.Float32BufferAttribute(d.nightColors, 3))
      if (d.uvs) geom.setAttribute('uv', new THREE.Float32BufferAttribute(d.uvs, 2))
      geom.setIndex(new THREE.Uint32BufferAttribute(d.indices, 1))
      geom.computeVertexNormals()
      return { group: d.group, geometry: geom, texId: textureIdFor(d.group, scene) }
    })
  }, [data, scene, cityCoveredIds])

  // ── The live palette: recolour when the effective palettes differ from what is drawn ──
  const effective = useMemo(() => bakedScene && ({
    palette: paletteOverride ?? bakedScene.palette,
    wallPalettes: wallPalettesOverride ?? bakedScene.wallPalettes ?? {},
  }), [paletteOverride, wallPalettesOverride, bakedScene])
  // What these meshes currently show: a freshly built geometry shows the slab's own (baked) colours.
  const drawn = useRef({ meshes: null, key: null })
  useEffect(() => {
    if (!meshes || !effective || !data) return
    const key = JSON.stringify(effective)
    const baked = JSON.stringify({ palette: bakedScene.palette, wallPalettes: bakedScene.wallPalettes ?? {} })
    const shown = drawn.current.meshes === meshes ? drawn.current.key : baked
    if (key === shown) return
    if (data.manifest.version < 3) {
      // A v2 index cannot recolour, and its scene.json never recorded the wall palettes it was baked with — so the
      // first palettes it is drawn under ARE what it shows. Loud only when a live palette CHANGE reaches it.
      if (drawn.current.meshes !== meshes) { drawn.current = { meshes, key }; return }
      if (!_v2Warned.has(LOOK_ID)) { _v2Warned.add(LOOK_ID); console.error(`[SlabBuildings] ⛔ "${LOOK_ID}" is baked as buildings.json v2, which does not record which buildings are overridden — the palette shows only after a re-bake. Re-bake this town's buildings for a live palette.`) }
      return
    }
    recolour(meshes, data.manifest, effective)
    drawn.current = { meshes, key }
  }, [meshes, effective, data, bakedScene, LOOK_ID])

  // ── Selection / night uniform plumbing across all group shaders ────
  // Collected ONCE per material at compile (onBeforeCompile fires once, not
  // per render) — never reset here or the refs would be lost after compile.
  const shadersRef = useRef([])
  const getLightingPhase = useTimeOfDay((s) => s.getLightingPhase)
  const idToNum = useSlabBuildingIndex((s) => s.index?.idToNum)
  // The selection is <Town>'s (townContext.js); a ref for the per-frame uniform write.
  const givenSel = useTownContext().selectedId
  const townSel = useRef(givenSel)
  townSel.current = givenSel

  useFrame((state) => {
    if (shadersRef.current.length === 0) return
    const { sunAltitude } = getLightingPhase()
    const darkFactor = Math.min(1, Math.max(0, (0.2 - sunAltitude) / 0.35))
    const selectedId = townSel.current
    const { hoveredId } = useTownHover.getState()
    const selNum = (idToNum && selectedId != null) ? (idToNum.get(selectedId) ?? -1) : -1
    const hovNum = (idToNum && hoveredId != null) ? (idToNum.get(hoveredId) ?? -1) : -1
    // X-ray: feed the camera pos + the always-on dissolve dist/band (so the
    // shader gives a clear shot through any building the camera is inside).
    const cam = state.camera.position
    for (const sh of shadersRef.current) {
      if (!sh) continue
      sh.uniforms.uDarkFactor.value = darkFactor
      sh.uniforms.uSelectedId.value = selNum
      sh.uniforms.uHoveredId.value = hovNum
      if (sh.uniforms.uCamPos) {
        sh.uniforms.uCamPos.value.set(cam.x, cam.y, cam.z)
        sh.uniforms.uDissolveDist.value = _dissolveDist
        sh.uniforms.uDissolveBand.value = _dissolveBand
      }
    }
  })

  // Selection ring — mounted here (the live path mounts it per <Building>,
  // which is hidden in slab mode). Resolve the selected building's footprint
  // from the index. keyed by id so the pulse-in replays on each new select.
  const selectedId = givenSel
  const indexForRing = useSlabBuildingIndex((s) => s.index)
  const selectedEntry = (selectedId && indexForRing) ? indexForRing.byId.get(selectedId) : null

  if (!meshes) return null
  if (scene?.layerVis?.building === false) return null

  return (
    <group
      onPointerDown={(e) => { _pdx = e.clientX; _pdy = e.clientY }}
    >
      {drawGeometry && meshes.map(({ group, geometry, texId }) => (
        <GroupMesh
          key={`${group.kind}:${group.id}`}
          group={group}
          geometry={geometry}
          texId={texId}
          scene={scene}
          interactive={canInteract}
          registerShader={(sh) => shadersRef.current.push(sh)}
        />
      ))}
      {selectedEntry && <SlabSelectionRing key={selectedId} entry={selectedEntry} />}
    </group>
  )
}

// ── Selection ring (neon outline around the selected building) ──────────
// Mirrors LafayetteScene.SelectionRing: #ff6644 additive tube, 0.045 radius,
// footprint expanded 0.15m outward from its centroid, pulse-in then breathe.
// Built in world coords from the index footprint; ring Y = baseY − 0.15 (the
// live ring sits at foundationY+size[1]+0.15, which equals baseY−0.15 for flat
// roofs — the common case — and within a roof-peak for shaped roofs). Like the
// live ring, it does not terrain-lift (matches the live mount for A/B parity).
const _RING_COLOR = new THREE.Color('#ff6644')
function SlabSelectionRing({ entry }) {
  const ringRef = useRef()
  const phaseRef = useRef(0)

  const ringGeometry = useMemo(() => {
    const fp = entry.footprint
    if (!fp || fp.length < 3) return null
    const y = entry.baseY - 0.15
    let cx = 0, cz = 0
    for (const [x, z] of fp) { cx += x; cz += z }
    cx /= fp.length; cz /= fp.length
    const points = fp.map(([x, z]) => {
      const lx = x - cx, lz = z - cz
      const len = Math.sqrt(lx * lx + lz * lz) || 1
      return new THREE.Vector3(x + (lx / len) * 0.15, y, z + (lz / len) * 0.15)
    })
    points.push(points[0].clone())
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0)
    return new THREE.TubeGeometry(curve, points.length * 8, 0.045, 6, false)
  }, [entry])

  const ringMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: _RING_COLOR, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }), [])

  useFrame((_, delta) => {
    if (!ringRef.current) return
    const mat = ringRef.current.material
    const phase = phaseRef.current
    if (phase < 1) {
      phaseRef.current = Math.min(1, phase + delta * 2.5)
      const t = phaseRef.current
      const pulse = t < 0.5 ? t * 2 * 1.4 : 1.4 - (t - 0.5) * 2 * 0.4
      mat.opacity = Math.min(1, pulse * 0.85)
    } else {
      mat.opacity = 0.75 + Math.sin(Date.now() * 0.003) * 0.08
    }
  })

  if (!ringGeometry) return null
  return <mesh ref={ringRef} geometry={ringGeometry} material={ringMaterial} renderOrder={999} />
}

// overlay() blend (mirrors LafayetteScene) — kept as a glsl string fragment.
const GLSL_OVERLAY = `
vec3 slabOverlay(vec3 base, vec3 tex) {
  return mix(2.0 * base * tex, 1.0 - 2.0 * (1.0 - base) * (1.0 - tex), step(0.5, base));
}`

function GroupMesh({ group, geometry, texId, scene, registerShader, interactive = true }) {
  const textured = useQuality().buildingTextures
  const tex = useMemo(() => loadTexture(texId, textured), [texId, textured])
  const isRoof = group.kind === 'roof'
  const isWall = group.kind === 'wall'
  const isFoundation = group.kind === 'foundation'
  // A click reports to the app (<Town onSelectBuilding>); hover is the renderer's own.
  const townSelect = useTownContext().select
  const select = (id) => townSelect?.(id)
  const setHovered = useTownHover((s) => s.setHovered)
  const clearHovered = useTownHover((s) => s.clearHovered)

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
      // ⛔ BOTH SIDES INTO THE SHADOW MAP. Left null, three casts a FrontSide mesh from its
      // BACK faces only, and at a low sun a LIT STRIP ran along every building's shaded foot —
      // the "hovering" read. Measured 2026-09-26, huron + LS: gone with DoubleSide at every box
      // size tried. Cost: grain on sunlit walls (ARCHITECTURE §8 Cast shadows, decision 5).
      // Stage's materials match.
      shadowSide: THREE.DoubleSide,
    })

    mat.onBeforeCompile = (shader) => {
      // Weather first (it appends after <color_fragment>), matching the live
      // ordering. Foundation gets no weather (live Foundations has none).
      if (!isFoundation) applyWeatherToShader(shader)

      shader.uniforms.uExag = terrainExag
      if (isFoundation) shader.uniforms.uRiserFloor = terrainFloorRaw
      // ⭐⭐ SKY VISIBILITY — the buildings' missing occlusion term.
      // ⛔ The ground multiplies its ambient by a BAKED occlusion map (`aoMap`, hemisphere
      // occlusion out to 80 m, deepest hard against buildings). `SlabBuildings` carried NO
      // occlusion at all. In a cast shadow the sun contributes nothing, so everything you
      // see is ambient — ground reads `ambient × AO`, a wall reads `ambient` at full
      // strength. Same shadow, two different floors.
      // ⚠️ Operator, 2026-09-22: "the shadows on the buildings aren't as dark as the ones on
      // the ground… my issue is that the shadows on the building need to be darker."
      // ⛔ No light slider can close it — ambient/fill/hemi all light wall and ground alike,
      // and huron runs all three at once (0.92 / 1.0 / 0.95), which is why they feel alike.
      // ⭐ THE BUILDINGS ARE THE ONES THAT ARE WRONG. A vertical wall sees about HALF the
      // sky; rendering it with unoccluded ambient over-lights it. So attenuate INDIRECT
      // light only (never direct — the sun is untouched) by the surface's own sky
      // visibility, derived from the world normal: roof 1.0, wall 0.5, underside 0.
      // ⛔ DERIVED, NOT A CONSTANT — the hemisphere integral of the surface's own
      // orientation, so it ports to town #2 with nothing to tune. `uSkyVis` is the STRENGTH
      // (0 = prior behaviour, 1 = full geometric term); live via `window.__wallAO` for the
      // eye-gate, then it wants to be an authored channel beside `ao`.
      shader.uniforms.uSkyVis = _wallAO
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSkyNrm;')
        .replace('#include <beginnormal_vertex>',
                 '#include <beginnormal_vertex>\n vSkyNrm = normalize(mat3(modelMatrix) * objectNormal);')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uSkyVis;\nvarying vec3 vSkyNrm;')
        .replace('#include <aomap_fragment>',
                 '#include <aomap_fragment>\n'
               + '{ float skyVis = clamp(0.5 + 0.5 * normalize(vSkyNrm).y, 0.0, 1.0);\n'
               + '  float occ = mix(1.0, skyVis, clamp(uSkyVis, 0.0, 1.0));\n'
               + '  reflectedLight.indirectDiffuse *= occ;\n'
               + '  reflectedLight.indirectSpecular *= occ; }')
      shader.uniforms.uDarkFactor = { value: 0 }
      if (isRoof) Object.assign(shader.uniforms, litUniforms)
      shader.uniforms.uSelectedId = { value: -1 }
      shader.uniforms.uHoveredId = { value: -1 }
      shader.uniforms.uCamPos = { value: new THREE.Vector3() }
      shader.uniforms.uDissolveDist = { value: _dissolveDist }   // x-ray, always on
      shader.uniforms.uDissolveBand = { value: _dissolveBand }
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
         attribute float aCovered;
         varying float vCovered;
         ${isWall ? 'attribute vec3 aNightColor;\n varying vec3 vNightCol;' : ''}
         uniform float uExag;
         ${isFoundation ? 'uniform float uRiserFloor;' : ''}
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
         vCovered = aCovered;
         ${isWall ? 'vNightCol = aNightColor;' : ''}
         ${isFoundation ? RISER_LIFT_GLSL : 'transformed.y += aCentroidY * uExag;'}`
      )

      // ── Fragment: declarations ──
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         uniform float uDarkFactor;
         ${isRoof ? 'uniform sampler2D uLitTex;\n uniform vec2 uLitTexSize;\n uniform float uLitOn;\n uniform vec3 uLitColor;\n uniform float uLitStrength;' : ''}
         uniform float uSelectedId;
         uniform float uHoveredId;
         varying float vCovered;
         ${isFoundation ? 'uniform vec3 uFoundNight;' : ''}
         ${isWall ? 'varying vec3 vNightCol;' : ''}
         ${tex ? 'uniform sampler2D uTex;\n uniform float uTexStrength;\n uniform float uTexScale;' : ''}
         uniform vec3 uCamPos;
         uniform float uDissolveDist;
         uniform float uDissolveBand;
         varying vec3 vBPos;
         varying vec3 vBNorm;
         varying float vBId;
         ${GLSL_OVERLAY}`
      )

      // ── Fragment: camera x-ray (always on). Fragments within uDissolveDist
      //    of the camera fully discard; a dither band above it softens the edge.
      //    Camera DISTANCE (not height) is the gate, so roofs passing far below
      //    when flying over stay solid — only the walls the camera is
      //    interpenetrating dissolve, giving a clear shot through. (The
      //    uDissolveDist>0 check is just a safety guard; it's wired on.) ──
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
         // An acquired city LOD2 solid is drawing THIS building — drop the
         // extrusion so the two don't z-fight. Only these; the buildings the
         // city model has no solid for keep rendering from the slab.
         if (vCovered > 0.5) discard;
         if (uDissolveDist > 0.0) {
           float camDist = distance(vBPos, uCamPos);
           float keep = smoothstep(uDissolveDist, uDissolveDist + uDissolveBand, camDist);
           if (keep < 1.0) {
             float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
             if (keep < ign) discard;
           }
         }`
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
                ${sample}
                // The lit set and the selection, on the roof (see litUniforms): a mix toward the tint.
                float litT = 0.0;
                if (uLitOn > 0.5) {
                  vec2 luv = vec2((mod(vBId, uLitTexSize.x) + 0.5) / uLitTexSize.x, (floor(vBId / uLitTexSize.x) + 0.5) / uLitTexSize.y);
                  litT = texture2D(uLitTex, luv).r;
                }
                float selRoof = step(abs(vBId - uSelectedId), 0.5);
                float litMix = clamp(max(litT * uLitStrength, selRoof * min(1.0, uLitStrength * 1.8)), 0.0, 1.0);
                diffuseColor.rgb = mix(diffuseColor.rgb, uLitColor, litMix);`
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
         totalEmissiveRadiance += vec3(selT * 0.2 + (1.0 - selT) * hovT * 0.133);
         ${isRoof ? `// At night an albedo tint has no light to show it: the lit roof glows by the same mix, as the dark comes.
         totalEmissiveRadiance += uLitColor * litMix * uDarkFactor * 0.6;` : ''}`
      )

      // ── Fragment: STREET LAMPS ON THE WALLS (Jacob, 2026-09-26). Every lamp within the pool's
      //    reach (lampPool.js), measured in 3D from its head, × how squarely the wall faces it,
      //    × the wall's own colour × the lamp colour × the lamp output (Brightness × dusk ramp ×
      //    the Light pools share — exactly 0 by day, so the uniform branch skips it all). Walls
      //    only; the depth material is untouched. Heights are ground-relative on both sides
      //    (vBPos is un-lifted; the head is uLampHeadY above its ground) — over one reach the
      //    two grounds are taken as level.
      if (isWall) {
        shader.uniforms.uLampOut   = _lampGlow.poolUniform
        shader.uniforms.uLampColor = _lampGlow.colorUniform
        shader.uniforms.uCanopyWipe = _lampGlow.canopyWipeUniform
        Object.assign(shader.uniforms, _lampGrid)
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          `#include <common>
           uniform float uLampOut;
           uniform vec3  uLampColor;
           uniform sampler2D uLampGrid;
           uniform vec2  uLampGridMin;
           uniform vec3  uLampGridDims;
           uniform float uLampGridCell;
           uniform float uLampHeadY;
           uniform float uLampReach;
           uniform float uCanopyWipe;
           ${LAMP_FALLOFF_GLSL}
           ${LAMP_WIPE_GLSL}
           float wallLampLight(vec3 p, vec3 n) {
             int K = int(uLampGridDims.z);
             if (uLampOut <= 0.0 || K == 0 || uLampReach <= 0.0) return 0.0;
             int cols = int(uLampGridDims.x), rows = int(uLampGridDims.y);
             ivec2 c = ivec2(floor((p.xz - uLampGridMin) / uLampGridCell));
             float acc = 0.0;
             for (int dz = -1; dz <= 1; dz++) for (int dx = -1; dx <= 1; dx++) {
               ivec2 cc = c + ivec2(dx, dz);
               if (cc.x < 0 || cc.y < 0 || cc.x >= cols || cc.y >= rows) continue;
               for (int s = 0; s < K; s++) {
                 vec4 L = texelFetch(uLampGrid, ivec2(cc.x * K + s, cc.y), 0);
                 if (L.w < 0.5) break;
                 vec3 d = vec3(L.x, uLampHeadY, L.y) - p;
                 float dist = length(d);
                 float rn = dist / uLampReach;
                 if (rn >= 1.0 || dist < 1e-3) continue;
                 acc += lampFalloff(rn) * max(0.0, dot(n, d / dist));
               }
             }
             return acc;
           }`)
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           totalEmissiveRadiance += diffuseColor.rgb * uLampColor * uLampOut * lampWipe(wallLampLight(vBPos, normalize(vBNorm)), uCanopyWipe);`)
      }

      registerShader(shader)
    }
    attachCSM(mat)   // cascades, when `?csm=1` — composes, never replaces onBeforeCompile
    mat.customProgramCacheKey = () => `slab-bldg-${group.kind}-${group.id}-${tex ? 'tex' : 'flat'}-skyvis1-riser1-lamps1`
    return mat
  }, [tex, isRoof, isWall, isFoundation, texStrength, texScale, group.kind, group.id])

  // ── customDepthMaterial — THE SHADOW PASS MUST REPEAT THE VERTEX LIFT ──────
  // ⛔⛔ A building's height off the ground is the ATTRIBUTE `aCentroidY` (the
  // foundation riser), added to `transformed.y` in the render material above.
  // The shadow pass does NOT use that material: three substitutes its own
  // MeshDepthMaterial, which knows nothing about aCentroidY or uExag. Without
  // this, every building is rendered into the shadow map DROPPED BACK ONTO THE
  // BASELINE — measured on huron 2026-09-20: aCentroidY spans 1.41–13.40 m, so
  // at uExag 1.5 the shadow copies sat 2.11–20.10 m BELOW the drawn buildings,
  // which are only ~22 m tall. An occluder buried in the terrain cannot shadow
  // the ground above it, so every receiver read "lit" and the town had no cast
  // shadows at all. The map LOOKED populated — it was populated with buildings
  // in the wrong place (depth histogram: blobs at 0.0 and 0.5, nothing at the
  // ground's 0.25).
  //
  // ⭐ Two things must match the render material, and one must NOT:
  //   ✓ the aCentroidY × uExag lift — or the shadow is in the wrong place
  //   ✓ the `vCovered` discard — geometry hidden behind the CityModel LOD2 is
  //     discarded when drawn, so it must be discarded here too or it casts a
  //     PHANTOM shadow the operator can see but whose caster is invisible
  //   ✗ the camera x-ray dissolve (uDissolveDist) is a VIEWING aid keyed to the
  //     camera, not the sun. Walls dissolving so you can see in must keep
  //     throwing their shadow, or the lighting changes as you fly.
  const depthMaterial = useMemo(() => {
    const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
    dm.onBeforeCompile = (shader) => {
      shader.uniforms.uExag = terrainExag
      if (isFoundation) shader.uniforms.uRiserFloor = terrainFloorRaw
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
         attribute float aCentroidY;
         attribute float aCovered;
         uniform float uExag;
         ${isFoundation ? 'uniform float uRiserFloor;' : ''}
         varying float vCoveredD;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
         vCoveredD = aCovered;
         ${isFoundation ? RISER_LIFT_GLSL : 'transformed.y += aCentroidY * uExag;'}`)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
         varying float vCoveredD;`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
         if (vCoveredD > 0.5) discard;`)
    }
    // Distinct key so this program never collapses onto the plain depth program.
    dm.customProgramCacheKey = () => `slab-bldg-depth-centroidlift-v2-${isFoundation ? 'riser' : 'rigid'}`
    return dm
  }, [isFoundation])

  // Resolve a raycast hit to a building id via the aBuildingId attribute.
  // A DISCARDED fragment still raycasts, so an extrusion hidden behind a city
  // LOD2 solid would otherwise intercept clicks aimed at that solid. Both would
  // resolve to the same building, but let the geometry that is actually VISIBLE
  // own the interaction — otherwise hover/cursor fires off an invisible surface.
  const idAtFace = (e) => {
    if (!e.face) return null
    const covered = geometry.attributes.aCovered?.getX(e.face.a)
    if (covered > 0.5) return null
    const num = geometry.attributes.aBuildingId.getX(e.face.a)
    if (num < 0) return null
    return useSlabBuildingIndex.getState().index?.byNum[num]?.id ?? null
  }

  return (
    <mesh
      geometry={geometry}
      material={material}
      customDepthMaterial={depthMaterial}
      renderOrder={group.renderOrder}
      castShadow
      receiveShadow
      frustumCulled={false}
      onPointerMove={interactive ? (e) => { e.stopPropagation(); const id = idAtFace(e); if (id) { setHovered(id); document.body.style.cursor = 'pointer' } } : undefined}
      onPointerOut={interactive ? () => { clearHovered(); document.body.style.cursor = 'auto' } : undefined}
      onClick={interactive ? (e) => { e.stopPropagation(); if (isDrag(e)) return; const id = idAtFace(e); if (id) select(id) } : undefined}
    />
  )
}
