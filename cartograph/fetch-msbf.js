#!/usr/bin/env node
/**
 * Cartograph — Microsoft Building Footprints fetch
 *
 * Replaces the OSM building data with Microsoft's ML-derived footprints
 * from the Global ML Buildings dataset. MSBF is generally substantially
 * more accurate than OSM's older US imports — correct shape, correct
 * scale, correct position — because it's automatically extracted from
 * high-resolution Bing imagery via a consistent pipeline.
 *
 * Dataset: https://github.com/microsoft/GlobalMLBuildingFootprints
 * Format:  gzipped GeoJSONL tiles indexed by zoom-9 quadkey
 * Output:  data/raw/msbf.json (same shape as osm.json's buildings array)
 *
 * Usage:   node fetch-msbf.js
 */

import { createWriteStream, createReadStream, readFileSync, writeFileSync,
         existsSync, mkdirSync, statSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import { createInterface } from 'readline'
import { createGunzip } from 'zlib'
import { BBOX, RAW_DIR, wgs84ToLocal } from './config.js'

const INDEX_URL = 'https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv'
const CACHE = join(RAW_DIR, '_cache')
const INDEX_CACHE = join(CACHE, 'msbf-index.csv')

// ── Quadkey helpers (Bing-style, zoom 9) ───────────────────────────
function lonLatToTile(lon, lat, z) {
  const n = 2 ** z
  const x = Math.floor((lon + 180) / 360 * n)
  const latRad = lat * Math.PI / 180
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n)
  return [x, y]
}
function tileToQuadkey(x, y, z) {
  let qk = ''
  for (let i = z; i > 0; i--) {
    let digit = 0
    const mask = 1 << (i - 1)
    if ((x & mask) !== 0) digit |= 1
    if ((y & mask) !== 0) digit |= 2
    qk += digit
  }
  return qk
}

function quadkeysForBbox(bbox, z) {
  const [xMin, yMin] = lonLatToTile(bbox.minLon, bbox.maxLat, z) // NW
  const [xMax, yMax] = lonLatToTile(bbox.maxLon, bbox.minLat, z) // SE
  const qks = new Set()
  for (let x = xMin; x <= xMax; x++)
    for (let y = yMin; y <= yMax; y++)
      qks.add(tileToQuadkey(x, y, z))
  return [...qks]
}

// ── curl wrapper: download to path if not cached ───────────────────
function fetchTo(url, path, label) {
  if (existsSync(path)) {
    console.log(`  [cached] ${label} (${(statSync(path).size / 1024 / 1024).toFixed(1)} MB)`)
    return
  }
  console.log(`  Downloading ${label}...`)
  execSync(`curl -fsSL -o "${path}" "${url}"`, { stdio: 'inherit' })
  console.log(`  → ${(statSync(path).size / 1024 / 1024).toFixed(1)} MB`)
}

// ── Stream-parse a gunzipped GeoJSONL file, filter to BBOX ────────
async function parseTile(gzPath, bbox, margin) {
  const { minLon, maxLon, minLat, maxLat } = bbox
  const lonLo = minLon - margin, lonHi = maxLon + margin
  const latLo = minLat - margin, latHi = maxLat + margin

  const kept = []
  let scanned = 0

  const stream = createReadStream(gzPath).pipe(createGunzip())
  const rl = createInterface({ input: stream, crlfDelay: Infinity })

  for await (const line of rl) {
    scanned++
    if (!line.startsWith('{')) continue
    let feat
    try { feat = JSON.parse(line) } catch { continue }
    const ring = feat.geometry?.coordinates?.[0]
    if (!ring || ring.length < 4) continue

    // Accept if any vertex falls within the padded bbox
    let hit = false
    for (const v of ring) {
      const [lon, lat] = v
      if (lon >= lonLo && lon <= lonHi && lat >= latLo && lat <= latHi) {
        hit = true; break
      }
    }
    if (!hit) continue
    kept.push(feat)
  }
  return { kept, scanned }
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(60))
  console.log('cartograph/fetch-msbf.js — Microsoft Building Footprints')
  console.log('='.repeat(60))

  mkdirSync(CACHE, { recursive: true })

  // 1. Determine needed quadkeys for our BBOX
  const neededQks = quadkeysForBbox(BBOX, 9)
  console.log(`\nBBOX → quadkeys(z=9): ${neededQks.join(', ')}`)

  // 2. Fetch index of all US tiles
  fetchTo(INDEX_URL, INDEX_CACHE, 'dataset-links.csv')
  const indexRows = readFileSync(INDEX_CACHE, 'utf-8').split('\n').slice(1)
  const tiles = []
  for (const row of indexRows) {
    if (!row) continue
    const parts = row.split(',')
    if (parts[0] !== 'UnitedStates') continue
    if (!neededQks.includes(parts[1])) continue
    tiles.push({ qk: parts[1], url: parts[2], size: parts[3] })
  }
  console.log(`Matched tiles: ${tiles.length}`)
  if (tiles.length === 0) {
    console.error('No US tiles found covering BBOX — aborting')
    process.exit(1)
  }

  // 3. Download each tile (cached)
  const localTiles = []
  for (const t of tiles) {
    const local = join(CACHE, `msbf-${t.qk}.csv.gz`)
    fetchTo(t.url, local, `tile ${t.qk} (${t.size})`)
    localTiles.push({ ...t, local })
  }

  // 4. Stream-parse each and filter to BBOX
  console.log('\nParsing...')
  const MARGIN = 0.0005 // ~50m padding so buildings straddling edges survive
  const allFeatures = []
  let totalScanned = 0
  for (const t of localTiles) {
    const { kept, scanned } = await parseTile(t.local, BBOX, MARGIN)
    console.log(`  quadkey ${t.qk}: scanned ${scanned.toLocaleString()}, kept ${kept.length}`)
    totalScanned += scanned
    allFeatures.push(...kept)
  }
  console.log(`\n  Total: scanned ${totalScanned.toLocaleString()}, kept ${allFeatures.length}`)

  // 5. Convert to the same shape as fetch.js's OSM buildings
  //    { osmId|msbfId, tags, isClosed, coords: [{lon,lat,x,z}, …] }
  const buildings = allFeatures.map((f, i) => {
    const ring = f.geometry.coordinates[0]
    const coords = ring.map(([lon, lat]) => {
      const [x, z] = wgs84ToLocal(lon, lat)
      return {
        lon: Math.round(lon * 1e7) / 1e7,
        lat: Math.round(lat * 1e7) / 1e7,
        x:   Math.round(x * 100) / 100,
        z:   Math.round(z * 100) / 100,
      }
    })
    return {
      msbfId: i,
      tags: {
        building: 'yes',
        source: 'microsoft',
        ...(f.properties?.height != null && f.properties.height >= 0
          ? { height: Math.round(f.properties.height * 100) / 100 }
          : {}),
      },
      isClosed: true,
      coords,
    }
  })

  // 6. Write output
  const out = {
    source: 'Microsoft Global Building Footprints (quadkey z=9)',
    dataset: 'global-buildings/2026-02-03',
    date: new Date().toISOString().split('T')[0],
    bbox: { ...BBOX },
    quadkeys: neededQks,
    count: buildings.length,
    buildings,
  }
  const outPath = join(RAW_DIR, 'msbf.json')
  writeFileSync(outPath, JSON.stringify(out, null, 2))
  const sizeKb = Math.round(JSON.stringify(out).length / 1024)
  console.log(`\n  Saved ${outPath} (${sizeKb} KB, ${buildings.length} buildings)`)
  console.log('='.repeat(60))
}

main().catch(err => { console.error(err); process.exit(1) })
