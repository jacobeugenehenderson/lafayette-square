import { useRef, useMemo, useEffect, Suspense } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import SunCalc from 'suncalc'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useCamera from '../hooks/useCamera'
import useSkyState from '../hooks/useSkyState'
import brightStars from '../data/bright_stars.json'
import PlanetariumOverlay from './PlanetariumOverlay'

// Lafayette Square, St. Louis, MO coordinates
export const LATITUDE = 38.6160
export const LONGITUDE = -90.2161

const LIGHT_RADIUS = 600       // directional light stays close for shadow quality
const SUN_VISUAL_RADIUS = 50000 // visual orb — far enough to eliminate parallax
const MOON_RADIUS = 50000
export const SKY_RADIUS = 55000

// Pre-allocated vectors for lighting computation (avoids per-frame GC pressure)
const _sunLP = new THREE.Vector3()
const _sunVP = new THREE.Vector3()
const _moonP = new THREE.Vector3()
const _secP = new THREE.Vector3()
const _nightLP = new THREE.Vector3()
const _sunD = new THREE.Vector3()
const _moonD = new THREE.Vector3()
const _lc1 = new THREE.Color()
const _lc2 = new THREE.Color()

function celestialToPosition(azimuth, altitude, radius, out, minY = null) {
  out.x = radius * Math.cos(altitude) * Math.sin(azimuth)
  out.y = radius * Math.sin(altitude)
  out.z = -radius * Math.cos(altitude) * Math.cos(azimuth)
  if (minY !== null) out.y = Math.max(out.y, minY)
  return out
}

function lerpColor(color1, color2, t) {
  _lc1.set(color1)
  _lc2.set(color2)
  _lc1.lerp(_lc2, t)
  return '#' + _lc1.getHexString()
}

// Shadow map baking: only re-render when sun moves meaningfully.
// Avoids drawing 1,729 buildings into a 4K shadow map 60x/sec.
const _prevShadowPos = new THREE.Vector3()

function PrimaryOrb({ lightPosition, visualPosition, color, intensity, showOrb, orbColor, orbSize }) {
  const lightRef = useRef()

  // Disable automatic shadow updates — we'll trigger manually
  useEffect(() => {
    if (lightRef.current) {
      lightRef.current.shadow.autoUpdate = false
      lightRef.current.shadow.needsUpdate = true
      _prevShadowPos.copy(lightPosition)
    }
  }, [])

  // Re-render shadow map only when light position shifts enough (~2° of sky movement)
  useFrame(() => {
    if (!lightRef.current) return
    const dx = lightPosition.x - _prevShadowPos.x
    const dy = lightPosition.y - _prevShadowPos.y
    const dz = lightPosition.z - _prevShadowPos.z
    const dist2 = dx * dx + dy * dy + dz * dz
    // ~20m movement on a 600m radius ≈ 2° arc
    if (dist2 > 400) {
      lightRef.current.shadow.needsUpdate = true
      _prevShadowPos.copy(lightPosition)
    }
  })

  return (
    <group>
      {showOrb && (
        <group position={visualPosition.toArray()}>
          <mesh>
            <sphereGeometry args={[orbSize, 32, 32]} />
            <meshBasicMaterial color={orbColor} />
          </mesh>
          <mesh scale={1.8}>
            <sphereGeometry args={[orbSize, 32, 32]} />
            <meshBasicMaterial color={orbColor} transparent opacity={0.3} />
          </mesh>
        </group>
      )}
      <directionalLight
        ref={lightRef}
        position={lightPosition.toArray()}
        intensity={intensity}
        color={color}
        castShadow
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-far={2400}
        shadow-camera-left={-900}
        shadow-camera-right={900}
        shadow-camera-top={900}
        shadow-camera-bottom={-900}
        shadow-bias={-0.0001}
        shadow-normalBias={0.15}
      />
    </group>
  )
}

function SecondaryOrb({ position, color, intensity }) {
  return (
    <directionalLight
      position={position.toArray()}
      intensity={intensity}
      color={color}
    />
  )
}

