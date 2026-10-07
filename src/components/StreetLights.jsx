import { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import useTimeOfDay from '../hooks/useTimeOfDay'
import { patchTerrainInstancedBaked, UNIFORMS as TERRAIN_UNIFORMS, TERRAIN_DECL } from '../utils/terrainShader'
import { getElevationRaw, groundPairs } from '../utils/elevation'
import { resolveGroupAtMinute, getTodSlotMinutes } from '../cartograph/animatedParam.js'
import { LANTERN_FLAT_DEFAULTS, LANTERN_FIELD_KEYS, LANTERN_FIELDS, kitDayChannel } from '../cartograph/skyLightChannels.js'
import { lampGlow as _lampGlow, lampGrid as _lampGrid } from '../preview/lampGlowState'
import { buildLampGrid, canopyWipe } from '../lib/lampPool.js'
import { lampModelOf } from '../lib/lampModels.js'

const LANTERN_DEFAULT_CHANNEL = Object.freeze(kitDayChannel('lantern'))


// ── Constants ──────────────────────────────────────────────────────────────────
import { useQuality } from '../lib/qualityProfile.js'
const LAMP_COLOR_ON = new THREE.Color(LANTERN_FLAT_DEFAULTS.color)  // until the first frame applies the keyed colour
const BULB_RADIUS = 0.05                      // sharp bulb dot at lantern center
// (The ground light pool AND the lamp contact shadow moved into the baked
// ground FX map — see BakedGround / grassMaterial / bake-ground-ao.js.
// POOL_RADIUS/POOL_Y/poolMat + SHADOW_RADIUS/baseMat all retired.)

const GLOW_SIZE_FIELD = LANTERN_FIELDS.find(f => f.key === 'glowSize')

function StreetLights({ lamps: lampsProp, reach, lantern: lanternChannel, model: modelId, town } = {}) {
  // The town's lamp model — its authored choice, or the kit's standard post (lampModels.js).
  const model = useMemo(() => lampModelOf(modelId, town), [modelId, town])
  const GLOW_Y = model.headY   // world Y of the lit head above its ground
  const glowRadius = useQuality().lampHaloRadius
  const lampRef = useRef()
  const glowRef = useRef()
  const bulbRef = useRef()
  const haloRef = useRef()
  // Production Canvas runs frameloop="demand"; the imperative instance-matrix
  // fills below (lamp/glow/bulb) don't trigger R3F's auto-invalidate, and the
  // lamp model loads async — so lamps would stay unpainted until a camera nudge.
  // invalidate() after each fill requests the paint. No-op under "always".
  // (2026-06-28 — sibling of the InstancedTrees demand-mode fix.)
  const invalidate = useThree(s => s.invalidate)
  const sunAltUniform = useRef({ value: 0.5 })
  const bulbOnUniform = useRef({ value: 0 })
  const lampMatRef = useRef(null)
  const glowMatRef = useRef(null)
  const getLightingPhase = useTimeOfDay(s => s.getLightingPhase)
  // The lamp's colour is the Lantern channel's `color`, keyed like its brightness (warm gaslamps at Dusk, cold
  // glitter at Night). Applied in the frame loop ONLY when the resolved hex changes — never a per-frame overwrite.
  const appliedColor = useRef(null)

  // Effect that re-applies tint lives below the lampModel useState so the
  // dep array can include it (re-runs when the GLB finishes loading).

  // The town's lamps come from the caller — BakedLamps passes the slab's lamps.json. There is no
  // fallback: this used to read one town's src/data/street_lamps.json when no lamps were passed,
  // which bundled that file into every town (BRIEF-slab-loading ③). No caller relied on it.
  if (!Array.isArray(lampsProp)) throw new Error('[StreetLights] no lamps passed — a town\'s lamps come from its slab (lamps.json)')
  const allLamps = lampsProp
  // The lamps, binned for the building walls (lampPool.js#buildLampGrid) — from the list we DRAW.
  useEffect(() => {
    if (allLamps.length && !(reach > 0)) {
      // ⛔ No fallback reach: a lamps.json baked before the derived reach lights no walls, and says so.
      console.warn(`[StreetLights] ${allLamps.length} lamps and no reach (lamps.json predates the derived pool reach) — building walls take NO lamp light. ▶ re-bake lamps.`)
      _lampGrid.uLampGridDims.value.set(0, 0, 0); return
    }
    const g = buildLampGrid(allLamps, reach)
    if (!g) { _lampGrid.uLampGridDims.value.set(0, 0, 0); return }
    const tex = new THREE.DataTexture(g.data, g.cols * g.k, g.rows, THREE.RGBAFormat, THREE.FloatType)
    tex.minFilter = tex.magFilter = THREE.NearestFilter
    tex.needsUpdate = true
    _lampGrid.uLampGrid.value = tex
    _lampGrid.uLampGridMin.value.set(g.min[0], g.min[1])
    _lampGrid.uLampGridDims.value.set(g.cols, g.rows, g.k)
    _lampGrid.uLampGridCell.value = g.cell
    _lampGrid.uLampHeadY.value = GLOW_Y          // the lantern's height above its ground
    _lampGrid.uLampReach.value = reach
    return () => { _lampGrid.uLampGridDims.value.set(0, 0, 0); _lampGrid.uLampGrid.value = null; tex.dispose() }
  }, [allLamps, reach, GLOW_Y])

  // Baked ground anchor per lamp (groundSampler): the raw field where the DRAWN
  // ground sits under each lamp → rigid-lift onto the rendered surface, no float
  // (the buildings/foundations regime for point objects). Falls back to the
  // smooth field for any lamp that predates the bake.
  const aGround = useMemo(
    () => groundPairs(allLamps, l => (typeof l.groundRaw === 'number' ? l.groundRaw : getElevationRaw(l.x, l.z))),
    [allLamps],
  )

  // ── Shared geometries ───────────────────────────────────────────────────────
  // Glow + halo are billboards (planes that face the camera in the
  // vertex shader). Soft fragment-shader falloff = no visible edge.
  // Bulb stays a tiny sphere — small enough that the sphere edge is
  // imperceptible and it reads as a pure pinprick of light.
  const glowGeo = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  const haloGeo = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  const bulbGeo = useMemo(() => new THREE.SphereGeometry(1, 8, 6), [])

  // Vertex-shader snippet for camera-facing billboards on instanced
  // geometry. The plane's local position becomes a screen-space offset
  // from the instance center, so the quad ALWAYS faces the camera and
  // the fragment shader gets clean UVs to compute radial falloff.
  //
  // Terrain lift is added directly to _bbCenter.y in world space (the
  // billboard custom shader bypasses three's standard project_vertex
  // chain, so patchTerrainInstancedBaked can't see it). Uniforms come from
  // TERRAIN_UNIFORMS on each ShaderMaterial that consumes this snippet.
  const BILLBOARD_VS_INC = /*glsl*/`
    vec4 _bbCenter = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    // Baked ground anchor (matches the lamp post) — no live terrain sample.
    _bbCenter.y += aGround.x * uExag + aGround.y;
    vec4 _bbCenterView = viewMatrix * _bbCenter;
    // Scale recovered from instanceMatrix's first column (uniform scale).
    float _bbScale = length(vec3(instanceMatrix[0].xyz));
    vec4 _bbView = _bbCenterView + vec4(position.xy * _bbScale, 0.0, 0.0);
    gl_Position = projectionMatrix * _bbView;
  `

  // ⛔ LOG DEPTH: Stage/Preview render with logarithmicDepthBuffer:true, and a ShaderMaterial without the
  // logdepthbuf chunks writes a linear depth the depth test compares against log depth — the soft Glow was
  // hidden by everything and the knob "did nothing" (measured 2026-09-26: visible with depthTest off). The
  // chunks are no-ops on production's linear depth. ▶ claims-light-sources-are-live ⑩.
  // ── Glow orb (tight glass halo) — billboard with soft falloff ────────────
  // Tight, intense, warm — reads as the bulb's immediate halo through
  // the lantern glass. PlaneGeometry billboarded in vertex; fragment
  // does its own radial Gaussian.
  const glowMat = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: LAMP_COLOR_ON.clone() },
        uIntensity: { value: 0 },
        ...TERRAIN_UNIFORMS,
      },
      vertexShader: /*glsl*/`
        #include <common>
        #include <logdepthbuf_pars_vertex>
        ${TERRAIN_DECL}
        attribute vec2 aGround;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          ${BILLBOARD_VS_INC}
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /*glsl*/`
        #include <common>
        #include <logdepthbuf_pars_fragment>
        uniform vec3 uColor;
        uniform float uIntensity;
        varying vec2 vUv;
        void main() {
          #include <logdepthbuf_fragment>
          float r = length(vUv - 0.5) * 2.0;          // 0 at center, 1 at edge
          if (r >= 1.0) discard;
          float core = exp(-r * r * 8.0);
          float ring = exp(-r * r * 2.0);
          float a = (core * 0.7 + ring * 0.3) * uIntensity;
          a *= 1.0 - smoothstep(0.6, 1.0, r);          // force-clamp to 0 at edge
          gl_FragColor = vec4(uColor, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    glowMatRef.current = { uniforms: mat.uniforms }
    return mat
  }, [])

  // ── Wide soft halo (bloom substitute) — billboard, much wider/dimmer ──────
  const haloMat = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: LAMP_COLOR_ON.clone() },
        uIntensity: { value: 0 },
        uHaloSize: { value: 3 },   // Lantern › Glow size (m, radius)
        uPush: { value: 0 },       // the lantern's own half-width — measured from the model, set on load
        ...TERRAIN_UNIFORMS,
      },
      vertexShader: /*glsl*/`
        #include <common>
        #include <logdepthbuf_pars_vertex>
        ${TERRAIN_DECL}
        attribute vec2 aGround;
        uniform float uHaloSize;
        uniform float uPush;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          ${BILLBOARD_VS_INC
            // Sized by the Glow size knob, not the instance scale; pushed toward the camera by the lantern's own
            // half-width so the cage and glass never hide it. ⭐ The glow is SMALL by design (Glow size 0.2–1.5 m): a
            // flat card cannot make a wide halo — pushed forward by its radius it washed the post and everything near
            // it white (tried 2026-09-26, Jacob: "looks terrible"). The wide halo is Bloom's (Image › Bloom).
            .replace('vec4 _bbView = _bbCenterView + vec4(position.xy * _bbScale, 0.0, 0.0);',
                     'vec4 _bbView = _bbCenterView + vec4(normalize(-_bbCenterView.xyz) * uPush, 0.0) + vec4(position.xy * 2.0 * uHaloSize, 0.0, 0.0);')}
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /*glsl*/`
        #include <common>
        #include <logdepthbuf_pars_fragment>
        uniform vec3 uColor;
        uniform float uIntensity;
        varying vec2 vUv;
        void main() {
          #include <logdepthbuf_fragment>
          float r = length(vUv - 0.5) * 2.0;
          if (r >= 1.0) discard;
          // Light gathered at the lantern, falling away fast — a glow, not a haze disc (Jacob: the gradual
          // exp(-2r²) read as grey fog filling the whole circle). Zero at the edge.
          float a = exp(-r * r * 6.0) * uIntensity * 0.45;
          a *= 1.0 - smoothstep(0.6, 1.0, r);
          gl_FragColor = vec4(uColor, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    return mat
  }, [])

  // ── Bulb dot — sharp tiny point of pure light at the lantern center ───────
  // Slightly hot-tinted but visually reads white because it's tiny and bright.
  const bulbMat = useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffffff'),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    patchTerrainInstancedBaked(mat)
    return mat
  }, [])

  // ⛔ THE SHADOW PASS MUST REPEAT THE LIFT. The posts are lifted in the shader by their baked
  // ground anchor (patchTerrainInstancedBaked); three's own depth material never runs that, so
  // the posts cast from the baseline, buried under the terrain. Same class as SlabBuildings.
  // ▶ checks/claims-displaced-casters-have-a-depth-material.mjs
  const lampDepthMat = useMemo(() => {
    const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
    patchTerrainInstancedBaked(dm)
    return dm
  }, [])

  // (Both the ground light POOL and the lamp CONTACT SHADOW moved into the
  // baked ground FX map 2026-06-22 — R = additive pool (dark center → bright
  // ring → 0), G = contact shadow (tree + lamp bases), darkening the ground
  // diffuse DIRECTLY so the ring reads in daytime. Sampled by grass + FadeMesh;
  // see bake-ground-ao.js. The floating pool/base discs are retired.)

  // ── Load the town's lamp model ──────────────────────────────────────────────
  // Its lit-part mask (`txMap`) becomes the emissive map; glass areas glow, iron stays dark.
  const [lampModel, setLampModel] = useState(null)

  // A freshly loaded lamp model (or glow material) has not had the colour yet — re-apply on the next frame.
  useEffect(() => { appliedColor.current = null }, [lampModel, haloMat])

  useEffect(() => {
    let cancelled = false
    model.load().then(({ geometry, txMap, material: mat, nodeMatrix, scale }) => {
      if (cancelled) return
      // Glass glow: the mask → emissiveMap. The Bulb knob drives emissiveIntensity — real HDR light, so
      // bloom takes it. (A post-tonemap colour shift was tried 2026-09-26 and read ~1% as strong: it can
      // never exceed display white, so nothing blooms.)
      mat.emissive = LAMP_COLOR_ON.clone()
      mat.emissiveMap = txMap
      mat.emissiveIntensity = 0

      // Enable transparency so glass panels can fade to clear during day
      mat.transparent = true

      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uSunAltitude = sunAltUniform.current
        shader.uniforms.uBulbOn = bulbOnUniform.current
        shader.uniforms.uTxMap = { value: txMap }

        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          `#include <common>
          uniform float uSunAltitude;
          uniform float uBulbOn;
          uniform sampler2D uTxMap;`
        )

        // Force flat dark wrought-iron on non-glass areas, night-darken all
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec3 ironColor = pow(vec3(0.04, 0.04, 0.04), vec3(2.2));
          float ironMask = 1.0 - texture2D(uTxMap, vMapUv).r;
          diffuseColor.rgb = mix(diffuseColor.rgb, ironColor, ironMask);
          float nightDarken = mix(0.15, 1.0, smoothstep(-0.1, 0.1, uSunAltitude));
          diffuseColor.rgb *= nightDarken;`
        )

        // Glass alpha: clear during day, opaque at night (smooth golden hour fade)
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>
          float glassMask = texture2D(uTxMap, vMapUv).r;
          // Lit glass shows as much as the Bulb is on — keys × daylight — and reads clear when it is off.
          float glassVisible = clamp(uBulbOn, 0.0, 1.0);
          gl_FragColor.a *= mix(1.0, glassVisible, glassMask);`
        )
      }

      // Chain terrain displacement for instanced mesh lift.
      patchTerrainInstancedBaked(mat)
      lampMatRef.current = mat
      // The lantern's horizontal half-diagonal, in world metres — how far the glow sits in front of it.
      geometry.computeBoundingBox()
      const sz = new THREE.Vector3(); geometry.boundingBox.getSize(sz)
      haloMat.uniforms.uPush.value = 0.5 * Math.hypot(sz.x, sz.z) * new THREE.Vector3().setFromMatrixScale(nodeMatrix).x * scale

      setLampModel({ geometry, material: mat, nodeMatrix, scale })
    }).catch(err => console.error(`[StreetLights] lamp model "${model.id}" failed to load — no lamp posts drawn:`, err))
    return () => { cancelled = true }
  }, [model, haloMat])

  // ── Instance transforms — lamp posts ────────────────────────────────────────
  useEffect(() => {
    if (!lampRef.current || !lampModel) return
    const d = new THREE.Object3D()
    const combined = new THREE.Matrix4()

    allLamps.forEach((lamp, i) => {
      d.position.set(lamp.x, -0.08, lamp.z)
      d.rotation.set(0, Math.random() * Math.PI * 2, 0)
      d.scale.setScalar(lampModel.scale)
      d.updateMatrix()
      combined.copy(d.matrix).multiply(lampModel.nodeMatrix)
      lampRef.current.setMatrixAt(i, combined)
    })
    lampRef.current.instanceMatrix.needsUpdate = true
    lampModel.geometry.setAttribute('aGround', new THREE.InstancedBufferAttribute(aGround, 2))
    invalidate()   // demand-mode: paint the just-filled matrices
  }, [allLamps, lampModel, aGround, invalidate])

  // ── Instance transforms — glow orbs (tight glass halo) ────────────────────
  useEffect(() => {
    if (!glowRef.current) return
    const d = new THREE.Object3D()
    allLamps.forEach((lamp, i) => {
      d.position.set(lamp.x, GLOW_Y, lamp.z)
      d.rotation.set(0, 0, 0)
      d.scale.setScalar(glowRadius)   // the tight glass halo, sized by the quality profile
      d.updateMatrix()
      glowRef.current.setMatrixAt(i, d.matrix)
    })
    glowRef.current.instanceMatrix.needsUpdate = true
    glowGeo.setAttribute('aGround', new THREE.InstancedBufferAttribute(aGround, 2))
    invalidate()
  }, [allLamps, lampModel, aGround, glowGeo, invalidate, glowRadius, GLOW_Y])

  // ── Instance transforms — sharp bulb dot ───────────────────────────────────
  useEffect(() => {
    if (!bulbRef.current) return
    const d = new THREE.Object3D()
    allLamps.forEach((lamp, i) => {
      d.position.set(lamp.x, GLOW_Y, lamp.z)
      d.rotation.set(0, 0, 0)
      d.scale.setScalar(BULB_RADIUS)
      d.updateMatrix()
      bulbRef.current.setMatrixAt(i, d.matrix)
    })
    bulbRef.current.instanceMatrix.needsUpdate = true
    bulbGeo.setAttribute('aGround', new THREE.InstancedBufferAttribute(aGround, 2))
    invalidate()
  }, [allLamps, lampModel, aGround, bulbGeo, invalidate, GLOW_Y])

  // ── Instance transforms — the soft GLOW around each lantern (restored 2026-09-26: haloMat was
  //    defined and never mounted). Depth-TESTED (three's default), so what stands in front hides it.
  useEffect(() => {
    if (!haloRef.current) return
    const d = new THREE.Object3D()
    allLamps.forEach((lamp, i) => {
      d.position.set(lamp.x, GLOW_Y, lamp.z)
      d.rotation.set(0, 0, 0)
      d.scale.setScalar(1)   // size is the Glow size knob (uHaloSize), not the instance
      d.updateMatrix()
      haloRef.current.setMatrixAt(i, d.matrix)
    })
    haloRef.current.instanceMatrix.needsUpdate = true
    haloGeo.setAttribute('aGround', new THREE.InstancedBufferAttribute(aGround, 2))
    invalidate()
  }, [allLamps, lampModel, aGround, haloGeo, invalidate, GLOW_Y])

  // (Lamp base-ring instance transforms removed — the contact shadow is baked
  // into the ground FX map now, not a per-lamp disc.)

  // ── Per-frame time-of-day animation ─────────────────────────────────────────
  // Transition starts at golden hour (sunAlt=0.15) for a gradual warm-up
  useFrame(() => {
    const { sunAltitude } = getLightingPhase()

    sunAltUniform.current.value = sunAltitude

    // ⭐ DAYLIGHT DROWNS THE LAMPS (Jacob, 2026-09-26: "the multiplier is the more realistic effect"). The keys set
    // every value; this ramp scales them by how dark it is — 0 at sunAlt ≥ 0.15, 1 at ≤ −0.3 — so a lamp keyed on at
    // noon is simply outshone by the sun. (Removed and restored the same evening: it is not an editorial limit.)
    const t = Math.min(1, Math.max(0, (0.15 - sunAltitude) / 0.45))
    // ⭐ EACH KNOB MOVES ONE THING (Jacob, 2026-09-26):
    //   Lantern › Bulb → glass panes + bulb dot + tiny orb · Lantern › Glow → the soft gradient
    //   Lamp Glow › Light pools → ground + walls · Pool radius → the wipe · Trees → the canopy
    // ▶ checks/claims-light-sources-are-live.mjs pins that no two knobs write the same uniform.
    const tod = useTimeOfDay.getState()
    const lant = resolveGroupAtMinute(
      lanternChannel || LANTERN_DEFAULT_CHANNEL, tod.getMinuteOfDay(),
      lanternChannel?.animated ? getTodSlotMinutes(tod.currentTime) : null,
      LANTERN_FIELD_KEYS, LANTERN_FLAT_DEFAULTS,
    )
    const lampCol = lant.color || LANTERN_FLAT_DEFAULTS.color
    if (lampCol !== appliedColor.current) {
      appliedColor.current = lampCol
      if (glowMatRef.current?.uniforms?.uColor) glowMatRef.current.uniforms.uColor.value.set(lampCol)
      haloMat.uniforms.uColor.value.set(lampCol)   // the soft glow is the same light
      if (lampMatRef.current?.emissive) lampMatRef.current.emissive.set(lampCol)
      _lampGlow.colorUniform.value.set(lampCol)    // the pools, trees and walls: the lantern's light, same colour
    }
    const bulb = t * Math.max(0, lant.intensity ?? 0)
    if (lampMatRef.current) lampMatRef.current.emissiveIntensity = bulb
    bulbOnUniform.current.value = Math.min(1, bulb)
    if (glowMatRef.current?.uniforms?.uIntensity) glowMatRef.current.uniforms.uIntensity.value = bulb
    bulbMat.opacity = Math.min(1, bulb)
    const glow = t * Math.max(0, lant.glow ?? 0)
    haloMat.uniforms.uIntensity.value = glow
    // Clamped to the control's own range — a Look saved when Glow size ran to 10 m reads as the largest glow now.
    haloMat.uniforms.uHaloSize.value = Math.min(GLOW_SIZE_FIELD.max, Math.max(GLOW_SIZE_FIELD.min, lant.glowSize ?? LANTERN_FLAT_DEFAULTS.glowSize))
    _lampGlow.poolUniform.value  = t * Math.max(0, _lampGlow.share.pool)
    _lampGlow.treesUniform.value = t * Math.max(0, _lampGlow.share.trees)
    _lampGlow.poolRadiusUniform.value = Math.min(1, Math.max(0, _lampGlow.share.radius))   // the ground's circle
    _lampGlow.poolCentreUniform.value = Math.max(0, _lampGlow.share.centre)                 // its dark centre, metres
    _lampGlow.poolCentreSoftUniform.value = Math.min(1, Math.max(0, _lampGlow.share.centreSoft))   // that centre's edge, 0 crisp … 1 soft
    _lampGlow.canopyWipeUniform.value = canopyWipe(_lampGlow.share.radius)
    if (glowRef.current) glowRef.current.visible = bulb > 0
    if (bulbRef.current) bulbRef.current.visible = bulb > 0
    if (haloRef.current) haloRef.current.visible = glow > 0
  })

  if (!lampModel) return null

  return (
    <group>
      {/* Lamp posts — the town's model, iron with a lit glass part (1 draw call) */}
      <instancedMesh
        ref={lampRef}
        args={[lampModel.geometry, lampModel.material, allLamps.length]}
        customDepthMaterial={lampDepthMat}
        castShadow
        frustumCulled={false}
      />

      {/* Ground light pool — MOVED into the ground itself (2026-06-22): baked
          additive ring map sampled by the grass + FadeMesh shaders so it
          drapes over terrain/curbs with no z-fighting. See bake-ground-ao.js
          (poolmap) + grassMaterial / BakedGround FadeMesh. The floating disc
          is retired. */}

      {/* Tight warm glass halo */}
      <instancedMesh
        ref={glowRef}
        args={[glowGeo, glowMat, allLamps.length]}
        frustumCulled={false}
      />

      {/* Soft glow around the lantern — Lantern › Glow */}
      <instancedMesh
        ref={haloRef}
        args={[haloGeo, haloMat, allLamps.length]}
        frustumCulled={false}
      />

      {/* Sharp bulb dot at the lantern's bulb position */}
      <instancedMesh
        ref={bulbRef}
        args={[bulbGeo, bulbMat, allLamps.length]}
        frustumCulled={false}
      />

      {/* Ground light pool + lamp contact shadow — both baked into the ground
          FX map (R = pool, G = shadow) and sampled by the ground shaders. No
          floating discs. See bake-ground-ao.js + BakedGround / grassMaterial. */}

    </group>
  )
}

export default StreetLights
