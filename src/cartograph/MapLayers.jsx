import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useTimeOfDay from '../hooks/useTimeOfDay'
import mapData from '../../cartograph/data/clean/map.json'
import ribbonsData from '../data/ribbons.json'
import parkTreeData from '../data/park_trees.json'
import parkWaterData from '../data/park_water.json'
import lampData from '../data/street_lamps.json'
import { pointInBoundary, boundaryPolygon } from './boundary.js'
import useCartographStore from './stores/useCartographStore.js'
import { DEFAULT_LAYER_COLORS, DEFAULT_LU_COLORS } from './m3Colors.js'
import {
  assignTerrainUniforms,
  TERRAIN_DECL, TERRAIN_DISPLACE, TERRAIN_NORMAL,
} from '../utils/terrainShader'

// Strokes (outlines) don't have a panel picker yet — keep local.
const STROKE_COLORS = {
  buildingStroke:     '#1a1a18',
  centerlineOutline:  '#000000',
}

// Park-local → world rotation. Tree GPS coords are in park-local meters;
// see park_trees.json `meta.coordinate_system`.
const PARK_GRID_ROTATION = -9.2 * (Math.PI / 180)

// Crown radius from trunk DBH (open-grown urban hardwoods rule of thumb).
const treeCrownRadius = (dbh) => Math.max(0.5, Math.min(8, (typeof dbh === 'number' ? dbh : 12) * 0.305 / 2))

// ── Render priorities (higher = on top via polygonOffset) ────
const PRI = {
  ground: 0,
  park: 2,
  landscape: 3,      // gardens, pools, playgrounds, woods, scrub, tree_rows
  parking_lot: 4,
  alley: 10,
  footway: 11,
  building: 12,
  edgeline: 13,
  bikelane: 13,
  stripe: 14,
  barrier: 14,       // fences/walls/hedges as thin strokes on top
  centerline: 15,
  labels: 16,
}

// ── Radial edge fade (matches StreetRibbons' circle boundary) ─
// Center + outer must mirror neighborhood_boundary.json so shots and Designer
// silhouettes agree. Fade from inner→outer; past outer alpha = 0.
const FADE_CENTER = { x: 162, z: -127 }
const FADE_INNER = 758
const FADE_OUTER = 892

function injectRadialFade(mat) {
  mat.transparent = true
  mat.onBeforeCompile = (shader) => {
    assignTerrainUniforms(shader)
    shader.uniforms.uFadeCenter = { value: new THREE.Vector2(FADE_CENTER.x, FADE_CENTER.z) }
    shader.uniforms.uFadeInner = { value: FADE_INNER }
    shader.uniforms.uFadeOuter = { value: FADE_OUTER }
    // Terrain displacement — keeps MapLayers geometry riding the terrain
    // alongside StreetRibbons in shots. In Designer, uTerrainExag is 0 so
    // displacement is a no-op.
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + TERRAIN_DECL + '\nvarying vec3 vFadeWorldPos;')
      .replace('#include <begin_vertex>', TERRAIN_DISPLACE)
      .replace('#include <beginnormal_vertex>', TERRAIN_NORMAL)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvFadeWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFadeWorldPos;\nuniform vec2 uFadeCenter;\nuniform float uFadeInner;\nuniform float uFadeOuter;')
      .replace('#include <opaque_fragment>',
        '#include <opaque_fragment>\n' +
        'float _fadeR = distance(vFadeWorldPos.xz, uFadeCenter);\n' +
        'gl_FragColor.a *= 1.0 - smoothstep(uFadeInner, uFadeOuter, _fadeR);')
  }
  mat.customProgramCacheKey = () => `ml-terrain-fade-${FADE_INNER}-${FADE_OUTER}`
  return mat
}

// ── Flat material (same shader as StreetRibbons) ────────────
// polygonOffset matches StreetRibbons (factor=-pri, units=-pri*4). The old
// values (factor=-pri*4, units=-pri*50) pushed layers too aggressively
// toward the camera and caused alley z-fighting once terrain displacement
// lifted everything simultaneously.
function makeFlatMat(color, pri, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color, roughness: 1, metalness: 0, side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -pri,
    polygonOffsetUnits: -pri * 4,
    ...opts,
  })
  return injectRadialFade(mat)
}

