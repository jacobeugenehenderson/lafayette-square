import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { BOUNDARY_CENTER_XZ, FADE_INNER, FADE_OUTER } from './boundary.js'
import { INSTANCE } from '../instance.js'

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

// Generate the ArcGIS World_Imagery tiles for zoom `z` across the WGS84
// BBOX, culled to the neighborhood circle. When `regionBbox` is passed
// (world-space {minX,maxX,minZ,maxZ}), additionally skip tiles that don't
// intersect it — that's how the focus layer loads only a handful of hi-res
// tiles over the activated block instead of the whole disc.
function buildTiles(z, regionBbox = null) {
  const [xMin, yMin] = lonLatToTile(BBOX.minLon, BBOX.maxLat, z)
  const [xMax, yMax] = lonLatToTile(BBOX.maxLon, BBOX.minLat, z)
  const tiles = []
  for (let tx = xMin; tx <= xMax; tx++) {
    for (let ty = yMin; ty <= yMax; ty++) {
      const [nwLon, nwLat] = tileToLonLat(tx, ty, z)
      const [seLon, seLat] = tileToLonLat(tx + 1, ty + 1, z)
      const [x0, z0] = wgs84ToLocal(nwLon, nwLat)
      const [x1, z1] = wgs84ToLocal(seLon, seLat)
      const w = x1 - x0, h = z1 - z0
      if (!tileTouchesFade(x0, z0, w, h)) continue
      if (regionBbox && !tileTouchesRegion(x0, z0, w, h, regionBbox)) continue
      tiles.push({
        x: x0, z: z0, w, h,
        url: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty}/${tx}`,
      })
    }
  }
  return tiles
}

const loader = new THREE.TextureLoader()

function TileMesh({ tile, y = -0.05 }) {
  const texture = useMemo(() => {
    const tex = loader.load(tile.url)
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    return tex
  }, [tile.url])

  const material = useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
    return injectCircleCrop(mat)
  }, [texture])

  // Free GPU memory when this tile unmounts or its url changes. The focus
  // layer churns tiles as the operator dollies / reselects, so without this
  // the textures (several MB each) accumulate over a session. Base tiles are
  // stable but disposal is harmless there too.
  useEffect(() => () => {
    texture.dispose()
    material.dispose()
  }, [texture, material])

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
