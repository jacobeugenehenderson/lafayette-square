import { useMemo } from 'react'
import * as THREE from 'three'
import mapData from '../../cartograph/data/clean/map.json'
import ribbonsData from '../data/ribbons.json'
import parkTreeData from '../data/park_trees.json'
import lampData from '../data/street_lamps.json'
import { pointInBoundary, boundaryPolygon } from './boundary.js'

// ── Colors (matching render.js defaults) ────────────────────
const C = {
  ground:   '#2a2a26',
  park:     '#2a4a1a',
  building: '#2a2a28',
  buildingStroke: '#1a1a18',
  stripe:   '#c8b430',
  edgeline: '#888888',
  bikelane: '#44aa88',
  centerline: '#ffffff',
  centerlineOutline: '#000000',
}

// ── Render priorities (higher = on top via polygonOffset) ────
const PRI = {
  ground: 0,
  park: 2,
  building: 12,
  stripe: 14,
  edgeline: 13,
  bikelane: 13,
  centerline: 15,
  labels: 16,
}

// ── Flat material (same shader as StreetRibbons) ────────────
function makeFlatMat(color, pri, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color, roughness: 1, metalness: 0, side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -pri * 4,
    polygonOffsetUnits: -pri * 50,
    ...opts,
  })
  // No shader override — standard PBR lighting with shadows
  return mat
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

