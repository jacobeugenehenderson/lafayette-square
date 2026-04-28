/**
 * bake-svg.js — first pass at the cartograph publish step.
 *
 * Reads ribbons.json (the procedural pipeline's output) and emits a single
 * pure SVG file: the ground plane the runtime CSS3DRenderer consumes
 * (replacement for the hand-drawn public/lafayette-square.svg).
 *
 * Spotlessness rule:
 *   - SVG 1.1, no comments, no metadata, no Inkscape/Illustrator residue.
 *   - Paths grouped <g id="material"> per material; explicit fill="#hex".
 *   - Same input → same output, byte-for-byte. Sort everything before emit.
 *   - File is reviewable, diffable, parseable by any standard renderer.
 *
 * What this pass DOES emit:
 *   - Block faces (land-use fills) — clipped against the ribbon footprint.
 *   - Per-chain ribbon bands: asphalt, curb, treelawn, sidewalk, lawn,
 *     highway. Per side, with caps where authored.
 *   - Path ribbons (alleys / footways / etc.) as pavement-only.
 *
 * What this pass does NOT YET emit (follow-on):
 *   - Stripes / edge lines / bike lanes (overlay paint).
 *   - Corner plugs (intersection asphalt + sidewalk + curb arcs).
 *   - Emergent median polygons.
 *   - Labels.
 *   - The radial-fade silhouette (will live in CSS or a runtime mask).
 *
 * Coordinate space: ribbons.json uses [x, z] in meters with origin at the
 * neighborhood center. SVG y+ is down, Three.js z+ is "south" — same
 * direction, no flip. 1 SVG unit = 1 meter.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  sideToStripes,
  CURB_WIDTH,
  BAND_COLORS,
} from '../src/cartograph/streetProfiles.js'
import { BAND_TO_LAYER } from '../src/cartograph/m3Colors.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const LAND_USE_COLORS = {
  residential:        '#5A8A3A',
  commercial:         '#A87D3E',
  vacant:             '#7A6E5C',
  'vacant-commercial':'#9A7E54',
  parking:            '#7E7A72',
  institutional:      '#7A6E96',
  recreation:         '#5E9E5E',
  industrial:         '#7E6648',
  park:               '#5E8A3A',
  island:             '#5E8A3A',
  unknown:            '#666666',
}

// ── Geometry helpers ────────────────────────────────────────────────
// Mirror StreetRibbons.computePerps. Per-vertex bisector-perpendicular,
// CCW-ish (left of direction-of-travel = -1 * perp; convention preserved
// from runtime).
function computePerps(pts) {
  const n = pts.length
  return pts.map((_, i) => {
    let nx = 0, nz = 0
    if (i < n - 1) {
      const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1]
      const l = Math.hypot(dx, dz)
      if (l > 1e-9) { nx -= dz / l; nz += dx / l }
    }
    if (i > 0) {
      const dx = pts[i][0] - pts[i - 1][0], dz = pts[i][1] - pts[i - 1][1]
      const l = Math.hypot(dx, dz)
      if (l > 1e-9) { nx -= dz / l; nz += dx / l }
    }
    const l = Math.hypot(nx, nz)
    if (l < 1e-9) return [0, 1]
    return [nx / l, nz / l]
  })
}

function offsetPolyline(pts, perps, side, w) {
  return pts.map((p, i) => [p[0] + side * perps[i][0] * w, p[1] + side * perps[i][1] * w])
}

// One half-ring (= one side of one stripe band): build a closed polygon
// by walking the inner offset forward and the outer offset backward, then
// closing back to the inner-start. Returns an array of [x, z] points
// (no SVG, just geometry — caller serializes).
function bandRing(pts, perps, side, innerR, outerR) {
  const inner = offsetPolyline(pts, perps, side, innerR)
  const outer = offsetPolyline(pts, perps, side, outerR)
  const ring = []
  for (const p of inner) ring.push(p)
  for (let i = outer.length - 1; i >= 0; i--) ring.push(outer[i])
  return ring
}

// Round endcap (cul-de-sac): quarter-disk on one side. innerR is normally
// the inboard edge (e.g. medianHW); for a fill band starting at zero it's 0.
function roundCapRing(endpoint, tangent, perp, side, innerR, outerR, segments = 12) {
  const ring = []
  // inner arc from tangent direction to side*perp direction
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * (Math.PI / 2)
    const dx = Math.cos(a) * tangent[0] + Math.sin(a) * side * perp[0]
    const dz = Math.cos(a) * tangent[1] + Math.sin(a) * side * perp[1]
    ring.push([endpoint[0] + dx * innerR, endpoint[1] + dz * innerR])
  }
  // outer arc back
  for (let i = segments; i >= 0; i--) {
    const a = (i / segments) * (Math.PI / 2)
    const dx = Math.cos(a) * tangent[0] + Math.sin(a) * side * perp[0]
    const dz = Math.cos(a) * tangent[1] + Math.sin(a) * side * perp[1]
    ring.push([endpoint[0] + dx * outerR, endpoint[1] + dz * outerR])
  }
  return ring
}

// Number formatter — fixed decimals for byte-for-byte determinism.
const fmt = (n) => {
  if (!Number.isFinite(n)) return '0'
  // 2 decimals = ~1cm precision. Tighter than this just inflates the file.
  return Number(n).toFixed(2).replace(/\.?0+$/, '')
}

// Build an SVG path `d` string from one or more rings. Each ring becomes
// one subpath (M…Z). Concatenating same-fill rings into a single <path>
// is what keeps the file small.
function ringsToPathD(rings) {
  const parts = []
  for (const ring of rings) {
    if (!ring || ring.length < 3) continue
    let d = `M${fmt(ring[0][0])},${fmt(ring[0][1])}`
    for (let i = 1; i < ring.length; i++) {
      d += `L${fmt(ring[i][0])},${fmt(ring[i][1])}`
    }
    d += 'Z'
    parts.push(d)
  }
  return parts.join('')
}

// ── Bake ─────────────────────────────────────────────────────────────
// `ribbons` is the ribbons.json structure. Returns a map of
// material → array of rings, plus a map of land-use → array of rings.
// Caller serializes to SVG.
export function buildPaths(ribbons) {
  const byMaterial = new Map()  // material → rings
  const byFaceUse = new Map()   // land-use → rings

  const pushMat = (mat, ring) => {
    if (!ring || ring.length < 3) return
    if (!byMaterial.has(mat)) byMaterial.set(mat, [])
    byMaterial.get(mat).push(ring)
  }
  const pushFace = (use, ring) => {
    if (!ring || ring.length < 3) return
    if (!byFaceUse.has(use)) byFaceUse.set(use, [])
    byFaceUse.get(use).push(ring)
  }

  // Face fills (land-use). Use the ring as-authored from derive.js.
  // (Runtime currently re-clips against the ribbon silhouette; we'll
  // bring that into the bake in the next pass — for now faces are the
  // unclipped polygon, which is fine: ribbon paint draws over them.)
  const faces = (ribbons.faces || []).slice().sort((a, b) => {
    // Deterministic ordering: by use, then by ring's first vertex.
    if (a.use !== b.use) return a.use < b.use ? -1 : 1
    const ax = a.ring?.[0]?.[0] ?? 0, az = a.ring?.[0]?.[1] ?? 0
    const bx = b.ring?.[0]?.[0] ?? 0, bz = b.ring?.[0]?.[1] ?? 0
    if (ax !== bx) return ax - bx
    return az - bz
  })
  for (const f of faces) {
    pushFace(f.use || 'unknown', f.ring)
  }

  // Streets — per side, per stripe band, emit a polygon ring.
  // Sort by skelId for deterministic output.
  const streets = (ribbons.streets || []).slice().sort((a, b) => {
    const ak = a.skelId || a.name || ''
    const bk = b.skelId || b.name || ''
    return ak < bk ? -1 : ak > bk ? 1 : 0
  })
  for (const st of streets) {
    if (!st.points || st.points.length < 2) continue
    if (st.disabled) continue
    const measure = st.measure
    if (!measure?.left || !measure?.right) continue
    const pts = st.points
    const perps = computePerps(pts)
    const caps = st.capEnds || { start: null, end: null }
    for (const [side, sideMeasure] of [[-1, measure.left], [+1, measure.right]]) {
      const stripes = sideToStripes(sideMeasure)
      for (const stripe of stripes) {
        const ring = bandRing(pts, perps, side, stripe.innerR, stripe.outerR)
        pushMat(stripe.material, ring)
      }
      // Round endcaps (per-side quarter-disks). Outer extent only —
      // captured by sweeping the entire side stack from medianHW (=0
      // when no median) out to the last stripe's outer edge.
      const totalOuter = stripes.length ? stripes[stripes.length - 1].outerR : 0
      const totalInner = 0
      // Approximate cap material with the outermost stripe's material.
      // Sufficient for first pass; runtime corner-plug nuance lands later.
      const capMat = stripes.length ? stripes[stripes.length - 1].material : 'asphalt'
      if (caps.start === 'round' && pts.length >= 2) {
        const ep = pts[0]
        const tdx = ep[0] - pts[1][0], tdz = ep[1] - pts[1][1]
        const tl = Math.hypot(tdx, tdz) || 1
        const tan = [tdx / tl, tdz / tl]
        pushMat(capMat, roundCapRing(ep, tan, perps[0], side, totalInner, totalOuter))
      }
      if (caps.end === 'round' && pts.length >= 2) {
        const i = pts.length - 1
        const ep = pts[i]
        const tdx = ep[0] - pts[i - 1][0], tdz = ep[1] - pts[i - 1][1]
        const tl = Math.hypot(tdx, tdz) || 1
        const tan = [tdx / tl, tdz / tl]
        pushMat(capMat, roundCapRing(ep, tan, perps[i], side, totalInner, totalOuter))
      }
    }
  }

  // Path ribbons (alleys, footways, cycleways, steps, paths) —
  // pavement-only single-material strips.
  const paths = (ribbons.paths || []).concat(ribbons.alleys || []).slice().sort((a, b) => {
    const ax = a.points?.[0]?.[0] ?? 0, bx = b.points?.[0]?.[0] ?? 0
    return ax - bx
  })
  for (const p of paths) {
    if (!p.points || p.points.length < 2) continue
    const hw = (p.pavedWidth || 3) / 2
    const perps = computePerps(p.points)
    // Two halves (one ring spanning both sides — symmetric strip).
    const left  = offsetPolyline(p.points, perps, -1, hw)
    const right = offsetPolyline(p.points, perps, +1, hw)
    const ring = []
    for (const pt of left) ring.push(pt)
    for (let i = right.length - 1; i >= 0; i--) ring.push(right[i])
    const mat = p.kind === 'alley' ? 'asphalt' : (p.kind || 'footway')
    pushMat(mat, ring)
  }

  return { byMaterial, byFaceUse }
}

// Resolve color for a material / face-use. Falls back through palettes.
function colorForMaterial(material, layerColors = {}) {
  // Designer panel keys colors by *layer* (e.g. 'street'), not by material
  // (e.g. 'asphalt'). Map via BAND_TO_LAYER first, then fall back to a
  // direct material-keyed lookup, then to the static BAND_COLORS defaults.
  const layerId = BAND_TO_LAYER[material]
  if (layerId && layerColors[layerId]) return layerColors[layerId]
  return layerColors[material] || BAND_COLORS[material] || '#666666'
}
function colorForFaceUse(use, luColors = {}) {
  return luColors[use] || LAND_USE_COLORS[use] || LAND_USE_COLORS.unknown
}

// Visibility check. Looks the layer up via BAND_TO_LAYER first (panel keys
// colors+visibility by layer, e.g. 'street' for material 'asphalt'); falls
// back to a direct material-keyed lookup. A layer that isn't in `layerVis`
// at all is treated as visible — matches the runtime convention where
// missing keys default to visible.
function isMaterialVisible(material, layerVis = {}) {
  const layerId = BAND_TO_LAYER[material]
  if (layerId && layerId in layerVis) return layerVis[layerId] !== false
  if (material in layerVis) return layerVis[material] !== false
  return true
}

export function emitSvg(ribbons, { layerColors, luColors, layerVis, viewBox } = {}) {
  const { byMaterial, byFaceUse } = buildPaths(ribbons)
  const vis = layerVis || {}

  // Stable, alphabetical ordering per layer for deterministic output.
  const matKeys = [...byMaterial.keys()].sort()
  const useKeys = [...byFaceUse.keys()].sort()

  const lines = []
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">`)

  // Faces first — they sit underneath ribbons. Land-use uses its own
  // visibility namespace via Designer panel ids (e.g. lu-* fills under a
  // 'lot' layer toggle). Today no luColors-side visibility key exists, so
  // faces are always emitted; if a future toggle lands the predicate below
  // is the single place to wire it.
  if (useKeys.length) {
    lines.push('<g id="land-use">')
    for (const use of useKeys) {
      const fill = colorForFaceUse(use, luColors)
      const d = ringsToPathD(byFaceUse.get(use))
      if (d) lines.push(`<path id="lu-${use}" fill="${fill}" d="${d}"/>`)
    }
    lines.push('</g>')
  }

  // Materials — paint order matters: lawn/treelawn under sidewalk under
  // curb under asphalt/highway, so the inner stripes overpaint the outer.
  // The natural ordering by material name happens to put 'asphalt' before
  // 'highway' before 'sidewalk', which is wrong. Pin a paint order.
  const PAINT_ORDER = [
    'lawn', 'treelawn', 'sidewalk', 'curb', 'asphalt', 'highway',
    'median', 'footway', 'cycleway', 'steps', 'path',
  ]
  const orderedMats = PAINT_ORDER.filter(m => byMaterial.has(m))
    .concat(matKeys.filter(m => !PAINT_ORDER.includes(m)))

  if (orderedMats.length) {
    lines.push('<g id="ribbons">')
    for (const mat of orderedMats) {
      // Honor the active Look's visibility — a Valentine's Look that hides
      // 'stripe' or 'curb' produces an SVG with no <path id="stripe"/>.
      // Looks vary styling, and visibility is styling.
      if (!isMaterialVisible(mat, vis)) continue
      const fill = colorForMaterial(mat, layerColors)
      const d = ringsToPathD(byMaterial.get(mat))
      if (d) lines.push(`<path id="${mat}" fill="${fill}" d="${d}"/>`)
    }
    lines.push('</g>')
  }

  lines.push('</svg>')
  return lines.join('\n') + '\n'
}

// ── Stats helper for the progress UI ────────────────────────────────
export function bakeStats(ribbons) {
  return {
    streets: (ribbons.streets || []).length,
    faces:   (ribbons.faces || []).length,
    paths:   (ribbons.paths || []).length + (ribbons.alleys || []).length,
  }
}

// ── CLI entrypoint ──────────────────────────────────────────────────
async function main() {
  // Parse --look=<id> (default to the project's 0-state). Each Look has its
  // own design.json (operator's material palette) and ground.svg (the bake
  // output). Geometry (ribbons.json) is shared across all Looks — Looks vary
  // *styling*, not shape.
  const lookId = (() => {
    for (const arg of process.argv.slice(2)) {
      const m = arg.match(/^--look=(.+)$/)
      if (m) return m[1]
    }
    return 'lafayette-square'
  })()

  const ribbonsPath  = join(ROOT, 'src', 'data', 'ribbons.json')
  const boundaryPath = join(__dirname, 'data', 'neighborhood_boundary.json')
  const lookDir      = join(ROOT, 'public', 'looks', lookId)
  const designPath   = join(lookDir, 'design.json')
  const outPath      = join(lookDir, 'ground.svg')

  if (!existsSync(lookDir)) mkdirSync(lookDir, { recursive: true })

  const ribbons  = JSON.parse(readFileSync(ribbonsPath, 'utf-8'))
  const boundary = JSON.parse(readFileSync(boundaryPath, 'utf-8'))
  const [cx, cz] = boundary.center || [0, 0]
  const R        = boundary.radius || 1000
  const viewBox  = `${cx - R} ${cz - R} ${R * 2} ${R * 2}`

  // Read this Look's design.json. Empty object on first bake (or missing file)
  // → emitSvg falls back to BAND_COLORS / DEFAULT_LU_COLORS defaults and
  // emits every material (visibility defaults to visible).
  let layerColors = {}, luColors = {}, layerVis = {}
  try {
    const design = JSON.parse(readFileSync(designPath, 'utf-8'))
    layerColors = design.layerColors || {}
    luColors    = design.luColors    || {}
    layerVis    = design.layerVis    || {}
  } catch (e) {
    console.warn(`[bake] ${lookId}/design.json not readable; using default colors`)
  }

  const stats = bakeStats(ribbons)
  console.log(`baking look=${lookId}: ${stats.streets} streets, ${stats.faces} faces, ${stats.paths} paths`)

  const svg = emitSvg(ribbons, { viewBox, layerColors, luColors, layerVis })
  writeFileSync(outPath, svg)

  const sizeKb = (Buffer.byteLength(svg) / 1024).toFixed(1)
  console.log(`wrote ${outPath} (${sizeKb} KB)`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1) })
}
