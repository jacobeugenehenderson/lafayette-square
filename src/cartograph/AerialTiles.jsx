import { useEffect, useMemo, useRef, useState } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { INSTANCE } from '../instance.js'
import useCartographStore from './stores/useCartographStore.js'
import lsBoundary from '../../cartograph/data/lafayette-square/neighborhood_boundary.json'
import hpBoundary from '../../cartograph/data/hipointe-demun/neighborhood_boundary.json'
import hpGeography from '../../cartograph/data/hipointe-demun/geography.json'

// ── Per-scene geography + silhouette ────────────────────────────────────────
// The aerial tiles come from a GLOBAL provider (ArcGIS World_Imagery), so the
// only per-scene inputs are WHERE the neighborhood is (center lat/lon +
// projection + bbox) and its fade circle (center + inner/outer). Resolve both
// from the active scene so a new neighborhood shows its own photo. LS reads the
// instance SSOT; other scenes read their data/<scene>/geography.json +
// neighborhood_boundary.json. (Registry mirrors CartographApp's SCENE_REGISTRY;
// toy has no aerial so it isn't listed — resolveSceneGeo falls back to LS.)
function makeGeo(g, nb) {
  const fadeInner = nb.fade?.inner ?? Math.max(0, (nb.radius || 0) - (nb.innerFadeOffset ?? 134))
  const fadeOuter = nb.fade?.outer ?? (nb.radius || 0)
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
const SCENE_GEO = {
  'lafayette-square': makeGeo(INSTANCE.geography, lsBoundary),
  'hipointe-demun': makeGeo(hpGeography, hpBoundary),
}
function resolveSceneGeo(scene) {
  return SCENE_GEO[scene] || SCENE_GEO['lafayette-square']
}

function injectCircleCrop(mat, geo) {
  mat.transparent = true
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFadeCenter = { value: geo.fadeCenter }
    shader.uniforms.uFadeInner = { value: geo.fadeInner }
    shader.uniforms.uFadeOuter = { value: geo.fadeOuter }
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
  mat.customProgramCacheKey = () => `aerial-crop-${geo.fadeInner.toFixed(0)}-${geo.fadeOuter.toFixed(0)}`
  return mat
}

function wgs84ToLocal(geo, lon, lat) {
  return [
    (lon - geo.center.lon) * geo.lonToMeters,
    (geo.center.lat - lat) * geo.latToMeters,
  ]
}

// Inverse of wgs84ToLocal — world (x,z) → (lon,lat). Lets the focus layer
// derive the tile-index range directly from a small handle patch instead of
// scanning the whole-BBOX tile grid (which at z21 is tens of thousands of
// cells before culling).
function localToWgs84(geo, x, z) {
  return [geo.center.lon + x / geo.lonToMeters, geo.center.lat - z / geo.latToMeters]
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

const TILE_URL = (tx, ty, z) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty}/${tx}`

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

// Cancelable tile texture (AbortController + createImageBitmap; freed on unmount).
function TileMesh({ tile, geo, y = -0.05 }) {
  const [texture, setTexture] = useState(null)

  useEffect(() => {
    const ctrl = new AbortController()
    let tex = null, cancelled = false
    fetch(tile.url, { signal: ctrl.signal })
      .then(r => { if (!r.ok) throw new Error(`http ${r.status}`); return r.blob() })
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
    () => texture ? injectCircleCrop(new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }), geo) : null,
    [texture, geo]
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
  const scene = useCartographStore(s => s.scene)
  const geo = useMemo(() => resolveSceneGeo(scene), [scene])
  const tiles = useMemo(() => buildTiles(geo, BASE_Z), [geo])
  return (
    <group>
      {tiles.map((t) => <TileMesh key={t.url} tile={t} geo={geo} />)}
    </group>
  )
}

// ── Camera distance → tile zoom ─────────────────────────────────────────
const EARTH_CIRCUMFERENCE = 40075016.686
const TILE_PX = 256
const FOCUS_Z_MAX = 21   // ArcGIS World_Imagery tops out ~z21

function cameraZoomToTileZ(geo, camZoom) {
  const screenMpp = 1 / Math.max(camZoom, 1e-3)
  const z = Math.log2(EARTH_CIRCUMFERENCE * geo.cosLat / (TILE_PX * screenMpp))
  return Math.max(BASE_Z + 1, Math.min(FOCUS_Z_MAX, Math.round(z)))
}

const FOCUS_R = 38               // patch half-extent (m) around each handle anchor
const MAX_FOCUS_TILES = 64       // hard cap on hi-res tiles
const FOCUS_Z_DEBOUNCE_S = 0.2

export function AerialFocus() {
  const { camera } = useThree()
  const scene = useCartographStore(s => s.scene)
  const geo = useMemo(() => resolveSceneGeo(scene), [scene])
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
    if (!anchors.length) return []
    const patches = anchors.map(([x, z]) => ({
      minX: x - FOCUS_R, maxX: x + FOCUS_R, minZ: z - FOCUS_R, maxZ: z + FOCUS_R,
    }))
    const cx = seed ? seed.x : anchors[0][0]
    const cz = seed ? seed.z : anchors[0][1]
    return buildFocusTiles(geo, focusZ, patches, cx, cz, MAX_FOCUS_TILES)
  }, [geo, focusZ, anchors, seed])

  return (
    <group>
      {tiles.map((t) => <TileMesh key={t.url} tile={t} geo={geo} y={-0.04} />)}
    </group>
  )
}