export default function MapLayers({ hiddenLayers }) {
  const hide = hiddenLayers || {}

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

  // ── Center stripes (yellow lines, boundary-clipped) ─────
  const stripeLines = useMemo(() => {
    const lines = []
    for (const s of (mapData.layers?.centerStripe || [])) {
      if (s.coords?.length >= 2) {
        const mid = s.coords[Math.floor(s.coords.length / 2)]
        if (!pointInBoundary(mid.x ?? mid[0], mid.z ?? mid[1])) continue
        const geo = lineGeoFromCoords(s.coords)
        if (geo) lines.push(geo)
      }
    }
    return lines
  }, [])

  // ── Edge lines (white dashed parking lines, boundary-clipped) ─
  const edgeLines = useMemo(() => {
    const lines = []
    for (const pl of (mapData.layers?.parkingLine || [])) {
      if (!pl.coords || pl.coords.length < 2 || !pl.offset) continue
      const mid = pl.coords[Math.floor(pl.coords.length / 2)]
      if (!pointInBoundary(mid.x ?? mid[0], mid.z ?? mid[1])) continue
      for (const side of [-1, 1]) {
        const pts = offsetLine(pl.coords, pl.offset, side)
        const geo = lineGeoFromCoords(pts)
        if (geo) lines.push(geo)
      }
    }
    return lines
  }, [])

  // ── Bike lanes (green lines, boundary-clipped) ──────────
  const bikeLines = useMemo(() => {
    const lines = []
    for (const bl of (mapData.layers?.bikeLane || [])) {
      if (!bl.coords || bl.coords.length < 2 || !bl.offset) continue
      const mid = bl.coords[Math.floor(bl.coords.length / 2)]
      if (!pointInBoundary(mid.x ?? mid[0], mid.z ?? mid[1])) continue
      for (const side of [-1, 1]) {
        const pts = offsetLine(bl.coords, bl.offset, side)
        const geo = lineGeoFromCoords(pts)
        if (geo) lines.push(geo)
      }
    }
    return lines
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

  // ── Streetlamps (dots, boundary-clipped) ─────────────────
  const lampPositions = useMemo(() => {
    const lamps = []
    for (const l of (mapData.layers?.streetlamp || [])) {
      if (pointInBoundary(l.x, l.z)) lamps.push({ x: l.x, z: l.z })
    }
    for (const l of (lampData.lamps || [])) {
      if (pointInBoundary(l.x, l.z)) lamps.push({ x: l.x, z: l.z })
    }
    return lamps
  }, [])

  // ── Trees (circles, boundary-clipped) ─────────────────────
  const treePositions = useMemo(() => {
    return (parkTreeData.trees || []).filter(t => pointInBoundary(t.x, t.z)).map(t => ({
      x: t.x, z: t.z, r: Math.max(2, (t.dbh || 8) * 0.15),
    }))
  }, [])

  // ── Alleys (boundary-clipped) ───────────────────────────────
  const alleyLines = useMemo(() => {
    const lines = []
    for (const a of (mapData.layers?.alley || [])) {
      const coords = a.coords || a.points
      if (!coords || coords.length < 2) continue
      const mid = coords[Math.floor(coords.length / 2)]
      if (!pointInBoundary(mid.x ?? mid[0], mid.z ?? mid[1])) continue
      if (a.coords) {
        lines.push(lineGeoFromCoords(a.coords))
      } else {
        lines.push(lineGeoFromCoords(a.points.map(p => ({ x: p[0] ?? p.x, z: p[1] ?? p.z }))))
      }
    }
    return lines.filter(Boolean)
  }, [])

  // ── Footways / paths / walkways (boundary-clipped) ──────────
  const footwayLines = useMemo(() => {
    const lines = []
    for (const layer of ['footway', 'path', 'steps', 'cycleway']) {
      for (const item of (mapData.layers?.[layer] || [])) {
        const coords = item.coords || item.points
        if (!coords || coords.length < 2) continue
        const mid = coords[Math.floor(coords.length / 2)]
        if (!pointInBoundary(mid.x ?? mid[0], mid.z ?? mid[1])) continue
        lines.push(lineGeoFromCoords(coords.map(p => ({ x: p.x ?? p[0], z: p.z ?? p[1] }))))
      }
    }
    return lines.filter(Boolean)
  }, [])

  // ── Materials (memoized) ──────────────────────────────
  const mats = useMemo(() => ({
    ground: makeFlatMat(C.ground, PRI.ground),
    park: makeFlatMat(C.park, PRI.park),
    building: makeFlatMat(C.building, PRI.building),
    stripe: makeLineMat(C.stripe),
    edgeline: makeLineMat(C.edgeline, 0.7),
    bikelane: makeLineMat(C.bikelane),
    centerline: makeLineMat(C.centerline, 0.9),
    centerlineOutline: makeLineMat(C.centerlineOutline, 0.5),
    lamp: new THREE.MeshBasicMaterial({ color: '#ffdd44', depthTest: false }),
    tree: makeFlatMat('#2a5528', PRI.park + 1),
    alley: makeLineMat('#353532'),
    footway: makeLineMat('#666655', 0.6),
  }), [])

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
      {/* Boundary outline */}
      {boundaryGeo && (
        <primitive object={new THREE.Line(boundaryGeo, boundaryMat)} />
      )}

      {/* Ground */}
      {!hide.ground && groundGeo && (
        <mesh geometry={groundGeo} material={mats.ground} renderOrder={PRI.ground} receiveShadow />
      )}

      {/* Park */}
      {!hide.park && parkGeo && (
        <mesh geometry={parkGeo} material={mats.park} renderOrder={PRI.park} receiveShadow />
      )}

      {/* Buildings — above StreetRibbons (which sits at y=0.15) */}
      {!hide.building && buildingGeo && (
        <mesh geometry={buildingGeo} material={mats.building} renderOrder={PRI.building}
          position={[0, 0.1, 0]} />
      )}

      {/* Center stripes */}
      {!hide.stripe && stripeLines.map((geo, i) => (
        <primitive key={`stripe-${i}`} object={new THREE.Line(geo, mats.stripe)} />
      ))}

      {/* Edge lines */}
      {!hide.edgeline && edgeLines.map((geo, i) => (
        <primitive key={`edge-${i}`} object={new THREE.Line(geo, mats.edgeline)} />
      ))}

      {/* Bike lanes */}
      {!hide.bikelane && bikeLines.map((geo, i) => (
        <primitive key={`bike-${i}`} object={new THREE.Line(geo, mats.bikelane)} />
      ))}

      {/* Centerlines (hidden by default in panel) */}
      {!hide.centerline && centerlineLines.map((geo, i) => (
        <primitive key={`cl-${i}`} object={new THREE.Line(geo, mats.centerline)} />
      ))}

      {/* Alleys */}
      {!hide.alley && alleyLines.map((geo, i) => (
        <primitive key={`alley-${i}`} object={new THREE.Line(geo, mats.alley)} />
      ))}

      {/* Footways / paths / walkways */}
      {!hide.footway && footwayLines.map((geo, i) => (
        <primitive key={`fw-${i}`} object={new THREE.Line(geo, mats.footway)} />
      ))}

      {/* Streetlamps */}
      {!hide.lamp && lampPositions.map((l, i) => (
        <mesh key={`lamp-${i}`} position={[l.x, 0.3, l.z]} rotation={[-Math.PI / 2, 0, 0]} material={mats.lamp}>
          <circleGeometry args={[0.8, 6]} />
        </mesh>
      ))}

      {/* Trees */}
      {!hide.tree && treePositions.map((t, i) => (
        <mesh key={`tree-${i}`} position={[t.x, 0.2, t.z]} rotation={[-Math.PI / 2, 0, 0]} material={mats.tree}>
          <circleGeometry args={[t.r, 8]} />
        </mesh>
      ))}

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
