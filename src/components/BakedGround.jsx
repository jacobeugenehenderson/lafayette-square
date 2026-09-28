import { attachCSM } from './CascadedShadows.jsx'
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
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useLoader, useFrame } from '@react-three/fiber'
import { BAND_TO_LAYER } from '../cartograph/m3Colors'
import { makeGroundSurfaceMaterial, CROP_UNIFORMS } from './grassMaterial'
import useCalendar from '../hooks/useCalendar'
import { resolveClassTable, SURFACES } from '../../cartograph/surfaces.mjs'
import WaterSurface from './WaterSurface.jsx'
import { horizonFor } from './HorizonDisc.jsx'
import { isWaterGroupId } from './waterMaterial.js'
import { makeGravelPathMaterial } from './gravelPathMaterial'
import { groundMaterialFor } from '../lib/groundMaterials.js'
import { makeFadeGroundMaterial } from './fadeGroundMaterial.js'
import { setGroundRules, setGroundRuleMap } from '../lib/groundRules.js'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useSkyState from '../hooks/useSkyState'
import { terrainExag, patchTerrain, sceneExag, terrainWater } from '../utils/terrainShader'
import { waterLevels } from '../../cartograph/waterLevel.mjs'
import { setGroundColorMap, setGroundFxMap } from './groundColorState'
import { setSceneStencil } from './sceneStencilState'
import { useSceneJson } from '../lib/useSceneJson.js'
import { ASSET_BASE } from '../lib/bakedUrl.js'
import { lookOf } from '../lib/lookOf.js'

// ── Surface treatment: albedo desaturation + value-range lift ────────────────
// Jacob 2026-06-30 (Option A): surfaces should be DESATURATED and lit by
// saturated SKY color, not carry their own chroma. The authored layer palette
// runs value ~40–178 with saturated lots — so dark layers (ground 40, asphalt
// 74) crush to black under dim TOD light while sidewalk (178) blows white. We
// pull chroma toward gray and compress lightness UP off black, so every layer
// reads by a gentle value step and the sky-colored fill does the coloring.
//
// ⚠️ PROTOTYPE CONSTANTS — direction-finding only. These three are slated to
// become the "Surface" look knob (saturation · value floor · value ceil) once
// the look reads; they are NOT meant to ship buried (feedback-no-hardcoded-ramps).
const SURFACE_SAT   = 0.30   // fraction of original chroma kept (0 = full gray)
const SURFACE_FLOOR = 0.22   // darkest surface lifts to this lightness (off black)
const SURFACE_CEIL  = 0.72   // brightest surface compresses down to this
const _treatC = new THREE.Color()
const _treatHSL = {}
// ⭐ The pool map's R is the NEAREST-LAMP DISTANCE ÷ reach (encoding 'lamp-distance', bake-ground-ao). A map baked
// before that holds a summed pool instead, and read as a distance it would light the ground AWAY from every lamp —
// so it passes scale 0 (no pool) and says so, loud and dark rather than wrong. ▶ claims-light-sources-are-live ⑪
let _warnedOldPool = false
function poolScaleOf(meta) {
  if (!meta) return 0
  if (meta.encoding === 'lamp-distance' && meta.scale > 0) return meta.scale
  if (!_warnedOldPool) { _warnedOldPool = true; console.error(`[BakedGround] ⛔ ground.poolmap is an old summed map (encoding ${meta.encoding ?? 'none'}) — no lamp pools until this look's ground AO is re-baked (node cartograph/bake-ground-ao.js).`) }
  return 0
}

function treatAlbedo(hex) {
  _treatC.set(hex)
  _treatC.getHSL(_treatHSL, THREE.SRGBColorSpace)
  _treatC.setHSL(
    _treatHSL.h,
    _treatHSL.s * SURFACE_SAT,
    SURFACE_FLOOR + _treatHSL.l * (SURFACE_CEIL - SURFACE_FLOOR),
    THREE.SRGBColorSpace,
  )
  return _treatC.getHex()
}

// ⭐ WHICH GENERATOR PAINTS A GROUP is one table, `cartograph/surfaces.mjs` — it
// replaced GRASS_FACES / GRASS_MATERIALS here (2026-09-24), a three-entry Set holding
// exactly the three faces Lafayette Square has. The operator's sparse remap rides
// `scene.surfaces.classes`. ▶ Proven identical to the old grass selection on every
// group of every baked town before the swap; LS's park grass is the control.

// ⛔ A PARAMETER A SURFACE NEEDS AND DOES NOT HAVE IS SAID, never filled in. Once per
// look per surface, naming each absent input and what would supply it.
const _saidAbsent = new Set()
// `resolved` = context.json `resolved.<surface>` ({ values, absent }); `undefined` = no context.json
// at all, which is itself named. The bake's own reasons are reported, minus what the operator authored.
function reportAbsentParams(look, surface, authored, resolved) {
  const key = look + '|' + surface
  if (_saidAbsent.has(key)) return
  _saidAbsent.add(key)
  const declared = Object.entries(SURFACES[surface]?.params || {}).filter(([, p]) => p.source !== 'authored')
  const why = resolved === undefined ? 'no context.json for this look: bake the context'
    : resolved === null ? 'the context bake does not resolve this surface' : null
  const missing = why
    ? declared.filter(([name]) => authored?.[name] == null).map(([name, p]) => `${name} (${p.unit}, ${p.source} — ${why})`)
    : [...(resolved.absent || []).filter(s => authored?.[s.split(' ')[0]] == null),
       // A param declared after this context.json was resolved is in neither list: say so, not nothing.
       ...declared.filter(([name]) => authored?.[name] == null && !(name in (resolved.values || {}))
         && !(resolved.absent || []).some(s => s.split(' ')[0] === name))
         .map(([name, p]) => `${name} (${p.unit}, ${p.source} — not in this context.json: re-bake the context)`)]
  if (missing.length) console.error(`[BakedGround] ⛔ "${look}": surface "${surface}" is drawn WITHOUT ${missing.join('; ')}. `
    + `Those features are ABSENT, not defaulted — ▶ cartograph/surfaces.mjs`)
}