function Moon({ position, phase, illumination, visible }) {
  const moonRef = useRef()
  const glowRef = useRef()
  const moonTexture = useTexture(`${import.meta.env.BASE_URL}textures/moon.jpg`)

  const moonMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        moonMap: { value: moonTexture },
        phase: { value: phase },
        shadowColor: { value: new THREE.Color('#0a0a12') },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D moonMap;
        uniform float phase;
        uniform vec3 shadowColor;
        varying vec2 vUv;
        #define PI 3.14159265359
        void main() {
          vec2 uv = (vUv - 0.5) * 2.0;
          float dist = length(uv);
          float edgeWidth = fwidth(dist) * 1.5;
          float alpha = 1.0 - smoothstep(0.96 - edgeWidth, 0.96 + edgeWidth, dist);
          if (alpha < 0.01) discard;
          float z = sqrt(1.0 - min(dist * dist, 1.0));
          float theta = atan(uv.x, z);
          float phi = asin(clamp(uv.y, -1.0, 1.0));
          vec2 texUv;
          texUv.x = (theta / PI) * 0.5 + 0.5;
          texUv.y = (phi / PI) + 0.5;
          vec3 texColor = texture2D(moonMap, texUv).rgb;
          float angle = phase * 6.28318;
          float terminator = cos(angle);
          float lit = smoothstep(terminator - 0.12, terminator + 0.12, uv.x);
          // Shadow side goes transparent instead of black — sky shows through
          vec3 color = texColor * (0.85 + z * 0.15);
          float litAlpha = alpha * (0.04 + lit * 0.96);
          gl_FragColor = vec4(color, litAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
    })
  }, [moonTexture])

  const glowMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        glowColor: { value: new THREE.Color('#c8d8e8') },
        intensity: { value: illumination },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        uniform float intensity;
        varying vec2 vUv;
        void main() {
          vec2 uv = (vUv - 0.5) * 2.0;
          float dist = length(uv);
          float moonRadius = 0.25;
          float glow = 1.0 - smoothstep(moonRadius, 0.45, dist);
          glow = pow(glow, 3.0);
          glow *= smoothstep(0.15, moonRadius, dist);
          glow *= intensity * 0.01;
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
    }
    if (glowRef.current) {
      glowRef.current.quaternion.copy(camera.quaternion)
      glowRef.current.material.uniforms.intensity.value = illumination
    }
  })

  if (!visible) return null

  const moonSize = 350 * (MOON_RADIUS / 3400)  // scale proportionally to new distance
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

