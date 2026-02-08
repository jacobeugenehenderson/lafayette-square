import { useMemo, useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import useTimeOfDay from '../hooks/useTimeOfDay'
import parkTreeData from '../data/park_trees.json'
import parkWaterData from '../data/park_water.json'
import parkPathData from '../data/park_paths.json'
import leafTypesData from '../data/leafTypes.json'

// Lafayette Park: ~350m square park (30 acres) centered at origin
// Bounded by Park Ave (N), Lafayette Ave (S),
// Mississippi Ave (W), Kennett Place (E)
// Grid rotation: Park Ave runs ~9.2° off E-W axis (clockwise from above)
const GRID_ROTATION = -9.2 * (Math.PI / 180)

const PARK = {
  minX: -175, maxX: 175,
  minZ: -175, maxZ: 175,
  width: 350, depth: 350,
}

const FENCE_HEIGHT = 1.5
const FENCE_POST_SPACING = 8
const TAU = Math.PI * 2

// Foliage color palettes per tree shape
const CANOPY_COLORS = {
  broad:       ['#2d5a28', '#1e4a1e', '#3a6a30', '#2a5525', '#35622d', '#24501e', '#336628', '#2b5822'],
  conifer:     ['#1a3a1a', '#1e4028', '#1a3520', '#204530', '#183318', '#1c3822'],
  ornamental:  ['#3d6d35', '#358030', '#4a7a3a', '#357030', '#3a7535', '#408535'],
  columnar:    ['#2a5a30', '#305a35', '#2a5038', '#355a3a', '#2d5530', '#2a4d2d'],
  weeping:     ['#3a6a28', '#4a7a30', '#3d6a25', '#357525', '#426e2d', '#4a7828'],
}


// Build species → morphology type lookup from leafTypes.json
const SPECIES_TO_MORPH = {}
leafTypesData.types.forEach(lt => {
  lt.species.forEach(sp => { SPECIES_TO_MORPH[sp] = lt.id })
})

// Crossed-plane billboard geometry for leaf cards
function makeCrossedPlaneGeo() {
  const positions = []
  const normals = []
  const uvs = []
  const indices = []
  // Tilt planes ~34° from vertical so leaf faces are visible from overhead
  const TILT = 0.6
  const cosT = Math.cos(TILT), sinT = Math.sin(TILT)
  for (let p = 0; p < 3; p++) {
    const angle = (p / 3) * Math.PI
    const cos = Math.cos(angle), sin = Math.sin(angle)
    const vOff = p * 4
    const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]
    const planeUV = [[0,0], [1,0], [1,1], [0,1]]
    for (let c = 0; c < 4; c++) {
      const [lx, ly] = corners[c]
      positions.push(lx * cos + ly * sinT * sin, ly * cosT, lx * sin - ly * sinT * cos)
      normals.push(-cosT * sin, sinT, cosT * cos)
      uvs.push(planeUV[c][0], planeUV[c][1])
    }
    indices.push(vOff, vOff + 1, vOff + 2, vOff, vOff + 2, vOff + 3)
  }
  const hOff = 3 * 4
  const hy = 0.15
  positions.push(-0.5, hy, -0.5, 0.5, hy, -0.5, 0.5, hy, 0.5, -0.5, hy, 0.5)
  normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0)
  uvs.push(0, 0, 1, 0, 1, 1, 0, 1)
  indices.push(hOff, hOff + 1, hOff + 2, hOff, hOff + 2, hOff + 3)

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  return geo
}

// ── Spatial utilities for tree filtering ──────────────────────────────
// Ray-casting point-in-polygon test (x,z plane)
function pointInPoly(px, pz, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], zi = polygon[i][1]
    const xj = polygon[j][0], zj = polygon[j][1]
    if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) {
      inside = !inside
    }
  }
  return inside
}

// Shortest distance from point to polyline (array of [x,z] pairs)
function distToPolyline(px, pz, points) {
  let minD = Infinity
  for (let i = 0; i < points.length - 1; i++) {
    const ax = points[i][0], az = points[i][1]
    const bx = points[i + 1][0], bz = points[i + 1][1]
    const dx = bx - ax, dz = bz - az
    const len2 = dx * dx + dz * dz
    if (len2 < 0.0001) continue
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2))
    const cx = ax + t * dx, cz = az + t * dz
    const d = Math.sqrt((px - cx) ** 2 + (pz - cz) ** 2)
    if (d < minD) minD = d
  }
  return minD
}