// ⭐ The baked distance to the water (context.json#channels.coastDist, SLAB-CONTRACT §3.3) as a texture
// the sand's duneGrass rule reads. Quantised to 8 bits over a range the rule can use (6 × the town's
// own beach band, capped at the channel's max). ⛔ No channel, or no derived band → null, SAID once.
async function loadCoastDist(look, context, cacheBust) {
  const ch = context?.channels?.coastDist
  const band = context?.derived?.sand?.beachBandM?.value
  if (!ch?.bin || !Number.isFinite(band)) {
    // Said by the sand surface that needs it (SurfaceMesh), not here — a town with no sand is not missing it.
    return { absent: !context ? 'no context.json' : !ch?.bin ? (ch?.why || 'no coastDist channel') : 'no derived sand.beachBandM' }
  }
  const buf = await fetch(ASSET_BASE + 'baked/' + look + '/' + ch.bin + '?t=' + cacheBust).then(r => r.arrayBuffer())
  const u16 = new Uint16Array(buf)
  if (u16.length !== ch.width * ch.height) { console.error(`[BakedGround] ⛔ "${look}": coastDist is ${u16.length} values, the manifest says ${ch.width}×${ch.height} — not used.`); return null }
  const rangeM = Math.min(ch.maxM, band * 6)
  const u8 = new Uint8Array(u16.length)
  for (let k = 0; k < u16.length; k++) u8[k] = Math.min(255, Math.round((u16[k] * ch.mPerUnit) / rangeM * 255))
  const map = new THREE.DataTexture(u8, ch.width, ch.height, THREE.RedFormat, THREE.UnsignedByteType)
  map.minFilter = map.magFilter = THREE.LinearFilter
  map.needsUpdate = true
  const b = ch.bounds
  return { map, min: [b.minX, b.minZ], span: [b.maxX - b.minX, b.maxZ - b.minZ], rangeM }
}

function reportNoEdge(look, id) {
  const key = look + '|edge|' + id
  if (_saidAbsent.has(key)) return
  _saidAbsent.add(key)
  console.error(`[BakedGround] ⛔ "${look}": face:${id} was baked without field-edge distances — its fields are drawn `
    + `with NO headland and no tracks round them. ▶ re-bake the ground.`)
}

function reportNoFields(look, id, surface) {
  const key = look + '|fields|' + id
  if (_saidAbsent.has(key)) return
  _saidAbsent.add(key)
  console.error(`[BakedGround] ⛔ "${look}": face:${id} renders with "${surface}", which runs its rows per FIELD, `
    + `but this ground was baked without field ids. Drawn in the class's flat colour — ▶ re-bake the ground.`)
}
// Which material draws a group (water · gravel · a procedural surface · flat colour) is one rule in
// src/lib/groundMaterials.js — the lamp check walks the same dispatch.

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

// A slab whose manifest still carries `streetFade` was baked under the INWARD,
// two-schedule model and must be read by that model's rules. ⛔ Detected by the
// field, not by a version number, because the field IS the schema.
const isLegacyStencil = (stencil) => !!stencil?.streetFade

// The radial-fade band for a group. ⭐ THERE IS ONE BAND, for every kind — on a slab
// baked since 2026-09-20.
//
// ⛔⛔ AND A LEGACY SLAB IS NOT READ BY THE NEW RULES. The line here used to be
// `group.kind === 'face' ? stencil.fade : stencil.streetFade` — faces on the inner
// band, ribbons on a WIDER one that trailed PAST the rim. Both models run inward,
// so the difference is not direction: it is that a v1 slab's ribbons keep drawing
// past the radius and a v2 slab's do not. Reading a v1 manifest under the one-band
// rule makes every population die at the rim in lockstep, which is a visibly harder
// edge than that slab was baked to have. ⭐ A v1 artifact gets v1 rules. That is
// schema compatibility, not a fallback: the alternative is silently rendering an
// artifact under a model it was not written for.
function fadeForGroup(group, stencil) {
  if (!stencil) return null
  const band = isLegacyStencil(stencil)
    ? (group.kind === 'face' ? stencil.fade : stencil.streetFade)   // v1: two bands, inward
    : stencil.fade                                                   // v2: ONE band
  if (!band) return null
  return { center: stencil.center, inner: band.inner, outer: band.outer }
}

