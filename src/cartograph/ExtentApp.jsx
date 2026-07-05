/**
 * ExtentApp — the Neighborhood Perimeter Builder (a top-level destination screen).
 *
 * Cartograph's step 0, PRE-skeleton / PRE-pour: the operator defines a
 * neighborhood's extent on a labeled aerial. The flow (settled with Jacob,
 * 2026-07-03):
 *
 *   ZIP → centroid → fetch the generic square → name the boundary Sides →
 *   Phalanges (a smallified skeleton pass on the bounding region — reuse the
 *   real protocol, don't re-derive off raw OSM) → centroid of the resulting
 *   polygon → radius control → persist geography.json + neighborhood_boundary.json
 *   + neighborhood.json.
 *
 * This is a DESTINATION, not a Designer tool-mode (its own nav button, like
 * Designer / Stage) — so it renders as an early return from CartographApp with
 * its own minimal top-down Canvas, never threaded through the shot-branched
 * main scene.
 *
 * Build status: STEP 1 — the screen shell + the full-square aerial of the
 * active scene (no boundary circle: the operator is authoring it). ZIP seed,
 * labels, Sides→Phalanges→centroid, and the radius control land in later steps.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { MapControls, Text, Line } from '@react-three/drei'
import useCartographStore from './stores/useCartographStore.js'
import {
  fetchSkeletonLabels, fetchExtentCorners, fetchStreetNames, geocodeZip, fetchExtent, fetchGeography,
  fetchStreetGeom, fetchNeighborhood, saveNeighborhood, commitExtent, fetchBoundary,
  pourScene, fetchRibbons, fetchLooks, createLook, bakeLook, fetchBuildingFootprints,
} from './api.js'
import MarkerOverlay from './MarkerOverlay.jsx'
import MarkerFAB from './MarkerFAB.jsx'
import { CompassRoseSVG } from '../components/CompassRose.jsx'
import {
  TileMesh, TILE_URL, lonLatToTile, tileToLonLat, wgs84ToLocal, localToWgs84,
} from './AerialTiles.jsx'

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
function ExtentBoundary({ corners, centroid, radiusM }) {
  if (!corners?.length) return null
  const poly = corners.map(c => [c.x, 4, c.z])
  if (corners.length >= 3) poly.push([corners[0].x, 4, corners[0].z])
  return (
    <group>
      {corners.length >= 2 && <Line points={poly} color="#38e1ff" lineWidth={2} dashed={false} />}
      {centroid && radiusM > 0 && (
        <Line points={circlePts(centroid.x, centroid.z, radiusM)} color="#ffd23f" lineWidth={2} />
      )}
      {corners.map((c, i) => (
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

// The named sides drawn on the aerial (confirm which street each pick IS) + the
// dropdown HOVER preview in a brighter colour (see a candidate before selecting).
function ExtentStreets({ streets, preview }) {
  return (
    <group>
      {(streets || []).flatMap((s, i) => (s.polylines || []).map((poly, j) => (
        poly.length >= 2 && (
          <Line key={`sel-${i}-${j}`} points={poly.map(([x, z]) => [x, 3, z])}
            color="#38e1ff" lineWidth={2.5} transparent opacity={0.7} />
        )
      )))}
      {preview && (preview.polylines || []).map((poly, j) => (
        poly.length >= 2 && (
          <Line key={`prev-${j}`} points={poly.map(([x, z]) => [x, 3.6, z])}
            color="#ffe14d" lineWidth={4} />
        )
      ))}
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
function ExtentBuildings({ footprints, centroid, radiusM }) {
  const geom = useMemo(
    () => (footprints?.buildings?.length ? buildFootprintGeometry(footprints.buildings) : null),
    [footprints],
  )
  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false,
    uniforms: {
      uCenter: { value: new THREE.Vector2(0, 0) },
      uRadius: { value: 1e9 },
      uInside: { value: new THREE.Color('#ffd9a0') },
      uOutside: { value: new THREE.Color('#5a6b7a') },
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
      varying vec2 vWorldXZ;
      void main() {
        float inside = step(distance(vWorldXZ, uCenter), uRadius);
        gl_FragColor = vec4(mix(uOutside, uInside, inside), mix(0.14, 0.42, inside));
      }`,
  }), [])
  useEffect(() => {
    mat.uniforms.uCenter.value.set(centroid?.x ?? 0, centroid?.z ?? 0)
    // No circle yet → treat every building as inside (all warm) until the
    // operator resolves a boundary.
    mat.uniforms.uRadius.value = radiusM > 0 ? radiusM : 1e9
  }, [mat, centroid, radiusM])
  useEffect(() => () => geom?.dispose(), [geom])
  if (!geom) return null
  return <mesh geometry={geom} material={mat} renderOrder={6} />
}

// One boundary-street combobox. Reuses the suite's row/input/button/dropdown
// system (carto-row · carto-input · carto-btn-sm · carto-looks-option ·
// carto-section-caret · carto-glass). Two modes: TYPE → flat filtered matches
// (arterials first); EMPTY → Arterials up top, then the rest as collapsible
// A–Z sub-dropdowns so hundreds of streets stay navigable.
function SideInput({ index, value, placeholder, names, onChange, onRemove, onHover }) {
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

export default function ExtentApp() {
  const scene = useCartographStore(s => s.scene)
  const setShot = useCartographStore(s => s.setShot)
  const sceneGeography = useCartographStore(s => s.sceneGeography)
  const sceneBoundary = useCartographStore(s => s.sceneBoundary)
  const geo = useMemo(() => extentGeo(sceneGeography), [sceneGeography])
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
    fetchSkeletonLabels(scene)
      .then(r => { if (!cancelled) setLabels(r.labels || []) })
      .catch(() => { if (!cancelled) setLabels([]) })
    return () => { cancelled = true }
  }, [scene, seedToken])

  // Building footprints for the live overlay (+ the roster editor). Re-fetched
  // per scene and after a fresh Fetch (seedToken) — msbf.json's x/z is reprojected
  // into the live frame, so the overlay registers on the aerial.
  const [footprints, setFootprints] = useState(null)
  useEffect(() => {
    let cancelled = false
    setFootprints(null)
    fetchBuildingFootprints(scene)
      .then(r => { if (!cancelled) setFootprints(r) })
      .catch(() => { if (!cancelled) setFootprints(null) })
    return () => { cancelled = true }
  }, [scene, seedToken])

  // Autocomplete pool — skeleton-sourced + corridor-collapsed, GROUPED
  // (arterials, then the rest), each A→Z. A directional corridor shows as ONE
  // entry ("Big Bend Boulevard"). A custom combobox renders the groups (native
  // <datalist> re-sorts flat). Sourced from the skeleton, not the aerial labels,
  // so the corridor unification (the kit link) is reflected.
  const [names, setNames] = useState({ major: [], minor: [] })
  useEffect(() => {
    let cancelled = false
    setNames({ major: [], minor: [] })
    fetchStreetNames(scene)
      .then(r => { if (!cancelled) setNames(r || { major: [], minor: [] }) })
      .catch(() => { if (!cancelled) setNames({ major: [], minor: [] }) })
    return () => { cancelled = true }
  }, [scene, seedToken])

  // The boundary streets, in order around the perimeter (the operator names them
  // reading the labeled aerial). Corners resolve server-side from the skeleton.
  const [zip, setZip] = useState('')
  const [seeding, setSeeding] = useState(false)
  const [seedError, setSeedError] = useState(null)
  // Intake starts BLANK: nothing has been fetched yet, so show no map until the
  // operator Locates a ZIP (or Fetches). No defaulting to the active scene's map.
  const [located, setLocated] = useState(false)
  const [committed, setCommitted] = useState(false)
  const [building, setBuilding] = useState(false)
  const [buildStage, setBuildStage] = useState(null)
  const [previewStreet, setPreviewStreet] = useState(null)
  const [sides, setSides] = useState(['', '', '', ''])
  const [corners, setCorners] = useState(null)
  const [radiusM, setRadiusM] = useState(0)
  const [radiusTouched, setRadiusTouched] = useState(false)
  const draftHydrated = useRef(false)

  // On scene open: reset, then restore the auto-saved draft (sides/radius) so the
  // operator's selections survive reloads.
  useEffect(() => {
    setZip(''); setSeedError(null); setLocated(false); setCommitted(false)
    setSides(['', '', '', '']); setCorners(null); setRadiusTouched(false); setPreviewStreet(null)
    draftHydrated.current = false
    let cancelled = false
    fetchNeighborhood(scene).then(nb => {
      if (cancelled || !nb) return
      if (Array.isArray(nb.sides) && nb.sides.some(Boolean)) {
        const s = [...nb.sides]; while (s.length < 4) s.push('')
        setSides(s)
      }
      if (typeof nb.zip === 'string' && nb.zip) setZip(nb.zip)
      if (nb.radius > 0) { setRadiusM(nb.radius); setRadiusTouched(true) }
      if (nb.committed) setCommitted(true)
      draftHydrated.current = true
    }).catch(() => { draftHydrated.current = true })
    return () => { cancelled = true }
  }, [scene])

  // An already-committed neighborhood (has a boundary) shows its map on open;
  // a fresh/uncommitted scene stays blank until the operator Locates.
  useEffect(() => { if (sceneBoundary) setLocated(true) }, [sceneBoundary])

  // Draft auto-save (implicit) — sides + radius, debounced. Skips the initial
  // hydration so it doesn't immediately re-write what it just loaded.
  useEffect(() => {
    if (!draftHydrated.current) return
    const clean = sides.map(s => s.trim()).filter(Boolean)
    const t = setTimeout(() => { saveNeighborhood(scene, { sides: clean, radius: Math.round(radiusM) || 0, zip: zip.trim() }).catch(() => {}) }, 500)
    return () => clearTimeout(t)
  }, [sides, radiusM, zip, scene])

  // Dropdown hover-preview — highlight a candidate street before selecting it.
  const previewTimer = useRef(null)
  const onHoverStreet = (name) => {
    clearTimeout(previewTimer.current)
    if (!name) { setPreviewStreet(null); return }
    previewTimer.current = setTimeout(() => {
      fetchStreetGeom(scene, name).then(r => setPreviewStreet({ name, polylines: r.polylines || [] })).catch(() => {})
    }, 50)
  }

  const [locating, setLocating] = useState(false)
  const zipValid = /^\d{5}$/.test(zip)

  // A ±2 km provisional frame for a fresh location — just an initial camera
  // framing; the aerial follows the camera, so the operator pans/zooms freely.
  const provisionalGeo = (lat, lon, halfM = 2000) => {
    const lonToMeters = Math.round(111320 * Math.cos((lat * Math.PI) / 180))
    const latToMeters = 111000
    const dLat = halfM / latToMeters, dLon = halfM / lonToMeters
    return {
      lat, lon, timezone: 'America/Chicago', lonToMeters, latToMeters,
      bbox: { minLat: lat - dLat, maxLat: lat + dLat, minLon: lon - dLon, maxLon: lon + dLon },
    }
  }

  // ZIP → jump the camera to the centroid (NO fetch). Sets a provisional frame so
  // the aerial renders there; the operator then frames the neighborhood by eye.
  const onLocate = async () => {
    if (!zipValid || locating) return
    setLocating(true); setSeedError(null)
    try {
      const { lat, lon } = await geocodeZip(zip)
      const g = useCartographStore.getState().sceneGeography
      const cam = orthoRef.current
      if (g && cam) {
        // PAN the camera to the ZIP within the CURRENT frame — no geography
        // change, so the aerial + any existing labels stay in one frame (old
        // labels just move off-screen if you jump far). The aerial follows the
        // camera over the global photo; the frame only changes on Fetch.
        const x = (lon - g.lon) * g.lonToMeters
        const z = (g.lat - lat) * g.latToMeters
        cam.position.set(x, 500, z)
        cam.updateProjectionMatrix()
        const ctl = controlsRef.current
        if (ctl) { ctl.target.set(x, 0, z); ctl.update() }
      } else {
        // Brand-new scene with no frame yet — establish a provisional one on the ZIP.
        useCartographStore.setState({ sceneGeography: provisionalGeo(lat, lon) })
      }
      setLocated(true)
    } catch (e) {
      setSeedError(e.message || 'ZIP lookup failed')
    } finally {
      setLocating(false)
    }
  }

  // Fetch this view — the Phalanges over the FRAMED square: read the ortho
  // camera's world viewport → lon/lat bbox → fetch + skeleton → reload. Guarantee:
  // a street visible in-frame is in the bbox → in the data → nameable.
  const onFetchView = async () => {
    const cam = orthoRef.current
    if (!cam || !geo || seeding) return
    setSeeding(true); setSeedError(null)
    try {
      const halfW = (cam.right - cam.left) / (2 * cam.zoom)
      const halfH = (cam.top - cam.bottom) / (2 * cam.zoom)
      const cx = cam.position.x, cz = cam.position.z
      const [lonA, latA] = localToWgs84(geo, cx - halfW, cz - halfH)
      const [lonB, latB] = localToWgs84(geo, cx + halfW, cz + halfH)
      const bbox = {
        minLat: Math.min(latA, latB), maxLat: Math.max(latA, latB),
        minLon: Math.min(lonA, lonB), maxLon: Math.max(lonA, lonB),
      }
      await fetchExtent(scene, bbox)
      const g = await fetchGeography(scene).catch(() => null)
      if (g) useCartographStore.setState({ sceneGeography: g })
      setSides(['', '', '', '']); setCorners(null); setRadiusTouched(false)
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
    try {
      // ── Finalize the extent (was "Commit") — re-center to the polygon
      //    centroid, reproject + skeleton, write the boundary circle + metadata.
      setBuildStage('Committing extent…')
      const [lon, lat] = localToWgs84(geo, corners.centroid.x, corners.centroid.z)
      const cleanSides = sides.map(s => s.trim()).filter(Boolean)
      await commitExtent(scene, { center: { lat, lon }, radius: Math.round(radiusM), sides: cleanSides })
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
      setShot('designer')
    } catch (e) {
      setSeedError(e.message || 'build failed')
    } finally {
      setBuilding(false); setBuildStage(null)
    }
  }

  // Debounced corner resolve whenever the named sides change.
  useEffect(() => {
    const clean = sides.map(s => s.trim()).filter(Boolean)
    if (clean.length < 3) { setCorners(null); return }
    const t = setTimeout(() => {
      fetchExtentCorners(scene, clean).then(setCorners).catch(() => setCorners(null))
    }, 350)
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

  const setSide = (i, v) => setSides(prev => prev.map((s, k) => (k === i ? v : s)))
  const removeSide = (i) => setSides(prev => prev.filter((_, k) => k !== i))
  const addSide = () => setSides(prev => [...prev, ''])
  const gapCount = corners?.edges ? corners.edges.filter(e => !e.corner).length : 0

  return (
    <div className="cartograph carto-flat" style={{ background: '#12140f' }}>
      <div className="carto-canvas-wrap" style={{ cursor: 'grab' }}>
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
          {located && <ExtentAerial geo={geo} />}
          {located && corners?.closed && <ExtentDim centroid={corners.centroid} radiusM={radiusM} />}
          {located && <ExtentBuildings footprints={footprints} centroid={corners?.centroid} radiusM={radiusM} />}
          {located && <ExtentLabels labels={labels} geo={geo} />}
          {located && <ExtentStreets streets={corners?.streets} preview={previewStreet} />}
          {located && <ExtentBoundary corners={corners?.corners} centroid={corners?.centroid} radiusM={radiusM} />}
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

        {/* Side panel — the ZIP / Sides / Radius controls land here in later
            steps. Step 1 shows the active scene + the flow so the surface reads. */}
        <div className="carto-panel">
          <h1>Neighborhood Extent</h1>
          <div className="carto-section">
            <h2>{scene}</h2>
            <div className="carto-row">
              <input className="carto-input" value={zip} placeholder="5-digit zip"
                inputMode="numeric" maxLength={5} spellCheck={false}
                onChange={e => setZip(e.target.value.replace(/[^0-9]/g, ''))}
                onKeyDown={e => { if (e.key === 'Enter') onLocate() }} />
              <button className="carto-btn-sm" disabled={!zipValid || locating} onClick={onLocate}
                title="Jump the camera to this ZIP (no fetch — then frame the neighborhood)">
                {locating ? '…' : 'Locate'}
              </button>
            </div>
            <div className="carto-row">
              <button className="carto-btn carto-btn--grow" disabled={!located || !geo || seeding} onClick={onFetchView}
                title="Fetch street data over the framed view — anything visible here becomes nameable">
                {seeding ? 'Fetching…' : 'Fetch this view'}
              </button>
            </div>
            {seedError && <div className="carto-extent-status warn">{seedError}</div>}
            <div className="carto-label" style={{ cursor: 'default', flex: 'none', margin: '10px 0 8px' }}>
              Boundary streets
            </div>
            {sides.map((s, i) => (
              <SideInput key={i} index={i} value={s} names={names}
                placeholder={['west side', 'north side', 'east side', 'south side'][i] || 'street'}
                onChange={setSide} onRemove={removeSide} onHover={onHoverStreet} />
            ))}
            <div className="carto-row">
              <button className="carto-look-add" onClick={addSide}>+ add street</button>
            </div>

            {corners && (
              <div className={`carto-extent-status ${corners.closed ? 'ok' : 'warn'}`}>
                {corners.closed
                  ? `✓ closed · centroid (${Math.round(corners.centroid.x)}, ${Math.round(corners.centroid.z)}) · fits ⌀${corners.radius} m`
                  : `⚠ not closed — ${gapCount} pair(s) share no corner. Pick the street that actually meets there.`}
              </div>
            )}

            {corners?.centroid && corners.radius > 0 && (
              <div className="carto-row carto-row--wrap" style={{ marginTop: 10 }}>
                <span className="carto-label" style={{ cursor: 'default' }}>Radius</span>
                <span className="carto-meta--value">{radiusM} m</span>
                <input className="carto-range" type="range" style={{ flexBasis: '100%' }}
                  min={corners.radius} max={Math.max(corners.radius * 2.5, 1500)} step={10}
                  value={radiusM}
                  onChange={e => { setRadiusTouched(true); setRadiusM(+e.target.value) }} />
                <button className="carto-btn-sm" onClick={() => { if (corners?.radius) setRadiusM(corners.radius + 120); setRadiusTouched(false) }}>fit to streets</button>
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
