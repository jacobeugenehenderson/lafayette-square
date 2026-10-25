/**
 * waterDatums.mjs — THE TOWN'S NAMED WATER LEVELS, READ FROM ITS RECORD, in the record's own vertical datum.
 *
 * ⭐⭐ WHERE THE WATER STANDS (BRIEF-bathymetry, "The water's LEVEL is a tide"; Jacob, 2026-09-27): a LOW and a HIGH
 * tide (MLLW and MHW by default; a town may name others it has), or a lake's one level. They come from
 * raw/water-datums.json (fetch-water-datums.mjs; nothing here calls a service). A tidal town's datums vary across it,
 * so they are a GRID, row-major by z then x, rows north → south; a point the datum service does not cover (land) takes
 * its nearest covered neighbour, COUNTED.
 *
 * ⭐ ONE READER, TWO ZEROS. `bake-coast` reads the levels in NAVD88 (`zero = 0`) and meets them with the lidar, which is
 * NAVD88 too: the coast is found with no datum at all, so the datum cannot depend on the line it moves
 * (BRIEF-the-coast-from-the-lidar). `bake-terrain` reads the same record with `zero = baseElev`, the lidar's water,
 * and writes the levels as heights above y = 0 (terrain.json `water`, which `waterLevel.mjs` reads).
 * ⛔ A coastal town with no datums, or a lake with no ruled level, REFUSES.
 */
import fs from 'fs'
import { join } from 'path'
import { terrainValueReads, TERRAIN_WATER_KEYS, TERRAIN_WATER_NAMES } from './terrainReads.mjs'

/** The town's authored water values (design.json `water`), { key: { value, from } }. ⛔ Two looks disagreeing refuses. */
export function authoredWater(scene, reads = terrainValueReads(scene)) {
  const out = {}
  for (const key of TERRAIN_WATER_KEYS) {
    const set = reads.water.filter(([, w]) => w[key] != null)
    if (new Set(set.map(([, w]) => w[key])).size > 1)
      throw new Error(`⛔ looks on scene '${scene}' author different water.${key}: ${set.map(([id, w]) => `${id}=${w[key]}`).join(', ')} — the terrain is one per scene`)
    if (set.length) out[key] = { value: TERRAIN_WATER_NAMES.includes(key) ? String(set[0][1][key]) : +set[0][1][key],
                                 from: `authored (design.json water.${key}, ${set.map(([id]) => id).join(', ')})` }
  }
  return out
}

/**
 * The town's water levels as the terrain.json `water` record, measured from `zero` (NAVD88 metres).
 * @param mapDir        cartograph/data/<scene>
 * @param scene         the scene id (for messages)
 * @param auth          authoredWater(scene)
 * @param wgs84ToLocal  the town's (lon, lat) → (x, z)
 * @param zero          the NAVD88 height of y = 0: the lidar's water for the terrain, 0 for the coast
 */
export function waterRecord({ mapDir, scene, auth, wgs84ToLocal, zero }) {
  const path = join(mapDir, 'raw', 'water-datums.json')
  if (!fs.existsSync(path))
    throw new Error(`⛔ the water level: '${scene}' has a coast and no raw/water-datums.json — its water would stand at the tide the lidar flew at, which no one chose. ▶ node cartograph/fetch-water-datums.mjs --scene=${scene}`)
  const D = JSON.parse(fs.readFileSync(path, 'utf8'))
  const up = navd => +(navd - zero).toFixed(3)
  if (D.kind === 'tidal') {
    const { lons, lats } = D.grid, w = lons.length, h = lats.length
    const [x0, z0] = wgs84ToLocal(lons[0], lats[0]), [x1, z1] = wgs84ToLocal(lons[w - 1], lats[h - 1])
    const have = { [D.high.datum]: D.high.navd88M, [D.low.datum]: D.low.navd88M }
    let filled = 0
    const field = arr => arr.map((v, k) => {
      if (v != null) return up(v)
      let best = null, bd = Infinity                          // nearest covered sample on the grid
      arr.forEach((u, q) => { if (u == null) return; const d = Math.hypot((q % w) - (k % w), Math.floor(q / w) - Math.floor(k / w)); if (d < bd) { bd = d; best = u } })
      filled++
      return up(best)
    })
    const datums = { grid: { min: [+x0.toFixed(2), +z0.toFixed(2)], step: [+((x1 - x0) / (w - 1)).toFixed(3), +((z1 - z0) / (h - 1)).toFixed(3)], w, h },
                     uncertaintyM: D.uncertaintyM }
    for (const [name, arr] of Object.entries(have)) datums[name] = field(arr)
    const pick = (key, dflt) => {
      const name = auth[key]?.value ?? dflt
      if (!datums[name]) throw new Error(`⛔ the water level: design.json water.${key} = '${name}', and '${scene}' has only ${Object.keys(have).join(', ')} (raw/water-datums.json) — fetch it, or name one of those`)
      return { name, from: auth[key] ? auth[key].from : 'kit default' }
    }
    const high = pick('high', 'MHW'), low = pick('low', 'MLLW')
    return { tidal: true, navd88OfZero: zero, datums, low: low.name, lowFrom: low.from, high: high.name, highFrom: high.from,
             station: D.station, source: `${D.source}, fetched ${D.fetchedOn}`, filledFromNeighbour: filled / Object.keys(have).length }
  }
  if (D.kind === 'lake') {
    const name = auth.lakeLevel?.value
    const opts = Object.entries(D.levels).map(([k, v]) => `${k} = ${v.igld85M} m IGLD85 (${v.what})`).join(' · ')
    if (!name) throw new Error(`⛔ the water level: '${scene}' is a lake (${D.station.name}, ${D.station.id}) and no level is ruled. Author design.json water.lakeLevel as one of: ${opts}.`)
    const L = D.levels[name]
    if (!L || !Number.isFinite(L.igld85M)) throw new Error(`⛔ the water level: water.lakeLevel = '${name}' — '${scene}' has ${opts}`)
    const v = up(L.igld85M + D.igld85InNavd88M)
    return { tidal: false, navd88OfZero: zero, datums: { grid: { min: [0, 0], step: [0, 0], w: 1, h: 1 }, [name]: [v], uncertaintyM: null },
             low: name, lowFrom: auth.lakeLevel.from, high: name, highFrom: auth.lakeLevel.from, station: D.station, source: `${D.source}, fetched ${D.fetchedOn}` }
  }
  throw new Error(`⛔ the water level: raw/water-datums.json for '${scene}' names no datum (${D.why || D.kind}) — its water level cannot be named`)
}
