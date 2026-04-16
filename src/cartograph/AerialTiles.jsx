import { useMemo } from 'react'
import * as THREE from 'three'

// Lafayette Square center + coordinate conversion (from config.js)
const CENTER = { lat: 38.6160, lon: -90.2161 }
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
      tiles.push({
        x: x0, z: z0, w: x1 - x0, h: z1 - z0,
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

  return (
    <mesh position={[tile.x + tile.w / 2, 0.01, tile.z + tile.h / 2]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[tile.w, tile.h]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}

export default function AerialTiles({ zoom = 18, visible = true }) {
  const tiles = useMemo(() => buildTiles(zoom), [zoom])

  return (
    <group visible={visible}>
      {tiles.map((t, i) => <TileMesh key={i} tile={t} />)}
    </group>
  )
}
