import { useEffect, useMemo, useRef, useState } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { lookFade } from '../../cartograph/boundaryRecords.mjs'
import { NEIGHBORHOOD_FADE_GLSL, bindNeighborhoodFade } from '../lib/neighborhoodFade.js'
import useCartographStore from './stores/useCartographStore.js'

// ── Active-installation geography + silhouette ──────────────────────────────
// The aerial tiles come from USDA NAIP served by USGS The National Map (federal, public domain;
// `references/registry.json#naip`). NAIP covers the conterminous US only, and outside it the
// service answers with BLACK tiles, so `AerialCredit` asks the service's own catalog whether the
// town is covered and says so by name when it is not. There is no second provider. The
// only per-installation inputs are WHERE the neighborhood is (center lat/lon +
// projection + bbox) and its fade circle (center + inner/outer). Both are read
// from the ACTIVE installation's data in the store (fetched by id) — this
// module names no installation. `makeGeo` turns that raw data into the tile
// bundle; null until the store has loaded it.
function makeGeo(g, nb, edgeFadeBand) {
  if (!g || !nb) return null
  // ⭐ The ACTIVE LOOK's band on this scene's disc (Stage › Horizon › Edge) — the one rule, `lookFade`; the ruffle is
  // the shared uniform the edge driver sets (src/lib/neighborhoodFade.js).
  const { inner: fadeInner, outer: fadeOuter } = lookFade({ edgeFadeBand }, nb.radius || 0, 'AerialTiles', 'active')
  const cx = nb.center?.[0] ?? 0, cz = nb.center?.[1] ?? 0
  return {
    center: { lat: g.lat, lon: g.lon },
    lonToMeters: g.lonToMeters,
    latToMeters: g.latToMeters,
    bbox: { ...g.bbox },
    fadeCenter: new THREE.Vector2(cx, cz),
    fadeCenterXZ: [cx, cz],
    fadeInner,
    fadeOuter,
    cosLat: Math.cos((g.lat * Math.PI) / 180),
  }
}
function useSceneGeo() {
  const g = useCartographStore(s => s.mapGeography)
  const nb = useCartographStore(s => s.sceneBoundary)
  const band = useCartographStore(s => s.edgeFadeBand)
  return useMemo(() => makeGeo(g, nb, band), [g, nb, band])
}

function injectCircleCrop(mat, geo) {
  mat.transparent = true
  mat.onBeforeCompile = (shader) => {
    bindNeighborhoodFade(shader.uniforms, { center: geo.fadeCenterXZ, inner: geo.fadeInner, outer: geo.fadeOuter })
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAerialWorldPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvAerialWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAerialWorldPos;\n' + NEIGHBORHOOD_FADE_GLSL)
      .replace('#include <opaque_fragment>',
        '#include <opaque_fragment>\n' +
        'gl_FragColor.a *= neighborhoodFade(vAerialWorldPos.xz);\n' +
        'if (gl_FragColor.a < 0.01) discard;')
  }
  mat.customProgramCacheKey = () => `aerial-crop-${geo.fadeInner.toFixed(0)}-${geo.fadeOuter.toFixed(0)}`
  return mat
}

export function wgs84ToLocal(geo, lon, lat) {
  return [
    (lon - geo.center.lon) * geo.lonToMeters,
    (geo.center.lat - lat) * geo.latToMeters,
  ]
}

// Inverse of wgs84ToLocal — world (x,z) → (lon,lat). Lets the focus layer
// derive the tile-index range directly from a small handle patch instead of
// scanning the whole-BBOX tile grid (which at z21 is tens of thousands of
// cells before culling).
export function localToWgs84(geo, x, z) {
  return [geo.center.lon + x / geo.lonToMeters, geo.center.lat - z / geo.latToMeters]
}

export function lonLatToTile(lon, lat, z) {
  const n = 2 ** z
  const x = Math.floor((lon + 180) / 360 * n)
  const latRad = lat * Math.PI / 180
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n)
  return [x, y]
}

export function tileToLonLat(x, y, z) {
  const n = 2 ** z
  const lon = x / n * 360 - 180
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)))
  return [lon, latRad * 180 / Math.PI]
}

// Cull tiles whose rect is entirely outside the FADE_OUTER circle —
// the fragment shader already alpha-fades them to zero.
function tileTouchesFade(geo, x, z, w, h) {
  const cx = geo.fadeCenterXZ[0], cz = geo.fadeCenterXZ[1]
  const qx = Math.max(x, Math.min(cx, x + w))
  const qz = Math.max(z, Math.min(cz, z + h))
  const d2 = (cx - qx) ** 2 + (cz - qz) ** 2
  return d2 <= geo.fadeOuter * geo.fadeOuter
}

