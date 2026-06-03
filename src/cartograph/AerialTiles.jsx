import { useEffect, useMemo, useRef, useState } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { BOUNDARY_CENTER_XZ, FADE_INNER, FADE_OUTER } from './boundary.js'
import { INSTANCE } from '../instance.js'
import useCartographStore from './stores/useCartographStore.js'

// Neighborhood circle silhouette — center + fade band imported from
// `boundary.js` so moving the circle is a one-file edit.
const FADE_CENTER = new THREE.Vector2(BOUNDARY_CENTER_XZ[0], BOUNDARY_CENTER_XZ[1])

function injectCircleCrop(mat) {
  mat.transparent = true
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFadeCenter = { value: FADE_CENTER }
    shader.uniforms.uFadeInner = { value: FADE_INNER }
    shader.uniforms.uFadeOuter = { value: FADE_OUTER }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAerialWorldPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvAerialWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAerialWorldPos;\nuniform vec2 uFadeCenter;\nuniform float uFadeInner;\nuniform float uFadeOuter;')
      .replace('#include <opaque_fragment>',
        '#include <opaque_fragment>\n' +
        'float _r = distance(vAerialWorldPos.xz, uFadeCenter);\n' +
        'gl_FragColor.a *= 1.0 - smoothstep(uFadeInner, uFadeOuter, _r);\n' +
        'if (gl_FragColor.a < 0.01) discard;')
  }
  mat.customProgramCacheKey = () => `aerial-crop-${FADE_INNER.toFixed(0)}-${FADE_OUTER.toFixed(0)}`
  return mat
}

const CENTER = { lat: INSTANCE.geography.lat, lon: INSTANCE.geography.lon }
const BBOX = { ...INSTANCE.geography.bbox }
const LON_TO_METERS = INSTANCE.geography.lonToMeters
const LAT_TO_METERS = INSTANCE.geography.latToMeters

function wgs84ToLocal(lon, lat) {
  return [
    (lon - CENTER.lon) * LON_TO_METERS,
    (CENTER.lat - lat) * LAT_TO_METERS,
  ]
}

// Inverse of wgs84ToLocal — world (x,z) → (lon,lat). Lets the focus layer
// derive the tile-index range directly from a small handle patch instead of
// scanning the whole-BBOX tile grid (which at z21 is tens of thousands of
// cells before culling).
function localToWgs84(x, z) {
  return [CENTER.lon + x / LON_TO_METERS, CENTER.lat - z / LAT_TO_METERS]
}

function lonLatToTile(lon, lat, z) {
  const n = 2 ** z
  const x = Math.floor((lon + 180) / 360 * n)
  const latRad = lat * Math.PI / 180
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n)
  return [x, y]
}

function tileToLonLat(x, y, z) {
  const n = 2 ** z
  const lon = x / n * 360 - 180
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)))
  return [lon, latRad * 180 / Math.PI]
}

// Cull tiles whose rect is entirely outside the FADE_OUTER circle —
// the fragment shader already alpha-fades them to zero. The rectangular
// bbox over-covers a circular fade by ~22%; skipping fully-outside
// tiles saves that many texture loads.
function tileTouchesFade(x, z, w, h) {
  const cx = BOUNDARY_CENTER_XZ[0], cz = BOUNDARY_CENTER_XZ[1]
  const qx = Math.max(x, Math.min(cx, x + w))
  const qz = Math.max(z, Math.min(cz, z + h))
  const d2 = (cx - qx) ** 2 + (cz - qz) ** 2
  return d2 <= FADE_OUTER * FADE_OUTER
}

// Cheap AABB intersection between a tile rect {x,z,w,h} and a focus region
// {minX,maxX,minZ,maxZ}. Tile w/h can be negative (web-mercator y grows
// southward), so normalize before testing.
function tileTouchesRegion(x, z, w, h, region) {
  const tMinX = Math.min(x, x + w), tMaxX = Math.max(x, x + w)
  const tMinZ = Math.min(z, z + h), tMaxZ = Math.max(z, z + h)
  return tMaxX >= region.minX && tMinX <= region.maxX
    && tMaxZ >= region.minZ && tMinZ <= region.maxZ
}

