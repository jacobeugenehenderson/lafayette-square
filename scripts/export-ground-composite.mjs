#!/usr/bin/env node
/**
 * export-ground-composite.mjs — Render all ground layers into a single SVG
 * with scene-accurate colors, ready for PNG conversion as an Illustrator ref layer.
 *
 * Same viewBox as all exported layer SVGs so it aligns perfectly.
 */

import { readFileSync, writeFileSync } from 'fs'

const blockShapes = JSON.parse(readFileSync('src/data/block_shapes.json', 'utf-8'))
const streetsData = JSON.parse(readFileSync('src/data/streets.json', 'utf-8'))
const blocksClean = JSON.parse(readFileSync('src/data/blocks_clean.json', 'utf-8'))

// ── Bounding box ─────────────────────────────────────────────────────────
const VB_X = -497.7, VB_Y = -732.5, VB_W = 1308.55, VB_H = 1120.5
const PX_W = 2617, PX_H = 2241

// ── Scene colors ─────────────────────────────────────────────────────────
const ROAD_COLOR   = '#0e0e12'
const LOT_COLOR    = '#2e2e38'
const SIDEWALK_CLR = '#8a8a82'
const CENTER_CLR   = '#d4c46a'
const PARK_LOT     = '#1a3a1a'

// ── Widths ───────────────────────────────────────────────────────────────
const ROW_WIDTHS = { ...blocksClean.street_widths }
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
const PATH_WIDTHS  = { primary: 6, secondary: 5, tertiary: 4, residential: 3.6, service: 4 }

// ── Park detection ───────────────────────────────────────────────────────
const PARK_COS = Math.cos(9.2 * Math.PI / 180)
const PARK_SIN = Math.sin(9.2 * Math.PI / 180)
const PARK_CLIP = 175
function isInsidePark(x, z) {
  const rx = x * PARK_COS + z * PARK_SIN
  const rz = -x * PARK_SIN + z * PARK_COS
  return Math.abs(rx) < PARK_CLIP && Math.abs(rz) < PARK_CLIP
}

// ── Helpers ──────────────────────────────────────────────────────────────
function polyD(pts) {
  return pts.map(([x,z],i) => `${i===0?'M':'L'}${x.toFixed(1)},${z.toFixed(1)}`).join(' ') + ' Z'
}
function lineD(pts) {
  return pts.map(([x,z],i) => `${i===0?'M':'L'}${x.toFixed(1)},${z.toFixed(1)}`).join(' ')
}

// ── Build SVG ────────────────────────────────────────────────────────────
const lines = []
lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB_X} ${VB_Y} ${VB_W} ${VB_H}" width="${PX_W}" height="${PX_H}">`)
lines.push(`<rect x="${VB_X}" y="${VB_Y}" width="${VB_W}" height="${VB_H}" fill="${ROAD_COLOR}"/>`)

// ── Layer 1: Blocks ──────────────────────────────────────────────────────
lines.push(`<g id="blocks">`)
for (const block of blockShapes.blocks) {
  if (!block.lot || block.lot.length < 3) continue
  lines.push(`<path d="${polyD(block.lot)}" fill="${block.isPark ? PARK_LOT : LOT_COLOR}"/>`)
}
lines.push(`</g>`)

// ── Layer 2: Sidewalks + alley fills ─────────────────────────────────────
lines.push(`<g id="sidewalks">`)
for (const block of blockShapes.blocks) {
  if (!block.sidewalk || !block.lot) continue
  const outer = polyD(block.sidewalk)
  const inner = polyD([...block.lot].reverse())
  lines.push(`<path d="${outer} ${inner}" fill="${SIDEWALK_CLR}" fill-rule="evenodd"/>`)
}
if (blockShapes.alleyFills) {
  for (const af of blockShapes.alleyFills) {
    if (af.polygon.length < 3) continue
    lines.push(`<path d="${polyD(af.polygon)}" fill="${SIDEWALK_CLR}"/>`)
  }
}
lines.push(`</g>`)

// ── Layer 3: Service roads ───────────────────────────────────────────────
lines.push(`<g id="service">`)
for (const street of streetsData.streets) {
  if (!street.points || street.points.length < 2) continue
  if (street.type !== 'service') continue
  if (!street.name) {
    const mid = street.points[Math.floor(street.points.length / 2)]
    if (isInsidePark(mid[0], mid[1])) continue
  }
  const width = ROW_WIDTHS[street.name] || TYPE_DEFAULTS[street.type] || 8
  lines.push(`<path d="${lineD(street.points)}" stroke="${SIDEWALK_CLR}" stroke-width="${width}" stroke-linecap="butt" stroke-linejoin="round" fill="none"/>`)
}
lines.push(`</g>`)

// ── Layer 4: Park paths ──────────────────────────────────────────────────
lines.push(`<g id="paths">`)
for (const street of streetsData.streets) {
  if (street.name || !street.points || street.points.length < 2) continue
  const mid = street.points[Math.floor(street.points.length / 2)]
  if (!isInsidePark(mid[0], mid[1])) continue
  const width = PATH_WIDTHS[street.type] || 3.6
  lines.push(`<path d="${lineD(street.points)}" stroke="${SIDEWALK_CLR}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`)
}
lines.push(`</g>`)

// ── Layer 5: Streets ─────────────────────────────────────────────────────
lines.push(`<g id="streets">`)
for (const street of streetsData.streets) {
  if (!street.name || !street.points || street.points.length < 2) continue
  if (street.type === 'service') continue
  const width = ROW_WIDTHS[street.name] || TYPE_DEFAULTS[street.type] || 14
  lines.push(`<path d="${lineD(street.points)}" stroke="${ROAD_COLOR}" stroke-width="${width}" stroke-linecap="butt" stroke-linejoin="round" fill="none"/>`)
}
lines.push(`</g>`)

// ── Layer 6: Center lines ────────────────────────────────────────────────
const PRINCIPAL = new Set([
  'Park Avenue', 'Lafayette Avenue', 'Chouteau Avenue',
  'South Jefferson Avenue', 'Truman Parkway',
])
lines.push(`<g id="centerlines">`)
for (const street of streetsData.streets) {
  if (!street.name || !PRINCIPAL.has(street.name)) continue
  if (!street.points || street.points.length < 2) continue
  lines.push(`<path d="${lineD(street.points)}" stroke="${CENTER_CLR}" stroke-width="0.6" stroke-linecap="butt" stroke-linejoin="round" fill="none" stroke-dasharray="8 6"/>`)
}
lines.push(`</g>`)

lines.push('</svg>')

const outPath = 'assets/ground-composite.svg'
writeFileSync(outPath, lines.join('\n'))
console.log(`Written ${outPath} (${(Buffer.byteLength(lines.join('\n')) / 1024).toFixed(0)} KB)`)