// Cheap AABB intersection between a tile rect {x,z,w,h} and a focus region.
function tileTouchesRegion(x, z, w, h, region) {
  const tMinX = Math.min(x, x + w), tMaxX = Math.max(x, x + w)
  const tMinZ = Math.min(z, z + h), tMaxZ = Math.max(z, z + h)
  return tMaxX >= region.minX && tMinX <= region.maxX
    && tMaxZ >= region.minZ && tMinZ <= region.maxZ
}

// ── The imagery source: USDA NAIP via USGS The National Map ─────────────
// An ArcGIS ImageServer (no tile cache), so each XYZ tile is an `exportImage` of that tile's exact Web Mercator
// square at 256×256 — the same pixels an XYZ tile would carry. ⛔ The cached `basemap.nationalmap.gov/USGSImageryOnly`
// was rejected: it stops at z16 (404 at z17+) and mixes non-NAIP partner imagery.
const NAIP_SERVICE = 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer'
// The service's own `copyrightText` (`${NAIP_SERVICE}?f=json`) is "USGS, USDA, The National Map: Orthoimagery."
export const AERIAL_CREDIT = 'USDA NAIP · USGS The National Map: Orthoimagery'
const MERC_R = 20037508.342789244
export const TILE_URL = (tx, ty, z) => {
  const s = (2 * MERC_R) / 2 ** z
  const bbox = [-MERC_R + tx * s, MERC_R - (ty + 1) * s, -MERC_R + (tx + 1) * s, MERC_R - ty * s].join(',')
  return `${NAIP_SERVICE}/exportImage?bbox=${bbox}&bboxSR=3857&imageSR=3857&size=256,256&format=jpg&f=image`
}

// Build one tile record (world rect + url) for tile (tx,ty,z), or null if it
// falls entirely outside the neighborhood fade circle.
function makeTile(geo, tx, ty, z) {
  const [nwLon, nwLat] = tileToLonLat(tx, ty, z)
  const [seLon, seLat] = tileToLonLat(tx + 1, ty + 1, z)
  const [x0, z0] = wgs84ToLocal(geo, nwLon, nwLat)
  const [x1, z1] = wgs84ToLocal(geo, seLon, seLat)
  const w = x1 - x0, h = z1 - z0
  if (!tileTouchesFade(geo, x0, z0, w, h)) return null
  return { x: x0, z: z0, w, h, url: TILE_URL(tx, ty, z) }
}

// Whole-disc tiles for zoom `z`, culled to the circle.
function buildTiles(geo, z) {
  const [xMin, yMin] = lonLatToTile(geo.bbox.minLon, geo.bbox.maxLat, z)
  const [xMax, yMax] = lonLatToTile(geo.bbox.maxLon, geo.bbox.minLat, z)
  const tiles = []
  for (let tx = xMin; tx <= xMax; tx++) {
    for (let ty = yMin; ty <= yMax; ty++) {
      const t = makeTile(geo, tx, ty, z)
      if (t) tiles.push(t)
    }
  }
  return tiles
}

// Hi-res tiles for the focus layer, derived from each small handle PATCH.
function buildFocusTiles(geo, z, patches, cx, cz, maxTiles) {
  const seen = new Set()
  const tiles = []
  for (const patch of patches) {
    const [lonW, latN] = localToWgs84(geo, patch.minX, patch.minZ)
    const [lonE, latS] = localToWgs84(geo, patch.maxX, patch.maxZ)
    const [txA, tyA] = lonLatToTile(lonW, latN, z)
    const [txB, tyB] = lonLatToTile(lonE, latS, z)
    const txLo = Math.min(txA, txB), txHi = Math.max(txA, txB)
    const tyLo = Math.min(tyA, tyB), tyHi = Math.max(tyA, tyB)
    for (let tx = txLo; tx <= txHi; tx++) {
      for (let ty = tyLo; ty <= tyHi; ty++) {
        const url = TILE_URL(tx, ty, z)
        if (seen.has(url)) continue
        const t = makeTile(geo, tx, ty, z)
        if (!t || !tileTouchesRegion(t.x, t.z, t.w, t.h, patch)) continue
        seen.add(url)
        tiles.push(t)
      }
    }
  }
  tiles.sort((a, b) => {
    const da = (a.x + a.w / 2 - cx) ** 2 + (a.z + a.h / 2 - cz) ** 2
    const db = (b.x + b.w / 2 - cx) ** 2 + (b.z + b.h / 2 - cz) ** 2
    return da - db
  })
  return tiles.length > maxTiles ? tiles.slice(0, maxTiles) : tiles
}

