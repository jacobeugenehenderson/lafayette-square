import { useRef, useMemo, useEffect, useState, Suspense } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import SunCalc from 'suncalc'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useCamera from '../hooks/useCamera'
import useSkyState from '../hooks/useSkyState'
import { useSceneJson } from '../lib/useSceneJson.js'
import { resolveSkyAtMinute } from '../cartograph/skyGrid.js'
import { resolveGroupAtMinute, getTodSlotMinutes } from '../cartograph/animatedParam.js'
import {
  AMBIENT_FIELD_KEYS, AMBIENT_FLAT_DEFAULTS,
  HEMI_FIELD_KEYS, HEMI_FLAT_DEFAULTS,
  DIRSUN_FIELD_KEYS, DIRSUN_FLAT_DEFAULTS,
  DIRMOON_FIELD_KEYS, DIRMOON_FLAT_DEFAULTS,
  CONSTELLATIONS_FIELD_KEYS, CONSTELLATIONS_FLAT_DEFAULTS,
  STARS_FIELD_KEYS, STARS_FLAT_DEFAULTS,
  MILKYWAY_FIELD_KEYS, MILKYWAY_FLAT_DEFAULTS,
  SKY_GAIN_FIELD_KEYS, SKY_GAIN_FLAT_DEFAULTS,
} from '../cartograph/skyLightChannels.js'

// Inline-default channel envelopes used for the ~100ms first-paint window
// before scene.json resolves at mount. Same shape + values bake-scene.js
// would emit for an unauthored Look, so first-paint matches the baker's
// output — no flash, no dead `?? null` branch. Doctrine:
// project_hardwires_come_out_when_channels_install.
// Sky channel now stores per-Look overrides on top of kit-canonical anchor
// cards (see skyGrid.js). Empty list = pure procedural-canon mosaic.
const SKY_DEFAULT_CHANNEL            = { overrides: [] }
const AMBIENT_DEFAULT_CHANNEL        = { values: AMBIENT_FLAT_DEFAULTS }
const HEMI_DEFAULT_CHANNEL           = { values: HEMI_FLAT_DEFAULTS }
const DIRSUN_DEFAULT_CHANNEL         = { values: DIRSUN_FLAT_DEFAULTS }
const DIRMOON_DEFAULT_CHANNEL        = { values: DIRMOON_FLAT_DEFAULTS }
const CONSTELLATIONS_DEFAULT_CHANNEL = { values: CONSTELLATIONS_FLAT_DEFAULTS }
const STARS_DEFAULT_CHANNEL          = { values: STARS_FLAT_DEFAULTS }
const MILKYWAY_DEFAULT_CHANNEL       = { values: MILKYWAY_FLAT_DEFAULTS }
const SKY_GAIN_DEFAULT_CHANNEL       = { values: SKY_GAIN_FLAT_DEFAULTS }
import brightStars from '../data/bright_stars.json'
import constellationsData from '../data/planetarium/constellations.json'
import PlanetariumOverlay from './PlanetariumOverlay'
import R3FErrorBoundary from './R3FErrorBoundary'
import { bvToRGB } from '../lib/starColor'
import { INSTANCE } from '../instance.js'
import { bodyLights, celestialToPosition, LIGHT_RADIUS } from './celestialLights.js'
import { SKY_GRADIENT_GLSL } from './skyGradient.js'
import { onSceneStencil, getSceneStencil, shadowHalfExtent, shadowMetresPerTexel, SHADOW_MAP_SIZE } from './sceneStencilState'

