#!/usr/bin/env node
/**
 * process-svg-ground.mjs — Parse Illustrator SVG into ground_layers.json
 *
 * Reads assets/streets.svg, parses path geometry + stroke widths from CSS,
 * flattens Bézier curves, transforms SVG coords → local meter coordinates,
 * outputs src/data/ground_layers.json for the 3D renderer.
 *
 * Coordinate mapping:
 *   Original export (debug-streets.svg):
 *     viewBox="-497.7 -732.5 1308.55 1120.5" width="2617" height="2241"
 *   Illustrator re-export (assets/streets.svg):
 *     viewBox="0 0 2617 2241"
 *
 *   localX = svgX * (1308.55 / 2617) + (-497.7)
 *   localZ = svgY * (1120.5 / 2241) + (-732.5)
 *   widthMeters = strokeWidthPx * (1308.55 / 2617)
 */

import { readFileSync, writeFileSync } from 'fs'

// ── Coordinate transform constants ──────────────────────────────────────
const ORIG_VB_X = -497.7
const ORIG_VB_Y = -732.5
const ORIG_VB_W = 1308.55
const ORIG_VB_H = 1152.7
const SVG_W = 1309
const SVG_H = 1152.7

const SCALE_X = ORIG_VB_W / SVG_W   // ≈ 0.5
const SCALE_Y = ORIG_VB_H / SVG_H   // ≈ 0.5

function svgToLocal(svgX, svgY) {
  return [
    svgX * SCALE_X + ORIG_VB_X,
    svgY * SCALE_Y + ORIG_VB_Y,
  ]
}

function svgWidthToMeters(strokeWidthPx) {
  return strokeWidthPx * SCALE_X
}

// ── CSS class → stroke-width parser ─────────────────────────────────────

function parseStyleBlock(styleText) {
  const classWidths = {}
  const classFills = {}
  const classStrokes = {}
  const classNoFill = new Set()  // classes with explicit fill: none

  // Multi-selector rules: ".st1, .st2, .st3 { ... }"
  const compoundRe = /((?:\.\w+\s*,\s*)*\.\w+)\s*\{([^}]*)\}/g
  let match
  while ((match = compoundRe.exec(styleText)) !== null) {
    const selectors = match[1].split(',').map(s => s.trim().replace('.', ''))
    const body = match[2]

    const widthMatch = body.match(/stroke-width:\s*([\d.]+)px/)
    if (widthMatch) {
      for (const cls of selectors) classWidths[cls] = parseFloat(widthMatch[1])
    }

    const strokeMatch = body.match(/stroke:\s*(#[0-9a-fA-F]{3,6})/)
    if (strokeMatch) {
      for (const cls of selectors) classStrokes[cls] = strokeMatch[1]
    }

    const fillMatch = body.match(/fill:\s*([^;}\s]+)/)
    if (fillMatch) {
      if (fillMatch[1] === 'none') {
        for (const cls of selectors) classNoFill.add(cls)
      } else {
        for (const cls of selectors) classFills[cls] = fillMatch[1]
      }
    }

    if (/display:\s*none/.test(body)) {
      for (const cls of selectors) classFills[cls] = '__hidden__'
    }
  }

  return { classWidths, classFills, classStrokes, classNoFill }
}

// ── SVG path d-attribute tokenizer ──────────────────────────────────────