// The service's gateway answers a burst with an occasional 502 (1 of 25 in a burst test, 2026-10-20). A 5xx is
// retried on the SAME source, twice, then the tile fails loudly in the console — never another provider.
async function fetchTile(url, signal, tries = 3) {
  for (let i = 0; ; i++) {
    const r = await fetch(url, { signal })
    if (r.ok) return r.blob()
    if (r.status < 500 || i >= tries - 1) throw new Error(`http ${r.status}`)
    await new Promise(res => setTimeout(res, 500 * (i + 1)))
  }
}

// Cancelable tile texture (AbortController + createImageBitmap; freed on unmount).
// `crop` (default true) applies the neighborhood fade-circle shader — the shipping
// Designer/LS path. The Extent editor passes crop={false} to show the full fetched
// square uncropped (there's no boundary circle yet — the operator is authoring it).
export function TileMesh({ tile, geo, y = -0.05, crop = true }) {
  const [texture, setTexture] = useState(null)

  useEffect(() => {
    const ctrl = new AbortController()
    let tex = null, cancelled = false
    fetchTile(tile.url, ctrl.signal)
      // imageOrientation:'flipY' bakes the WebGL bottom-up flip into the bitmap;
      // THREE can't apply texture.flipY to an ImageBitmap, so pre-flip here → flipY=false.
      .then(b => createImageBitmap(b, { imageOrientation: 'flipY' }))
      .then(bitmap => {
        if (cancelled) { bitmap.close?.(); return }
        tex = new THREE.Texture(bitmap)
        tex.flipY = false
        tex.minFilter = THREE.LinearFilter
        tex.magFilter = THREE.LinearFilter
        tex.generateMipmaps = false
        tex.needsUpdate = true
        setTexture(tex)
      })
      .catch(err => { if (err.name !== 'AbortError') console.warn('[aerial] tile load failed', tile.url, err) })
    return () => {
      cancelled = true
      ctrl.abort()
      if (tex) { tex.image?.close?.(); tex.dispose() }
    }
  }, [tile.url])

  const material = useMemo(
    () => {
      if (!texture) return null
      const mat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
      return crop ? injectCircleCrop(mat, geo) : mat
    },
    [texture, geo, crop]
  )
  useEffect(() => () => material?.dispose(), [material])

  if (!material) return null
  return (
    <mesh
      position={[tile.x + tile.w / 2, y, tile.z + tile.h / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={material}
    >
      <planeGeometry args={[tile.w, tile.h]} />
    </mesh>
  )
}

// ── Two-layer aerial loader ─────────────────────────────────────────────
// Low fixed zoom for the always-on whole-disc base. z16 ≈ 1.9 m/px.
export const BASE_Z = 16

// Whole-disc low-res base. Always rendered while aerial is active.
export default function AerialBase() {
  const geo = useSceneGeo()
  const tiles = useMemo(() => geo ? buildTiles(geo, BASE_Z) : [], [geo])
  if (!geo) return null
  return (
    <group>
      {tiles.map((t) => <TileMesh key={t.url} tile={t} geo={geo} />)}
    </group>
  )
}

// ── Camera distance → tile zoom ─────────────────────────────────────────
const EARTH_CIRCUMFERENCE = 40075016.686
const TILE_PX = 256
const FOCUS_Z_MAX = 19   // NAIP's finest pixel is 0.3 m (service pixelSizeX); z19 is ≤0.3 m/px in the US, z20+ only upsamples

function cameraZoomToTileZ(geo, camZoom) {
  if (!geo) return BASE_Z + 1
  const screenMpp = 1 / Math.max(camZoom, 1e-3)
  const z = Math.log2(EARTH_CIRCUMFERENCE * geo.cosLat / (TILE_PX * screenMpp))
  return Math.max(BASE_Z + 1, Math.min(FOCUS_Z_MAX, Math.round(z)))
}

const FOCUS_R = 38               // patch half-extent (m) around each handle anchor
const MAX_FOCUS_TILES = 64       // hard cap on hi-res tiles
const FOCUS_Z_DEBOUNCE_S = 0.2

export function AerialFocus() {
  const { camera } = useThree()
  const geo = useSceneGeo()
  const selectedStreet = useCartographStore(s => s.selectedStreet)
  const streets = useCartographStore(s => s.centerlineData?.streets)
  const seed = useCartographStore(s => s.selectedMeasurePoint)
  const cornerEditMode = useCartographStore(s => s.cornerEditMode)

  const [focusZ, setFocusZ] = useState(() => cameraZoomToTileZ(geo, camera.zoom))
  const pending = useRef({ z: focusZ, t: 0 })

  useFrame((_, delta) => {
    const target = cameraZoomToTileZ(geo, camera.zoom)
    if (target === focusZ) { pending.current.t = 0; return }
    if (target !== pending.current.z) {
      pending.current.z = target
      pending.current.t = 0
    } else {
      pending.current.t += delta
      if (pending.current.t >= FOCUS_Z_DEBOUNCE_S) setFocusZ(target)
    }
  })

  // The world points where the active layer's handles live. centerlineData
  // points are [x, z] arrays.
  const anchors = useMemo(() => {
    const pts = streets?.[selectedStreet]?.points
    if (!pts?.length) return []
    const out = []
    if (seed) out.push([seed.x, seed.z])
    else { const m = pts[pts.length >> 1]; out.push([m[0], m[1]]) }
    if (cornerEditMode) {
      out.push([pts[0][0], pts[0][1]])
      out.push([pts[pts.length - 1][0], pts[pts.length - 1][1]])
    }
    return out
  }, [streets, selectedStreet, seed, cornerEditMode])

  const tiles = useMemo(() => {
    if (!geo || !anchors.length) return []
    const patches = anchors.map(([x, z]) => ({
      minX: x - FOCUS_R, maxX: x + FOCUS_R, minZ: z - FOCUS_R, maxZ: z + FOCUS_R,
    }))
    const cx = seed ? seed.x : anchors[0][0]
    const cz = seed ? seed.z : anchors[0][1]
    return buildFocusTiles(geo, focusZ, patches, cx, cz, MAX_FOCUS_TILES)
  }, [geo, focusZ, anchors, seed])

  if (!geo) return null
  return (
    <group>
      {tiles.map((t) => <TileMesh key={t.url} tile={t} geo={geo} y={-0.04} />)}
    </group>
  )
}

// ── Credit + coverage ───────────────────────────────────────────────────
// Names the imagery on screen, as the provider asks, and the NAIP flights under this town's bbox, read from the
// service's catalog (primary rasters only). ⛔ No coverage is SAID by name — outside the US the service returns
// black tiles, and a black aerial with no word is the silent failure this exists to prevent. A failed catalog read is
// said too, with a retry; it is never taken as coverage.
export function AerialCredit({ bbox }) {
  const [state, setState] = useState({ kind: 'checking' })
  const [attempt, setAttempt] = useState(0)
  const key = bbox ? [bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat].join(',') : null
  useEffect(() => {
    if (!key) return
    const ctrl = new AbortController()
    setState({ kind: 'checking' })
    const [minLon, minLat, maxLon, maxLat] = key.split(',').map(Number)
    const q = new URLSearchParams({
      geometry: JSON.stringify({ xmin: minLon, ymin: minLat, xmax: maxLon, ymax: maxLat, spatialReference: { wkid: 4326 } }),
      geometryType: 'esriGeometryEnvelope', spatialRel: 'esriSpatialRelIntersects',
      where: 'Category=1', outFields: 'Year,State', returnGeometry: 'false', f: 'json',
    })
    fetch(`${NAIP_SERVICE}/query?${q}`, { signal: ctrl.signal })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(j => {
        if (j.error) throw new Error(j.error.message || 'catalog error')
        if (!Array.isArray(j.features)) throw new Error('catalog reply has no features')
        const flights = [...new Set(j.features.map(f => `${f.attributes.State} ${f.attributes.Year}`))].sort()
        setState(flights.length ? { kind: 'covered', flights } : { kind: 'none' })
      })
      .catch(err => { if (err.name !== 'AbortError') setState({ kind: 'failed', why: err.message }) })
    return () => ctrl.abort()
  }, [key, attempt])
  if (!key) return null
  if (state.kind === 'none') {
    return (
      <div className="carto-aerial-credit carto-status--alarm">
        ⚠ No aerial here: USDA NAIP covers the conterminous US only, and has no imagery for this town
      </div>
    )
  }
  if (state.kind === 'failed') {
    return (
      <div className="carto-aerial-credit carto-status--alarm">
        ⚠ NAIP coverage could not be read ({state.why})
        <button className="carto-status-action" onClick={() => setAttempt(a => a + 1)}>Retry</button>
      </div>
    )
  }
  return (
    <div className="carto-aerial-credit">
      Imagery: {AERIAL_CREDIT}{state.kind === 'covered' ? ` · flown ${state.flights.join(', ')}` : ''}
    </div>
  )
}
