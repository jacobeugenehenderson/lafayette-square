import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useSkyState from '../hooks/useSkyState'
import SunCalc from 'suncalc'
import { LATITUDE, LONGITUDE } from './StageSky'
import { archState, useArchState } from './StageApp.jsx'
import useCartographStore from '../cartograph/stores/useCartographStore.js'

// NPS catenary equation converted to meters:
const A = 211.5
const B = 20.96
const C = 0.03292

const PEAK_HEIGHT = A - B
const HALF_SPAN = Math.acosh(A / B) / C

// Scratch vectors for per-frame uplight world-space transforms (avoid GC).
const _upPos = new THREE.Vector3()
const _upTarget = new THREE.Vector3()

// Computed each frame by GatewayArch and read by GroundDisc — both feet's
// live world positions, used for the floor wash light pools on the disc.
// Sibling components, sharing through module scope avoids prop drilling
// through R3F. One-frame lag in worst-case useFrame ordering is invisible.
const archFootWorld = {
  L: new THREE.Vector3(),
  R: new THREE.Vector3(),
}

const BASE_RADIUS = 10.0   // thickened from 6 for heavier silhouette
const TOP_RADIUS = 4.0     // thickened from 2

const TRI_ANGLES = [
  Math.PI / 2,
  Math.PI / 2 + 2 * Math.PI / 3,
  Math.PI / 2 + 4 * Math.PI / 3,
]