function tokenizePathD(d) {
  const tokens = []
  const re = /([MmLlCcSsQqTtAaHhVvZz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g
  let m
  while ((m = re.exec(d)) !== null) {
    if (m[1]) tokens.push({ type: 'cmd', value: m[1] })
    else tokens.push({ type: 'num', value: parseFloat(m[2]) })
  }
  return tokens
}

// ── Bézier flattening (De Casteljau) ────────────────────────────────────

const FLATNESS = 2.0  // tolerance in SVG units (≈ meters at 1:1 scale)

function flattenQuadratic(result, x0, y0, cx, cy, x1, y1, depth = 0) {
  if (depth > 12) { result.push([x1, y1]); return }
  const dx = x1 - x0, dy = y1 - y0
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 0.01) { result.push([x1, y1]); return }
  const d = Math.abs((cx - x0) * dy - (cy - y0) * dx) / len
  if (d <= FLATNESS) { result.push([x1, y1]); return }
  const mx01 = (x0 + cx) / 2, my01 = (y0 + cy) / 2
  const mx12 = (cx + x1) / 2, my12 = (cy + y1) / 2
  const mx = (mx01 + mx12) / 2, my = (my01 + my12) / 2
  flattenQuadratic(result, x0, y0, mx01, my01, mx, my, depth + 1)
  flattenQuadratic(result, mx, my, mx12, my12, x1, y1, depth + 1)
}

function flattenCubic(result, x0, y0, x1, y1, x2, y2, x3, y3, depth = 0) {
  if (depth > 12) { result.push([x3, y3]); return }
  const dx = x3 - x0, dy = y3 - y0
  const len = Math.sqrt(dx * dx + dy * dy)

  if (len < 0.01) {
    result.push([x3, y3])
    return
  }

  const d1 = Math.abs((x1 - x0) * dy - (y1 - y0) * dx) / len
  const d2 = Math.abs((x2 - x0) * dy - (y2 - y0) * dx) / len

  if (d1 + d2 <= FLATNESS) {
    result.push([x3, y3])
    return
  }

  const mx01 = (x0 + x1) / 2, my01 = (y0 + y1) / 2
  const mx12 = (x1 + x2) / 2, my12 = (y1 + y2) / 2
  const mx23 = (x2 + x3) / 2, my23 = (y2 + y3) / 2
  const mx012 = (mx01 + mx12) / 2, my012 = (my01 + my12) / 2
  const mx123 = (mx12 + mx23) / 2, my123 = (my12 + my23) / 2
  const mx0123 = (mx012 + mx123) / 2, my0123 = (my012 + my123) / 2

  flattenCubic(result, x0, y0, mx01, my01, mx012, my012, mx0123, my0123, depth + 1)
  flattenCubic(result, mx0123, my0123, mx123, my123, mx23, my23, x3, y3, depth + 1)
}

// ── SVG path parser ─────────────────────────────────────────────────────

function parsePath(d) {
  const tokens = tokenizePathD(d)
  const subpaths = []
  let currentPath = []
  let x = 0, y = 0
  let startX = 0, startY = 0
  let lastCx = 0, lastCy = 0  // last control point for S/s
  let lastCmd = ''

  let i = 0
  while (i < tokens.length) {
    let cmd
    if (tokens[i].type === 'cmd') {
      cmd = tokens[i].value
      i++
    } else {
      // Implicit repeat
      cmd = lastCmd
      if (cmd === 'M') cmd = 'L'
      if (cmd === 'm') cmd = 'l'
    }

    switch (cmd) {
      case 'M': {
        if (currentPath.length > 1) subpaths.push({ points: currentPath, closed: false })
        x = tokens[i].value; y = tokens[i + 1].value; i += 2
        startX = x; startY = y
        currentPath = [[x, y]]
        lastCx = x; lastCy = y
        break
      }
      case 'm': {
        if (currentPath.length > 1) subpaths.push({ points: currentPath, closed: false })
        x += tokens[i].value; y += tokens[i + 1].value; i += 2
        startX = x; startY = y
        currentPath = [[x, y]]
        lastCx = x; lastCy = y
        break
      }
      case 'L': {
        x = tokens[i].value; y = tokens[i + 1].value; i += 2
        currentPath.push([x, y])
        lastCx = x; lastCy = y
        break
      }
      case 'l': {
        x += tokens[i].value; y += tokens[i + 1].value; i += 2
        currentPath.push([x, y])
        lastCx = x; lastCy = y
        break
      }
      case 'H': {
        x = tokens[i].value; i++
        currentPath.push([x, y])
        lastCx = x; lastCy = y
        break
      }
      case 'h': {
        x += tokens[i].value; i++
        currentPath.push([x, y])
        lastCx = x; lastCy = y
        break
      }
      case 'V': {
        y = tokens[i].value; i++
        currentPath.push([x, y])
        lastCx = x; lastCy = y
        break
      }
      case 'v': {
        y += tokens[i].value; i++
        currentPath.push([x, y])
        lastCx = x; lastCy = y
        break
      }
      case 'C': {
        const x1 = tokens[i].value, y1 = tokens[i + 1].value
        const x2 = tokens[i + 2].value, y2 = tokens[i + 3].value
        const ex = tokens[i + 4].value, ey = tokens[i + 5].value
        i += 6
        flattenCubic(currentPath, x, y, x1, y1, x2, y2, ex, ey)
        lastCx = x2; lastCy = y2
        x = ex; y = ey
        break
      }
      case 'c': {
        const dx1 = tokens[i].value, dy1 = tokens[i + 1].value
        const dx2 = tokens[i + 2].value, dy2 = tokens[i + 3].value
        const dex = tokens[i + 4].value, dey = tokens[i + 5].value
        i += 6
        const x1 = x + dx1, y1 = y + dy1
        const x2 = x + dx2, y2 = y + dy2
        const ex = x + dex, ey = y + dey
        flattenCubic(currentPath, x, y, x1, y1, x2, y2, ex, ey)
        lastCx = x2; lastCy = y2
        x = ex; y = ey
        break
      }
      case 'S': {
        const cx1 = 2 * x - lastCx, cy1 = 2 * y - lastCy
        const x2 = tokens[i].value, y2 = tokens[i + 1].value
        const ex = tokens[i + 2].value, ey = tokens[i + 3].value
        i += 4
        flattenCubic(currentPath, x, y, cx1, cy1, x2, y2, ex, ey)
        lastCx = x2; lastCy = y2
        x = ex; y = ey
        break
      }
      case 's': {
        const cx1 = 2 * x - lastCx, cy1 = 2 * y - lastCy
        const dx2 = tokens[i].value, dy2 = tokens[i + 1].value
        const dex = tokens[i + 2].value, dey = tokens[i + 3].value
        i += 4
        const x2 = x + dx2, y2 = y + dy2
        const ex = x + dex, ey = y + dey
        flattenCubic(currentPath, x, y, cx1, cy1, x2, y2, ex, ey)
        lastCx = x2; lastCy = y2
        x = ex; y = ey
        break
      }
      case 'Q': {
        const cx = tokens[i].value, cy = tokens[i + 1].value
        const ex = tokens[i + 2].value, ey = tokens[i + 3].value
        i += 4
        flattenQuadratic(currentPath, x, y, cx, cy, ex, ey)
        lastCx = cx; lastCy = cy
        x = ex; y = ey
        break
      }
      case 'q': {
        const dcx = tokens[i].value, dcy = tokens[i + 1].value
        const dex = tokens[i + 2].value, dey = tokens[i + 3].value
        i += 4
        const cx = x + dcx, cy = y + dcy
        const ex = x + dex, ey = y + dey
        flattenQuadratic(currentPath, x, y, cx, cy, ex, ey)
        lastCx = cx; lastCy = cy
        x = ex; y = ey
        break
      }
      case 'T': {
        if (i + 1 >= tokens.length || tokens[i].type !== 'num') { lastCmd = ''; break }
        const cx = 2 * x - lastCx, cy = 2 * y - lastCy
        const ex = tokens[i].value, ey = tokens[i + 1].value
        i += 2
        flattenQuadratic(currentPath, x, y, cx, cy, ex, ey)
        lastCx = cx; lastCy = cy
        x = ex; y = ey
        break
      }
      case 't': {
        if (i + 1 >= tokens.length || tokens[i].type !== 'num') { lastCmd = ''; break }
        const cx = 2 * x - lastCx, cy = 2 * y - lastCy
        const ex = x + tokens[i].value, ey = y + tokens[i + 1].value
        i += 2
        flattenQuadratic(currentPath, x, y, cx, cy, ex, ey)
        lastCx = cx; lastCy = cy
        x = ex; y = ey
        break
      }
      case 'Z':
      case 'z': {
        if (currentPath.length > 0) {
          currentPath.push([startX, startY])
          subpaths.push({ points: currentPath, closed: true })
        }
        currentPath = []
        x = startX; y = startY
        lastCx = x; lastCy = y
        break
      }
      default:
        console.warn(`  Unsupported SVG command: ${cmd}`)
        break
    }

    lastCmd = cmd
  }

  if (currentPath.length > 1) {
    subpaths.push({ points: currentPath, closed: false })
  }

  return subpaths
}

// ── Extract paths and classes from SVG ──────────────────────────────────

function extractFromSvg(svgText) {
  // Extract <style> content
  const styleMatch = svgText.match(/<style[^>]*>([\s\S]*?)<\/style>/)
  const styleText = styleMatch ? styleMatch[1] : ''
  const { classWidths, classFills, classStrokes, classNoFill } = parseStyleBlock(styleText)

  console.log('Parsed CSS classes:')
  console.log('  Stroke widths:', classWidths)
  console.log('  Stroke colors:', classStrokes)
  console.log('  Fills:', classFills)
  console.log('  No-fill classes:', [...classNoFill])

  // Extract all <path> elements
  const pathRe = /<path\s+([^>]*?)\/>/g
  const paths = []
  let pm
  while ((pm = pathRe.exec(svgText)) !== null) {
    const attrs = pm[1]

    const classMatch = attrs.match(/class="([^"]*)"/)
    const dMatch = attrs.match(/d="([^"]*)"/)
    if (!dMatch) continue

    const className = classMatch ? classMatch[1] : ''
    const d = dMatch[1]

    // Skip hidden elements
    if (classFills[className] === '__hidden__') continue

    const strokeWidth = classWidths[className] || 0
    const strokeColor = classStrokes[className] || null
    const fillColor = classFills[className] || null
    const hasFill = fillColor && fillColor !== '__hidden__'
    const hasExplicitNoFill = classNoFill.has(className)

    // Determine if this path should be treated as filled:
    // - Has explicit fill color in CSS → filled
    // - No class at all → SVG default fill is black
    // - Has class with fill:none → not filled (stroke only)
    const isFilled = hasFill || (!className && !hasExplicitNoFill)
    const resolvedFill = hasFill ? fillColor : (!className ? '#000' : null)

    paths.push({ className, d, strokeWidth, strokeColor, isFilled, fillColor: resolvedFill })
  }

  return paths
}