const TILE_URL = (tx, ty, z) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty}/${tx}`

// Build one tile record (world rect + url) for tile (tx,ty,z), or null if it
// falls entirely outside the neighborhood fade circle.
function makeTile(tx, ty, z) {
  const [nwLon, nwLat] = tileToLonLat(tx, ty, z)
  const [seLon, seLat] = tileToLonLat(tx + 1, ty + 1, z)
  const [x0, z0] = wgs84ToLocal(nwLon, nwLat)
  const [x1, z1] = wgs84ToLocal(seLon, seLat)
  const w = x1 - x0, h = z1 - z0
  if (!tileTouchesFade(x0, z0, w, h)) return null
  return { x: x0, z: z0, w, h, url: TILE_URL(tx, ty, z) }
}

// Whole-disc tiles for zoom `z`, culled to the circle. Used only by the
// low-res base (small grid at z16), so the whole-BBOX scan is cheap.
function buildTiles(z) {
  const [xMin, yMin] = lonLatToTile(BBOX.minLon, BBOX.maxLat, z)
  const [xMax, yMax] = lonLatToTile(BBOX.maxLon, BBOX.minLat, z)
  const tiles = []
  for (let tx = xMin; tx <= xMax; tx++) {
    for (let ty = yMin; ty <= yMax; ty++) {
      const t = makeTile(tx, ty, z)
      if (t) tiles.push(t)
    }
  }
  return tiles
}

// Hi-res tiles for the focus layer. The loop range is derived from each small
// handle PATCH (world {minX,maxX,minZ,maxZ}) — not the whole BBOX — so we never
// enumerate the full z21 grid. Tiles are deduped across patches, sorted nearest
// the operator's anchor (cx,cz), and HARD-CAPPED at `maxTiles` so the hi-res
// can never creep out to the whole disc.
function buildFocusTiles(z, patches, cx, cz, maxTiles) {
  const seen = new Set()
  const tiles = []
  for (const patch of patches) {
    const [lonW, latN] = localToWgs84(patch.minX, patch.minZ)
    const [lonE, latS] = localToWgs84(patch.maxX, patch.maxZ)
    const [txA, tyA] = lonLatToTile(lonW, latN, z)
    const [txB, tyB] = lonLatToTile(lonE, latS, z)
    const txLo = Math.min(txA, txB), txHi = Math.max(txA, txB)
    const tyLo = Math.min(tyA, tyB), tyHi = Math.max(tyA, tyB)
    for (let tx = txLo; tx <= txHi; tx++) {
      for (let ty = tyLo; ty <= tyHi; ty++) {
        const url = TILE_URL(tx, ty, z)
        if (seen.has(url)) continue
        const t = makeTile(tx, ty, z)
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

// Cancelable tile texture. THREE.TextureLoader can't abort an in-flight image
// fetch, so dollying through LOD steps / moving the focus left a trail of
// orphaned downloads that kept the network (and the whole-disc hi-res creep)
// going. We fetch with an AbortController and createImageBitmap; on unmount
// (focus moved, LOD changed) the fetch is aborted and the GPU texture freed.
function TileMesh({ tile, y = -0.05 }) {
  const [texture, setTexture] = useState(null)

  useEffect(() => {
    const ctrl = new AbortController()
    let tex = null, cancelled = false
    fetch(tile.url, { signal: ctrl.signal })
      .then(r => { if (!r.ok) throw new Error(`http ${r.status}`); return r.blob() })
      .then(b => createImageBitmap(b))
      .then(bitmap => {
        if (cancelled) { bitmap.close?.(); return }
        tex = new THREE.Texture(bitmap)
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
    () => texture ? injectCircleCrop(new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })) : null,
    [texture]
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
// Hi-res is a property of ATTENTION, not place. The base layer covers the
// whole disc at a low fixed zoom (a handful of tiles, near-instant); the
// focus layer (AerialFocus, below) loads hi-res only over the activated
// block, at a resolution driven by camera distance. See
// HANDOFF-aerial-focus-brief.md / memory project_neighborhood_disc.

// Low fixed zoom for the always-on whole-disc base. z16 ≈ 1.9 m/px,
// ~a dozen tiles after the circle cull at LS — fast + an acceptable
// overview. (Tune by eye; pre-baking the base is a later Disc step.)
export const BASE_Z = 16

// Whole-disc low-res base. Always rendered while aerial is active; never
// blank, never the 190/750-tile wave the old single-layer loader fired.
export default function AerialBase() {
  const tiles = useMemo(() => buildTiles(BASE_Z), [])
  return (
    <group>
      {tiles.map((t) => <TileMesh key={t.url} tile={t} />)}
    </group>
  )
}

// ── Camera distance → tile zoom ─────────────────────────────────────────
// Pick the tile zoom whose ground-resolution (m/px) ≈ the on-screen
// resolution. For the Designer's orthographic, pixel-unit frustum (R3F
// sets left/right/top/bottom to ±canvas/2), the visible world height is
// canvasHeightPx / camera.zoom, so on-screen m/px ≈ 1 / camera.zoom. A
// web-mercator tile at zoom z is EARTH_CIRCUMFERENCE·cos(lat)/(2^z·256)
// m/px. Solve for z, quantize, and clamp.
const EARTH_CIRCUMFERENCE = 40075016.686
const TILE_PX = 256
const FOCUS_Z_MAX = 21   // ArcGIS World_Imagery tops out ~z21 over St. Louis
const _COS_LAT = Math.cos(CENTER.lat * Math.PI / 180)

function cameraZoomToTileZ(camZoom) {
  const screenMpp = 1 / Math.max(camZoom, 1e-3)
  const z = Math.log2(EARTH_CIRCUMFERENCE * _COS_LAT / (TILE_PX * screenMpp))
  return Math.max(BASE_Z + 1, Math.min(FOCUS_Z_MAX, Math.round(z)))
}

// Hi-res focus around the EDITING HANDLES of the active layer — not the
// selected street's whole bbox (that pulled hi-res across the entire disc for
// a long street, with no cap, and never stopped). Hi-res is a property of
// ATTENTION: the operator's handles. For Survey/Section the asphalt-edge / ped
// handles cluster at the click anchor (`selectedMeasurePoint`), so one tight
// patch there covers them; in corner-edit the corners sit at the selected
// street's junction ends, so those get patches too. Resolution follows camera
// distance (closer → higher zoom), debounced so a slow dolly snaps between LOD
// steps instead of thrashing. Tiles load nearest the anchor first and are
// hard-capped, so the load is small, bounded, and follows the handles.
const FOCUS_R = 38               // patch half-extent (m) around each handle anchor
const MAX_FOCUS_TILES = 64       // hard cap on hi-res tiles — never the whole disc
const FOCUS_Z_DEBOUNCE_S = 0.2   // hold a new LOD step this long before loading

export function AerialFocus() {
  const { camera } = useThree()
  const selectedStreet = useCartographStore(s => s.selectedStreet)
  const streets = useCartographStore(s => s.centerlineData?.streets)
  const seed = useCartographStore(s => s.selectedMeasurePoint)
  const cornerEditMode = useCartographStore(s => s.cornerEditMode)

  const [focusZ, setFocusZ] = useState(() => cameraZoomToTileZ(camera.zoom))
  // Debounce: only commit a new LOD once the camera has held it briefly.
  const pending = useRef({ z: focusZ, t: 0 })

  useFrame((_, delta) => {
    const target = cameraZoomToTileZ(camera.zoom)
    if (target === focusZ) { pending.current.t = 0; return }
    if (target !== pending.current.z) {
      pending.current.z = target
      pending.current.t = 0
    } else {
      pending.current.t += delta
      if (pending.current.t >= FOCUS_Z_DEBOUNCE_S) setFocusZ(target)
    }
  })

  // The world points where the active layer's handles live.
  const anchors = useMemo(() => {
    const pts = streets?.[selectedStreet]?.points
    if (!pts?.length) return []
    const out = []
    // Cross-section handles (Survey asphalt-edge / Section ped) anchor at the
    // click point; before the first click the overlays park them at the chain
    // midpoint, so mirror that fallback.
    if (seed) out.push([seed.x, seed.z])
    else { const m = pts[pts.length >> 1]; out.push([m[0], m[1]]) }
    // Corner handles sit at this street's junction ends — add those so the
    // hi-res follows the corner being rounded. Just this street's two ends,
    // not all the disc's intersections.
    if (cornerEditMode) {
      out.push([pts[0][0], pts[0][1]])
      out.push([pts[pts.length - 1][0], pts[pts.length - 1][1]])
    }
    return out
  }, [streets, selectedStreet, seed, cornerEditMode])

  const tiles = useMemo(() => {
    if (!anchors.length) return []
    const patches = anchors.map(([x, z]) => ({
      minX: x - FOCUS_R, maxX: x + FOCUS_R, minZ: z - FOCUS_R, maxZ: z + FOCUS_R,
    }))
    // Sort/cap center = the click anchor (the operator's eye), else the first patch.
    const cx = seed ? seed.x : anchors[0][0]
    const cz = seed ? seed.z : anchors[0][1]
    return buildFocusTiles(focusZ, patches, cx, cz, MAX_FOCUS_TILES)
  }, [focusZ, anchors, seed])

  // y just above the base (-0.05) so the sharper focus draws on top.
  return (
    <group>
      {tiles.map((t) => <TileMesh key={t.url} tile={t} y={-0.04} />)}
    </group>
  )
}