// Merge an array of BufferGeometries into one (position + normal + index)
function mergeGeos(geos) {
  let totalV = 0, totalI = 0
  const hasColor = geos.length > 0 && !!geos[0].attributes.color
  geos.forEach(g => {
    totalV += g.attributes.position.count
    totalI += g.index ? g.index.count : g.attributes.position.count
  })
  const pos = new Float32Array(totalV * 3)
  const norm = new Float32Array(totalV * 3)
  const col = hasColor ? new Float32Array(totalV * 3) : null
  const idx = new Uint32Array(totalI)
  let vOff = 0, iOff = 0
  geos.forEach(g => {
    pos.set(g.attributes.position.array, vOff * 3)
    norm.set(g.attributes.normal.array, vOff * 3)
    if (col && g.attributes.color) col.set(g.attributes.color.array, vOff * 3)
    if (g.index) {
      const gi = g.index.array
      for (let i = 0; i < gi.length; i++) idx[iOff + i] = gi[i] + vOff
      iOff += gi.length
    } else {
      const count = g.attributes.position.count
      for (let i = 0; i < count; i++) idx[iOff + i] = vOff + i
      iOff += count
    }
    vOff += g.attributes.position.count
  })
  const m = new THREE.BufferGeometry()
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  m.setAttribute('normal', new THREE.BufferAttribute(norm, 3))
  if (col) m.setAttribute('color', new THREE.BufferAttribute(col, 3))
  m.setIndex(new THREE.BufferAttribute(idx, 1))
  return m
}

// ── Park Ground with procedural grass texture ──────────────────────────
function ParkGround() {
  const grassShaderRef = useRef()

  // GPU-computed grass: world-space FBM noise injected into MeshStandardMaterial.
  // No tiling, infinite resolution, full PBR lighting + shadows preserved.
  const grassMat = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, color: '#2d5a2d' })
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSunAltitude = { value: 0.5 }
      grassShaderRef.current = shader
      // Vertex: pass world position to fragment
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         varying vec3 vGrassPos;`
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vGrassPos = (modelMatrix * vec4(position, 1.0)).xyz;`
      )

      // Fragment: multi-octave noise-based grass coloring
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         uniform float uSunAltitude;
         varying vec3 vGrassPos;

         float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
         float gNoise(vec2 p) {
           vec2 i = floor(p), f = fract(p);
           f = f * f * (3.0 - 2.0 * f);
           return mix(
             mix(gHash(i), gHash(i + vec2(1,0)), f.x),
             mix(gHash(i + vec2(0,1)), gHash(i + vec2(1,1)), f.x), f.y);
         }
         float gFBM(vec2 p) {
           float v = 0.0, a = 0.5;
           for (int i = 0; i < 5; i++) { v += a * gNoise(p); p *= 2.03; a *= 0.49; }
           return v;
         }`
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         vec2 gp = vGrassPos.xz;

         // Large-scale terrain variation (meadow patches ~12-20m)
         float gn1 = gFBM(gp * 0.06);
         // Medium variation (clumps ~5-8m)
         float gn2 = gFBM(gp * 0.15 + 42.0);
         // Fine grain (individual grass tufts ~0.5-1m)
         float gn3 = gFBM(gp * 0.8 + 100.0);
         // Warm/cool drift across park (~40m)
         float gn4 = gFBM(gp * 0.025 + 200.0);

         vec3 gBase  = vec3(0.22, 0.40, 0.19);
         vec3 gLight = vec3(0.30, 0.50, 0.27);
         vec3 gDark  = vec3(0.15, 0.32, 0.13);
         vec3 gWarm  = vec3(0.26, 0.44, 0.17);
         vec3 gCool  = vec3(0.18, 0.38, 0.22);

         vec3 grass = mix(gBase, gLight, smoothstep(0.35, 0.65, gn1));
         grass = mix(grass, gDark, smoothstep(0.4, 0.7, gn2) * 0.35);
         grass = mix(grass, gWarm, smoothstep(0.55, 0.8, gn4) * 0.25);
         grass = mix(grass, gCool, smoothstep(0.2, 0.45, gn4) * 0.2);
         grass += (gn3 - 0.5) * 0.018;

         // Time-of-day: darken and blue-shift at night
         float dayBright = smoothstep(-0.12, 0.3, uSunAltitude);
         float brightness = mix(0.45, 1.0, dayBright);
         vec3 nightTint = vec3(0.6, 0.7, 1.0);
         grass = mix(grass * nightTint, grass, dayBright) * brightness;

         // sRGB values → linear space (shader operates in linear)
         diffuseColor.rgb = pow(grass, vec3(2.2));`
      )
    }
    return mat
  }, [])

  useFrame(() => {
    if (grassShaderRef.current) {
      const { sunAltitude } = useTimeOfDay.getState().getLightingPhase()
      grassShaderRef.current.uniforms.uSunAltitude.value = sunAltitude
    }
  })

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} receiveShadow material={grassMat}>
      <planeGeometry args={[PARK.width, PARK.depth, 1, 1]} />
    </mesh>
  )
}


