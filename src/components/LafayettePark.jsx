import { useMemo, useRef, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useSkyState from '../hooks/useSkyState'
import parkWaterData from '../data/park_water.json'
import parkPathData from '../data/park_paths.json'
import { getElevation } from '../utils/elevation'
import useCartographStore from '../cartograph/stores/useCartographStore.js'
import { makeGrassMaterial } from './grassMaterial.js'
import { getLampLightmap } from './lampLightmap.js'

// Lafayette Park: ~350m square park (30 acres) centered at origin
// Bounded by Park Ave (N), Lafayette Ave (S),
// Mississippi Ave (W), Kennett Place (E)
// Grid rotation: Park Ave runs ~9.2° off E-W axis (clockwise from above)
const GRID_ROTATION = -9.2 * (Math.PI / 180)
// Pre-computed for world → park-local coordinate transform
const COS_GR = Math.cos(GRID_ROTATION)
const SIN_GR = Math.sin(GRID_ROTATION)

const PARK = {
  minX: -175, maxX: 175,
  minZ: -175, maxZ: 175,
  width: 350, depth: 350,
}

const FENCE_HEIGHT = 1.5
const FENCE_POST_SPACING = 8
const TAU = Math.PI * 2

// Lamp lightmap moved to ./lampLightmap.js for sharing with StreetRibbons.

// ── SVG clip mask for park boundary ──────────────────────────────────
const svgUrl = `${import.meta.env.BASE_URL}lafayette-square.svg?v=${Date.now()}`
const SVG_WORLD_X = -843.2
const SVG_WORLD_Z = -1156.1
const SVG_VB_W = 2000
const SVG_VB_H = 2000

// ── Park Ground with procedural grass texture ──────────────────────────
function ParkGround() {
  const [clipTexture, setClipTexture] = useState(null)
  // shaderRef is owned by the grass material factory and populated on compile.
  const grassMatObj = useMemo(() => makeGrassMaterial({
    lampLightmap: getLampLightmap(),
    clipMin: new THREE.Vector2(SVG_WORLD_X, SVG_WORLD_Z),
    clipSize: new THREE.Vector2(SVG_VB_W, SVG_VB_H),
  }), [])
  const grassShaderRef = grassMatObj.shaderRef

  // Fetch SVG and rasterize park-boundary to a clip mask texture
  useEffect(() => {
    fetch(svgUrl)
      .then(r => r.text())
      .then(svgText => {
        const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
        // Check for XML parse errors
        if (doc.querySelector('parsererror')) {
          console.warn('[ParkGround] SVG parse error:', doc.querySelector('parsererror').textContent)
          return
        }
        // The park boundary can come from two sources:
        // 1. The clip-path used by the paths group (simple closed polygon — preferred)
        // 2. The #park-boundary element (may be a sidewalk donut with 2 subpaths)
        // We prefer the clip-path because it's always a single closed polygon.
        let dAttrs = []

        // Strategy 1 (preferred): clip-path from the paths group
        const pathsGroup = doc.querySelector('[id="paths1"]')
        if (pathsGroup) {
          const clipped = pathsGroup.querySelector('[clip-path]') || pathsGroup
          const clipRef = (clipped.getAttribute('clip-path') || '').match(/url\(#(.+?)\)/)
          if (clipRef) {
            const clipEl = doc.querySelector(`[id="${clipRef[1]}"]`)
            if (clipEl) {
              dAttrs = [...clipEl.querySelectorAll('path')].map(p => p.getAttribute('d')).filter(Boolean)
            }
          }
        }

        // Strategy 2 (fallback): #park-boundary element — split multi-M paths
        // to fill each subpath separately (avoids winding cancellation)
        if (!dAttrs.length) {
          const boundary = doc.querySelector('[id^="park-boundary"]')
          if (boundary) {
            const ln = (boundary.tagName || '').toLowerCase()
            const paths = ln === 'path' ? [boundary] : [...boundary.querySelectorAll('path')]
            for (const p of paths) {
              const d = p.getAttribute('d')
              if (d) {
                // Split compound paths at M commands — fill each subpath independently
                // to avoid winding rule cancellation (outer+inner = empty with nonzero rule)
                for (const sub of d.split(/(?=M)/)) {
                  if (sub.length > 10) dAttrs.push(sub)
                }
              }
            }
          }
        }

        if (!dAttrs.length) { console.warn('[ParkGround] no park boundary found'); return }

        const RES = 4096
        const canvas = document.createElement('canvas')
        canvas.width = RES
        canvas.height = Math.round(RES * (SVG_VB_H / SVG_VB_W))
        const ctx = canvas.getContext('2d')

        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = '#fff'
        ctx.scale(canvas.width / SVG_VB_W, canvas.height / SVG_VB_H)

        // Fill park interior in white — grass renders inside this mask
        for (const d of dAttrs) {
          ctx.fill(new Path2D(d))
        }

        const tex = new THREE.CanvasTexture(canvas)
        tex.flipY = false
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
        tex.minFilter = THREE.LinearFilter
        setClipTexture(tex)
      })
      .catch(err => console.warn('[ParkGround] SVG fetch failed:', err))
  }, [])

  // Update clip uniform when texture loads (shader already compiled)
  useEffect(() => {
    if (grassShaderRef.current && clipTexture) {
      grassShaderRef.current.uniforms.uClipMap.value = clipTexture
      grassShaderRef.current.uniforms.uHasClip.value = 1.0
    }
  }, [clipTexture])

  const grassMat = grassMatObj.material

  useFrame(() => {
    if (grassShaderRef.current) {
      const { sunAltitude } = useTimeOfDay.getState().getLightingPhase()
      grassShaderRef.current.uniforms.uSunAltitude.value = sunAltitude
      // Apply clip mask (also handles HMR where shader recompiles after texture loaded)
      if (clipTexture) {
        grassShaderRef.current.uniforms.uClipMap.value = clipTexture
        grassShaderRef.current.uniforms.uHasClip.value = 1.0
      }
    }
  })

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]} receiveShadow material={grassMat} frustumCulled={false}>
      <planeGeometry args={[500, 500, 1, 1]} />
    </mesh>
  )
}

