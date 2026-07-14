/**
 * ExtentApp — the Neighborhood Perimeter Builder (a top-level destination screen).
 *
 * Cartograph's step 0, PRE-skeleton / PRE-pour: the operator defines a
 * neighborhood's extent on a labeled aerial, then pours it — the whole
 * intake→3D arc in one screen, no hand-CLI. The flow:
 *
 *   SEARCH a place (a DATA BOOTSTRAP only — union bbox to frame; we NEVER geocode
 *   for geometry) → frame the aerial → FETCH THIS VIEW (the full bundle:
 *   OSM+skeleton + MSBF buildings + assessor parcels, per-source status) → DRAW
 *   THE BOUNDARY with the editable bezier PEN (its closed path IS the membership
 *   boundary; snaps to skeleton junctions) → radius (in-scene circle handle) →
 *   name/blurb → POUR → DESIGNER (commit: re-center + reproject + flatten the pen
 *   path → boundary polygon + derived tz; then pipeline → ribbons → bake).
 *
 * The pen path is the FIRST-CLASS artifact — a living, endlessly-editable bezier
 * the operator keeps fixing across sessions (`HANDOFF-extent-pen-boundary.md`,
 * `BezierPen.jsx`). The old auto-derived official-ring / snap-route boundary is
 * DELETED (an admin polygon is not a neighborhood). Street-selection is dormant.
 *
 * This is a DESTINATION, not a Designer tool-mode (its own nav button, like
 * Designer / Stage) — so it renders as an early return from CartographApp with
 * its own minimal top-down Canvas, never threaded through the shot-branched
 * main scene.
 *
 * Persists: geography.json (projection + derived timezone), neighborhood_boundary.json
 * (the circle + derived membership polygon), neighborhood.json (name/blurb/radius/tz
 * + boundaryPath — the editable pen path, lon/lat, reloaded editable on open).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { MapControls, Text, Line } from '@react-three/drei'
import useCartographStore from './stores/useCartographStore.js'
import {
  fetchSkeletonLabels, fetchExtentCorners, fetchStreetNames, geocodePlace, fetchExtent, fetchGeography,
  fetchStreetGeom, fetchNeighborhood, saveNeighborhood, commitExtent, fetchBoundary,
  pourScene, fetchRibbons, fetchLooks, createLook, bakeLook, fetchBuildingFootprints,
  fetchBuildingOverrides, saveBuildingOverrides, rescopeScene, rollbackExtent,
  fetchStreets, fetchBoundaryFromStreets, fetchScenes, fetchSkeleton,
} from './api.js'
import MarkerOverlay from './MarkerOverlay.jsx'
import MarkerFAB from './MarkerFAB.jsx'
import BezierPen, { flattenPath } from './BezierPen.jsx'
import CircleHandle from './CircleHandle.jsx'
import { CompassRoseSVG } from '../components/CompassRose.jsx'
import {
  TileMesh, TILE_URL, lonLatToTile, tileToLonLat, wgs84ToLocal, localToWgs84,
} from './AerialTiles.jsx'

// Extent's OWN persisted working scene — separate from the global `cartograph-scene`
// (which the Look loader can reset to the default installation). This is what makes
// a cold restart reappear on the hood being built here, and blank when there's none.
const EXTENT_SCENE_KEY = 'cartograph-extent-scene'

// A hood's display name: the authored name wins, else the slug prettified
// (hipointe-demun → "Hipointe Demun"). Shared by the selector label + the tab title.
const prettyHoodName = (name, scene) =>
  (name || '').trim()
  || (scene ? scene.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '')

// The Extent aerial reads ONLY the scene's geography (lat/lon/projection/bbox)
// — NOT neighborhood_boundary.json, which is the very thing being authored. So
// a brand-new hood with no boundary yet still gets a full aerial to frame on.
function extentGeo(g) {
  if (!g) return null
  return {
    center: { lat: g.lat, lon: g.lon },
    lonToMeters: g.lonToMeters,
    latToMeters: g.latToMeters,
    bbox: { ...g.bbox },
    cosLat: Math.cos((g.lat * Math.PI) / 180),
  }
}

// Base zoom for the whole-square aerial. z16 ≈ 1.9 m/px → a ~3.2 km square is
// ~6×6 tiles, near-instant. A hi-res focus layer can follow later; z16 reads
// street labels fine for framing.
const EXTENT_Z = 16

// Every tile across the fetched bbox — no fade-circle cull (there's no circle
// yet). Tiles covering the current camera VIEWPORT (+ margin) — the aerial
// FOLLOWS the camera over the global photo, decoupled from the fetched street
// bbox. That decoupling is what makes frame-then-fetch work: the operator pans
// the unbounded aerial to frame the neighborhood, then fetches exactly the frame.
function buildViewportTiles(geo, z, rect, cap = 240) {
  const [lonA, latA] = localToWgs84(geo, rect.minX, rect.minZ)
  const [lonB, latB] = localToWgs84(geo, rect.maxX, rect.maxZ)
  const [txA, tyA] = lonLatToTile(Math.min(lonA, lonB), Math.max(latA, latB), z)
  const [txB, tyB] = lonLatToTile(Math.max(lonA, lonB), Math.min(latA, latB), z)
  const txLo = Math.min(txA, txB), txHi = Math.max(txA, txB)
  const tyLo = Math.min(tyA, tyB), tyHi = Math.max(tyA, tyB)
  const tiles = []
  for (let tx = txLo; tx <= txHi; tx++) {
    for (let ty = tyLo; ty <= tyHi; ty++) {
      const [nwLon, nwLat] = tileToLonLat(tx, ty, z)
      const [seLon, seLat] = tileToLonLat(tx + 1, ty + 1, z)
      const [x0, z0] = wgs84ToLocal(geo, nwLon, nwLat)
      const [x1, z1] = wgs84ToLocal(geo, seLon, seLat)
      tiles.push({ x: x0, z: z0, w: x1 - x0, h: z1 - z0, url: TILE_URL(tx, ty, z) })
      if (tiles.length >= cap) return tiles
    }
  }
  return tiles
}

// Pick the tile zoom level from the camera zoom so the viewport is ALWAYS ~a few
// dozen tiles — full coverage at any camera zoom, never the tile-cap cutoff (the
// half-black view). Ortho zoom = pixels-per-meter; a tile at level z spans
// EARTH_CIRC·cosLat/2^z meters and we want it ~256 px on screen.
const EARTH_CIRC = 40075016.686
function viewportTileZ(cosLat, camZoom) {
  const z = Math.log2((EARTH_CIRC * cosLat * camZoom) / 256)
  return Math.max(12, Math.min(19, Math.round(z)))
}
function ExtentAerial({ geo }) {
  const { camera } = useThree()
  const [view, setView] = useState(null)   // { rect, z }
  useFrame(() => {
    if (!camera.isOrthographicCamera || !geo) return
    const halfW = ((camera.right - camera.left) / (2 * camera.zoom)) * 1.2
    const halfH = ((camera.top - camera.bottom) / (2 * camera.zoom)) * 1.2
    const cx = camera.position.x, cz = camera.position.z
    const z = viewportTileZ(geo.cosLat, camera.zoom)
    setView(prev => {
      if (prev && prev.z === z
        && Math.abs(prev.rect.minX - (cx - halfW)) < 15 && Math.abs(prev.rect.maxX - (cx + halfW)) < 15
        && Math.abs(prev.rect.minZ - (cz - halfH)) < 15 && Math.abs(prev.rect.maxZ - (cz + halfH)) < 15) return prev
      return { z, rect: { minX: cx - halfW, maxX: cx + halfW, minZ: cz - halfH, maxZ: cz + halfH } }
    })
  })
  const tiles = useMemo(() => (geo && view ? buildViewportTiles(geo, view.z, view.rect) : []), [geo, view])
  if (!geo) return null
  return (
    <group>
      {tiles.map((t) => <TileMesh key={t.url} tile={t} geo={geo} crop={false} y={-0.05} />)}
    </group>
  )
}

// Street labels on the aerial — the load-bearing piece: the operator reads the
// arterials (Big Bend / Skinker / Clayton / Forest Park Pkwy) off the photo to
// name the boundary streets. Only the `major` arterial classes are drawn (18 vs
// 356 residentials) so the frame stays legible. World-space TroikaText sized as
// a fraction of the fetched extent, so labels read at the fit zoom regardless of
// neighborhood size.
const LABEL_SIZE_FRAC = 0.015   // ~1.5% of the square's span (~48 m on HiPointe)
function ExtentLabels({ labels, geo }) {
  const sizeM = useMemo(() => {
    if (!geo) return 40
    const spanM = (geo.bbox.maxLon - geo.bbox.minLon) * geo.lonToMeters
    return spanM * LABEL_SIZE_FRAC
  }, [geo])
  if (!labels?.length || !geo) return null
  return (
    <group>
      {labels.filter(l => l.major).map((l, i) => {
        // Skeleton labels carry current-frame x/z (reproject-raw keeps them
        // aligned to the live geography / aerial), so render at x/z directly.
        return (
        <Text
          key={`${l.name}-${i}`}
          position={[l.x, 2.5, l.z]}
          rotation={[-Math.PI / 2, 0, -l.angle]}
          fontSize={sizeM}
          color="#ffffff"
          outlineWidth="9%"
          outlineColor="#0a0a08"
          outlineOpacity={0.9}
          letterSpacing={0.02}
          anchorX="center"
          anchorY="middle"
          renderOrder={16}
        >
          {l.name}
        </Text>
        )
      })}
    </group>
  )
}

// Fit the top-down ortho camera to the whole fetched square on mount / scene
// change, so opening Extent always frames the fetched extent (no persisted
// LS-centered pan leaving a new hood off-screen). The fit is applied AFTER a
// frame (rAF) so the real canvas size is known, and pushed into MapControls
// (target + update) so the controls don't clamp it back on their first update.
// Auto-fits once per scene; a user zoom/pan afterward is left alone.
function ExtentCamera({ geo, controlsRef, orthoRef }) {
  const { camera, size } = useThree()
  const sceneKey = useCartographStore(s => s.scene)
  const fittedFor = useRef(null)
  // Publish the ortho camera up to the HTML MarkerOverlay (which reads the
  // camera frustum to map screen ↔ world for freehand strokes).
  useEffect(() => {
    if (orthoRef && camera.isOrthographicCamera) orthoRef.current = camera
  }, [camera, orthoRef])
  useEffect(() => {
    if (!camera.isOrthographicCamera || !geo) return
    // Re-fit on scene change AND on a geography change (a ZIP seed rewrites the
    // bbox without changing the scene id); the operator's own zoom is left be.
    const fitKey = `${sceneKey}:${geo.bbox.minLat},${geo.bbox.minLon},${geo.bbox.maxLat},${geo.bbox.maxLon}`
    if (fittedFor.current === fitKey) return
    const halfZ = ((geo.bbox.maxLat - geo.bbox.minLat) * geo.latToMeters) / 2
    const halfX = ((geo.bbox.maxLon - geo.bbox.minLon) * geo.lonToMeters) / 2
    const apply = () => {
      // Real, laid-out canvas size — R3F's initial `size` can be stale/tiny
      // before layout, which would compute a wildly-zoomed-in (too-large) fit.
      const w = camera.right - camera.left || size.width
      const h = camera.top - camera.bottom || size.height
      if (w < 50 || h < 50) { requestAnimationFrame(apply); return }
      camera.position.set(0, 500, 0)
      camera.up.set(0, 0, -1)
      camera.lookAt(0, 0, 0)
      // Frame the whole square with generous breathing room (1.3×).
      const fitH = h / (2 * halfZ * 1.3)
      const fitW = w / (2 * halfX * 1.3)
      camera.zoom = Math.min(fitH, fitW)
      camera.updateProjectionMatrix()
      const ctl = controlsRef?.current
      if (ctl) { ctl.target.set(0, 0, 0); ctl.update() }
      fittedFor.current = fitKey
    }
    const id = requestAnimationFrame(apply)
    return () => cancelAnimationFrame(id)
  }, [camera, geo, sceneKey, controlsRef, size.width, size.height])
  return null
}

// The resolved boundary drawn on the aerial — the polygon of skeleton-junction
// corners, its geographic centroid, and the containing circle. Everything is in
// the live geography frame (the corners came from the current-frame skeleton),
// so it registers on the photo. Lines sit above the labels (y) so they read.
function circlePts(cx, cz, r, n = 96) {
  const out = []
  for (let i = 0; i <= n; i++) { const t = (i / n) * Math.PI * 2; out.push([cx + r * Math.cos(t), 4, cz + r * Math.sin(t)]) }
  return out
}
function ExtentBoundary({ corners, centroid, radiusM, showVertices = true }) {
  const hasPoly = corners?.length >= 2
  // Draw when there's a polygon OR just a circle (a reopened committed hood has
  // no live corners but should still show its circle so radius re-scope isn't blind).
  if (!hasPoly && !(centroid && radiusM > 0)) return null
  const poly = hasPoly ? corners.map(c => [c.x, 4, c.z]) : []
  if (hasPoly && corners.length >= 3) poly.push([corners[0].x, 4, corners[0].z])
  return (
    <group>
      {/* Dark halo behind the boundary so it stays distinct over the busy aerial. */}
      {hasPoly && <Line points={poly} color="#08110d" lineWidth={6} dashed={false} />}
      {hasPoly && <Line points={poly} color="#38e1ff" lineWidth={3} dashed={false} />}
      {centroid && radiusM > 0 && (
        <Line points={circlePts(centroid.x, centroid.z, radiusM)} color="#ffd23f" lineWidth={2} />
      )}
      {showVertices && hasPoly && corners.map((c, i) => (
        <mesh key={i} position={[c.x, 4.5, c.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={40}>
          <circleGeometry args={[16, 20]} />
          <meshBasicMaterial color="#38e1ff" transparent opacity={0.95} depthTest={false} />
        </mesh>
      ))}
      {centroid && (
        <mesh position={[centroid.x, 4.5, centroid.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={41}>
          <circleGeometry args={[22, 24]} />
          <meshBasicMaterial color="#ff3df0" depthTest={false} />
        </mesh>
      )}
    </group>
  )
}

// The HEALED boundary-street process — every hydrated street drawn as a CLICKABLE
// line. The operator clicks the real boundary streets (any order); selected ones
// light up cyan, gaps (a selected street that doesn't yet close the ring) go amber.
// This is the visual multi-segment selection the doctrine calls for — picking on
// hydrated geometry, never typed names driving geometry. Clicking a chain toggles
// its whole (corridor-collapsed) name, so the entire street selects at once.
function ExtentClickableStreets({ streets, selected, gaps, onToggle }) {
  const sel = useMemo(() => new Set(selected), [selected])
  const gapSet = useMemo(() => new Set(gaps), [gaps])
  if (!streets?.length) return null
  return (
    <group>
      {streets.map((s, i) => {
        const isSel = sel.has(s.name)
        const isGap = isSel && gapSet.has(s.name)
        const color = isGap ? '#ffb038' : isSel ? '#38e1ff' : (s.major ? '#cbd3cd' : '#79827a')
        const width = isSel ? 4.5 : (s.major ? 2.2 : 1.4)
        const opacity = isSel ? 0.98 : (s.major ? 0.7 : 0.48)
        const y = isSel ? 3.2 : 2.6
        return (
          <Line key={`${i}-${s.name}`} points={s.points.map(([x, z]) => [x, y, z])}
            color={color} lineWidth={width} transparent opacity={opacity}
            onClick={(e) => { e.stopPropagation(); onToggle(s.name) }} />
        )
      })}
    </group>
  )
}

// Dim the map OUTSIDE the boundary circle — previews the slab stencil so the
// neighborhood reads as the subject. A big dark ring from the circle rim outward.
function ExtentDim({ centroid, radiusM }) {
  if (!centroid || !(radiusM > 0)) return null
  return (
    <mesh position={[centroid.x, 1, centroid.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={5}>
      <ringGeometry args={[radiusM, radiusM + 40000, 128, 1]} />
      <meshBasicMaterial color="#000000" transparent opacity={0.45} depthWrite={false} />
    </mesh>
  )
}

// The live building-footprint overlay — every MSBF footprint (current-frame x/z)
// merged into ONE geometry, colored inside-vs-outside the boundary circle so the
// neighborhood's buildings read as the subject. Built once per fetch; the SAME
// mesh serves the roster editor (per-vertex aBuildingId survives for the raycast
// → hide gesture in the next step). Footprints sit just above the dim ring, below
// labels/boundary lines.
const FOOTPRINT_Y = 1.5
// Ray-cast point-in-polygon (poly = array of {x,z}); the neighborhood's default
// membership is "centroid inside the boundary-street polygon".
function pointInPolygon(px, pz, poly) {
  if (!poly || poly.length < 3) return false
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, zi = poly[i].z, xj = poly[j].x, zj = poly[j].z
    if (((zi > pz) !== (zj > pz)) && (px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi)) inside = !inside
  }
  return inside
}
// Average of a footprint ring [[x,z],…] — the building's representative point.
function ringCentroid(ring) {
  let sx = 0, sz = 0
  for (const [x, z] of ring) { sx += x; sz += z }
  return { x: sx / ring.length, z: sz / ring.length }
}
function buildFootprintGeometry(buildings) {
  const positions = []
  const ids = []
  for (let bi = 0; bi < buildings.length; bi++) {
    let ring = buildings[bi].ring
    if (!ring || ring.length < 3) continue
    // Drop a duplicate closing vertex (MSBF rings are closed) so triangulation
    // doesn't choke on a zero-length edge.
    const a = ring[0], z = ring[ring.length - 1]
    if (a[0] === z[0] && a[1] === z[1]) ring = ring.slice(0, -1)
    if (ring.length < 3) continue
    const contour = ring.map(([x, zz]) => new THREE.Vector2(x, zz))
    let tris
    try { tris = THREE.ShapeUtils.triangulateShape(contour, []) } catch { tris = null }
    if (!tris || !tris.length) continue
    for (const t of tris) {
      for (const idx of t) {
        const [x, zz] = ring[idx]
        positions.push(x, FOOTPRINT_Y, zz)
        ids.push(bi)
      }
    }
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geom.setAttribute('aBuildingId', new THREE.Float32BufferAttribute(ids, 1))
  return geom
}
function ExtentBuildings({ footprints, centroid, radiusM, curating, excludedIds, onToggle }) {
  const buildings = footprints?.buildings
  const geom = useMemo(
    () => (buildings?.length ? buildFootprintGeometry(buildings) : null),
    [buildings],
  )
  const count = buildings?.length || 1
  // Per-building hidden flag as a data texture, indexed by aBuildingId (the
  // building index). Toggling a hide rewrites this texture — NEVER the geometry
  // — so a click is instant. R channel: 255 = hidden.
  const hiddenTex = useMemo(() => {
    const tex = new THREE.DataTexture(new Uint8Array(count * 4), count, 1, THREE.RGBAFormat)
    tex.magFilter = THREE.NearestFilter
    tex.minFilter = THREE.NearestFilter
    tex.needsUpdate = true
    return tex
  }, [count])
  useEffect(() => {
    if (!buildings) return
    const data = hiddenTex.image.data
    for (let i = 0; i < buildings.length; i++) data[i * 4] = excludedIds.has(buildings[i].id) ? 255 : 0
    hiddenTex.needsUpdate = true
  }, [hiddenTex, buildings, excludedIds])

  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    uniforms: {
      uCenter: { value: new THREE.Vector2(0, 0) },
      uRadius: { value: 1e9 },
      // Artificial, high-contrast VIOLET footprints — reads clearly over the aerial
      // and stays distinct from the cyan boundary + yellow circle. (Swap both to
      // teal '#2fd8c8' / '#1f7f77' if preferred.) Ghost = red for "will be dropped".
      uInside: { value: new THREE.Color('#b06cff') },
      uOutside: { value: new THREE.Color('#5a4a7a') },
      uGhost: { value: new THREE.Color('#ff5a5a') },
      uHidden: { value: null },
      uCount: { value: 1 },
      uCurating: { value: 0 },
    },
    vertexShader: `
      attribute float aBuildingId;
      varying vec2 vWorldXZ;
      varying float vId;
      void main() {
        vId = aBuildingId;
        vWorldXZ = (modelMatrix * vec4(position, 1.0)).xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec2 uCenter;
      uniform float uRadius;
      uniform vec3 uInside;
      uniform vec3 uOutside;
      uniform vec3 uGhost;
      uniform sampler2D uHidden;
      uniform float uCount;
      uniform float uCurating;
      varying vec2 vWorldXZ;
      varying float vId;
      void main() {
        float hidden = texture2D(uHidden, vec2((vId + 0.5) / uCount, 0.5)).r;
        // Hidden + not editing → truly gone (what the bake will drop).
        if (hidden > 0.5 && uCurating < 0.5) discard;
        float inside = step(distance(vWorldXZ, uCenter), uRadius);
        vec3 base = mix(uOutside, uInside, inside);
        vec3 c = mix(base, uGhost, step(0.5, hidden));       // ghost tint while editing
        // Included footprints read as (near-)solid; outside dimmer; a hidden/ghost
        // building stays faint. Overlay stays transparent-flagged, just not ghostly.
        float a = hidden > 0.5 ? 0.16 : mix(0.42, 0.9, inside);
        gl_FragColor = vec4(c, a);
      }`,
  }), [])
  useEffect(() => {
    mat.uniforms.uCenter.value.set(centroid?.x ?? 0, centroid?.z ?? 0)
    // No circle yet → treat every building as inside (all warm) until the
    // operator resolves a boundary.
    mat.uniforms.uRadius.value = radiusM > 0 ? radiusM : 1e9
  }, [mat, centroid, radiusM])
  useEffect(() => { mat.uniforms.uHidden.value = hiddenTex; mat.uniforms.uCount.value = count }, [mat, hiddenTex, count])
  useEffect(() => { mat.uniforms.uCurating.value = curating ? 1 : 0 }, [mat, curating])
  useEffect(() => () => { geom?.dispose(); hiddenTex?.dispose() }, [geom, hiddenTex])

  const handleClick = (e) => {
    if (!curating || !geom || !buildings) return
    e.stopPropagation()
    const bi = geom.getAttribute('aBuildingId').getX(e.face.a)   // building index off the hit face
    const b = buildings[bi]
    if (b) onToggle(b.id)
  }

  if (!geom) return null
  return (
    <mesh
      geometry={geom}
      material={mat}
      renderOrder={6}
      onClick={curating ? handleClick : undefined}
      // Off edit-mode: no-op raycast so the overlay never intercepts map drags.
      raycast={curating ? THREE.Mesh.prototype.raycast : () => null}
    />
  )
}

// One boundary-street combobox. Reuses the suite's row/input/button/dropdown
// system (carto-row · carto-input · carto-btn-sm · carto-looks-option ·
// carto-section-caret · carto-glass). Two modes: TYPE → flat filtered matches
// (arterials first); EMPTY → Arterials up top, then the rest as collapsible
// A–Z sub-dropdowns so hundreds of streets stay navigable.
function SideInput({ index, value, placeholder, names, onChange, onRemove, onHover, dir }) {
  const [open, setOpen] = useState(false)
  const [letter, setLetter] = useState(null)
  // `browsing` = the field was clicked/focused to RE-pick (a value is already
  // set) → show the full list instead of filtering by the committed value, so a
  // filled field stays re-selectable. Cleared as soon as the operator types.
  const [browsing, setBrowsing] = useState(false)
  const wrapRef = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) { setOpen(false); onHover && onHover(null) }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, onHover])

  const q = value.trim().toLowerCase()
  const filtering = !browsing && q.length > 0
  const byLetter = useMemo(() => {
    const m = new Map()
    for (const n of names.minor) {
      const L = (n[0] || '#').toUpperCase()
      if (!m.has(L)) m.set(L, [])
      m.get(L).push(n)
    }
    return m
  }, [names.minor])

  const pick = (n) => { onChange(index, n); setOpen(false); onHover && onHover(null) }
  const Option = (n, extra = '') => (
    <button key={n} type="button" className={`carto-looks-option ${extra}`}
      onMouseEnter={() => onHover && onHover(n)}
      onMouseDown={e => { e.preventDefault(); pick(n) }}>{n}</button>
  )
  const fMajor = filtering ? names.major.filter(n => n.toLowerCase().includes(q)) : []
  const fMinor = filtering ? names.minor.filter(n => n.toLowerCase().includes(q)) : []

  return (
    <div className="carto-row" style={{ position: 'relative' }} ref={wrapRef}>
      <input className="carto-input" value={value} placeholder={placeholder} spellCheck={false}
        onChange={e => { onChange(index, e.target.value); setOpen(true); setBrowsing(false) }}
        onFocus={e => { setOpen(true); setBrowsing(true); e.target.select() }}
        onClick={() => { setOpen(true); setBrowsing(true) }} />
      {dir && <span className="carto-meta--value" style={{ minWidth: 26, textAlign: 'center', opacity: 0.85 }} title="derived side (from geometry)">{dir}</span>}
      <button className="carto-btn-sm" onClick={() => onRemove(index)} title="Remove this street">×</button>
      {open && (
        <div className="carto-extent-combo carto-glass">
          {filtering ? (
            (fMajor.length + fMinor.length) === 0
              ? <div className="carto-extent-combo-empty">no match</div>
              : <>
                {fMajor.map(n => Option(n))}
                {fMajor.length > 0 && fMinor.length > 0 && <div className="carto-looks-sep" />}
                {fMinor.map(n => Option(n))}
              </>
          ) : (
            <>
              {names.major.length > 0 && <div className="carto-extent-combo-group">Arterials</div>}
              {names.major.map(n => Option(n))}
              {names.major.length > 0 && byLetter.size > 0 && <div className="carto-looks-sep" />}
              {[...byLetter.keys()].map(L => (
                <div key={L}>
                  <button type="button" className="carto-looks-option carto-extent-combo-letter"
                    onMouseDown={e => { e.preventDefault(); setLetter(v => v === L ? null : L) }}>
                    <span className={`carto-section-caret${letter === L ? ' is-open' : ''}`}>▸</span>
                    {L}<span className="carto-extent-combo-count">{byLetter.get(L).length}</span>
                  </button>
                  {letter === L && byLetter.get(L).map(n => Option(n, 'carto-extent-combo-sub'))}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// The EMPTY WORKSPACE — a neutral gray grid shown before any place is searched.
// The tool opens to THIS, not to Lafayette Square: nothing is loaded, nothing can
// be touched. A search replaces it with the place's aerial. A large plane + grid,
// centered on the origin (the default camera looks straight down at it).
function WorkspaceGrid() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.3, 0]}>
        <planeGeometry args={[40000, 40000]} />
        <meshBasicMaterial color="#43463f" />
      </mesh>
      <gridHelper args={[40000, 160, '#585c53', '#4a4d45']} position={[0, -0.1, 0]} />
    </group>
  )
}

// Slug a searched place into a scene id: primary place name (before the first
// comma) → lowercase → non-alnum to hyphens → collapse. "Altadena, Los Angeles
// County…" → "altadena"; "Hi-Pointe + De Mun" → "hi-pointe-de-mun". Falls back
// to the raw query. This is the NEW neighborhood's own scene — never the active
// (Lafayette Square) one — so authoring it can't touch any other installation.
function sluggifyPlace(anchors, query) {
  const primary = (anchors?.[0]?.displayName || query || '').split(',')[0]
  const slug = primary.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return slug || 'neighborhood'
}

// Neighborhood selector — the persistent switcher at the top of the Extent panel.
// Neighborhoods (not Looks) live HERE (the Look pulldown is per-neighborhood presets).
// Same chrome as the Look pulldown (carto-looks-*) for visual consistency: the current
// hood + a popup listing every existing hood (✓ = committed) + "＋ New neighborhood".
function NeighborhoodSelector({ scenes, current, currentName, onOpen, onNew }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  // Prettify an unnamed hood's slug for display (hipointe-demun → "Hipointe Demun");
  // an authored name (from Name & blurb) always wins.
  const label = prettyHoodName(currentName, current) || 'Select a neighborhood'
  return (
    <div className="carto-looks-menu" ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)}
        title="Switch neighborhood — or start a new one"
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '8px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
          background: 'rgba(255,255,255,0.05)', border: `1px solid rgba(255,255,255,${open ? 0.22 : 0.12})`,
          color: '#e7efe0', fontSize: 15, fontWeight: 600,
        }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span aria-hidden="true" style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
      </button>
      {open && (
        <div className="carto-looks-popup carto-glass" role="listbox">
          {scenes.map(s => (
            <button key={s.id} type="button" role="option" aria-selected={s.id === current}
              className={`carto-looks-option${s.id === current ? ' is-active' : ''}`}
              onClick={() => { onOpen(s.id); setOpen(false) }}>
              {s.name || s.id}{s.committed ? ' ✓' : ''}
            </button>
          ))}
          {scenes.length > 0 && <div className="carto-looks-sep" />}
          <button type="button" className="carto-looks-option" onClick={() => { onNew(); setOpen(false) }}>
            ＋ New neighborhood…
          </button>
        </div>
      )}
    </div>
  )
}

export default function ExtentApp() {
  const setStoreScene = useCartographStore(s => s.setScene)
  // The neighborhood being edited. Extent reappears on the LAST hood being built
  // here, else a BLANK workspace — it NEVER falls back to the default installation
  // (LS). The global store scene defaults to LS on a cold boot, so keying off it
  // would wrongly open LS; Extent persists its OWN working scene (`EXTENT_SCENE_KEY`,
  // untouched by the Look loader) and reads that. "New neighborhood" clears to null
  // = the EMPTY WORKSPACE; a search establishes a new hood's OWN scene (slug).
  const [scene, setSceneLocal] = useState(() => {
    const ok = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(s) && s !== 'toy'
    try {
      const ext = localStorage.getItem(EXTENT_SCENE_KEY)
      if (ok(ext)) return ext
      // First-ever entry (no Extent history): honour an EXPLICIT non-default store
      // scene (a ?scene= deep-link or a real neighborhood), else blank — never the
      // bare LS default.
      const s = useCartographStore.getState().scene
      if (ok(s) && s !== 'lafayette-square') return s
    } catch { /* ignore */ }
    return null
  })
  const setShot = useCartographStore(s => s.setShot)
  const sceneGeography = useCartographStore(s => s.sceneGeography)
  const sceneBoundary = useCartographStore(s => s.sceneBoundary)
  const geo = useMemo(() => extentGeo(sceneGeography), [sceneGeography])
  // Persist Extent's own working scene (incl. the blank workspace, null → '') so a
  // cold restart reappears here — never on the LS default.
  useEffect(() => {
    try { localStorage.setItem(EXTENT_SCENE_KEY, scene || '') } catch { /* ignore */ }
  }, [scene])
  // On entry, make the global store scene match the scene we restored (openScene
  // does this for clicks; the initial restore needs it too so the aerial/camera/
  // looks track the right hood, and localStorage isn't left pointing at LS).
  useEffect(() => {
    if (scene && useCartographStore.getState().scene !== scene) setStoreScene(scene)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const markerActive = useCartographStore(s => s.markerActive)
  const controlsRef = useRef(null)
  const orthoRef = useRef(null)
  // Bumps after a ZIP seed re-fetches geography/skeleton, forcing the label +
  // name pools (and the camera fit) to reload against the fresh data.
  const [seedToken, setSeedToken] = useState(0)

  // Pre-skeleton street labels (from raw OSM, scene-aware). Fetched once per
  // scene; drives both the on-aerial arterials and the Sides autocomplete.
  const [labels, setLabels] = useState([])
  useEffect(() => {
    let cancelled = false
    setLabels([])
    if (!scene) return
    fetchSkeletonLabels(scene)
      .then(r => { if (!cancelled) setLabels(r.labels || []) })
      .catch(() => { if (!cancelled) setLabels([]) })
    return () => { cancelled = true }
  }, [scene, seedToken])

  // All hydrated street polylines — the CLICKABLE boundary-selection layer (the
  // healed process). Loaded per scene + after a fresh Fetch; empty until a fetch
  // hydrates the skeleton (search alone shows only the official best-guess).
  const [allStreets, setAllStreets] = useState([])
  useEffect(() => {
    let cancelled = false
    setAllStreets([])
    if (!scene) return
    fetchStreets(scene)
      .then(r => { if (!cancelled) setAllStreets(r.streets || []) })
      .catch(() => { if (!cancelled) setAllStreets([]) })
    return () => { cancelled = true }
  }, [scene, seedToken])

  // Building footprints for the live overlay (+ the roster editor). Re-fetched
  // per scene and after a fresh Fetch (seedToken) — msbf.json's x/z is reprojected
  // into the live frame, so the overlay registers on the aerial.
  const [footprints, setFootprints] = useState(null)
  useEffect(() => {
    let cancelled = false
    setFootprints(null)
    if (!scene) return
    fetchBuildingFootprints(scene)
      .then(r => { if (!cancelled) setFootprints(r) })
      .catch(() => { if (!cancelled) setFootprints(null) })
    return () => { cancelled = true }
  }, [scene, seedToken])

  // Roster editor. The neighborhood's DEFAULT building membership is "centroid
  // inside the boundary-street polygon"; the operator's overrides layer on top —
  // `activate` = force-IN an outside building, `hide` = force-OUT an inside one —
  // stored per scene as { activate, hide } (robust to radius/polygon edits).
  const [curating, setCurating] = useState(false)
  const [activate, setActivate] = useState(() => new Set())
  const [hide, setHide] = useState(() => new Set())
  const ovHydrated = useRef(false)
  useEffect(() => {
    let cancelled = false
    ovHydrated.current = false
    setCurating(false); setActivate(new Set()); setHide(new Set())
    if (!scene) return
    fetchBuildingOverrides(scene)
      .then(r => { if (!cancelled) { setActivate(new Set(r.activate || [])); setHide(new Set(r.hide || [])); ovHydrated.current = true } })
      .catch(() => { ovHydrated.current = true })
    return () => { cancelled = true }
  }, [scene])
  useEffect(() => {
    if (!ovHydrated.current) return
    const t = setTimeout(() => { saveBuildingOverrides(scene, { activate: [...activate], hide: [...hide] }).catch(() => {}) }, 400)
    return () => clearTimeout(t)
  }, [activate, hide, scene])

  // Autocomplete pool — skeleton-sourced + corridor-collapsed, GROUPED
  // (arterials, then the rest), each A→Z. A directional corridor shows as ONE
  // entry ("Big Bend Boulevard"). A custom combobox renders the groups (native
  // <datalist> re-sorts flat). Sourced from the skeleton, not the aerial labels,
  // so the corridor unification (the kit link) is reflected.
  const [names, setNames] = useState({ major: [], minor: [] })
  useEffect(() => {
    let cancelled = false
    setNames({ major: [], minor: [] })
    if (!scene) return
    fetchStreetNames(scene)
      .then(r => { if (!cancelled) setNames(r || { major: [], minor: [] }) })
      .catch(() => { if (!cancelled) setNames({ major: [], minor: [] }) })
    return () => { cancelled = true }
  }, [scene, seedToken])

  // The boundary streets, in order around the perimeter (the operator names them
  // reading the labeled aerial). Corners resolve server-side from the skeleton.
  const [query, setQuery] = useState('')
  const [seeding, setSeeding] = useState(false)
  const [seedError, setSeedError] = useState(null)
  const [fetchSources, setFetchSources] = useState(null)   // per-source ✓/count/error after a Fetch
  // Intake starts BLANK: nothing has been fetched yet, so show no map until the
  // operator Searches (or Fetches). No defaulting to the active scene's map.
  const [located, setLocated] = useState(false)
  const [committed, setCommitted] = useState(false)
  const [building, setBuilding] = useState(false)
  const [buildStage, setBuildStage] = useState(null)
  const [previewStreet, setPreviewStreet] = useState(null)
  const [sides, setSides] = useState([])   // selected boundary streets (visual, order-independent)
  const [streetCorners, setStreetCorners] = useState(null)   // resolved from named boundary streets
  // The editable EXCLUSION LOOPS — the FIRST-CLASS persisted artifact (a LIST). Every
  // building is in by default; each closed loop hides the strays inside it. Stored
  // frame-independently as lon/lat so a re-fetch / commit re-center never drifts them.
  //   [{ closed, anchors:[{ lon, lat, type, handleIn?, handleOut? }] }, …]
  const [exclusionsLL, setExclusionsLL] = useState([])
  const [penActive, setPenActive] = useState(false)     // pen tool engaged → clicks author loops
  const [selAnchor, setSelAnchor] = useState(null)      // selected point {p,a} (drives handles + Delete)
  // Hold Space while penning → SUSPEND the pen (yield the click to MapControls so
  // you can pan; the pen becomes a hand), resume on release. Like Illustrator/Figma.
  // preventDefault stops Space from scrolling AND from re-clicking the focused pen
  // button (which was toggling the pen off). Only armed in pen mode.
  const [spacePan, setSpacePan] = useState(false)
  useEffect(() => {
    if (!penActive) { setSpacePan(false); return }
    const down = (e) => {
      if (e.code !== 'Space' || e.repeat) return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
      setSpacePan(true)
    }
    const up = (e) => { if (e.code === 'Space') { e.preventDefault(); setSpacePan(false) } }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [penActive])
  const [anchors, setAnchors] = useState(null)       // matched place names, for the "matched:" line
  // Descriptive metadata — name + short blurb (the blurb doubles as SEO/description).
  const [name, setName] = useState('')
  const [blurb, setBlurb] = useState('')
  // Browser tab = the authored Neighborhood Name (verbatim), or the prettified slug
  // while a hood is still un-named, or the tool name on the empty workspace.
  useEffect(() => {
    const hood = prettyHoodName(name, scene)
    document.title = hood ? `${hood} — Extent` : 'Neighborhood Extent'
  }, [name, scene])
  const [radiusM, setRadiusM] = useState(0)
  const [radiusTouched, setRadiusTouched] = useState(false)
  // §4 live re-scope: the radius the committed circle was last baked at. When the
  // operator drags radiusM away from this on a committed scene, offer "Re-scope".
  const [committedRadius, setCommittedRadius] = useState(0)
  const [rescoping, setRescoping] = useState(false)
  const draftHydrated = useRef(false)

  const r2 = (v) => Math.round(v * 100) / 100
  // Stored lon/lat EXCLUSION LOOPS → the x/z loops BezierPen edits + renders. Every
  // building is IN by default; each CLOSED loop excludes the strays inside it. Loops
  // are stored frame-independently (lon/lat) so a re-fetch / commit re-center never
  // drifts them off the aerial. `penPaths` is the projected editable list.
  const penPaths = useMemo(() => {
    if (!exclusionsLL?.length || !geo) return []
    return exclusionsLL.map(loop => ({
      closed: !!loop.closed,
      anchors: (loop.anchors || []).map(a => {
        const [x, z] = wgs84ToLocal(geo, a.lon, a.lat)
        const out = { x: r2(x), z: r2(z), type: a.type || 'corner' }
        if (a.handleIn) { const [hx, hz] = wgs84ToLocal(geo, a.handleIn.lon, a.handleIn.lat); out.hIn = { x: r2(hx), z: r2(hz) } }
        if (a.handleOut) { const [hx, hz] = wgs84ToLocal(geo, a.handleOut.lon, a.handleOut.lat); out.hOut = { x: r2(hx), z: r2(hz) } }
        return out
      }),
    }))
  }, [exclusionsLL, geo])

  // Pen edits (x/z loops) → frame-independent lon/lat loops (the persisted artifact).
  const onPenChange = useCallback((xzPaths) => {
    if (!geo) return
    const loops = (xzPaths || []).map(loop => ({
      closed: !!loop.closed,
      anchors: (loop.anchors || []).map(a => {
        const [lon, lat] = localToWgs84(geo, a.x, a.z)
        const out = { lon, lat, type: a.type || 'corner' }
        if (a.hIn) { const [hl, ht] = localToWgs84(geo, a.hIn.x, a.hIn.z); out.handleIn = { lon: hl, lat: ht } }
        if (a.hOut) { const [hl, ht] = localToWgs84(geo, a.hOut.x, a.hOut.z); out.handleOut = { lon: hl, lat: ht } }
        return out
      }),
    })).filter(l => l.anchors.length)
    setExclusionsLL(loops)
  }, [geo])

  // Closed loops flattened to x/z polygons — the point-in-polygon carve set.
  const exclusionPolys = useMemo(
    () => penPaths.filter(p => p.closed && p.anchors.length >= 3).map(p => flattenPath(p)).filter(poly => poly.length >= 3),
    [penPaths],
  )
  const inExclusion = useCallback((c) => {
    for (const poly of exclusionPolys) if (pointInPolygon(c.x, c.z, poly)) return true
    return false
  }, [exclusionPolys])

  // Skeleton junctions = the pen's (subtle) snap targets. Assist only — the RESULT is
  // frozen as a plain coord by onPenChange; no node reference stored.
  const [snapJunctions, setSnapJunctions] = useState([])
  useEffect(() => {
    let cancelled = false
    setSnapJunctions([])
    if (!scene) return
    fetchSkeleton(scene)
      .then(r => { if (!cancelled) setSnapJunctions((r.junctions || []).map(j => ({ x: j.x, z: j.z }))) })
      .catch(() => { if (!cancelled) setSnapJunctions([]) })
    return () => { cancelled = true }
  }, [scene, seedToken])

  // The extent circle center: pre-commit = the centroid of KEPT buildings (auto-fit);
  // a COMMITTED hood is re-centered so its circle sits at the origin.
  const keptCenter = useMemo(() => {
    if (committed) return { x: 0, z: 0 }
    const bs = footprints?.buildings
    if (!bs?.length) return { x: 0, z: 0 }
    let sx = 0, sz = 0, n = 0
    for (const b of bs) {
      const c = ringCentroid(b.ring)
      if (hide.has(b.id) || (!activate.has(b.id) && inExclusion(c))) continue   // loop/hand excluded
      sx += c.x; sz += c.z; n++
    }
    if (!n) return { x: 0, z: 0 }
    return { x: r2(sx / n), z: r2(sz / n) }
  }, [footprints, committed, hide, activate, inExclusion])

  // Membership (INVERTED): a building is EXCLUDED if hand-hidden, or (not force-kept
  // AND (inside any loop OR outside the extent circle)). The circle is a coarse dial
  // that auto-fits the kept set (so it removes nothing by default); loops are the
  // fine carve. This mirrors the pour/bake exactly (circle fallback + exclusions).
  const excludedIds = useMemo(() => {
    const set = new Set()
    const bs = footprints?.buildings
    if (!bs) return set
    const R2 = radiusM > 0 ? radiusM * radiusM : Infinity
    for (const b of bs) {
      const c = ringCentroid(b.ring)
      const out = hide.has(b.id) || (!activate.has(b.id) && (inExclusion(c) || ((c.x - keptCenter.x) ** 2 + (c.z - keptCenter.z) ** 2) > R2))
      if (out) set.add(b.id)
    }
    return set
  }, [footprints, hide, activate, inExclusion, keptCenter, radiusM])

  // The kept set's reach from the center — drives the auto-fit radius + the Pour gate.
  const keptFit = useMemo(() => {
    const bs = footprints?.buildings
    if (!bs?.length) return { radius: 0, count: 0 }
    let radius = 0, count = 0
    for (const b of bs) {
      const c = ringCentroid(b.ring)
      if (hide.has(b.id) || (!activate.has(b.id) && inExclusion(c))) continue
      count++
      radius = Math.max(radius, Math.hypot(c.x - keptCenter.x, c.z - keptCenter.z))
    }
    return { radius: Math.round(radius), count }
  }, [footprints, hide, activate, inExclusion, keptCenter])

  // The single "eraser": flip one building's membership as a minimal override.
  const toggleBuilding = (id) => {
    const bs = footprints?.buildings
    const b = bs?.find(x => x.id === id)
    if (!b) return
    const c = ringCentroid(b.ring)
    const geomOut = inExclusion(c)   // does the geometry (loops) say OUT?
    const excluded = excludedIds.has(id)
    const a = new Set(activate), h = new Set(hide)
    if (excluded) { h.delete(id); a.add(id) }             // force-IN (survives loops + circle)
    else { a.delete(id); if (!geomOut) h.add(id) }        // force-OUT (a building the loops kept)
    setActivate(a); setHide(h)
  }

  // On scene establish (a search sets it) or committed re-open: clear transient
  // geometry and, for a COMMITTED hood, restore its saved extent from disk. Does
  // NOT touch `located` — the SEARCH owns it (this fires right after onSearch sets
  // the scene, and clearing it would blank the aerial the operator just framed).
  // It DOES reset name/blurb/sides/radius: hydration below only SETS them when the
  // new hood has values, so without this reset a hood with an empty name would keep
  // the PREVIOUS hood's name — which the autosave then wrote to the wrong scene's
  // file (the LS-name-on-Altadena clobber). Search sets name/blurb to '' anyway, so
  // resetting here is idempotent for a search and correct for an open.
  // `scene === null` (empty workspace) is a clean no-op: nothing loads.
  useEffect(() => {
    if (!scene) return
    setSeedError(null); setFetchSources(null)
    setSides([]); setStreetCorners(null); setPreviewStreet(null)
    setName(''); setBlurb(''); setRadiusM(0); setRadiusTouched(false)
    setCommittedRadius(0); setRescoping(false)
    setExclusionsLL([]); setPenActive(false); setSelAnchor(null)
    draftHydrated.current = false
    let cancelled = false
    ;(async () => {
      const nb = await fetchNeighborhood(scene).catch(() => null)
      if (cancelled) return
      if (nb) {
        if (Array.isArray(nb.sides) && nb.sides.some(Boolean)) setSides(nb.sides.filter(Boolean))
        if (nb.name) setName(nb.name)
        if (nb.blurb) setBlurb(nb.blurb)
        if (nb.radius > 0) { setRadiusM(nb.radius); setRadiusTouched(true) }
        // Rehydrate the editable pen path (lon/lat) — reopening a hood returns the
        // FULL editable path (not a frozen polygon), the "keep fixing across sessions"
        // requirement. Projected to the live frame by `penPaths`.
        if (Array.isArray(nb.exclusions) && nb.exclusions.length) setExclusionsLL(nb.exclusions)
        if (nb.committed) { setCommitted(true); setCommittedRadius(Math.round(nb.radius) || 0) }
      }
      // Load the frame + boundary so an EXISTING hood (committed OR fetched-but-
      // in-progress, like Altadena) shows its aerial + circle on entry. For a fresh
      // SEARCH the store geo is already set (disk has none yet) → we keep it and
      // don't touch `located`, so the aerial the operator just framed isn't blanked.
      const st = useCartographStore.getState()
      const [g, b] = await Promise.all([
        st.sceneGeography ? Promise.resolve(st.sceneGeography) : fetchGeography(scene).catch(() => null),
        fetchBoundary(scene).catch(() => null),
      ])
      if (cancelled) return
      const upd = {}
      if (g && !st.sceneGeography) upd.sceneGeography = g
      if (b) upd.sceneBoundary = b
      if (Object.keys(upd).length) useCartographStore.setState(upd)
      if (g || st.sceneGeography) setLocated(true)
      // NO geocode-for-geometry on open. Search is a data bootstrap only; the
      // operator authors the boundary with the pen (never an admin ring — an
      // administrative polygon is not a neighborhood; `HANDOFF-extent-pen-boundary.md`).
      draftHydrated.current = scene
    })().catch(() => { draftHydrated.current = scene })
    return () => { cancelled = true }
  }, [scene])

  // A committed boundary that loads later also reveals the map (belt-and-suspenders
  // to the committed hydration above). Gated on a scene so the empty workspace stays blank.
  useEffect(() => { if (scene && sceneBoundary) setLocated(true) }, [scene, sceneBoundary])

  // Draft auto-save (implicit) — sides + radius, debounced. Only writes once the
  // CURRENT scene's data has hydrated (draftHydrated holds the hydrated scene id) —
  // so a mid-switch render can never persist one hood's fields into another's file.
  useEffect(() => {
    if (draftHydrated.current !== scene || !scene) return
    const clean = sides.map(s => s.trim()).filter(Boolean)
    const t = setTimeout(() => { saveNeighborhood(scene, { sides: clean, radius: Math.round(radiusM) || 0, name: name.trim(), blurb: blurb.trim(), exclusions: exclusionsLL || [] }).catch(() => {}) }, 500)
    return () => clearTimeout(t)
  }, [sides, radiusM, name, blurb, exclusionsLL, scene])

  // Dropdown hover-preview — highlight a candidate street before selecting it.
  const previewTimer = useRef(null)
  const onHoverStreet = (name) => {
    clearTimeout(previewTimer.current)
    if (!name) { setPreviewStreet(null); return }
    if (!scene) return
    previewTimer.current = setTimeout(() => {
      fetchStreetGeom(scene, name).then(r => setPreviewStreet({ name, polylines: r.polylines || [] })).catch(() => {})
    }, 50)
  }

  const [searching, setSearching] = useState(false)

  // The neighborhoods that EXIST — the hub list (open any of them, incl. hoods with
  // no baked Look). Refreshed on mount + whenever we return to the hub (scene null).
  const [scenesList, setScenesList] = useState([])
  useEffect(() => {
    let cancelled = false
    fetchScenes().then(r => { if (!cancelled) setScenesList(r.scenes || []) }).catch(() => {})
    return () => { cancelled = true }
  }, [scene])

  // Open an existing neighborhood — make it the active scene + load its seed (the
  // [scene] effect hydrates the frame/boundary). Clears any in-flight search state.
  const openScene = (id) => {
    setStoreScene(id)
    setLocated(false); setExclusionsLL([]); setPenActive(false); setSelAnchor(null); setAnchors(null)
    setCommitted(false); setSides([]); setStreetCorners(null); setRadiusTouched(false)
    setSceneLocal(id)
  }
  // New neighborhood — the empty workspace: no scene bound, the gray grid + search.
  // setScene(null) is a no-op (invalid id), so clear the store frame directly —
  // otherwise the previous hood's geography/boundary lingers and the grid never shows.
  const newNeighborhood = () => {
    setSceneLocal(null)
    useCartographStore.setState({ sceneGeography: null, sceneBoundary: null, sceneRibbons: null })
    setLocated(false); setExclusionsLL([]); setPenActive(false); setSelAnchor(null); setAnchors(null)
    setCommitted(false); setSides([]); setStreetCorners(null); setRadiusTouched(false)
    setName(''); setBlurb(''); setRadiusM(0); setQuery(''); setFetchSources(null); setCurating(false)
  }

  // A frame (geography) spanning a bbox — used to re-frame the aerial on a search.
  // The aerial follows the camera over the global photo, so this is only the
  // initial camera framing; the local metric frame is finalized on Commit.
  const geoFromBbox = (bbox) => {
    const lat = (bbox.minLat + bbox.maxLat) / 2, lon = (bbox.minLon + bbox.maxLon) / 2
    return {
      lat, lon, timezone: 'America/Chicago',
      lonToMeters: Math.round(111320 * Math.cos((lat * Math.PI) / 180)), latToMeters: 111000,
      bbox: { ...bbox },
    }
  }

  // SEARCH → geocode the place → establish THIS place's OWN scene (slug), frame
  // the aerial on its bbox, and adopt its OFFICIAL boundary as the best-guess
  // first pass (§0.0) when it has one. The scene switch is the crux of the empty
  // workspace: authoring "Altadena" targets scene `altadena` — labels/buildings/
  // fetch all follow it, and no other installation (Lafayette Square) is read or
  // overwritten. The carve-out stays the explicit "Fetch this view".
  const onSearch = async () => {
    const q = query.trim()
    if (!q || searching) return
    setSearching(true); setSeedError(null); setAnchors(null)
    try {
      const r = await geocodePlace(q)
      if (!r?.bbox) throw new Error('nothing matched')
      // The authoring target — a slug of the place, NEVER the active render scene.
      const slug = sluggifyPlace(r.anchors, q)
      setSceneLocal(slug)
      setStoreScene(slug)   // clears store geo/boundary; set the fresh frame next
      useCartographStore.setState({ sceneGeography: geoFromBbox(r.bbox), sceneBoundary: null })
      setAnchors(r.anchors || null)
      // Fresh authoring pass — clear prior work; the [scene] effect restores a
      // committed hood's own extent from disk if this slug already exists.
      setSides([]); setStreetCorners(null); setFetchSources(null)
      setRadiusM(0); setRadiusTouched(false); setName(''); setBlurb('')
      setCommitted(false); setCommittedRadius(0)
      setExclusionsLL([]); setPenActive(false); setSelAnchor(null)
      setLocated(true)
    } catch (e) {
      setSeedError(e.message || 'search failed')
    } finally {
      setSearching(false)
    }
  }

  // Fetch this view — the Phalanges over the neighborhood: fetch + skeleton →
  // reload. When the search knows an OFFICIAL boundary (§0.0 best-guess first
  // pass), the fetch is BOUNDED to that boundary's lon/lat extent (+ margin), so
  // "search Altadena → Fetch" pulls exactly the hood, scoped and reliable —
  // never the unbounded camera frame that asked Overpass for a whole region.
  // With no official boundary, it falls back to the framed camera viewport
  // (guarantee: a street visible in-frame is in the bbox → nameable).
  const onFetchView = async () => {
    const cam = orthoRef.current
    if (!cam || !geo || seeding) return
    setSeeding(true); setSeedError(null)
    try {
      // The framed viewport IS the fetch envelope — a deliberately-generous,
      // throwaway bbox (a street visible in-frame is nameable/snappable). We never
      // geocode-for-geometry to bound it; the operator frames by eye, then draws.
      const halfW = (cam.right - cam.left) / (2 * cam.zoom)
      const halfH = (cam.top - cam.bottom) / (2 * cam.zoom)
      const cx = cam.position.x, cz = cam.position.z
      const [lonA, latA] = localToWgs84(geo, cx - halfW, cz - halfH)
      const [lonB, latB] = localToWgs84(geo, cx + halfW, cz + halfH)
      const bbox = {
        minLat: Math.min(latA, latB), maxLat: Math.max(latA, latB),
        minLon: Math.min(lonA, lonB), maxLon: Math.max(lonA, lonB),
      }
      const r = await fetchExtent(scene, bbox)
      setFetchSources(r?.sources || null)
      const g = await fetchGeography(scene).catch(() => null)
      if (g) useCartographStore.setState({ sceneGeography: g })
      setSides([]); setStreetCorners(null); setRadiusTouched(false)
      setSeedToken(t => t + 1)
    } catch (e) {
      setSeedError(e.message || 'fetch failed')
    } finally {
      setSeeding(false)
    }
  }

  // One action — "Pour" with Commit folded in. Commit + Pour were two buttons
  // that ALWAYS ran in sequence (Pour needs a fresh Commit), and the seam caused
  // the "2D re-centered but 3D still stale" confusion (Commit re-frames the data;
  // only Pour+bake rebuilds the slab the 3D renders). Merged into one flow that
  // finalizes the extent, then builds the slab, narrating each phase via buildStage.
  const onBuild = async () => {
    if (!(keptFit.count > 0) || !(radiusM > 0) || building || !geo) return
    setBuilding(true); setSeedError(null)
    // §6 atomicity: commit re-centers geography + reprojects raw (destructive). If
    // a later stage throws, roll back to the pre-commit frame so we never strand a
    // re-centered-but-slab-less scene. `committedThisRun` gates the rollback.
    let committedThisRun = false
    try {
      // Flush the roster overrides BEFORE the pour — the debounced autosave may
      // not have landed, and the pipeline reads building-overrides.json to decide
      // membership (feedback_debounced_save_must_flush_before_dependent_post).
      await saveBuildingOverrides(scene, { activate: [...activate], hide: [...hide] }).catch(() => {})
      // ── Finalize the extent (was "Commit") — re-center to the polygon
      //    centroid, reproject + skeleton, write the boundary circle + metadata.
      setBuildStage('Committing extent…')
      // Re-center to the KEPT-buildings centroid so the hood lands at the origin.
      const [lon, lat] = localToWgs84(geo, keptCenter.x, keptCenter.z)
      // The EXCLUSION loops (frame-independent lon/lat) ride along — the server
      // projects + flattens them into boundary.exclusions, and the pour/bake carve
      // buildings inside any loop. Membership = inside-circle − exclusions + overrides.
      await commitExtent(scene, {
        center: { lat, lon }, radius: Math.round(radiusM),
        name: name.trim(), blurb: blurb.trim(),
        exclusions: exclusionsLL,
      })
      committedThisRun = true
      const [g, b] = await Promise.all([fetchGeography(scene).catch(() => null), fetchBoundary(scene).catch(() => null)])
      const update = {}
      if (g) update.sceneGeography = g
      if (b) update.sceneBoundary = b
      if (Object.keys(update).length) useCartographStore.setState(update)
      setRadiusTouched(true); setCommitted(true); fitBoundaryRef.current = null; setSeedToken(t => t + 1)
      // Frame the Designer on the neighborhood (now at origin) — read on mount.
      try {
        const vh = (typeof window !== 'undefined' && window.innerHeight) || 900
        const fitZoom = vh / (2 * Math.round(radiusM) * 1.3)
        localStorage.setItem('cartograph-camera', JSON.stringify({ x: 0, z: 0, zoom: fitZoom }))
      } catch { /* ignore */ }
      // ── Build the slab (was "Pour") — pipeline (clipped to the boundary) →
      //    ribbons → ensure a Look for this scene → bake → open the Designer.
      setBuildStage('Pouring map…')
      await pourScene(scene)
      const idx = await fetchLooks().catch(() => null)
      let lookId = idx?.looks?.find(l => l.scene === scene)?.id
      if (!lookId) { const r = await createLook({ name: scene, scene }); lookId = r.id }
      const store = useCartographStore.getState()
      if (store.setActiveLook && store.activeLookId !== lookId) store.setActiveLook(lookId)
      setBuildStage('Baking slab…')
      await bakeLook(lookId, { force: true })
      const rb = await fetchRibbons(scene).catch(() => null)
      if (rb) useCartographStore.setState({ sceneRibbons: rb })
      setCommittedRadius(Math.round(radiusM))   // §4: the baked circle, for re-scope detection
      setShot('designer')
    } catch (e) {
      if (committedThisRun) {
        // Roll the destructive commit back so the scene isn't left re-centered but
        // slab-less. Then reload the restored frame + clear the committed marker.
        setBuildStage('Rolling back…')
        await rollbackExtent(scene).catch(() => {})
        const [g, b] = await Promise.all([fetchGeography(scene).catch(() => null), fetchBoundary(scene).catch(() => null)])
        useCartographStore.setState({ sceneGeography: g || null, sceneBoundary: b || null })
        setCommitted(false); setSeedToken(t => t + 1)
        setSeedError(`Pour failed — rolled back to before commit. ${e.message || ''}`.trim())
      } else {
        setSeedError(e.message || 'build failed')
      }
    } finally {
      setBuilding(false); setBuildStage(null)
    }
  }

  // §4 live radius re-scope — rewrite the boundary circle at the new radius +
  // re-clip + re-bake, WITHOUT re-naming streets or re-centering. The lightweight
  // path the §11 "living boundary" needs: grow/shrink a committed hood in place.
  const onRescope = async () => {
    if (!committed || rescoping || !(radiusM > 0) || Math.round(radiusM) === committedRadius) return
    setRescoping(true); setSeedError(null); setBuildStage('Re-scoping…')
    try {
      await rescopeScene(scene, Math.round(radiusM))
      const b = await fetchBoundary(scene).catch(() => null)
      if (b) useCartographStore.setState({ sceneBoundary: b })
      setBuildStage('Re-baking…')
      const idx = await fetchLooks().catch(() => null)
      const lookId = idx?.looks?.find(l => l.scene === scene)?.id
      if (lookId) await bakeLook(lookId, { force: true })
      const rb = await fetchRibbons(scene).catch(() => null)
      if (rb) useCartographStore.setState({ sceneRibbons: rb })
      setCommittedRadius(Math.round(radiusM))
    } catch (e) {
      setSeedError(e.message || 're-scope failed')
    } finally {
      setRescoping(false); setBuildStage(null)
    }
  }

  // Debounced boundary resolve — the healed process. As the operator clicks
  // streets, re-assemble the perimeter ORDER-INDEPENDENTLY (returns the polygon +
  // per-street connectivity + gaps). <3 streets can't close a ring.
  useEffect(() => {
    const clean = sides.map(s => s.trim()).filter(Boolean)
    if (!scene || clean.length < 3) { setStreetCorners(null); return }
    const t = setTimeout(() => {
      fetchBoundaryFromStreets(scene, clean).then(setStreetCorners).catch(() => setStreetCorners(null))
    }, 300)
    return () => clearTimeout(t)
  }, [sides, scene, seedToken])

  // Default the radius to circumscribe + margin — ONLY for a fresh polygon that
  // has no radius yet. Never clobber an existing radius (persisted-then-hydrated,
  // or operator-set): a scene-reopen can transiently reset radiusTouched, which
  // used to let this overwrite the restored value on reload. "fit to streets"
  // re-seeds the default explicitly (below), so it no longer needs this effect.
  useEffect(() => {
    if (keptFit.radius && !radiusTouched && !(radiusM > 0)) setRadiusM(keptFit.radius + 120)
  }, [keptFit, radiusTouched, radiusM])

  // Has this hood been hydrated yet? Streets exist → we're past setup (search/fetch),
  // so those setup-time controls collapse and the boundary work takes the panel.
  const hasData = allStreets.length > 0
  // The circle center = the kept-buildings centroid (origin for a committed hood).
  const boundaryCentroid = keptCenter

  return (
    <div className="cartograph carto-flat" style={{ background: '#12140f' }}>
      <div className="carto-canvas-wrap" style={{ cursor: penActive ? (spacePan ? 'grab' : 'crosshair') : curating ? 'pointer' : 'grab' }}>
        <Canvas
          orthographic
          frameloop="always"
          camera={{ position: [0, 500, 0], zoom: 1, near: 0.1, far: 2000 }}
          gl={{ alpha: false, antialias: true, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => { gl.setClearColor(0x12140f, 1) }}
          dpr={[1, 1.5]}
          style={{ position: 'absolute', inset: 0 }}
        >
          <ExtentCamera geo={geo} controlsRef={controlsRef} orthoRef={orthoRef} />
          <ambientLight intensity={1} />
          {!located && <WorkspaceGrid />}
          {located && <ExtentAerial geo={geo} />}
          {located && radiusM > 0 && <ExtentDim centroid={boundaryCentroid} radiusM={radiusM} />}
          {located && <ExtentBuildings footprints={footprints} centroid={boundaryCentroid} radiusM={radiusM}
            curating={curating} excludedIds={excludedIds} onToggle={toggleBuilding} />}
          {located && <ExtentLabels labels={labels} geo={geo} />}
          {/* Only the extent CIRCLE is drawn here (no inclusion polygon in the excluder
              model); the pen draws the exclusion loops themselves. */}
          {located && radiusM > 0 && <ExtentBoundary corners={undefined}
            centroid={boundaryCentroid} radiusM={radiusM} showVertices={false} />}
          <MapControls
            ref={controlsRef}
            makeDefault
            enableRotate={false}
            enablePan={!markerActive && (!penActive || spacePan)}
            enableZoom
            screenSpacePanning
            minZoom={0.01}
            maxZoom={40}
          />
        </Canvas>

        {/* Marker tool — same freehand-annotation surface as the Designer,
            reusing the scene-keyed marker_strokes.json. Lets the operator mark
            up the aerial (boundaries, notes) while defining the extent. */}
        <MarkerOverlay cameraRef={orthoRef} />
        <MarkerFAB />

        {/* The editable bezier pen — the EXCLUSION-LOOP authoring surface. SVG overlay
            in the MarkerOverlay pattern (viewBox = camera frustum). Draws every loop
            always (a reopened/committed hood shows its exclusions); editing engages
            when `active`. Editing a committed hood → re-Pour applies it. */}
        {located && (
          <BezierPen cameraRef={orthoRef} active={penActive} paths={penPaths}
            onChange={onPenChange} snapTargets={snapJunctions}
            selected={selAnchor} onSelect={setSelAnchor} suspended={spacePan} />
        )}

        {/* The extent circle as an in-scene drag handle — pull it out for padding.
            Disabled while the pen / building-curation / marker owns the click so the
            overlays never fight for a pointerdown. */}
        {located && radiusM > 0 && (
          <CircleHandle cameraRef={orthoRef} center={boundaryCentroid} radiusM={radiusM}
            onChange={(r) => { setRadiusTouched(true); setRadiusM(r) }}
            disabled={penActive || curating || building || markerActive} />
        )}

        {/* Compass — the aerial is north-up, non-rotating (compass frame), so
            the shared rose sits static (reused from the runtime CompassRose). */}
        <div className="carto-extent-compass">
          <CompassRoseSVG size={60} rotationDeg={0} />
        </div>

        {/* Top-left destination nav — peer to Designer / Stage. */}
        <div className="carto-toolbar carto-glass">
          <div className="carto-toolgroup">
            <button onClick={() => setShot('designer')}>← Designer</button>
          </div>
          <div className="carto-toolgroup">
            <span style={{ padding: '0 6px', fontWeight: 600 }}>◎ Extent</span>
          </div>
        </div>

        {/* Side panel — search → fetch bundle → name streets / official boundary
            → radius → name/blurb → pour. */}
        <div className="carto-panel">
          <h1>Neighborhood Extent</h1>
          <div className="carto-section">
            {/* Neighborhood selector — the persistent switcher (Neighborhoods live in
                Extent; the Look pulldown is per-neighborhood presets). */}
            <div style={{ marginBottom: 16 }}>
              <NeighborhoodSelector scenes={scenesList} current={scene} currentName={name}
                onOpen={openScene} onNew={newNeighborhood} />
            </div>
            {!scene && (
              <div className="carto-extent-status" style={{ fontSize: 12, opacity: 0.8, margin: '8px 0' }}>
                Pick a neighborhood above, or search a place to begin a new one — it opens in its own scene; no other neighborhood is touched.
              </div>
            )}
            {/* ── SETUP ── search + fetch: setup-time ONLY. Fetch is the one
                destructive step (re-pulls raw + regenerates the skeleton), so it's
                offered only BEFORE the hood has data — never after. A wrong boundary
                is fixed by re-selecting (non-destructive), never a re-fetch; a wrong
                FRAME is redone via ＋New / Search. */}
            {!hasData && (
              <div className="carto-subsection">
                <div className="carto-subsection-header">Setup</div>
                {/* Place search — a named place seeds its own scene + official boundary best-guess. */}
                <div className="carto-row">
                  <input className="carto-input" value={query} placeholder="search a place to begin…"
                    spellCheck={false}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') onSearch() }} />
                  <button className="carto-btn-sm" disabled={!query.trim() || searching} onClick={onSearch}
                    title="Find the place and open it in its own scene (a data bootstrap only — you draw the boundary with the pen).">
                    {searching ? '…' : 'Search'}
                  </button>
                </div>
                {anchors && anchors.some(a => a.displayName || a.ok === false) && (
                  <div className="carto-extent-status" style={{ fontSize: 11, opacity: 0.85 }}>
                    {anchors.map((a, i) => (
                      <div key={i}>{a.ok ? '✓' : '✗'} {a.displayName || `${a.q} — no match`}</div>
                    ))}
                  </div>
                )}
                <div className="carto-row" style={{ marginTop: 6 }}>
                  <button className="carto-btn carto-btn--grow" disabled={!located || !geo || seeding} onClick={onFetchView}
                    title="Fetch the full data bundle (OSM + buildings + parcels) over the framed view — anything visible here becomes nameable">
                    {seeding ? 'Fetching bundle…' : 'Fetch this view'}
                  </button>
                </div>
                {fetchSources && (
                  <div className="carto-extent-status ok" style={{ fontSize: 11, lineHeight: 1.5 }}>
                    {[['OSM', fetchSources.osm], ['buildings', fetchSources.buildings], ['parcels', fetchSources.parcels]].map(([label, s]) => (
                      <div key={label}>
                        {s?.ok ? '✓' : '✗'} {label}
                        {s?.ok && Number.isFinite(s.count) ? ` · ${s.count.toLocaleString()}` : ''}
                        {s?.note ? ` — ${s.note}` : ''}
                        {!s?.ok && s?.error ? ` — ${s.error}` : ''}
                      </div>
                    ))}
                  </div>
                )}
                {seedError && <div className="carto-extent-status warn">{seedError}</div>}
              </div>
            )}

            {/* ── BOUNDARY ── the excluder model: every building is IN; draw closed
                EXCLUSION loops to hide the strays; the circle auto-fits what's left. */}
            {located && (
            <div className="carto-subsection">
              <div className="carto-subsection-header">Boundary</div>

              {/* The pen draws EXCLUSION loops — the strays inside each closed loop drop
                  out. Draw as many as you need (junk comes in clumps). */}
              <div className="carto-row carto-row--wrap" style={{ marginBottom: penActive ? 4 : 8 }}>
                <button className="carto-btn carto-btn--grow"
                  onClick={(e) => { setPenActive(v => !v); setCurating(false); e.currentTarget.blur() }}
                  style={penActive ? { background: '#ffd23f', color: '#12140f', fontWeight: 600 } : undefined}
                  title="Draw closed loops around the buildings that AREN'T the neighborhood — everything inside a loop drops out. Everything else stays.">
                  {penActive ? '✓ Drawing exclusions — loop the strays to hide them' : (exclusionsLL.length ? '✎ Edit exclusion loops' : '✎ Draw exclusions')}
                </button>
                {exclusionsLL.length > 0 && (
                  <button className="carto-btn-sm" onClick={() => { setExclusionsLL([]); setSelAnchor(null) }}
                    title="Clear all exclusion loops">clear</button>
                )}
              </div>
              {penActive && (
                <div className="carto-extent-status" style={{ fontSize: 11, opacity: 0.85, marginBottom: 8, lineHeight: 1.5 }}>
                  Click to drop points · click-drag for a curve · click the first point to close a loop.<br />
                  A closed loop hides the buildings inside it. Start clicking again for the next loop.<br />
                  ⌘-drag a point to move · click a point to delete · ⌥-drag to smooth · ⌥-click to sharpen.
                </div>
              )}
              {exclusionsLL.length > 0 && (
                <div className="carto-extent-status ok" style={{ marginBottom: 8 }}>
                  {exclusionsLL.length} exclusion loop{exclusionsLL.length > 1 ? 's' : ''} · {keptFit.count.toLocaleString()} buildings kept
                </div>
              )}

              {/* Radius — the slab disc, auto-fit to the kept buildings; pull it out
                  for padding (or in to coarsely trim outer rings). */}
              {(keptFit.radius > 0 || (committed && committedRadius > 0)) && (() => {
                const base = keptFit.radius || committedRadius
                const rMin = Math.max(150, Math.round(base * 0.3))
                const rMax = Math.max(base * 2.5, 1500)
                return (
                <div className="carto-row carto-row--wrap" style={{ marginTop: 10 }}>
                  <span className="carto-label" style={{ cursor: 'default' }}>Radius</span>
                  <span className="carto-meta--value">{radiusM} m</span>
                  <input className="carto-range" type="range" style={{ flexBasis: '100%' }}
                    min={rMin} max={rMax} step={10}
                    value={radiusM}
                    onChange={e => { setRadiusTouched(true); setRadiusM(+e.target.value) }} />
                  {keptFit.radius > 0 &&
                    <button className="carto-btn-sm" onClick={() => { setRadiusM(keptFit.radius + 120); setRadiusTouched(false) }}>fit to buildings</button>}
                  {committed && Math.round(radiusM) !== committedRadius && (
                    <button className="carto-btn carto-btn--grow" disabled={rescoping || building} style={{ flexBasis: '100%', marginTop: 6 }}
                      onClick={onRescope}
                      title="Rewrite the circle at this radius + re-bake in place — no re-center (§11 living boundary)">
                      {rescoping ? (buildStage || 'Re-scoping…') : `Re-scope radius → ${Math.round(radiusM)} m`}
                    </button>
                  )}
                </div>
                )
              })()}

              {footprints?.buildings?.length > 0 && (
                <div className="carto-row carto-row--wrap" style={{ marginTop: 12 }}>
                  <button className="carto-btn-sm" onClick={() => { setCurating(c => !c); setPenActive(false) }}
                    style={curating ? { background: '#ff5a5a', color: '#12140f', fontWeight: 600 } : undefined}
                    title="Fine fixups — click a kept building to drop it, or a dropped (ghost) building to force it back in.">
                    {curating ? '✓ Done editing' : '✎ Edit buildings'}
                  </button>
                  {curating
                    ? <span className="carto-meta--value" style={{ flexBasis: '100%', marginTop: 4 }}>
                        +{activate.size} forced-in · −{hide.size} forced-out · click a ghost to add, a building to drop
                      </span>
                    : (activate.size + hide.size) > 0 && <span className="carto-meta--value">+{activate.size} / −{hide.size}</span>}
                </div>
              )}
            </div>
            )}

            {/* ── DETAILS ── public display name + a short blurb (doubles as the SEO
                description). Persisted to neighborhood.json; independent of geometry.
                Editable on a baked (committed) hood too — details are non-destructive. */}
            {(keptFit.count > 0 || committed) && (
              <div className="carto-subsection">
                <div className="carto-subsection-header">Details</div>
                <div className="carto-row">
                  <input className="carto-input" value={name} placeholder="neighborhood name" spellCheck={false}
                    onChange={e => setName(e.target.value)} />
                </div>
                <div className="carto-row" style={{ marginTop: 6 }}>
                  <textarea className="carto-input" value={blurb} placeholder="short SEO blurb"
                    rows={2} spellCheck={false} style={{ resize: 'vertical', minHeight: 44 }}
                    onChange={e => setBlurb(e.target.value)} />
                </div>
              </div>
            )}

            {keptFit.count > 0 && radiusM > 0 && (
              <div className="carto-row" style={{ marginTop: 12 }}>
                <button className="carto-btn carto-btn--grow carto-stage-btn" disabled={building || !(radiusM > 0)}
                  onClick={onBuild}
                  title="Build the neighborhood — finalize the extent (re-center + circle + exclusions), then pipeline → ribbons → bake, and open the Designer">
                  {building ? (buildStage || 'Working…') : 'Pour → Designer'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