// ── Park Paths (walking/cycling paths from OSM) ───────────────────────
function ParkPaths() {
  const pathShaderRef = useRef()

  const pathGeo = useMemo(() => {
    const geos = []

    parkPathData.paths.forEach(path => {
      const pts = path.points
      const halfW = path.highway === 'cycleway' ? 1.5 : 1.25 // 3.0m or 2.5m total width

      if (pts.length < 2) return

      // Build triangle strip: for each segment, extrude perpendicular
      const positions = []
      const normals = []
      const indices = []

      for (let i = 0; i < pts.length; i++) {
        // Tangent direction
        let tx, tz
        if (i === 0) {
          tx = pts[1][0] - pts[0][0]; tz = pts[1][1] - pts[0][1]
        } else if (i === pts.length - 1) {
          tx = pts[i][0] - pts[i - 1][0]; tz = pts[i][1] - pts[i - 1][1]
        } else {
          // Average of adjacent tangents for smooth joins
          tx = pts[i + 1][0] - pts[i - 1][0]; tz = pts[i + 1][1] - pts[i - 1][1]
        }
        const tLen = Math.sqrt(tx * tx + tz * tz)
        if (tLen < 0.001) continue
        tx /= tLen; tz /= tLen
        // Perpendicular (in x,z plane)
        const nx = -tz, nz = tx

        const x = pts[i][0], z = pts[i][1]
        // Left vertex
        positions.push(x + nx * halfW, 0, z + nz * halfW)
        normals.push(0, 1, 0)
        // Right vertex
        positions.push(x - nx * halfW, 0, z - nz * halfW)
        normals.push(0, 1, 0)
      }

      // Indices: triangle strip pairs
      const vertCount = positions.length / 3
      for (let i = 0; i < vertCount - 2; i += 2) {
        indices.push(i, i + 1, i + 2)
        indices.push(i + 1, i + 3, i + 2)
      }

      if (positions.length < 6) return

      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
      geo.setIndex(indices)
      geos.push(geo)
    })

    if (geos.length === 0) return new THREE.BufferGeometry()
    return mergeGeos(geos)
  }, [])

  const pathMat = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, color: '#7a7468' })
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSunAltitude = { value: 0.5 }
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

         // ── Pebble-scale voronoi ──
         vec3 vr = pVoronoi(pp * 3.0);
         float vDist = vr.x;
         float stoneId = pHash(vr.yz);

         // Per-stone color variation
         vec3 stoneCol = mix(vec3(0.35, 0.34, 0.33), vec3(0.42, 0.38, 0.32), step(0.3, stoneId));
         stoneCol = mix(stoneCol, vec3(0.48, 0.44, 0.39), step(0.6, stoneId));
         stoneCol = mix(stoneCol, vec3(0.24, 0.22, 0.20), step(0.85, stoneId));

         // Dark gaps between pebbles
         float gap = smoothstep(0.30, 0.38, vDist);
         vec3 gravelCol = mix(stoneCol, vec3(0.18, 0.16, 0.14), gap * 0.7);

         // Surface grain within each stone
         gravelCol *= 0.9 + pNoise(pp * 12.0 + vr.yz * 7.0) * 0.2;

         // Large-scale worn patches
         gravelCol = mix(gravelCol, gravelCol * 0.85, smoothstep(0.4, 0.65, pFBM(pp * 0.3)));

         // ── Subtle edge scatter ──
         // Use screen-space derivatives to fade edges with noise
         float scatter = pNoise(pp * 2.5 + 30.0) * 0.08;
         gravelCol = mix(gravelCol, gravelCol * 0.92, scatter);

         // Time-of-day
         float dayBright = smoothstep(-0.12, 0.3, uSunAltitude);
         float brightness = mix(0.45, 1.0, dayBright);
         vec3 nightTint = vec3(0.6, 0.7, 1.0);
         gravelCol = mix(gravelCol * nightTint, gravelCol, dayBright) * brightness;

         diffuseColor.rgb = pow(gravelCol, vec3(2.2));`
      )
    }
    return mat
  }, [])

  useFrame(() => {
    if (pathShaderRef.current) {
      const { sunAltitude } = useTimeOfDay.getState().getLightingPhase()
      pathShaderRef.current.uniforms.uSunAltitude.value = sunAltitude
    }
  })

  return (
    <mesh geometry={pathGeo} position={[0, 0.12, 0]} receiveShadow material={pathMat} />
  )
}

// ── Park Trees (branching + leaf-textured billboard cards at tips) ──
// Branches: merged BufferGeometry with bark vertex colors (1 draw call).
// Foliage: InstancedMesh per morphology type with leaf texture billboards (~14 draw calls).
function ParkTrees() {
  const shaderRef = useRef()
  const foliageShaderRefs = useRef({})
  const canopyRefs = useRef({})

  const leafTextures = useMemo(() => {
    const loader = new THREE.TextureLoader()
    const map = {}
    leafTypesData.types.forEach(lt => {
      const tex = loader.load(`${import.meta.env.BASE_URL}textures/leaves/${lt.texture}`)
      tex.colorSpace = THREE.SRGBColorSpace
      map[lt.id] = tex
    })
    return map
  }, [])

  const { woodGeo, canopyByMorph, crossedPlaneGeo } = useMemo(() => {
    const grottoPoly = parkWaterData.grotto
    const lakeOuterPoly = parkWaterData.lake.outer
    const islandPoly = parkWaterData.lake.island
    const pathLines = parkPathData.paths.map(p => p.points)

    const trees = parkTreeData.trees.filter(tree => {
      const { x, z } = tree
      if (pointInPoly(x, z, grottoPoly)) return false
      if (pointInPoly(x, z, lakeOuterPoly) && !pointInPoly(x, z, islandPoly)) return false
      if (distToPolyline(x, z, grottoPoly) < 3.0) return false
      if (distToPolyline(x, z, lakeOuterPoly) < 3.0) return false
      for (const pts of pathLines) {
        if (distToPolyline(x, z, pts) < 3.0) return false
      }
      return true
    })

    const woodGeos = []
    const tmpC = new THREE.Color()
    const PARK_EDGE = 173
    const seed = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s) }

    // Per-morphology foliage billboard positions
    const canopyByMorph = {}
    leafTypesData.types.forEach(lt => { canopyByMorph[lt.id] = [] })

    function paint(geo, color) {
      const count = geo.attributes.position.count
      const arr = new Float32Array(count * 3)
      tmpC.set(color)
      for (let i = 0; i < count; i++) {
        arr[i * 3] = tmpC.r; arr[i * 3 + 1] = tmpC.g; arr[i * 3 + 2] = tmpC.b
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3))
      return geo
    }

    // Multi-segment curved branch — each segment bends slightly for organic feel
    function makeBranch(bx, by, bz, azimuth, tilt, length, rBot, rTop, segs, nBend, bSeed) {
      const n = nBend || 1
      const segLen = length / n
      const geos = []
      let cx = bx, cy = by, cz = bz, az = azimuth, ti = tilt
      for (let s = 0; s < n; s++) {
        const t0 = s / n, t1 = (s + 1) / n
        const r0 = rBot + (rTop - rBot) * t0
        const r1 = rBot + (rTop - rBot) * t1
        const geo = new THREE.CylinderGeometry(r1, r0, segLen, segs)
        geo.translate(0, segLen / 2, 0)
        geo.rotateZ(ti)
        geo.rotateY(az)
        geo.translate(cx, cy, cz)
        geos.push(geo)
        cx -= segLen * Math.sin(ti) * Math.cos(az)
        cy += segLen * Math.cos(ti)
        cz += segLen * Math.sin(ti) * Math.sin(az)
        if (s < n - 1) {
          az += (seed(bSeed + s * 7) - 0.5) * 0.35
          ti += (seed(bSeed + s * 7 + 3) - 0.5) * 0.2
        }
      }
      return { geos, tx: cx, ty: cy, tz: cz }
    }

    // Push a foliage billboard card position into the correct morphology group
    function addLeaf(morph, cx, cy, cz, radius, rng) {
      const arr = canopyByMorph[morph] || canopyByMorph.ovate_large
      arr.push({
        x: cx, y: cy, z: cz,
        sx: radius * 3.5, sy: radius * 2.8, sz: radius * 3.5,
        ry: rng * TAU,
      })
    }

    const BARK = ['#5a4030', '#4d3828', '#634838', '#554030', '#4a3525']

    // Recursive branching — produces dense, realistic bare-tree silhouettes.
    // Each branch spawns children at its tip AND side shoots along its length.
    // Terminal branches get leaf billboard cards.
    function growBranch(ox, oy, oz, az, tilt, len, radius, gen, maxGen, rs, bark, morph, conf) {
      if (len < 0.12 || radius < 0.008) return
      const segs = gen <= 1 ? 6 : gen <= 2 ? 4 : 3
      const nBend = gen <= 1 ? 3 : gen <= 2 ? 2 : 1
      const rTop = radius * (gen < maxGen ? 0.55 : 0.25)
      const br = makeBranch(ox, oy, oz, az, tilt, len, radius, rTop, segs, nBend, rs + gen * 53)
      br.geos.forEach(g => woodGeos.push(paint(g, bark)))

      // Terminal branch → leaf card
      if (gen >= maxGen) {
        addLeaf(morph, br.tx, br.ty, br.tz, len * 0.6, seed(rs + 500))
        return
      }

      // Child branches at tip
      const nChildren = gen === 0
        ? Math.floor(conf.primaryN + seed(rs) * conf.primaryVar)
        : Math.floor(conf.childN + seed(rs + 1) * conf.childVar)

      for (let c = 0; c < nChildren; c++) {
        const cAz = gen === 0
          ? (c / nChildren) * TAU + (seed(rs + c * 7 + 10) - 0.5) * 0.6
          : az + (c / nChildren - 0.5) * conf.spread + (seed(rs + c * 7 + 10) - 0.5) * 0.6
        const cTilt = gen === 0
          ? conf.baseTilt + seed(rs + c * 7 + 20) * conf.tiltVar
          : tilt + (seed(rs + c * 7 + 20) - 0.35) * conf.tiltVar + conf.droopPerGen * gen
        const cLen = len * (conf.lenRatio + seed(rs + c * 7 + 30) * 0.12)
        const cR = rTop * (0.65 + seed(rs + c * 7 + 40) * 0.1)
        growBranch(br.tx, br.ty, br.tz, cAz, cTilt, cLen, cR,
          gen + 1, maxGen, rs + c * 200 + 1000, bark, morph, conf)
      }

      // Mid-branch side shoots (adds density — 1-2 per branch for gens 0-2)
      if (gen < maxGen - 1) {
        const sideN = seed(rs + 900) > 0.35 ? (seed(rs + 901) > 0.5 ? 2 : 1) : 1
        for (let s = 0; s < sideN; s++) {
          const t = 0.3 + seed(rs + s * 7 + 910) * 0.35
          const midX = ox + t * (br.tx - ox)
          const midY = oy + t * (br.ty - oy)
          const midZ = oz + t * (br.tz - oz)
          const sAz = az + (seed(rs + s * 7 + 920) - 0.5) * 2.5
          const sTilt = tilt + 0.15 + seed(rs + s * 7 + 930) * 0.4 + conf.droopPerGen * gen
          const sLen = len * (0.35 + seed(rs + s * 7 + 940) * 0.12)
          const sR = rTop * 0.55
          growBranch(midX, midY, midZ, sAz, sTilt, sLen, sR,
            gen + 1, maxGen, rs + s * 300 + 5000, bark, morph, conf)
        }
      }
    }

    trees.forEach((tree, idx) => {
      const { x, z, shape, dbh, species } = tree
      const r = (n) => seed(idx * 137 + n)
      const morph = SPECIES_TO_MORPH[species] || 'ovate_large'

      let trunkH, canopyH, canopyR
      const trunkRBot = dbh * 0.015 + 0.05
      const trunkRTop = trunkRBot * 0.6

      switch (shape) {
        case 'broad':      trunkH = 2 + dbh*0.3;   canopyH = 2 + dbh*0.25;  canopyR = 1 + dbh*0.15;  break
        case 'conifer':    trunkH = 1.5+dbh*0.15;  canopyH = 4 + dbh*0.35;  canopyR = 1 + dbh*0.1;   break
        case 'ornamental': trunkH = 1.5+dbh*0.2;   canopyH = 1.5+dbh*0.18;  canopyR = 1 + dbh*0.12;  break
        case 'columnar':   trunkH = 2 + dbh*0.25;  canopyH = 3 + dbh*0.3;   canopyR = 0.8+dbh*0.06;  break
        case 'weeping':    trunkH = 2 + dbh*0.2;   canopyH = 2 + dbh*0.18;  canopyR = 1.5+dbh*0.18;  break
        default:           trunkH = 2 + dbh*0.25;  canopyH = 2 + dbh*0.2;   canopyR = 1 + dbh*0.12
      }

      const edgeDist = Math.min(PARK_EDGE - Math.abs(x), PARK_EDGE - Math.abs(z))
      if (edgeDist < 0) return
      if (edgeDist < canopyR * 1.5) {
        const sc = Math.max(0.3, edgeDist / (canopyR * 1.5))
        canopyR *= sc; canopyH *= sc
      }

      const bark = BARK[idx % BARK.length]

      // ── Trunk — tapers to a point so no flat chop ──
      const trunkTopVis = shape === 'conifer' || shape === 'columnar'
        ? trunkRTop * 0.2 : trunkRTop * 0.35
      const trunk = new THREE.CylinderGeometry(trunkTopVis, trunkRBot, trunkH, 8)
      trunk.translate(0, trunkH / 2, 0)
      const lean = (r(0) - 0.5) * 0.06
      if (Math.abs(lean) > 0.001) trunk.rotateZ(lean)
      trunk.translate(x, 0, z)
      woodGeos.push(paint(trunk, bark))

      const flare = new THREE.CylinderGeometry(trunkRBot, trunkRBot * 1.4, 0.4, 8)
      flare.translate(0, 0.2, 0)
      flare.translate(x, 0, z)
      woodGeos.push(paint(flare, bark))

      // ── Depth of branching scales with tree size ──
      const maxGen = dbh >= 20 ? 4 : dbh >= 10 ? 3 : 2
      const branchLen = canopyR * (0.8 + r(5) * 0.15)
      const branchR = trunkRTop * 0.6
      const rBase = idx * 10000

      // ── Shape-specific branching ──
      if (shape === 'conifer') {
        // Central leader extends to near top
        const leader = new THREE.CylinderGeometry(trunkRTop * 0.3, trunkRTop, canopyH * 0.9, 6)
        leader.translate(0, canopyH * 0.45, 0)
        leader.translate(x, trunkH, z)
        woodGeos.push(paint(leader, bark))

        // Whorls of branches at each layer — each whorl branch gets sub-branches
        const layers = 6 + Math.floor(r(50) * 3)
        for (let l = 0; l < layers; l++) {
          const t = l / (layers - 1)
          const layerH = trunkH + canopyH * (0.05 + t * 0.85)
          const layerR = canopyR * (1.0 - t * 0.55)
          const brN = 3 + Math.floor(r(l + 60) * 2)
          const subMaxGen = t < 0.3 ? 2 : 1 // lower branches get more sub-branching
          for (let b = 0; b < brN; b++) {
            const az = (b / brN) * TAU + r(l * 10 + b + 70) * 0.5
            const ti = 1.1 + (1 - t) * 0.3 + r(l * 10 + b + 80) * 0.2
            const len = layerR * (0.6 + r(l * 10 + b + 90) * 0.3)
            const rB = trunkRTop * Math.max(0.08, 0.25 - t * 0.12)
            growBranch(x, layerH, z, az, ti, len, rB, 0, subMaxGen,
              rBase + l * 500 + b * 50, bark, morph, {
                primaryN: 2, primaryVar: 1, childN: 2, childVar: 1,
                spread: 1.5, baseTilt: 1.2, tiltVar: 0.3,
                lenRatio: 0.55, droopPerGen: 0.05,
              })
          }
        }
        addLeaf(morph, x, trunkH + canopyH * 0.93, z, canopyR * 0.2, r(300))

      } else if (shape === 'weeping') {
        // Weeping: primary limbs go up, then droop heavily
        const conf = {
          primaryN: 5, primaryVar: 2, childN: 3, childVar: 1,
          spread: 2.0, baseTilt: 0.5, tiltVar: 0.35,
          lenRatio: 0.62, droopPerGen: 0.35,
        }
        const pN = 5 + Math.floor(r(50) * 2)
        for (let p = 0; p < pN; p++) {
          const az = (p / pN) * TAU + (r(p + 10) - 0.5) * 0.5
          const attachH = trunkH * (0.6 + r(p + 40) * 0.3)
          growBranch(x, attachH, z, az, 0.5 + r(p + 20) * 0.3,
            canopyR * (0.6 + r(p + 30) * 0.2), branchR, 1, maxGen,
            rBase + p * 1000, bark, morph, conf)
        }

      } else if (shape === 'columnar') {
        const conf = {
          primaryN: 5, primaryVar: 2, childN: 2, childVar: 1,
          spread: 1.2, baseTilt: 0.35, tiltVar: 0.2,
          lenRatio: 0.58, droopPerGen: 0.02,
        }
        const pN = 5 + Math.floor(r(50) * 2)
        for (let p = 0; p < pN; p++) {
          const az = (p / pN) * TAU + (r(p + 10) - 0.5) * 0.5
          const attachH = trunkH * (0.4 + r(p + 40) * 0.5)
          growBranch(x, attachH, z, az, 0.3 + r(p + 20) * 0.2,
            branchLen * 0.7, branchR, 1, maxGen,
            rBase + p * 1000, bark, morph, conf)
        }

      } else {
        // Broad, ornamental, default — full recursive crown
        const isOrn = shape === 'ornamental'
        const conf = {
          primaryN: isOrn ? 4 : 5,
          primaryVar: isOrn ? 2 : 3,
          childN: 2, childVar: 2,
          spread: isOrn ? 1.8 : 2.2,
          baseTilt: isOrn ? 0.7 : 0.75,
          tiltVar: isOrn ? 0.35 : 0.4,
          lenRatio: 0.62,
          droopPerGen: 0.03,
        }
        const pN = Math.floor(conf.primaryN + r(50) * conf.primaryVar)
        for (let p = 0; p < pN; p++) {
          const az = (p / pN) * TAU + (r(p + 10) - 0.5) * 0.5
          const attachH = trunkH * (0.55 + r(p + 40) * 0.35)
          // Primary scaffold branches are thicker — act as trunk forks
          const scaffoldR = branchR * (1.0 + 0.3 * (1 - p / pN))
          growBranch(x, attachH, z, az,
            conf.baseTilt + r(p + 20) * conf.tiltVar,
            branchLen, scaffoldR, 1, maxGen,
            rBase + p * 1000, bark, morph, conf)
        }
      }
    })

    const woodGeo = mergeGeos(woodGeos)
    const crossedPlaneGeo = makeCrossedPlaneGeo()
    return { woodGeo, canopyByMorph, crossedPlaneGeo }
  }, [])

  // Set billboard instance transforms
  useEffect(() => {
    const dummy = new THREE.Object3D()
    Object.entries(canopyByMorph).forEach(([morphId, blobs]) => {
      const mesh = canopyRefs.current[morphId]
      if (!mesh || blobs.length === 0) return
      blobs.forEach((b, i) => {
        dummy.position.set(b.x, b.y, b.z)
        dummy.rotation.set(0, b.ry, 0)
        dummy.scale.set(b.sx, b.sy, b.sz)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      })
      mesh.instanceMatrix.needsUpdate = true
    })
  }, [canopyByMorph])

  // Bark material: vertex colors + world-space noise
  const barkMat = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSunAltitude = { value: 0.5 }
      shaderRef.current = shader
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         varying vec3 vBarkWorld;`
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vBarkWorld = (modelMatrix * vec4(position, 1.0)).xyz;`
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         uniform float uSunAltitude;
         varying vec3 vBarkWorld;
         float bHash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
         float bNoise(vec2 p) {
           vec2 i = floor(p), f = fract(p);
           f = f * f * (3.0 - 2.0 * f);
           return mix(mix(bHash(i), bHash(i+vec2(1,0)), f.x),
                      mix(bHash(i+vec2(0,1)), bHash(i+vec2(1,1)), f.x), f.y);
         }`
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         float grain = bNoise(vec2(vBarkWorld.x * 2.0 + vBarkWorld.z * 2.0, vBarkWorld.y * 8.0));
         float grain2 = bNoise(vec2(vBarkWorld.x * 5.0 - vBarkWorld.z * 3.0, vBarkWorld.y * 15.0));
         diffuseColor.rgb *= 0.85 + grain * 0.3;
         diffuseColor.rgb *= 0.92 + grain2 * 0.16;

         float dayB = smoothstep(-0.12, 0.3, uSunAltitude);
         float bright = mix(0.5, 1.0, dayB);
         vec3 nightT = vec3(0.6, 0.7, 1.0);
         diffuseColor.rgb = mix(diffuseColor.rgb * nightT, diffuseColor.rgb, dayB) * bright;`
      )
    }
    return mat
  }, [])

  // Per-morphology foliage materials with leaf textures
  const foliageMats = useMemo(() => {
    const mats = {}
    leafTypesData.types.forEach(lt => {
      const tex = leafTextures[lt.id]
      const mat = new THREE.MeshStandardMaterial({
        map: tex || null,
        alphaTest: 0.08,
        roughness: 0.72,
        side: THREE.DoubleSide,
        transparent: false,
        color: '#c0e8b0',
        emissive: '#1a3a12',
        emissiveIntensity: 0.15,
      })
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uSunAltitude = { value: 0.5 }
        foliageShaderRefs.current[lt.id] = shader
        shader.vertexShader = shader.vertexShader.replace(
          '#include <common>',
          `#include <common>
           varying vec3 vFoliageWorld;`
        )
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
           vFoliageWorld = wp.xyz;`
        )
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          `#include <common>
           uniform float uSunAltitude;
           varying vec3 vFoliageWorld;`
        )
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
           // Brighten foliage — lift shadows, add translucency feel
           diffuseColor.rgb = pow(diffuseColor.rgb, vec3(0.85));
           float dayBF = smoothstep(-0.12, 0.3, uSunAltitude);
           float brightF = mix(0.55, 1.05, dayBF);
           vec3 nightTF = vec3(0.6, 0.7, 1.0);
           diffuseColor.rgb = mix(diffuseColor.rgb * nightTF, diffuseColor.rgb, dayBF) * brightF;`
        )
      }
      mats[lt.id] = mat
    })
    return mats
  }, [leafTextures])

  useFrame(() => {
    const { sunAltitude } = useTimeOfDay.getState().getLightingPhase()
    if (shaderRef.current) shaderRef.current.uniforms.uSunAltitude.value = sunAltitude
    Object.values(foliageShaderRefs.current).forEach(s => {
      if (s) s.uniforms.uSunAltitude.value = sunAltitude
    })
  })

  return (
    <group>
      <mesh geometry={woodGeo} material={barkMat} castShadow />
      {leafTypesData.types.map(lt => {
        const blobs = canopyByMorph[lt.id]
        if (!blobs || blobs.length === 0) return null
        return (
          <instancedMesh
            key={lt.id}
            ref={el => { canopyRefs.current[lt.id] = el }}
            args={[crossedPlaneGeo, foliageMats[lt.id], blobs.length]}
          />
        )
      })}
    </group>
  )
}


// ── Park Water Features (Lake + Grotto Pond) ─────────────────────────
function ParkWater() {
  const waterShaderRef = useRef()

  // Build water + island + bank geometries from polygon data
  const { lakeWaterGeo, grottoWaterGeo, islandGeo, lakeBankGeo, grottoBankGeo } = useMemo(() => {
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

    return { lakeWaterGeo, grottoWaterGeo, islandGeo, lakeBankGeo, grottoBankGeo }
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

  return (
    <group>
      {/* Shoreline banks (below water) */}
      <mesh geometry={lakeBankGeo} position={[0, 0.04, 0]} receiveShadow material={bankMat} />
      <mesh geometry={grottoBankGeo} position={[0, 0.04, 0]} receiveShadow material={bankMat} />

      {/* Water surfaces */}
      <mesh geometry={lakeWaterGeo} position={[0, 0.06, 0]} receiveShadow material={waterMat} />
      <mesh geometry={grottoWaterGeo} position={[0, 0.06, 0]} receiveShadow material={waterMat} />

      {/* Lake island (grass) */}
      <mesh geometry={islandGeo} position={[0, 0.07, 0]} receiveShadow material={islandMat} />
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
      <ParkGround />
      <ParkPaths />
      <ParkWater />
      <ParkTrees />
      <PerimeterFence />

      <Text
        position={[0, 4, PARK.minZ - 15]}
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
        position={[0, 4, PARK.minZ - 23]}
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
