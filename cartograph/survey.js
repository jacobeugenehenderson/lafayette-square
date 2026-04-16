#!/usr/bin/env node
/**
 * Cartograph — Survey: measure street widths from sidewalk positions
 *
 * The sidewalk distance from the street centerline tells us where
 * the block edge should go. The street pavement width is a separate
 * concern (rendered from lane/parking/bike tags at render time).
 * The tree lawn is the natural gap between them — not computed,
 * just whatever space exists between asphalt and concrete.
 *
 * Width source priority:
 *   1. OSM sidewalk distance (centerline to nearest sidewalk, both sides)
 *   2. Assessor ROW / 2 as fallback
 *   3. Default residential width as last resort
 *
 * Usage:    node survey.js
 * Output:   data/raw/survey.json
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { RAW_DIR, CARTOGRAPH_DIR } from './config.js'
import { STANDARDS } from './standards.js'

const PROJECT_DIR = join(CARTOGRAPH_DIR, '..')
const DEFAULT_HW = 5.0

function main() {
  console.log('='.repeat(60))
  console.log('cartograph/survey.js — Measure from sidewalks')
  console.log('='.repeat(60))

  // ── Load OSM data ──────────────────────────────────────────────
  const osmPath = join(RAW_DIR, 'osm.json')
  if (!existsSync(osmPath)) {
    console.log('  No OSM data — run fetch.js first')
    return
  }
  const osm = JSON.parse(readFileSync(osmPath, 'utf-8'))
  const highways = osm.ground?.highway || []

  // ── Load assessor ROW (fallback) ───────────────────────────────
  const assessorPath = join(PROJECT_DIR, 'src', 'data', 'blocks_clean.json')
  const assessorROW = {}
  if (existsSync(assessorPath)) {
    const data = JSON.parse(readFileSync(assessorPath, 'utf-8'))
    for (const [name, row] of Object.entries(data.street_widths || {}))
      assessorROW[name] = row
    console.log(`  Assessor: ${Object.keys(assessorROW).length} streets`)
  }

  // ── Collect sidewalks ──────────────────────────────────────────
  const sidewalks = highways.filter(f => f.tags?.footway === 'sidewalk')
  console.log(`  Sidewalks: ${sidewalks.length} segments`)

  // ── Collect vehicular streets ──────────────────────────────────
  const vehTypes = new Set(['residential', 'primary', 'primary_link', 'secondary',
    'secondary_link', 'tertiary', 'tertiary_link', 'unclassified'])
  const byName = {}
  for (const f of highways) {
    const name = f.tags?.name
    if (!name || !vehTypes.has(f.tags?.highway)) continue
    if (!byName[name]) byName[name] = { segs: [], tags: [] }
    byName[name].segs.push(f)
    byName[name].tags.push(f.tags)
  }

  // ── Measure sidewalk distances per street ──────────────────────
  console.log('\n  Measuring sidewalk distances...')

  const streets = {}
  for (const [name, info] of Object.entries(byName).sort(([a], [b]) => a.localeCompare(b))) {
    const entry = { name }

    // OSM tags (for markings, not width)
    const laneCounts = info.tags.map(t => parseInt(t.lanes, 10)).filter(n => n > 0)
    if (laneCounts.length > 0) entry.lanes = Math.max(...laneCounts)

    entry.cycleway = info.tags.some(t =>
      (t.cycleway === 'lane' || t.cycleway === 'track') ||
      (t['cycleway:left'] === 'lane' || t['cycleway:left'] === 'track') ||
      (t['cycleway:right'] === 'lane' || t['cycleway:right'] === 'track')) || undefined

    entry.sharrows = (!entry.cycleway && info.tags.some(t =>
      t.cycleway === 'shared_lane')) || undefined

    entry.oneway = info.tags.some(t => t.oneway === 'yes') || undefined

    entry.diagonalParking = info.tags.some(t =>
      t['parking:left:orientation'] === 'perpendicular' ||
      t['parking:left:orientation'] === 'diagonal' ||
      t['parking:right:orientation'] === 'perpendicular' ||
      t['parking:right:orientation'] === 'diagonal') || undefined

    // Detect divided roads: opposing one-way carriageways
    const owSegs = info.segs.filter(f => f.tags?.oneway === 'yes')
    let divided = false
    if (owSegs.length >= 2) {
      for (let i = 0; i < owSegs.length && !divided; i++) {
        const c0 = owSegs[i].coords
        if (!c0 || c0.length < 2) continue
        const dx0 = c0[c0.length - 1].x - c0[0].x, dz0 = c0[c0.length - 1].z - c0[0].z
        const len0 = Math.sqrt(dx0 * dx0 + dz0 * dz0)
        if (len0 < 5) continue
        for (let j = i + 1; j < owSegs.length; j++) {
          const c1 = owSegs[j].coords
          if (!c1 || c1.length < 2) continue
          const dx1 = c1[c1.length - 1].x - c1[0].x, dz1 = c1[c1.length - 1].z - c1[0].z
          const len1 = Math.sqrt(dx1 * dx1 + dz1 * dz1)
          if (len1 < 5) continue
          let ad = Math.abs(Math.atan2(dz0, dx0) - Math.atan2(dz1, dx1))
          if (ad > Math.PI) ad = 2 * Math.PI - ad
          if (ad < 2.3) continue
          const nx = -dz0 / len0, nz = dx0 / len0
          const gap = Math.abs(
            ((c1[0].x + c1[c1.length - 1].x) / 2 - (c0[0].x + c0[c0.length - 1].x) / 2) * nx +
            ((c1[0].z + c1[c1.length - 1].z) / 2 - (c0[0].z + c0[c0.length - 1].z) / 2) * nz)
          if (gap > 1.5 && gap < 15) { divided = true; break }
        }
      }
    }
    if (!divided && entry.oneway && (assessorROW[name] || 0) > 20) divided = true
    if (divided) entry.divided = true

    entry.type = info.tags[0]?.highway

    // Assessor ROW
    if (assessorROW[name]) {
      entry.rowWidth = assessorROW[name]
      entry.source = 'assessor'
    }

    // ── Measure: distance from centerline to nearest sidewalk ────
    // For each street segment, find sidewalks on each side and
    // take the minimum perpendicular distance. Average across
    // segments for the street-level measurement.
    const allLeftDists = [], allRightDists = []
    for (const seg of info.segs) {
      const c = seg.coords
      if (c.length < 2) continue
      const dx = c[c.length - 1].x - c[0].x, dz = c[c.length - 1].z - c[0].z
      const len = Math.sqrt(dx * dx + dz * dz)
      if (len < 10) continue

      const nx = -dz / len, nz = dx / len
      const mx = (c[0].x + c[c.length - 1].x) / 2
      const mz = (c[0].z + c[c.length - 1].z) / 2

      for (const sw of sidewalks) {
        const sc = sw.coords
        if (sc.length < 2) continue

        // Only consider sidewalks that run roughly parallel to
        // this street (within ~30°). Cross-street sidewalks at
        // intersections would give falsely small distances.
        const sdx = sc[sc.length - 1].x - sc[0].x
        const sdz = sc[sc.length - 1].z - sc[0].z
        const slen = Math.sqrt(sdx * sdx + sdz * sdz)
        if (slen < 3) continue
        const dot = Math.abs(dx * sdx + dz * sdz) / (len * slen)
        if (dot < 0.85) continue  // cos(30°) ≈ 0.87

        const smx = (sc[0].x + sc[sc.length - 1].x) / 2
        const smz = (sc[0].z + sc[sc.length - 1].z) / 2

        const along = (smx - mx) * dx / len + (smz - mz) * dz / len
        const perp = (smx - mx) * nx + (smz - mz) * nz

        if (Math.abs(along) < len / 2 + 10 && Math.abs(perp) > 2 && Math.abs(perp) < 20) {
          if (perp > 0) allRightDists.push(perp)
          else allLeftDists.push(-perp)
        }
      }
    }

    // Sidewalk half-width: use the closer side's minimum distance.
    // For divided roads, sidewalks on the far side (across the
    // median) will be much further — use the near side only.
    const hasLeft = allLeftDists.length > 0
    const hasRight = allRightDists.length > 0
    const minLeft = hasLeft ? Math.min(...allLeftDists) : null
    const minRight = hasRight ? Math.min(...allRightDists) : null

    if (hasLeft && hasRight) {
      // Both sides: average of the two closest sidewalks
      entry.pavementHalfWidth = (minLeft + minRight) / 2
      entry.source = 'sidewalk'
      entry.sidewalkLeft = +minLeft.toFixed(2)
      entry.sidewalkRight = +minRight.toFixed(2)
    } else if (hasLeft || hasRight) {
      // One side only: use what we have
      entry.pavementHalfWidth = hasLeft ? minLeft : minRight
      entry.source = 'sidewalk-1side'
      if (hasLeft) entry.sidewalkLeft = +minLeft.toFixed(2)
      if (hasRight) entry.sidewalkRight = +minRight.toFixed(2)
    } else if (entry.rowWidth) {
      // No sidewalks: fall back to assessor ROW
      entry.pavementHalfWidth = entry.rowWidth / 2
      entry.source = 'assessor'
    } else {
      entry.pavementHalfWidth = DEFAULT_HW
      entry.source = 'default'
    }

    streets[name] = entry
  }

  // ── Summary ────────────────────────────────────────────────────
  const bySrc = {}
  for (const s of Object.values(streets)) {
    bySrc[s.source] = (bySrc[s.source] || 0) + 1
  }
  console.log(`\n  Total: ${Object.keys(streets).length} streets`)
  for (const [src, n] of Object.entries(bySrc).sort())
    console.log(`    ${src}: ${n}`)

  // ── Write ──────────────────────────────────────────────────────
  const survey = {
    source: 'OSM sidewalk distance measurements + assessor ROW fallback',
    date: new Date().toISOString().split('T')[0],
    notes: 'pavementHalfWidth = centerline to sidewalk centerline. Block edge goes here. Street pavement is rendered independently from lane/parking tags. Tree lawn is the natural gap.',
    streets,
  }

  const outPath = join(RAW_DIR, 'survey.json')
  writeFileSync(outPath, JSON.stringify(survey, null, 2))
  console.log(`\n  Saved ${outPath}`)

  // ── Table ──────────────────────────────────────────────────────
  console.log('\n  Street widths (centerline → sidewalk):')
  for (const s of Object.values(streets).sort((a, b) => a.name.localeCompare(b.name))) {
    const hw = s.pavementHalfWidth
    const full = (hw * 2 / 0.3048).toFixed(0)
    const src = (s.source || '').padEnd(14)
    const flags = [
      s.divided ? 'DIV' : '',
      s.lanes ? `${s.lanes}L` : '',
      s.oneway ? 'OW' : '',
      s.cycleway ? 'BK' : '',
      s.diagonalParking ? 'DIAG' : '',
    ].filter(Boolean).join(' ')
    const lr = s.sidewalkLeft && s.sidewalkRight
      ? `  (L:${s.sidewalkLeft.toFixed(1)} R:${s.sidewalkRight.toFixed(1)})`
      : s.sidewalkLeft ? `  (L:${s.sidewalkLeft.toFixed(1)})`
      : s.sidewalkRight ? `  (R:${s.sidewalkRight.toFixed(1)})`
      : ''
    console.log(`    ${s.name.padEnd(30)} ${hw.toFixed(1)}m  (${full}ft)  ${src} ${flags}${lr}`)
  }

  console.log('='.repeat(60))
}

main()