// ── Park Paths (ribbon meshes from park_paths.json) ──────────────────
// Canonical park paths live in park_paths.json (OSM-sourced, world-aligned).
// Designer renders them as 2D strips; shots render them as shaded ribbons
// using the same polylines — no more SVG rasterization. See
// `feedback_designer_is_canonical.md`.
const PATH_WIDTH_M = 2.8

function buildPathRibbons(paths, width) {
  const positions = [], indices = []
  let vOff = 0
  const half = width / 2
  for (const p of paths) {
    const pts = p.points || p
    if (!pts || pts.length < 2) continue
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i]
      let nx = 0, nz = 0
      if (i > 0) {
        const [px, pz] = pts[i - 1]
        const dx = x - px, dz = z - pz
        const len = Math.hypot(dx, dz) || 1
        nx += -dz / len; nz += dx / len
      }
      if (i < pts.length - 1) {
        const [nxp, nzp] = pts[i + 1]
        const dx = nxp - x, dz = nzp - z
        const len = Math.hypot(dx, dz) || 1
        nx += -dz / len; nz += dx / len
      }
      const nl = Math.hypot(nx, nz) || 1
      nx /= nl; nz /= nl
      // Ground reverted to flat (#19); paths flat at y=0.
      positions.push(x + nx * half, 0, z + nz * half)
      positions.push(x - nx * half, 0, z - nz * half)
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = vOff + i * 2
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
    vOff += pts.length * 2
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

function ParkPaths() {
  const pathShaderRef = useRef()

  const pathGeo = useMemo(
    () => buildPathRibbons(parkPathData.paths || [], PATH_WIDTH_M),
    []
  )

  // Gravel material — same pebble/voronoi shader as before, minus the
  // SVG-clip uniforms since the geometry IS the path shape now.
  const pathMat = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.95,
      color: '#928a7c',
    })
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSunAltitude = { value: 0.5 }
      shader.uniforms.uLampMap = { value: getLampLightmap() }
      pathShaderRef.current = shader

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         varying vec3 vPathPos;`
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vPathPos = (modelMatrix * vec4(position, 1.0)).xyz;`
      )

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         uniform float uSunAltitude;
         uniform sampler2D uLampMap;
         varying vec3 vPathPos;

         float pHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
         vec2 pHash2(vec2 p) { return vec2(pHash(p), pHash(p + vec2(37.0, 91.0))); }

         float pNoise(vec2 p) {
           vec2 i = floor(p), f = fract(p);
           f = f * f * (3.0 - 2.0 * f);
           return mix(mix(pHash(i), pHash(i+vec2(1,0)), f.x),
                      mix(pHash(i+vec2(0,1)), pHash(i+vec2(1,1)), f.x), f.y);
         }

         float pFBM(vec2 p) {
           float v = 0.0, a = 0.5;
           for (int i = 0; i < 4; i++) { v += a * pNoise(p); p *= 2.05; a *= 0.48; }
           return v;
         }

         vec3 pVoronoi(vec2 p) {
           vec2 ig = floor(p);
           vec2 fg = fract(p);
           float minD = 1.0;
           vec2 bestCell = vec2(0.0);
           for (int y = -1; y <= 1; y++) {
             for (int x = -1; x <= 1; x++) {
               vec2 nb = vec2(float(x), float(y));
               vec2 pt = pHash2(ig + nb);
               vec2 diff = nb + pt - fg;
               float d = dot(diff, diff);
               if (d < minD) { minD = d; bestCell = ig + nb; }
             }
           }
           return vec3(sqrt(minD), bestCell);
         }`
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         vec2 pp = vPathPos.xz;

         vec3 vr = pVoronoi(pp * 3.0);
         float vDist = vr.x;
         float stoneId = pHash(vr.yz);

         vec3 stoneCol = mix(vec3(0.28, 0.26, 0.23), vec3(0.32, 0.28, 0.22), step(0.3, stoneId));
         stoneCol = mix(stoneCol, vec3(0.35, 0.30, 0.24), step(0.6, stoneId));
         stoneCol = mix(stoneCol, vec3(0.18, 0.16, 0.13), step(0.85, stoneId));

         float gap = smoothstep(0.30, 0.38, vDist);
         vec3 gravelCol = mix(stoneCol, vec3(0.12, 0.10, 0.08), gap * 0.7);

         gravelCol *= 0.9 + pNoise(pp * 12.0 + vr.yz * 7.0) * 0.2;
         gravelCol = mix(gravelCol, gravelCol * 0.85, smoothstep(0.4, 0.65, pFBM(pp * 0.3)));

         float dayBright = smoothstep(-0.12, 0.3, uSunAltitude);
         float brightness = mix(0.7, 1.0, dayBright);
         vec3 nightTint = vec3(0.6, 0.7, 1.0);
         gravelCol = mix(gravelCol * nightTint, gravelCol, dayBright) * brightness;

         vec2 pathLampUV = (pp + 200.0) / 400.0;
         float pathLampI = texture2D(uLampMap, pathLampUV).r;
         float pathLampOn = clamp((0.15 - uSunAltitude) / 0.45, 0.0, 1.0);
         gravelCol += vec3(0.50, 0.45, 0.28) * pathLampI * pathLampOn * 0.7;

         diffuseColor.rgb = pow(gravelCol, vec3(2.2));`
      )
    }
    return mat
  }, [])

  useFrame(() => {
    if (pathShaderRef.current) {
      pathShaderRef.current.uniforms.uSunAltitude.value = useTimeOfDay.getState().getLightingPhase().sunAltitude
    }
  })

  // Counter-rotate: park_paths.json coords are world-aligned (OSM), parent
  // LafayettePark group carries GRID_ROTATION.
  return (
    <group rotation={[0, -GRID_ROTATION, 0]} position={[0, 0.4, 0]}>
      <mesh geometry={pathGeo} material={pathMat} receiveShadow frustumCulled={false} />
    </group>
  )
}

