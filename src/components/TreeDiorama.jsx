import { memo, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { INSTANCE } from '../instance.js'
import { IS_MOBILE } from '../lib/isMobile.js'
import CelestialBodies from './CelestialBodies'
import CloudDome from './CloudDome'
import WeatherEffects from './WeatherEffects'
import WeatherPoller from './WeatherPoller'
import AtmosphereDirectiveDriver from './AtmosphereDirectiveDriver'
import { ExposureTicker, PostProcessing, StageShadows } from './PostProcessing'
import { TimeTicker, SkyStateTicker } from './Scene'
import { SwayDriver } from './InstancedTrees.jsx'
import {
  useTreeAtlas, stampTreeVertexAttrs, setLeafTransmission, treeBarkTierUniform,
  applyBarkUniforms, applyDeformerUniforms,
} from './treeAtlasMaterial'
import { setGroundColorMap, setGroundFxMap } from './groundColorState'
import { useCanaryTree } from '../lib/canaryTree.js'
import useTimeOfDay from '../hooks/useTimeOfDay'
import { makeGrassMaterial } from './grassMaterial.js'
import { CANARY_GROUND_CAMERA } from './canaryCamera.js'

/**
 * TREE DIORAMA — one specimen, fully dressed, under the neighbourhood's real
 * sky, in ONE Canvas.
 *
 * ⭐ WHY ONE CANVAS AND NOT TWO FRAMES. The sky is not a backdrop behind the
 * tree, it is the tree's LIGHT. `CelestialBodies` carries the scene's ambient,
 * hemisphere and directional lights and drives them off the same sky state that
 * paints the dome — so a tree mounted beside it is lit by the sun that is
 * actually in the picture, at the hour `ward-time` says it is. Stack two frames
 * instead and you get a tree lit by nothing, in front of a sky it has no
 * relationship to. ⛔ Do not split this.
 *
 * ⭐ EVERYTHING HERE IS THE PRODUCTION COMPONENT. The sky pieces are the ones
 * `Scene` mounts; the sway is `InstancedTrees#SwayDriver`, driven off the live
 * atmosphere directive; the material is the shared per-Look tree atlas the map's
 * trees use. Nothing below is a diorama-only copy — that is the whole claim this
 * surface makes about how the product is built, so it had better be true.
 *
 * ⛔ THE BAKED PATH, NOT THE SOURCE POOL. `public/trees/` is the Arborist's
 * authoring pool and is gitignored on purpose (`.gitignore:230` — "never read by
 * runtime"); a specimen loaded from there can never deploy. The bake at
 * `public/baked/<look>/trees/<species>/` is what ships, and its material is
 * literally named `TreeAtlas` and carries no textures of its own — the runtime
 * binds the shared atlas to it. That is why this mounts `atlas.treeMaterial`
 * rather than dressing anything by hand.
 *
 * Two mounts, one component: `?embed=tree` (framed, chrome-only) and the
 * Arborist's full-monte view. Until this existed there was no view anywhere in
 * the product that showed a FINISHED tree, which is how a publish contract that
 * paints leaves with bark got shipped without anyone noticing.
 */

// The specimen is a knob, not a constant — Jacob asked that swapping it stay
// easy. URL wins (so a page can frame a different tree without a rebuild), then
// props, then these.
const DEFAULT_SPECIES = 'linden_american'
const DEFAULT_LOD = '0'          // one hero specimen can afford the full mesh
const DEFAULT_VARIANT = '1'

function readParam(name) {
  try { return new URLSearchParams(window.location.search).get(name) } catch { return null }
}

/**
 * Specimen — the baked GLB, merged and stamped exactly the way the runtime
 * merges it, wearing the shared atlas material.
 *
 * ⚠ The per-vertex attributes are NOT optional decoration: `aBark` gates the
 * fragment shader's bark retint, `aWindTier` drives the multi-scale sway damping
 * (trunk barely moves, leaf tips rustle), `aTreeHeightNorm` ramps the deformer.
 * Without them the shared shader still compiles and the tree renders WRONG —
 * a silent substitution, so `stampTreeVertexAttrs` (the same helper the Salon
 * preview uses) does the stamping rather than a local copy that could drift.
 */
function Specimen({ url, material, onMeasured }) {
  const { scene } = useGLTF(url)

  // ⚠ Returns a LIST, never a single geometry. The baked GLB is several
  // primitives (branches / caps / leaves), and merging them is an optimisation,
  // not a requirement — the runtime merges to collapse 616 draws down to one,
  // which a single specimen does not care about. ⛔ An earlier cut of this
  // returned `null` when the merge was rejected, so a tree whose primitives
  // carry divergent attribute sets rendered as NOTHING against a working sky:
  // a plausible-looking success, which is the one outcome worth failing loudly
  // to avoid. Merge if we can, draw the primitives if we cannot, draw nothing
  // only when there is genuinely nothing.
  const geometries = useMemo(() => {
    scene.updateMatrixWorld(true)
    const collected = []
    scene.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return
      // Bake the primitive's world transform in, so everything lands in the
      // tree's own frame — matches InstancedTrees#meshes.
      const g = o.geometry.clone()
      g.applyMatrix4(o.matrixWorld)
      stampTreeVertexAttrs(g, {}, o)
      // Which half of the tree this is. The bake stamps it; ⚠ GLTFLoader puts
      // primitive extras in three different places depending on version, so
      // check all three exactly as the runtime does.
      g.userData.isBark = (
        o.geometry?.userData?.atlasKind ?? o.userData?.atlasKind ?? o.userData?.gltfExtras?.atlasKind
      ) === 'bark'
      collected.push(g)
    })
    if (!collected.length) return []

    // Same guards the runtime merge uses: divergent attribute sets or an
    // interleaved attribute make mergeGeometries fail, noisily and per-vertex.
    const keys = Object.keys(collected[0].attributes).sort().join('|')
    const sameKeys = collected.every(g => Object.keys(g.attributes).sort().join('|') === keys)
    const noInterleaved = collected.every(g =>
      Object.values(g.attributes).every(a => !a.isInterleavedBufferAttribute)
    )
    if (sameKeys && noInterleaved) {
      const merged = mergeGeometries(collected, false)
      if (merged) return [merged]
    }
    return collected
  }, [scene])

  // Report the real height up so the camera frames THIS tree rather than a
  // guessed one — a 31 m linden and a 6 m ornamental want different framings.
  useEffect(() => {
    if (!geometries.length) return
    const box = new THREE.Box3()
    let tris = 0
    for (const g of geometries) {
      g.computeBoundingBox()
      if (g.boundingBox) box.union(g.boundingBox)
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3
    }
    // One line, same shape as InstancedTrees' roster log: what actually mounted.
    // A specimen that loads but draws nothing is the exact failure this surface
    // exists to catch, so it has to be legible without a debugger.
    console.log(
      `[TreeDiorama] ${url.split('/').slice(-2).join('/')} ` +
      `parts=${geometries.length}${geometries.length === 1 ? ' (merged)' : ' (unmerged — divergent attrs)'} ` +
      `tris=${Math.round(tris).toLocaleString()} height=${(box.max.y - box.min.y).toFixed(1)}m ` +
      `attrs=${Object.keys(geometries[0].attributes).join(',')}`
    )
    if (onMeasured) {
      onMeasured({
        height: box.max.y - box.min.y,
        // ⚠ The REAL extremes. Framing on `height` alone assumes the base sits
        // at y=0 and silently clips the crown when the bake left it elsewhere.
        baseY: box.min.y,
        topY: box.max.y,
        // A spreading tree runs out of HORIZONTAL room before vertical.
        spread: Math.max(
          Math.abs(box.max.x), Math.abs(box.min.x),
          Math.abs(box.max.z), Math.abs(box.min.z),
        ),
      })
    }
  }, [geometries, onMeasured, url])

  if (!geometries.length || !material) return null
  return (
    <group>
      {geometries.map((g, i) => (
        <mesh
          key={i}
          geometry={g}
          material={material}
          frustumCulled={false}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  )
}

/**
 * ShadowFocus — spend the shadow map on ONE tree.
 *
 * ⭐ THE SINGLE BIGGEST QUALITY WIN HERE, and it is free. `CelestialBodies`
 * sizes its sun's shadow camera for a whole NEIGHBOURHOOD — ±900 m at 4096²,
 * which is ~0.44 m per texel. At that resolution a 21 m tree's shadow is one
 * soft blob: correct, and telling you nothing. Pointed at the tree instead,
 * the same 4096² map covers ~60 m — about 15 mm per texel — and the canopy
 * casts LEAVES.
 *
 * ⭐ This is the diorama's whole licence, in Jacob's words: "this is our chance
 * to really romanticize the lighting when it's only one tree and almost
 * certainly on a desktop browser." The map cannot do this — it needs those
 * 900 m. One specimen can afford what 745 cannot.
 *
 * ⛔ Local, and deliberately so: it retargets the light this Canvas already
 * mounted rather than forking `CelestialBodies` or adding a prop that every
 * other surface would then carry. Nothing shared changes.
 */
function ShadowFocus({ height, spread }) {
  const scene = useThree(s => s.scene)
  useEffect(() => {
    if (!height) return
    // Cover the tree and the ground its shadow can fall on — a low sun throws
    // a long shadow, so the frustum needs room well beyond the canopy.
    const extent = Math.max(height, (spread || height * 0.4) * 2) * 1.6
    scene.traverse((o) => {
      if (!o.isDirectionalLight || !o.castShadow) return
      const c = o.shadow.camera
      c.left = -extent; c.right = extent
      c.top = extent;   c.bottom = -extent
      c.near = 0.5;     c.far = extent * 8
      c.updateProjectionMatrix()
      o.shadow.mapSize.set(4096, 4096)
      o.shadow.bias = -0.00015
      o.shadow.normalBias = 0.02   // the map default (0.15) is tuned for buildings
      o.shadow.needsUpdate = true
    })
  }, [scene, height, spread])
  return null
}

/**
 * Ground — the thing the tree STANDS on, and the thing its shadow lands on.
 *
 * ⭐ A tree with no ground is a specimen floating in space: nothing receives its
 * shadow, so there is no contact, and with no contact the eye reads it as pasted
 * on. The shadow is the cue that says the tree and the horizon share a world.
 *
 * ⛔ Not a new material — `makeGrassMaterial` is the one the park uses, so this
 * takes the same weather (snow accumulates on it) and the same lights. A disc
 * with a radial fade rather than a rectangle, so the far edge does not cut a
 * straight line across the sky and read as a table top.
 */
/**
 * ⭐ THE DIORAMA MOUNTS THE SHARED TREE MATERIAL BUT DRIVES NONE OF ITS SCENE
 * STATE — the seam these two hooks close (measured 2026-08-23, Wren).
 *
 * In the map, `InstancedTrees` writes the bark tier per frame and `BakedGround`
 * supplies the ground colour + FX maps. A bare Canvas mounts neither, so the
 * uniforms sat at their module defaults and the specimen rendered on a path
 * nobody chose. Same class as the missing `ExposureTicker`.
 */

// `treeBarkTierUniform` defaults to 1 (hero) and NOTHING here wrote it, so the
// bark fragment took the tier ≤ 1 branch: `useVendor = step(1.5, tier)` in
// treeAtlasMaterial replaces the trunk's diffuse with the POSTERIZED 16-colour
// substrate. That is the whole of "the trunk looks smooth and low-poly" — the
// linden's trunk is 116,794 triangles; it was never low-poly, it was wearing a
// quantised texture built for browse/hero DISTANCE.
//
// ⛔ Do NOT copy the Salon's distance auto-bind (`< 20 m → 2`): this camera
// frames a whole tree head-to-foot and sits FURTHER back than that, so the
// auto-bind would re-select tier 1 and change nothing. The diorama is a single
// street-level hero specimen — tier 2 is an AUTHORED choice, not a derived one.
// Tier 2 keeps the detail overlay (`step(0.5, tier)`) and adds vendor colour.
function useDioramaBarkTier() {
  useEffect(() => {
    const prev = treeBarkTierUniform.value
    treeBarkTierUniform.value = 2
    return () => { treeBarkTierUniform.value = prev }
  }, [])
}

// The ground blend + contact ring are NOT new features — they ship in the map.
// But they sample the BAKED ground by world-XZ, and this specimen stands at the
// origin of a procedural grass disc, not at a real placement, so there is
// nothing to sample. We synthesise the smallest honest source: a flat colour
// map (the grass albedo) and an FX map whose GREEN channel is a soft radial
// darkening centred on the trunk. Both existing consumers then work unchanged —
// `grassMaterial` darkens the ground (the ring) and `treeAtlasMaterial` pulls
// that shaded ground colour up the trunk base (the skirt).
//
// ⚠️ Sized off the MEASURED specimen, so it tracks the tree rather than a
// hard-coded radius: no measurement yet → no maps bound → today's render.
const GROUND_ALBEDO = '#2d5a2d'   // grassMaterial's default `color`
function useDioramaGround(measured, alpha) {
  const ground = useMemo(() => {
    if (alpha || !measured) return null
    // Ring radius from the canopy, floored so a narrow columnar tree still
    // gets a contact. Half-extent of the square the maps cover.
    const spread = measured.spread || (measured.height || 12) * 0.35
    const half = Math.max(spread * 1.15, 2.5)
    const N = 128
    const c = document.createElement('canvas'); c.width = c.height = N
    const ctx = c.getContext('2d')
    // R = lamp pool (none here) · G = contact shadow · B unused.
    ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, N, N)
    const g = ctx.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2)
    // Dense at the trunk, gone by the canopy edge — a contact cue, not a
    // drop-shadow. The sun-driven shadow is StageShadows' job; this is AO.
    g.addColorStop(0.00, 'rgba(0,255,0,1)')
    g.addColorStop(0.18, 'rgba(0,255,0,0.72)')
    g.addColorStop(0.55, 'rgba(0,255,0,0.20)')
    g.addColorStop(1.00, 'rgba(0,255,0,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, N, N)
    const fx = new THREE.CanvasTexture(c)
    fx.colorSpace = THREE.NoColorSpace          // data, not colour
    fx.wrapS = fx.wrapT = THREE.ClampToEdgeWrapping
    const col = new THREE.DataTexture(
      new Uint8Array([...new THREE.Color(GROUND_ALBEDO).convertLinearToSRGB()
        .toArray().map(v => Math.round(v * 255)), 255]), 1, 1)
    col.colorSpace = THREE.SRGBColorSpace
    col.needsUpdate = true
    return { texture: fx, colorTexture: col, min: [-half, -half], span: [half * 2, half * 2], scale: 1, half }
  }, [measured, alpha])

  useEffect(() => {
    if (!ground) return undefined
    setGroundColorMap(ground.colorTexture, ground.min, ground.span)
    setGroundFxMap(ground.texture, ground.min, ground.span, ground.scale)
    return () => {
      setGroundColorMap(null)
      setGroundFxMap(null)
      ground.texture.dispose()
      ground.colorTexture.dispose()
    }
  }, [ground])

  return ground
}

/**
 * ⛔⛔ THE BARK SLOTS — the diorama was the ONLY consumer of the shared tree
 * material that never bound them (measured 2026-08-23, Wren).
 *
 * `InstancedTrees`, `SpecimenViewport` (Salon), `CanaryScene` (Meteorologist)
 * and both impostor bakers all call `applyBarkUniforms` per frame. This one did
 * not, so the per-species slots kept their compile-time defaults:
 *   uBarkUVScale    -> (1,1)  : the tiling NEVER RAN, so ONE 512px bark tile was
 *                               stretched across a 20 m trunk — the whole of
 *                               "there is still no texture on this trunk"
 *   uBarkTileOffset -> (0,0)  \ the tile-local UV recovery is wrong, so the
 *   uBarkTileScale  -> (1,1)  / detail overlay + posterized substrate sample
 *                               the wrong region of the atlas entirely
 * plus tintBase / tintJitter / roughnessOverride, all unset.
 *
 * ⭐ The atlas tile itself was never the problem: the linden's bark tile carries
 * real detail (luminance sigma 27.5 over 512x512) — it was being sampled wrong.
 * ▶ scratch/_wren-atlas-tile.mjs
 *
 * Per-FRAME, not an effect: `material.userData.shader` does not exist until
 * three compiles the program, so a pre-paint effect early-returns forever.
 * (Same reasoning as CanaryScene.)
 */
function BarkSlots({ atlas, species, variantId }) {
  const slots = useMemo(() => {
    const m = atlas?.manifest
    if (!m) return null
    return {
      barkSettings:   m.barkBySpecies?.[species] || null,
      gradientSlot:   m.barkGradientByVariant?.[species]?.[variantId]
                        || m.barkGradientByVariant?.[species]?.[String(variantId)] || null,
      detailSlot:     m.barkDetailBySpecies?.[species] || null,
      posterizedSlot: m.barkPosterizedBySpecies?.[species] || null,
      deformerRange:  m.deformerBySpecies?.[species]?.range || null,
    }
  }, [atlas?.manifest, species, variantId])

  useFrame(() => {
    if (!atlas?.treeMaterial || !slots) return
    applyBarkUniforms(
      atlas.treeMaterial, slots.barkSettings,
      slots.gradientSlot, slots.detailSlot, slots.posterizedSlot,
    )
    applyDeformerUniforms(atlas.treeMaterial, slots.deformerRange, null)
  })
  return null
}

function Ground({ radius = 90, fx = null }) {
  const material = useMemo(
    () => makeGrassMaterial({
      fade: { center: [0, 0], inner: radius * 0.42, outer: radius },
      // The grass shader ALREADY darkens by the FX map's G channel (contact
      // shadow) — in the map that map is baked. Here it is synthesised
      // (`useDioramaGround`), so the ring rides the SAME path, not a decal.
      poolMap: fx?.texture || null,
      poolMin: fx?.min, poolSpan: fx?.span, poolScale: fx?.scale ?? 1,
    }).material,
    [radius, fx],
  )
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={material}>
      <circleGeometry args={[radius, 96]} />
    </mesh>
  )
}