// Look id resolution — same shape as BakedGround / useSceneJson callers.
// Production passes no `lookId`; Stage threads the operator's active Look.
function resolveLookId(propLookId) {
  if (propLookId) return propLookId
  if (typeof window === 'undefined') return INSTANCE.lookId
  const m = window.location.search.match(/look=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : INSTANCE.lookId
}

const LATITUDE = INSTANCE.geography.lat
const LONGITUDE = INSTANCE.geography.lon

// ⭐ LIGHT_RADIUS + celestialToPosition now live in `celestialLights.js` — the
// pure module the sky rig and `checks/claims-the-key-light-is-a-real-body.mjs`
// share, so the check sweeps the SAME derivation the scene renders from.
// ⭐ SAME ENERGY, DIFFERENT DISTRIBUTION. A directional light delivers
// intensity × max(0, N·L), which averaged over all surface orientations is 1/4;
// a hemisphere delivers ≈ intensity × 1 to an up-facing surface. So a hemisphere
// standing in for a directional carries 1/4 of its number to deliver the same
// light. ⛔ Derived, not dialled — the only number the fill swap introduces.
const HEMI_FOR_DIRECTIONAL = 0.25
const SUN_VISUAL_RADIUS = 50000 // visual orb — far enough to eliminate parallax
const MOON_RADIUS = 50000
export const SKY_RADIUS = 55000

// Pre-allocated vectors for lighting computation (avoids per-frame GC pressure)
const _sunLP = new THREE.Vector3()
const _sunVP = new THREE.Vector3()
const _moonP = new THREE.Vector3()
const _secP = new THREE.Vector3()
const _sunD = new THREE.Vector3()
// The KEY light's world direction — normalize(primary.lightPosition), i.e. the
// very position the <directionalLight> consumes. Sun by day, moon-blended at
// night, which is exactly why it is NOT `_sunD`: a consumer that lights off the
// sun at midnight lights from below the horizon while every mesh lights from the
// moon. ONE derivation of one physical fact — read it, never recompute it.
const _keyD = new THREE.Vector3()
const _moonD = new THREE.Vector3()
const _camFwd = new THREE.Vector3()
const _lc1 = new THREE.Color()
const _lc2 = new THREE.Color()

function lerpColor(color1, color2, t) {
  _lc1.set(color1)
  _lc2.set(color2)
  _lc1.lerp(_lc2, t)
  return '#' + _lc1.getHexString()
}

// Shadow map baking: only re-render when sun moves meaningfully.
// Avoids drawing 1,729 buildings into a 4K shadow map 60x/sec.
const _prevShadowPos = new THREE.Vector3()
// Camera-fitted shadow frustum scratch (module scope — no per-frame GC).
// ⛔ `_camFwd` above is already owned by the lighting code; this pass needs its
// own so a refit can never stomp a value mid-frame.
const _shadowFwd = new THREE.Vector3()
const _focus = new THREE.Vector3()
const _prevFocus = new THREE.Vector3(Infinity, Infinity, Infinity)
const _lightDir = new THREE.Vector3()
const _lightUp = new THREE.Vector3()
const _lightRight = new THREE.Vector3()
const _WORLD_UP = new THREE.Vector3(0, 1, 0)

// ⭐ `visualPosition` / `showOrb` / `orbColor` / `orbSize` were REMOVED 2026-09-20.
// They were computed in all four time-of-day branches and consumed by nothing —
// PrimaryOrb renders a light, and the visible sun and moon are drawn by
// GradientSky and <Moon> from their own real positions. Dead props that look like
// a feature are worse than no props: BRIEF-two-bodies-two-lights called the
// twilight `visualPosition: blendedLP` "the orb IS the lie", and the orb it
// described has not existed here for some time.
function PrimaryOrb({ lightPosition, color, intensity, intensityMulRef }) {
  const lightRef = useRef()

  // Disable automatic shadow updates — we'll trigger manually.
  // Delay disabling autoUpdate by a few frames so the shadow map renders
  // at least once with all buildings in the scene graph. The initial
  // useEffect can fire before LafayetteScene's 1,729 meshes commit,
  // leaving the shadow map empty and buildings fully lit by the
  // directional light until the next manual shadow update.
  // ── Shadow frustum, sized from the ACTIVE SCENE's disc ───────────────────
  // ⛔⛔ This used to be four hardcoded literals: ±900 with far 2400. ±900 is
  // LAFAYETTE SQUARE'S RADIUS (892 m) PLUS 8 m OF SLACK. huron's disc is
  // 3,539 m — 3.97× wider — so ~73% of the town fell outside the box, and
  // outside it three returns "lit" unconditionally. `CanaryScene.jsx` says it
  // in as many words: "sized for LS-scale ground … 1800 m frustum".
  //
  // ⭐ THE LIGHT DOES NOT MOVE. LIGHT_RADIUS also scales the visible sun/moon
  // orbs, so pushing the light out to clear a big town would change the look.
  // An ORTHOGRAPHIC shadow camera accepts a NEGATIVE near, so the depth slab
  // is simply made deep enough to contain the whole scene from where the light
  // already is — geometry "behind" the light at a low sun is still captured.
  //
  // ⛔ NO FALLBACK. No stencil = we do not know how big this scene is, so the
  // sun stops casting and says why. A silently wrong shadow box is exactly the
  // failure this whole bug was.
  const [stencil, setStencil] = useState(null)
  useEffect(() => onSceneStencil(setStencil), [])
  useEffect(() => {
    const light = lightRef.current
    if (!light) return
    if (!stencil) {
      // ⛔ SHADOWS OFF UNTIL THE SCENE'S SIZE IS KNOWN — no fallback, by design.
      light.castShadow = false
      // ⚠️ BUT DO NOT CRY WOLF ON STARTUP. `stencil` is null for the first frames
      // of EVERY normal load, until BakedGround fetches ground.json and publishes
      // it — so logging here immediately made an error-level line appear on every
      // healthy boot. A parity auditor read that line against a live
      // `castShadow === true` and reported the two as contradictory; they were not,
      // they were from different moments. An alarm that fires when nothing is wrong
      // costs more than no alarm: the next reader discounts it.
      // ⇒ Only shout if it is STILL missing after the bundle has had time to land.
      const t = setTimeout(() => {
        if (!getSceneStencil()) {
          console.error('[CelestialBodies] no scene stencil after 5s — sun shadows are OFF. '
            + 'ground.json#stencil is the source and nothing has published it; BakedGround '
            + 'may not be mounted in this view, or its slab fetch failed.')
        }
      }, 5000)
      return () => clearTimeout(t)
    }
    const half = shadowHalfExtent(stencil)
    if (half == null) return
    const depth = half + LIGHT_RADIUS + 1000
    const c = light.shadow.camera
    c.left = -half; c.right = half; c.top = half; c.bottom = -half
    c.near = -depth; c.far = depth
    c.updateProjectionMatrix()

    // ── Bias, in TEXELS and METRES — not in the literals LS was tuned with ──
    // ⛔ These shipped as `normalBias 0.15` / `bias -0.0001`, fixed numbers.
    // normalBias offsets the shadow sample along the surface normal in WORLD
    // units; it has to clear roughly one shadow texel or the surface shadows
    // itself in a sawtooth along the texel grid. 0.15 m is 0.30 of a texel at
    // LS's 0.495 m/texel — about right — but only 0.08 of a texel on huron's
    // 1.806 m, which is the jagged comb along every building edge.
    // `bias` is in NDC depth, so its WORLD meaning scales with the frustum
    // depth too; express it as a fixed metre offset and convert.
    const mPerTexel = shadowMetresPerTexel(stencil)
    light.shadow.normalBias = 1.0 * mPerTexel          // one texel
    light.shadow.bias = -(0.5 / (2 * depth))           // 0.5 m, in NDC depth

    light.castShadow = true
    light.shadow.needsUpdate = true
    townHalfRef.current = half
  }, [stencil])

  // ── CAMERA-FITTED FRUSTUM — spend the texels where the operator is looking ─
  // ⛔ Sizing the box to the whole disc is correct but ruinous: huron's 7.4 km
  // over 4096² is 1.806 m/texel, so every shadow edge stair-steps in ~1.8 m
  // blocks — a fifth of a building. The operator never sees 7.4 km at once.
  // ⭐ So the box tracks the camera's ground focus and covers only what is in
  // shot, clamped to the town. Texel density stops depending on the TOWN and
  // starts depending on the SHOT, which is the only thing that can be right on
  // a map of any size.
  // ⛔ TEXEL SNAPPING IS NOT OPTIONAL. A frustum that slides continuously makes
  // every shadow edge crawl and shimmer as the camera moves, which looks worse
  // than the blocks it replaces. The focus is quantised to whole texels along
  // the light's own axes so the sampling grid is stationary in world space.
  const camera = useThree(s => s.camera)
  const townHalfRef = useRef(null)
  const fitHalfRef = useRef(null)
  useFrame(() => {
    const light = lightRef.current
    const townHalf = townHalfRef.current
    if (!light || !light.castShadow || townHalf == null) return

    // Ground point the camera is looking at (ray → y=0), else straight below.
    camera.getWorldDirection(_shadowFwd)
    const t = Math.abs(_shadowFwd.y) > 1e-4 ? -camera.position.y / _shadowFwd.y : -1
    if (t > 0) _focus.copy(camera.position).addScaledVector(_shadowFwd, t)
    else _focus.set(camera.position.x, 0, camera.position.z)

    // How much ground is in shot. Perspective: grows with distance. Ortho: the
    // camera's own half-height IS the answer, and it is exact.
    const dist = camera.position.distanceTo(_focus)
    const seen = camera.isOrthographicCamera
      ? (camera.top - camera.bottom) * 0.5 / (camera.zoom || 1)
      : dist * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5))
    // 1.6× so shadows CAST FROM OFFSCREEN still land in frame.
    const rawHalf = Math.min(townHalf, Math.max(60, seen * 1.6))

    // ⛔⛔ QUANTISE THE SIZE, NOT JUST THE POSITION — OR EVERY SHADOW EDGE FLASHES.
    // Texel-snapping the focus stops shadows CRAWLING as the box slides. It does
    // nothing if the box also RESIZES, because texel = 2*half/SHADOW_MAP_SIZE: the
    // moment `half` changes, the snapping grid changes pitch and EVERY shadow edge
    // in the scene jumps to a new grid at once. The first cut of this took `half`
    // straight from camera distance and re-fitted on any 5% drift, so flying the
    // hero path resized it continuously. Jacob, 2026-09-21: "the flash/flicker is
    // unpleasant." ⭐ Distinct from the frame rate — the parity probe measured the
    // camera as smooth and monotone (±5% per-frame step) at 8.5 FPS, so the flash
    // is not judder; it is the shadow grid changing pitch under a moving camera.
    // ⇒ Round UP to a power of two: the texel size then only changes when the shot
    // doubles, which is rare, and is a cut rather than a shimmer when it happens.
    // ⚠️ WITH HYSTERESIS, or a camera hovering on a boundary flaps between two
    // buckets every frame and the flash comes back worse. Grow as soon as the shot
    // needs it; shrink only when it has dropped well inside the smaller bucket.
    const pow2 = (v) => Math.pow(2, Math.ceil(Math.log2(Math.max(1, v))))
    let half = fitHalfRef.current
    if (half == null || rawHalf > half) half = Math.min(townHalf, pow2(rawHalf))
    else if (rawHalf < half * 0.45) half = Math.min(townHalf, pow2(rawHalf))

    // Light basis, for texel snapping.
    // ⛔ Take the direction from the CELESTIAL position prop, never from
    // light.position — this pass MOVES light.position to re-centre the shadow
    // box, and React rewrites it from the prop on every TOD tick. Reading the
    // mutated value would make the sun's direction depend on where the camera
    // happened to be looking last frame.
    _lightDir.copy(lightPosition).normalize()
    _lightRight.crossVectors(_WORLD_UP, _lightDir)
    if (_lightRight.lengthSq() < 1e-6) _lightRight.set(1, 0, 0)
    _lightRight.normalize()
    _lightUp.crossVectors(_lightDir, _lightRight).normalize()
    const texel = (2 * half) / SHADOW_MAP_SIZE
    const snap = (v) => Math.round(v / texel) * texel
    const a = snap(_focus.dot(_lightRight))
    const b = snap(_focus.dot(_lightUp))
    const c0 = _focus.dot(_lightDir)
    _focus.copy(_lightRight).multiplyScalar(a)
      .addScaledVector(_lightUp, b)
      .addScaledVector(_lightDir, c0)

    // The bucket either changed or it did not; there is no 5% drift any more.
    const halfChanged = fitHalfRef.current !== half
    const moved = _focus.distanceToSquared(_prevFocus) > (texel * texel)
    if (!halfChanged && !moved) return

    fitHalfRef.current = half
    _prevFocus.copy(_focus)

    const cam = light.shadow.camera
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half
    const depth = townHalf + LIGHT_RADIUS + 1000
    cam.near = -depth; cam.far = depth
    cam.updateProjectionMatrix()
    // The light is directional: only its DIRECTION matters for shading, so the
    // shadow box may be re-centred on the focus without touching the look.
    light.target.position.copy(_focus)
    light.target.updateMatrixWorld()
    light.position.copy(_focus).addScaledVector(_lightDir, LIGHT_RADIUS)
    light.shadow.normalBias = 1.0 * texel
    light.shadow.bias = -(0.5 / (2 * depth))
    light.shadow.needsUpdate = true
  })

  const _framesSinceMountRef = useRef(0)
  useEffect(() => {
    _framesSinceMountRef.current = 0
  }, [])

  // Re-render shadow map only when light position shifts enough (~2° of sky movement)
  useFrame(() => {
    if (!lightRef.current) return

    // TOD-driven sun-light intensity multiplier (Sky&Light · Sun light).
    // Stage threads the operator's live dirSun channel via `dirSunOverride`;
    // production resolves from scene.json. Default 1.0 leaves today behavior.
    lightRef.current.intensity = intensity * (intensityMulRef?.current ?? 1)

    // Let autoUpdate run for a few frames so the shadow map captures
    // the full scene, then switch to manual updates.
    if (_framesSinceMountRef.current < 4) {
      _framesSinceMountRef.current++
      if (_framesSinceMountRef.current === 4) {
        lightRef.current.shadow.autoUpdate = false
        lightRef.current.shadow.needsUpdate = true
        _prevShadowPos.copy(lightPosition)
      }
      return
    }

    const dx = lightPosition.x - _prevShadowPos.x
    const dy = lightPosition.y - _prevShadowPos.y
    const dz = lightPosition.z - _prevShadowPos.z
    const dist2 = dx * dx + dy * dy + dz * dz
    // ~10m movement on a 600m radius ≈ 1° arc — tighter than before
    // so nighttime moon shadows stay accurate (moon moves slowly)
    if (dist2 > 100) {
      lightRef.current.shadow.needsUpdate = true
      _prevShadowPos.copy(lightPosition)
    }
  })

  return (
    <group>
      <directionalLight
        ref={lightRef}
        position={lightPosition.toArray()}
        intensity={intensity}
        color={color}
        castShadow
        shadow-mapSize-width={SHADOW_MAP_SIZE}
        shadow-mapSize-height={SHADOW_MAP_SIZE}
      />
    </group>
  )
}

// The body that is not currently the key: a real light at a real position, with
// no shadow map. See the mount site for why it casts nothing and carries no knob.
function CounterBodyLight({ lightPosition, color, intensity, intensityMulRef }) {
  const ref = useRef()
  useFrame(() => {
    if (ref.current) ref.current.intensity = intensity * (intensityMulRef?.current ?? 1)
  })
  return (
    <directionalLight
      ref={ref}
      position={lightPosition.toArray()}
      intensity={intensity}
      color={color}
    />
  )
}

// The stylistic FILL — the cool bounce opposite the key. ⛔ IT IS NOT A BODY, so
// like the night-fill floor it is a HEMISPHERE and not a directional: it has a
// job (lift the shadow side) and no business laying a reflection on water.
// ⭐⭐ THE RULE THIS COMPLETES, AND IT IS WORTH STATING ONCE: ONLY THE SUN AND THE
// MOON HAVE A SPECULAR LOBE. Every other light in this rig is irradiance-only.
// That is what makes a bright path on the water evidence of a real body instead
// of set dressing — and it is asserted by
// `checks/claims-the-key-light-is-a-real-body.mjs`.
// ⚠️ Its position used to swing to the ANTI-SUN, which on water would have been
// worse than the static lamp: a reflection sliding the WRONG WAY as the sun
// moved. The `position` prop is kept in the signature because callers still
// compute it and it still documents the intent; it no longer reaches a light.
function SecondaryOrb({ color, intensity, intensityMulRef }) {
  const ref = useRef()
  useFrame(() => {
    if (ref.current) ref.current.intensity = intensity * HEMI_FOR_DIRECTIONAL * (intensityMulRef?.current ?? 1)
  })
  return (
    <hemisphereLight
      ref={ref}
      color={color}
      groundColor="#2a2a33"
      intensity={intensity * HEMI_FOR_DIRECTIONAL}
    />
  )
}

