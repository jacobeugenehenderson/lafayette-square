import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import useTimeOfDay from '../hooks/useTimeOfDay'
import lampData from '../data/street_lamps.json'

// Street light post: thin cylinder + lamp head
// Uses InstancedMesh for performance (641 posts, 641 lamp heads)
const POST_HEIGHT = 7
const POST_RADIUS = 0.12
const HEAD_RADIUS = 0.4
const HEAD_HEIGHT = 0.5

// Warm sodium vapor lamp color
const LAMP_COLOR_ON = new THREE.Color('#ffcc66')
const LAMP_COLOR_OFF = new THREE.Color('#444444')

// Ground light pool
const POOL_RADIUS = 12
const POOL_Y = 0.05  // just above ground

// Dynamic PointLights — nearest N lamps get real lights that illuminate surfaces
const DYNAMIC_LIGHT_COUNT = 24

function StreetLights() {
  const postRef = useRef()
  const headRef = useRef()
  const poolRef = useRef()
  const lightsRef = useRef([])
  const prevLitRef = useRef(null)
  const getLightingPhase = useTimeOfDay((s) => s.getLightingPhase)
  const { scene } = useThree()

  const lamps = lampData.lamps
  const count = lamps.length

  const postGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(POST_RADIUS * 0.7, POST_RADIUS, POST_HEIGHT, 6)
    g.translate(0, POST_HEIGHT / 2, 0)
    return g
  }, [])

  const headGeo = useMemo(() => {
    const g = new THREE.SphereGeometry(HEAD_RADIUS, 8, 6)
    g.scale(1, 0.6, 1)
    return g
  }, [])

  const poolGeo = useMemo(() => new THREE.CircleGeometry(POOL_RADIUS, 24), [])

  const poolMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color('#ffcc66') },
      uIntensity: { value: 0.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec2 vUv;
      void main() {
        float dist = length(vUv - 0.5) * 2.0;
        // Softer radial falloff — cubic ease for natural light spread
        float falloff = 1.0 - smoothstep(0.0, 1.0, dist);
        falloff = falloff * falloff * falloff;
        // Reduce center brightness, more even spread
        float alpha = falloff * uIntensity * 0.5;
        gl_FragColor = vec4(uColor * 0.8, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [])

  const postMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#1a1a1a',
    roughness: 0.7,
    metalness: 0.5,
  }), [])

  const headMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: LAMP_COLOR_OFF,
    emissive: LAMP_COLOR_OFF,
    emissiveIntensity: 0,
    roughness: 0.3,
    metalness: 0.1,
  }), [])

  // Create dynamic PointLight objects for real surface illumination
  useEffect(() => {
    const lights = []
    for (let i = 0; i < DYNAMIC_LIGHT_COUNT; i++) {
      const light = new THREE.PointLight('#ffcc66', 0, 35, 1.5)
      light.position.set(0, -1000, 0) // start offscreen
      scene.add(light)
      lights.push(light)
    }
    lightsRef.current = lights
    return () => {
      lights.forEach(l => scene.remove(l))
    }
  }, [scene])

  // Set instance transforms
  useEffect(() => {
    if (!postRef.current || !headRef.current || !poolRef.current) return
    const dummy = new THREE.Object3D()

    lamps.forEach((lamp, i) => {
      // Post
      dummy.position.set(lamp.x, 0, lamp.z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      postRef.current.setMatrixAt(i, dummy.matrix)

      // Lamp head
      dummy.position.set(lamp.x, POST_HEIGHT + HEAD_HEIGHT * 0.3, lamp.z)
      dummy.updateMatrix()
      headRef.current.setMatrixAt(i, dummy.matrix)

      // Ground light pool (circle flat on ground)
      dummy.position.set(lamp.x, POOL_Y, lamp.z)
      dummy.rotation.set(-Math.PI / 2, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      poolRef.current.setMatrixAt(i, dummy.matrix)
    })

    postRef.current.instanceMatrix.needsUpdate = true
    headRef.current.instanceMatrix.needsUpdate = true
    poolRef.current.instanceMatrix.needsUpdate = true
  }, [lamps])

  const prevIntensityRef = useRef(-1)
  const sortScratch = useMemo(() => lamps.map((l, i) => ({ i, x: l.x, z: l.z, d: 0 })), [lamps])

  useFrame(({ camera }) => {
    if (!headRef.current) return
    const { shouldGlow, sunAltitude } = getLightingPhase()

    if (!shouldGlow) {
      if (prevIntensityRef.current !== 0) {
        prevIntensityRef.current = 0
        headMat.emissive.copy(LAMP_COLOR_OFF)
        headMat.emissiveIntensity = 0
        headMat.color.copy(LAMP_COLOR_OFF)
        headMat.needsUpdate = true
        poolMat.uniforms.uIntensity.value = 0
        // Turn off all dynamic lights
        lightsRef.current.forEach(l => { l.intensity = 0 })
      }
      return
    }

    const t = Math.min(1, Math.max(0, (0.05 - sunAltitude) / 0.35))
    const intensity = 1.0 + t * 7.0

    const rounded = Math.round(intensity * 10) / 10
    if (prevIntensityRef.current !== rounded) {
      prevIntensityRef.current = rounded
      headMat.emissive.copy(LAMP_COLOR_ON)
      headMat.emissiveIntensity = intensity
      headMat.color.copy(LAMP_COLOR_ON)
      headMat.needsUpdate = true
    }

    // Ground pool — softer than before
    poolMat.uniforms.uIntensity.value = Math.min(1.0, t * 0.5)

    // Position dynamic PointLights at the nearest lamps to camera
    const cx = camera.position.x, cz = camera.position.z
    for (let j = 0; j < sortScratch.length; j++) {
      const s = sortScratch[j]
      const dx = s.x - cx, dz = s.z - cz
      s.d = dx * dx + dz * dz
    }
    // Partial sort: find the closest N (selection sort for small N)
    for (let j = 0; j < DYNAMIC_LIGHT_COUNT && j < sortScratch.length; j++) {
      let minIdx = j
      for (let k = j + 1; k < sortScratch.length; k++) {
        if (sortScratch[k].d < sortScratch[minIdx].d) minIdx = k
      }
      if (minIdx !== j) {
        const tmp = sortScratch[j]
        sortScratch[j] = sortScratch[minIdx]
        sortScratch[minIdx] = tmp
      }
    }

    // PointLight intensity: ramp with darkness, scale with distance-based decay
    const lightIntensity = t * 40
    const lights = lightsRef.current
    for (let j = 0; j < DYNAMIC_LIGHT_COUNT; j++) {
      const lamp = sortScratch[j]
      lights[j].position.set(lamp.x, POST_HEIGHT - 0.5, lamp.z)
      lights[j].intensity = lightIntensity
    }
  })

  return (
    <group>
      <instancedMesh ref={postRef} args={[postGeo, postMat, count]} castShadow />
      <instancedMesh ref={headRef} args={[headGeo, headMat, count]} />
      <instancedMesh ref={poolRef} args={[poolGeo, poolMat, count]} />
    </group>
  )
}

export default StreetLights
