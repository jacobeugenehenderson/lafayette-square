#!/usr/bin/env node
/**
 * 17-export-ground-svg.mjs — Convert OSM ground features to a layered SVG
 *
 * Reads raw/osm_ground.json and outputs assets/osm-ground.svg with named
 * layers (<g id="...">) that Illustrator imports as separate layers.
 *
 * Layers:
 *   roads-primary    — primary + secondary roads (wide, dark)
 *   roads-residential — residential + tertiary roads
 *   roads-service    — service roads, alleys, driveways
 *   footways         — footways, paths, cycleways, steps
 *   landuse          — grass, residential, commercial, etc.
 *   leisure          — gardens, pools, playgrounds, pitches
 *   parking          — parking areas
 *   barriers         — fences, walls, hedges, retaining walls
 *   natural          — scrub, wood, water
 *   other            — bridges, man_made, etc.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'

const ground = JSON.parse(readFileSync('scripts/raw/osm_ground.json', 'utf-8'))

// ── Fixed bounding box matching existing SVG exports ────────────────────
// Same viewBox as assets/streets.svg, blocks.svg, etc.
const minX = -497.7, minZ = -732.5, W = 1308.55, H = 1120.5
const maxX = minX + W, maxZ = minZ + H

console.log(`Bounds: X [${minX.toFixed(0)}, ${maxX.toFixed(0)}] Z [${minZ.toFixed(0)}, ${maxZ.toFixed(0)}]`)
console.log(`Size: ${W.toFixed(0)} x ${H.toFixed(0)} meters`)

// ── Helpers ─────────────────────────────────────────────────────────────
function polyD(coords) {
  return coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.z.toFixed(1)}`).join(' ') + ' Z'
}
function lineD(coords) {
  return coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.z.toFixed(1)}`).join(' ')
}

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

// Skip features with no coords inside (or near) the viewport
function inBounds(coords) {
  for (const c of coords) {
    if (c.x >= minX && c.x <= maxX && c.z >= minZ && c.z <= maxZ) return true
  }
  return false
}

// ── Sutherland-Hodgman polygon clipping against the viewport rect ───────
function clipPolygon(coords) {
  let pts = coords.map(c => [c.x, c.z])

  const edges = [
    (p) => p[0] >= minX, // left
    (p) => p[0] <= maxX, // right
    (p) => p[1] >= minZ, // top
    (p) => p[1] <= maxZ, // bottom
  ]
  const intersectors = [
    (a, b) => { const t = (minX - a[0]) / (b[0] - a[0]); return [minX, a[1] + t * (b[1] - a[1])] },
    (a, b) => { const t = (maxX - a[0]) / (b[0] - a[0]); return [maxX, a[1] + t * (b[1] - a[1])] },
    (a, b) => { const t = (minZ - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), minZ] },
    (a, b) => { const t = (maxZ - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), maxZ] },
  ]

  for (let e = 0; e < 4; e++) {
    if (pts.length === 0) return []
    const inside = edges[e]
    const intersect = intersectors[e]
    const out = []
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i]
      const prev = pts[(i + pts.length - 1) % pts.length]
      const curIn = inside(cur)
      const prevIn = inside(prev)
      if (prevIn && curIn) out.push(cur)
      else if (prevIn && !curIn) out.push(intersect(prev, cur))
      else if (!prevIn && curIn) { out.push(intersect(prev, cur)); out.push(cur) }
    }
    pts = out
  }
  return pts.map(([x, z]) => ({ x, z }))
}

// ── Cohen-Sutherland line clipping — returns array of clipped segments ──
function clipLine(coords) {
  const INSIDE = 0, LEFT = 1, RIGHT = 2, BOTTOM = 4, TOP = 8
  function code(x, z) {
    let c = INSIDE
    if (x < minX) c |= LEFT
    else if (x > maxX) c |= RIGHT
    if (z < minZ) c |= TOP
    else if (z > maxZ) c |= BOTTOM
    return c
  }

  function clipSeg(x0, z0, x1, z1) {
    let c0 = code(x0, z0), c1 = code(x1, z1)
    while (true) {
      if (!(c0 | c1)) return [x0, z0, x1, z1]
      if (c0 & c1) return null
      const cOut = c0 || c1
      let x, z
      if (cOut & TOP)        { x = x0 + (x1 - x0) * (minZ - z0) / (z1 - z0); z = minZ }
      else if (cOut & BOTTOM) { x = x0 + (x1 - x0) * (maxZ - z0) / (z1 - z0); z = maxZ }
      else if (cOut & RIGHT)  { z = z0 + (z1 - z0) * (maxX - x0) / (x1 - x0); x = maxX }
      else if (cOut & LEFT)   { z = z0 + (z1 - z0) * (minX - x0) / (x1 - x0); x = minX }
      if (cOut === c0) { x0 = x; z0 = z; c0 = code(x0, z0) }
      else { x1 = x; z1 = z; c1 = code(x1, z1) }
    }
  }

  // Clip each segment, merge connected results into polylines
  const segments = []
  let current = null
  for (let i = 0; i < coords.length - 1; i++) {
    const r = clipSeg(coords[i].x, coords[i].z, coords[i + 1].x, coords[i + 1].z)
    if (r) {
      const [x0, z0, x1, z1] = r
      if (current && Math.abs(current[current.length - 1].x - x0) < 0.01 &&
          Math.abs(current[current.length - 1].z - z0) < 0.01) {
        current.push({ x: x1, z: z1 })
      } else {
        if (current) segments.push(current)
        current = [{ x: x0, z: z0 }, { x: x1, z: z1 }]
      }
    } else {
      if (current) { segments.push(current); current = null }
    }
  }
  if (current) segments.push(current)
  return segments
}

// ── Road width lookup ───────────────────────────────────────────────────
const ROAD_WIDTHS = {
  motorway: 14, motorway_link: 10, trunk: 14, trunk_link: 10,
  primary: 12, primary_link: 10, secondary: 10, secondary_link: 8,
  tertiary: 8, tertiary_link: 7, residential: 7, unclassified: 7,
  service: 5, living_street: 6, pedestrian: 4,
  footway: 2, path: 1.5, cycleway: 2, steps: 2, track: 3,
}

// ── Colors ──────────────────────────────────────────────────────────────
const COLORS = {
  road: '#ffffff',
  footway: '#cccccc',
  grass: '#a8d5a0',
  residential_land: '#e8e0d8',
  commercial_land: '#ddd0c0',
  religious_land: '#d8d0e0',
  retail_land: '#e0d0c0',
  construction_land: '#d0c890',
  garden: '#b0d8a0',
  pool: '#88c8e8',
  playground: '#d8c888',
  pitch: '#a0c888',
  park: '#90c880',
  parking: '#d0ccc0',
  fence: '#886644',
  wall: '#888888',
  hedge: '#669944',
  retaining_wall: '#777777',
  water: '#88b8e0',
  scrub: '#90b870',
  wood: '#70a060',
  bridge: '#aaaaaa',
}

// ── Classify highways into layers ───────────────────────────────────────
const PRIMARY_TYPES = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link'])
const RESIDENTIAL_TYPES = new Set(['tertiary', 'tertiary_link', 'residential', 'unclassified', 'living_street'])
const FOOT_TYPES = new Set(['footway', 'path', 'cycleway', 'steps', 'pedestrian', 'track'])

// ── Build layers ────────────────────────────────────────────────────────
const layers = {
  'landuse': [],
  'natural': [],
  'leisure': [],
  'parking': [],
  'roads-primary': [],
  'roads-residential': [],
  'roads-service': [],
  'footways': [],
  'barriers': [],
  'other': [],
}

// Helper: emit clipped line segments for a feature
function emitLine(coords, layer, attrs) {
  const segs = clipLine(coords)
  for (const seg of segs) {
    layer.push(`<path d="${lineD(seg)}" ${attrs}</path>`)
  }
}

// Helper: emit clipped polygon for a feature
function emitPoly(coords, layer, attrs) {
  const clipped = clipPolygon(coords)
  if (clipped.length >= 3) {
    layer.push(`<path d="${polyD(clipped)}" ${attrs}</path>`)
  }
}

const highways = ground.features.highway || []
for (const f of highways) {
  if (!inBounds(f.coords)) continue
  const hw = f.tags.highway
  const name = f.tags.name || ''
  const svc = f.tags.service || ''
  const w = ROAD_WIDTHS[hw] || 5
  const title = esc(name || `${hw} ${svc}`.trim())

  if (PRIMARY_TYPES.has(hw)) {
    emitLine(f.coords, layers['roads-primary'],
      `stroke="${COLORS.road}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" fill="none"><title>${title}</title>`)
  } else if (RESIDENTIAL_TYPES.has(hw)) {
    emitLine(f.coords, layers['roads-residential'],
      `stroke="${COLORS.road}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" fill="none"><title>${title}</title>`)
  } else if (FOOT_TYPES.has(hw)) {
    emitLine(f.coords, layers['footways'],
      `stroke="${COLORS.footway}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" fill="none"${hw === 'steps' ? ' stroke-dasharray="1.5 1.5"' : ''}><title>${title} (${hw})</title>`)
  } else {
    emitLine(f.coords, layers['roads-service'],
      `stroke="${COLORS.road}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.8"><title>${title} (${hw}${svc ? '/' + svc : ''})</title>`)
  }
}

// Landuse
for (const f of (ground.features.landuse || [])) {
  if (!f.is_closed || !inBounds(f.coords)) continue
  const lu = f.tags.landuse
  const color = COLORS[lu + '_land'] || COLORS[lu] || '#d0d0c0'
  const title = esc(f.tags.name || lu)
  emitPoly(f.coords, layers['landuse'],
    `fill="${color}" stroke="none" opacity="0.6"><title>${title}</title>`)
}

// Leisure
for (const f of (ground.features.leisure || [])) {
  if (!inBounds(f.coords)) continue
  const ls = f.tags.leisure
  const color = COLORS[ls] || COLORS.garden
  const title = esc(f.tags.name || ls)
  if (f.is_closed) {
    emitPoly(f.coords, layers['leisure'],
      `fill="${color}" stroke="${color}" stroke-width="0.3" opacity="0.7"><title>${title}</title>`)
  } else {
    emitLine(f.coords, layers['leisure'],
      `stroke="${color}" stroke-width="1.5" fill="none"><title>${title}</title>`)
  }
}

// Natural
for (const f of (ground.features.natural || [])) {
  if (!inBounds(f.coords)) continue
  const nat = f.tags.natural
  const color = COLORS[nat] || '#90b870'
  const title = esc(f.tags.name || nat)
  if (f.is_closed) {
    emitPoly(f.coords, layers['natural'],
      `fill="${color}" stroke="none" opacity="0.5"><title>${title}</title>`)
  } else {
    emitLine(f.coords, layers['natural'],
      `stroke="${color}" stroke-width="1" fill="none"><title>${title}</title>`)
  }
}

// Parking (amenity)
for (const f of (ground.features.amenity || [])) {
  if (!f.is_closed || !inBounds(f.coords)) continue
  const title = esc(f.tags.name || f.tags.amenity)
  emitPoly(f.coords, layers['parking'],
    `fill="${COLORS.parking}" stroke="none" opacity="0.5"><title>${title}</title>`)
}

// Barriers
for (const f of (ground.features.barrier || [])) {
  if (!inBounds(f.coords)) continue
  const bt = f.tags.barrier
  const color = COLORS[bt] || COLORS.fence
  const w = (bt === 'wall' || bt === 'retaining_wall') ? 1.2 : bt === 'hedge' ? 1.5 : 0.6
  const title = esc(f.tags.name || bt)
  if (f.is_closed) {
    emitPoly(f.coords, layers['barriers'],
      `stroke="${color}" stroke-width="${w}" fill="none" opacity="0.5"><title>${title}</title>`)
  } else {
    emitLine(f.coords, layers['barriers'],
      `stroke="${color}" stroke-width="${w}" fill="none" opacity="0.5"><title>${title}</title>`)
  }
}

// Man-made / other
for (const f of (ground.features.man_made || [])) {
  if (!inBounds(f.coords)) continue
  const title = esc(f.tags.name || f.tags.man_made)
  if (f.is_closed) {
    emitPoly(f.coords, layers['other'],
      `stroke="${COLORS.bridge}" stroke-width="2" fill="none" opacity="0.4"><title>${title}</title>`)
  } else {
    emitLine(f.coords, layers['other'],
      `stroke="${COLORS.bridge}" stroke-width="2" fill="none" opacity="0.4"><title>${title}</title>`)
  }
}

// ── Assemble SVG ────────────────────────────────────────────────────────
const svg = []
svg.push(`<?xml version="1.0" encoding="UTF-8"?>`)
svg.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX.toFixed(1)} ${minZ.toFixed(1)} ${W.toFixed(1)} ${H.toFixed(1)}" width="${W.toFixed(0)}" height="${H.toFixed(0)}">`)
svg.push(`<rect x="${minX.toFixed(1)}" y="${minZ.toFixed(1)}" width="${W.toFixed(1)}" height="${H.toFixed(1)}" fill="#1a1a20"/>`)

for (const [name, paths] of Object.entries(layers)) {
  if (paths.length === 0) continue
  svg.push(`<g id="${name}">`)
  svg.push(...paths)
  svg.push(`</g>`)
  console.log(`  Layer "${name}": ${paths.length} elements`)
}

svg.push('</svg>')

mkdirSync('assets', { recursive: true })
const outPath = 'assets/osm-ground.svg'
writeFileSync(outPath, svg.join('\n'))
const sizeKB = Buffer.byteLength(svg.join('\n')) / 1024
console.log(`\nWritten ${outPath} (${sizeKB.toFixed(0)} KB)`)
