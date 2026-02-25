import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import useTimeOfDay from '../hooks/useTimeOfDay'
import namedStarsData from '../data/planetarium/named_stars.json'
import constellationsData from '../data/planetarium/constellations.json'
import planetsData from '../data/planetarium/planets.json'

const DEG = Math.PI / 180
const LATITUDE = 38.6160
const LONGITUDE = -90.2161
const SKY_RADIUS = 55000
const R = SKY_RADIUS * 0.88

const sinLat = Math.sin(LATITUDE * DEG)
const cosLat = Math.cos(LATITUDE * DEG)

// Billboard text: always face camera, always right-side-up on screen
function orientOnDome(obj, camera) {
  obj.quaternion.copy(camera.quaternion)
}

// Shared LST computation
function getLST() {
  const { currentTime } = useTimeOfDay.getState()
  const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0)
  const daysSinceJ2000 = (currentTime.getTime() - J2000) / 86400000
  const GMST = (280.46061837 + 360.98564736629 * daysSinceJ2000) % 360
  const LST = ((GMST + LONGITUDE) % 360 + 360) % 360
  return { lstRad: LST * DEG, daysSinceJ2000 }
}

// Convert RA/Dec (degrees) to 3D position given current LST (radians)
// Always computes the correct position (even below horizon).
// Returns true if above horizon, false if below.
function raDecToXYZ(raDeg, decDeg, lstRad, out) {
  const raRad = raDeg * DEG
  const decRad = decDeg * DEG
  const ha = lstRad - raRad
  const sinDec = Math.sin(decRad)
  const cosDec = Math.cos(decRad)
  const cosHA = Math.cos(ha)
  const sinHA = Math.sin(ha)

  const sinAlt = sinDec * sinLat + cosDec * cosLat * cosHA
  const alt = Math.asin(sinAlt)
  const cosAlt = Math.cos(alt)

  const sinAz = -sinHA * cosDec * cosLat
  const cosAz = sinDec - sinAlt * sinLat
  const az = Math.atan2(sinAz, cosAz)

  out.x = R * cosAlt * Math.sin(az)
  out.y = R * sinAlt
  out.z = -R * cosAlt * Math.cos(az)
  return alt > 0
}

// ─── Kepler solver ─────────────────────────────────────────────────
function solveKepler(M, e, maxIter) {
  let E = M
  for (let i = 0; i < maxIter; i++) {
    E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
  }
  return E
}

function getOrbitalPosition(elem, T) {
  const a = elem.a0 + elem.aRate * T
  const e = elem.e0 + elem.eRate * T
  const I = (elem.I0 + elem.IRate * T) * DEG
  const L = (elem.L0 + elem.LRate * T) * DEG
  const wBar = (elem.wBar0 + elem.wBarRate * T) * DEG
  const Om = (elem.Om0 + elem.OmRate * T) * DEG

  const w = wBar - Om
  const M = L - wBar
  const E = solveKepler(M, e, 6)

  const xOrb = a * (Math.cos(E) - e)
  const yOrb = a * Math.sqrt(1 - e * e) * Math.sin(E)

  const cosW = Math.cos(w), sinW = Math.sin(w)
  const cosOm = Math.cos(Om), sinOm = Math.sin(Om)
  const cosI = Math.cos(I), sinI = Math.sin(I)

  const x = (cosW * cosOm - sinW * sinOm * cosI) * xOrb + (-sinW * cosOm - cosW * sinOm * cosI) * yOrb
  const y = (cosW * sinOm + sinW * cosOm * cosI) * xOrb + (-sinW * sinOm + cosW * cosOm * cosI) * yOrb
  const z = (sinW * sinI) * xOrb + (cosW * sinI) * yOrb

  return { x, y, z }
}

