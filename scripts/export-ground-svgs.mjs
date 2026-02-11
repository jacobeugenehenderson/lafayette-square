#!/usr/bin/env node
/**
 * export-ground-svgs.mjs — Export each ground layer as a separate SVG
 *
 * Uses the same bounding box as debug-streets.svg / assets/streets.svg
 * so all layers align when overlaid in Illustrator.
 *
 * Outputs:
 *   assets/blocks.svg    — lot polygons (filled shapes)
 *   assets/sidewalks.svg — sidewalk ring polygons (filled shapes, lot hole)
 *   assets/paths.svg     — park interior paths (stroked centerlines)
 *   assets/service.svg   — alleys + service roads (stroked centerlines + filled polygons)
 */

import { readFileSync, writeFileSync } from 'fs'

// ── Load data ────────────────────────────────────────────────────────────
const blockShapes = JSON.parse(readFileSync('src/data/block_shapes.json', 'utf-8'))
const streetsData = JSON.parse(readFileSync('src/data/streets.json', 'utf-8'))

// ── Bounding box (matches debug-streets.svg exactly) ─────────────────────
// viewBox="-497.7 -732.5 1308.55 1120.5" width="2617" height="2241"
const VB_X = -497.7, VB_Y = -732.5, VB_W = 1308.55, VB_H = 1120.5
const PX_W = 2617, PX_H = 2241

function svgHeader(title) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB_X} ${VB_Y} ${VB_W} ${VB_H}" width="${PX_W}" height="${PX_H}">`,
    `<!-- ${title} — generated ${new Date().toISOString()} -->`,
    `<rect x="${VB_X}" y="${VB_Y}" width="${VB_W}" height="${VB_H}" fill="#111"/>`,
  ]
}