/**
 * DioramaCamera — frames the measured specimen head-to-foot.
 *
 * The sky components draw at a radius of hundreds of metres, so `far` stays
 * wide; only the camera's placement is tree-scaled. The eye sits a little below
 * mid-canopy, so the tree is seen slightly from beneath and reads as STANDING
 * rather than as a specimen on a turntable.
 */
function DioramaCamera({ height, spread, baseY = 0, topY }) {
  const camera = useThree(s => s.camera)
  const size = useThree(s => s.size)
  const poseRef = useRef(null)
  useEffect(() => {
    if (!height) return

    // ⭐ THE POSE IS AUTHORED, NOT INVENTED — `CANARY_GROUND_CAMERA` — the ONE canary
    // camera, owned here rather than borrowed from the unfinished canary scene (Jacob: "duplicate Hero camera and use
    // it only here, call it canary or something"). It already encodes the shot
    // this view wants and says so in its own comment: eye on the ground at
    // 1.7 m, backed off, tilted UP at the canopy, "what users see standing in
    // the neighborhood."
    // ⛔ Not duplicated. The canary scene and this one are the same question
    // about the same specimen — a second copy of the pose would drift, and the
    // drift would be invisible because both would look plausible.
    const base = CANARY_GROUND_CAMERA
    const eyeY = base.position[1]                        // 1.7 m — a person's eye
    const azimuth = Math.atan2(base.position[0], base.position[2])   // its angle round the tree
    if (camera.fov !== base.fov) { camera.fov = base.fov }

    // ⚠ ONLY THE DISTANCE IS DERIVED, and it has to be: that pose was authored
    // "for typical 12-18m broadleaves" (its words), and the canary is whatever
    // the operator pointed at — a 21 m linden, a 25 m oak. Holding the authored
    // distance clips them; deriving it keeps the authored SHOT and makes it fit.
    const top  = topY ?? height
    const base_ = baseY ?? 0
    const vHalf = (camera.fov * Math.PI) / 360
    const aspect = size.width && size.height ? size.width / size.height : 1
    const hHalf = Math.atan(Math.tan(vHalf) * aspect)
    const MARGIN = 0.82                                   // 18% air, top and bottom

    // span(d) = atan((top-eye)/d) + atan((eye-base)/d) — falls monotonically in
    // d, so a bisection lands it exactly, with no trig identity to get wrong.
    let lo = height * 0.2, hi = height * 6
    const wantV = 2 * vHalf * MARGIN
    for (let i = 0; i < 40; i++) {
      const d = (lo + hi) / 2
      const span = Math.atan((top - eyeY) / d) + Math.atan((eyeY - base_) / d)
      if (span > wantV) lo = d; else hi = d
    }
    let distance = (lo + hi) / 2
    const r = spread || height * 0.35
    distance = Math.max(distance, (r * 1.06) / Math.tan(hHalf))   // wide canopies too

    // Aim at the middle of the span in ANGLE — what centres the tree and keeps
    // the horizon low, which is the authored shot's whole character.
    const midAngle = (Math.atan((top - eyeY) / distance) - Math.atan((eyeY - base_) / distance)) / 2
    const aimY = eyeY + Math.tan(midAngle) * distance

    poseRef.current = {
      pos: [Math.sin(azimuth) * distance, eyeY, Math.cos(azimuth) * distance],
      aimY,
      fov: base.fov,
    }
  }, [camera, height, spread, baseY, topY, size.width, size.height])

  // ⚠ ASSERTED EVERY FRAME, NOT SET ONCE — and this is not belt-and-braces.
  // Mounting the PostProcessing chain re-initialises the Canvas camera AFTER a
  // one-shot effect has posed it, so the view silently snapped back to R3F's
  // default and the whole diorama read as "looking down at a field with no tree
  // in it." That cost a long detour: the symptom looks like a broken camera fit
  // or a missing specimen, and it is neither. Re-asserting is cheap (a compare
  // and maybe three writes) and makes the pose immune to whoever else touches
  // the camera.
  useFrame(() => {
    const p = poseRef.current
    if (!p) return
    if (
      camera.position.x !== p.pos[0] ||
      camera.position.y !== p.pos[1] ||
      camera.position.z !== p.pos[2] ||
      camera.fov !== p.fov
    ) {
      camera.fov = p.fov
      camera.position.set(p.pos[0], p.pos[1], p.pos[2])
      camera.lookAt(0, p.aimY, 0)
      camera.updateProjectionMatrix()
    }
  })
  return null
}