function Moon({ position, phase, illumination, sunDirection, dayFactor, visible }) {
  const moonRef = useRef()
  const glowRef = useRef()
  const moonTexture = useTexture(`${import.meta.env.BASE_URL}textures/moon.jpg`)

  const moonMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        moonMap: { value: moonTexture },
        phase: { value: phase },
        dayFactor: { value: 0.0 },
        // Full 3D sun direction in billboard-local space (X=right, Y=up, Z=toward camera).
        // The Z component is critical: when the sun is angularly far from the moon
        // (crescent phases), Z is large and negative, creating a narrow crescent.
        // Without Z, the shader can't distinguish a crescent from a gibbous phase.
        sunDir3D: { value: new THREE.Vector3(1, 0, 0) },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D moonMap;
        uniform float phase;
        uniform float dayFactor;
        uniform vec3 sunDir3D;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        #define PI 3.14159265359
        void main() {
          vec2 uv = (vUv - 0.5) * 2.0;
          float dist = length(uv);
          float edgeWidth = fwidth(dist) * 1.5;
          float alpha = 1.0 - smoothstep(0.96 - edgeWidth, 0.96 + edgeWidth, dist);
          if (alpha < 0.01) discard;

          // Sphere normal at this pixel (hemisphere facing camera)
          float z = sqrt(1.0 - min(dist * dist, 1.0));
          vec3 normal = vec3(uv.x, uv.y, z);

          // True 3D sun direction in billboard space
          vec3 lightDir = normalize(sunDir3D);
          float NdotL = dot(normal, lightDir);

          // Wide soft terminator — real moon surface is rough (craters, regolith),
          // so the shadow boundary is gradual, not a hard knife-edge.
          float lit = smoothstep(-0.15, 0.15, NdotL);

          // Texture mapping (spherical projection for moon surface detail)
          float theta = atan(uv.x, z);
          float phi = asin(clamp(uv.y, -1.0, 1.0));
          vec2 texUv;
          texUv.x = (theta / PI) * 0.5 + 0.5;
          texUv.y = (phi / PI) + 0.5;
          vec3 texColor = texture2D(moonMap, texUv).rgb;

          // Limb darkening
          vec3 color = texColor * (0.85 + z * 0.15);

          // ── Luma-based alpha: bright highlands opaque, dark maria softer ───
          float luma = dot(color, vec3(0.299, 0.587, 0.114));
          float lumaAlpha = luma;  // linear — keeps lit crescent clearly visible

          // Crescent mask: lit side visible, shadow side fades out
          float litAlpha = alpha * mix(0.03, lumaAlpha, lit);

          // Overall transparency dial
          litAlpha *= mix(0.85, 0.50, dayFactor);

          // Soft horizon fade — moon emerges smoothly from behind the horizon.
          vec3 viewDir = normalize(vWorldPos - cameraPosition);
          float elevAngle = asin(viewDir.y);
          litAlpha *= smoothstep(-0.02, 0.008, elevAngle);
          if (litAlpha < 0.005) discard;

          gl_FragColor = vec4(color, litAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
    })
  }, [moonTexture, 5])

  const glowMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        glowColor: { value: new THREE.Color('#c8d8e8') },
        intensity: { value: illumination },
        dayFactor: { value: 0.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        uniform float intensity;
        uniform float dayFactor;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        void main() {
          vec2 uv = (vUv - 0.5) * 2.0;
          float dist = length(uv);
          float moonRadius = 0.25;
          float glow = 1.0 - smoothstep(moonRadius, 0.45, dist);
          glow = pow(glow, 3.0);
          glow *= smoothstep(0.15, moonRadius, dist);
          glow *= intensity * 0.01;
          // Suppress glow during daytime — the moon doesn't visibly glow against a bright sky
          glow *= (1.0 - dayFactor);
          // Soft horizon fade — match moon disc
          vec3 viewDir = normalize(vWorldPos - cameraPosition);
          float elevAngle = asin(viewDir.y);
          glow *= smoothstep(-0.02, 0.008, elevAngle);
          if (glow < 0.002) discard;
          gl_FragColor = vec4(glowColor, glow);
        }
      `,
      transparent: true,
      depthWrite: false,
    })
  }, [])

  useFrame(({ camera }) => {
    if (moonRef.current) {
      moonRef.current.quaternion.copy(camera.quaternion)
      moonRef.current.material.uniforms.phase.value = phase
      moonRef.current.material.uniforms.dayFactor.value = dayFactor

      // Compute sun direction in billboard-local space (camera-aligned XYZ).
      // X = camera right, Y = camera up, Z = camera forward (toward viewer).
      // The Z component is essential: for crescent phases the sun is angularly
      // far from the moon, so Z is large and negative (sun behind the moon
      // from the camera's POV). This makes NdotL negative for most of the
      // front-facing hemisphere, producing a thin crescent.
      if (sunDirection) {
        const camRight = _sunD.set(1, 0, 0).applyQuaternion(camera.quaternion)
        const camUp = _moonD.set(0, 1, 0).applyQuaternion(camera.quaternion)
        camera.getWorldDirection(_camFwd)
        const sx = sunDirection.dot(camRight)
        const sy = sunDirection.dot(camUp)
        // Negate: camFwd points INTO scene, but billboard +Z points TOWARD camera
        const sz = -sunDirection.dot(_camFwd)
        moonRef.current.material.uniforms.sunDir3D.value.set(sx, sy, sz)
      }
    }
    if (glowRef.current) {
      glowRef.current.quaternion.copy(camera.quaternion)
      glowRef.current.material.uniforms.intensity.value = illumination
      glowRef.current.material.uniforms.dayFactor.value = dayFactor
    }
  })

  if (!visible) return null

  // ~1.5° angular diameter (3× real moon — artistic but not overwhelming)
  const moonSize = 2 * MOON_RADIUS * Math.tan(1.5 * Math.PI / 360)
  const glowSize = moonSize * 6

  return (
    <group position={position.toArray()}>
      <mesh ref={glowRef} material={glowMaterial} renderOrder={1}>
        <planeGeometry args={[glowSize, glowSize]} />
      </mesh>
      <mesh ref={moonRef} material={moonMaterial} renderOrder={2}>
        <planeGeometry args={[moonSize, moonSize]} />
      </mesh>
    </group>
  )
}

// MilkyWaySphere — equirectangular Brunier panorama wrapped on a sphere
// just inside the sky dome. Sidereal rotation matches the bright-star
// renderer so the band rises/sets correctly. Opacity = milkyWay channel
// × nightFactor (only visible when sky is dark).
function MilkyWaySphere({ nightFactor, milkyWayChannel }) {
  const groupRef = useRef()
  const matRef   = useRef()
  const mwTexture = useTexture(`${import.meta.env.BASE_URL}textures/milky_way.jpg`)

  // Filtering: disable mipmaps + max anisotropy so the panorama stays
  // sharp at Hero/Street FOV (default LinearMipmapLinear blurs star
  // detail into mush). Equirectangular wrap + sRGB color space.
  useEffect(() => {
    mwTexture.wrapS = THREE.RepeatWrapping
    mwTexture.colorSpace = THREE.SRGBColorSpace
    mwTexture.minFilter = THREE.LinearFilter
    mwTexture.magFilter = THREE.LinearFilter
    mwTexture.generateMipmaps = false
    mwTexture.anisotropy = 16
    mwTexture.needsUpdate = true
  }, [mwTexture])

  // NormalBlending (not Additive) — the panorama IS the sky at night,
  // not "extra light on top of black sky." Additive over-saturated and
  // shifted hue (warm yellows + cool ambient → milky green).
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    map: mwTexture,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    opacity: 0,
    fog: false,  // sky elements are infinitely far — opt out of scene fog
  }), [mwTexture])

  // Sidereal spin + opacity per frame.
  useFrame(() => {
    const tod = useTimeOfDay.getState()
    const currentTime = tod.currentTime
    const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0)
    const daysSinceJ2000 = (currentTime.getTime() - J2000) / 86400000
    const GMST = (280.46061837 + 360.98564736629 * daysSinceJ2000) % 360
    const LST = ((GMST + LONGITUDE) % 360 + 360) % 360
    const lstRad = LST * (Math.PI / 180)
    if (groupRef.current) groupRef.current.children[0].rotation.y = -lstRad

    const slotMins = milkyWayChannel?.animated ? getTodSlotMinutes(currentTime) : null
    const mw = milkyWayChannel ? resolveGroupAtMinute(
      milkyWayChannel, tod.getMinuteOfDay(), slotMins,
      MILKYWAY_FIELD_KEYS, MILKYWAY_FLAT_DEFAULTS,
    ) : { value: 0 }
    matRef.current && (matRef.current.opacity = (mw.value || 0) * nightFactor)
  })

  // Outer group tilts the celestial pole to its actual altitude (latitude
  // above the northern horizon). Inner group spins around the pole.
  const latRad = LATITUDE * (Math.PI / 180)
  return (
    <group ref={groupRef} rotation-x={latRad - Math.PI / 2}>
      <group>
        <mesh renderOrder={-995}>
          <sphereGeometry args={[SKY_RADIUS - 200, 64, 32]} />
          <primitive object={material} ref={matRef} attach="material" />
        </mesh>
      </group>
    </group>
  )
}

function GradientSky({ sunAltitude, sunDirection, moonGlow, skyChannel, constellationsChannel, skyGainChannel, starsChannel, milkyWayChannel }) {
  const materialRef = useRef()
  // 4-band sky color authoring lives in `skyChannel` (operator's grid).
  // The legacy procedural keyframe ladder + JS-side weather color
  // modifiers that used to derive `colors.bands` here were dead post-
  // c333e50 — scene.json always carries an authored channel, and
  // first-paint uses SKY_DEFAULTS via the inline-default channel.
  // Shader-side weather effects (haze, overcast flattening, storm
  // darkening + desat) still apply via the uniforms set below.

  useFrame(() => {
    if (materialRef.current) {
      const u = materialRef.current.uniforms
      const planetariumActive = useCamera.getState().viewMode === 'planetarium'
      const dimFactor = planetariumActive ? 0.4 : 1.0
      // 4-band colors — resolve the operator's authored sky-grid
      // envelope at the current TOD minute and write the band tuple.
      // Shader-side weather (haze, overcast, storm) applies via uniforms
      // set further down; authored sky carries its own per-Look color
      // authoring at the band level.
      const tod = useTimeOfDay.getState()
      const slotMinutes = getTodSlotMinutes(tod.currentTime)
      const resolved = resolveSkyAtMinute(skyChannel, tod.getMinuteOfDay(), slotMinutes)
      // Sky Layer Gain — exposure scoped to the dome (bands + glow). 1.0 =
      // unchanged; LS authors a TOD curve dipping toward ~0.2 at Night so
      // deep night goes dark without touching lamps/stars. See skyLightChannels.
      const sg = resolveGroupAtMinute(
        skyGainChannel, tod.getMinuteOfDay(),
        skyGainChannel?.animated ? slotMinutes : null,
        SKY_GAIN_FIELD_KEYS, SKY_GAIN_FLAT_DEFAULTS,
      ).value
      u.uSkyGain.value = (sg == null ? 1 : sg)
      u.bandHorizon.value.setRGB(resolved.horizon[0], resolved.horizon[1], resolved.horizon[2]).multiplyScalar(dimFactor)
      u.bandLow.value.setRGB(resolved.low[0], resolved.low[1], resolved.low[2]).multiplyScalar(dimFactor)
      u.bandMid.value.setRGB(resolved.mid[0], resolved.mid[1], resolved.mid[2]).multiplyScalar(dimFactor)
      u.bandHigh.value.setRGB(resolved.high[0], resolved.high[1], resolved.high[2]).multiplyScalar(dimFactor)
      u.sunGlowColor.value.setRGB(resolved.sunGlow[0], resolved.sunGlow[1], resolved.sunGlow[2]).multiplyScalar(dimFactor)
      if (sunDirection) {
        u.sunDir.value.copy(sunDirection).normalize()
      }
      u.sunAlt.value = sunAltitude
      // Moon uniforms
      if (moonGlow) {
        u.moonDir.value.copy(moonGlow.dir).normalize()
        u.moonIllum.value = moonGlow.illumination
        u.moonVisible.value = moonGlow.altitude > 0 ? 1.0 : 0.0
      }
      // Push horizon color to shared state for portal background matching
      // Weather uniforms from useSkyState
      const sky = useSkyState.getState()
      u.uCloudCover.value = sky.cloudCover
      u.uStorminess.value = sky.storminess
      u.uTurbidity.value = sky.turbidity

      // ⭐ PUBLISH WHAT WAS RESOLVED. `horizonColor` has been pushed here for
      // years; the other three bands, the glow colour and turbidity now go with
      // it so the WATER can reflect THIS sky instead of re-resolving the
      // operator's grid and drifting from the dome at TOD boundaries.
      // ⛔ After the weather uniforms, deliberately: turbidity is written just
      // above, and publishing the pre-weather value would hand the lake a
      // different sky from the one overhead.
      sky.horizonColor.copy(u.bandHorizon.value)
      sky.skyBands.horizon.copy(u.bandHorizon.value)
      sky.skyBands.low.copy(u.bandLow.value)
      sky.skyBands.mid.copy(u.bandMid.value)
      sky.skyBands.high.copy(u.bandHigh.value)
      sky.skyBands.glow.copy(u.sunGlowColor.value)
      sky.skyBands.turbidity = u.uTurbidity.value
      u.uSunsetPotential.value = sky.sunsetPotential
      u.uBeautyBias.value = sky.beautyBias

      // Milky Way channel (on/off, resolver-lerped across TOD slots)
      if (milkyWayChannel) {
        const mw = resolveGroupAtMinute(
          milkyWayChannel, tod.getMinuteOfDay(),
          milkyWayChannel?.animated ? slotMinutes : null,
          MILKYWAY_FIELD_KEYS, MILKYWAY_FLAT_DEFAULTS,
        ).value
        u.uMilkyWay.value = (mw == null ? 0 : mw)
      } else {
        u.uMilkyWay.value = 0
      }
    }
  })

  const skyMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      bandHorizon: { value: new THREE.Color('#9dc5e0') },
      bandLow: { value: new THREE.Color('#80b5e0') },
      bandMid: { value: new THREE.Color('#5a9ce0') },
      bandHigh: { value: new THREE.Color('#4a90e0') },
      sunGlowColor: { value: new THREE.Color('#ffeedd') },
      sunDir: { value: new THREE.Vector3(0, 0.3, 1) },
      sunAlt: { value: 0.5 },
      moonDir: { value: new THREE.Vector3(0, 0.3, -1) },
      moonIllum: { value: 0.5 },
      moonVisible: { value: 0.0 },
      uCloudCover: { value: 0.0 },
      uStorminess: { value: 0.0 },
      uTurbidity: { value: 0.0 },
      uSunsetPotential: { value: 0.0 },
      uBeautyBias: { value: 0.6 },
      uSkyGain: { value: 1.0 },
      uMilkyWay: { value: 0.0 },
      // Aimed ⟂ the arch azimuth AS FRAMED AT THE 50% MARK of the hero pan
      // (cam≈[-614,114,183] → arch), so the band passes behind the Gateway Arch
      // in the money composition. The tilt = a 30° SLOPE (diagonal band, stays
      // lower/tidier, doesn't sweep the zenith). Re-solve if the pan is reauthored.
      uGalPole: { value: new THREE.Vector3(0.275, -0.5, 0.821).normalize() },
      // The bright galactic-core "heart" sits here — aimed behind the arch (the
      // 50%-pan arch azimuth), so the luminous center is the hero.
      uCoreDir: { value: new THREE.Vector3(0.951, 0.018, -0.308).normalize() },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 bandHorizon;
      uniform vec3 bandLow;
      uniform vec3 bandMid;
      uniform vec3 bandHigh;
      uniform vec3 sunGlowColor;
      uniform vec3 sunDir;
      uniform float sunAlt;
      uniform vec3 moonDir;
      uniform float moonIllum;
      uniform float moonVisible;
      uniform float uCloudCover;
      uniform float uStorminess;
      uniform float uTurbidity;
      uniform float uSunsetPotential;
      uniform float uBeautyBias;
      uniform float uSkyGain;
      uniform float uMilkyWay;   // milkyWay channel on/off (0..1), TOD-lerped
      uniform vec3  uGalPole;    // galactic-pole direction → orients the band
      varying vec3 vWorldPosition;

      // ── Dense fractal noise (procedural Milky Way — no texture) ──
      float mwHash(vec3 p){
        p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float mwNoise(vec3 x){
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(mwHash(i+vec3(0,0,0)), mwHash(i+vec3(1,0,0)), f.x),
                       mix(mwHash(i+vec3(0,1,0)), mwHash(i+vec3(1,1,0)), f.x), f.y),
                   mix(mix(mwHash(i+vec3(0,0,1)), mwHash(i+vec3(1,0,1)), f.x),
                       mix(mwHash(i+vec3(0,1,1)), mwHash(i+vec3(1,1,1)), f.x), f.y), f.z);
      }
      ${SKY_GRADIENT_GLSL}

      float mwFbm(vec3 p){
        float a = 0.5, s = 0.0;
        for(int i = 0; i < 4; i++){ s += a * mwNoise(p); p *= 2.02; a *= 0.5; }
        return s;
      }

      void main() {
        vec3 dir = normalize(vWorldPosition);
        float h = dir.y;

        // ── Operator-authored "juice" — the sky color, full stop.
        // 4 bands (horizon → low → mid → high) + sun-glow, resolved on the
        // CPU side from the active seasonal anchor card (lerp between two
        // flanking anchors by day-of-year; lerp between TOD columns by
        // minute-of-day). The hand-painted swatches ARE the physics — sun
        // position, atmospheric mood, season character all encoded by the
        // artist directly. Earlier experiments with a Preetham analytical
        // baseline laid on top were removed 2026-05-20: physics-overlay
        // fought the painter (suppressed authored noon colors to ~30%
        // strength via luma-gated composition). Painter is source of truth.
        // ⭐⭐ THE BANDS + THE BROAD GLOW NOW LIVE IN skyGradient.js, so the
        // WATER can evaluate the very same sky along its reflected view vector
        // instead of a copy that drifts (or a hand-placed lamp faking it — see
        // the floorDir excision, 2026-09-20). ⛔ This dome is still the only
        // consumer that draws the sun's DISC: the tight core stays here,
        // deliberately, because a reflected disc is a localized hotspot and the
        // lake must not have one.
        vec3 finalColor = skyDomeColor(dir, bandHorizon, bandLow, bandMid, bandHigh,
                                       uTurbidity, sunDir, sunAlt, sunGlowColor);

        float sunDot = dot(dir, sunDir);
        // Tight bright core (the visible sun disc on the dome).
        // exp() rather than pow() to dodge pow(0,large) driver bugs.
        float coreGlow = sunDot > 0.0 ? exp(256.0 * log(sunDot)) : 0.0;
        float sunVis = smoothstep(-0.12, 0.0, sunAlt);
        finalColor += sunGlowColor * (coreGlow * 1.5 * sunVis);

        // ⛔ NOT DUPLICATES — the same helpers skyDomeColor uses. The moon's
        // horizon wash and the sunset boost below both read these, so they are
        // asked for here rather than recomputed. (They were plain locals until
        // the lift; removing them without noticing these two downstream readers
        // is what turned the dome black, caught by VALIDATE_STATUS false.)
        float horizonProximity = skyHorizonProximity(h);
        float haloGlow = skyHaloGlow(sunDot);
        float wideScatter = skyWideScatter(sunDot, h);

        // ── Moon glow ──
        float moonDot = dot(dir, moonDir);

        // Moon disc — sharper than sun, silvery-white
        // Use exp() instead of pow() to avoid pow(0,large) driver bugs
        float moonDisc = moonDot > 0.0 ? exp(800.0 * log(moonDot)) : 0.0;

        // Inner halo — tight ethereal ring
        float moonHalo = moonDot > 0.0 ? exp(64.0 * log(moonDot)) : 0.0;

        // Outer corona — wide diffuse glow
        float moonCorona = moonDot > 0.0 ? exp(8.0 * log(moonDot)) : 0.0;

        // Atmospheric scatter along horizon in moon's direction
        float moonScatter = pow(max(0.0, moonDot), 3.0) * horizonProximity * horizonProximity;

        // Moon color palette
        vec3 moonDiscColor = vec3(0.85, 0.88, 0.95);     // bright silver-white disc
        vec3 moonHaloColor = vec3(0.55, 0.60, 0.80);     // blue-silver inner ring
        vec3 moonCoronaColor = vec3(0.20, 0.25, 0.45);   // deep blue outer glow
        vec3 moonScatterColor = vec3(0.10, 0.12, 0.22);  // subtle blue horizon wash

        // Intensity scales with illumination (full moon = bright, new moon = invisible)
        float illumScale = moonIllum * moonIllum;  // quadratic for more drama
        float nightFade = 1.0 - smoothstep(-0.05, 0.15, sunAlt);  // fade out during day

        float moonAlpha = moonVisible * nightFade * illumScale;

        // Compose moon glow — subtle; real night sky stays dark near the moon
        finalColor += moonDiscColor * moonDisc * 0.5 * moonAlpha;
        finalColor += moonHaloColor * moonHalo * 0.08 * moonVisible * nightFade;
        finalColor += moonCoronaColor * moonCorona * 0.04 * moonVisible * nightFade;

        // Subtle horizon glow — hint of atmospheric scatter, must not block stars
        float hBand = exp(-h * h * 40.0);
        float nightWeight = 1.0 - smoothstep(-0.05, 0.3, sunAlt);
        finalColor += vec3(0.03, 0.018, 0.04) * hBand * nightWeight;

        // ── Weather atmospheric effects ──

        // Haze band: warm Gaussian near horizon, stronger with turbidity
        float hazeGauss = exp(-h * h * (20.0 + 30.0 * (1.0 - uTurbidity)));
        float hazeSunWarm = max(0.0, dot(dir, sunDir)) * 0.5 + 0.5;
        vec3 hazeColor = mix(vec3(0.6, 0.55, 0.5), vec3(0.8, 0.6, 0.4), hazeSunWarm);
        finalColor += hazeColor * hazeGauss * uTurbidity * 0.3;

        // Overcast flattening: blend toward flat mid-tone proportional to cloudCover^2
        vec3 overcastTone = mix(bandHigh, bandHorizon, 0.6);
        finalColor = mix(finalColor, overcastTone, uCloudCover * uCloudCover * 0.5);

        // Storm darkening + desaturation
        finalColor *= (1.0 - uStorminess * 0.4);
        float lum = dot(finalColor, vec3(0.2126, 0.7152, 0.0722));
        finalColor = mix(finalColor, vec3(lum), uStorminess * 0.3);

        // Sunset glow enhancement: amplify halo and scatter during sunset potential
        float sunsetBoost = uSunsetPotential * uBeautyBias * 0.8;
        finalColor += sunGlowColor * (haloGlow * 0.15 + wideScatter * 0.1) * sunsetBoost;
        // Warm offset during sunset
        finalColor += vec3(0.08, 0.03, 0.0) * uSunsetPotential * uBeautyBias * smoothstep(0.0, 0.2, max(0.0, sunDot));

        // ── Sky Layer Gain ── exposure scoped to the dome. Applied LAST so
        // it scales the whole composed sky (bands + sun/moon glow + horizon
        // scatter + haze) uniformly. Stars are a separate object (their own
        // opacity) and are deliberately untouched. 1.0 = no change.
        finalColor *= uSkyGain;

        // ── Milky Way band — dense fractal noise, composited AFTER skyGain so
        // the night-dimmed dome lets it rise (like the separate star layer).
        // Aimed to dive behind the arch. Gated by milkyWay channel × nightFactor.
        float mwNight = clamp((0.05 - sunAlt) / 0.20, 0.0, 1.0);
        float mwGate = uMilkyWay * mwNight;
        if (mwGate > 0.001) {
          float gLat = asin(clamp(dot(dir, normalize(uGalPole)), -1.0, 1.0));
          // A smooth GLOWING BAND with very soft feathered sides — not filaments,
          // not stars, not clouds. Just a soft ribbon of light. Lower falloff =
          // softer/wider sides.
          float band = exp(-gLat * gLat * 30.0);
          // NEARLY-IMPERCEPTIBLE fractal breakup — subtly varies the glow so it
          // isn't a dead-flat smear, but stays one cohesive band (low contrast).
          float n = mwFbm(dir * 13.0);
          float breakup = 0.82 + 0.32 * n;      // ~0.9..1.06 — barely there
          float milk = band * breakup;
          // Purple → blue → teal, LOW contrast so it reads as a single glow.
          vec3 cA = vec3(0.13, 0.11, 0.27);   // deep purple
          vec3 cB = vec3(0.14, 0.25, 0.45);   // blue
          vec3 cC = vec3(0.26, 0.50, 0.52);   // teal
          vec3 milkColor = mix(cA, cB, smoothstep(0.30, 0.60, n));
          milkColor = mix(milkColor, cC, smoothstep(0.60, 0.88, n));
          // Low master (~13%) — a subtle glow over the dark dome. Default for the
          // future Brightness knob.
          finalColor += milkColor * milk * mwGate * 0.13;
        }

        // Opaque sky — no transparent fade, no stencil portal
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,  // 2026-04-16: needed for cartograph Stage embed; harmless at /stage
    transparent: false,
  }), [])

  // Catalog stars (~523 brightest, mag ≤ 4.0) with per-frame RA/Dec conversion
  const starRef = useRef()
  const noiseRef = useRef()
  const { starCatalog, starGeo, starMat, noiseGeo, noiseMat } = useMemo(() => {
    const N = brightStars.length
    const DEG = Math.PI / 180
    const R = SKY_RADIUS * 0.9

    // Pre-compute equatorial unit vectors (RA/Dec on celestial sphere)
    // and color/size from catalog data — these don't change with time
    const raRad = new Float32Array(N)
    const decRad = new Float32Array(N)
    const starColors = new Float32Array(N * 3)
    const starSizes = new Float32Array(N)
    const _bvOut = [0, 0, 0]

    for (let i = 0; i < N; i++) {
      const star = brightStars[i]
      raRad[i] = star.ra * DEG
      decRad[i] = star.dec * DEG

      // B–V color index → RGB (shared SSoT, src/lib/starColor.js — same ladder
      // the constellation overlay nodes use, so the figures match the field).
      bvToRGB(star.ci, _bvOut)
      starColors[i * 3] = _bvOut[0]
      starColors[i * 3 + 1] = _bvOut[1]
      starColors[i * 3 + 2] = _bvOut[2]

      // Size from magnitude: brighter = bigger point
      const magNorm = (6.0 - star.mag) / 7.5 // 0..1
      starSizes[i] = (0.6 + magNorm * magNorm * 4.0) * 12.0
    }

    // Build constellation membership flag: mark catalog stars near any constellation vertex
    const isConstellation = new Uint8Array(N)
    const constellationVertices = []
    for (const c of constellationsData) {
      for (const seg of c.lines) {
        for (const pt of seg) {
          constellationVertices.push([pt[0] * DEG, pt[1] * DEG]) // RA/Dec in radians
        }
      }
    }
    const MATCH_THRESHOLD = 1.0 * DEG // 1.0 degree — generous to catch rounding/epoch drift
    for (let i = 0; i < N; i++) {
      const sRA = raRad[i], sDec = decRad[i]
      for (let j = 0; j < constellationVertices.length; j++) {
        const dRA = sRA - constellationVertices[j][0]
        const dDec = sDec - constellationVertices[j][1]
        // Quick angular distance approximation (accurate for small separations)
        const cosDec = Math.cos(sDec)
        const dist2 = (dRA * cosDec) * (dRA * cosDec) + dDec * dDec
        if (dist2 < MATCH_THRESHOLD * MATCH_THRESHOLD) {
          isConstellation[i] = 1
          break
        }
      }
    }

    const mat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0.0 }, uTime: { value: 0.0 } },
      vertexShader: `
        uniform float uTime;
        attribute float aSize;
        attribute vec3 aColor;
        varying vec3 vCol;
        varying float vBright;
        varying float vTwinkle;
        void main() {
          vCol = aColor;
          vBright = aSize / 60.0;
          // Gentle twinkle — slow, low-amplitude brightness wander with a per-star
          // phase + slight per-star speed, so they shimmer independently instead of
          // strobing. Amplitude kept small so it reads alive, not flashing.
          float phase = position.x * 0.013 + position.y * 0.017 + position.z * 0.019;
          vTwinkle = 0.80 + 0.20 * sin(uTime * (1.6 + fract(phase) * 1.2) + phase);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // Use distance (not -mv.z) — all sky-dome stars are equidistant,
          // so depth-based scaling blows up at the camera side plane. Min 1.8px
          // (was 1.0) so the soft disc has room to anti-alias — 1px sprites
          // scintillated as the sky drifted (the "fake flash").
          gl_PointSize = max(aSize * (800.0 / length(mv.xyz)), 1.8);
          // Fade out below horizon (position is world-space, Y=0 is horizon)
          gl_PointSize *= smoothstep(-500.0, 0.0, position.y);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        varying vec3 vCol;
        varying float vBright;
        varying float vTwinkle;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          // Soft circular falloff — fade to zero well within sprite bounds
          float edge = 1.0 - smoothstep(0.3, 0.5, d);
          float core = 1.0 - smoothstep(0.0, 0.35, d);
          float a = (core + exp(-d * 8.0) * 0.4) * edge;
          if (a * uOpacity < 0.01) discard;
          // Chromatic aberration: subtle — R shifts outward, B inward
          float spread = 0.04 + vBright * 0.06;
          float dR = length((gl_PointCoord - 0.5) * (1.0 + spread));
          float dB = length((gl_PointCoord - 0.5) * (1.0 - spread));
          float edgeR = 1.0 - smoothstep(0.3, 0.5, dR);
          float edgeB = 1.0 - smoothstep(0.3, 0.5, dB);
          float aR = ((1.0 - smoothstep(0.0, 0.35, dR)) + exp(-dR * 8.0) * 0.4) * edgeR;
          float aB = ((1.0 - smoothstep(0.0, 0.35, dB)) + exp(-dB * 8.0) * 0.4) * edgeB;
          vec3 col = vec3(aR * vCol.r, a * vCol.g, aB * vCol.b);
          col *= 3.0;
          gl_FragColor = vec4(col * uOpacity * vTwinkle, max(col.r, max(col.g, col.b)) * uOpacity * vTwinkle);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    // Create empty geometry — positions filled each frame from sidereal time
    const geo = new THREE.BufferGeometry()
    // Pre-set attributes so the shader can bind them on first render
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    geo.setAttribute('aColor', new THREE.BufferAttribute(starColors, 3))
    geo.setAttribute('aSize', new THREE.BufferAttribute(starSizes, 1))
    // Explicit bounding sphere so frustum culling never hides the full-sky group
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), SKY_RADIUS * 2)

    // ── Background filler stars (equatorial cartesian, rotated as rigid group) ──
    const NOISE_N = 6000
    const noisePositions = new Float32Array(NOISE_N * 3)
    const noiseColors = new Float32Array(NOISE_N * 3)
    const noiseSizes = new Float32Array(NOISE_N)
    let seed = 12345
    const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
    const R_noise = SKY_RADIUS * 0.88
    for (let i = 0; i < NOISE_N; i++) {
      const ra = rng() * Math.PI * 2
      const dec = Math.asin(rng() * 2 - 1)
      noisePositions[i * 3]     = R_noise * Math.cos(dec) * Math.cos(ra)
      noisePositions[i * 3 + 1] = R_noise * Math.cos(dec) * Math.sin(ra)
      noisePositions[i * 3 + 2] = R_noise * Math.sin(dec)
      // Warm white with slight variation
      noiseColors[i * 3]     = 0.7 + rng() * 0.3
      noiseColors[i * 3 + 1] = 0.7 + rng() * 0.3
      noiseColors[i * 3 + 2] = 0.8 + rng() * 0.2
      // Sizes large enough to be visible at sky-dome distance
      noiseSizes[i] = (10.0 + rng() * 14.0) * 20.0
    }
    const nGeo = new THREE.BufferGeometry()
    nGeo.setAttribute('position', new THREE.BufferAttribute(noisePositions, 3))
    nGeo.setAttribute('aColor', new THREE.BufferAttribute(noiseColors, 3))
    nGeo.setAttribute('aSize', new THREE.BufferAttribute(noiseSizes, 1))
    // Explicit bounding sphere so frustum culling never hides the full-sky group
    nGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), SKY_RADIUS * 2)

    const nMat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0.0 }, uTime: { value: 0.0 } },
      vertexShader: `
        uniform float uTime;
        attribute float aSize;
        attribute vec3 aColor;
        varying vec3 vCol;
        varying float vTwinkle;
        void main() {
          vCol = aColor;
          // Same gentle twinkle as the catalog stars (per-star phase + speed).
          float phase = position.x * 0.013 + position.y * 0.017 + position.z * 0.019;
          vTwinkle = 0.78 + 0.22 * sin(uTime * (1.4 + fract(phase) * 1.2) + phase);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = max(aSize * (800.0 / length(mv.xyz)), 1.5);  // min 1.5px → no scintillation
          // Fade out below horizon (world Y < 0)
          vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_PointSize *= smoothstep(-500.0, 0.0, worldPos.y);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        varying vec3 vCol;
        varying float vTwinkle;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = 1.0 - smoothstep(0.0, 0.5, d);
          a *= a;
          float bri = a * uOpacity * vTwinkle;
          if (bri < 0.005) discard;
          // ×1.7 so the filler reads as stars, not faint haze (catalog gets ×3).
          gl_FragColor = vec4(vCol * bri * 1.7, bri);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    return {
      starCatalog: { raRad, decRad, count: N, radius: R, isConstellation },
      starGeo: geo,
      starMat: mat,
      noiseGeo: nGeo,
      noiseMat: nMat,
    }
  }, [])

  // Update star positions each frame based on sidereal time (Earth rotation)
  // and fade opacity with sun altitude
  useFrame((state) => {
    if (!starRef.current || !starMat) return
    const planetariumActive = useCamera.getState().viewMode === 'planetarium'
    const { astronomyAlpha } = useSkyState.getState()
    // Operator star-brightness knob (the `stars` channel, threaded into GradientSky
    // like constellations/skyGain) multiplies the physical astronomyAlpha. Authored,
    // not hardcoded; default 1.0 = no-op.
    const starsBright = resolveGroupAtMinute(
      starsChannel, useTimeOfDay.getState().getMinuteOfDay(),
      starsChannel?.animated ? getTodSlotMinutes(useTimeOfDay.getState().currentTime) : null,
      STARS_FIELD_KEYS, STARS_FLAT_DEFAULTS,
    ).brightness ?? 1
    starMat.uniforms.uOpacity.value = (planetariumActive ? 1.0 : astronomyAlpha) * starsBright
    // Twinkle clock — real wall-time so the shimmer is independent of TOD scrub.
    starMat.uniforms.uTime.value = state.clock.elapsedTime
    noiseMat.uniforms.uTime.value = state.clock.elapsedTime

    // Skip expensive sidereal position computation when stars are invisible
    if (!planetariumActive && astronomyAlpha < 0.01) return

    // Scale star sizes in planetarium mode (constellation stars 40x, others 4x)
    const sizeAttr = starRef.current.geometry.getAttribute('aSize')
    const wasScaled = sizeAttr._planetariumScaled === true
    if (wasScaled !== planetariumActive) {
      const arr = sizeAttr.array
      const { isConstellation: isCon } = starCatalog
      if (planetariumActive) {
        for (let i = 0; i < arr.length; i++) arr[i] *= isCon[i] ? 40.0 : 4.0
      } else {
        for (let i = 0; i < arr.length; i++) arr[i] *= isCon[i] ? (1.0 / 40.0) : (1.0 / 4.0)
      }
      sizeAttr.needsUpdate = true
      sizeAttr._planetariumScaled = planetariumActive
    }

    // Compute local sidereal time (LST) for current simulation time
    const { currentTime } = useTimeOfDay.getState()
    const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0)
    const daysSinceJ2000 = (currentTime.getTime() - J2000) / 86400000
    const GMST = (280.46061837 + 360.98564736629 * daysSinceJ2000) % 360
    const LST = ((GMST + LONGITUDE) % 360 + 360) % 360 // degrees
    const lstRad = LST * (Math.PI / 180)
    const latRad = LATITUDE * (Math.PI / 180)
    const sinLat = Math.sin(latRad)
    const cosLat = Math.cos(latRad)

    const { raRad, decRad, count, radius: R } = starCatalog
    const posAttr = starRef.current.geometry.getAttribute('position')
    const pos = posAttr.array
    for (let i = 0; i < count; i++) {
      // Hour angle = LST - RA
      const ha = lstRad - raRad[i]
      const sinDec = Math.sin(decRad[i])
      const cosDec = Math.cos(decRad[i])
      const cosHA = Math.cos(ha)
      const sinHA = Math.sin(ha)

      // Equatorial → horizontal (altitude/azimuth)
      const sinAlt = sinDec * sinLat + cosDec * cosLat * cosHA
      const alt = Math.asin(sinAlt)

      // Skip stars below horizon
      if (alt < 0) {
        pos[i * 3] = 0; pos[i * 3 + 1] = -R; pos[i * 3 + 2] = 0
        continue
      }

      const cosAlt = Math.cos(alt)
      const sinAz = -sinHA * cosDec * cosLat
      const cosAz = sinDec - sinAlt * sinLat
      const az = Math.atan2(sinAz, cosAz)

      // Horizontal → 3D world position (match celestialToPosition convention)
      pos[i * 3]     = R * cosAlt * Math.sin(az)
      pos[i * 3 + 1] = R * sinAlt
      pos[i * 3 + 2] = -R * cosAlt * Math.cos(az)
    }
    posAttr.needsUpdate = true

    // ── Rotate filler stars as rigid group via equatorial→local matrix ──
    if (noiseRef.current) {
      noiseMat.uniforms.uOpacity.value = (planetariumActive ? 0.9 : astronomyAlpha * 0.95) * starsBright
      const cosLST = Math.cos(lstRad), sinLST = Math.sin(lstRad)
      const cosL = cosLat, sinL = sinLat
      noiseRef.current.matrixAutoUpdate = false
      noiseRef.current.matrix.set(
        -sinLST,        cosLST,         0,     0,
        cosL * cosLST,  cosL * sinLST,  sinL,  0,
        sinL * cosLST,  sinL * sinLST, -cosL,  0,
        0,              0,              0,     1
      )
      noiseRef.current.matrixWorldNeedsUpdate = true
    }
  })

  // Constellations: Hero + Street, never Browse. Gate by the operator's
  // channel × nightFactor. Default channel value is 0, so unauthored
  // Looks render no lines until the operator dials them up. Binary mount
  // for v1; smooth opacity fade is a follow-up that needs propagating the
  // value into PlanetariumOverlay's sub-materials.
  const viewMode = useCamera((s) => s.viewMode)
  // Constellations: ONLY in Street view (planetarium), ALL DAY LONG (Jacob
  // 2026-06-17). Never in Hero or Browse; no day/night gate. Visibility is
  // purely the camera mode. (The operator `constellations` channel still drives
  // the overlay's per-TOD styling inside PlanetariumOverlay — it just no longer
  // gates whether the overlay shows.)
  const constellationsVisible = viewMode === 'planetarium'

  return (
    <>
      <mesh renderOrder={-1000}>
        <sphereGeometry args={[SKY_RADIUS, 64, 64]} />
        <primitive object={skyMaterial} ref={materialRef} />
      </mesh>
      <points ref={starRef} geometry={starGeo} material={starMat} frustumCulled={false} />
      <points ref={noiseRef} geometry={noiseGeo} material={noiseMat} frustumCulled={false} />
      {constellationsVisible && (
        // Isolated: PlanetariumOverlay was effectively never mounted in
        // production (the `constellations` channel defaulted to 0), so an
        // always-on mount in Street view must not be able to blank the whole
        // sky/scene if it throws. The boundary logs `[R3F] PlanetariumOverlay
        // crashed <error>` to the console; Suspense covers any async label load.
        <R3FErrorBoundary name="PlanetariumOverlay">
          <Suspense fallback={null}>
            <PlanetariumOverlay />
          </Suspense>
        </R3FErrorBoundary>
      )}
    </>
  )
}