function getPlanetRaDec(planet, earth, T) {
  const pPos = getOrbitalPosition(planet, T)
  const ePos = getOrbitalPosition(earth, T)

  const dx = pPos.x - ePos.x
  const dy = pPos.y - ePos.y
  const dz = pPos.z - ePos.z

  const obliq = 23.4393 * DEG
  const cosObl = Math.cos(obliq)
  const sinObl = Math.sin(obliq)
  const eqY = dy * cosObl - dz * sinObl
  const eqZ = dy * sinObl + dz * cosObl

  const ra = Math.atan2(eqY, dx) / DEG
  const dec = Math.atan2(eqZ, Math.sqrt(dx * dx + eqY * eqY)) / DEG
  return { ra: ((ra % 360) + 360) % 360, dec }
}

// ─── Constellation Lines ───────────────────────────────────────────
function ConstellationLines() {
  const linesRef = useRef()

  const totalSegments = useMemo(() => {
    let total = 0
    for (const c of constellationsData) total += c.lines.length
    return total
  }, [])

  const lineGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const positions = new Float32Array(totalSegments * 2 * 3)
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geo
  }, [totalSegments])

  const lineMat = useMemo(() => new THREE.LineBasicMaterial({
    color: new THREE.Color('#c4a265'),
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [])

  const _v = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    if (!linesRef.current) return
    const { lstRad } = getLST()
    const posAttr = linesRef.current.geometry.getAttribute('position')
    const pos = posAttr.array

    let idx = 0
    for (const constellation of constellationsData) {
      for (const seg of constellation.lines) {
        raDecToXYZ(seg[0][0], seg[0][1], lstRad, _v)
        let x0 = _v.x, y0 = _v.y, z0 = _v.z
        raDecToXYZ(seg[1][0], seg[1][1], lstRad, _v)
        let x1 = _v.x, y1 = _v.y, z1 = _v.z

        if (y0 < 0 && y1 < 0) {
          // Both below horizon — hide entire segment (collapse to degenerate line)
          pos[idx] = 0; pos[idx + 1] = 0; pos[idx + 2] = 0; idx += 3
          pos[idx] = 0; pos[idx + 1] = 0; pos[idx + 2] = 0; idx += 3
        } else {
          // Clip below-horizon endpoint to the horizon (lerp to y=0)
          if (y0 < 0) {
            const t = y1 / (y1 - y0)
            x0 = x1 + t * (x0 - x1); y0 = 0; z0 = z1 + t * (z0 - z1)
          }
          if (y1 < 0) {
            const t = y0 / (y0 - y1)
            x1 = x0 + t * (x1 - x0); y1 = 0; z1 = z0 + t * (z1 - z0)
          }
          pos[idx] = x0; pos[idx + 1] = y0; pos[idx + 2] = z0; idx += 3
          pos[idx] = x1; pos[idx + 1] = y1; pos[idx + 2] = z1; idx += 3
        }
      }
    }
    posAttr.needsUpdate = true
  })

  return <lineSegments ref={linesRef} geometry={lineGeo} material={lineMat} frustumCulled={false} renderOrder={5} />
}

