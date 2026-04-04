#!/usr/bin/env node
/**
 * Cartograph — Step 1: Fetch OSM data
 *
 * Pulls all ground-plane features from OpenStreetMap via Overpass API:
 *   - highways (streets, alleys, paths, sidewalks)
 *   - landuse, leisure, natural (parks, grass, water)
 *   - buildings
 *   - amenity=parking
 *   - barriers (fences, walls)
 *
 * Outputs:  data/raw/osm.json
 *
 * Usage:    node fetch.js
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import { BBOX, RAW_DIR, wgs84ToLocal, overpassBbox } from './config.js'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const TIMEOUT = 120

function overpassQuery(queryBody) {
  const full = `[out:json][timeout:${TIMEOUT}];${queryBody}`
  console.log(`  Overpass query (${full.length} chars)...`)

  const result = execSync(
    `curl -s --max-time ${TIMEOUT + 30} --data-urlencode "data=${full}" "${OVERPASS_URL}"`,
    { maxBuffer: 50 * 1024 * 1024 }
  )

  const data = JSON.parse(result.toString())
  console.log(`  → ${data.elements?.length ?? 0} elements`)
  return data
}

function main() {
  console.log('='.repeat(60))
  console.log('cartograph/fetch.js — Fetch OSM ground + buildings')
  console.log('='.repeat(60))

  mkdirSync(RAW_DIR, { recursive: true })
  const bbox = overpassBbox()
  console.log(`BBOX: ${bbox}`)

  // Fetch ground features: ways + tagged nodes (trees, lamps, furniture)
  const groundQuery = `(
  way["highway"](${bbox});
  way["landuse"](${bbox});
  way["leisure"](${bbox});
  way["natural"](${bbox});
  way["amenity"](${bbox});
  way["barrier"](${bbox});
  way["waterway"](${bbox});
  way["surface"](${bbox});
  way["man_made"](${bbox});
  way["boundary"](${bbox});
  node["natural"](${bbox});
  node["amenity"](${bbox});
  node["highway"](${bbox});
  node["man_made"](${bbox});
);
out body;>;out skel qt;`

  console.log('\n[1/2] Ground features...')
  const groundData = overpassQuery(groundQuery)

  // Fetch buildings
  const buildingQuery = `(
  way["building"](${bbox});
  relation["building"](${bbox});
);
out body;>;out skel qt;`

  console.log('\n[2/2] Buildings...')
  const buildingData = overpassQuery(buildingQuery)

  // Parse nodes and ways
  const nodes = {}
  const groundWays = []
  const buildingWays = []

  function ingestElements(elements, target) {
    for (const el of elements) {
      if (el.type === 'node') {
        nodes[el.id] = [el.lon, el.lat]
      } else if (el.type === 'way' && el.tags) {
        target.push(el)
      }
    }
  }

  ingestElements(groundData.elements || [], groundWays)
  ingestElements(buildingData.elements || [], buildingWays)

  console.log(`\n  ${Object.keys(nodes).length} nodes`)
  console.log(`  ${groundWays.length} ground ways`)
  console.log(`  ${buildingWays.length} building ways`)

  // Convert to features with local coords
  function wayToFeature(way) {
    const coords = []
    for (const nid of way.nodes || []) {
      const pt = nodes[nid]
      if (!pt) continue
      const [x, z] = wgs84ToLocal(pt[0], pt[1])
      coords.push({
        lon: Math.round(pt[0] * 1e7) / 1e7,
        lat: Math.round(pt[1] * 1e7) / 1e7,
        x: Math.round(x * 100) / 100,
        z: Math.round(z * 100) / 100,
      })
    }
    if (coords.length < 2) return null

    const isClosed = way.nodes.length >= 4 && way.nodes[0] === way.nodes[way.nodes.length - 1]

    return {
      osmId: way.id,
      tags: way.tags,
      isClosed,
      coords,
    }
  }

  // Categorize ground features
  const tagPriority = [
    'highway', 'landuse', 'leisure', 'natural',
    'amenity', 'barrier', 'waterway', 'surface',
  ]

  const ground = {}
  for (const way of groundWays) {
    const feat = wayToFeature(way)
    if (!feat) continue

    let category = 'other'
    for (const tag of tagPriority) {
      if (feat.tags[tag]) { category = tag; break }
    }

    if (!ground[category]) ground[category] = []
    ground[category].push(feat)
  }

  const buildings = buildingWays.map(wayToFeature).filter(Boolean)

  // Summary
  console.log('\n  Ground features by category:')
  let total = 0
  for (const [cat, feats] of Object.entries(ground).sort()) {
    console.log(`    ${cat}: ${feats.length}`)
    total += feats.length
  }
  console.log(`  Total ground: ${total}`)
  console.log(`  Buildings: ${buildings.length}`)

  // Write output
  const output = {
    bbox: { ...BBOX },
    ground,
    buildings,
    nodeCount: Object.keys(nodes).length,
  }

  const outPath = join(RAW_DIR, 'osm.json')
  writeFileSync(outPath, JSON.stringify(output, null, 2))
  const sizeKb = Math.round(JSON.stringify(output).length / 1024)
  console.log(`\n  Saved ${outPath} (${sizeKb} KB)`)
  console.log('='.repeat(60))
}

main()