// Doctrine: ONE consumer. Stage and production mount this same component
// (memory `project_stage_consumer_parity`). Per-channel `<channel>Override`
// props are how Stage retints instantly off the live cartograph store; when
// absent, the consumer falls back to the channel baked into scene.json
// (frozen-at-bake). The store reach is contained to CartographApp.jsx;
// this file never imports useCartographStore. `skipSkyDome` / `debugLevel`
// are Stage authoring debug knobs.
function CelestialBodies({
  skipSkyDome = false, debugLevel = 0,
  lookId, bakeLastMs,
  skyOverride, ambientOverride, hemiOverride,
  dirSunOverride, dirMoonOverride,
  constellationsOverride, milkyWayOverride,
  skyGainOverride, starsOverride,
} = {}) {
  // debugLevel: 0 = full, 1 = lights only (no sky/moon/orbs), 2 = ambient only, 3 = nothing (just compute)
  const { currentTime } = useTimeOfDay()
  const scene = useSceneJson(resolveLookId(lookId), bakeLastMs)

  // Resolve each authored channel: live override (Stage) wins, else
  // scene.json (frozen-at-bake), else the inline flat-default envelope
  // (boot-time first-paint matches the baker's emit for unauthored Looks).
  const skyChannel            = skyOverride            ?? scene?.sky            ?? SKY_DEFAULT_CHANNEL
  const ambientChannel        = ambientOverride        ?? scene?.ambient        ?? AMBIENT_DEFAULT_CHANNEL
  const hemiChannel           = hemiOverride           ?? scene?.hemi           ?? HEMI_DEFAULT_CHANNEL
  const dirSunChannel         = dirSunOverride         ?? scene?.dirSun         ?? DIRSUN_DEFAULT_CHANNEL
  const dirMoonChannel        = dirMoonOverride        ?? scene?.dirMoon        ?? DIRMOON_DEFAULT_CHANNEL
  const constellationsChannel = constellationsOverride ?? scene?.constellations ?? CONSTELLATIONS_DEFAULT_CHANNEL
  const starsChannel          = starsOverride          ?? scene?.stars          ?? STARS_DEFAULT_CHANNEL
  const milkyWayChannel       = milkyWayOverride       ?? scene?.milkyWay       ?? MILKYWAY_DEFAULT_CHANNEL
  const skyGainChannel        = skyGainOverride        ?? scene?.skyGain        ?? SKY_GAIN_DEFAULT_CHANNEL

  // Per-frame multiplier refs. useFrame resolves each channel against the
  // live TOD minute; PrimaryOrb / SecondaryOrb + the ambient + hemi
  // useFrame below read these refs at apply time. Channels always
  // resolve to a value (live override → scene.json → inline default).
  const dirSunMulRef  = useRef(1)
  const dirMoonMulRef = useRef(1)
  const ambientMulRef = useRef(1)
  const hemiMulRef    = useRef(1)
  useFrame(() => {
    const tod = useTimeOfDay.getState()
    const minute = tod.getMinuteOfDay()
    const slotMinutes = getTodSlotMinutes(tod.currentTime)
    dirSunMulRef.current  = resolveGroupAtMinute(dirSunChannel,  minute, dirSunChannel.animated  ? slotMinutes : null, DIRSUN_FIELD_KEYS,  DIRSUN_FLAT_DEFAULTS).value  ?? 1
    dirMoonMulRef.current = resolveGroupAtMinute(dirMoonChannel, minute, dirMoonChannel.animated ? slotMinutes : null, DIRMOON_FIELD_KEYS, DIRMOON_FLAT_DEFAULTS).value ?? 1
    ambientMulRef.current = resolveGroupAtMinute(ambientChannel, minute, ambientChannel.animated ? slotMinutes : null, AMBIENT_FIELD_KEYS, AMBIENT_FLAT_DEFAULTS).value ?? 1
    hemiMulRef.current    = resolveGroupAtMinute(hemiChannel,    minute, hemiChannel.animated    ? slotMinutes : null, HEMI_FIELD_KEYS,    HEMI_FLAT_DEFAULTS).value    ?? 1
  })

  const lighting = useMemo(() => {
    const sunPos = SunCalc.getPosition(currentTime, LATITUDE, LONGITUDE)
    const moonPos = SunCalc.getMoonPosition(currentTime, LATITUDE, LONGITUDE)
    const moonIllum = SunCalc.getMoonIllumination(currentTime)

    const sunAlt = sunPos.altitude
    const moonAlt = moonPos.altitude

    const isNight = sunAlt < -0.12
    const isTwilight = sunAlt >= -0.12 && sunAlt < 0.05
    const isGoldenHour = sunAlt >= 0.05 && sunAlt < 0.3

    celestialToPosition(sunPos.azimuth + Math.PI, sunPos.altitude, LIGHT_RADIUS, _sunLP, 100)
    celestialToPosition(sunPos.azimuth + Math.PI, sunPos.altitude, SUN_VISUAL_RADIUS, _sunVP, 100)
    celestialToPosition(moonPos.azimuth + Math.PI, moonPos.altitude, MOON_RADIUS, _moonP)

    let primary = {}
    let secondary = {}
    let sky = {}
    let ambient = {}

    // Sun direction in world space (normalized) — used by Moon shader for
    // physically-based crescent lighting from the actual sun position.
    const sunDirWorld = _sunVP.clone().normalize()

    // Day factor for moon appearance: 0 = night (full detail), 1 = day (pale/translucent).
    // Transitions smoothly through twilight.
    const dayFactor = Math.max(0, Math.min(1, (sunAlt - 0.02) / 0.25))

    const moon = {
      position: _moonP,
      phase: moonIllum.phase,
      illumination: moonIllum.fraction,
      sunDirection: sunDirWorld,
      dayFactor,
      visible: moonAlt > -0.05,  // Show slightly below horizon so it rises/sets behind buildings
    }

    // Atmospheric extinction: the moon is dimmer near the horizon (a real
    // phenomenon) and it also fixes specular hotspots on the arch at grazing
    // angles. Kept here because the stylistic fill below still rides it.
    const moonAltFade = Math.max(0, Math.min(1, (moonAlt + 0.05) / 0.30))

    // ⭐⭐ THE TWO BODIES, EACH AT ITS OWN REAL POSITION. `bodyLights` returns the
    // sun and the moon as lights and hands back whichever is BRIGHTER as the key
    // (it casts; one shadow map, never two) and the other as the counter.
    // ⛔ WHAT WAS HERE: `_sunLP.clone().lerp(_nightLP, nightBlend)` — the key
    // light's POSITION averaged between the two bodies. Real at each end, a
    // phantom across the whole twilight handover, and everything in the scene
    // lit from it. Measured across 5 towns × 3 days: up to 74.4° off the nearest
    // real body. ⭐ Two real lights is a DELETION, and the second glint path on
    // the water falls out of it for nothing.
    const bodies = bodyLights({
      sunAlt, sunAz: sunPos.azimuth,
      moonAlt, moonAz: moonPos.azimuth,
      moonIllumFraction: moonIllum.fraction,
    })
    primary = { body: bodies.key.body, lightPosition: bodies.key.position, color: bodies.key.color, intensity: bodies.key.intensity }
    const counter = { body: bodies.counter.body, lightPosition: bodies.counter.position, color: bodies.counter.color, intensity: bodies.counter.intensity }

    if (isNight) {
      // Smooth blend over sunAlt -0.12 to -0.25 — no hard boundary
      const nightBlend = Math.max(0, Math.min(1, (-0.12 - sunAlt) / 0.13))
      const twiSecIntensity = 0.2

      secondary = {
        position: _secP.set(-150, 100, -150).lerp(new THREE.Vector3(-_sunLP.x * 0.5, 80, -_sunLP.z * 0.5), 1 - nightBlend),
        color: lerpColor('#8877aa', '#4466aa', nightBlend),
        intensity: (twiSecIntensity + (0.15 - twiSecIntensity) * nightBlend) * Math.max(0.1, moonAltFade),
      }
      sky = {
        top: lerpColor('#1a1535', '#0a1020', nightBlend),
        bottom: lerpColor('#553333', '#1a2545', nightBlend),
      }
      ambient = {
        color: lerpColor('#443355', '#3a4a70', nightBlend),
        intensity: 0.35 + nightBlend * 0.65,
      }
    } else if (isTwilight) {
      const t = (sunAlt + 0.12) / 0.17
      secondary = {
        position: _secP.set(-_sunLP.x * 0.5, 80, -_sunLP.z * 0.5),
        color: '#8877aa',
        intensity: 0.2 + t * 0.1,
      }
      sky = {
        top: lerpColor('#1a1535', '#3a4570', t),
        bottom: lerpColor('#553333', '#885544', t),
      }
      ambient = { color: lerpColor('#443355', '#887766', t), intensity: 0.35 + t * 0.1 }
    } else if (isGoldenHour) {
      const t = (sunAlt - 0.05) / 0.25
      secondary = {
        position: _secP.set(-_sunLP.x * 0.5, 60, -_sunLP.z * 0.5),
        color: '#aabbdd',
        intensity: 0.3 - t * 0.05,
      }
      sky = {
        top: lerpColor('#4a6090', '#5080c0', t),
        bottom: lerpColor('#aa7755', '#88aacc', t),
      }
      ambient = { color: lerpColor('#998877', '#ccddee', t), intensity: 0.45 - t * 0.1 }
    } else {
      secondary = {
        position: _secP.set(-_sunLP.x * 0.4, 50, -_sunLP.z * 0.4),
        color: '#aaccff',
        intensity: 0.25,
      }
      sky = { top: '#5090dd', bottom: '#99ccee' }
      ambient = { color: '#eef4ff', intensity: 0.55 }
    }

    // Normalized sun direction for sky glow (unit vector pointing toward sun)
    _sunD.copy(_sunVP).normalize()

    // Moon direction + glow data for sky dome
    _moonD.copy(_moonP).normalize()
    const moonGlow = {
      dir: _moonD,
      altitude: moonAlt,
      illumination: moonIllum.fraction,
      phase: moonIllum.phase,
    }

    // Smooth night factor: 0 = full day, 1 = full night
    // Transitions over sunAlt range 0.05 to -0.15 (no hard boundary)
    const nightFactor = Math.max(0, Math.min(1, (0.05 - sunAlt) / 0.20))

    // The key light's direction, taken off the object the light itself is built
    // from. ⭐⭐ UPDATED 2026-09-20 AND THE CHANGE IS THE POINT: this used to read
    // a position that was a sun→moon LERP, so a card lit from it lit from a
    // phantom through the whole twilight handover. It is now the BRIGHTER REAL
    // BODY's direction — sun by day, moon by night, and never a point between.
    // Published so a consumer that cannot join the real light rig — the tree
    // impostor cards, which are MeshBasic by design — can still light from the
    // scene's actual key instead of a scalar dimmer. ⛔ ONE derivation of one
    // physical fact: read it, never recompute it. (A consumer that IS in the rig,
    // like the water material, should take the light itself and not this.)
    _keyD.copy(primary.lightPosition).normalize()

    return { primary, counter, secondary, sky, ambient, isNight, nightFactor, moon, sunAlt, sunDir: _sunD, moonGlow,
      _celestial: { sunDirection: _sunD.clone(), sunElevation: sunAlt, moonDirection: _moonD.clone(),
        moonPhase: moonIllum.phase, moonIllumination: moonIllum.fraction, moonAltitude: moonAlt,
        keyDirection: _keyD.clone(), keyColor: primary.color, nightFactor } }
  }, [currentTime])

  // Push celestial data to sky state store (after render, not during)
  useEffect(() => {
    useSkyState.getState().setCelestial(lighting._celestial)
  }, [lighting])

  // Weather-coupled lighting multipliers
  // Note: using getState() instead of selectors to avoid render cascade in cartograph context
  const skySnap = useSkyState.getState()
  const cc = Math.round((skySnap.cloudCover || 0) * 20) / 20
  const st = Math.round((skySnap.storminess || 0) * 20) / 20
  const primaryWeathered = useMemo(() => ({
    ...lighting.primary,
    intensity: lighting.primary.intensity * (1 - cc * 0.6),
  }), [lighting.primary, cc])
  // Cloud cover dims both bodies the same way — a cloud does not know which one
  // the renderer is calling the key.
  const counterWeathered = useMemo(() => ({
    ...lighting.counter,
    intensity: lighting.counter.intensity * (1 - cc * 0.6),
  }), [lighting.counter, cc])

  // Refs + useFrame to drive Sky&Light lighting-unit multipliers per
  // frame (intensity values otherwise only update on re-render).
  // PrimaryOrb / SecondaryOrb handle their own multipliers internally.
  const ambientRef = useRef()
  const hemiRef = useRef()
  // Refs for the 3 night-fill floors (white · warm · hemisphere) so the
  // operator's Ambient knob (ambientMulRef) reaches them too — they used to be
  // hardcoded floors that ignored every knob (Jacob 2026-06-27, the un-zeroable night).
  const floorWhiteRef = useRef()
  const floorWarmRef  = useRef()
  const floorFillRef   = useRef()
  const ambientBase = (lighting.ambient?.intensity || 0.5) * (1 + cc * 0.4)
  // Hemi is the SKY-COLOR fill lever (Jacob 2026-06-29: "desaturated surfaces
  // hit with soft saturated light from the sky colors"). Strengthened from the
  // old 0.35 cap (it read as a dead lever) so the per-slot hemi knob can drive a
  // real sky wash. ⚠️ couples to every hemi keyframe — eye-gate dawn/noon/night.
  const hemiBase = (0.55 - lighting.nightFactor * 0.2) * (1 + cc * 0.5)
  useFrame(() => {
    if (ambientRef.current) ambientRef.current.intensity = ambientBase * ambientMulRef.current
    if (hemiRef.current)    hemiRef.current.intensity    = hemiBase    * hemiMulRef.current
    // Night-fill floors now ride the Ambient knob (× ambientMulRef): default (×1)
    // = today's look; Ambient → 0 darkens night fully (stars / mood). Folds the
    // old hardcoded floors into the operator's control — knob, not hardwire.
    const aMul = ambientMulRef.current
    if (floorWhiteRef.current) floorWhiteRef.current.intensity = 0.45 * aMul
    if (floorWarmRef.current)  floorWarmRef.current.intensity  = 0.15 * lighting.nightFactor * aMul
    if (floorFillRef.current)   floorFillRef.current.intensity   = (0.12 - lighting.nightFactor * 0.06) * HEMI_FOR_DIRECTIONAL * aMul
  })

  if (debugLevel >= 3) return null

  return (
    <>
      {!skipSkyDome && debugLevel < 1 && <GradientSky sunAltitude={lighting.sunAlt} sunDirection={lighting.sunDir} moonGlow={lighting.moonGlow} skyChannel={skyChannel} constellationsChannel={constellationsChannel} skyGainChannel={skyGainChannel} starsChannel={starsChannel} milkyWayChannel={milkyWayChannel} />}
      {debugLevel < 1 && <Suspense fallback={null}><Moon {...lighting.moon} /></Suspense>}
      {/* Milky Way mount hidden from runtime 2026-05-02 — see comment in
          CartographSkyLight.jsx. MilkyWaySphere component preserved; takes
          a milkyWayChannel prop for the eventual re-mount path. */}
      {/* {debugLevel < 1 && <MilkyWaySphere nightFactor={lighting.nightFactor} milkyWayChannel={milkyWayChannel} />} */}
      <ambientLight ref={floorWhiteRef} color="#ffffff" intensity={0.45} />
      {debugLevel < 99 && <ambientLight
        ref={ambientRef}
        color={lighting.ambient?.color || '#ffffff'}
        intensity={ambientBase}
      />}
      <ambientLight ref={floorWarmRef} color="#8a7060" intensity={0.15 * lighting.nightFactor} />
      {/* Hemisphere fill now driven by the live SKY GRADIENT — the up-sky color
          washes surfaces from above, the warm horizon color is the ground bounce.
          This is what makes surfaces "glow with the sky's color" (Jacob's vision)
          instead of the old muddy #ffeedd→#556688 over dark brown. Saturation
          degree will become a knob; raw sky colors are the honest baseline. */}
      {debugLevel < 2 && <hemisphereLight
        ref={hemiRef}
        color={lighting.sky?.top || '#88aacc'}
        groundColor={lighting.sky?.bottom || '#665544'}
        intensity={hemiBase}
      />}
      {/* ⭐⭐ THE CHANNEL FOLLOWS THE BODY, NOT THE SLOT (Jacob, 2026-09-20: "I
          don't think we should have lights that don't have operator facing
          knobs"). `dirSun` scales the SUN wherever it is in the rig and `dirMoon`
          scales the MOON — so every light in this scene has exactly one operator
          channel and no light is unreachable.
          ⭐ It also makes the AUTHORED CURVES MEAN WHAT THEY ALWAYS LOOKED LIKE
          THEY MEANT. huron authors dirSun {noon 1.5 … dusk 0} and dirMoon {dawn 0,
          sunset 0, dusk 1, night 2} — that IS "sun down at dusk, moon up at
          night", written against a rig that had only one body light and a fill
          standing in for the other. The curves now drive the bodies they name.
          ⚠️ NIGHT WILL LOOK DIFFERENT and that is the point of the change, not a
          side effect: dirMoon's night value now lands on the real moon instead of
          on a fill. Eye-gate night before trusting it. */}
      {debugLevel < 1 && <PrimaryOrb {...primaryWeathered}
        intensityMulRef={lighting.primary.body === 'moon' ? dirMoonMulRef : dirSunMulRef} />}
      {/* ⭐⭐ THE COUNTER BODY — the one that is NOT currently the key. This is the
          whole "two glints" feature and it is four lines: three's PBR evaluates a
          specular lobe per light, and waterMaterial already hands it a wave
          normal, so a low sun and a risen moon lay TWO paths on the lake, on
          their two real azimuths, with no shader change at all.
          ⛔ IT DOES NOT CAST. One shadow map, never two — and the casting light
          keeps PrimaryOrb's camera-fitted frustum (3dcb5dd3) precisely because a
          second caster without that treatment silently gets LS's old ±900 box.
          ⚠️ It carries NO operator channel. `dirSun`/`dirMoon` are authored per
          town against the two slots that exist today, and quietly repointing one
          would rewrite what an operator already tuned. Giving the counter its own
          knob is a third authoring model — that shape is Boz's to decide once. */}
      {debugLevel < 1 && <CounterBodyLight {...counterWeathered}
        intensityMulRef={lighting.counter.body === 'moon' ? dirMoonMulRef : dirSunMulRef} />}
      {/* The stylistic fill rides AMBIENT with the other irradiance-only floors —
          it stopped being a body-shaped light when it became a hemisphere, and
          `dirMoon` now belongs to the actual moon. */}
      {debugLevel < 1 && <SecondaryOrb {...lighting.secondary} intensityMulRef={ambientMulRef} />}
      {/* ⭐⭐ THE NIGHT-FILL FLOOR — A HEMISPHERE, NOT A DIRECTIONAL, AND THE KIND
          OF LIGHT IS THE WHOLE POINT. This shipped as
          `<directionalLight position={[0, 100, -400]}>`: a fill light nailed due
          north at a fixed elevation, in every town, for all time.
          ⛔ ON LAND IT WAS A HARMLESS FILL. ON WATER IT WAS A LIE. A directional
          light has a specular lobe, so the lake reflected it — and because it
          never moved, the reflection never moved either. That is the hotspot that
          sat in the middle of the water at every hour: not the sun, not the moon,
          a studio lamp parked where no celestial body can ever be (huron's lake is
          NORTH; at 41°N the sun and moon are always SOUTH). Jacob found it by
          scrubbing the timeline and watching the reflection refuse to travel:
          "when I move the camera, the parallax is great. It's when I scrub the
          timeline: the hotspot should move L <> R (E <> W)."
          ⭐ THE FIX IS THE LIGHT TYPE. In three, `hemisphereLight` and
          `ambientLight` contribute IRRADIANCE ONLY — they have no specular lobe
          at all — so the fill arrives exactly as before and the phantom
          reflection becomes impossible rather than merely dim. Nothing is
          subtracted from the towns; the same light is delivered by something that
          cannot be mistaken for a body.
          ⚠️ THE ONE REAL DIFFERENCE, NAMED: a hemisphere has no azimuth, so
          surfaces no longer get the slight north-side modelling the old vector
          gave them. The intensity is scaled by HEMI_FOR_DIRECTIONAL so the energy
          delivered is the same; the distribution is flatter. ▶ Eye-gate night in
          two towns before trusting it. */}
      {debugLevel < 2 && <hemisphereLight
        ref={floorFillRef}
        color={lerpColor('#ffeedd', '#5577aa', lighting.nightFactor)}
        groundColor={lerpColor('#6b5a4a', '#22304a', lighting.nightFactor)}
        intensity={(0.12 - lighting.nightFactor * 0.06) * HEMI_FOR_DIRECTIONAL}
      />}
    </>
  )
}

export default CelestialBodies
