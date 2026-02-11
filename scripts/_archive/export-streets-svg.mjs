#!/usr/bin/env node
/**
 * Export all street/path/service segments from streets.json as an SVG
 * with correct ROW widths. Coordinates are local meters (X=east, Z=south).
 */

import { readFileSync, writeFileSync } from 'fs'

// ── ROW width lookup (mirrors generate-block-shapes.mjs) ─────────────────
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
const PATH_WIDTHS = { primary: 6, secondary: 5, tertiary: 4, residential: 3.6, service: 4 }

// ── Load data ────────────────────────────────────────────────────────────
const streetData = JSON.parse(readFileSync('src/data/streets.json', 'utf-8'))

// ── Compute bounding box and build paths ─────────────────────────────────
let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
const segments = []

for (const s of streetData.streets) {
  if (!s.name || !s.points || s.points.length < 2) continue

  const width = ROW_WIDTHS[s.name] || TYPE_DEFAULTS[s.type] || 14

  for (const [x, z] of s.points) {
    minX = Math.min(minX, x - width / 2)
    maxX = Math.max(maxX, x + width / 2)
    minZ = Math.min(minZ, z - width / 2)
    maxZ = Math.max(maxZ, z + width / 2)
  }

  segments.push({ points: s.points, name: s.name || '', type: s.type, width })
}

// Pad
const PAD = 10
minX -= PAD; minZ -= PAD; maxX += PAD; maxZ += PAD
const svgW = maxX - minX
const svgH = maxZ - minZ

// ── Build SVG ────────────────────────────────────────────────────────────
const lines = []
lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minZ} ${svgW} ${svgH}" width="${Math.round(svgW * 2)}" height="${Math.round(svgH * 2)}">`)
lines.push(`<rect x="${minX}" y="${minZ}" width="${svgW}" height="${svgH}" fill="#111"/>`)

for (const s of segments) {
  const d = s.points.map(([x, z], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${z.toFixed(2)}`).join(' ')
  const title = s.name ? `${s.name} (${s.type}, ${s.width}m)` : `(unnamed ${s.type}, ${s.width}m)`
  lines.push(`<path d="${d}" stroke="#fff" stroke-width="${s.width}" stroke-linecap="butt" stroke-linejoin="round" fill="none"><title>${title}</title></path>`)
}

lines.push('</svg>')

const outPath = 'debug-streets.svg'
writeFileSync(outPath, lines.join('\n'))
console.log(`Written ${outPath} — ${segments.length} segments, ${Math.round(svgW)}x${Math.round(svgH)}m`)