/**
 * ⭐ EVERY MOUNT FOLLOWS THE CANARY. One selection, one specimen, everywhere —
 * the Arborist's full monte, the Meteorologist's canary scene, and the embed on
 * the page. ⛔ The embed used to be excepted, on my reasoning that a published
 * page should not change because an operator clicked something in their own
 * browser. Jacob pushed on it and the reasoning does not survive: the canary is
 * per-BROWSER, so a real visitor has none and gets the default either way — the
 * exception bought nothing and cost the one thing the canary exists to prevent.
 * It put a different tree on two surfaces at once, which is how an hour went
 * into judging AO on an oak while the page was showing a linden.
 * ⚠ One live consequence: point the canary at a species with no baked GLB and
 * the embed breaks — in that operator's browser only.
 */
function TreeDiorama({ species, lod, variant, lookId, transparent } = {}) {
  // ── Jump the clock, so a lighting effect can actually be LOOKED at ───────
  // ⭐ THE DIORAMA RUNS ON LIVE WALL CLOCK. That is right for the embed and
  // wrong for inspection: at midday the sun is overhead, nothing is backlit, and
  // an effect that depends on backlight is invisible — which reads exactly like
  // "it didn't work" (Jacob, 2026-08-23: "I am in the arborist and I don't know
  // what I'm looking for"). There was no visible time control here to fix that.
  //   ?at=17:55   put the sun low and behind the tree
  // ⛔ Not a fallback: with no parameter the live clock is untouched. TimeTicker
  // then carries on from wherever it was put, so the scene keeps moving.
  useEffect(() => {
    let raw = null
    try { raw = new URLSearchParams(window.location.search).get('at') } catch { /* no URL */ }
    if (!raw) return
    const m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(raw.trim())
    if (!m) { console.warn(`[TreeDiorama] ?at="${raw}" is not HH:MM — clock untouched`); return }
    const hh = Math.min(23, Math.max(0, Number(m[1])))
    const mm = Math.min(59, Math.max(0, Number(m[2] || 0)))
    const at = new Date(); at.setHours(hh, mm, 0, 0)
    useTimeOfDay.getState().setTime(at)
    console.log(`[TreeDiorama] clock set to ${hh}:${String(mm).padStart(2, '0')}`)
  }, [])

  // ── Leaf transmission, tunable by eye on the proving ground ──────────────
  // ⭐ THE SHIPPED DEFAULT IS 0 and stays 0 until a value is authored — the
  // uniform lives on the SHARED tree material, so anything else would change
  // every scene the moment this landed. This is the dial for choosing that
  // value, on the surface that exists to choose it.
  //   ?leafT=<0..4>   how much light comes through a leaf
  //   ?leafK=<0.25..16> how tightly the glow hugs the light's direction
  // Same shape as InstancedTrees' `?heroGeom=`. ⛔ Not a fallback: with no
  // parameter this writes nothing at all and the default stands.
  useEffect(() => {
    let t = null, k = null
    try {
      const q = new URLSearchParams(window.location.search)
      t = q.get('leafT'); k = q.get('leafK')
    } catch { /* no URL, no dial */ }
    if (t == null && k == null) return
    const applied = setLeafTransmission(t == null ? undefined : Number(t),
                                        k == null ? undefined : Number(k))
    console.log('[TreeDiorama] leaf transmission', applied)
  }, [])

  const pick = useCanaryTree()
  // ⭐ ALPHA MODE — the tree with the sky's LIGHT but not the sky's PIXELS.
  // A host page that already draws its own sky (the site's band, with its own
  // sun and moon on the same clock) must not receive a second one painted over
  // it. So the canvas clears to alpha 0 and `CelestialBodies` runs at
  // debugLevel 1 — "lights only, no sky/moon/orbs" — which keeps the ambient,
  // hemisphere and directional sun that make the leaves bright at noon and dark
  // at midnight, and drops every mesh that would paint a background.
  // ⛔ This is NOT a capture and NOT a cutout: the alpha is the frame buffer's
  // own, per pixel, through the leaf cards' cutouts, refreshed every frame.
  // ⭐ So the page shows through the canopy, and the canopy's luminance is the
  // scene's, at the hour the page asked for.
  const alpha = transparent ?? (readParam('alpha') === '1')
  const look = lookId || pick?.lookId || INSTANCE.lookId
  const sp  = readParam('species') || species || pick?.species || DEFAULT_SPECIES
  const ld  = readParam('lod')     || lod     || DEFAULT_LOD
  const vr  = readParam('variant') || variant ||
              (pick?.variantId != null ? String(pick.variantId) : DEFAULT_VARIANT)

  const atlas = useTreeAtlas(look)
  const [measured, setMeasured] = useState(null)
  const ground = useDioramaGround(measured, alpha)
  useDioramaBarkTier()

  const url = `${import.meta.env.BASE_URL}baked/${look}/trees/${sp}/skeleton-${vr}-lod${ld}.glb`

  // ⛔ NO FALLBACK. If the atlas fails to build there is no second dressing to
  // fall back to — an undressed specimen paints its leaves with bark and looks
  // merely wrong rather than broken, which is the worst outcome. Say so, loudly,
  // and draw the sky alone.
  useEffect(() => {
    if (atlas.status === 'error') {
      console.error(
        `[TreeDiorama] tree atlas FAILED to build for look "${look}" — the specimen is NOT drawn. ` +
        `Without it the GLB's TreeAtlas material carries no textures at all.`, atlas.error
      )
    }
  }, [atlas.status, atlas.error, look])

  return (
    <Canvas
      frameloop="always"
      camera={{ position: [0, 12, 40], fov: 45, near: 0.5, far: 60000 }}
      gl={{
        alpha: alpha,
        antialias: !IS_MOBILE,
        logarithmicDepthBuffer: !IS_MOBILE,
        toneMapping: THREE.ACESFilmicToneMapping,
      }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, alpha ? 0 : 1)}
      /* One specimen, near-certainly desktop — spend the pixels the map
         cannot (Jacob, 2026-08-23). The map caps at 1.5 for 745 trees. */
      dpr={IS_MOBILE ? 1 : [1, 2]}
      shadows
    >
      {/* The clock, and the weather it drives — the same seam every other embed
          uses, so an embedding page's slider moves this sky, this light and
          this wind together. */}
      <TimeTicker />
      <SkyStateTicker />
      <WeatherPoller />
      <AtmosphereDirectiveDriver lookId={look} />
      {/* ⭐ THE LUMINANCE OF THE HOUR, and without it the tree is lit like noon
          at 3am. The per-Look EXPOSURE envelope is authored across the day and
          normally applied by the PostProcessing chain, which a bare Canvas like
          this one does not run — `ExposureTicker` exists for exactly that case.
          ⚠ Missing it does NOT look broken: the sky still goes dark (it paints
          its own night colours) while the tree stays daylit, so the scene reads
          as a lit object on a night backdrop and the eye blames the tree.
          Measured 2026-08-23: at 03:00 the canopy was full daylight green with
          stars behind it. */}
      <ExposureTicker lookId={look} />

      {/* The sky. CelestialBodies carries the lights, so this is also the
          diorama's entire lighting rig. */}
      {/* debugLevel 1 = lights only. In alpha mode the host page owns the sky;
          we still take our light from it. */}
      <CelestialBodies debugLevel={alpha ? 1 : 0} />
      {!alpha && <CloudDome />}
      <WeatherEffects />

      {/* The canopy moves off the same wind that moves the clouds. */}
      <SwayDriver />

      {!alpha && <Ground fx={ground} />}
      {/* ⭐ THE PRODUCTION CHAIN — AO, the authored grade, bloom. Jacob: "the AO
          isn't evident", and it was not: self-shadowing alone leaves the canopy
          interior flat and the trunk meeting the grass with no darkening at the
          contact, which is the one cue that says "standing on" rather than "in
          front of". ⛔ Neither this view NOR the Meteorologist's canary mounted
          it before, so both surfaces where an operator judges a tree were
          showing something the map would never render — the same class as the
          missing ExposureTicker, one layer up. */}
      {!alpha && <PostProcessing lookId={look} />}
      {/* The authored soft-shadow settings, so the contact reads soft rather
          than stencilled — same component Stage uses. */}
      {!alpha && <StageShadows lookId={look} />}
      {!alpha && <ShadowFocus height={measured?.height} spread={measured?.spread} />}
      <DioramaCamera height={measured?.height} spread={measured?.spread} baseY={measured?.baseY} topY={measured?.topY} />
      {atlas.status === 'ready' && <BarkSlots atlas={atlas} species={sp} variantId={vr} />}
      {atlas.status === 'ready' && (
        <Suspense fallback={null}>
          <Specimen url={url} material={atlas.treeMaterial} onMeasured={setMeasured} />
        </Suspense>
      )}
    </Canvas>
  )
}