function GradientSky({ sunAltitude, sunDirection, moonGlow, isDawn }) {
  const materialRef = useRef()

  // 4-band sky color system: horizon → low → mid → high (zenith)
  // Separate dawn and dusk palettes — dawn is cooler/pink, dusk is warmer/amber.
  const colors = useMemo(() => {
    const C = (hex) => new THREE.Color(hex)
    const lerpBands = (a, b, t) => ({
      horizon: a.horizon.clone().lerp(b.horizon, t),
      low:     a.low.clone().lerp(b.low, t),
      mid:     a.mid.clone().lerp(b.mid, t),
      high:    a.high.clone().lerp(b.high, t),
    })

    const alt = sunAltitude

    // ── Night (shared) ──
    const night = {
      horizon: C('#1a1525'), low: C('#0f0f18'), mid: C('#080810'), high: C('#050508'),
    }

    // ── Day (shared) ──
    const day = {
      horizon: C('#9dc5e0'), low: C('#80b5e0'), mid: C('#5a9ce0'), high: C('#4a90e0'),
    }

    // ── Dusk keyframes — warm amber/coral/purple ──
    const duskDeep = { // sun ~ -0.04
      horizon: C('#7a3828'), low: C('#40253a'), mid: C('#181535'), high: C('#0a0c1a'),
    }
    const duskPeak = { // sun ~ 0.0  — the electric moment
      horizon: C('#cc6030'), low: C('#a05058'), mid: C('#4a3570'), high: C('#141835'),
    }
    const duskEarlyGolden = { // sun ~ 0.06
      horizon: C('#dd8840'), low: C('#bb7065'), mid: C('#6858a0'), high: C('#1a2555'),
    }
    const duskGolden = { // sun ~ 0.18
      horizon: C('#ccaa70'), low: C('#aa9088'), mid: C('#7090bb'), high: C('#3a68a8'),
    }

    // ── Dawn keyframes — cooler rose/steel/lavender ──
    const dawnDeep = { // sun ~ -0.04
      horizon: C('#3a2838'), low: C('#30254a'), mid: C('#151838'), high: C('#0a0c1a'),
    }
    const dawnPeak = { // sun ~ 0.0  — first light
      horizon: C('#c07050'), low: C('#885578'), mid: C('#4a3878'), high: C('#141838'),
    }
    const dawnEarlyGolden = { // sun ~ 0.06
      horizon: C('#dda065'), low: C('#b08088'), mid: C('#7068b0'), high: C('#223060'),
    }
    const dawnGolden = { // sun ~ 0.18
      horizon: C('#d0b888'), low: C('#a8a0a8'), mid: C('#7895c0'), high: C('#3a6aaa'),
    }

    // Select dawn vs dusk palette
    const deep         = isDawn ? dawnDeep         : duskDeep
    const peak         = isDawn ? dawnPeak          : duskPeak
    const earlyGolden  = isDawn ? dawnEarlyGolden   : duskEarlyGolden
    const golden       = isDawn ? dawnGolden        : duskGolden

    // ── Interpolate between adjacent keyframes ──
    let bands
    if (alt < -0.12) {
      bands = night
    } else if (alt < -0.02) {
      bands = lerpBands(night, deep, (alt + 0.12) / 0.10)
    } else if (alt < 0.03) {
      bands = lerpBands(deep, peak, (alt + 0.02) / 0.05)
    } else if (alt < 0.08) {
      bands = lerpBands(peak, earlyGolden, (alt - 0.03) / 0.05)
    } else if (alt < 0.22) {
      bands = lerpBands(earlyGolden, golden, (alt - 0.08) / 0.14)
    } else if (alt < 0.35) {
      bands = lerpBands(golden, day, (alt - 0.22) / 0.13)
    } else {
      bands = day
    }

    // Sun glow color: dawn is rosier, dusk is more amber
    let sunGlowColor
    if (alt < -0.1) {
      sunGlowColor = C('#000000')
    } else if (alt < 0.0) {
      const t = (alt + 0.1) / 0.1
      const warm = isDawn ? '#dd4433' : '#ff3318'
      const mid  = isDawn ? '#ee7755' : '#ff7733'
      sunGlowColor = C(warm).lerp(C(mid), t).multiplyScalar(t)
    } else if (alt < 0.08) {
      const t = alt / 0.08
      const from = isDawn ? '#ee7755' : '#ff7733'
      const to   = isDawn ? '#ffbb77' : '#ffaa55'
      sunGlowColor = C(from).lerp(C(to), t)
    } else if (alt < 0.3) {
      const t = (alt - 0.08) / 0.22
      sunGlowColor = C(isDawn ? '#ffbb77' : '#ffaa55').lerp(C('#ffeedd'), t)
    } else {
      sunGlowColor = C('#ffeedd')
    }

    // ── Weather-driven color enhancement ──
    const { sunsetPotential: sp, beautyBias: bb, storminess: storm } = useSkyState.getState()

    // Sunset/sunrise enhancement: push warm tones deeper
    if (sp > 0.3 && alt > -0.1 && alt < 0.3) {
      const f = ((sp - 0.3) / 0.7) * bb
      if (isDawn) {
        bands.horizon.lerp(C('#dd6644'), f * 0.2)
        bands.low.lerp(C('#bb5566'), f * 0.2)
        bands.mid.lerp(C('#553080'), f * 0.12)
        bands.high.lerp(C('#1a1250'), f * 0.08)
      } else {
        bands.horizon.lerp(C('#ee5522'), f * 0.25)
        bands.low.lerp(C('#cc4455'), f * 0.2)
        bands.mid.lerp(C('#4a2870'), f * 0.15)
        bands.high.lerp(C('#1a1045'), f * 0.1)
      }
      sunGlowColor.lerp(C('#ff4400'), f * 0.4)
    }

    // Storm: suppress warm tones, darken, desaturate
    if (storm > 0.5) {
      const f = (storm - 0.5) / 0.5
      bands.horizon.lerp(C('#2a2530'), f * 0.35)
      bands.low.lerp(C('#222028'), f * 0.35)
      bands.mid.lerp(C('#1c1a22'), f * 0.3)
      bands.high.lerp(C('#141418'), f * 0.3)
      sunGlowColor.multiplyScalar(1 - f * 0.6)
    }

    return { bands, sunGlowColor }
  }, [sunAltitude, isDawn])

  const baseStarOpacity = Math.max(0, Math.min(1, (-sunAltitude - 0.02) / 0.12))

  useFrame(() => {
    if (materialRef.current) {
      const u = materialRef.current.uniforms
      const planetariumActive = useCamera.getState().viewMode === 'planetarium'
      const dimFactor = planetariumActive ? 0.4 : 1.0
      // 4-band colors
      u.bandHorizon.value.copy(colors.bands.horizon).multiplyScalar(dimFactor)
      u.bandLow.value.copy(colors.bands.low).multiplyScalar(dimFactor)
      u.bandMid.value.copy(colors.bands.mid).multiplyScalar(dimFactor)
      u.bandHigh.value.copy(colors.bands.high).multiplyScalar(dimFactor)
      u.sunGlowColor.value.copy(colors.sunGlowColor).multiplyScalar(dimFactor)
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
      // Weather uniforms from useSkyState
      const sky = useSkyState.getState()
      u.uCloudCover.value = sky.cloudCover
      u.uStorminess.value = sky.storminess
      u.uTurbidity.value = sky.turbidity
      u.uSunsetPotential.value = sky.sunsetPotential
      u.uBeautyBias.value = sky.beautyBias
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
      varying vec3 vWorldPosition;

      void main() {
        vec3 dir = normalize(vWorldPosition);
        float h = dir.y;

        // 4-band sky gradient with visible banding at transitions
        float hn = pow(max(0.0, h), 0.65 * (1.0 + uTurbidity * 0.4));
        float t1 = smoothstep(0.0,  0.12, hn);  // horizon → low
        float t2 = smoothstep(0.10, 0.32, hn);  // low → mid
        float t3 = smoothstep(0.30, 0.65, hn);  // mid → high (zenith)
        vec3 skyColor = mix(bandHorizon, bandLow, t1);
        skyColor = mix(skyColor, bandMid, t2);
        skyColor = mix(skyColor, bandHigh, t3);

        // Below horizon: fade to dark ground
        float belowHorizon = smoothstep(0.0, -0.15, h);
        vec3 groundColor = bandHorizon * 0.3;
        vec3 finalColor = mix(skyColor, groundColor, belowHorizon);

        // ── Directional sun glow ──
        float sunDot = dot(dir, sunDir);

        // Tight bright core (visible sun disc on the sky dome)
        // Use exp() instead of pow() to avoid pow(0,large) GPU driver bugs
        float coreGlow = sunDot > 0.0 ? exp(256.0 * log(sunDot)) : 0.0;

        // Medium halo around sun
        float haloGlow = sunDot > 0.0 ? exp(16.0 * log(sunDot)) : 0.0;

        // Wide atmospheric scatter near horizon in sun's direction
        float horizonProximity = 1.0 - abs(h);
        float wideScatter = pow(max(0.0, sunDot), 3.0) * horizonProximity * horizonProximity;

        // Scale glow by sun altitude: strongest at sunrise/sunset, subtle at noon
        float twilightBoost = smoothstep(-0.15, 0.05, sunAlt) * (1.0 - smoothstep(0.05, 0.35, sunAlt));

        float glowIntensity = coreGlow * 1.5
                            + haloGlow * (0.25 + twilightBoost * 0.4)
                            + wideScatter * (0.15 + twilightBoost * 0.35);

        float sunVis = smoothstep(-0.12, 0.0, sunAlt);
        glowIntensity *= sunVis;

        finalColor += sunGlowColor * glowIntensity;

        // Warm the horizon on the sun's side
        float horizonWarm = pow(max(0.0, sunDot), 2.0) * (1.0 - abs(h)) * sunVis * 0.12;
        finalColor += vec3(0.15, 0.08, 0.02) * horizonWarm;

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

        // Fade to transparent below horizon so sky wraps closer to neighborhood
        float groundAlpha = smoothstep(-0.18, -0.02, h);
        gl_FragColor = vec4(finalColor, groundAlpha);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    transparent: true,
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

    for (let i = 0; i < N; i++) {
      const star = brightStars[i]
      raRad[i] = star.ra * DEG
      decRad[i] = star.dec * DEG

      // B-V color index → RGB (Ballesteros' formula approximation)
      const bv = star.ci
      let r, g, b
      if (bv < -0.2) { r = 0.55; g = 0.65; b = 1.0 }
      else if (bv < 0.0) { r = 0.7 + bv; g = 0.75 + bv * 0.5; b = 1.0 }
      else if (bv < 0.4) { r = 0.9 + bv * 0.25; g = 0.92 + bv * 0.1; b = 1.0 - bv * 0.5 }
      else if (bv < 0.8) { r = 1.0; g = 0.95 - (bv - 0.4) * 0.35; b = 0.8 - (bv - 0.4) * 0.6 }
      else if (bv < 1.2) { r = 1.0; g = 0.81 - (bv - 0.8) * 0.3; b = 0.56 - (bv - 0.8) * 0.4 }
      else if (bv < 1.6) { r = 1.0; g = 0.69 - (bv - 1.2) * 0.25; b = 0.4 - (bv - 1.2) * 0.2 }
      else { r = 1.0; g = 0.55; b = 0.3 }
      starColors[i * 3] = r
      starColors[i * 3 + 1] = g
      starColors[i * 3 + 2] = b

      // Size from magnitude: brighter = bigger point
      const magNorm = (6.0 - star.mag) / 7.5 // 0..1
      starSizes[i] = (0.8 + magNorm * magNorm * 5.0) * 20.0
    }

    const mat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0.0 } },
      vertexShader: `
        attribute float aSize;
        attribute vec3 aColor;
        varying vec3 vCol;
        varying float vBright;
        void main() {
          vCol = aColor;
          vBright = aSize / 120.0;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (800.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        varying vec3 vCol;
        varying float vBright;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = 1.0 - smoothstep(0.0, 0.5, d);
          a *= a;
          if (a * uOpacity < 0.005) discard;
          // Chromatic aberration: R shifts outward, B inward — stronger for bright stars
          float spread = 0.08 + vBright * 0.12;
          float dR = length((gl_PointCoord - 0.5) * (1.0 + spread));
          float dB = length((gl_PointCoord - 0.5) * (1.0 - spread));
          float aR = 1.0 - smoothstep(0.0, 0.5, dR); aR *= aR;
          float aB = 1.0 - smoothstep(0.0, 0.5, dB); aB *= aB;
          vec3 col = vec3(aR * vCol.r, a * vCol.g, aB * vCol.b);
          col *= 3.5; // brightness boost
          gl_FragColor = vec4(col * uOpacity, max(col.r, max(col.g, col.b)) * uOpacity);
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

    // ── Background filler stars (equatorial cartesian, rotated as rigid group) ──
    const NOISE_N = 3000
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
      noiseSizes[i] = (6.0 + rng() * 10.0) * 20.0
    }
    const nGeo = new THREE.BufferGeometry()
    nGeo.setAttribute('position', new THREE.BufferAttribute(noisePositions, 3))
    nGeo.setAttribute('aColor', new THREE.BufferAttribute(noiseColors, 3))
    nGeo.setAttribute('aSize', new THREE.BufferAttribute(noiseSizes, 1))
    // Explicit bounding sphere so frustum culling never hides the full-sky group
    nGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), SKY_RADIUS * 2)

    const nMat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0.0 } },
      vertexShader: `
        attribute float aSize;
        attribute vec3 aColor;
        varying vec3 vCol;
        void main() {
          vCol = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // max prevents blow-up when stars cross the camera's side plane
          gl_PointSize = aSize * (800.0 / max(-mv.z, 100.0));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        varying vec3 vCol;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = 1.0 - smoothstep(0.0, 0.5, d);
          a *= a;
          if (a * uOpacity < 0.005) discard;
          gl_FragColor = vec4(vCol * a * uOpacity, a * uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    return {
      starCatalog: { raRad, decRad, count: N, radius: R },
      starGeo: geo,
      starMat: mat,
      noiseGeo: nGeo,
      noiseMat: nMat,
    }
  }, [])

  // Update star positions each frame based on sidereal time (Earth rotation)
  // and fade opacity with sun altitude
  useFrame(() => {
    if (!starRef.current || !starMat) return
    const planetariumActive = useCamera.getState().viewMode === 'planetarium'
    const { astronomyAlpha } = useSkyState.getState()
    starMat.uniforms.uOpacity.value = planetariumActive ? 1.0 : astronomyAlpha

    // Skip expensive sidereal position computation when stars are invisible
    if (!planetariumActive && astronomyAlpha < 0.01) return

    // Scale star sizes in planetarium mode (40x for visibility at sky-dome distance)
    const sizeAttr = starRef.current.geometry.getAttribute('aSize')
    const wasScaled = sizeAttr._planetariumScaled === true
    if (wasScaled !== planetariumActive) {
      const arr = sizeAttr.array
      const scale = planetariumActive ? 40.0 : (1.0 / 40.0)
      for (let i = 0; i < arr.length; i++) arr[i] *= scale
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

      // Skip stars below horizon (optimization)
      if (alt < -0.05) {
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
      noiseMat.uniforms.uOpacity.value = planetariumActive ? 0.8 : astronomyAlpha * 0.85
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

  const planetariumActive = useCamera((s) => s.viewMode === 'planetarium')

  return (
    <>
      <mesh>
        <sphereGeometry args={[SKY_RADIUS, 64, 64]} />
        <primitive object={skyMaterial} ref={materialRef} />
      </mesh>
      <points ref={starRef} geometry={starGeo} material={starMat} frustumCulled={false} />
      <points ref={noiseRef} geometry={noiseGeo} material={noiseMat} frustumCulled={false} />
      {planetariumActive && <PlanetariumOverlay />}
    </>
  )
}

function CelestialBodies() {
  const { currentTime } = useTimeOfDay()

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

    const moon = {
      position: _moonP,
      phase: moonIllum.phase,
      illumination: moonIllum.fraction,
      visible: moonAlt > 0,
    }

    if (isNight) {
      const moonBrightness = 2.0 + moonIllum.fraction * 1.5
      if (moonAlt > 0) {
        celestialToPosition(moonPos.azimuth + Math.PI, moonPos.altitude, LIGHT_RADIUS, _nightLP)
      } else {
        _nightLP.set(200, 150, 200)
      }
      primary = {
        lightPosition: _nightLP,
        visualPosition: _nightLP,
        color: '#9ab8e0',
        intensity: moonBrightness,
        showOrb: false,
        orbColor: '#e8e8f0',
        orbSize: 12,
      }
      secondary = {
        position: _secP.set(-150, 100, -150),
        color: '#4466aa',
        intensity: 0.8,
      }
      sky = { top: '#0a1020', bottom: '#1a2545' }
      ambient = { color: '#3a4a70', intensity: 1.0 }
    } else if (isTwilight) {
      const t = (sunAlt + 0.12) / 0.17
      primary = {
        lightPosition: _sunLP,
        visualPosition: _sunVP,
        color: lerpColor('#ff6644', '#ffaa66', t),
        intensity: 0.4 + t * 0.3,
        showOrb: true,
        orbColor: lerpColor('#ff4422', '#ffaa55', t),
        orbSize: (25 - t * 5) * (SUN_VISUAL_RADIUS / LIGHT_RADIUS),
      }
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
      primary = {
        lightPosition: _sunLP,
        visualPosition: _sunVP,
        color: lerpColor('#ffaa55', '#fff8e8', t),
        intensity: 0.7 + t * 1.5,
        showOrb: true,
        orbColor: lerpColor('#ffcc66', '#ffffaa', t),
        orbSize: (20 - t * 2) * (SUN_VISUAL_RADIUS / LIGHT_RADIUS),
      }
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
      primary = {
        lightPosition: _sunLP,
        visualPosition: _sunVP,
        color: '#fffefa',
        intensity: 2.2,
        showOrb: true,
        orbColor: '#ffffee',
        orbSize: 18 * (SUN_VISUAL_RADIUS / LIGHT_RADIUS),
      }
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

    // Push celestial data to unified sky state store
    useSkyState.getState().setCelestial({
      sunDirection: _sunD,
      sunElevation: sunAlt,
      moonDirection: _moonD,
      moonPhase: moonIllum.phase,
      moonIllumination: moonIllum.fraction,
      moonAltitude: moonAlt,
    })

    // Dawn vs dusk: compare current time to solar noon
    const solarNoon = SunCalc.getTimes(currentTime, LATITUDE, LONGITUDE).solarNoon
    const isDawn = currentTime < solarNoon

    return { primary, secondary, sky, ambient, isNight, moon, sunAlt, sunDir: _sunD, moonGlow, isDawn }
  }, [currentTime])

  // Weather-coupled lighting multipliers (use selectors to avoid per-frame re-renders)
  const cc = useSkyState((s) => Math.round(s.cloudCover * 20) / 20)
  const st = useSkyState((s) => Math.round(s.storminess * 20) / 20)
  const primaryWeathered = useMemo(() => ({
    ...lighting.primary,
    intensity: lighting.primary.intensity * (1 - cc * 0.6),
  }), [lighting.primary, cc])

  return (
    <>
      <GradientSky sunAltitude={lighting.sunAlt} sunDirection={lighting.sunDir} moonGlow={lighting.moonGlow} isDawn={lighting.isDawn} />
      <Suspense fallback={null}>
        <Moon {...lighting.moon} />
      </Suspense>
      <ambientLight color="#ffffff" intensity={(lighting.isNight ? 0.45 : 0.45) * (1 + cc * 0.4)} />
      <ambientLight
        color={lighting.ambient.color}
        intensity={lighting.ambient.intensity * (1 + cc * 0.4)}
      />
      {/* Warm street-light scatter — simulates aggregate lamp glow in the atmosphere */}
      {lighting.isNight && (
        <ambientLight color="#8a7060" intensity={0.15} />
      )}
      <hemisphereLight
        color={lighting.isNight ? '#556688' : '#ffeedd'}
        groundColor={lighting.isNight ? '#443322' : '#443333'}
        intensity={(lighting.isNight ? 0.6 : 0.35) * (1 + cc * 0.5)}
      />
      <PrimaryOrb {...primaryWeathered} />
      <SecondaryOrb {...lighting.secondary} />
      <directionalLight
        position={[0, 100, -400]}
        intensity={lighting.isNight ? 0.5 : 0.12}
        color={lighting.isNight ? '#5577aa' : '#ffeedd'}
      />
    </>
  )
}

export default CelestialBodies