function polyToD(pts) {
  return pts.map(([x, z], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${z.toFixed(2)}`).join(' ') + ' Z'
}

function lineToD(pts) {
  return pts.map(([x, z], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${z.toFixed(2)}`).join(' ')
}

// ── 1. Blocks (lot polygons) ──────────────────────────────────────────────
{
  const lines = svgHeader('Lot/block polygons from block_shapes.json')
  let count = 0

  for (const block of blockShapes.blocks) {
    if (!block.lot || block.lot.length < 3) continue
    const label = block.isPark ? 'Park' : block.id
    const fill = block.isPark ? '#2a5a2a' : '#fff'
    lines.push(`<path d="${polyToD(block.lot)}" fill="${fill}" stroke="none"><title>${label}</title></path>`)
    count++
  }

  lines.push('</svg>')
  writeFileSync('assets/blocks.svg', lines.join('\n'))
  console.log(`assets/blocks.svg — ${count} lot polygons`)
}

// ── 2. Sidewalks (ring between sidewalk boundary and lot) ─────────────────
{
  const lines = svgHeader('Sidewalk rings from block_shapes.json')
  let count = 0

  for (const block of blockShapes.blocks) {
    if (!block.sidewalk || !block.lot) continue

    // Outer boundary (sidewalk edge) with lot as hole
    // SVG: outer path CW, hole path CCW (or use fill-rule evenodd with both)
    const outer = polyToD(block.sidewalk)
    const inner = polyToD([...block.lot].reverse())
    const label = block.isPark ? 'Park sidewalk' : `${block.id} sidewalk`
    lines.push(`<path d="${outer} ${inner}" fill="#fff" fill-rule="evenodd" stroke="none"><title>${label}</title></path>`)
    count++
  }

  // Also include alley fills as sidewalk-colored polygons
  if (blockShapes.alleyFills) {
    for (const af of blockShapes.alleyFills) {
      if (af.polygon.length < 3) continue
      lines.push(`<path d="${polyToD(af.polygon)}" fill="#ccc" stroke="none"><title>${af.name || 'alley fill'}</title></path>`)
      count++
    }
  }

  lines.push('</svg>')
  writeFileSync('assets/sidewalks.svg', lines.join('\n'))
  console.log(`assets/sidewalks.svg — ${count} sidewalk shapes`)
}

// ── 3. Park paths (unnamed interior paths) ────────────────────────────────
{
  const lines = svgHeader('Park interior paths from streets.json (unnamed segments)')
  const PATH_WIDTHS = { primary: 6, secondary: 5, tertiary: 4, residential: 3.6, service: 4 }
  let count = 0

  // Park boundary check (same as VectorStreets.jsx)
  const PARK_COS = Math.cos(9.2 * Math.PI / 180)
  const PARK_SIN = Math.sin(9.2 * Math.PI / 180)
  const PARK_CLIP = 175

  function isInsidePark(x, z) {
    const rx = x * PARK_COS + z * PARK_SIN
    const rz = -x * PARK_SIN + z * PARK_COS
    return Math.abs(rx) < PARK_CLIP && Math.abs(rz) < PARK_CLIP
  }

  for (const street of streetsData.streets) {
    if (street.name || !street.points || street.points.length < 2) continue

    // Check if midpoint is inside park
    const mid = street.points[Math.floor(street.points.length / 2)]
    if (!isInsidePark(mid[0], mid[1])) continue

    const width = PATH_WIDTHS[street.type] || 3.6
    const d = lineToD(street.points)
    lines.push(`<path d="${d}" stroke="#fff" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" fill="none"><title>${street.type} path</title></path>`)
    count++
  }

  lines.push('</svg>')
  writeFileSync('assets/paths.svg', lines.join('\n'))
  console.log(`assets/paths.svg — ${count} park paths`)
}

// ── 4. Service roads + alleys ─────────────────────────────────────────────
{
  const lines = svgHeader('Service roads and alleys')
  const cleanData = JSON.parse(readFileSync('src/data/blocks_clean.json', 'utf-8'))
  const ROW_WIDTHS = { ...cleanData.street_widths }
  Object.assign(ROW_WIDTHS, {
    'South Tucker Boulevard': 14, 'Gravois Avenue': 6,
    'Officer David Haynes Memorial Highway': 14, 'Russell Boulevard': 16,
    'South 13th Street': 12, 'Papin Street': 13, 'Geyer Avenue': 9,
    'Allen Avenue': 9, 'Ohio Avenue': 8, 'Ann Avenue': 9,
    'McNair Avenue': 9, 'Caroline Street': 5, 'Serbian Drive': 8,
    'South 12th Street': 5, 'South 17th Street': 6, 'Josephine Street': 6,
    '21st Street Cycle Track': 5,
  })
  const TYPE_DEFAULTS = { primary: 24, secondary: 18, residential: 14, service: 8 }

  let count = 0

  // Park boundary check
  const PARK_COS = Math.cos(9.2 * Math.PI / 180)
  const PARK_SIN = Math.sin(9.2 * Math.PI / 180)
  const PARK_CLIP = 175
  function isInsidePark(x, z) {
    const rx = x * PARK_COS + z * PARK_SIN
    const rz = -x * PARK_SIN + z * PARK_COS
    return Math.abs(rx) < PARK_CLIP && Math.abs(rz) < PARK_CLIP
  }

  for (const street of streetsData.streets) {
    if (!street.points || street.points.length < 2) continue
    if (street.type !== 'service') continue

    // Skip park interior paths (those go in paths.svg)
    if (!street.name) {
      const mid = street.points[Math.floor(street.points.length / 2)]
      if (isInsidePark(mid[0], mid[1])) continue
    }

    const width = ROW_WIDTHS[street.name] || TYPE_DEFAULTS[street.type] || 8
    const label = street.name || '(unnamed service)'
    const d = lineToD(street.points)
    lines.push(`<path d="${d}" stroke="#fff" stroke-width="${width}" stroke-linecap="butt" stroke-linejoin="round" fill="none"><title>${label} (${width}m)</title></path>`)
    count++
  }

  // Alley fill polygons
  if (blockShapes.alleyFills) {
    for (const af of blockShapes.alleyFills) {
      if (af.polygon.length < 3) continue
      lines.push(`<path d="${polyToD(af.polygon)}" fill="#888" stroke="none"><title>${af.name || 'alley fill'}</title></path>`)
      count++
    }
  }

  lines.push('</svg>')
  writeFileSync('assets/service.svg', lines.join('\n'))
  console.log(`assets/service.svg — ${count} service segments + alley fills`)
}

console.log('\nAll SVGs use the same bounding box — overlay in Illustrator for alignment.')
