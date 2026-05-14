import { useMemo } from 'react'
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
const BBOX = {
  minLat: 38.6100, maxLat: 38.6230,
  minLon: -90.2290, maxLon: -90.2070,
}
const LON_TO_METERS = 86774
const LAT_TO_METERS = 111000

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

function buildTiles(z) {
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
      tiles.push({
        x: x0, z: z0, w, h,
        url: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty}/${tx}`,
      })
    }
  }
  return tiles
}

const loader = new THREE.TextureLoader()

function TileMesh({ tile }) {
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

  return (
    <mesh
      position={[tile.x + tile.w / 2, -0.05, tile.z + tile.h / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={material}
    >
      <planeGeometry args={[tile.w, tile.h]} />
    </mesh>
  )
}

// z=18 is the default (~190 tiles after circle cull at LS). Measure
// passes zoom=20 for its very-cropped-in views (~750 tiles). Each step
// up in z = 4× tile count, so this is a load-time-vs-pixel-density
// trade. ArcGIS World_Imagery serves z=20 in most areas including
// St. Louis.
export default function AerialTiles({ zoom = 18, visible = true }) {
  const tiles = useMemo(() => buildTiles(zoom), [zoom])

  return (
    <group visible={visible}>
      {tiles.map((t, i) => <TileMesh key={i} tile={t} />)}
    </group>
  )
}