function createArchGeometry(curveSegs = 120) {
  const positions = []
  const curveParams = []
  const edgeParams = []

  const rings = []
  for (let i = 0; i <= curveSegs; i++) {
    const t = i / curveSegs
    const x = -HALF_SPAN + 2 * HALF_SPAN * t
    const y = Math.max(0, A - B * Math.cosh(C * x))

    const dydx = -B * C * Math.sinh(C * x)
    const tangentLen = Math.sqrt(1 + dydx * dydx)
    const nx = -dydx / tangentLen
    const ny = 1 / tangentLen

    const hFrac = y / PEAK_HEIGHT
    const radius = BASE_RADIUS + (TOP_RADIUS - BASE_RADIUS) * hFrac

    const corners = TRI_ANGLES.map(theta => {
      const cosT = Math.cos(theta)
      const sinT = Math.sin(theta)
      return [
        x + nx * cosT * radius,
        y + ny * cosT * radius,
        sinT * radius
      ]
    })

    rings.push({ corners, t })
  }

  for (let face = 0; face < 3; face++) {
    const next = (face + 1) % 3
    for (let i = 0; i < curveSegs; i++) {
      const a = rings[i].corners[face]
      const b = rings[i].corners[next]
      const c = rings[i + 1].corners[face]
      const d = rings[i + 1].corners[next]
      const t0 = rings[i].t
      const t1 = rings[i + 1].t

      positions.push(...a, ...b, ...c, ...c, ...b, ...d)
      curveParams.push(t0, t0, t1, t1, t0, t1)
      edgeParams.push(0, 1, 0, 0, 1, 1)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('aCurveParam', new THREE.Float32BufferAttribute(curveParams, 1))
  geo.setAttribute('aEdge', new THREE.Float32BufferAttribute(edgeParams, 1))
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

// Arch position/scale/rotation and the ground disc radius/fade all live in
// archState (authored from StagePanel's Arch & Horizon section).

export default function GatewayArch() {
  const geometry = useMemo(() => createArchGeometry(), [])
  const meshRef = useRef()
  const shaderRef = useRef(null)

  const material = useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({
      color: '#c8c8d0',
      transparent: true,
      depthWrite: true,
    })

    mat.customProgramCacheKey = () => 'gateway-arch-v4'
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSunDir = { value: new THREE.Vector3(0, 0.3, 1) }
      shader.uniforms.uDayFactor = { value: 1.0 }
      shader.uniforms.uGlintPos = { value: 0.5 }
      shader.uniforms.uGlintBright = { value: 1.0 }
      shader.uniforms.uSkyBright = { value: 0.5 }
      shader.uniforms.uHorizonColor = { value: new THREE.Color('#9dc5e0') }
      shader.uniforms.uGroundColor = { value: new THREE.Color('#3a4a3a') }
      shader.uniforms.uGroundY = { value: 0.0 }
      shader.uniforms.uFadeBelow = { value: 30.0 }
      // Cross-aimed uplights (L and R). Position + direction recomputed
      // per frame in world space from arch transform; intensity/color/
      // cone/reach driven by archState. cosCone is precomputed each frame
      // to keep the fragment shader cheap.
      shader.uniforms.uUpL_pos = { value: new THREE.Vector3() }
      shader.uniforms.uUpL_dir = { value: new THREE.Vector3(0, 1, 0) }
      shader.uniforms.uUpL_color = { value: new THREE.Color('#ffd6a8') }
      shader.uniforms.uUpL_intensity = { value: 0.0 }
      shader.uniforms.uUpL_cosCone = { value: Math.cos(0.55) }
      shader.uniforms.uUpL_cosCenter = { value: Math.cos(0.55 * 0.3) }
      shader.uniforms.uUpL_reach = { value: 200.0 }
      shader.uniforms.uUpR_pos = { value: new THREE.Vector3() }
      shader.uniforms.uUpR_dir = { value: new THREE.Vector3(0, 1, 0) }
      shader.uniforms.uUpR_color = { value: new THREE.Color('#ffd6a8') }
      shader.uniforms.uUpR_intensity = { value: 0.0 }
      shader.uniforms.uUpR_cosCone = { value: Math.cos(0.55) }
      shader.uniforms.uUpR_cosCenter = { value: Math.cos(0.55 * 0.3) }
      shader.uniforms.uUpR_reach = { value: 200.0 }

      // Vertex
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         attribute float aCurveParam;
         attribute float aEdge;
         varying float vCurveParam;
         varying float vEdge;
         varying vec3 vArchWorld;
         varying vec3 vArchNormal;`
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vCurveParam = aCurveParam;
         vEdge = aEdge;
         vec4 archWP = modelMatrix * vec4(position, 1.0);
         vArchWorld = archWP.xyz;
         vArchNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);`
      )

      // Fragment: declare
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         uniform vec3 uSunDir;
         uniform float uDayFactor;
         uniform float uGlintPos;
         uniform float uGlintBright;
         uniform float uSkyBright;
         uniform vec3 uHorizonColor;
         uniform vec3 uGroundColor;
         uniform float uGroundY;
         uniform float uFadeBelow;
         uniform vec3 uUpL_pos;
         uniform vec3 uUpL_dir;
         uniform vec3 uUpL_color;
         uniform float uUpL_intensity;
         uniform float uUpL_cosCone;
         uniform float uUpL_cosCenter;
         uniform float uUpL_reach;
         uniform vec3 uUpR_pos;
         uniform vec3 uUpR_dir;
         uniform vec3 uUpR_color;
         uniform float uUpR_intensity;
         uniform float uUpR_cosCone;
         uniform float uUpR_cosCenter;
         uniform float uUpR_reach;
         varying float vCurveParam;
         varying float vEdge;
         varying vec3 vArchWorld;
         varying vec3 vArchNormal;`
      )

      // Panel seams + per-panel color variation
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         // Horizontal seams along the curve (~142 bands)
         float hPanelCount = 142.0;
         float hPanel = fract(vCurveParam * hPanelCount);
         float hSeam = smoothstep(0.0, 0.025, hPanel) * (1.0 - smoothstep(0.975, 1.0, hPanel));

         // Vertical seams: darken at triangle edges (where vEdge → 1.0)
         // This creates 3 visible vertical stripes running the length of the arch
         float vSeam = 1.0 - smoothstep(0.88, 0.96, vEdge) * 0.2;

         // Combined seam: multiply horizontal and vertical
         float seam = hSeam * vSeam;

         // Face index (0, 1, or 2) — each triangular face is a distinct surface
         float faceId = floor(vEdge * 2.99);
         // Panel ID combines horizontal position + face
         float panelId = floor(vCurveParam * hPanelCount) * 3.0 + faceId;
         float panelHash = fract(sin(panelId * 127.1) * 43758.5453);
         float panelHash2 = fract(sin(panelId * 311.7) * 43758.5453);
         float panelHash3 = fract(sin(panelId * 541.3) * 43758.5453);

         // Seams always visible
         float seamVis = 0.5 + 0.5 * uDayFactor;
         diffuseColor.rgb *= mix(1.0, mix(0.75, 1.0, seam), seamVis);

         // Per-panel color — brightness + warm/cool tint
         float panelBright = (panelHash - 0.5) * 0.08;
         vec3 panelTint = vec3(
           (panelHash2 - 0.5) * 0.04,
           (panelHash3 - 0.5) * 0.02,
           (panelHash - 0.5) * 0.03
         );
         float colorStrength = 1.2;
         diffuseColor.rgb += panelBright * colorStrength;
         diffuseColor.rgb += panelTint * colorStrength;
         diffuseColor.rgb = max(diffuseColor.rgb, vec3(0.05));`
      )

      // Post-base-color: our own lighting (no scene lights)
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>

         vec3 N = normalize(vArchNormal);

         // ── Directional light (replaces scene directional) ──
         float sunFacing = max(0.0, dot(N, uSunDir));
         // Day: warm directional. Night: very subtle cool fill
         float dayLight = sunFacing * 0.5 * uDayFactor;
         float nightLight = sunFacing * 0.06 * (1.0 - uDayFactor);
         vec3 dayColor = vec3(0.95, 0.90, 0.82);
         vec3 nightColor = vec3(0.5, 0.55, 0.7);

         // Ambient: tinted by sky color so arch blends into environment
         float ambientLevel = mix(0.12, 0.35, uDayFactor);
         float upness = dot(N, vec3(0.0, 1.0, 0.0)) * 0.5 + 0.5;
         vec3 skyTint = mix(uGroundColor, uHorizonColor, upness);
         vec3 ambient = mix(skyTint, vec3(1.0), 0.3) * ambientLevel;

         // ── Combine: multiply base color by lighting ──
         vec3 lighting = ambient + dayColor * dayLight + nightColor * nightLight;
         gl_FragColor.rgb *= lighting;

         // ── Edge glint — sharp, upper arch only ──
         float edgeMask = smoothstep(0.78, 1.0, vEdge);
         float topMask = smoothstep(0.0, 0.35, min(vCurveParam, 1.0 - vCurveParam));
         float glintD = vCurveParam - uGlintPos;
         float glintCore = exp(-glintD * glintD * 5000.0) * edgeMask * topMask;
         gl_FragColor.rgb += vec3(1.0, 0.97, 0.9) * glintCore * uGlintBright * 0.7;

         // ── Subtle depth on lower legs ──
         // Slight dim on the lower portion before the alpha fade kicks in,
         // so the legs read as receding rather than uniformly bright.
         float footFade = smoothstep(-20.0, 80.0, vArchWorld.y);
         gl_FragColor.rgb *= mix(0.85, 1.0, footFade);

         // ── Cross-aimed uplights (L and R) ──
         // Each fixture sits at a foot, beams across to the opposite leg.
         // Per-fragment: cone falloff from beam axis + exponential reach +
         // surface-facing test. Beam intersection mid-arch is automatic
         // from additive contributions; hot spot lands on the opposite leg
         // because that's where the cone axis hits.
         {
           vec3 toFragL = vArchWorld - uUpL_pos;
           float distL = length(toFragL);
           vec3 dirL = toFragL / max(distL, 0.001);
           float dotL = dot(dirL, uUpL_dir);
           float coneL = smoothstep(uUpL_cosCone, uUpL_cosCenter, dotL);
           float reachL = exp(-distL / max(uUpL_reach, 1.0));
           float faceL = max(0.0, dot(N, -dirL));
           gl_FragColor.rgb += uUpL_color * uUpL_intensity * coneL * reachL * faceL;

           vec3 toFragR = vArchWorld - uUpR_pos;
           float distR = length(toFragR);
           vec3 dirR = toFragR / max(distR, 0.001);
           float dotR = dot(dirR, uUpR_dir);
           float coneR = smoothstep(uUpR_cosCone, uUpR_cosCenter, dotR);
           float reachR = exp(-distR / max(uUpR_reach, 1.0));
           float faceR = max(0.0, dot(N, -dirR));
           gl_FragColor.rgb += uUpR_color * uUpR_intensity * coneR * reachR * faceR;
         }

         // ── Foot alpha fade ──
         // Full alpha at the ground plane (uGroundY); falls off linearly
         // to zero uFadeBelow meters beneath. Lets the arch be enlarged so
         // feet penetrate the ground without a hard intersection line.
         float footAlpha = smoothstep(uGroundY - uFadeBelow, uGroundY, vArchWorld.y);
         gl_FragColor.a *= footAlpha;
`
      )

      shaderRef.current = shader
    }

    return mat
  }, [])

  useFrame(({ camera }) => {
    if (!meshRef.current) return
    const { sunAltitude } = useTimeOfDay.getState().getLightingPhase()
    const { currentTime } = useTimeOfDay.getState()
    const isNight = sunAltitude < -0.12
    const t = Math.max(0, Math.min(1, (sunAltitude + 0.12) / 0.42))
    const day = t * t * (3 - 2 * t)

    meshRef.current.rotation.y = archState.archRotation
    // Pivot at the apex (keystone): scale grows feet outward+downward while
    // the archstone holds its world-Y position. archYOffset then translates
    // the apex directly, which matches how operators think about anchoring
    // the hero subject.
    const apexY = archState.archYOffset + PEAK_HEIGHT * (1 - archState.archScale)
    meshRef.current.position.set(
      archState.archDistance * archState.archBearingX,
      apexY,
      archState.archDistance * archState.archBearingZ,
    )
    meshRef.current.scale.setScalar(archState.archScale)

    if (shaderRef.current) {
      shaderRef.current.uniforms.uDayFactor.value = day

      const hc = useSkyState.getState().horizonColor
      shaderRef.current.uniforms.uHorizonColor.value.copy(hc)
      const gc = shaderRef.current.uniforms.uGroundColor.value
      gc.set(hc.r * 0.35 + 0.02, hc.g * 0.35 + 0.03, hc.b * 0.30)

      // Sky brightness — drives how bright the arch appears (never fully dark)
      shaderRef.current.uniforms.uSkyBright.value = 0.25 + day * 0.75

      // Foot alpha fade depth (meters below world y=0).
      shaderRef.current.uniforms.uFadeBelow.value = archState.archFootFade

      // Cross-aimed uplights — recompute world-space position + aim every
      // frame from the current arch transform. Each fixture sits at its
      // foot; aim target is a point ~60% up the OPPOSITE leg so beams
      // cross mid-arch and the hot spot lands on the opposite leg.
      meshRef.current.updateMatrixWorld()
      const mw = meshRef.current.matrixWorld

      _upPos.set(-HALF_SPAN, 0, 0).applyMatrix4(mw)
      shaderRef.current.uniforms.uUpL_pos.value.copy(_upPos)
      archFootWorld.L.copy(_upPos)
      _upTarget.set(HALF_SPAN * 0.5, PEAK_HEIGHT * 0.6, 0).applyMatrix4(mw)
      shaderRef.current.uniforms.uUpL_dir.value.copy(_upTarget).sub(_upPos).normalize()
      shaderRef.current.uniforms.uUpL_color.value.set(archState.archUplightL_color)
      shaderRef.current.uniforms.uUpL_intensity.value = archState.archUplightL_intensity
      shaderRef.current.uniforms.uUpL_cosCone.value = Math.cos(archState.archUplightL_cone)
      shaderRef.current.uniforms.uUpL_cosCenter.value = Math.cos(archState.archUplightL_cone * 0.3)
      shaderRef.current.uniforms.uUpL_reach.value = archState.archUplightL_reach

      _upPos.set(HALF_SPAN, 0, 0).applyMatrix4(mw)
      shaderRef.current.uniforms.uUpR_pos.value.copy(_upPos)
      archFootWorld.R.copy(_upPos)
      _upTarget.set(-HALF_SPAN * 0.5, PEAK_HEIGHT * 0.6, 0).applyMatrix4(mw)
      shaderRef.current.uniforms.uUpR_dir.value.copy(_upTarget).sub(_upPos).normalize()
      shaderRef.current.uniforms.uUpR_color.value.set(archState.archUplightR_color)
      shaderRef.current.uniforms.uUpR_intensity.value = archState.archUplightR_intensity
      shaderRef.current.uniforms.uUpR_cosCone.value = Math.cos(archState.archUplightR_cone)
      shaderRef.current.uniforms.uUpR_cosCenter.value = Math.cos(archState.archUplightR_cone * 0.3)
      shaderRef.current.uniforms.uUpR_reach.value = archState.archUplightR_reach

      // Compute sun and moon as direction vectors, then blend the vectors
      // (blending angles causes jumps when they're far apart)
      const sunPos = SunCalc.getPosition(currentTime, LATITUDE, LONGITUDE)
      const moonPos = SunCalc.getMoonPosition(currentTime, LATITUDE, LONGITUDE)
      const sunAz = sunPos.azimuth + Math.PI
      const sunAlt = sunPos.altitude
      const moonAz = moonPos.azimuth + Math.PI
      const moonAlt = Math.max(0.05, moonPos.altitude)

      const sunDirX = Math.cos(sunAlt) * Math.sin(sunAz)
      const sunDirY = Math.sin(sunAlt)
      const sunDirZ = -Math.cos(sunAlt) * Math.cos(sunAz)
      const moonDirX = Math.cos(moonAlt) * Math.sin(moonAz)
      const moonDirY = Math.sin(moonAlt)
      const moonDirZ = -Math.cos(moonAlt) * Math.cos(moonAz)

      const blend = Math.max(0, Math.min(1, (sunAltitude + 0.2) / 0.4))
      let lx = sunDirX * blend + moonDirX * (1 - blend)
      let ly = sunDirY * blend + moonDirY * (1 - blend)
      let lz = sunDirZ * blend + moonDirZ * (1 - blend)
      const ll = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1
      lx /= ll; ly /= ll; lz /= ll

      shaderRef.current.uniforms.uSunDir.value.set(lx, ly, lz)

      // Glint position — use the blended direction
      const azimuth = Math.atan2(lx, -lz)
      const relAngle = azimuth - archState.archRotation
      const glintFromSun = 0.5 + Math.sin(relAngle) * 0.48
      const dx = camera.position.x - (-400)
      const dz = camera.position.z - 230
      const lateral = (dx * 0.358 + dz * 0.934) / 140
      const cameraShift = Math.max(-0.15, Math.min(0.15, lateral * 0.15))
      shaderRef.current.uniforms.uGlintPos.value = Math.max(0.20, Math.min(0.80, glintFromSun + cameraShift))

      // Glint brightness: fades smoothly as moon/sun approach horizon
      const moonFade = Math.max(0, Math.min(1, moonPos.altitude / 0.15))
      const sunFade = Math.max(0, Math.min(1, (sunAltitude + 0.1) / 0.3))
      const lightFade = Math.max(moonFade, sunFade)
      shaderRef.current.uniforms.uGlintBright.value = lightFade * 0.7
    }
  })

  return (
    <>
      <GroundDisc />
      <mesh
        ref={meshRef}
        geometry={geometry}
        material={material}
        frustumCulled={false}
      />
    </>
  )
}

// Flat-black plan-view silhouette for the Designer (cartograph non-Stage mode).
// Shares the catenary geometry with the Stage arch so the 2D shadow reads as
// "that's the arch from above" — matches the black-footprint language used by
// buildings/park in plan view.
export function DesignerArch() {
  const a = useArchState()
  const geometry = useMemo(() => createArchGeometry(), [])
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: '#000' }), [])
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[a.archDistance * a.archBearingX, 0, a.archDistance * a.archBearingZ]}
      rotation={[0, a.archRotation, 0]}
      scale={a.archScale}
      frustumCulled={false}
    />
  )
}

// The base-color disc shares its center with BakedGround by reading the
// same ground.json manifest — `stencil.center` is the canonical map
// centerpoint. Disc grows past the bake's radial fade and feathers softly
// so the edge reads as horizon, not a ring.
function GroundDisc() {
  const a = useArchState()
  const matRef = useRef(null)
  const meshRef = useRef(null)
  const activeLookId = useCartographStore(s => s.activeLookId)
  const bakeLastMs = useCartographStore(s => s.bakeLastMs)
  const [center, setCenter] = useState([0, 0])

  useEffect(() => {
    if (!activeLookId) return
    let cancelled = false
    const t = bakeLastMs ?? Date.now()
    fetch(`/baked/${activeLookId}/ground.json?t=${t}`)
      .then(r => r.ok ? r.json() : null)
      .then(m => {
        if (!cancelled && m?.stencil?.center) {
          setCenter([m.stencil.center[0], m.stencil.center[1]])
        }
      })
      .catch(() => { /* keep origin fallback */ })
    return () => { cancelled = true }
  }, [activeLookId, bakeLastMs])

  const material = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uInner: { value: a.horizonFadeInner },
        uOuter: { value: a.horizonFadeOuter },
        uColor: { value: new THREE.Color('#3a4a3a') },
      },
      vertexShader: `
        varying vec2 vLocal;
        void main() {
          vLocal = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uInner;
        uniform float uOuter;
        uniform vec3 uColor;
        varying vec2 vLocal;
        // Hash-based value noise — cheap edge wobble so the perimeter
        // dissolves into atmosphere instead of reading as a clean circle.
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float vnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }
        void main() {
          float r = length(vLocal);
          // Wobble radius by low-freq noise scaled to the feather width so
          // the edge breaks up gently across the band, not on the disc face.
          float band = max(1.0, uOuter - uInner);
          float wobble = (vnoise(vLocal * 9.0) - 0.5) * band * 0.35;
          float t = smoothstep(uInner, uOuter, r + wobble);
          // Re-apply smoothstep on the inverse to soften both shoulders —
          // gives a much fuzzier, atmospheric falloff than a linear ease.
          float alpha = smoothstep(0.0, 1.0, 1.0 - t);
          if (alpha <= 0.001) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    })
    matRef.current = m
    return m
  }, [])

  useFrame(() => {
    if (matRef.current) {
      const hc = useSkyState.getState().horizonColor
      matRef.current.uniforms.uColor.value.set(
        hc.r * 0.35 + 0.02,
        hc.g * 0.35 + 0.03,
        hc.b * 0.30,
      )
      // Geometry is a unit circle; vLocal in the shader is 0..1 in object
      // space. Convert authored world-unit fade radii to that space using
      // the live mesh scale.
      const r = Math.max(1, archState.horizonRadius)
      matRef.current.uniforms.uInner.value = archState.horizonFadeInner / r
      matRef.current.uniforms.uOuter.value = archState.horizonFadeOuter / r
    }
    if (meshRef.current) {
      meshRef.current.position.set(center[0], -0.05, center[1])
      // Geometry is a unit circle; scale to live archState.horizonRadius
      // so HMR / React-state-stuck values can't pin the disc to a stale
      // size. Reads the live ref every frame.
      const r = archState.horizonRadius
      meshRef.current.scale.set(r, r, 1)
    }
  })

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      material={material}
      renderOrder={-100}
    >
      <circleGeometry args={[1, 128]} />
    </mesh>
  )
}