function GroundMeshes({ manifest, bin, context, coast, scene: bakedScene, bakeLastMs, surfacesOverride }) {
  // ⭐ `surfacesOverride` is the live-authoring layer, the same pattern PostProcessing's
  // *Override props follow: it sits over the baked `scene.surfaces`, never beside it.
  const scene = useMemo(() => (surfacesOverride
    ? { ...bakedScene, surfaces: { classes: { ...bakedScene?.surfaces?.classes, ...surfacesOverride.classes }, params: { ...bakedScene?.surfaces?.params, ...surfacesOverride.params }, rules: { ...bakedScene?.surfaces?.rules, ...surfacesOverride.rules } } }
    : bakedScene), [bakedScene, surfacesOverride])
  // The ground rules (surfaces.mjs GROUND_RULES) are shared uniforms every ground material binds.
  // ⛔ A distance rule switched ON over a ground baked without ground.rulemap.png draws nothing — SAID,
  // never a quiet no-op (the rulemap is written by bake-ground-ao).
  useEffect(() => {
    const r = setGroundRules(scene?.surfaces?.rules)
    const on = ['buildingFoot', 'buildingGreen', 'pavedEdge'].filter(k => r[k].strength > 0)
    if (on.length && !manifest.rulemap) console.error(`[BakedGround] ⛔ "${manifest.look}": ground rule(s) ${on.join(', ')} are ON but this ground has no ground.rulemap.png — they draw NOTHING. ▶ re-run bake-ground-ao for this look.`)
  }, [scene?.surfaces?.rules, manifest.rulemap, manifest.look])
  const layerVis = scene?.layerVis
  const surfaceTable = useMemo(() => resolveClassTable(scene?.surfaces?.classes), [scene?.surfaces?.classes])
  const stencil = manifest.stencil || null
  // Publish the disc so size-dependent consumers stop hardcoding one town's
  // radius. The sun's shadow frustum is the one that mattered: it shipped ±900,
  // i.e. Lafayette Square's 892 m radius, and clipped every larger town.
  useEffect(() => { setSceneStencil(stencil) }, [stencil])
  // ⛔ LOUD, not silent. A stale slab renders its OWN model correctly (above) but it
  // does NOT show the scene's authored fade, so the operator is looking at a picture
  // that cannot reflect the current record. Silence here is the defect — the whole
  // point of the fade arc is that a plausible-looking success is the worst outcome.
  useEffect(() => {
    if (!isLegacyStencil(stencil)) return
    console.error(
      `[BakedGround] ⛔ STALE SLAB for '${scene?.id ?? scene?.name ?? 'scene'}': this bake predates the ` +
      `2026-09-20 fade ruling (its manifest still carries streetFade ` +
      `${stencil.streetFade.inner}/${stencil.streetFade.outer} and an INWARD fade ` +
      `${stencil.fade.inner}/${stencil.fade.outer}). It is being rendered under the OLD two-band ` +
      `model so it looks the way it was baked — it is NOT showing the scene's current fadeBand. ` +
      `▶ re-bake this look to pick up the current fade. ▶ node checks/claims-no-slab-outlives-its-schema.mjs`)
  }, [stencil, scene])
  // Cache-bust the lightmap URL with the same `?t=` token used for ground.json /
  // ground.bin. useLoader caches THREE.TextureLoader results by URL across
  // mounts, so without this query param a re-bake leaves the OLD AO texture
  // painted on the new geometry — the operator sees stale shadows that look
  // like the edit "didn't take" even though ground.bin is fresh.
  // ⛔⛔ THE AO MUST PROVE IT BELONGS TO THIS GROUND. A ground re-bake that does not
  // re-run bake-ground-ao leaves an AO baked against DIFFERENT geometry — contact
  // shadows under buildings that have moved, ambient darkening on the wrong faces.
  // The manifest reference alone cannot show this: the file resolves, the texture
  // loads, and the map looks plausible. `groundKey` is FNV-1a over the geometry the
  // AO was baked against (bake-ground.js), stamped into the lightmap block by the
  // AO pass, and compared here.
  // ⛔ AN MTIME CANNOT DO THIS JOB, which is why it was never caught: the AO pass
  // deliberately writes the manifest BEFORE the PNG so ground.json is the newer
  // file, so "ground.json newer than the PNG" means BOTH "AO is current" AND "a
  // ground re-bake just invalidated the AO". The gate reads green in the broken
  // state. (Measured 2026-09-20: LS and huron both had an AO PNG on disk and no
  // manifest pointing at it — every town silently rendering with none.)
  // ⛔ Absent key ⇒ a PNG baked before this; USE IT rather than throwing away good
  // AO, but SAY SO. Silence is what let the last one stand.
  const lmKey = manifest.lightmap?.groundKey
  const lmOk = !manifest.lightmap || !manifest.groundKey || lmKey == null || lmKey === manifest.groundKey
  useEffect(() => {
    if (!manifest.lightmap) return
    if (!lmOk) {
      console.error(`[BakedGround] ⛔ ground.lightmap.png was baked against DIFFERENT ground `
        + `(groundKey ${lmKey} ≠ ${manifest.groundKey} for this ground.json) on "${manifest.look}". `
        + `Its contact shadows belong to geometry that has since changed. AO DISCARDED — the ground `
        + `renders unoccluded. ▶ node cartograph/bake-ground-ao.js --scene=${manifest.look} --look=${manifest.look}`)
    } else if (manifest.groundKey && lmKey == null) {
      console.warn(`[BakedGround] ground.lightmap.png has no groundKey (baked before 2026-09-20) on `
        + `"${manifest.look}" — cannot prove it matches this ground. Using it; re-bake to get the key.`)
    }
  }, [lmOk, lmKey, manifest.groundKey, manifest.look, manifest.lightmap])

  const lightmapUrl = (manifest.lightmap && lmOk)
    ? ASSET_BASE + 'baked/' + manifest.look + '/' + manifest.lightmap.image + (bakeLastMs ? '?t=' + bakeLastMs : '')
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
    ? ASSET_BASE + 'baked/' + manifest.look + '/' + poolMeta.image + (bakeLastMs ? '?t=' + bakeLastMs : '')
    : null
  const poolmap = poolmapUrl ? useLoader(THREE.TextureLoader, poolmapUrl) : null
  useEffect(() => {
    if (poolmap) {
      poolmap.colorSpace = THREE.NoColorSpace
      poolmap.flipY = false
      // ⭐ NO MIPMAPS — measured, not assumed. This map is sized to ~1.6 m/texel
      // (bake-ground-ao derives it from the town span), and at hero/browse
      // distances a screen pixel covers ~0.22 m of ground: the texture is
      // MAGNIFIED, so the mip chain is never sampled and is pure memory. On huron
      // it went 4096² = 64 MB → 85 MB with mips, and the FX map alone was 60% of
      // the ground bundle.
      // ⚠️ THE ONE CASE IT COSTS: framing the ENTIRE town at once puts a pixel at
      // ~2.4 m against a 1.64 m texel — mild minification, where mips would have
      // helped. LinearFilter keeps that a soft blur rather than sparkle. If a
      // whole-town shot ever shimmers on the ground, this is the line.
      poolmap.generateMipmaps = false
      poolmap.minFilter = THREE.LinearFilter
      poolmap.magFilter = THREE.LinearFilter
      poolmap.needsUpdate = true
      // Share the FX map (G shadow / R pool) so the tree trunk blend can take
      // the combined effective ground colour, matching grassMaterial.
      setGroundFxMap(poolmap, poolMeta?.min, poolMeta?.span, poolScaleOf(poolMeta))
    }
    return () => setGroundFxMap(null)
  }, [poolmap])

  // The ground rules' baked distances (ground.rulemap.png, bake-ground-ao): R = to a building, G = to paving.
  const ruleMeta = manifest.rulemap || null
  const rulemapUrl = ruleMeta ? ASSET_BASE + 'baked/' + manifest.look + '/' + ruleMeta.image + (bakeLastMs ? '?t=' + bakeLastMs : '') : null
  const rulemap = rulemapUrl ? useLoader(THREE.TextureLoader, rulemapUrl) : null
  useEffect(() => {
    if (rulemap) {
      rulemap.colorSpace = THREE.NoColorSpace
      rulemap.flipY = false
      rulemap.generateMipmaps = false
      rulemap.minFilter = rulemap.magFilter = THREE.LinearFilter
      rulemap.needsUpdate = true
    }
    setGroundRuleMap(rulemap, ruleMeta)
    return () => setGroundRuleMap(null)
  }, [rulemap])

  // Ground-color map — per-Look albedo raster. Published into the shared
  // groundColor uniforms (groundColorState) so the tree trunk shader blends
  // each trunk base toward the ground beneath it. Color texture → sRGB so the
  // sample decodes to linear and mixes correctly with the (linear) trunk diffuse.
  const colorMeta = manifest.colormap || null
  const colormapUrl = colorMeta
    ? ASSET_BASE + 'baked/' + manifest.look + '/' + colorMeta.image + (bakeLastMs ? '?t=' + bakeLastMs : '')
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

      // ⭐ THE WATER GOES TO THE HORIZON (Jacob, 2026-09-27). Where the town's rim is water, the water body's own mesh
      // runs on out past it to the horizon's reach (HorizonDisc horizonFor), so the same surface — glitter, sky, depth —
      // carries on and thins into the haze, with no line where the drawn water stops. The body's extent is kept for its
      // wave scale. Directions whose rim is land are left to the horizon disc.
      let posUse = positions, idxUse = indices, bodyExtent = null
      if (g.kind !== 'face' && isWaterGroupId(g.id) && manifest.stencil?.radius > 0) {
        const ext = extendWaterToHorizon(positions, indices, manifest.stencil)
        if (ext) { posUse = ext.positions; idxUse = ext.indices; bodyExtent = ext.bodyExtent }
      }
      const geom = new THREE.BufferGeometry()
      geom.setAttribute('position', new THREE.BufferAttribute(posUse, 3))
      // Planar UV (and identical UV2): u = (x - minX)/W, v = (z - minZ)/H. Matches the AO baker's texel→world mapping exactly.
      const nV = posUse.length / 3, uv = new Float32Array(nV * 2)
      for (let i = 0; i < nV; i++) {
        uv[i * 2]     = (posUse[i * 3]     - bbox.min[0]) / W
        uv[i * 2 + 1] = (posUse[i * 3 + 2] - bbox.min[2]) / H
      }
      geom.setAttribute('uv',  new THREE.BufferAttribute(uv, 2))
      geom.setAttribute('uv2', new THREE.BufferAttribute(uv, 2))  // aoMap slot
      geom.setIndex(new THREE.BufferAttribute(idxUse, 1))
      // ⭐ WHERE THE WATER STANDS (cartograph/waterLevel.mjs): each vertex carries the town's low and high level there;
      // the shader stands the sheet between them at the tide's phase. The mesh itself stays where it was baked.
      if (g.kind !== 'face' && isWaterGroupId(g.id)) {
        const L = waterLevelsOrSay(), lo = new Float32Array(nV), hi = new Float32Array(nV)
        if (L) for (let i = 0; i < nV; i++) { lo[i] = L.lowAt(posUse[i * 3], posUse[i * 3 + 2]); hi[i] = L.highAt(posUse[i * 3], posUse[i * 3 + 2]) }
        geom.setAttribute('aLevelLow', new THREE.BufferAttribute(lo, 1))
        geom.setAttribute('aLevelHigh', new THREE.BufferAttribute(hi, 1))
      }
      // ⭐ A `perField` group (the crop) carries a field index per vertex (third bin section) and
      // each field's axis in the manifest: expanded here into the two attributes its shader reads.
      // `aFieldAxis` = (cos, sin of the row bearing, field centre x, z) · `aFieldExt` = (half-length
      // along the rows, half-width, and two per-field draws in [0,1) that place its planting and
      // harvest day inside the town's window — hashed from the field index, so stable per bake).
      if (g.fieldByteOffset != null) {
        const fid = new Float32Array(bin, g.fieldByteOffset, g.vertexCount)
        const draw = (i, k) => { const x = Math.sin((i + 1) * (12.9898 + k * 78.233)) * 43758.5453; return x - Math.floor(x) }
        const axis = new Float32Array(g.vertexCount * 4), ext = new Float32Array(g.vertexCount * 4)
        for (let i = 0; i < g.vertexCount; i++) {
          const f = g.fields[fid[i]]
          axis.set([Math.cos(f.bearing), Math.sin(f.bearing), f.cx, f.cz], i * 4)
          ext.set([f.halfLen, f.halfWid, draw(fid[i], 0), draw(fid[i], 1)], i * 4)
        }
        geom.setAttribute('aFieldAxis', new THREE.BufferAttribute(axis, 4))
        geom.setAttribute('aFieldExt', new THREE.BufferAttribute(ext, 4))
        // Metres to the field's own edge (the headland + its tracks). A ground baked before it existed
        // has none: the crop is then drawn with NO headland, and says so (reportNoEdge).
        if (g.fieldEdgeByteOffset != null) geom.setAttribute('aFieldEdge', new THREE.BufferAttribute(new Float32Array(bin, g.fieldEdgeByteOffset, g.vertexCount), 1))
      }
      geom.computeVertexNormals()
      return { group: g, geometry: geom, bodyExtent }
    })
  }, [manifest, bin])

  // ⭐ THE WATER AT HIGH FLOODS UP THE BEACH (bake-terrain `water.flood`): the ground below the high level connected to
  // the drawn water, drawn as more of the same sheet beside the body that reaches the rim. Its polygons exclude the drawn
  // water, so the two never overlap; below HIGH the ground simply hides it.
  const flood = useMemo(() => {
    const body = meshes.find(m => m.bodyExtent && isWaterGroupId(m.group.id))
    const polys = terrainWater()?.flood?.polygons
    if (!body || !polys?.length) return null
    const Y = body.geometry.attributes.position.array[1], L = waterLevelsOrSay()
    const pos = [], idx = []
    for (const p of polys) {
      const v0 = pos.length / 3, all = [p.outer, ...p.holes]
      const tris = THREE.ShapeUtils.triangulateShape(p.outer.map(q => new THREE.Vector2(q[0], q[1])), p.holes.map(h => h.map(q => new THREE.Vector2(q[0], q[1]))))
      for (const r of all) for (const q of r) pos.push(q[0], Y, q[1])
      for (const t of tris) idx.push(v0 + t[0], v0 + t[1], v0 + t[2])
    }
    const g = new THREE.BufferGeometry(), n = pos.length / 3, lo = new Float32Array(n), hi = new Float32Array(n)
    if (L) for (let i = 0; i < n; i++) { lo[i] = L.lowAt(pos[i * 3], pos[i * 3 + 2]); hi[i] = L.highAt(pos[i * 3], pos[i * 3 + 2]) }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
    g.setAttribute('aLevelLow', new THREE.BufferAttribute(lo, 1))
    g.setAttribute('aLevelHigh', new THREE.BufferAttribute(hi, 1))
    g.setIndex(idx)
    g.computeVertexNormals()
    return { geometry: g, body }
  }, [meshes])
  useEffect(() => () => flood?.geometry.dispose(), [flood])

  return (
    <group>
      {flood && isGroupVisible(flood.body.group, layerVis) && (
        <WaterSurface key="water:flood" geometry={flood.geometry} renderOrder={flood.body.group.renderOrder} extentDiag={flood.body.bodyExtent}
          horizon={manifest.stencil ? waterHorizon(manifest.stencil) : null} look={scene?.surfaces?.params?.water} />
      )}
      {meshes.filter(({ group }) => isGroupVisible(group, layerVis)).map(({ group, geometry, bodyExtent }) => {
        const fade = fadeForGroup(group, stencil)
        const key = group.kind + ':' + group.id
        const draw = groundMaterialFor(group, surfaceTable, { hasFieldAxis: !!geometry.attributes.aFieldAxis })
        if (draw.kind === 'water')
          return <WaterSurface key={key} geometry={geometry} renderOrder={group.renderOrder} extentDiag={bodyExtent}
            horizon={bodyExtent && manifest.stencil ? waterHorizon(manifest.stencil) : null} look={scene?.surfaces?.params?.water} />
        if (draw.kind === 'gravel')
          return <GravelMesh key={key} group={group} geometry={geometry} lightmap={lightmap}
            tintHex={scene?.layerColors?.[group.id]}
            roughness={scene?.materialPhysics?.[group.id]?.roughness}
            scale={scene?.materialPhysics?.[group.id]?.scale} />
        const surface = draw.surface
        // ⛔ A per-field surface on a group baked without field ids cannot know which way its rows
        // run: said once, and drawn in the class's flat colour (what a class with no generator gets).
        if (draw.noFields) {
          reportNoFields(manifest.look, group.id, surface)
          return <FadeMesh key={key} group={group} geometry={geometry} lightmap={lightmap} fade={fade} poolmap={poolmap} poolMeta={poolMeta} />
        }
        if (surface && SURFACES[surface].perField && !geometry.attributes.aFieldEdge) reportNoEdge(manifest.look, group.id)
        return draw.kind === 'surface'
          ? <SurfaceMesh key={key} surface={surface} params={scene?.surfaces?.params?.[surface]} resolved={context ? (context.resolved?.[surface] || null) : undefined} look={manifest.look} group={group} geometry={geometry} lightmap={lightmap} fade={fade} poolmap={poolmap} poolMeta={poolMeta} coast={surface === 'sand' ? coast : null} />
          : <FadeMesh  key={key} group={group} geometry={geometry} lightmap={lightmap} fade={fade} poolmap={poolmap} poolMeta={poolMeta} />
      })}
    </group>
  )
}

