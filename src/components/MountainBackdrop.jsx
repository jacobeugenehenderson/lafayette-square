/**
 * MountainBackdrop — the landscape hero subject renderer (§10 THIRD kind).
 *
 * A backdrop mountain is neither an in-map object (a point to frame ON) nor a
 * decorative prop floated for framing — it's a MESH rendered behind everything,
 * standing at its TRUE geographic spot (a natural feature at a fixed place). It
 * consumes the two artifacts piece 1+2 produced:
 *
 *   1. the baked GLB + manifest  →  /baked/<look>/landscape/landscape.json
 *      (asset name + the geo-anchor `placement` defaults + `bounds`/`elevM`).
 *   2. the `landscape` scene channel (placement overrides + snowline + haze),
 *      resolved off the slab via `useSceneJson` (production) or the live
 *      cartograph store (Stage authoring, via `landscapeOverride`).
 *
 * Native materials, §10: the GLB ships one stock `MeshStandardMaterial`, so it
 * receives the scene's full TOD light rig (CelestialBodies sun/moon directional
 * + sky-gradient hemisphere fill) FOR FREE — alpenglow at golden hour, blue at
 * dusk, moonlit at night, no per-frame light wiring. We only `onBeforeCompile`
 * a snowline elevation band + a backdrop-only haze trim onto that stock
 * material (both reading piece-1 knobs); patching a stock material keeps three's
 * automatic log-depth chunk injection, so we sidestep the raw-ShaderMaterial
 * log-depth dance entirely (`feedback_raw_shadermaterial_needs_logdepth_chunks`).
 *
 * ONE shared consumer, like GatewayArch: production (Scene.jsx) mounts it with
 * no props (reads the baked scene.json); Stage (CartographApp generic scene)
 * passes `landscapeOverride` off the live store for instant retint.
 *
 * Renders NOTHING when the look has no landscape manifest — a generic, no-LS
 * rule (LS ships no landscape → nothing mounts).
 *
 * Doctrine: §10 landscape subject kind · project_authoring_is_live_production_is_static ·
 * feedback-no-hardcoded-ramps-use-knobs · project_slab_is_the_instance_identity.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import useSkyState from '../hooks/useSkyState'
import { INSTANCE } from '../instance.js'
import { useSceneJson } from '../lib/useSceneJson.js'
import { LANDSCAPE_FLAT_DEFAULTS } from '../cartograph/skyLightChannels.js'

const LANDSCAPE_DEFAULT_CHANNEL = Object.freeze({ values: { ...LANDSCAPE_FLAT_DEFAULTS } })
const PLACEMENT_KEYS = ['bearingX', 'bearingZ', 'distance', 'scale', 'rotation', 'yOffset']

function resolveLookId(propLookId) {
  if (propLookId) return propLookId
  if (typeof window === 'undefined') return INSTANCE.lookId
  const m = window.location.search.match(/look=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : INSTANCE.lookId
}

// Dev busts the browser HTTP cache so a re-bake shows immediately (same footgun
// useSceneJson guards); prod caches normally and busts on bakeLastMs.
const _fetchOpts = import.meta.env.DEV ? { cache: 'no-store' } : undefined
function cacheBust(bakeLastMs) {
  return bakeLastMs ?? (import.meta.env.MODE || 'prod')
}

export default function MountainBackdrop({ lookId, bakeLastMs, landscapeOverride }) {
  const resolvedLookId = resolveLookId(lookId)
  const meshRef = useRef()
  const shaderRef = useRef(null)
  const scene = useSceneJson(resolvedLookId, bakeLastMs)

  // Override (Stage live store) > baked scene channel > flat defaults — the
  // exact precedence GatewayArch uses for arch/horizon.
  const channel = (landscapeOverride ?? scene?.landscape ?? LANDSCAPE_DEFAULT_CHANNEL).values

  // 1. Manifest fetch — asset + geo-anchor placement. Absent → the look has no
  //    landscape → we render nothing.
  const [manifest, setManifest] = useState(null)
  useEffect(() => {
    let cancelled = false
    const t = cacheBust(bakeLastMs)
    fetch(`${import.meta.env.BASE_URL}baked/${resolvedLookId}/landscape/landscape.json?t=${t}`, _fetchOpts)
      .then(r => (r.ok ? r.json() : null))
      .then(m => { if (!cancelled) setManifest(m) })
      .catch(() => { if (!cancelled) setManifest(null) })
    return () => { cancelled = true }
  }, [resolvedLookId, bakeLastMs])

  // 2. The patched stock PBR material (built once). Native MeshStandardMaterial
  //    → auto TOD lighting; onBeforeCompile injects the snowline band + haze.
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: '#ffffff', metalness: 0.0, roughness: 1.0,
    })
    mat.customProgramCacheKey = () => 'mountain-backdrop-v1'
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSnowline    = { value: LANDSCAPE_FLAT_DEFAULTS.snowline }
      shader.uniforms.uSnowSoft    = { value: LANDSCAPE_FLAT_DEFAULTS.snowSoftness }
      shader.uniforms.uSnowColor   = { value: new THREE.Color(LANDSCAPE_FLAT_DEFAULTS.snowColor) }
      shader.uniforms.uRockColor   = { value: new THREE.Color(LANDSCAPE_FLAT_DEFAULTS.rockColor) }
      shader.uniforms.uScrubColor  = { value: new THREE.Color(LANDSCAPE_FLAT_DEFAULTS.scrubColor) }
      shader.uniforms.uElevMin     = { value: 0.0 }
      shader.uniforms.uElevMax     = { value: 2000.0 }
      shader.uniforms.uHaze        = { value: LANDSCAPE_FLAT_DEFAULTS.haze }
      shader.uniforms.uHazeColor   = { value: new THREE.Color(LANDSCAPE_FLAT_DEFAULTS.hazeColor) }
      shader.uniforms.uGroundY     = { value: 0.0 }
      shader.uniforms.uReliefH     = { value: 1500.0 }

      // Vertex: carry the mesh-LOCAL elevation (position.y = metres ASL, the OBJ
      // is real-metre Y-up) so the snowline band keys off true elevation, plus
      // world height for the haze height-fade.
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         varying float vElevation;
         varying float vWorldY;`
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vElevation = position.y;
         vWorldY = (modelMatrix * vec4(transformed, 1.0)).y;`
      )

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         uniform float uSnowline;
         uniform float uSnowSoft;
         uniform vec3  uSnowColor;
         uniform vec3  uRockColor;
         uniform vec3  uScrubColor;
         uniform float uElevMin;
         uniform float uElevMax;
         uniform float uHaze;
         uniform vec3  uHazeColor;
         uniform float uGroundY;
         uniform float uReliefH;
         varying float vElevation;
         varying float vWorldY;`
      )

      // Elevation banding — a KNOB ramp (no hardcoded absolute elevations):
      // scrub (valley) → rock (flanks) → snow (above snowline). The scrub→rock
      // midpoint is derived from the mesh's real elevation range so it scales
      // with any range; only the snow transition is an explicit operator knob.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         float scrubMid = mix(uElevMin, uSnowline, 0.5);
         float tScrub = smoothstep(uElevMin, scrubMid, vElevation);
         vec3  lower  = mix(uScrubColor, uRockColor, tScrub);
         float tSnow  = smoothstep(uSnowline - uSnowSoft, uSnowline + uSnowSoft, vElevation);
         diffuseColor.rgb = mix(lower, uSnowColor, tSnow);`
      )

      // Backdrop-only atmospheric perspective — thicker with view distance,
      // thinner up high so peaks poke through the haze. Independent of the
      // hood's FogExp2 (that rides the `mist` channel); this is the range's own
      // trim knob. vViewPosition is the stock MeshStandardMaterial view-space
      // varying → its length is the camera distance.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
         float dist = length(vViewPosition);
         float distHaze = smoothstep(1500.0, 14000.0, dist);
         float heightFade = 1.0 - clamp((vWorldY - uGroundY) / max(uReliefH, 1.0), 0.0, 1.0);
         float hazeAmt = clamp(uHaze * distHaze * mix(0.35, 1.0, heightFade), 0.0, 1.0);
         gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeColor, hazeAmt);`
      )

      shaderRef.current = shader
    }
    return mat
  }, [])

  // 3. Load the GLB once the manifest names the asset. Raw GLTFLoader (the
  //    piece-3 loader the bake validated against); the GLB is uncompressed
  //    (POSITION+NORMAL+u32 indices) so no meshopt/draco decoder is needed.
  const [geometry, setGeometry] = useState(null)
  useEffect(() => {
    if (!manifest?.asset) return
    let cancelled = false
    const t = cacheBust(bakeLastMs)
    const url = `${import.meta.env.BASE_URL}baked/${resolvedLookId}/landscape/${manifest.asset}?t=${t}`
    new GLTFLoader().load(
      url,
      (gltf) => {
        if (cancelled) return
        let geo = null
        gltf.scene.traverse(o => { if (o.isMesh && !geo) geo = o.geometry })
        if (geo) {
          geo.computeBoundingSphere()
          setGeometry(geo)
        }
      },
      undefined,
      (err) => console.warn('[MountainBackdrop] GLB load failed:', err),
    )
    return () => { cancelled = true }
  }, [manifest, resolvedLookId, bakeLastMs])

  // 4. Resolved placement (§0.0: geo-anchor DEFAULT → operator override). The
  //    manifest's placement is the true geographic anchor; a channel value only
  //    overrides when the operator has moved it OFF the flat default (an
  //    unauthored channel is all flat defaults → leaves the geo-anchor intact,
  //    so the range never silently jumps off its real spot).
  const placement = useMemo(() => {
    const p = manifest?.placement || {}
    const out = {}
    for (const k of PLACEMENT_KEYS) {
      const c = channel[k]
      const flat = LANDSCAPE_FLAT_DEFAULTS[k]
      out[k] = (c !== undefined && c !== flat) ? c : (p[k] ?? flat)
    }
    return out
  }, [manifest, channel])

  // Push manifest/knob-derived uniforms whenever they change (cheap; the
  // per-frame useFrame below only touches the TOD-driven haze tint).
  useEffect(() => {
    const s = shaderRef.current
    if (!s) return
    s.uniforms.uSnowline.value  = channel.snowline ?? LANDSCAPE_FLAT_DEFAULTS.snowline
    s.uniforms.uSnowSoft.value  = channel.snowSoftness ?? LANDSCAPE_FLAT_DEFAULTS.snowSoftness
    s.uniforms.uSnowColor.value.set(channel.snowColor ?? LANDSCAPE_FLAT_DEFAULTS.snowColor)
    s.uniforms.uRockColor.value.set(channel.rockColor ?? LANDSCAPE_FLAT_DEFAULTS.rockColor)
    s.uniforms.uScrubColor.value.set(channel.scrubColor ?? LANDSCAPE_FLAT_DEFAULTS.scrubColor)
    s.uniforms.uHaze.value      = channel.haze ?? LANDSCAPE_FLAT_DEFAULTS.haze
    if (manifest?.elevM) {
      s.uniforms.uElevMin.value = manifest.elevM.min
      s.uniforms.uElevMax.value = manifest.elevM.max
      // Haze is thickest at the range base and thins over the local relief.
      s.uniforms.uGroundY.value = manifest.elevM.min * placement.scale + placement.yOffset
      s.uniforms.uReliefH.value = Math.max(1, (manifest.elevM.max - manifest.elevM.min) * placement.scale)
    }
  }, [channel, manifest, placement, geometry])

  // Per-frame: the haze tint takes the time of day for free by leaning the
  // authored hazeColor toward the live sky horizon (warm at golden hour, blue
  // at dusk) — the backdrop's atmospheric perspective breathes with the sky
  // without a bespoke TOD ramp.
  const _knobHaze = useMemo(() => new THREE.Color(), [])
  useFrame(() => {
    const s = shaderRef.current
    if (!s) return
    _knobHaze.set(channel.hazeColor ?? LANDSCAPE_FLAT_DEFAULTS.hazeColor)
    const hc = useSkyState.getState().horizonColor
    s.uniforms.uHazeColor.value.copy(_knobHaze).lerp(hc, 0.5)
  })

  if (!manifest || !geometry) return null

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      position={[
        placement.distance * placement.bearingX,
        placement.yOffset,
        placement.distance * placement.bearingZ,
      ]}
      rotation={[0, placement.rotation, 0]}
      scale={placement.scale}
      frustumCulled={false}
    />
  )
}