// ─── Constellation Star Glyphs ────────────────────────────────────
// Decorative star/circle markers at every constellation vertex
function ConstellationDots() {
  const dotsRef = useRef()

  // Collect unique star positions (RA/Dec pairs) from all constellation lines
  const uniqueStars = useMemo(() => {
    const seen = new Set()
    const stars = []
    for (const c of constellationsData) {
      for (const seg of c.lines) {
        for (const pt of seg) {
          const key = `${pt[0].toFixed(3)},${pt[1].toFixed(3)}`
          if (!seen.has(key)) {
            seen.add(key)
            stars.push([pt[0], pt[1]])
          }
        }
      }
    }
    return stars
  }, [])

  // Count how many line endpoints touch each star (degree/connectivity)
  const starDegrees = useMemo(() => {
    const counts = new Map()
    for (const c of constellationsData) {
      for (const seg of c.lines) {
        for (const pt of seg) {
          const key = `${pt[0].toFixed(3)},${pt[1].toFixed(3)}`
          counts.set(key, (counts.get(key) || 0) + 1)
        }
      }
    }
    return uniqueStars.map(s => counts.get(`${s[0].toFixed(3)},${s[1].toFixed(3)}`) || 1)
  }, [uniqueStars])

  const { dotGeo, dotMat } = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const positions = new Float32Array(uniqueStars.length * 3)
    const degrees = new Float32Array(uniqueStars.length)
    for (let i = 0; i < uniqueStars.length; i++) degrees[i] = starDegrees[i]
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aDegree', new THREE.BufferAttribute(degrees, 1))

    const mat = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `
        attribute float aDegree;
        varying float vDegree;
        void main() {
          vDegree = aDegree;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float baseSize = vDegree >= 3.0 ? 1200.0 : 800.0;
          gl_PointSize = baseSize * (800.0 / length(mv.xyz));
          // Fade out below horizon
          gl_PointSize *= smoothstep(-500.0, 0.0, position.y);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying float vDegree;
        #define PI 3.14159265359
        void main() {
          vec2 uv = (gl_PointCoord - 0.5) * 2.0;
          float d = length(uv);

          // Bright filled star core
          float star = 1.0 - smoothstep(0.0, 0.45, d);

          // Soft glow halo
          float halo = exp(-d * 3.0) * 0.3;

          // 4-pointed star rays for junction nodes (degree >= 3)
          float rays = 0.0;
          if (vDegree >= 3.0) {
            float angle = atan(uv.y, uv.x);
            float ray4 = pow(abs(cos(angle * 2.0)), 12.0);
            rays = ray4 * (1.0 - smoothstep(0.0, 0.9, d)) * 0.6;
          }

          float alpha = max(star, max(halo, rays));

          // White-hot center fading to warm gold
          float whiteness = 1.0 - smoothstep(0.0, 0.3, d);
          vec3 color = mix(vec3(1.0, 0.91, 0.69), vec3(1.0), whiteness);

          if (alpha < 0.01) discard;
          gl_FragColor = vec4(color * alpha, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    return { dotGeo: geo, dotMat: mat }
  }, [uniqueStars, starDegrees])

  const _v = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    if (!dotsRef.current) return
    const { lstRad } = getLST()
    const posAttr = dotsRef.current.geometry.getAttribute('position')
    const pos = posAttr.array

    for (let i = 0; i < uniqueStars.length; i++) {
      raDecToXYZ(uniqueStars[i][0], uniqueStars[i][1], lstRad, _v)
      pos[i * 3] = _v.x
      pos[i * 3 + 1] = _v.y
      pos[i * 3 + 2] = _v.z
    }
    posAttr.needsUpdate = true
  })

  return <points ref={dotsRef} geometry={dotGeo} material={dotMat} frustumCulled={false} renderOrder={6} />
}

// ─── Star Labels ───────────────────────────────────────────────────
function StarLabel({ star }) {
  const ref = useRef()
  const _v = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ camera }) => {
    if (!ref.current) return
    const { lstRad } = getLST()
    const visible = raDecToXYZ(star.ra, star.dec, lstRad, _v)
    ref.current.position.set(_v.x, _v.y, _v.z)
    ref.current.visible = visible
    if (visible) orientOnDome(ref.current, camera)
  })

  return (
    <Text
      ref={ref}
      fontSize={400}
      color="#e8dcc8"
      anchorX="left"
      anchorY="bottom"
      letterSpacing={0.15}
      outlineWidth={15}
      outlineColor="#000000"
      depthWrite={false}
      renderOrder={10}
    >
      {star.name}
    </Text>
  )
}

// ─── Constellation Labels ──────────────────────────────────────────
function ConstellationLabel({ constellation }) {
  const ref = useRef()
  const _v = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ camera }) => {
    if (!ref.current) return
    const { lstRad } = getLST()
    const visible = raDecToXYZ(constellation.labelRa, constellation.labelDec, lstRad, _v)
    ref.current.position.set(_v.x, _v.y, _v.z)
    ref.current.visible = visible
    if (visible) orientOnDome(ref.current, camera)
  })

  return (
    <Text
      ref={ref}
      fontSize={900}
      color="#c4a265"
      anchorX="center"
      anchorY="middle"
      letterSpacing={0.3}
      outlineWidth={20}
      outlineColor="#000000"
      depthWrite={false}
      renderOrder={10}
    >
      {constellation.name.toUpperCase()}
    </Text>
  )
}

// ─── Planet Markers ────────────────────────────────────────────────
const PLANET_SIZES = { Venus: 1.0, Jupiter: 0.85, Mars: 0.7, Saturn: 0.65, Mercury: 0.45 }

function PlanetMarker({ planet, earth }) {
  const glowRef = useRef()
  const textRef = useRef()
  const _v = useMemo(() => new THREE.Vector3(), [])
  const _dir = useMemo(() => new THREE.Vector3(), [])
  const planetColor = useMemo(() => new THREE.Color(planet.color), [planet.color])
  const baseSize = (PLANET_SIZES[planet.name] || 0.5) * 4000

  const glowMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: planetColor },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        vec2 uv = (vUv - 0.5) * 2.0;
        float d = length(uv);

        // Bright saturated core
        float core = 1.0 - smoothstep(0.0, 0.12, d);

        // Inner glow
        float glow = exp(-d * 5.0) * 0.7;

        // Outer soft halo
        float halo = exp(-d * 1.2) * 0.35;

        // 4-pointed diffraction spikes
        float angle = atan(uv.y, uv.x);
        float spikes = pow(abs(cos(angle * 2.0)), 24.0) * exp(-d * 1.8) * 0.4;

        float alpha = core + glow + halo + spikes;
        vec3 col = uColor * (glow * 2.0 + halo + spikes * 1.5);
        // White-hot center
        col += vec3(1.0) * core * 2.5;

        if (alpha < 0.01) discard;
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [planetColor])

  useFrame(({ camera }) => {
    const { lstRad, daysSinceJ2000 } = getLST()
    const T = daysSinceJ2000 / 36525

    const { ra, dec } = getPlanetRaDec(planet, earth, T)
    const visible = raDecToXYZ(ra, dec, lstRad, _v)

    if (glowRef.current) {
      glowRef.current.position.set(_v.x, _v.y, _v.z)
      glowRef.current.visible = visible
      // Billboard: always face camera
      glowRef.current.quaternion.copy(camera.quaternion)
    }
    if (textRef.current) {
      _dir.copy(_v).normalize().multiplyScalar(1400)
      const dir = _dir
      textRef.current.position.set(_v.x + dir.x, _v.y + dir.y, _v.z + dir.z)
      textRef.current.visible = visible
      if (visible) orientOnDome(textRef.current, camera)
    }
  })

  return (
    <>
      <mesh ref={glowRef} material={glowMat}>
        <planeGeometry args={[baseSize, baseSize]} />
      </mesh>
      <Text
        ref={textRef}
        fontSize={550}
        color={planet.color}
        anchorX="center"
        anchorY="bottom"
        letterSpacing={0.2}
        outlineWidth={15}
        outlineColor="#000000"
        depthWrite={false}
        renderOrder={10}
      >
        {planet.name}
      </Text>
    </>
  )
}

// ─── Main Overlay ──────────────────────────────────────────────────
export default function PlanetariumOverlay() {
  return (
    <group>
      <ConstellationLines />
      <ConstellationDots />
      {namedStarsData.map((star) => (
        <StarLabel key={star.name} star={star} />
      ))}
      {constellationsData.map((c) => (
        <ConstellationLabel key={c.abbr} constellation={c} />
      ))}
      {planetsData.planets.map((planet) => (
        <PlanetMarker key={planet.name} planet={planet} earth={planetsData.earth} />
      ))}
    </group>
  )
}