// ── Main ────────────────────────────────────────────────────────────────

const svgText = readFileSync('assets/lafayette-square.svg', 'utf-8')
const rawPaths = extractFromSvg(svgText)

console.log(`\nFound ${rawPaths.length} paths in SVG`)

const streets = []
const blocks = []

let pathIdx = 0
for (const raw of rawPaths) {
  pathIdx++
  if (pathIdx % 50 === 0) process.stderr.write(`  Processing path ${pathIdx}/${rawPaths.length} (streets=${streets.length} blocks=${blocks.length})...\n`)
  // Skip paths with extremely long d-strings (likely complex compound paths)
  if (raw.d.length > 50000) {
    process.stderr.write(`  Skipping path ${pathIdx} (${raw.d.length} chars, class=${raw.className})\n`)
    continue
  }
  const t0 = Date.now()
  const subpaths = parsePath(raw.d)
  const elapsed = Date.now() - t0
  if (elapsed > 500) process.stderr.write(`  Path ${pathIdx} took ${elapsed}ms (${raw.d.length} chars, class=${raw.className})\n`)

  for (const sp of subpaths) {
    // Transform SVG coords → local meters
    const localPoints = sp.points.map(([sx, sy]) => {
      const [lx, lz] = svgToLocal(sx, sy)
      return [Math.round(lx * 100) / 100, Math.round(lz * 100) / 100]
    })

    if (raw.isFilled && sp.closed) {
      // Filled closed path → block polygon
      blocks.push({ polygon: localPoints, color: raw.fillColor || '#000' })
    } else if (raw.strokeWidth > 0 && localPoints.length >= 2) {
      // Stroked path → street centerline + width
      const widthMeters = Math.round(svgWidthToMeters(raw.strokeWidth) * 100) / 100
      streets.push({
        points: localPoints,
        width: widthMeters,
        color: raw.strokeColor || '#000',
        class: raw.className,
      })
    }
  }
}

console.log(`\nOutput:`)
console.log(`  Streets: ${streets.length} segments`)
console.log(`  Blocks:  ${blocks.length} filled polygons`)

// Stats
if (streets.length > 0) {
  const widths = [...new Set(streets.map(s => s.width))].sort((a, b) => a - b)
  console.log(`  Street widths: ${widths.join(', ')} meters`)
  const totalPts = streets.reduce((sum, s) => sum + s.points.length, 0)
  console.log(`  Total street points: ${totalPts}`)
}

// ── Write output ────────────────────────────────────────────────────────

const output = {
  _meta: {
    source: 'assets/streets.svg',
    generated: new Date().toISOString(),
    transform: {
      svgViewBox: '0 0 2617 2241',
      origViewBox: '-497.7 -732.5 1308.55 1120.5',
      scaleX: SCALE_X,
      scaleY: SCALE_Y,
      offsetX: ORIG_VB_X,
      offsetY: ORIG_VB_Y,
    },
  },
  streets,
  blocks,
  sidewalks: [],
  paths: [],
  service: [],
}

writeFileSync('src/data/ground_layers.json', JSON.stringify(output, null, 2))
console.log(`\nWritten src/data/ground_layers.json`)