/**
 * ⛔⛔ MEMOISED, AND IT IS LOAD-BEARING — NOT AN OPTIMISATION.
 *
 * ⚠ THE BUG IT FIXES, because it will look like anything but this: framed, the
 * tree appeared and then vanished, leaving grass and a horizon under a camera
 * that had never been posed. Top-level (the Arborist) the same component was
 * perfect. Measured in the frame:
 *
 *     atlas "ready" · framed true · camEffect 1 · memo 6 → 43 → 85 → … → 260
 *     …with `url` and the loaded `scene.uuid` IDENTICAL throughout,
 *     and the measure effect NEVER committing once.
 *
 * A `useMemo([scene])` that recomputes ~46×/second on a stable dep is not a
 * stale-dep bug — it is a REMOUNT every frame. `App` re-renders on every store
 * tick; that re-renders this Canvas; R3F's Canvas re-runs `root.render()` under
 * a fresh context Bridge, and the entire scene subtree is torn down and rebuilt
 * before React ever commits an effect. So the geometry was built 46 times a
 * second and measured zero times, the camera never learned the tree's height,
 * and the specimen flickered out.
 *
 * ⭐ Memoising here severs that: the Canvas re-renders only when ITS props
 * change, and it takes none from App. ⛔ Do not remove this because "it takes no
 * props so it cannot re-render" — that is exactly backwards; taking no props is
 * what makes memo total.
 */
export default memo(TreeDiorama)