function FadeMesh({ group, geometry, lightmap, fade, poolmap, poolMeta }) {
  const hasPool = !!poolmap
  const material = useMemo(() => {
    const mat = makeFadeGroundMaterial({
      color: treatAlbedo(group.color),   // desaturate + value-lift (Surface treatment)
      fade,
      pool: hasPool ? { map: poolmap, min: poolMeta?.min, span: poolMeta?.span, scale: poolScaleOf(poolMeta) } : null,
    })
    // Cascades wrap the material's hook — attached AFTER it exists. (Before 2026-09-26 this ran first
    // and the hook assigned after it replaced the wrapper, so `?csm=1` never reached flat ground.)
    attachCSM(mat)
    // Terrain displacement applied last so its onBeforeCompile wraps any
    // earlier ones (fade, etc.) — patchTerrain runs first, then calls prev.
    // Drives off the shared terrainExag uniform.
    // ⭐ terrainNormals: the ground is lit by the hill it is draped on (Jacob, 2026-09-24).
    patchTerrain(mat, { perVertex: true, terrainNormals: true })
    return mat
  }, [group.color, group.polygonOffsetUnits, fade?.center?.[0], fade?.center?.[1], fade?.inner, fade?.outer, hasPool, poolmap, geometry])

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

function SurfaceMesh({ surface, params, resolved, look, group, geometry, lightmap, fade, poolmap, poolMeta, coast }) {
  useEffect(() => { reportAbsentParams(look, surface, params, resolved) }, [look, surface, params, resolved])
  useEffect(() => {
    if (surface !== 'sand' || !coast?.absent || _saidAbsent.has(look + '|coast')) return
    _saidAbsent.add(look + '|coast')
    console.error(`[BakedGround] ⛔ "${look}": ground rule duneGrass has no distance to the water (${coast.absent}) — it draws nothing on this town's sand.`)
  }, [surface, coast, look])
  // The params the generator draws with: the bake's resolution, the operator's authored layer on top.
  // Authored params' defaults come from the surfaces table itself (pure, already imported), so a
  // context.json resolved before a param existed cannot strand it; the bake's resolution and the
  // operator's layer sit on top.
  const surfaceParams = useMemo(() => ({
    ...Object.fromEntries(Object.entries(SURFACES[surface]?.params || {}).filter(([, p]) => p.source === 'authored').map(([k, p]) => [k, p.default])),
    ...(resolved?.values || {}), ...(params || {}),
  }), [surface, resolved, params])
  const { material, shaderRef } = useMemo(
    () => {
      const built = makeGroundSurfaceMaterial({
        surface,
        // Grass carries its own hue table and ignores this. Every other surface takes
        // the class colour through the SAME Surface treatment FadeMesh applies, so a
        // class keeps its value step when it gains a generator.
        color: surface === 'grass' ? group.color : treatAlbedo(group.color),
        fade,
        poolMap: poolmap || null,
        poolMin: poolMeta?.min,
        poolSpan: poolMeta?.span,
        poolScale: poolMeta?.scale ?? 1,
        surfaceParams,
        fieldEdge: !!geometry.attributes.aFieldEdge,
        coast,
      })
      // No polygonOffset (inert under log-depth). Grass faces separate from
      // adjacent FadeMesh faces by baked geometric Y (renderOrder × EPS) +
      // renderOrder. The 2026-05-13 "green faces invisible in Stage" symptom —
      // caused by relying on the inert polygonOffset at y=0 — is resolved by the
      // Y stack. (z-fight fix 2026-06-17, ARCHITECTURE §8.)
      // Same parity move as FadeMesh — every BakedGround material rises
      // with the shared terrain displacement.
      patchTerrain(built.material, { perVertex: true, terrainNormals: true })
      return built
    },
    [surface, group.color, group.polygonOffsetUnits, fade?.center?.[0], fade?.center?.[1], fade?.inner, fade?.outer, poolmap, surfaceParams, geometry, coast]
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
    if (surface === 'crop') CROP_UNIFORMS.uDoy.value = useCalendar.getState().dayOfYear()
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

// Water bodies — the kit water material (`waterMaterial.js`), lifted out of
// LafayettePark so a town whose water is a Great Lake can reach the same shader.
//
// ⛔⛔ NO patchTerrain, AND THAT IS THE POINT, NOT AN OVERSIGHT. Every other
// ground group drapes per-vertex over the DEM. Water does not: it is a LEVEL
// SURFACE at ONE elevation. Lake Erie does not follow the ground — the ground
// rises out of it. ⇒ y = 0 is the datum everything else is measured from, and
// draping this would produce a lake that undulates.
// ⛔ CORRECTED 2026-09-21. This comment used to justify y = 0 by asserting that
// `bake-terrain` normalizes to local-min and ON A LAKESHORE TOWN THE LOCAL
// MINIMUM IS THE LAKE. ⛔ That was an assumption about the SOURCE, not a
// property of it, and it was FALSE on the town it was written for: huron's 10 m
// mosaic carries Lake Erie hydro-flattened at more than one elevation, the
// minimum landed over a metre below the real surface, and the drawn lake sat
// under its own bed across ~94% of its area — which reads as a bank, not a bug.
// ⭐ `bake-terrain` now DERIVES the datum: when a scene has water, y = 0 is that
// water's surface (the mode of the samples beneath it), and `terrain.json`
// records `datum` + `datumShare` so the choice is legible in the artifact.
// Ground below the water is NEGATIVE, by design.
// ▶ node checks/claims-a-level-body-has-one-surface.mjs
// ⚠️ THE DATUM IS y = 0; THE BAKED SURFACE IS NOT, AND THE 68 mm IS DELIBERATE.
// Every ground group is separated by baked geometry rather than polygonOffset
// (inert under log depth), at renderOrder × GROUND_Y_EPS — water is slot 34 of
// 35, so the lake sits 0.068 m above the datum. It is the coplanar resolver, not
// a lift, and nothing here reads an absolute Y. ⛔ Recorded because the doctrine
// says "water is a level surface at y = 0" and the artifact says 0.068: anything
// that later compares water against the terrain's zero crossing must use the
// group's own baked Y, not the number in the sentence.
//
// ⛔ THE DEM CARRIES NO DEPTH under the water (it hydro-flattens it), so nothing here
// shades by depth. The waterline is the mapped shore and the `bed` sits under it
// (BRIEF-the-shore-is-closed); real depth is BRIEF-bathymetry.
//
// ⭐ The wave frequencies come from THIS BODY'S OWN EXTENT, read off the baked
// geometry's bounding box. Not a constant, not a scene lookup — the surface's
// own size. Hardcoding it back is the silent-plastic regression and
// `checks/claims-water-scales-with-its-body.mjs` fails on it.
// The water mesh lives in `WaterSurface` and is shared with the DESIGNER — read
// that file for why it is a component and not just a material factory.
// Drive the shared terrain exaggeration uniform toward `target`.
// Mounted unconditionally inside BakedGround so any consumer (Stage,
// Preview, future apps) gets terrain displacement without depending on
// StreetRibbons being mounted somewhere to drive it. `target` is a number;
// callers pick it per view (the town's authored exag for hero, 1 for street/planetarium,
// 0 for the flat top-down Browse map).
//
// The ease is TIME-BASED (delta-driven), not a fixed per-frame fraction: the
// old `+= (target-cur)*0.06` took ~80 frames, and FrameLimiter runs non-hero
// modes at ~30fps, so flattening trailed the 2400ms Browse transition and the
// shot landed still-exaggerated. A fixed-duration ease shorter than the
// SHORTEST shot transition (1500ms) guarantees the terrain SETTLES before the
// camera lands, at any framerate. (2026-06-28 — Browse terrain Y-fight on
// return + late flatten.)
const EXAG_EASE_MS = 1200
function TerrainExagDriver({ target }) {
  const from = useRef(terrainExag.value)
  const lastTarget = useRef(target)
  const elapsed = useRef(0)
  useFrame((state, delta) => {
    // View change → re-anchor the ease at wherever the value is right now.
    if (target !== lastTarget.current) {
      from.current = terrainExag.value
      lastTarget.current = target
      elapsed.current = 0
    }
    if (terrainExag.value === target) return
    elapsed.current += delta * 1000
    const p = Math.min(elapsed.current / EXAG_EASE_MS, 1)
    const e = p * p * (3 - 2 * p)   // smoothstep
    terrainExag.value = from.current + (target - from.current) * e
    if (p >= 1) { terrainExag.value = target; return }
    // frameloop="demand": keep requesting frames until settled, or the ease
    // stalls when the camera goes idle mid-transition. Early-return above stops
    // the spin once it lands.
    state.invalidate()
  })
  return null
}

// Look id resolution. Caller may pass `lookId` directly (Stage uses the
// active Look from its store); fallback is the URL `?look=` param so
// Preview's standalone behavior is preserved when no prop is given.

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
 *                                       to the town's authored exag (Hero drama). Pass 1
 *                                       for street-level, 0 for flat top-down.
 */
// ⛔ Default is the TOWN's authored ceiling, resolved at call time — not a module constant
// captured at import, which would pin every look to whatever loaded first (site 15).

// The water body's mesh, run on past the town's rim to the horizon's reach wherever the rim is water. 256 directions
// around the rim: a direction whose rim point lies in the body's own triangles gets a sector from the rim out to the
// horizon's fade (horizonFor), at the body's own level. Returns null when no direction is water.
// The active town's water levels. ⛔ A terrain with no `water` record was baked before the levels existed: the water
// stands at the terrain's zero (the survey flight's level, which no one chose), and that is SAID, once.
let _saidNoLevels = false
function waterLevelsOrSay() {
  try { return waterLevels(terrainWater()) } catch (e) {
    if (!_saidNoLevels) { _saidNoLevels = true; console.error(`[BakedGround] ⛔ ${e.message} — the water stands at the terrain's zero (the survey flight's level)`) }
    return null
  }
}

// The water past the rim: its haze fade (horizonFor) and the drawing's own rim fade. ⛔ A stencil with no fade band is
// said once; its rim is then its radius — the drawing's edge, with no band to fade across.
let _saidNoFade = false
function waterHorizon(stencil) {
  const h = horizonFor(stencil.radius), f = stencil.fade
  if (!(f?.outer > 0) && !_saidNoFade) { _saidNoFade = true; console.error('[BakedGround] ⛔ ground.json stencil carries no fade band — the water turns deep AT the rim, with no fade. ▶ re-bake the ground') }
  return { center: stencil.center, inner: h.radius, outer: h.fadeOuter, rimIn: f?.inner ?? stencil.radius, rimOut: f?.outer ?? stencil.radius }
}

const HORIZON_SECTORS = 256
function extendWaterToHorizon(positions, indices, stencil) {
  const [cx, cz] = stencil.center, R = stencil.radius, Y = positions[1]
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (let i = 0; i < positions.length; i += 3) { const x = positions[i], z = positions[i + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z }
  const bodyExtent = Math.hypot(x1 - x0, z1 - z0)
  const inBody = (x, z) => {
    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3
      const d = (positions[b + 2] - positions[c + 2]) * (positions[a] - positions[c]) + (positions[c] - positions[b]) * (positions[a + 2] - positions[c + 2])
      if (!d) continue
      const w0 = ((positions[b + 2] - positions[c + 2]) * (x - positions[c]) + (positions[c] - positions[b]) * (z - positions[c + 2])) / d
      const w1 = ((positions[c + 2] - positions[a + 2]) * (x - positions[c]) + (positions[a] - positions[c]) * (z - positions[c + 2])) / d
      if (w0 >= 0 && w1 >= 0 && w0 + w1 <= 1) return true
    }
    return false
  }
  const outer = horizonFor(R).fadeOuter
  const wet = []
  for (let k = 0; k < HORIZON_SECTORS; k++) { const a = ((k + 0.5) / HORIZON_SECTORS) * Math.PI * 2; wet.push(inBody(cx + Math.cos(a) * R * 0.995, cz + Math.sin(a) * R * 0.995)) }
  if (!wet.some(Boolean)) return null
  const P = Array.from(positions), I = Array.from(indices)
  for (let k = 0; k < HORIZON_SECTORS; k++) {
    if (!wet[k]) continue
    const a0 = (k / HORIZON_SECTORS) * Math.PI * 2, a1 = ((k + 1) / HORIZON_SECTORS) * Math.PI * 2, v = P.length / 3
    for (const [a, r] of [[a0, R], [a1, R], [a1, outer], [a0, outer]]) P.push(cx + Math.cos(a) * r, Y, cz + Math.sin(a) * r)
    I.push(v, v + 2, v + 1, v, v + 3, v + 2)
  }
  return { positions: new Float32Array(P), indices: new Uint32Array(I), bodyExtent }
}

export default function BakedGround({ lookId, bakeLastMs, targetExag = sceneExag(), surfacesOverride } = {}) {
  const [data, setData] = useState(null)
  const resolvedLookId = lookOf(lookId, 'BakedGround')

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
        const manifestUrl = `${ASSET_BASE}baked/${resolvedLookId}/ground.json?t=${cacheBust}`
        const m = await fetch(manifestUrl).then(r => r.json())
        const bin = await fetch(ASSET_BASE + 'baked/' + m.look + '/' + m.bin + '?t=' + cacheBust)
          .then(r => r.arrayBuffer())
        // The context bake's RESOLVED surface params (physics + this town's derived values).
        // Absent file → null, and SurfaceMesh names it; never a default.
        const context = await fetch(ASSET_BASE + 'baked/' + m.look + '/context.json?t=' + cacheBust)
          .then(r => (r.ok ? r.json() : null)).catch(() => null)
        const coast = await loadCoastDist(m.look, context, cacheBust)
        if (!cancelled) setData({ manifest: m, bin, context, coast })
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
      {data && scene && <GroundMeshes key={cacheBust ?? 'static'} manifest={data.manifest} bin={data.bin} context={data.context} coast={data.coast} scene={scene} bakeLastMs={cacheBust} surfacesOverride={surfacesOverride} />}
    </>
  )
}