// ── Park Water Features (Lake + Grotto Pond) ─────────────────────────
function ParkWater() {
  const waterShaderRef = useRef()

  // Build water + island + bank geometries from polygon data
  const { lakeWaterGeo, grottoWaterGeo, islandGeo, lakeBankGeo, grottoBankGeo,
          lakeY, grottoY, islandY } = useMemo(() => {
    // Helper: polygon array → THREE.Shape (x,z coords mapped to x,y in shape space)
    // Ensures CCW winding (required by THREE.Shape for outer rings)
    const polyToShape = (pts) => {
      // Compute signed area to detect winding
      let area = 0
      const n = pts.length - 1 // skip closing duplicate
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]
      }
      // If CW (negative area), reverse to make CCW
      const ordered = area < 0 ? [...pts].reverse() : pts
      const shape = new THREE.Shape()
      shape.moveTo(ordered[0][0], ordered[0][1])
      for (let i = 1; i < ordered.length; i++) shape.lineTo(ordered[i][0], ordered[i][1])
      shape.closePath()
      return shape
    }

    // Helper: polygon array → THREE.Path for holes (CW winding)
    const polyToHole = (pts) => {
      let area = 0
      const n = pts.length - 1
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]
      }
      // If CCW (positive area), reverse to make CW for hole
      const ordered = area > 0 ? [...pts].reverse() : pts
      const path = new THREE.Path()
      path.moveTo(ordered[0][0], ordered[0][1])
      for (let i = 1; i < ordered.length; i++) path.lineTo(ordered[i][0], ordered[i][1])
      path.closePath()
      return path
    }

    // Helper: expand polygon outward using vertex normals (handles concave shapes)
    const expandPoly = (pts, offset) => {
      // Strip closing duplicate if present
      const n = (pts.length > 1 && pts[pts.length - 1][0] === pts[0][0] && pts[pts.length - 1][1] === pts[0][1])
        ? pts.length - 1 : pts.length
      const result = []
      for (let i = 0; i < n; i++) {
        const prev = pts[(i - 1 + n) % n]
        const curr = pts[i]
        const next = pts[(i + 1) % n]
        // Edge normals (outward assuming CCW winding)
        const e1x = curr[0] - prev[0], e1z = curr[1] - prev[1]
        const e2x = next[0] - curr[0], e2z = next[1] - curr[1]
        let n1x = -e1z, n1z = e1x
        let n2x = -e2z, n2z = e2x
        const l1 = Math.sqrt(n1x * n1x + n1z * n1z)
        const l2 = Math.sqrt(n2x * n2x + n2z * n2z)
        if (l1 > 0.001) { n1x /= l1; n1z /= l1 }
        if (l2 > 0.001) { n2x /= l2; n2z /= l2 }
        // Average normal at vertex
        let nx = n1x + n2x, nz = n1z + n2z
        const nl = Math.sqrt(nx * nx + nz * nz)
        if (nl > 0.001) { nx /= nl; nz /= nl }
        else { nx = n1x; nz = n1z }
        result.push([curr[0] + nx * offset, curr[1] + nz * offset])
      }
      // Re-close
      result.push([result[0][0], result[0][1]])
      return result
    }

    // ShapeGeometry lives in XY plane. rotateX(-PI/2) maps (x, y, 0) → (x, 0, -y).
    // Water polygon coords are [x, z] with z+ = south. To get correct mesh z,
    // negate z before shape creation: shape(x, -z) → mesh(x, 0, -(-z)) = (x, 0, z). ✓
    const negZ = (pts) => pts.map(([x, z]) => [x, -z])

    // Lake outer shape with island hole
    const lakeShape = polyToShape(negZ(parkWaterData.lake.outer))
    lakeShape.holes.push(polyToHole(negZ(parkWaterData.lake.island)))

    const lakeWaterGeo = new THREE.ShapeGeometry(lakeShape)
    lakeWaterGeo.rotateX(-Math.PI / 2) // lay flat

    // Grotto pond
    const grottoShape = polyToShape(negZ(parkWaterData.grotto))
    const grottoWaterGeo = new THREE.ShapeGeometry(grottoShape)
    grottoWaterGeo.rotateX(-Math.PI / 2)

    // Island (grass patch)
    const islandShape = polyToShape(negZ(parkWaterData.lake.island))
    const islandGeo = new THREE.ShapeGeometry(islandShape)
    islandGeo.rotateX(-Math.PI / 2)

    // Shoreline banks — solid expanded shapes rendered below water level.
    // Water on top covers the interior; only the 1-2m outer edge peeks out.
    // Expand in original coords (correct normals), then negZ for rendering.
    const lakeBankGeo = new THREE.ShapeGeometry(polyToShape(negZ(expandPoly(parkWaterData.lake.outer, 1.5))))
    lakeBankGeo.rotateX(-Math.PI / 2)

    const grottoBankGeo = new THREE.ShapeGeometry(polyToShape(negZ(expandPoly(parkWaterData.grotto, 1.2))))
    grottoBankGeo.rotateX(-Math.PI / 2)

    // Ground reverted to flat (#19); water/island all at y=0.
    return { lakeWaterGeo, grottoWaterGeo, islandGeo, lakeBankGeo, grottoBankGeo,
             lakeY: 0, grottoY: 0, islandY: 0 }
  }, [])

  // Animated water material with ripple shader
  const waterMat = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: '#1a4a5a',
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      roughness: 0.15,
      metalness: 0.35,
      side: THREE.DoubleSide,
    })
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 }
      shader.uniforms.uSunAltitude = { value: 0.5 }
      waterShaderRef.current = shader

      // Vertex: pass world position to fragment
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         varying vec3 vWaterWorld;`
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vWaterWorld = (modelMatrix * vec4(position, 1.0)).xyz;`
      )

      // Fragment: animated ripples + refraction distortion + depth darkening
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         uniform float uSunAltitude;
         varying vec3 vWaterWorld;

         // Hash + noise for water
         float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
         float wNoise(vec2 p) {
           vec2 i = floor(p), f = fract(p);
           f = f * f * (3.0 - 2.0 * f);
           return mix(
             mix(wHash(i), wHash(i + vec2(1,0)), f.x),
             mix(wHash(i + vec2(0,1)), wHash(i + vec2(1,1)), f.x), f.y);
         }
         float wFBM(vec2 p) {
           float v = 0.0, a = 0.5;
           for (int i = 0; i < 5; i++) { v += a * wNoise(p); p *= 2.03; a *= 0.49; }
           return v;
         }`
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         vec2 wp = vWaterWorld.xz;

         // ── Animated ripple layers ──
         // Slow large ripples (wind-driven waves)
         float r1 = wFBM(wp * 0.12 + uTime * vec2(0.08, 0.05));
         // Medium ripples (cross-wave interference)
         float r2 = wFBM(wp * 0.3 + uTime * vec2(-0.12, 0.09));
         // Fine surface texture (capillary ripples)
         float r3 = wNoise(wp * 1.2 + uTime * vec2(0.2, -0.15));
         // Slow circular ripple pattern (like a disturbance)
         float dist = length(wp - vec2(25.0, 60.0));
         float circular = sin(dist * 0.4 - uTime * 1.5) * 0.5 + 0.5;
         circular *= smoothstep(50.0, 10.0, dist);

         // Combine ripple layers
         float ripple = r1 * 0.4 + r2 * 0.35 + r3 * 0.15 + circular * 0.1;

         // ── Water color with fake refraction ──
         // Distort UV by ripple for refraction effect
         vec2 refractOffset = vec2(
           wNoise(wp * 0.25 + uTime * 0.06) - 0.5,
           wNoise(wp * 0.25 + uTime * 0.06 + 100.0) - 0.5
         ) * 0.08;
         float refractedNoise = wFBM((wp + refractOffset) * 0.15);

         // Base water colors — deep and shallow tones
         vec3 wDeep    = vec3(0.06, 0.18, 0.25);  // dark teal depths
         vec3 wMid     = vec3(0.10, 0.28, 0.32);  // mid-water
         vec3 wShallow = vec3(0.14, 0.38, 0.38);  // lighter edges
         vec3 wHighlight = vec3(0.35, 0.55, 0.58); // ripple peaks / sun glints

         // Mix based on ripple + refraction
         vec3 waterCol = mix(wDeep, wMid, smoothstep(0.3, 0.55, ripple));
         waterCol = mix(waterCol, wShallow, smoothstep(0.5, 0.7, refractedNoise));

         // Specular-like highlights on ripple crests
         float highlight = smoothstep(0.62, 0.78, ripple) * smoothstep(0.5, 0.7, r1);
         waterCol = mix(waterCol, wHighlight, highlight * 0.6);

         // Subtle caustic pattern on the surface
         float caustic1 = wNoise(wp * 0.8 + uTime * vec2(0.15, 0.1));
         float caustic2 = wNoise(wp * 0.8 + uTime * vec2(-0.1, 0.15) + 50.0);
         float caustic = smoothstep(0.4, 0.6, caustic1) * smoothstep(0.4, 0.6, caustic2);
         waterCol += vec3(0.04, 0.07, 0.06) * caustic;

         // ── Time-of-day ──
         float dayBright = smoothstep(-0.12, 0.3, uSunAltitude);
         float brightness = mix(0.45, 1.0, dayBright);
         // Night: darker, more blue/indigo
         vec3 nightWater = vec3(0.05, 0.08, 0.16);
         waterCol = mix(nightWater, waterCol, dayBright) * brightness;

         // Moon/street light reflection at night
         float nightGlint = (1.0 - dayBright) * highlight * 0.4;
         waterCol += vec3(0.15, 0.18, 0.25) * nightGlint;

         // sRGB → linear
         diffuseColor.rgb = pow(waterCol, vec3(2.2));

         // Vary alpha slightly with ripple (thinner at highlights)
         diffuseColor.a = mix(0.72, 0.88, smoothstep(0.3, 0.6, ripple));`
      )
    }
    return mat
  }, [])

  // Animate water
  useFrame((_, delta) => {
    if (waterShaderRef.current) {
      waterShaderRef.current.uniforms.uTime.value += delta
      const { sunAltitude } = useTimeOfDay.getState().getLightingPhase()
      waterShaderRef.current.uniforms.uSunAltitude.value = sunAltitude
    }
  })

  // Simple island grass material
  const islandMat = useMemo(() =>
    new THREE.MeshStandardMaterial({ color: '#2a5528', roughness: 0.9 }), [])

  // Shoreline bank material
  const bankMat = useMemo(() =>
    new THREE.MeshStandardMaterial({ color: '#5a5040', roughness: 0.95 }), [])

  // The lake + grotto water polygons were captured in a frame rotated +9.2°
  // relative to the park grid. The island sits in the correct world
  // position, so we rotate ONLY the water + bank meshes by -9.2° around
  // the island centroid — this keeps the water's island-hole aligned with
  // the island while the lake shape rotates into its correct orientation.
  // Island centroid in local park coords: (33.96, 86.00); mesh world after
  // negZ + rotateX(-PI/2) is (33.96, 0, 86.00).
  const ISLAND_PIVOT = [33.96, 0, 86.00]
  return (
    <group>
      {/* Water + banks rotate around the island to correct the capture-frame tilt */}
      <group position={ISLAND_PIVOT}>
        <group rotation={[0, -GRID_ROTATION, 0]}>
          <group position={[-ISLAND_PIVOT[0], 0, -ISLAND_PIVOT[2]]}>
            <mesh geometry={lakeBankGeo}   position={[0, lakeY   + 0.2,  0]} receiveShadow material={bankMat} />
            <mesh geometry={grottoBankGeo} position={[0, grottoY + 0.2,  0]} receiveShadow material={bankMat} />
            <mesh geometry={lakeWaterGeo}  position={[0, lakeY   + 0.35, 0]} receiveShadow material={waterMat} />
            <mesh geometry={grottoWaterGeo} position={[0, grottoY + 0.35, 0]} receiveShadow material={waterMat} />
          </group>
        </group>
      </group>

      {/* Island stays at its correct world position (not rotated) */}
      <mesh geometry={islandGeo} position={[0, islandY + 0.4, 0]} receiveShadow material={islandMat} />
    </group>
  )
}