// ── Line material ───────────────────────────────────────────
function makeLineMat(color, opacity = 1) {
  return new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity })
}

// ── Triangulate a ring of {x, z} points into XZ-plane mesh ─
function triangulateRing(ring) {
  if (ring.length < 3) return null
  const shape = new THREE.Shape(ring.map(p => new THREE.Vector2(p.x ?? p[0], p.z ?? p[1])))
  const shapeGeo = new THREE.ShapeGeometry(shape)
  const srcPos = shapeGeo.attributes.position.array
  const srcIdx = shapeGeo.index.array
  // ShapeGeometry outputs in XY plane; remap to XZ
  const pos = new Float32Array(srcPos.length)
  const nrm = new Float32Array(srcPos.length)
  for (let i = 0; i < srcPos.length; i += 3) {
    pos[i] = srcPos[i]; pos[i + 1] = 0; pos[i + 2] = srcPos[i + 1]
    nrm[i] = 0; nrm[i + 1] = 1; nrm[i + 2] = 0
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(srcIdx), 1))
  shapeGeo.dispose()
  return geo
}

// ── Merge multiple geometries ───────────────────────────────
function mergeGeos(geos) {
  const valid = geos.filter(Boolean)
  if (!valid.length) return null
  let totalV = 0, totalI = 0
  for (const g of valid) { totalV += g.attributes.position.count; totalI += g.index.count }
  const pos = new Float32Array(totalV * 3)
  const nrm = new Float32Array(totalV * 3)
  const idx = new Uint32Array(totalI)
  let vO = 0, iO = 0
  for (const g of valid) {
    const nv = g.attributes.position.count
    pos.set(g.attributes.position.array, vO * 3)
    nrm.set(g.attributes.normal.array, vO * 3)
    const gi = g.index.array
    for (let i = 0; i < gi.length; i++) idx[iO + i] = gi[i] + vO
    vO += nv; iO += gi.length
  }
  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  merged.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  merged.setIndex(new THREE.BufferAttribute(idx, 1))
  return merged
}

// ── Build line geometry from [{x,z}] coords ────────────────
function lineGeoFromCoords(coords) {
  if (coords.length < 2) return null
  const pts = coords.map(c => new THREE.Vector3(c.x ?? c[0], 0.2, c.z ?? c[1]))
  return new THREE.BufferGeometry().setFromPoints(pts)
}

// Build a thin quad-strip ribbon for a polyline — real geometry that picks
// up terrain displacement via the flat material. Replaces THREE.Line for
// street markings in shots, where the 1-pixel lines sit at y=0.2 and get
// buried under lifted terrain.
function stripeRibbonGeo(coords, halfWidth) {
  if (!coords || coords.length < 2) return null
  const n = coords.length
  const pos = new Float32Array(n * 6)
  const nrm = new Float32Array(n * 6)
  const idx = []
  for (let i = 0; i < n; i++) {
    const c = coords[i]
    const prev = coords[Math.max(0, i - 1)]
    const next = coords[Math.min(n - 1, i + 1)]
    const px = prev.x ?? prev[0], pz = prev.z ?? prev[1]
    const nx2 = next.x ?? next[0], nz2 = next.z ?? next[1]
    const dx = nx2 - px, dz = nz2 - pz
    const l = Math.hypot(dx, dz) || 1
    const pnx = -dz / l, pnz = dx / l
    const cx = c.x ?? c[0], cz = c.z ?? c[1]
    pos[i * 6]     = cx + pnx * halfWidth
    pos[i * 6 + 1] = 0
    pos[i * 6 + 2] = cz + pnz * halfWidth
    pos[i * 6 + 3] = cx - pnx * halfWidth
    pos[i * 6 + 4] = 0
    pos[i * 6 + 5] = cz - pnz * halfWidth
    nrm[i * 6 + 1] = 1; nrm[i * 6 + 4] = 1
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1))
  return geo
}

