// dem-coverage.mjs — does a 1 m tile hold DATA over a town, or only cover its bbox? READ-ONLY (range reads).
// Samples a grid over the town's fetched square on each URL; reports the share of samples with a value.
//   node scratch/ground-height/dem-coverage.mjs <scene> <url> [<url> …]
import { readFileSync } from 'fs'
import { openRasters, readWindow, sampleSources } from '../../cartograph/elevationSources.mjs'
const [scene, ...urls] = process.argv.slice(2)
const geo = JSON.parse(readFileSync(new URL(`../../cartograph/data/${scene}/geography.json`, import.meta.url)))
const b = geo.bbox
for (const u of urls) {
  const o = await openRasters([{ kind: 'url', ref: u }])
  let n = 0, ok = 0
  const d = 10 / geo.latToMeters
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
    const lon = b.minLon + (b.maxLon - b.minLon) * i / 10, lat = b.minLat + (b.maxLat - b.minLat) * j / 10
    const W = await readWindow(o, { cornersLL: [[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d]], stepM: null, quiet: true })
    n++; const v = sampleSources(W, lon, lat, { nanIsNodata: true }); if (Number.isFinite(v) && v > -1000) ok++
  }
  console.log(`${scene}  ${(100 * ok / n).toFixed(1)}% of a 11×11 grid over the fetched square has data · ${u.split('/').pop()}`)
}
