// Fetch lamps + road ways for sample towns into <town>/{geography.json, raw/osm.json},
// the same layout cartograph/data/<scene>/ uses, so scratch/lamp-population.mjs reads both.
//   node scratch/lamp-sample/fetch.mjs traverse-city-mi madison-wi ...
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const HERE = dirname(fileURLToPath(import.meta.url))
const towns = JSON.parse(readFileSync(join(HERE, 'towns.json'), 'utf-8'))
const HALF_M = 1500
const sleep = ms => new Promise(r => setTimeout(r, ms))
for (const k of process.argv.slice(2)) {
  const [lat, lon, group] = towns[k]
  const out = join(HERE, k); if (existsSync(join(out, 'raw', 'osm.json'))) { console.log(k, 'cached'); continue }
  const latToMeters = 111000, lonToMeters = Math.round(111320 * Math.cos(lat * Math.PI / 180))
  const d = HALF_M / latToMeters, e = HALF_M / lonToMeters
  const bb = `${lat - d},${lon - e},${lat + d},${lon + e}`
  const q = `[out:json][timeout:120];(node["highway"="street_lamp"](${bb});way["highway"](${bb}););out geom;`
  let j = null
  for (let a = 0; a < 6 && !j; a++) {
    const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'User-Agent': 'lafayette-square-kit lamp-sample' }, body: new URLSearchParams({ data: q }) })
    const t = await r.text(); try { j = JSON.parse(t) } catch { console.log(k, 'retry', a, r.status); await sleep(30000) }
  }
  if (!j) { console.log(k, 'FAILED'); continue }
  const pois = [], highway = []
  for (const el of j.elements) {
    if (el.type === 'node') pois.push({ osmId: el.id, osmType: 'node', category: 'highway', tags: el.tags, coords: [{ lon: el.lon, lat: el.lat }] })
    else if (el.type === 'way' && el.geometry) highway.push({ osmId: el.id, tags: el.tags, coords: el.geometry.map(p => ({ lon: p.lon, lat: p.lat })) })
  }
  mkdirSync(join(out, 'raw'), { recursive: true })
  writeFileSync(join(out, 'geography.json'), JSON.stringify({ _comment: `lamp sample (${group}), ±${HALF_M} m box`, lat, lon, lonToMeters, latToMeters }, null, 1))
  writeFileSync(join(out, 'raw', 'osm.json'), JSON.stringify({ osm3s: j.osm3s, ground: { highway }, pois }))
  console.log(k, 'lamps', pois.length, 'ways', highway.length)
  await sleep(15000)
}