// ── Offset a polyline left or right ─────────────────────────
function offsetLine(coords, offset, side) {
  const pts = []
  for (let i = 0; i < coords.length; i++) {
    const prev = coords[Math.max(0, i - 1)]
    const next = coords[Math.min(coords.length - 1, i + 1)]
    const dx = next.x - prev.x, dz = next.z - prev.z
    const len = Math.sqrt(dx * dx + dz * dz) || 1
    pts.push({ x: coords[i].x + side * (-dz / len) * offset, z: coords[i].z + side * (dx / len) * offset })
  }
  return pts
}

// ═══════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════

export default function MapLayers({ hiddenLayers, inShot = false }) {
  const hideIn = hiddenLayers || {}
  // Layers owned by 3D components in shots — skip from MapLayers to avoid
  // double-rendering. Keep alleys/footways/paths/parking/landscape/barriers:
  // those stay as flat ground patches in shots (the map vernacular).
  const SHOT_SKIP = new Set(['park', 'water', 'building', 'tree', 'centerline', 'labels'])
  const hide = inShot
    ? new Proxy(hideIn, { get: (t, k) => SHOT_SKIP.has(k) ? true : t[k] })
    : hideIn
  const layerColors = useCartographStore(s => s.layerColors) || {}
  const layerStrokes = useCartographStore(s => s.layerStrokes) || {}
  const luColors = useCartographStore(s => s.luColors) || {}

  // ── Ground plane ────────────────────────────────────────
  const groundGeo = useMemo(() => {
    const bbox = mapData.bbox
    const w = bbox.maxX - bbox.minX + 200
    const h = bbox.maxZ - bbox.minZ + 200
    const cx = (bbox.minX + bbox.maxX) / 2
    const cz = (bbox.minZ + bbox.maxZ) / 2
    const geo = new THREE.PlaneGeometry(w, h)
    geo.rotateX(-Math.PI / 2)
    geo.translate(cx, 0, cz)
    return geo
  }, [])

  // ── Park ────────────────────────────────────────────────
  const parkGeo = useMemo(() => {
    const geos = []
    for (const p of (mapData.layers?.park || [])) {
      if (p.ring?.length >= 3) {
        const g = triangulateRing(p.ring)
        if (g) geos.push(g)
      }
    }
    return mergeGeos(geos)
  }, [])

  // ── Buildings (boundary-clipped) ────────────────────────
  const buildingGeo = useMemo(() => {
    const geos = []
    for (const b of (mapData.buildings || [])) {
      if (b.ring?.length >= 3) {
        const cx = b.ring.reduce((s, p) => s + (p.x ?? p[0]), 0) / b.ring.length
        const cz = b.ring.reduce((s, p) => s + (p.z ?? p[1]), 0) / b.ring.length
        if (!pointInBoundary(cx, cz)) continue
        const g = triangulateRing(b.ring)
        if (g) geos.push(g)
      }
    }
    return mergeGeos(geos)
  }, [])

  // ── Center stripes (yellow paint on road, thin ribbon) ──
  const stripeGeo = useMemo(() => {
    const geos = []
    for (const s of (mapData.layers?.centerStripe || [])) {
      if (s.coords?.length >= 2) {
        const mid = s.coords[Math.floor(s.coords.length / 2)]
        if (!pointInBoundary(mid.x ?? mid[0], mid.z ?? mid[1])) continue
        const geo = stripeRibbonGeo(s.coords, 0.1)
        if (geo) geos.push(geo)
      }
    }
    return mergeGeos(geos)
  }, [])

  // ── Edge lines (white parking lines, thin ribbon) ───────
  const edgeGeo = useMemo(() => {
    const geos = []
    for (const pl of (mapData.layers?.parkingLine || [])) {
      if (!pl.coords || pl.coords.length < 2 || !pl.offset) continue
      const mid = pl.coords[Math.floor(pl.coords.length / 2)]
      if (!pointInBoundary(mid.x ?? mid[0], mid.z ?? mid[1])) continue
      for (const side of [-1, 1]) {
        const pts = offsetLine(pl.coords, pl.offset, side)
        const geo = stripeRibbonGeo(pts, 0.08)
        if (geo) geos.push(geo)
      }
    }
    return mergeGeos(geos)
  }, [])

  // ── Bike lanes (green, thin ribbon) ─────────────────────
  const bikeGeo = useMemo(() => {
    const geos = []
    for (const bl of (mapData.layers?.bikeLane || [])) {
      if (!bl.coords || bl.coords.length < 2 || !bl.offset) continue
      const mid = bl.coords[Math.floor(bl.coords.length / 2)]
      if (!pointInBoundary(mid.x ?? mid[0], mid.z ?? mid[1])) continue
      for (const side of [-1, 1]) {
        const pts = offsetLine(bl.coords, bl.offset, side)
        const geo = stripeRibbonGeo(pts, 0.25)
        if (geo) geos.push(geo)
      }
    }
    return mergeGeos(geos)
  }, [])

  // ── Centerlines (debug reference, hidden by default, boundary-clipped) ─
  const centerlineLines = useMemo(() => {
    const lines = []
    for (const st of ribbonsData.streets) {
      if (st.points.length < 2) continue
      const mid = st.points[Math.floor(st.points.length / 2)]
      if (!pointInBoundary(mid[0], mid[1])) continue
      const pts = st.points.map(p => new THREE.Vector3(p[0], 0.25, p[1]))
      lines.push(new THREE.BufferGeometry().setFromPoints(pts))
    }
    return lines
  }, [])

  // ── Labels (boundary-clipped) ──────────────────────────────
  const labelData = useMemo(() => {
    const seen = new Set()
    const labels = []
    for (const st of ribbonsData.streets) {
      if (!st.name || seen.has(st.name)) continue
      if (st.points.length < 2) continue
      const midIdx = Math.floor(st.points.length / 2)
      const p = st.points[midIdx]
      if (!pointInBoundary(p[0], p[1])) continue
      seen.add(st.name)
      // Direction for rotation
      const p0 = st.points[Math.max(0, midIdx - 1)]
      const p1 = st.points[Math.min(st.points.length - 1, midIdx + 1)]
      const angle = Math.atan2(p1[1] - p0[1], p1[0] - p0[0])
      labels.push({ name: st.name, x: p[0], z: p[1], angle })
    }
    return labels
  }, [])

  // ── Streetlamps (dots, no boundary clip — the 641 street lamps from
  // map.json all sit in the neighborhood anyway; lamp pools gate visibility) ─
  const lampPositions = useMemo(() => {
    const lamps = []
    for (const l of (mapData.layers?.streetlamp || [])) lamps.push({ x: l.x, z: l.z })
    for (const l of (lampData.lamps || [])) lamps.push({ x: l.x, z: l.z })
    return lamps
  }, [])

  // ── Park water (flat plan-view; park-local, rotated below) ────
  // ShapeGeometry sits in XY → rotateX maps (x,y,0) → (x,0,-y); negate z to
  // get mesh(x,0,z) matching JSON. Lake carries an island hole.
  const waterGeo = useMemo(() => {
    const negZ = (pts) => pts.map(([x, z]) => [x, -z])
    const geos = []
    const lake = parkWaterData.lake
    if (lake?.outer?.length >= 3) {
      const shape = new THREE.Shape(negZ(lake.outer).map(([x, y]) => new THREE.Vector2(x, y)))
      if (lake.island?.length >= 3) {
        shape.holes.push(new THREE.Path(negZ(lake.island).map(([x, y]) => new THREE.Vector2(x, y))))
      }
      const g = new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI / 2); geos.push(g)
    }
    if (parkWaterData.grotto?.length >= 3) {
      const shape = new THREE.Shape(negZ(parkWaterData.grotto).map(([x, y]) => new THREE.Vector2(x, y)))
      const g = new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI / 2); geos.push(g)
    }
    if (!geos.length) return null
    // Merge by concatenating buffers
    const positions = [], indices = []
    let off = 0
    for (const g of geos) {
      const p = g.attributes.position.array
      const idx = g.index?.array
      for (let i = 0; i < p.length; i++) positions.push(p[i])
      if (idx) for (let i = 0; i < idx.length; i++) indices.push(idx[i] + off)
      off += p.length / 3
      g.dispose()
    }
    const merged = new THREE.BufferGeometry()
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    merged.setIndex(indices)
    merged.computeVertexNormals()
    return merged
  }, [])

  // ── Trees (DBH-sized discs; park-local coords, rotated below) ────
  const treePositions = useMemo(() => {
    return (parkTreeData.trees || []).map(t => ({ x: t.x, z: t.z, r: treeCrownRadius(t.dbh) }))
  }, [])

  // ── Alleys (filled rings, boundary-clipped) ─────────────────
  const alleyGeo = useMemo(() => {
    const geos = []
    for (const a of (mapData.layers?.alley || [])) {
      const ring = a.ring
      if (!ring || ring.length < 3) continue
      let sx = 0, sz = 0
      for (const p of ring) { sx += (p.x ?? p[0]); sz += (p.z ?? p[1]) }
      if (!pointInBoundary(sx / ring.length, sz / ring.length)) continue
      const g = triangulateRing(ring)
      if (g) geos.push(g)
    }
    return mergeGeos(geos)
  }, [])


  // ── Landscape overlays (leisure + natural, grouped by subtype) ─
  const landscapeByKind = useMemo(() => {
    const groups = {}  // kind → [geo,...]
    for (const cat of ['leisure', 'natural']) {
      for (const item of (mapData.layers?.[cat] || [])) {
        const ring = item.ring
        if (!ring || ring.length < 3) continue
        let sx = 0, sz = 0
        for (const p of ring) { sx += (p.x ?? p[0]); sz += (p.z ?? p[1]) }
        if (!pointInBoundary(sx / ring.length, sz / ring.length)) continue
        const g = triangulateRing(ring)
        if (!g) continue
        if (!groups[item.use]) groups[item.use] = []
        groups[item.use].push(g)
      }
    }
    const merged = {}
    for (const kind of Object.keys(groups)) merged[kind] = mergeGeos(groups[kind])
    return merged
  }, [])

  // ── Barrier lines (fence, wall, hedge, retaining_wall) ──
  // No boundary filter — the radial fade will handle edge cases. Raised Y so
  // they sit clearly above face fills and aren't buried by ribbons.
  const barriersByKind = useMemo(() => {
    const groups = {}
    for (const item of (mapData.layers?.barrier || [])) {
      const coords = item.coords
      if (!coords || coords.length < 2) continue
      const pts = coords.map(p => new THREE.Vector3(p.x ?? p[0], 0.5, p.z ?? p[1]))
      const geo = new THREE.BufferGeometry().setFromPoints(pts)
      if (!groups[item.kind]) groups[item.kind] = []
      groups[item.kind].push(geo)
    }
    return groups
  }, [])

  // ── Parking lots (amenity=parking overlays) ─────────────
  const parkingLotGeo = useMemo(() => {
    const geos = []
    for (const item of (mapData.layers?.parking_lot || [])) {
      const ring = item.ring
      if (!ring || ring.length < 3) continue
      let sx = 0, sz = 0
      for (const p of ring) { sx += (p.x ?? p[0]); sz += (p.z ?? p[1]) }
      if (!pointInBoundary(sx / ring.length, sz / ring.length)) continue
      const g = triangulateRing(ring)
      if (g) geos.push(g)
    }
    return mergeGeos(geos)
  }, [])

  // Stroke segments — one line geometry per polygon (kept separate from fill)
  const parkingLotStrokes = useMemo(() => {
    const lines = []
    for (const item of (mapData.layers?.parking_lot || [])) {
      const ring = item.ring
      if (!ring || ring.length < 3) continue
      let sx = 0, sz = 0
      for (const p of ring) { sx += (p.x ?? p[0]); sz += (p.z ?? p[1]) }
      if (!pointInBoundary(sx / ring.length, sz / ring.length)) continue
      const pts = ring.map(p => new THREE.Vector3(p.x ?? p[0], 0.01, p.z ?? p[1]))
      pts.push(pts[0])
      lines.push(new THREE.BufferGeometry().setFromPoints(pts))
    }
    return lines
  }, [])

  // ── Footways / paths / walkways (filled rings, boundary-clipped) ─
  const footwayGeo = useMemo(() => {
    const geos = []
    for (const layer of ['footway', 'path', 'steps', 'cycleway']) {
      for (const item of (mapData.layers?.[layer] || [])) {
        const ring = item.ring
        if (!ring || ring.length < 3) continue
        let sx = 0, sz = 0
        for (const p of ring) { sx += (p.x ?? p[0]); sz += (p.z ?? p[1]) }
        if (!pointInBoundary(sx / ring.length, sz / ring.length)) continue
        const g = triangulateRing(ring)
        if (g) geos.push(g)
      }
    }
    return mergeGeos(geos)
  }, [])

  // ── Materials (re-memo when the panel changes any color) ──
  const color = (id) => layerColors[id] || DEFAULT_LAYER_COLORS[id]
  const mats = useMemo(() => ({
    ground: makeFlatMat(color('ground'), PRI.ground),
    park: makeFlatMat(color('park'), PRI.park),
    building: makeFlatMat(color('building'), PRI.building),
    stripe: makeLineMat(color('stripe')),
    edgeline: makeLineMat(color('edgeline'), 0.7),
    bikelane: makeLineMat(color('bikelane')),
    // Flat (mesh) variants — terrain-aware ribbons used in shots
    stripeFlat: makeFlatMat(color('stripe'), PRI.stripe),
    edgelineFlat: makeFlatMat(color('edgeline'), PRI.edgeline),
    bikelaneFlat: makeFlatMat(color('bikelane'), PRI.bikelane),
    centerline: makeLineMat(color('centerline'), 0.9),
    centerlineOutline: makeLineMat(STROKE_COLORS.centerlineOutline, 0.5),
    lamp: (() => {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(color('lamp')) },
          uSunAltitude: { value: 1 },  // updated per-frame from time-of-day
          uTerrainMap: { value: null },
          uBMinX: { value: 0 }, uBMinZ: { value: 0 },
          uSpanX: { value: 1 }, uSpanZ: { value: 1 },
          uExag: { value: 0 },
        },
        vertexShader: `
          varying vec2 vUv;
          uniform sampler2D uTerrainMap;
          uniform float uBMinX, uBMinZ, uSpanX, uSpanZ, uExag;
          void main(){
            vUv = uv;
            // Transform to world space, then add terrain elevation to
            // world Y. The mesh is rotated -90° around X to lie flat, so
            // adjusting *local* Y would shift the lamp sideways.
            vec4 tw = modelMatrix * vec4(position, 1.0);
            vec2 tuv = clamp(vec2((tw.x - uBMinX)/uSpanX, (tw.z - uBMinZ)/uSpanZ), 0.0, 1.0);
            tw.y += texture2D(uTerrainMap, tuv).r * uExag;
            gl_Position = projectionMatrix * viewMatrix * tw;
          }`,
        fragmentShader: `
          uniform vec3 uColor;
          uniform float uSunAltitude;
          varying vec2 vUv;
          void main(){
            float d = length(vUv - 0.5) * 2.0;
            float pool = exp(-d * d * 2.5);
            // Night gate: bright at night, off at day (matches StreetLights).
            float night = 1.0 - smoothstep(-0.1, 0.1, uSunAltitude);
            gl_FragColor = vec4(uColor, pool * night * 0.12);
          }`,
        transparent: true,
        depthWrite: false,
        // depthTest stays on — lamp pools should be occluded by trees,
        // buildings, and other foreground geometry naturally.
        blending: THREE.AdditiveBlending,
      })
      // Wire shared terrain uniforms (so lamps ride the same terrain as ribbons).
      assignTerrainUniforms(mat)
      return mat
    })(),
    tree: makeFlatMat(color('tree'), PRI.park + 1),
    water: makeFlatMat(color('water'), PRI.park + 1),
    alley: makeFlatMat(color('alley'), PRI.alley),
    footway: makeFlatMat(color('footway'), PRI.footway),
    parking_lot: makeFlatMat(color('parking_lot'), PRI.parking_lot),
    parking_lot_stroke: makeLineMat(layerStrokes.parking_lot?.color || '#1a1a18', 1),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [layerColors, layerStrokes])

  // Sync lamp sun altitude each frame — night-gate matches StreetLights.
  useFrame(() => {
    if (!mats.lamp?.uniforms?.uSunAltitude) return
    mats.lamp.uniforms.uSunAltitude.value = useTimeOfDay.getState().getLightingPhase().sunAltitude
  })

  // ── Boundary outline ────────────────────────────────────
  const boundaryGeo = useMemo(() => {
    if (!boundaryPolygon.length) return null
    const pts = [...boundaryPolygon, boundaryPolygon[0]].map(
      p => new THREE.Vector3(p[0], 0.4, p[1])
    )
    return new THREE.BufferGeometry().setFromPoints(pts)
  }, [])
  const boundaryMat = useMemo(() => new THREE.LineBasicMaterial({
    color: '#ff6600', transparent: true, opacity: 0.5, depthTest: false,
  }), [])

  return (
    <group position={[0, 0.12, 0]}>
      {/* Boundary outline — Designer-only survey aid, not for shots */}
      {boundaryGeo && !inShot && (
        <primitive object={new THREE.Line(boundaryGeo, boundaryMat)} />
      )}

      {/* Ground — below ribbons so face fills show on top */}
      {!hide.ground && groundGeo && (
        <mesh geometry={groundGeo} material={mats.ground} renderOrder={PRI.ground}
          receiveShadow position={[0, -0.2, 0]} />
      )}

      {/* Park — below ribbons, above ground */}
      {!hide.park && parkGeo && (
        <mesh geometry={parkGeo} material={mats.park} renderOrder={PRI.park}
          receiveShadow position={[0, -0.18, 0]} />
      )}

      {/* Buildings — above StreetRibbons (which sits at y=0.15) */}
      {!hide.building && buildingGeo && (
        <mesh geometry={buildingGeo} material={mats.building} renderOrder={PRI.building}
          position={[0, 0.1, 0]} />
      )}

      {/* Center stripes — ribbon mesh so they follow terrain.  Lifted just
          above the StreetRibbons face fills (group y=0.15 in shot mode) so
          the stripe paint never z-fights the asphalt underneath it. */}
      {!hide.stripe && stripeGeo && (
        <mesh geometry={stripeGeo} material={mats.stripeFlat} renderOrder={PRI.stripe}
          position={[0, 0.15, 0]} />
      )}

      {/* Edge lines */}
      {!hide.edgeline && edgeGeo && (
        <mesh geometry={edgeGeo} material={mats.edgelineFlat} renderOrder={PRI.edgeline}
          position={[0, 0.15, 0]} />
      )}

      {/* Bike lanes */}
      {!hide.bikelane && bikeGeo && (
        <mesh geometry={bikeGeo} material={mats.bikelaneFlat} renderOrder={PRI.bikelane}
          position={[0, 0.15, 0]} />
      )}

      {/* Centerlines (hidden by default in panel) */}
      {!hide.centerline && centerlineLines.map((geo, i) => (
        <primitive key={`cl-${i}`} object={new THREE.Line(geo, mats.centerline)} />
      ))}


      {/* Parking lots (amenity=parking overlays) — colored via Land Use: Parking */}
      {!hide.parking_lot && parkingLotGeo && (
        <mesh geometry={parkingLotGeo}
          material={makeFlatMat(luColors.parking || DEFAULT_LU_COLORS.parking || '#6A6A62', PRI.parking_lot)}
          renderOrder={PRI.parking_lot} receiveShadow />
      )}

      {/* Landscape overlays (leisure + natural subtypes) — use makeFlatMat
          so they get terrain displacement + radial fade like other layers. */}
      {Object.entries(landscapeByKind).map(([kind, geo]) => {
        if (!geo || hide[kind]) return null
        const col = layerColors[kind] || DEFAULT_LAYER_COLORS[kind] || '#888'
        const mat = makeFlatMat(col, PRI.landscape)
        return <mesh key={`ls-${kind}`} geometry={geo} material={mat} renderOrder={PRI.landscape} receiveShadow />
      })}

      {/* Barriers (fence/wall/hedge/retaining_wall as thin lines) */}
      {Object.entries(barriersByKind).map(([kind, geos]) => {
        if (hide[kind]) return null
        const col = layerColors[kind] || DEFAULT_LAYER_COLORS[kind] || '#888'
        const mat = makeLineMat(col, 1)
        return <group key={`bar-${kind}`}>
          {geos.map((geo, i) => (
            <primitive key={i} object={new THREE.Line(geo, mat)} renderOrder={PRI.barrier} />
          ))}
        </group>
      })}

      {/* Alleys — filled ring polygons. Lifted above ribbon face fills so
          they sit cleanly on top instead of z-fighting under shot-mode terrain
          displacement. Pipeline already clipped them to outside the curb so
          they never overlap asphalt. */}
      {!hide.alley && alleyGeo && (
        <mesh geometry={alleyGeo} material={mats.alley} renderOrder={PRI.alley}
          position={[0, 0.15, 0]} receiveShadow />
      )}

      {/* Footways / paths / walkways — filled ring polygons */}
      {!hide.footway && footwayGeo && (
        <mesh geometry={footwayGeo} material={mats.footway} renderOrder={PRI.footway}
          position={[0, 0.15, 0]} receiveShadow />
      )}

      {/* Streetlamps */}
      {!hide.lamp && lampPositions.map((l, i) => (
        <mesh key={`lamp-${i}`} position={[l.x, 2, l.z]} rotation={[-Math.PI / 2, 0, 0]} material={mats.lamp} renderOrder={11.5} frustumCulled={false}>
          <circleGeometry args={[8, 24]} />
        </mesh>
      ))}

      {/* Trees: park_trees.json coords are park-local (axis-aligned in the
          park's own frame); PARK_GRID_ROTATION tilts them into the park's
          real-world orientation so they align with the rotated park face. */}
      {!hide.tree && (
        <group rotation={[0, PARK_GRID_ROTATION, 0]}>
          {treePositions.map((t, i) => (
            <mesh key={`tree-${i}`} position={[t.x, 0.2, t.z]} rotation={[-Math.PI / 2, 0, 0]} material={mats.tree}>
              <circleGeometry args={[t.r, 12]} />
            </mesh>
          ))}
        </group>
      )}
      {/* Water: park_water.json coords orientation is unresolved. Start with
          no rotation (world-aligned); user iterates from here. */}
      {!hide.water && waterGeo && (
        <mesh geometry={waterGeo} material={mats.water} />
      )}

      {/* Labels — canvas texture sprites */}
      {!hide.labels && labelData.map((lbl, i) => (
        <LabelSprite key={i} label={lbl} />
      ))}
    </group>
  )
}