// ── Perimeter Fence ────────────────────────────────────────────────────
function PerimeterFence() {
  const { posts, rails } = useMemo(() => {
    const inset = 2
    const corners = [
      [PARK.minX + inset, PARK.minZ + inset],
      [PARK.maxX - inset, PARK.minZ + inset],
      [PARK.maxX - inset, PARK.maxZ - inset],
      [PARK.minX + inset, PARK.maxZ - inset],
    ]
    const posts = [], rails = []
    for (let side = 0; side < 4; side++) {
      const [x1, z1] = corners[side]
      const [x2, z2] = corners[(side + 1) % 4]
      const dx = x2 - x1, dz = z2 - z1
      const len = Math.sqrt(dx * dx + dz * dz)
      const count = Math.floor(len / FENCE_POST_SPACING)
      for (let i = 0; i <= count; i++) {
        const t = i / count
        posts.push([x1 + dx * t, 0, z1 + dz * t])
      }
      rails.push({ from: [x1, z1], to: [x2, z2] })
    }
    return { posts, rails }
  }, [])

  return (
    <group>
      {posts.map((pos, i) => (
        <mesh key={`p${i}`} position={[pos[0], FENCE_HEIGHT / 2, pos[2]]} castShadow>
          <boxGeometry args={[0.15, FENCE_HEIGHT, 0.15]} />
          <meshStandardMaterial color="#2a2a2a" roughness={0.7} metalness={0.3} />
        </mesh>
      ))}
      {rails.map((rail, i) => {
        const mx = (rail.from[0] + rail.to[0]) / 2
        const mz = (rail.from[1] + rail.to[1]) / 2
        const dx = rail.to[0] - rail.from[0], dz = rail.to[1] - rail.from[1]
        const len = Math.sqrt(dx * dx + dz * dz)
        const angle = Math.atan2(dx, dz)
        return (
          <group key={`r${i}`}>
            <mesh position={[mx, FENCE_HEIGHT * 0.9, mz]} rotation={[0, angle, 0]}>
              <boxGeometry args={[0.08, 0.08, len]} />
              <meshStandardMaterial color="#1a1a1a" roughness={0.6} metalness={0.4} />
            </mesh>
            <mesh position={[mx, FENCE_HEIGHT * 0.3, mz]} rotation={[0, angle, 0]}>
              <boxGeometry args={[0.08, 0.08, len]} />
              <meshStandardMaterial color="#1a1a1a" roughness={0.6} metalness={0.4} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

// ── Main Park Component ────────────────────────────────────────────────
function LafayettePark() {
  return (
    <group rotation={[0, GRID_ROTATION, 0]}>
      {/* ParkGround retired — StreetRibbons' park face now owns the grass surface (Phase 11.3, 2026-04-17). */}
      <ParkWater />
      <ParkPaths />
      <PerimeterFence />

      <Text
        position={[0, 0.08, PARK.minZ - 15]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={6}
        color="#e8e8f0"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.15}
        outlineWidth={0.7}
        outlineColor="#14141c"
      >
        LAFAYETTE PARK
      </Text>
      <Text
        position={[0, 0.08, PARK.minZ - 23]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={3}
        color="#888890"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.08}
        outlineWidth={0.35}
        outlineColor="#14141c"
      >
        {'EST. 1851 \u00B7 ST. LOUIS, MO'}
      </Text>
    </group>
  )
}

export default LafayettePark
