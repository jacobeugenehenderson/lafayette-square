/**
 * ExtentApp — the Neighborhood Perimeter Builder (a top-level destination screen).
 *
 * Cartograph's step 0, PRE-skeleton / PRE-pour: the operator defines a
 * neighborhood's extent on a labeled aerial, then pours it — the whole
 * intake→3D arc in one screen, no hand-CLI. The flow:
 *
 *   SEARCH a place ('+'-joined anchors → union bbox; a named place also yields
 *   its OFFICIAL boundary as a best-guess) → frame the aerial → FETCH THIS VIEW
 *   (the full bundle: OSM+skeleton + MSBF buildings + assessor parcels, with
 *   per-source status) → name the boundary Sides (corners resolve from skeleton
 *   junctions) OR adopt the official boundary → radius → name/blurb →
 *   POUR → DESIGNER (commit: re-center + reproject + boundary + derived tz;
 *   then pipeline → ribbons → bake).
 *
 * This is a DESTINATION, not a Designer tool-mode (its own nav button, like
 * Designer / Stage) — so it renders as an early return from CartographApp with
 * its own minimal top-down Canvas, never threaded through the shot-branched
 * main scene.
 *
 * Persists: geography.json (projection + derived timezone), neighborhood_boundary.json
 * (the circle + membership polygon), neighborhood.json (name/blurb/sides/radius/tz).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { MapControls, Text, Line } from '@react-three/drei'
import useCartographStore from './stores/useCartographStore.js'
import {
  fetchSkeletonLabels, fetchExtentCorners, fetchStreetNames, geocodePlace, fetchExtent, fetchGeography,
  fetchStreetGeom, fetchNeighborhood, saveNeighborhood, commitExtent, fetchBoundary,
  pourScene, fetchRibbons, fetchLooks, createLook, bakeLook, fetchBuildingFootprints,
  fetchBuildingOverrides, saveBuildingOverrides, rescopeScene, rollbackExtent,
  fetchStreets, fetchBoundaryFromStreets, fetchScenes,
} from './api.js'
import MarkerOverlay from './MarkerOverlay.jsx'
import MarkerFAB from './MarkerFAB.jsx'
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
      uInside: { value: new THREE.Color('#ffd9a0') },
      uOutside: { value: new THREE.Color('#5a6b7a') },
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
        float a = hidden > 0.5 ? 0.10 : mix(0.14, 0.42, inside);
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
  // The official boundary (best-guess fill from the geocoder) + whether we're
  // adopting it. Named streets OVERRIDE it when the operator resolves ≥3 (§0.0).
  const [official, setOfficial] = useState(null)     // { ring:[[lon,lat]…], centroidLL, displayName }
  const [useOfficial, setUseOfficial] = useState(false)
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

  // The official boundary projected into the CURRENT frame (for drawing + as the
  // best-guess `corners`). Recomputed if the geography re-frames (e.g. a re-fetch).
  const officialCorners = useMemo(() => {
    if (!official?.ring || !geo) return null
    const pts = official.ring.map(([lon, lat]) => {
      const [x, z] = wgs84ToLocal(geo, lon, lat)
      return { x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 }
    })
    if (pts.length < 3) return null
    // Center the circle on the POLYGON'S OWN area-weighted centroid (shoelace), not
    // the geocoder's `centroidLL` point — the latter can sit off-center from the
    // projected ring, which read as "circle not centered".
    let Ar = 0, gx = 0, gz = 0
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length]
      const cr = p.x * q.z - q.x * p.z
      Ar += cr; gx += (p.x + q.x) * cr; gz += (p.z + q.z) * cr
    }
    Ar *= 0.5
    const centroid = Math.abs(Ar) > 1
      ? { x: Math.round((gx / (6 * Ar)) * 100) / 100, z: Math.round((gz / (6 * Ar)) * 100) / 100 }
      : (() => { const [cx, cz] = wgs84ToLocal(geo, official.centroidLL.lon, official.centroidLL.lat); return { x: Math.round(cx * 100) / 100, z: Math.round(cz * 100) / 100 } })()
    let radius = 0
    for (const p of pts) radius = Math.max(radius, Math.hypot(p.x - centroid.x, p.z - centroid.z))
    return { corners: pts, centroid, radius: Math.round(radius), closed: true, source: 'official' }
  }, [official, geo])

  // A COMMITTED hood's boundary IS the polygon written at commit —
  // neighborhood_boundary.json → sceneBoundary.polygon (the snap-routed, street-
  // following MEMBERSHIP polygon). That's what the prebake view must show + clip
  // buildings to, NOT the live official/street corners (which would re-derive the
  // raw admin ring). Centroid = the polygon's own area-weighted centroid.
  const committedCorners = useMemo(() => {
    const poly = sceneBoundary?.polygon
    if (!committed || !Array.isArray(poly) || poly.length < 3) return null
    let A = 0, gx = 0, gz = 0
    for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; const cr = p.x * q.z - q.x * p.z; A += cr; gx += (p.x + q.x) * cr; gz += (p.z + q.z) * cr }
    A *= 0.5
    const centroid = Math.abs(A) > 1 ? { x: gx / (6 * A), z: gz / (6 * A) } : { x: 0, z: 0 }
    let radius = 0; for (const p of poly) radius = Math.max(radius, Math.hypot(p.x - centroid.x, p.z - centroid.z))
    return { corners: poly, centroid, radius: Math.round(radius), closed: true, source: 'committed' }
  }, [committed, sceneBoundary])

  // Effective boundary: a COMMITTED hood shows the polygon it was committed with;
  // else named streets (once ≥3 resolve) OVERRIDE the official best-guess; else the
  // official geocoded ring.
  // INVARIANT: the boundary is always an enclosed polygon — never an open state.
  // Selected streets REFINE it (win only when they form a CLOSED ring, clean for a
  // simple arterial loop like LS); otherwise the official geocoded ring is the
  // polygon — unconditionally, not gated on the `useOfficial` toggle. So a hood with
  // an official boundary can always Pour to a closed polygon; streets never gate it.
  const corners = useMemo(() => {
    if (committedCorners) return committedCorners
    if (streetCorners?.closed) return streetCorners
    if (officialCorners) return officialCorners
    return streetCorners
  }, [committedCorners, streetCorners, officialCorners])

  // Roster membership (must follow `corners`): default = centroid in the
  // boundary-street polygon; overrides layer on top.
  const defaultIn = useMemo(() => {
    const set = new Set()
    const poly = corners?.corners
    const bs = footprints?.buildings
    if (!poly || poly.length < 3 || !bs) return set
    for (const b of bs) {
      const c = ringCentroid(b.ring)
      if (pointInPolygon(c.x, c.z, poly)) set.add(b.id)
    }
    return set
  }, [footprints, corners])
  // Effective EXCLUDED set (renders ghost; the bake drops these):
  //   excluded = in `hide`  OR  (not default-in AND not in `activate`)
  const excludedIds = useMemo(() => {
    const set = new Set()
    const bs = footprints?.buildings
    if (!bs) return set
    for (const b of bs) {
      const inc = (defaultIn.has(b.id) || activate.has(b.id)) && !hide.has(b.id)
      if (!inc) set.add(b.id)
    }
    return set
  }, [footprints, defaultIn, activate, hide])
  // Click flips a building's membership, recording it as the minimal override.
  const toggleBuilding = (id) => {
    const isDefault = defaultIn.has(id)
    const excluded = excludedIds.has(id)
    const a = new Set(activate), h = new Set(hide)
    if (excluded) { h.delete(id); if (!isDefault) a.add(id) }        // re-include
    else { a.delete(id); if (isDefault) h.add(id) }                  // exclude
    setActivate(a); setHide(h)
  }

  // On scene establish (a search sets it) or committed re-open: clear transient
  // geometry and, for a COMMITTED hood, restore its saved extent from disk. Does
  // NOT touch official / located — the SEARCH owns those (this fires right after
  // onSearch sets the scene, and clearing them would wipe the best-guess first pass).
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
        // Committed hood → prefer its OWN boundary over any official best-guess.
        if (nb.committed) { setCommitted(true); setCommittedRadius(Math.round(nb.radius) || 0); setUseOfficial(false) }
      }
      // Load the frame + boundary so an EXISTING hood (committed OR fetched-but-
      // in-progress, like Altadena) shows its aerial + circle on entry. For a fresh
      // SEARCH the store geo is already set (disk has none yet) → we keep it and
      // never touch official/located, so the best-guess first pass isn't wiped.
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
      // Official geocoded boundary as the DEFAULT overlay + initial boundary for a
      // NON-committed opened hood (a fresh Search already set `official`; a committed
      // hood keeps its own boundary). Realizes the invariant: the boundary is the
      // official ring unless streets refine it to a closed one. Projected into the
      // live frame by `officialCorners`; rendered by ExtentBoundary/ExtentDim.
      if (!cancelled && nb && !nb.committed) {
        const label = (nb.name || '').trim()
          || scene.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        const gr = await geocodePlace(label).catch(() => null)
        if (!cancelled && gr?.official?.ring) { setOfficial(gr.official); setUseOfficial(true) }
      }
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
    const t = setTimeout(() => { saveNeighborhood(scene, { sides: clean, radius: Math.round(radiusM) || 0, name: name.trim(), blurb: blurb.trim() }).catch(() => {}) }, 500)
    return () => clearTimeout(t)
  }, [sides, radiusM, name, blurb, scene])

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
    setLocated(false); setOfficial(null); setUseOfficial(false); setAnchors(null)
    setCommitted(false); setSides([]); setStreetCorners(null); setRadiusTouched(false)
    setSceneLocal(id)
  }
  // New neighborhood — the empty workspace: no scene bound, the gray grid + search.
  // setScene(null) is a no-op (invalid id), so clear the store frame directly —
  // otherwise the previous hood's geography/boundary lingers and the grid never shows.
  const newNeighborhood = () => {
    setSceneLocal(null)
    useCartographStore.setState({ sceneGeography: null, sceneBoundary: null, sceneRibbons: null })
    setLocated(false); setOfficial(null); setUseOfficial(false); setAnchors(null)
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
      if (r.official) { setOfficial(r.official); setUseOfficial(true) }
      else { setOfficial(null); setUseOfficial(false) }
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
      let bbox
      if (useOfficial && official?.ring?.length >= 3) {
        // Bound to the official boundary (lon/lat), padded ~8% for breathing room.
        let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity
        for (const [lon, lat] of official.ring) {
          if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon
          if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat
        }
        const padLon = (maxLon - minLon) * 0.08, padLat = (maxLat - minLat) * 0.08
        bbox = { minLon: minLon - padLon, maxLon: maxLon + padLon, minLat: minLat - padLat, maxLat: maxLat + padLat }
      } else {
        const halfW = (cam.right - cam.left) / (2 * cam.zoom)
        const halfH = (cam.top - cam.bottom) / (2 * cam.zoom)
        const cx = cam.position.x, cz = cam.position.z
        const [lonA, latA] = localToWgs84(geo, cx - halfW, cz - halfH)
        const [lonB, latB] = localToWgs84(geo, cx + halfW, cz + halfH)
        bbox = {
          minLat: Math.min(latA, latB), maxLat: Math.max(latA, latB),
          minLon: Math.min(lonA, lonB), maxLon: Math.max(lonA, lonB),
        }
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
    if (!corners?.closed || !corners.centroid || !(radiusM > 0) || building || !geo) return
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
      const usingOfficial = corners.source === 'official'
      const [lon, lat] = localToWgs84(geo, corners.centroid.x, corners.centroid.z)
      // Named streets → precise skeleton-snapped polygon; official boundary →
      // the geocoder's lon/lat ring, projected server-side into the re-centered
      // frame (§0.0 best guess). tz is derived from `center` at commit.
      const cleanSides = usingOfficial ? [] : sides.map(s => s.trim()).filter(Boolean)
      await commitExtent(scene, {
        center: { lat, lon }, radius: Math.round(radiusM), sides: cleanSides,
        name: name.trim(), blurb: blurb.trim(),
        polygon: usingOfficial ? official.ring : undefined,
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
    if (corners?.radius && !radiusTouched && !(radiusM > 0)) setRadiusM(corners.radius + 120)
  }, [corners, radiusTouched, radiusM])

  // When the boundary CLOSES, scale the view to the circle so the neighborhood
  // fills the viewport — the frame we hand to skeleton/survey. Fires once per
  // resolved centroid (a radius-slider tweak won't re-zoom).
  const fitBoundaryRef = useRef(null)
  useEffect(() => {
    const c = corners?.centroid
    if (!corners?.closed || !c || !(radiusM > 0)) return
    const key = `${c.x},${c.z}`
    if (fitBoundaryRef.current === key) return
    const cam = orthoRef.current
    if (!cam) return
    fitBoundaryRef.current = key
    cam.position.set(c.x, 500, c.z)
    cam.up.set(0, 0, -1)
    cam.lookAt(c.x, 0, c.z)
    // 2.2× so the whole circle sits well inside the frame with its edges + a ring
    // of context visible (1.25× jammed the circle to the screen border).
    cam.zoom = Math.min(cam.right - cam.left, cam.top - cam.bottom) / (2 * radiusM * 2.2)
    cam.updateProjectionMatrix()
    const ctl = controlsRef.current
    if (ctl) { ctl.target.set(c.x, 0, c.z); ctl.update() }
  }, [corners, radiusM])

  // §5: each named side's derived cardinal, keyed by name (robust to empty slots /
  // reordering — corners.streets is the CLEANED list, not index-aligned to sides).
  const dirByName = useMemo(() => {
    const m = {}
    for (const s of (corners?.streets || [])) if (s.name && s.direction) m[s.name] = s.direction
    return m
  }, [corners])
  // Click a street on the map → toggle it in/out of the boundary selection.
  const toggleStreet = (name) => setSides(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])
  const removeStreet = (i) => setSides(prev => prev.filter((_, k) => k !== i))
  // Gaps = selected streets that don't yet close the ring (from the resolver).
  const gaps = streetCorners?.gaps || []
  // Has this hood been hydrated yet? Streets exist → we're past setup (search/fetch),
  // so those setup-time controls collapse and the boundary work takes the panel.
  const hasData = allStreets.length > 0
  // The circle's center for drawing: the live polygon centroid, or the origin for
  // a reopened committed hood (its geo is re-centered so the circle sits at [0,0]).
  const boundaryCentroid = corners?.centroid || (committed ? { x: 0, z: 0 } : null)

  return (
    <div className="cartograph carto-flat" style={{ background: '#12140f' }}>
      <div className="carto-canvas-wrap" style={{ cursor: curating ? 'pointer' : 'grab' }}>
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
          {located && (corners?.closed || committed) && <ExtentDim centroid={boundaryCentroid} radiusM={radiusM} />}
          {located && <ExtentBuildings footprints={footprints} centroid={boundaryCentroid} radiusM={radiusM}
            curating={curating} excludedIds={excludedIds} onToggle={toggleBuilding} />}
          {located && <ExtentLabels labels={labels} geo={geo} />}
          {located && !curating && <ExtentClickableStreets streets={allStreets} selected={sides} gaps={gaps} onToggle={toggleStreet} />}
          {located && <ExtentBoundary corners={corners?.corners} centroid={boundaryCentroid} radiusM={radiusM}
            showVertices={corners?.source !== 'official'} />}
          <MapControls
            ref={controlsRef}
            makeDefault
            enableRotate={false}
            enablePan={!markerActive}
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
                    title="Find the place, open it in its own scene, and adopt its official boundary as a best-guess first pass.">
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

            {/* ── BOUNDARY ── the core extent work: official best-guess, the named
                boundary streets, closure status, radius, and building curation. */}
            {(hasData || official) && (
            <div className="carto-subsection">
              <div className="carto-subsection-header">Boundary</div>

              {/* Official boundary — the best-guess fill (§0.0). Adopt with a click;
                  naming ≥3 streets below overrides it with the skeleton-snapped one. */}
              {official && (
                <div className="carto-row carto-row--wrap" style={{ marginBottom: 8 }}>
                  <button className="carto-btn-sm" onClick={() => setUseOfficial(v => !v)}
                    style={useOfficial ? { background: '#ffd23f', color: '#12140f', fontWeight: 600 } : undefined}
                    title="Use the place's official boundary as the extent — a best guess you can refine by naming streets or dragging the radius">
                    {useOfficial ? '✓ Official boundary' : '○ Use official boundary'}
                  </button>
                  {streetCorners?.closed && useOfficial &&
                    <span className="carto-meta--value" style={{ flexBasis: '100%', marginTop: 4 }}>
                      named streets override the official boundary
                    </span>}
                </div>
              )}

              <div className="carto-label" style={{ cursor: 'default', flex: 'none', margin: '0 0 8px' }}>
                Boundary streets{official ? ' (refine the official best guess)' : ''}
              </div>
              {sides.length === 0 ? (
                <div className="carto-extent-status" style={{ fontSize: 11, opacity: 0.8 }}>
                  {allStreets.length
                    ? 'Click the streets on the map that form the boundary.'
                    : 'Fetch this view first, then click the boundary streets on the map.'}
                </div>
              ) : (
                <div className="carto-row carto-row--wrap" style={{ gap: 6 }}>
                  {sides.map((n, i) => {
                    const st = streetCorners?.streets?.find(s => s.name === n)
                    const bad = streetCorners && st && st.connected === false
                    return (
                      <span key={`${n}-${i}`} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 4px 2px 8px',
                        borderRadius: 5, fontSize: 11, color: '#e7efe0',
                        background: bad ? '#4a2a24' : '#26402c', border: `1px solid ${bad ? '#a86a48' : '#3f6a48'}`,
                      }} title={bad ? 'this street does not connect to the ring yet' : (st?.direction ? `${st.direction} side` : '')}>
                        {n}{st?.direction ? ` · ${st.direction}` : ''}
                        <button className="carto-btn-sm" style={{ padding: '0 4px', minWidth: 0 }}
                          onClick={() => removeStreet(i)} title="Remove">×</button>
                      </span>
                    )
                  })}
                </div>
              )}

              {streetCorners && (
                <div className={`carto-extent-status ${streetCorners.closed ? 'ok' : 'warn'}`} style={{ marginTop: 8 }}>
                  {streetCorners.closed
                    ? `✓ closed · ${streetCorners.corners.length} corners · centroid (${Math.round(streetCorners.centroid.x)}, ${Math.round(streetCorners.centroid.z)}) · fits ⌀${streetCorners.radius} m`
                    : `⚠ not closed — ${gaps.length} street(s) don't connect: ${gaps.join(', ') || '—'}. Click the streets that meet them.`}
                </div>
              )}
              {!streetCorners && useOfficial && official && (
                <div className="carto-extent-status ok" style={{ marginTop: 8 }}>
                  ✓ official boundary (best guess) · click boundary streets to refine, or pour as-is
                </div>
              )}

              {/* Radius — shown once a boundary exists (live streets/official) OR
                  for a reopened committed hood (so it can be re-scoped in place, §4). */}
              {((corners?.centroid && corners.radius > 0) || (committed && committedRadius > 0)) && (() => {
                const rMin = corners?.radius ?? Math.max(200, Math.round(committedRadius * 0.3))
                const rMax = Math.max((corners?.radius || committedRadius) * 2.5, 1500)
                return (
                <div className="carto-row carto-row--wrap" style={{ marginTop: 10 }}>
                  <span className="carto-label" style={{ cursor: 'default' }}>Radius</span>
                  <span className="carto-meta--value">{radiusM} m</span>
                  <input className="carto-range" type="range" style={{ flexBasis: '100%' }}
                    min={rMin} max={rMax} step={10}
                    value={radiusM}
                    onChange={e => { setRadiusTouched(true); setRadiusM(+e.target.value) }} />
                  {corners?.radius
                    ? <button className="carto-btn-sm" onClick={() => { setRadiusM(corners.radius + 120); setRadiusTouched(false) }}>fit to streets</button>
                    : (committed && Math.round(radiusM) !== committedRadius &&
                        <button className="carto-btn-sm" onClick={() => setRadiusM(committedRadius)}>reset</button>)}
                  {committed && Math.round(radiusM) !== committedRadius && (
                    <button className="carto-btn carto-btn--grow" disabled={rescoping || building} style={{ flexBasis: '100%', marginTop: 6 }}
                      onClick={onRescope}
                      title="Rewrite the boundary at this radius + re-bake in place — no re-naming, no re-center (§11 living boundary)">
                      {rescoping ? (buildStage || 'Re-scoping…') : `Re-scope radius → ${Math.round(radiusM)} m`}
                    </button>
                  )}
                </div>
                )
              })()}

              {footprints?.buildings?.length > 0 && (
                <div className="carto-row carto-row--wrap" style={{ marginTop: 12 }}>
                  <button className="carto-btn-sm" onClick={() => setCurating(c => !c)}
                    style={curating ? { background: '#ff5a5a', color: '#12140f', fontWeight: 600 } : undefined}
                    title="Curate the neighborhood — the street polygon is included by default; click an outside ghost to re-activate it, an inside building to hide it">
                    {curating ? '✓ Done editing' : '✎ Edit buildings'}
                  </button>
                  {curating
                    ? <span className="carto-meta--value" style={{ flexBasis: '100%', marginTop: 4 }}>
                        +{activate.size} re-activated · −{hide.size} hidden · click a ghost to add, a building to drop
                      </span>
                    : (activate.size + hide.size) > 0 && <span className="carto-meta--value">+{activate.size} / −{hide.size}</span>}
                </div>
              )}
            </div>
            )}

            {/* ── DETAILS ── public display name + a short blurb (doubles as the SEO
                description). Persisted to neighborhood.json; independent of geometry.
                Editable on a baked (committed) hood too — details are non-destructive. */}
            {(corners?.closed || committed) && (
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

            {corners?.closed && corners.radius > 0 && (
              <div className="carto-row" style={{ marginTop: 12 }}>
                <button className="carto-btn carto-btn--grow carto-stage-btn" disabled={building || !(radiusM > 0)}
                  onClick={onBuild}
                  title="Build the neighborhood — finalize the extent (re-center + boundary), then pipeline → ribbons → bake, and open the Designer">
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