// ── Label sprite: canvas-textured plane ─────────────────────
function LabelSprite({ label }) {
  const { texture, width, height } = useMemo(() => {
    const cvs = document.createElement('canvas')
    const ctx = cvs.getContext('2d')
    const fontSize = 32
    ctx.font = `600 ${fontSize}px -apple-system, sans-serif`
    const metrics = ctx.measureText(label.name)
    const w = Math.ceil(metrics.width + 16)
    const h = fontSize + 8
    cvs.width = w; cvs.height = h
    // Background
    ctx.fillStyle = '#3a3a38'
    ctx.fillRect(0, 0, w, h)
    // Text
    ctx.font = `600 ${fontSize}px -apple-system, sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textBaseline = 'middle'
    ctx.fillText(label.name, 8, h / 2)
    const tex = new THREE.CanvasTexture(cvs)
    tex.minFilter = THREE.LinearFilter
    // World-space size: ~5m tall
    const worldH = 4
    const worldW = worldH * (w / h)
    return { texture: tex, width: worldW, height: worldH }
  }, [label.name])

  return (
    <mesh
      position={[label.x, 0.3, label.z]}
      rotation={[-Math.PI / 2, 0, -label.angle]}
    >
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        map={texture} transparent
        depthTest={false}
        toneMapped={false}
      />
    </mesh>
  )
}
