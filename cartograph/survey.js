#!/usr/bin/env node
/**
 * Cartograph — Survey: generate per-neighborhood variance data
 *
 * Fetches real street widths from local data sources and writes
 * survey.json — the override layer that sits between universal
 * standards and the rendering pipeline.
 *
 * Data sources (in priority order):
 *   1. City assessor parcel data (ROW widths from frontage records)
 *   2. OSM tags (lanes, width, if present)
 *   3. Falls back to standards.js defaults
 *
 * For Lafayette Square, source is STL City Assessor via
 * the existing blocks_clean.json (fetched by 03-fetch-stl-parcels.py).
 *
 * For a new city, replace the fetchLocalData() function with
 * that city's open data API. The output schema stays the same.
 *
 * Usage:    node survey.js
 * Output:   data/raw/survey.json
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { RAW_DIR, CARTOGRAPH_DIR } from './config.js'
import { STANDARDS, getStreetSpec, crossSection } from './standards.js'

const PROJECT_DIR = join(CARTOGRAPH_DIR, '..')

// ══════════════════════════════════════════════════════════════════════
// Source 1: City assessor parcel data
// ══════════════════════════════════════════════════════════════════════

function fetchAssessorData() {
  // For STL: read the already-fetched parcel data
  const path = join(PROJECT_DIR, 'src', 'data', 'blocks_clean.json')
  if (!existsSync(path)) {
    console.log('  No parcel data found at src/data/blocks_clean.json')
    return {}
  }

  const data = JSON.parse(readFileSync(path, 'utf-8'))
  const widths = data.street_widths || {}

  console.log(`  Assessor: ${Object.keys(widths).length} streets with ROW widths`)
  return widths
}

// ══════════════════════════════════════════════════════════════════════
// Source 2: OSM tags on street segments
// ══════════════════════════════════════════════════════════════════════

function extractOsmWidths() {
  const osmPath = join(RAW_DIR, 'osm.json')
  if (!existsSync(osmPath)) {
    console.log('  No OSM data found — run fetch.js first')
    return {}
  }

  const osm = JSON.parse(readFileSync(osmPath, 'utf-8'))
  const highways = osm.ground?.highway || []

  // Group by street name, collect lane counts and any width tags
  const byName = {}
  for (const f of highways) {
    const name = f.tags?.name
    if (!name) continue
    const t = f.tags.highway
    if (!['residential', 'primary', 'primary_link', 'secondary', 'secondary_link',
          'tertiary', 'tertiary_link', 'unclassified'].includes(t)) continue

    if (!byName[name]) byName[name] = { tags: [], type: t }
    byName[name].tags.push(f.tags)
  }

  // For each street, compute a width from OSM tags
  const widths = {}
  for (const [name, info] of Object.entries(byName)) {
    // If any segment has an explicit width tag, use it
    for (const tags of info.tags) {
      if (tags.width) {
        widths[name] = { osmWidth: parseFloat(tags.width) }
        break
      }
    }

    // Otherwise compute from lanes + type
    if (!widths[name]) {
      // Use the most common lane count across segments
      const laneCounts = info.tags.map(t => parseInt(t.lanes, 10)).filter(n => n > 0)
      const lanes = laneCounts.length > 0
        ? laneCounts.sort((a, b) => a - b)[Math.floor(laneCounts.length / 2)] // median
        : null

      const hasCycleway = info.tags.some(t =>
        (t.cycleway && t.cycleway !== 'no') ||
        (t['cycleway:left'] && t['cycleway:left'] !== 'no') ||
        (t['cycleway:right'] && t['cycleway:right'] !== 'no'))

      const isOneway = info.tags.some(t => t.oneway === 'yes')

      widths[name] = {
        osmLanes: lanes,
        osmCycleway: hasCycleway,
        osmOneway: isOneway,
        type: info.type,
      }
    }
  }

  console.log(`  OSM: ${Object.keys(widths).length} named streets with tag data`)
  return widths
}

// ══════════════════════════════════════════════════════════════════════
// Merge into survey.json
// ══════════════════════════════════════════════════════════════════════

function main() {
  console.log('='.repeat(60))
  console.log('cartograph/survey.js — Generate variance data')
  console.log('='.repeat(60))

  const assessor = fetchAssessorData()
  const osm = extractOsmWidths()

  // Merge: assessor ROW widths take priority, OSM fills gaps
  const streets = {}

  // All unique street names
  const allNames = new Set([...Object.keys(assessor), ...Object.keys(osm)])

  for (const name of allNames) {
    const entry = { name }

    // Assessor data: real surveyed ROW width
    if (assessor[name]) {
      entry.rowWidth = assessor[name]  // meters, full width
      entry.source = 'assessor'
    }

    // OSM data: lane counts, cycleway, oneway
    if (osm[name]) {
      const o = osm[name]
      if (o.osmWidth) {
        // Explicit width tag — use it if no assessor data
        if (!entry.rowWidth) {
          entry.rowWidth = o.osmWidth
          entry.source = 'osm:width'
        }
      }
      if (o.osmLanes) entry.lanes = o.osmLanes
      if (o.osmCycleway) entry.cycleway = true
      if (o.osmOneway) entry.oneway = true
      if (o.type) entry.type = o.type
    }

    // Compute effective half-width for the pipeline.
    // Prefer lane-based geometry (lanes + parking + gutters) over ROW-based,
    // because OSM centerlines are often off-center in the ROW and the
    // ROW-based formula (ROW/2 - sidewalk) can make streets too wide,
    // covering the sidewalks on the tighter side.
    const sidewalkZone = STANDARDS.sidewalk.width + STANDARDS.treeLawn.width + STANDARDS.curb.width
    if (entry.lanes) {
      // Compute from lane count + standards (curb-to-curb geometry)
      const spec = getStreetSpec({
        highway: entry.type || 'residential',
        lanes: String(entry.lanes),
        cycleway: entry.cycleway ? 'lane' : undefined,
        oneway: entry.oneway ? 'yes' : undefined,
      })
      const section = crossSection(spec)
      entry.pavementHalfWidth = section.pavement
      if (!entry.source) entry.source = entry.rowWidth ? 'assessor' : 'osm:lanes'
      // Cap to ROW if available (street can't exceed ROW minus sidewalks)
      if (entry.rowWidth) {
        const maxHW = Math.max(2, (entry.rowWidth / 2) - sidewalkZone)
        if (entry.pavementHalfWidth > maxHW) entry.pavementHalfWidth = maxHW
      }
    } else if (entry.rowWidth) {
      // Fallback: derive from ROW when lane count is unknown
      entry.pavementHalfWidth = Math.max(2, (entry.rowWidth / 2) - sidewalkZone)
    }

    streets[name] = entry
  }

  // Summary
  const withWidth = Object.values(streets).filter(s => s.pavementHalfWidth)
  const fromAssessor = Object.values(streets).filter(s => s.source === 'assessor')
  const fromOsm = Object.values(streets).filter(s => s.source?.startsWith('osm'))

  console.log(`\n  Total: ${Object.keys(streets).length} streets`)
  console.log(`  With computed width: ${withWidth.length}`)
  console.log(`    From assessor: ${fromAssessor.length}`)
  console.log(`    From OSM tags: ${fromOsm.length}`)

  // Write
  const survey = {
    source: 'STL City Assessor parcel data + OpenStreetMap tags',
    date: new Date().toISOString().split('T')[0],
    notes: 'rowWidth = full ROW in meters (assessor). pavementHalfWidth = centerline to curb face.',
    streets,
  }

  const outPath = join(RAW_DIR, 'survey.json')
  writeFileSync(outPath, JSON.stringify(survey, null, 2))
  console.log(`\n  Saved ${outPath}`)

  // Print the variance table
  console.log('\n  Street widths (assessor overrides):')
  for (const s of Object.values(streets).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!s.pavementHalfWidth) continue
    const hw = s.pavementHalfWidth
    const full = (hw * 2 / 0.3048).toFixed(0)
    const src = (s.source || '').padEnd(10)
    const flags = [
      s.lanes ? `${s.lanes}L` : '',
      s.oneway ? 'OW' : '',
      s.cycleway ? 'BK' : '',
    ].filter(Boolean).join(' ')
    console.log(`    ${s.name.padEnd(30)} ${hw.toFixed(1)}m hw  (${full}ft c2c)  ${src} ${flags}`)
  }

  console.log('='.repeat(60))
}

main()
