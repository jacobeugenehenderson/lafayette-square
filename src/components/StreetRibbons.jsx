import { useMemo, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import clipperLib from 'clipper-lib'
import ribbonsRaw from '../data/ribbons.json'
import { streetInBoundary, faceInBoundary, pointInBoundary } from '../cartograph/boundary.js'
import useCamera from '../hooks/useCamera'
import { BAND_COLORS, sideToStripes, refEdges, defaultMeasure, resolveInserts, segmentRangesForCouplers, measureForSegment, offsetPolyline, innerEdgeMeasure } from '../cartograph/streetProfiles.js'
import useCartographStore from '../cartograph/stores/useCartographStore.js'
import { DEFAULT_LAYER_COLORS, BAND_TO_LAYER } from '../cartograph/m3Colors.js'
import {
  terrainExag, assignTerrainUniforms,
  TERRAIN_DECL, TERRAIN_DISPLACE, TERRAIN_NORMAL, patchTerrain,
} from '../utils/terrainShader'
import { makeGrassMaterial } from './grassMaterial.js'
import { getLampLightmap } from './lampLightmap.js'
import useTimeOfDay from '../hooks/useTimeOfDay'

// Hero mode terrain exaggeration — 10× makes terrain (0–29m) comparable
// to building heights (3–15m) for dramatic but proportional landscape
const HERO_EXAG = 5

// Legacy material tokens — retained as fallback for ribbons.json entries without
// a `bands` field. New streets use BAND_COLORS from streetProfiles.js.
const MAT = {
  asphalt:  '#555550',
  sidewalk: '#a09a8e',
  curb:     '#c8a878',
  treelawn: '#6a8a4a',
}

// Land-use fill colors (one flat color per block face)
// Brighter base colors — PBR lighting darkens them naturally
const LAND_USE_COLORS = {
  residential:      '#5a8a3a',
  commercial:       '#8a8270',
  institutional:    '#7a7a8a',
  vacant:           '#7a6a4a',
  'vacant-commercial': '#7a6a4a',
  recreation:       '#4a7a2a',
  park:             '#4a7a2a',
  parking:          '#5a5a50',
  industrial:       '#6a6a5a',
  island:           '#5a8a3a',
  unknown:          '#5a5a4a',
}

// Corner-plug materials use the outermost pedestrian material (usually sidewalk)
// and the curb/asphalt aesthetic stripes. Colors pulled from BAND_COLORS when
// building corner bands so a custom palette flows through.
const LEGACY_COLORS = {
  asphalt: MAT.asphalt, treelawn: MAT.treelawn, sidewalk: MAT.sidewalk, curb: MAT.curb,
  corner_sw: MAT.sidewalk, corner_curb: MAT.curb, corner_asph: MAT.asphalt,
}

// Priority ordering (only matters at intersections where same-material rings
// from different streets overlap). Innermost driving surface wins; pedestrian
// rings yield to roadway at the crossing.
const BAND_PRIORITY = {
  lawn:               2,
  treelawn:           3,
  median:             3,
  sidewalk:           5,
  gutter:             6,
  curb:               6,
  'parking-parallel': 7,
  'parking-angled':   7,
  asphalt:            8,
}
// corner_curb is a STROKE (constant-width painted on the asph/sw boundary)
// that needs to render above both asph and sw fills. Priority is therefore
// higher than corner_asph; it's the topmost band-level layer.
const CORNER_PRIORITY = { corner_sw: 7, corner_asph: 10, corner_curb: 11 }
const FACE_FILL_PRIORITY = 1  // lowest — underneath everything
// Match streetProfiles' CURB_WIDTH (6" = 0.1524 m) — the value sideToStripes
// uses for the leg's curb stripe. The face-clip below offsets the ribbon's
// outer edge by `pavementHW + CURB_WIDTH + treelawn + sidewalk`; if this
// disagrees with the leg ribbon's actual outer edge, a strip of width
// |delta| appears between the leg ribbon and the block face. The previous
// 0.3 m value left exactly that 0.15 m gap visible along every straight leg.
const CURB_WIDTH = 0.1524

// ── Radial edge fade (soft neighborhood boundary) ──────────────────
// Faces fade on a short schedule; streets extend farther and fade slower,
// so roads trail past the blocks' dissolved edge into empty space.
// Center / radius come from boundary.js (= neighborhood_boundary.json).
import { BOUNDARY_CENTER_XZ as _BC, BOUNDARY_RADIUS as _BR, FADE_INNER as _BFI } from '../cartograph/boundary.js'
const FADE_CENTER = { x: _BC[0], z: _BC[1] }
const FACE_FADE   = { inner: _BFI,         outer: _BR }            // last 15% of R
const STREET_FADE = { inner: _BFI + 42,    outer: _BR + 108 }      // starts later, reaches past R

// ── Measure-stack helpers ─────────────────────────────────────────
// The pipeline emits `measure: {left, right}` per street. Each side is
// {pavementHW, treelawn, sidewalk, terminal}. These helpers convert that
// shape into rings (for geometry) and reference edges (for corner plugs).

// For inner-edge anchored chains, the chain stays at carriageway center.
// The cross-section is two-sided (pavement + curb on both sides), but the
// inboard ped zone (treelawn + sidewalk) is zeroed since there's no
// pedestrian zone along the median. Outboard keeps its full cross-section.
// Returns just the transformed measure — no polyline shift, no synthetic
// pavement combining. Standard handles, standard ribbon emission.
function inboardPedZoneless(street, baseMeasure) {
  if (street.anchor !== 'inner-edge' || !street.innerSign) return baseMeasure
  return innerEdgeMeasure(baseMeasure, street.innerSign)
}

// Convert one side's measure into rings with cumulative radii + pri + color.
function sideToRings(side) {
  const stripes = sideToStripes(side)
  return stripes.map(s => ({
    ...s,
    pri: BAND_PRIORITY[s.material] ?? 5,
    color: BAND_COLORS[s.material] || LEGACY_COLORS.asphalt,
  }))
}

// Convert a centerline-only entry (alley, footway, cycleway, steps, path)
// into a street-shaped object so the existing ribbon geometry helpers
// (sideToRings, halfRingRaw, silhouette, edge strokes) work unchanged.
// Alleys/paths are pavement-only: terminal is undefined → sideToStripes
// emits a single asphalt ring (no curb, no sidewalk, no treelawn).
// BAND_TO_LAYER routes 'asphalt' through the 'alley' / 'footway' panel
// picker when kind is passed down via the mesh group id.
function pathAsStreet(p, fallbackIdx = 0) {
  const hw = (p.pavedWidth || 3) / 2
  return {
    name: p.name || `__${p.kind || 'path'}_${fallbackIdx}`,
    points: p.points,
    kind: p.kind || 'alley',
    measure: {
      left:  { pavementHW: hw },
      right: { pavementHW: hw },
      symmetric: true,
    },
    capEnds: { start: null, end: null },
    intersections: [],
    isPath: true,
  }
}

// Ensure a street has a valid measure; synthesize a default residential one
// when absent (back-compat safety for legacy ribbons.json).
function ensureMeasure(street) {
  if (street.measure?.left && street.measure?.right) return street.measure
  const d = defaultMeasure('residential')
  return d
}

// ── Authored centerlines are the source of truth ────────────────
// The pipeline's OSM-way stitching can produce tangled loop chains (two
// parallel one-way ways of a divided road stitched into one polyline that
// folds back on itself) and end-to-end fragmentation of single streets.
// Rather than un-tangling the pipeline's artifacts, we prefer the authored
// centerlines.json geometry whenever available — one clean polyline per
// street as the operator drew it — and fall back to pipeline chains only
// for streets that aren't authored yet.
//
// Divided roads (median-bearing streets) are expressed as ONE authored
// centerline running down the middle of the whole ROW, with a median
// insert coupler carving a center gap. The median's carved slice is
// rendered as its own material (grass / concrete) via the band stack —
// no separate "lane halves" needed.

// ── Terrain-bounds clip (fragment discard outside terrain coverage) ──
// vWorldPos is passed from vertex shader; discard fragments outside terrain
const TERRAIN_CLIP_VARYING_DECL = `varying vec3 vWorldPos;`
const TERRAIN_CLIP_VERTEX = `vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
// Soft fade at terrain bounds — 80m feather inward from each edge
// Applied inside lights_fragment_maps (before gl_FragColor), so we store
// the fade factor in diffuseColor.a and apply it in output_fragment
const TERRAIN_CLIP_FRAG = `
{
  float _fadeL = smoothstep(uBMinX, uBMinX + 80.0, vWorldPos.x);
  float _fadeR = smoothstep(uBMinX + uSpanX, uBMinX + uSpanX - 80.0, vWorldPos.x);
  float _fadeB = smoothstep(uBMinZ, uBMinZ + 80.0, vWorldPos.z);
  float _fadeT = smoothstep(uBMinZ + uSpanZ, uBMinZ + uSpanZ - 80.0, vWorldPos.z);
  float _edgeFade = _fadeL * _fadeR * _fadeB * _fadeT;
  diffuseColor.a *= _edgeFade;
}`

// ── Shadow-tinted flat shader ────────────────────────────────────
// Let Three.js compute full PBR lighting (sun, shadows, point lights, ambient).
// Extract a grayscale light factor from the result. Multiply curated colors
// by that factor. Palette stays coherent — shadows darken, sun brightens.

// Lets Three.js compute full PBR lighting, then extracts a grayscale light
// factor and re-applies it to the curated palette color. Why the π factor:
// three.js's BRDF_Lambert divides diffuse by π for energy conservation. For
// a curated palette where the designer picked #RRGGBB *as the display-target
// tone under sun*, we undo that division so the ribbon lands at its palette
// color in full light and falls toward ~25% in deep shadow.
const SHADOW_TINTED_FLAT = `
#include <lights_fragment_maps>
// Terrain clip removed — radial fade (circle) is the authoritative silhouette
// now. Keeping the clip made shots look cropped to the elevation grid rect.
// ${/* TERRAIN_CLIP_FRAG — retired */ ''}
{
  vec3 _totalLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
  float _baseLum = max(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.0005);
  // Multiply by PI to cancel BRDF_Lambert's 1/π — brings palette-tone back.
  float _lightMul = dot(_totalLight, vec3(0.2126, 0.7152, 0.0722)) / _baseLum * 3.14159;
  // Floor at 0.25 so shadowed asphalt still reads as "dark asphalt" not void.
  // Ceiling at 1.6 lets bright-lit surfaces push slightly over palette tone.
  float _lightFactor = clamp(_lightMul, 0.25, 1.6);

  reflectedLight.directDiffuse = vec3(0.0);
  reflectedLight.directSpecular = vec3(0.0);
  reflectedLight.indirectSpecular = vec3(0.0);
  reflectedLight.indirectDiffuse = diffuseColor.rgb * _lightFactor;
}`

// Cartograph flat shader — exact base colors, zero lighting
const CARTOGRAPH_FLAT = `
#include <lights_fragment_maps>
reflectedLight.directDiffuse = vec3(0.0);
reflectedLight.directSpecular = vec3(0.0);
reflectedLight.indirectSpecular = vec3(0.0);
reflectedLight.indirectDiffuse = diffuseColor.rgb;`

// ── Face fill subdivision (dense enough vertices for terrain following) ──

function subdivideGeo(geo, maxEdge) {
  const srcPos = Array.from(geo.attributes.position.array)
  let idx = Array.from(geo.index.array)
  const midCache = new Map()
  const maxE2 = maxEdge * maxEdge
  // Hard cap on the working vertex count. An 8-pass subdivision can
  // multiply triangles by up to 4^8; if input geometry is already large
  // (185 chains × wide ribbons in measure mode) the requested allocation
  // exceeds the v8 typed-array limit and the whole StreetRibbons mesh
  // crashes. Bail to the input geometry once we'd cross this threshold.
  const MAX_VERTS = 2_000_000

  function getMid(i, j) {
    const key = Math.min(i, j) + '_' + Math.max(i, j)
    if (midCache.has(key)) return midCache.get(key)
    const vi = srcPos.length / 3
    srcPos.push(
      (srcPos[i * 3] + srcPos[j * 3]) / 2,
      (srcPos[i * 3 + 1] + srcPos[j * 3 + 1]) / 2,
      (srcPos[i * 3 + 2] + srcPos[j * 3 + 2]) / 2,
    )
    midCache.set(key, vi)
    return vi
  }

  function edgeLen2(i, j) {
    const dx = srcPos[i * 3] - srcPos[j * 3], dz = srcPos[i * 3 + 2] - srcPos[j * 3 + 2]
    return dx * dx + dz * dz
  }

  let aborted = false
  for (let pass = 0; pass < 8; pass++) {
    if (srcPos.length / 3 >= MAX_VERTS) {
      console.warn('[StreetRibbons.subdivideGeo] vertex cap reached, aborting subdivision at pass', pass)
      aborted = true
      break
    }
    const next = []
    let changed = false
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2]
      if (edgeLen2(a, b) > maxE2 || edgeLen2(b, c) > maxE2 || edgeLen2(c, a) > maxE2) {
        const mab = getMid(a, b), mbc = getMid(b, c), mca = getMid(c, a)
        next.push(a, mab, mca, mab, b, mbc, mca, mbc, c, mab, mbc, mca)
        changed = true
      } else {
        next.push(a, b, c)
      }
    }
    idx = next
    if (!changed) break
  }
  if (aborted) {
    // Fall back to the original (unsubdivided) geometry rather than
    // attempt a partial-subdivision allocation that may also fail.
    return geo
  }

  const result = new THREE.BufferGeometry()
  result.setAttribute('position', new THREE.Float32BufferAttribute(srcPos, 3))
  const nrm = new Float32Array(srcPos.length)
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1
  result.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  result.setIndex(idx)
  return result
}

// ── Geometry helpers (unchanged from POC) ────────────────────────

function lineX(p1, d1, p2, d2) {
  const det = d1[0]*d2[1] - d1[1]*d2[0]
  if (Math.abs(det) < 1e-10) return null
  const t = ((p2[0]-p1[0])*d2[1] - (p2[1]-p1[1])*d2[0]) / det
  return [p1[0]+t*d1[0], p1[1]+t*d1[1]]
}

function computePerps(pts) {
  const n = pts.length
  return pts.map((_, i) => {
    let nx = 0, nz = 0
    if (i < n-1) {
      const dx=pts[i+1][0]-pts[i][0], dz=pts[i+1][1]-pts[i][1], l=Math.hypot(dx,dz)
      if (l > 1e-9) { nx-=dz/l; nz+=dx/l }
    }
    if (i > 0) {
      const dx=pts[i][0]-pts[i-1][0], dz=pts[i][1]-pts[i-1][1], l=Math.hypot(dx,dz)
      if (l > 1e-9) { nx-=dz/l; nz+=dx/l }
    }
    const l = Math.hypot(nx, nz)
    // Fallback to +Z if both adjacent segments were zero-length: keeps the
    // ribbon position finite and contained instead of NaN-poisoning the
    // entire merged buffer's bounding box.
    if (l < 1e-9) return [0, 1]
    return [nx/l, nz/l]
  })
}

// Dynamic winding check: flip triangle order so both sides wind CCW from above.
// FrontSide material culls CW faces; without this, one side of every street
// ribbon disappears. The corner plugs produce DEGENERATE first triangles
// (outer and inner endpoints collapse to the same point), so we scan past
// those until a non-degenerate triangle establishes the winding.
function ensureCCW(raw) {
  if (!raw || !raw.indices || raw.indices.length < 3) return raw
  const { positions, indices } = raw
  let crossY = 0
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i], i1 = indices[i + 1], i2 = indices[i + 2]
    const ax = positions[i0*3], az = positions[i0*3+2]
    const bx = positions[i1*3], bz = positions[i1*3+2]
    const cx = positions[i2*3], cz = positions[i2*3+2]
    crossY = (bz - az) * (cx - ax) - (bx - ax) * (cz - az)
    if (Math.abs(crossY) > 1e-8) break  // first non-degenerate triangle
  }
  if (crossY < 0) {
    for (let i = 0; i < indices.length; i += 3) {
      const tmp = indices[i + 1]; indices[i + 1] = indices[i + 2]; indices[i + 2] = tmp
    }
  }
  return raw
}

function halfRingRaw(pts, innerHW, outerHW, perps, side) {
  const n = pts.length; if (n < 2) return null
  const positions = [], normals = [], indices = []
  for (let i = 0; i < n; i++) {
    const [x, z] = pts[i], [nx, nz] = perps[i]
    positions.push(x+side*nx*outerHW, 0, z+side*nz*outerHW)
    positions.push(x+side*nx*innerHW, 0, z+side*nz*innerHW)
    normals.push(0,1,0, 0,1,0)
  }
  for (let i = 0; i < n-1; i++) {
    const a=i*2, b=(i+1)*2; indices.push(a,b,a+1, a+1,b,b+1)
  }
  return ensureCCW({ positions, normals, indices })
}

// Per-point variable-radius variant. `innerArr` / `outerArr` are per-vertex
// half-widths (length = pts.length) — lets insert couplers vary the inner
// edge over arc-length (a median taper, for instance) without splitting the
// street into many segments.
function halfRingVarRaw(pts, innerArr, outerArr, perps, side) {
  const n = pts.length; if (n < 2) return null
  const positions = [], normals = [], indices = []
  for (let i = 0; i < n; i++) {
    const [x, z] = pts[i], [nx, nz] = perps[i]
    const oR = outerArr[i], iR = innerArr[i]
    positions.push(x+side*nx*oR, 0, z+side*nz*oR)
    positions.push(x+side*nx*iR, 0, z+side*nz*iR)
    normals.push(0,1,0, 0,1,0)
  }
  for (let i = 0; i < n-1; i++) {
    const a=i*2, b=(i+1)*2; indices.push(a,b,a+1, a+1,b,b+1)
  }
  return ensureCCW({ positions, normals, indices })
}

function mergeRawGeo(parts) {
  // Drop parts with any non-finite position. One NaN in the merged
  // buffer makes the auto-computed bounding sphere infinite, frustum
  // culling drops the entire mesh, and every ribbon visually vanishes
  // — refresh "fixes" it until the next bad part. Containing the
  // damage to the offending part keeps the rest of the road on screen
  // while we hunt the source.
  const valid = []
  for (const p of parts) {
    if (!p) continue
    let bad = false
    for (let i = 0; i < p.positions.length; i++) {
      if (!Number.isFinite(p.positions[i])) { bad = true; break }
    }
    if (bad) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[StreetRibbons] dropped ribbon part with non-finite positions')
      }
      continue
    }
    valid.push(p)
  }
  if (!valid.length) return null
  let totalV=0, totalI=0
  for (const p of valid) { totalV+=p.positions.length/3; totalI+=p.indices.length }
  const pos=new Float32Array(totalV*3), nrm=new Float32Array(totalV*3), idx=new Uint32Array(totalI)
  let vO=0, iO=0
  for (const p of valid) {
    const nv=p.positions.length/3
    for (let i=0;i<p.positions.length;i++) pos[vO*3+i]=p.positions[i]
    for (let i=0;i<p.normals.length;i++) nrm[vO*3+i]=p.normals[i]
    for (let i=0;i<p.indices.length;i++) idx[iO+i]=p.indices[i]+vO
    vO+=nv; iO+=p.indices.length
  }
  const g=new THREE.BufferGeometry()
  g.setAttribute('position',new THREE.BufferAttribute(pos,3))
  g.setAttribute('normal',new THREE.BufferAttribute(nrm,3))
  g.setIndex(new THREE.BufferAttribute(idx,1))
  return g
}

// Build a quarter-annulus wedge for one side of a round endcap.
// Sweeps 90° around the endpoint, from `side * perp` toward `tangent`,
// producing a ring arc at radii [innerR, outerR]. Winding matches halfRingRaw.
function quarterCapRaw(endpoint, tangent, perp, side, innerR, outerR, segments = 10) {
  const positions = [], normals = [], indices = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * (Math.PI / 2)
    const dx = Math.cos(a) * side * perp[0] + Math.sin(a) * tangent[0]
    const dz = Math.cos(a) * side * perp[1] + Math.sin(a) * tangent[1]
    positions.push(endpoint[0] + dx * outerR, 0, endpoint[1] + dz * outerR)
    positions.push(endpoint[0] + dx * innerR, 0, endpoint[1] + dz * innerR)
    normals.push(0, 1, 0, 0, 1, 0)
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2, b = (i + 1) * 2
    indices.push(a, b, a + 1, a + 1, b, b + 1)
  }
  return { positions, normals, indices }
}

// Per-side blunt cap stroke: a STROKE_W-thick perpendicular bar at the
// endpoint, spanning [0, outerR] along the side's perp. Centered on the
// endpoint's perpendicular line so the bar visually closes the outline.
function bluntCapStrokeRaw(endpoint, tangent, perp, side, outerR, w) {
  const ax = endpoint[0] - tangent[0] * w / 2, az = endpoint[1] - tangent[1] * w / 2
  const bx = endpoint[0] + tangent[0] * w / 2, bz = endpoint[1] + tangent[1] * w / 2
  const px = side * perp[0] * outerR,         pz = side * perp[1] * outerR
  const positions = [
    ax,      0, az,
    ax + px, 0, az + pz,
    bx + px, 0, bz + pz,
    bx,      0, bz,
  ]
  const normals = [0,1,0, 0,1,0, 0,1,0, 0,1,0]
  const indices = [0, 1, 2, 0, 2, 3]
  return { positions, normals, indices }
}

function cornerBandRaw(P0o, oo, P1o, P0i, P1i, ctrlI, segments = 16) {
  const positions = [], normals = [], indices = []
  let vi = 0
  const V = (x, z) => { positions.push(x, 0, z); normals.push(0, 1, 0); return vi++ }
  for (let j = 0; j <= segments; j++) {
    const t = j / segments, u = 1 - t
    const s = t <= 0.5 ? t * 2 : (t - 0.5) * 2
    const ox = t <= 0.5 ? P0o[0] * (1 - s) + oo[0] * s : oo[0] * (1 - s) + P1o[0] * s
    const oz = t <= 0.5 ? P0o[1] * (1 - s) + oo[1] * s : oo[1] * (1 - s) + P1o[1] * s
    const bx = u * u * P0i[0] + 2 * u * t * ctrlI[0] + t * t * P1i[0]
    const bz = u * u * P0i[1] + 2 * u * t * ctrlI[1] + t * t * P1i[1]
    V(ox, oz); V(bx, bz)
  }
  for (let j = 0; j < segments; j++) {
    const a = j * 2, b = (j + 1) * 2; indices.push(a, b, a + 1, a + 1, b, b + 1)
  }
  return { positions, normals, indices }
}

function bezierBandRaw(P0o, P1o, ctrlO, P0i, P1i, ctrlI, segments = 16) {
  const positions = [], normals = [], indices = []
  let vi = 0
  const V = (x, z) => { positions.push(x, 0, z); normals.push(0, 1, 0); return vi++ }
  for (let j = 0; j <= segments; j++) {
    const t = j / segments, u = 1 - t
    const ox = u * u * P0o[0] + 2 * u * t * ctrlO[0] + t * t * P1o[0]
    const oz = u * u * P0o[1] + 2 * u * t * ctrlO[1] + t * t * P1o[1]
    const bx = u * u * P0i[0] + 2 * u * t * ctrlI[0] + t * t * P1i[0]
    const bz = u * u * P0i[1] + 2 * u * t * ctrlI[1] + t * t * P1i[1]
    V(ox, oz); V(bx, bz)
  }
  for (let j = 0; j < segments; j++) {
    const a = j * 2, b = (j + 1) * 2; indices.push(a, b, a + 1, a + 1, b, b + 1)
  }
  return { positions, normals, indices }
}

// ── Corner plug via canonical 90° template + per-quadrant affine ──
// The plug is built in a canonical 90° frame and mapped to actual world
// via the affine T(cx, cy) = IX + (sA·cy·edB − sB·cx·edA) / cross, where
// cross = edA × edB. This mapping preserves both leg directions AND
// perpendicular distances from each leg simultaneously (verified against
// Mississippi×Park's all-four-quadrant numerics). Returns asphalt-corner
// fill + sidewalk-pad fill (both as triangle-fan raw geometries) plus the
// asph/sidewalk boundary polyline (for the curb stroke pass). Curb is not
// part of the plug — it's a stroke applied on top of the boundary curve
// at constant world width.
function buildCornerPlug(IX, edA, edB, sA, sB, refA, refB) {
  const R_A = refA.propertyLine - refA.curbOuter
  const R_B = refB.propertyLine - refB.curbOuter
  const R = Math.min(R_A, R_B)
  if (R <= 0) return null
  const curbOA = refA.curbOuter, curbOB = refB.curbOuter
  const swOA = refA.propertyLine, swOB = refB.propertyLine
  // cross = edA × edB. Degenerate (parallel legs) if near zero.
  const cross = edA[0]*edB[1] - edA[1]*edB[0]
  if (Math.abs(cross) < 1e-6) return null
  // Canonical → world mapping. Derived from the constraints:
  //   (point − IX) · perpA = sA · cy   (perp distance from leg A on +sA side)
  //   (point − IX) · perpB = sB · cx   (perp distance from leg B on +sB side)
  // Solving gives T(cx, cy) = IX + (sA·cy·edB − sB·cx·edA) / cross.
  const T = (cx, cy) => [
    IX[0] + (sA * cy * edB[0] - sB * cx * edA[0]) / cross,
    IX[1] + (sA * cy * edB[1] - sB * cx * edA[1]) / cross,
  ]
  // Canonical key points (90° frame, x = leg B perp distance, y = leg A perp distance).
  // Arc center stays at the curb-outer corner (curbOB+R, curbOA+R). The arc
  // RADIUS is bumped by curb-half so that the boundary curve runs along
  // each leg's CURB-STRIPE CENTER, not its curb-outer edge. With the curb
  // rendered as a constant-width stroke CENTERED on this curve, the stroke
  // perpendicular range exactly equals [asphOuter, curbOuter] on each leg.
  // Per-leg curb half is derived from refEdges' (curbOuter − curbInner) so
  // chains with non-default curb widths render correctly. When legs differ,
  // each tangent uses its own leg's half; the arc radius bump uses the
  // average so the seam blends gracefully.
  const curbHalfA = Math.max(0, (refA.curbOuter - refA.curbInner) / 2)
  const curbHalfB = Math.max(0, (refB.curbOuter - refB.curbInner) / 2)
  const curbHalfAvg = (curbHalfA + curbHalfB) / 2
  const arcCx = curbOB + R, arcCy = curbOA + R
  const arcR = R + curbHalfAvg
  const asphOA = refA.curbInner    // = curbOA − leg A curb (leg A asphalt-outer line)
  const asphOB = refB.curbInner
  // Arc tangent perp positions: curb-stripe-center on each leg.
  const tangentA_y = curbOA - curbHalfA
  const tangentB_x = curbOB - curbHalfB
  const ARC_SEGS = 16
  const arcWorld = []
  for (let i = 0; i <= ARC_SEGS; i++) {
    const t = i / ARC_SEGS
    const angle = -Math.PI/2 - t * (Math.PI/2)  // -π/2 → -π, sweep -π/2 (CW)
    const cx = arcCx + arcR * Math.cos(angle)
    const cy = arcCy + arcR * Math.sin(angle)
    arcWorld.push(T(cx, cy))
  }
  // Asphalt fill polygon: extends DOWN to the asph-outer corner so the plug
  // masks the leg curb stripes in the IX area. Polygon vertices CCW:
  //   asph_corner → (Tangent_A.x, asphOA) → Tangent_A → arc → Tangent_B
  //                → (asphOB, Tangent_B.y) → asph_corner.
  const asphCorner = T(asphOB, asphOA)
  const asphLegA = T(arcCx, asphOA)             // leg A asph-outer at tangent edA-pos
  const asphLegB = T(asphOB, arcCy)             // leg B asph-outer at tangent edB-pos
  const asphRing = [asphLegA, ...arcWorld, asphLegB]
  const asphFill = fanRaw(asphCorner, asphRing)
  // Sidewalk pad polygon: extends UP to property-line corner; covers the
  // leg sidewalk overlap area in the IX.
  const oo = T(swOB, swOA)
  const swLegB = T(swOB, arcCy)
  const swLegA = T(arcCx, swOA)
  const swRing = [swLegB, ...arcWorld.slice().reverse(), swLegA]
  const swFill = fanRaw(oo, swRing)
  // curbStrokeWidth carries the average of the two legs' curbs so the
  // corner curb-stroke pass renders at the same thickness as the legs.
  return { asphFill, swFill, boundary: arcWorld, curbStrokeWidth: curbHalfAvg * 2 }
}

function fanRaw(apex, ringWorld) {
  const positions = [], normals = [], indices = []
  positions.push(apex[0], 0, apex[1]); normals.push(0, 1, 0)
  for (const p of ringWorld) {
    positions.push(p[0], 0, p[1]); normals.push(0, 1, 0)
  }
  for (let i = 1; i < ringWorld.length; i++) {
    indices.push(0, i, i + 1)
  }
  return { positions, normals, indices }
}

// Stroke a world-space polyline as a thin band of constant total width.
// Used for the curb stroke on each corner plug's asph/sidewalk boundary.
// Returns raw geometry (positions/normals/indices). Uses bisector-perp at
// each vertex (miter join), suitable for smooth curves like our arcs.
function strokePolylineRaw(points, width) {
  const n = points.length
  if (n < 2) return null
  const positions = [], normals = [], indices = []
  const half = width / 2
  for (let i = 0; i < n; i++) {
    let nx = 0, nz = 0
    if (i < n - 1) {
      const dx = points[i + 1][0] - points[i][0], dz = points[i + 1][1] - points[i][1]
      const l = Math.hypot(dx, dz) || 1
      nx -= dz / l; nz += dx / l
    }
    if (i > 0) {
      const dx = points[i][0] - points[i - 1][0], dz = points[i][1] - points[i - 1][1]
      const l = Math.hypot(dx, dz) || 1
      nx -= dz / l; nz += dx / l
    }
    const l = Math.hypot(nx, nz) || 1
    nx /= l; nz /= l
    const [px, pz] = points[i]
    positions.push(px + nx * half, 0, pz + nz * half)
    positions.push(px - nx * half, 0, pz - nz * half)
    normals.push(0, 1, 0, 0, 1, 0)
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2, b = (i + 1) * 2
    indices.push(a, b, a + 1, a + 1, b, b + 1)
  }
  return { positions, normals, indices }
}

// ── Diagnostic marker disk (for plug-point visualization) ────────
// Triangle fan disk at ground level. Caller picks color via material.
function diagDiskRaw(point, r = 0.5, segments = 12) {
  const positions = [], normals = [], indices = []
  positions.push(point[0], 0, point[1]); normals.push(0, 1, 0)
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * 2 * Math.PI
    positions.push(point[0] + r * Math.cos(a), 0, point[1] + r * Math.sin(a))
    normals.push(0, 1, 0)
  }
  for (let i = 0; i < segments; i++) indices.push(0, i + 1, i + 2)
  return { positions, normals, indices }
}

// ── Segment direction helper ─────────────────────────────────────

function segDir(pts, i0, i1) {
  const dx = pts[i1][0] - pts[i0][0], dz = pts[i1][1] - pts[i0][1]
  const l = Math.hypot(dx, dz)
  return l > 1e-6 ? [dx / l, dz / l] : [1, 0]
}

// ── Main component ───────────────────────────────────────────────

export default function StreetRibbons({ hiddenLayers, flat = false, luColors, liveCenterlines, measureActive = false, surveyActive = false, selectedCorridorNames = null, ribbons = ribbonsRaw, useBoundary = true, hideFaceFills = false }) {
  // Architectural blue — used for overlays in Measure/Survey contexts.
  const ARCH_BLUE = '#2250E8'
  const authoringActive = measureActive || surveyActive

  // Live Designer-panel layer colors (falls back to M3 defaults when a picker
  // hasn't been touched yet, or to BAND_COLORS for bands not on the panel).
  const layerColors = useCartographStore(s => s.layerColors) || {}

  // ── Drive shared terrain exaggeration from view mode ──────────
  useFrame(() => {
    if (flat) { terrainExag.value = 0; return }
    const vm = useCamera.getState().viewMode
    // Browse used to be 0 as a defensive flat-map fallback; now that ribbons
    // render in shots we want the topography always visible. Browse ≈ Hero.
    const target = vm === 'hero' ? HERO_EXAG : vm === 'planetarium' ? 1 : HERO_EXAG
    if (!window.__exagLogged || window.__exagLogged !== vm) {
      window.__exagLogged = vm
      console.log('[exag]', 'viewMode:', vm, 'target:', target, 'current:', terrainExag.value)
    }
    const cur = terrainExag.value
    if (Math.abs(cur - target) < 0.01) { terrainExag.value = target; return }
    terrainExag.value += (target - cur) * 0.06
  })

  // Skeleton (via derive.js) is the sole geometry source. ribbons.streets
  // is emitted per skeleton street; no authored-vs-pipeline election, no
  // hasReversal drop, no substantive-ratio heuristics. Live overlay data
  // (measure, caps) is merged below in the main meshes useMemo.
  const renderRibbons = useMemo(() => ribbons, [ribbons])

  const meshes = useMemo(() => {
    // Build a skelId → live-centerline lookup for merging Measure/Survey
    // edits into the rendered ribbons. Keying by id (not name) is required
    // because divided roads emit multiple same-name chains; matching by name
    // alone leaks one chain's edits onto its sibling carriageway. Name
    // remains as a fallback for any ribbons.json street missing skelId.
    const liveById = new Map()
    const liveByName = new Map()
    // Build live lookups WITHOUT excluding disabled chains here — disability
    // needs to propagate to the merged street so corner plugs / face clip
    // can also drop the chain. Filter on `merged.disabled` downstream.
    if (liveCenterlines) {
      for (const cl of liveCenterlines) {
        if (!cl) continue
        if (cl.id) liveById.set(cl.id, cl)
        if (cl.name && !liveByName.has(cl.name)) liveByName.set(cl.name, cl)
      }
    }
    const lookupLive = (st) =>
      (st.skelId && liveById.get(st.skelId)) || liveByName.get(st.name) || null

    // Merge live measure/cap overrides onto ribbons.json streets. Points,
    // intersections, and faces stay from ribbons.json (structural); measure
    // and caps come live from centerlineData when present.
    //
    // Direction is now pipeline-aligned (derive.js reverses chains whose
    // tangent disagrees with the authored centerline), so `measure.left`
    // maps to physical-left on every segment without any runtime swap.
    const pointsNearlyEqual = (a, b, eps = 0.5) =>
      a && b && Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps
    const mergedStreets = renderRibbons.streets.map(st => {
      const live = lookupLive(st)
      if (!live) return st
      const merged = { ...st }
      if (live.disabled) merged.disabled = true
      if (live.measure?.left && live.measure?.right) {
        merged.measure = {
          left: { ...live.measure.left },
          right: { ...live.measure.right },
          symmetric: live.measure.symmetric,
        }
      }
      if (live.couplers && live.couplers.length) merged.couplers = live.couplers
      if (live.segmentMeasures) merged.segmentMeasures = live.segmentMeasures
      // Anchor: live override (from store) wins; otherwise the ribbons.json
      // default (auto-detected by derive) is already on `st`.
      if (live.anchor) merged.anchor = live.anchor
      if (live.capStart !== undefined || live.capEnd !== undefined) {
        // Caps apply only to the ribbon segment whose terminal actually
        // matches the centerline's terminal — prevents chain-split segments
        // from each growing a spurious cap at their interior junctions.
        const cLive = live.points
        const stFirst = st.points[0], stLast = st.points[st.points.length - 1]
        const cFirst = cLive && cLive[0]
        const cLast = cLive && cLive[cLive.length - 1]
        const applyStart = live.capStart !== undefined && pointsNearlyEqual(stFirst, cFirst)
        const applyEnd = live.capEnd !== undefined && pointsNearlyEqual(stLast, cLast)
        if (applyStart || applyEnd) {
          merged.capEnds = {
            start: applyStart ? (live.capStart ?? null) : (st.capEnds?.start ?? null),
            end: applyEnd ? (live.capEnd ?? null) : (st.capEnds?.end ?? null),
          }
        }
      }
      return merged
    })

    // Filter to neighborhood boundary (skipped for self-contained fixtures like the toy scene).
    const ribbonsData = {
      streets: mergedStreets.filter(st => !useBoundary || streetInBoundary(st.points)),
      intersections: ribbons.intersections.filter(ix => !useBoundary || pointInBoundary(ix.point[0], ix.point[1])),
      faces: (ribbons.faces || []).filter(f => !useBoundary || faceInBoundary(f.ring)),
    }

    const groups = {}
    const groupsSelected = {}
    // ── DIAGNOSTIC: per-color marker disks at plug-construction points.
    // Populated only at Mississippi × Park (oblique IX) so we don't
    // pollute every IX. Rendered last with renderOrder 99 so they sit
    // above all ribbons. Remove this block once green-tongue is fixed.
    const diagMarkers = { red: [], orange: [], yellow: [], cyan: [], magenta: [], blue: [], green: [] }
    // Per-corner asph/sidewalk boundary polylines (world coords) for the
    // curb-stroke pass. Each entry is the arc samples from one corner plug.
    const cornerBoundaries = []
    // The active group is chosen per-street based on corridor selection:
    // when the current street's name is in selectedCorridorNames, its
    // geometry routes into groupsSelected, which renders translucent so
    // the aerial shows through for alignment. Rest go into `groups`.
    let activeGroups = groups
    const ensure = (id) => { if (!activeGroups[id]) activeGroups[id] = [] }

    // Index streets by name for intersection lookups
    const streetsByName = new Map()
    for (const st of ribbonsData.streets) {
      if (!streetsByName.has(st.name)) streetsByName.set(st.name, [])
      streetsByName.get(st.name).push(st)
    }

    // ── Arm ribbons ──────────────────────────────────────────────
    // Driving-surface bands (roadway) run full length and merge at intersections.
    // Pedestrian-side bands split at each IX — the corner plug replaces them there.
    const FULL_LENGTH_BANDS = new Set(['asphalt', 'gutter', 'parking-parallel', 'parking-angled'])

    for (const street of ribbonsData.streets) {
      const pts = street.points
      if (pts.length < 2) continue
      activeGroups = (selectedCorridorNames && selectedCorridorNames.has(street.name))
        ? groupsSelected : groups
      const perps = computePerps(pts)
      const chainMeasure = ensureMeasure(street)
      // Per-point median half-width from insert couplers. A non-zero
      // medianHW at a point shifts the cross-section outward by that
      // amount on both sides and emits a 'median' band in the carved
      // center slice.
      const inserts = resolveInserts(street)
      const hasMedian = inserts.some(ins => (ins.medianHW || 0) > 0)

      // Split couplers carve the chain into addressable segments. Couplers
      // carry world coords, so segmentRangesForCouplers projects them onto
      // the ribbons polyline (which has more points than skeleton because
      // intersection vertices were spliced in by derive). With no couplers,
      // there is exactly one segment spanning the whole chain.
      const segRanges = segmentRangesForCouplers(pts, street.couplers || [])
      const ranges = segRanges.length ? segRanges : [[0, pts.length - 1]]
      const ixIdxs = (street.intersections || []).map(ix => ix.ix).sort((a, b) => a - b)

      for (let segOrd = 0; segOrd < ranges.length; segOrd++) {
        const range = ranges[segOrd]
        const baseMeasure = measureForSegment(street, segOrd) || chainMeasure
        const measure = inboardPedZoneless(street, baseMeasure)
        const segPts = pts.slice(range[0], range[1] + 1)
        const segPp = perps.slice(range[0], range[1] + 1)
        const segInsertsSlice = inserts.slice(range[0], range[1] + 1)
        const segHasMedian = segInsertsSlice.some(ins => (ins.medianHW || 0) > 0)
        // Pedestrian-band sub-splits: chain intersections that fall inside
        // this segment break pedestrian rings for corner plugs. Indices
        // are converted to segment-local space.
        const segIxs = ixIdxs.filter(i => i > range[0] && i < range[1])
        const localSplits = [0, ...segIxs.map(i => i - range[0]), segPts.length - 1]
        const uniqueLocalSplits = [...new Set(localSplits)].sort((a, b) => a - b)

      for (const [side, sideMeasure] of [[-1, measure.left], [+1, measure.right]]) {
        const rings = sideToRings(sideMeasure)

        // Median band: centerline → ±medianHW. Rendered as a per-side
        // half-ring (inner=0, outer=medianHW[i]) so both sides fuse into
        // the full median strip at the centerline.
        if (segHasMedian) {
          ensure('median')
          const zeros = new Float64Array(segPts.length)
          const medianArr = new Float64Array(segPts.length)
          for (let i = 0; i < segPts.length; i++) medianArr[i] = segInsertsSlice[i]?.medianHW || 0
          activeGroups.median.push(halfRingVarRaw(segPts, zeros, medianArr, segPp, side))
        }

        for (const ring of rings) {
          ensure(ring.material)
          if (segHasMedian) {
            const innerArr = new Float64Array(segPts.length)
            const outerArr = new Float64Array(segPts.length)
            for (let i = 0; i < segPts.length; i++) {
              const m = segInsertsSlice[i]?.medianHW || 0
              innerArr[i] = ring.innerR + m
              outerArr[i] = ring.outerR + m
            }
            if (FULL_LENGTH_BANDS.has(ring.material)) {
              activeGroups[ring.material].push(halfRingVarRaw(segPts, innerArr, outerArr, segPp, side))
            } else {
              for (let si = 0; si < uniqueLocalSplits.length - 1; si++) {
                const from = uniqueLocalSplits[si], to = uniqueLocalSplits[si + 1]
                const sPts = segPts.slice(from, to + 1)
                const sPp = segPp.slice(from, to + 1)
                const sInner = innerArr.slice(from, to + 1)
                const sOuter = outerArr.slice(from, to + 1)
                if (sPts.length < 2) continue
                activeGroups[ring.material].push(halfRingVarRaw(sPts, sInner, sOuter, sPp, side))
              }
            }
          } else if (FULL_LENGTH_BANDS.has(ring.material)) {
            activeGroups[ring.material].push(halfRingRaw(segPts, ring.innerR, ring.outerR, segPp, side))
          } else {
            for (let si = 0; si < uniqueLocalSplits.length - 1; si++) {
              const from = uniqueLocalSplits[si], to = uniqueLocalSplits[si + 1]
              const sPts = segPts.slice(from, to + 1)
              const sPp = segPp.slice(from, to + 1)
              if (sPts.length < 2) continue
              activeGroups[ring.material].push(halfRingRaw(sPts, ring.innerR, ring.outerR, sPp, side))
            }
          }
        }
      }
      } // end per-segment range loop

      // ── Endcaps at operator-marked dead-ends ──
      // capStart / capEnd come from Survey mode (operator is authority, no
      // auto-detection). Round = cul-de-sac (quarter-annulus per band per side).
      // Blunt = flat termination (no extra geometry needed; the ring already
      // ends perpendicular at the last polyline point).
      const CAP_ENABLED = true
      if (CAP_ENABLED) {
        const capEnds = street.capEnds || { start: null, end: null }
        const lastOrd = ranges.length - 1
        const endInfo = [
          { cap: capEnds.start, idx: 0, tanPt0: pts[1], tanPt1: pts[0], ord: 0 },
          { cap: capEnds.end,   idx: pts.length - 1, tanPt0: pts[pts.length - 2], tanPt1: pts[pts.length - 1], ord: lastOrd },
        ]
        for (const e of endInfo) {
          if (e.cap !== 'round') continue
          const endpoint = pts[e.idx]
          const tdx = e.tanPt1[0] - e.tanPt0[0], tdz = e.tanPt1[1] - e.tanPt0[1]
          const tlen = Math.hypot(tdx, tdz) || 1
          const tangent = [tdx / tlen, tdz / tlen]
          const perp = perps[e.idx]
          const capMeasure = measureForSegment(street, e.ord) || chainMeasure
          for (const [side, sideMeasure] of [[-1, capMeasure.left], [+1, capMeasure.right]]) {
            const rings = sideToRings(sideMeasure)
            for (const ring of rings) {
              ensure(ring.material)
              activeGroups[ring.material].push(
                ensureCCW(quarterCapRaw(endpoint, tangent, perp, side, ring.innerR, ring.outerR))
              )
            }
          }
        }
      }
    }

    // ── Corner plugs ─────────────────────────────────────────────
    for (const ix of ribbonsData.intersections) {
      if (ix.streets.length < 2) continue
      const IX = ix.point

      for (let ai = 0; ai < ix.streets.length; ai++) {
        for (let bi = ai + 1; bi < ix.streets.length; bi++) {
          const stA_ref = ix.streets[ai]
          const stB_ref = ix.streets[bi]

          // Skip same-street pairs (a street doesn't form corners with itself)
          if (stA_ref.name === stB_ref.name) continue

          // Resolve each ref to (chain, vertexIdx) by trusting chain-internal
          // intersection records + point proximity, NOT the IX-level
          // `stA_ref.ix`. derive.js's splice-shifter mutates `ix.streets[].ix`
          // by name, which corrupts the index whenever a corridor has
          // multiple same-name chains (Lasalle ×5, Park Ave ×4, etc.).
          // Chain-internal `st.intersections[].ix` stays correct because it's
          // shifted per-chain. Point proximity disambiguates which chain
          // actually touches this IX.
          // Walk mergedStreets (NOT raw ribbonsData.streets) so the corner
          // plug picks up live couplers + segmentMeasures from the Measure
          // tool. Without this, segMeasureAt below sees stale couplers and
          // the plug uses the wrong segment's measure when a chain has been
          // sub-divided in Measure.
          const resolveChain = (name, partnerName) => {
            for (const s of mergedStreets) {
              if (s.name !== name) continue
              for (const i of s.intersections) {
                if (!i.withStreets.includes(partnerName)) continue
                const v = s.points[i.ix]
                if (!v) continue
                if (Math.hypot(v[0] - IX[0], v[1] - IX[1]) < 0.5) {
                  return { st: s, ixIdx: i.ix }
                }
              }
            }
            return null
          }
          const resA = resolveChain(stA_ref.name, stB_ref.name)
          const resB = resolveChain(stB_ref.name, stA_ref.name)
          if (!resA || !resB) continue
          const stA_data = resA.st, stB_data = resB.st

          const ptsA = stA_data.points, ixA = resA.ixIdx
          const ptsB = stB_data.points, ixB = resB.ixIdx

          // Terminal detection. A street is "terminal at start" if ixA=0 (no pre-IX arm),
          // "terminal at end" if ixA=last (no post-IX arm). At a T-intersection, one street
          // terminates at the IX. Don't bail — compute the arm direction from whatever
          // segment IS available, and later skip the 2 of 4 quadrants where the missing
          // arm would be.
          const termA_start = ixA === 0
          const termA_end = ixA === ptsA.length - 1
          const termB_start = ixB === 0
          const termB_end = ixB === ptsB.length - 1
          if (termA_start && termA_end) continue  // degenerate street
          if (termB_start && termB_end) continue

          const perpsA = computePerps(ptsA)
          const perpsB = computePerps(ptsB)
          const perpA = perpsA[ixA]
          const perpB = perpsB[ixB]

          // Per-half-arm directions. For terminal endpoints, fall back to the single
          // available segment so dA_left = dA_right = that direction.
          const dA_left = termA_start ? segDir(ptsA, 0, 1) : segDir(ptsA, ixA - 1, ixA)
          const dA_right = termA_end ? segDir(ptsA, ixA - 1, ixA) : segDir(ptsA, ixA, ixA + 1)
          const dB_left = termB_start ? segDir(ptsB, 0, 1) : segDir(ptsB, ixB - 1, ixB)
          const dB_right = termB_end ? segDir(ptsB, ixB - 1, ixB) : segDir(ptsB, ixB, ixB + 1)
          const dA_avg = [(dA_left[0]+dA_right[0])/2, (dA_left[1]+dA_right[1])/2]
          const lA = Math.hypot(dA_avg[0], dA_avg[1]); dA_avg[0]/=lA; dA_avg[1]/=lA
          const dB_avg = [(dB_left[0]+dB_right[0])/2, (dB_left[1]+dB_right[1])/2]
          const lB = Math.hypot(dB_avg[0], dB_avg[1]); dB_avg[0]/=lB; dB_avg[1]/=lB

          // Corner plug picks up the measure of whichever segment contains
          // the intersection — so segmentMeasures overrides flow into the
          // sidewalk arc at the corner.
          const segMeasureAt = (st, idx) => {
            const ranges = segmentRangesForCouplers(st.points, st.couplers || [])
            if (!ranges.length) return ensureMeasure(st)
            let ord = ranges.findIndex(([a, b]) => a <= idx && idx < b)
            if (ord < 0) ord = ranges.length - 1
            return measureForSegment(st, ord) || ensureMeasure(st)
          }
          const measureA = segMeasureAt(stA_data, ixA)
          const measureB = segMeasureAt(stB_data, ixB)

          for (const sA of [1, -1]) {
            // Per-side refs: asymmetric measures may differ left vs right.
            const refA = refEdges(sA > 0 ? measureA.right : measureA.left)
            for (const sB of [1, -1]) {
              const refB = refEdges(sB > 0 ? measureB.right : measureB.left)

              // Corner plug: three materials (asphalt+curb+sidewalk) arc
              // around the bend. Sized to the NARROWER outside-curb width
              // (treelawn + sidewalk stripe) of the two meeting legs.
              // See project_corner_plug_rules.md and
              // project_corner_plug_open_problem.md.
              //   - Both legs have sidewalk → full plug (all three arcs)
              //   - Either leg lacks sidewalk → skip corner_sw; keep
              //     corner_curb + corner_asph (curb still needs to arc).
              //   - Both legs lack sidewalk → still generate curb arc.
              const hasSwA = refA.hasSidewalk
              const hasSwB = refB.hasSidewalk
              const swWidthA = hasSwA ? refA.propertyLine - refA.curbOuter : 0
              const swWidthB = hasSwB ? refB.propertyLine - refB.curbOuter : 0
              const plugSwWidth = (hasSwA && hasSwB)
                ? Math.min(swWidthA, swWidthB)
                : (hasSwA ? swWidthA : swWidthB)

              const curbOuterA = refA.curbOuter
              const curbOuterB = refB.curbOuter
              const asphOuterA = refA.curbInner
              const asphOuterB = refB.curbInner
              const swOuterA = hasSwA ? curbOuterA + plugSwWidth : curbOuterA
              const swOuterB = hasSwB ? curbOuterB + plugSwWidth : curbOuterB

              const P0o = [IX[0] + sA * perpA[0] * swOuterA, IX[1] + sA * perpA[1] * swOuterA]
              const P1o = [IX[0] + sB * perpB[0] * swOuterB, IX[1] + sB * perpB[1] * swOuterB]

              const testOo = lineX(P0o, dA_avg, P1o, dB_avg)
              if (!testOo) continue
              const dotA = (testOo[0]-IX[0])*dA_avg[0] + (testOo[1]-IX[1])*dA_avg[1]
              const dotB = (testOo[0]-IX[0])*dB_avg[0] + (testOo[1]-IX[1])*dB_avg[1]

              if (termA_start && dotA < 0) continue
              if (termA_end && dotA > 0) continue
              if (termB_start && dotB < 0) continue
              if (termB_end && dotB > 0) continue

              const edA = dotA < 0 ? dA_left : dA_right
              const edB = dotB < 0 ? dB_left : dB_right

              const oo = lineX(P0o, edA, P1o, edB)
              if (!oo) continue

              const P0c = [IX[0] + sA * perpA[0] * curbOuterA, IX[1] + sA * perpA[1] * curbOuterA]
              const P1c = [IX[0] + sB * perpB[0] * curbOuterB, IX[1] + sB * perpB[1] * curbOuterB]
              const P0a = [IX[0] + sA * perpA[0] * asphOuterA, IX[1] + sA * perpA[1] * asphOuterA]
              const P1a = [IX[0] + sB * perpB[0] * asphOuterB, IX[1] + sB * perpB[1] * asphOuterB]

              const swA = lineX(P0o, edA, P1c, edB)
              const swB = lineX(P1o, edB, P0c, edA)
              if (!swA || !swB) continue
              const swCtrl = [swA[0] + swB[0] - oo[0], swA[1] + swB[1] - oo[1]]

              const coA = lineX(P0o, edA, P1a, edB)
              const coB = lineX(P1o, edB, P0a, edA)
              if (!coA || !coB) continue
              const coCtrl = [coA[0] + coB[0] - oo[0], coA[1] + coB[1] - oo[1]]

              const pt1 = lineX(P0a, edA, P1a, edB)
              if (!pt1) continue

              activeGroups = (selectedCorridorNames && (
                selectedCorridorNames.has(stA_ref.name) ||
                selectedCorridorNames.has(stB_ref.name)
              )) ? groupsSelected : groups

              // ── Canonical 90° corner + per-quadrant affine matrix ──
              // Build the plug as a canonical 90° template (asph corner,
              // sidewalk pad, curb arc), then map to actual world via
              // M = [edA/sinθ | edB/sinθ]. The matrix preserves both leg
              // directions and perpendicular distances. Curb is rendered
              // separately as a stroke on the asph/sidewalk boundary.
              if (hasSwA && hasSwB) {
                const plug = buildCornerPlug(IX, edA, edB, sA, sB, refA, refB)
                if (plug) {
                  ensure('corner_sw')
                  activeGroups['corner_sw'].push(ensureCCW(plug.swFill))
                  ensure('corner_asph')
                  activeGroups['corner_asph'].push(ensureCCW(plug.asphFill))
                  // boundary curve collected for stroke pass below; carry
                  // the plug's curb width so the stroke matches the legs.
                  cornerBoundaries.push({ boundary: plug.boundary, width: plug.curbStrokeWidth })
                }
              }
            }
          }
        }
      }
    }

    // ── Curb stroke pass: paint a thin band on each corner plug's
    // asph/sidewalk boundary curve. Stroke width is per-plug — average of
    // the two meeting legs' curbs (carried on each entry as `width`) — so
    // chains with non-default curbs render with matching corners. ──
    if (cornerBoundaries.length) {
      if (!groups['corner_curb']) groups['corner_curb'] = []
      for (const { boundary, width } of cornerBoundaries) {
        const w = width > 0 ? width : 0.15  // fallback when two zero-curb legs meet
        const stroke = strokePolylineRaw(boundary, w)
        if (stroke) groups['corner_curb'].push(ensureCCW(stroke))
      }
    }

    // Corner-plug materials inherit color from the underlying band material:
    // sidewalk plug uses sidewalk color, curb plug uses curb color, etc.
    const CORNER_SRC = { corner_sw: 'sidewalk', corner_curb: 'curb', corner_asph: 'asphalt' }
    function buildMeshes(groupMap, selectedFlag) {
      return Object.entries(groupMap).map(([id, parts]) => {
        const isCorner = id.startsWith('corner_')
        const pri = isCorner ? CORNER_PRIORITY[id] : (BAND_PRIORITY[id] ?? 5)
        const srcMat = isCorner ? CORNER_SRC[id] : id
        const layerId = BAND_TO_LAYER[srcMat]
        const color =
          (layerId && layerColors[layerId]) ||
          (layerId && DEFAULT_LAYER_COLORS[layerId]) ||
          BAND_COLORS[srcMat] ||
          LEGACY_COLORS[id] ||
          LEGACY_COLORS.asphalt
        let geo = mergeRawGeo(parts)
        if (geo) geo = subdivideGeo(geo, 30)
        return { id, geo, color, pri, selected: selectedFlag }
      }).filter(m => m.geo)
    }
    const result = [
      ...buildMeshes(groups, false),
      ...buildMeshes(groupsSelected, true),
    ]

    // ── DIAGNOSTIC marker meshes (renderOrder 99 — sit above ribbons) ──
    const DIAG_COLORS = {
      red:     '#ff0033',  // oo — sw L apex
      orange:  '#ff9900',  // swA, swB — sw leg endpoints
      yellow:  '#ffee00',  // swCtrl — sw bezier control
      cyan:    '#00ddff',  // coA, coB — asph leg endpoints
      magenta: '#ff00ff',  // pt1 — asph L apex (= coCtrl)
      blue:    '#0033ff',  // leg A chain start/end (Mississippi)
      green:   '#00aa44',  // leg B chain start/end (Park)
    }
    for (const [color, parts] of Object.entries(diagMarkers)) {
      if (!parts.length) continue
      const geo = mergeRawGeo(parts)
      if (!geo) continue
      result.push({ id: `diag_${color}`, geo, color: DIAG_COLORS[color], pri: 99, selected: false })
    }

    // Winding diagnostic — check first triangle of first geometry
    if (result.length > 0) {
      const g = result[0].geo
      const pos = g.attributes.position.array
      const nrm = g.attributes.normal.array
      const idx = g.index.array
      const i0 = idx[0], i1 = idx[1], i2 = idx[2]
      const ax = pos[i0*3], ay = pos[i0*3+1], az = pos[i0*3+2]
      const bx = pos[i1*3], by = pos[i1*3+1], bz = pos[i1*3+2]
      const cx = pos[i2*3], cy = pos[i2*3+1], cz = pos[i2*3+2]
      // cross product (B-A) × (C-A)
      const e1x = bx-ax, e1y = by-ay, e1z = bz-az
      const e2x = cx-ax, e2y = cy-ay, e2z = cz-az
      const crossY = e1z*e2x - e1x*e2z
      console.log('[winding]', result[0].id,
        'tri verts:', [ax,ay,az], [bx,by,bz], [cx,cy,cz],
        'cross Y:', crossY, crossY > 0 ? 'UP (CCW from above)' : 'DOWN (CW from above)',
        'stored normal:', [nrm[i0*3], nrm[i0*3+1], nrm[i0*3+2]])
    }

    return result
  }, [liveCenterlines, layerColors, ribbons, renderRibbons, useBoundary, selectedCorridorNames])

  // ── Edge strokes (measure mode only) ──────────────────────────
  // When Measure is active, emit thin opaque half-rings at each stripe's
  // outer edge. Combined with translucent ribbon fills this reads as
  // "field + stroke" — aerial shows through the fills, boundaries stay crisp.
  const edgeStrokes = useMemo(() => {
    if (!authoringActive) return []
    const liveById = new Map()
    const liveByName = new Map()
    if (liveCenterlines) {
      for (const cl of liveCenterlines) {
        if (!cl || cl.disabled) continue
        if (cl.id) liveById.set(cl.id, cl)
        if (cl.name && !liveByName.has(cl.name)) liveByName.set(cl.name, cl)
      }
    }
    const lookupLive = (st) =>
      (st.skelId && liveById.get(st.skelId)) || liveByName.get(st.name) || null
    // Single source of truth with Measure/Design — both modes strike the
    // same edges so Survey's outer boundary matches Measure's property line
    // matches Design's calculated map. Measure overlays live measure
    // overrides; Survey renders the same streets but only the outer ring
    // (see renderer below).
    const pointsNearlyEqual = (a, b, eps = 0.5) =>
      a && b && Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps
    const mergedStreets = renderRibbons.streets.map(st => {
      const live = lookupLive(st)
      if (!live) return st
      const out = { ...st }
      if (live.measure?.left) {
        out.measure = {
          left: { ...live.measure.left },
          right: { ...live.measure.right },
          symmetric: live.measure.symmetric,
        }
      }
      if (live.couplers && live.couplers.length) out.couplers = live.couplers
      if (live.segmentMeasures) out.segmentMeasures = live.segmentMeasures
      // Anchor: live override wins; otherwise inherit ribbons.json default.
      if (live.anchor) out.anchor = live.anchor
      if (live.capStart !== undefined || live.capEnd !== undefined) {
        const cLive = live.points
        const stFirst = st.points[0], stLast = st.points[st.points.length - 1]
        const cFirst = cLive && cLive[0]
        const cLast = cLive && cLive[cLive.length - 1]
        const applyStart = live.capStart !== undefined && pointsNearlyEqual(stFirst, cFirst)
        const applyEnd = live.capEnd !== undefined && pointsNearlyEqual(stLast, cLast)
        if (applyStart || applyEnd) {
          out.capEnds = {
            start: applyStart ? (live.capStart ?? null) : (st.capEnds?.start ?? null),
            end: applyEnd ? (live.capEnd ?? null) : (st.capEnds?.end ?? null),
          }
        }
      }
      return out
    })
    // Streets-only for edge strokes — alleys + paths are shown via their
    // silhouette alone in Survey/Measure. Dense path networks (park internal
    // footpaths) produce chaotic parallel-rail noise when every side of
    // every path emits strokes; the blue envelope carries enough signal.
    const streets = mergedStreets.filter(st => !useBoundary || streetInBoundary(st.points))
    const STROKE_W = 0.2
    // Keyed by material+isOuter so we can render property-line strokes
    // separately (used by Survey mode which only draws the outer ring).
    const groups = {}
    for (const street of streets) {
      if (street.points.length < 2) continue
      const perps = computePerps(street.points)
      const chainM = ensureMeasure(street)
      const segRanges = segmentRangesForCouplers(street.points, street.couplers || [])
      const ranges = segRanges.length ? segRanges : [[0, street.points.length - 1]]
      const caps = street.capEnds || { start: null, end: null }
      const lastSegOrd = ranges.length - 1
      const ptsAll = street.points
      const nAll = ptsAll.length
      for (let ord = 0; ord < ranges.length; ord++) {
        const range = ranges[ord]
        const baseMeasure = measureForSegment(street, ord) || chainM
        const measure = inboardPedZoneless(street, baseMeasure)
        const segPts = street.points.slice(range[0], range[1] + 1)
        const segPp = perps.slice(range[0], range[1] + 1)
        for (const [side, sideMeasure] of [[-1, measure.left], [+1, measure.right]]) {
          const rings = sideToRings(sideMeasure)
          for (let ri = 0; ri < rings.length; ri++) {
            const ring = rings[ri]
            const isOuter = ri === rings.length - 1
            const key = ring.material + (isOuter ? ':outer' : '')
            if (!groups[key]) groups[key] = { material: ring.material, isOuter, parts: [] }
            const inner = Math.max(0, ring.outerR - STROKE_W)
            const outer = ring.outerR + STROKE_W
            groups[key].parts.push(halfRingRaw(segPts, inner, outer, segPp, side))

            // Endcap stroke — outer ring only, at chain ends only (not at
            // coupler boundaries). 'round' = thin half-annulus arc.
            // 'blunt' = perpendicular bar closing the outline.
            if (!isOuter) continue
            if (ord === 0 && caps.start && nAll >= 2) {
              const ep = ptsAll[0]
              const tdx = ep[0] - ptsAll[1][0], tdz = ep[1] - ptsAll[1][1]
              const tl = Math.hypot(tdx, tdz) || 1
              const tan = [tdx / tl, tdz / tl]
              if (caps.start === 'round') {
                groups[key].parts.push(ensureCCW(quarterCapRaw(ep, tan, perps[0], side, inner, outer)))
              } else if (caps.start === 'blunt') {
                groups[key].parts.push(ensureCCW(bluntCapStrokeRaw(ep, tan, perps[0], side, ring.outerR, STROKE_W * 2)))
              }
            }
            if (ord === lastSegOrd && caps.end && nAll >= 2) {
              const ep = ptsAll[nAll - 1]
              const tdx = ep[0] - ptsAll[nAll - 2][0], tdz = ep[1] - ptsAll[nAll - 2][1]
              const tl = Math.hypot(tdx, tdz) || 1
              const tan = [tdx / tl, tdz / tl]
              if (caps.end === 'round') {
                groups[key].parts.push(ensureCCW(quarterCapRaw(ep, tan, perps[nAll - 1], side, inner, outer)))
              } else if (caps.end === 'blunt') {
                groups[key].parts.push(ensureCCW(bluntCapStrokeRaw(ep, tan, perps[nAll - 1], side, ring.outerR, STROKE_W * 2)))
              }
            }
          }
        }
      }
    }
    return Object.values(groups).map(({ material, isOuter, parts }) => {
      const layerId = BAND_TO_LAYER[material]
      const color =
        (layerId && layerColors[layerId]) ||
        (layerId && DEFAULT_LAYER_COLORS[layerId]) ||
        BAND_COLORS[material] || LEGACY_COLORS.asphalt
      const geo = mergeRawGeo(parts)
      return { id: material, geo, color, isOuter }
    }).filter(m => m.geo)
  }, [authoringActive, liveCenterlines, layerColors, ribbons, renderRibbons, useBoundary])

  // ── Silhouette meshes (authoring-mode envelope rendering) ─────
  // In Survey every street renders as one translucent outer silhouette
  // (centerline → outer ring on each side), with any insert couplers
  // (medians, future jogs) carving the inner edge. The full per-stripe
  // stack is suppressed — operators author centerline structure here, not
  // cross-section details.
  //
  // In Measure the same silhouette is used for UNSELECTED streets; the
  // selected street escalates to the full per-stripe rendering via the
  // existing `meshes` path. Gives Measure a clear "this is my subject"
  // affordance instead of every street competing visually.
  const silhouetteMeshes = useMemo(() => {
    if (!surveyActive) return []
    // Single source of truth — the silhouette iterates the same streets
    // array that Measure/Design render from. That keeps Survey's blue
    // envelope pixel-aligned with the cross-section fills/strokes of the
    // other modes. `renderRibbons.streets` already resolves authored vs.
    // pipeline per street (substantive authored wins; stubs fall back to
    // pipeline, which is why Benton Place's loop shows here even though
    // its authored centerline is an 8-pt stub).
    // Merge live cap edits onto ribbons.json streets so the dropdown
    // updates the silhouette in Survey on the next render.
    const liveById = new Map()
    const liveByName = new Map()
    if (liveCenterlines) {
      for (const cl of liveCenterlines) {
        if (!cl || cl.disabled) continue
        if (cl.id) liveById.set(cl.id, cl)
        if (cl.name && !liveByName.has(cl.name)) liveByName.set(cl.name, cl)
      }
    }
    const lookupLive = (st) =>
      (st.skelId && liveById.get(st.skelId)) || liveByName.get(st.name) || null
    const pointsNearlyEqual = (a, b, eps = 0.5) =>
      a && b && Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps
    const mergedStreets = renderRibbons.streets.map(st => {
      const live = lookupLive(st)
      if (!live) return st
      const out = { ...st }
      if (live.measure?.left && live.measure?.right) {
        out.measure = {
          left: { ...live.measure.left },
          right: { ...live.measure.right },
          symmetric: live.measure.symmetric,
        }
      }
      if (live.couplers && live.couplers.length) out.couplers = live.couplers
      if (live.segmentMeasures) out.segmentMeasures = live.segmentMeasures
      if (live.anchor) out.anchor = live.anchor
      if (live.capStart !== undefined || live.capEnd !== undefined) {
        const cLive = live.points
        const stFirst = st.points[0], stLast = st.points[st.points.length - 1]
        const cFirst = cLive && cLive[0]
        const cLast = cLive && cLive[cLive.length - 1]
        const applyStart = live.capStart !== undefined && pointsNearlyEqual(stFirst, cFirst)
        const applyEnd = live.capEnd !== undefined && pointsNearlyEqual(stLast, cLast)
        if (applyStart || applyEnd) {
          out.capEnds = {
            start: applyStart ? (live.capStart ?? null) : (st.capEnds?.start ?? null),
            end: applyEnd ? (live.capEnd ?? null) : (st.capEnds?.end ?? null),
          }
        }
      }
      return out
    })
    const extra = [
      ...(renderRibbons.alleys || []).map((p, i) => pathAsStreet({ ...p, kind: 'alley' }, i)),
      ...(renderRibbons.paths  || []).map((p, i) => pathAsStreet(p, i)),
    ]
    const parts = []
    const partsSelected = []
    for (const st of [...mergedStreets, ...extra]) {
      if (!st || st.disabled) continue
      if (!st.points || st.points.length < 2) continue
      if (useBoundary && !streetInBoundary(st.points)) continue

      const measure = st.measure?.left && st.measure?.right
        ? st.measure
        : ensureMeasure(st)
      const perps = computePerps(st.points)
      const inserts = resolveInserts(st)
      const target = (selectedCorridorNames && selectedCorridorNames.has(st.name))
        ? partsSelected : parts

      for (const [side, sideMeasure] of [[-1, measure.left], [+1, measure.right]]) {
        const rings = sideToRings(sideMeasure)
        if (!rings.length) continue
        const outerR = rings[rings.length - 1].outerR
        const innerArr = new Float64Array(st.points.length)
        const outerArr = new Float64Array(st.points.length)
        for (let i = 0; i < st.points.length; i++) {
          const lat = inserts[i]?.lateralOffset || 0
          const signed = lat * side
          innerArr[i] = Math.max(0, (inserts[i]?.medianHW || 0) - signed)
          outerArr[i] = Math.max(0, outerR + signed)
        }
        target.push(halfRingVarRaw(st.points, innerArr, outerArr, perps, side))

        // Round endcaps: extend the silhouette around cul-de-sacs with a
        // quarter-disk per side (innerR=0 → filled). Blunt caps need no
        // extra fill — halfRingVarRaw already terminates perpendicular.
        const caps = st.capEnds || { start: null, end: null }
        const n = st.points.length
        if (caps.start === 'round' && n >= 2) {
          const ep = st.points[0]
          const tdx = ep[0] - st.points[1][0], tdz = ep[1] - st.points[1][1]
          const tl = Math.hypot(tdx, tdz) || 1
          target.push(ensureCCW(quarterCapRaw(
            ep, [tdx / tl, tdz / tl], perps[0], side, innerArr[0], outerArr[0]
          )))
        }
        if (caps.end === 'round' && n >= 2) {
          const ep = st.points[n - 1]
          const tdx = ep[0] - st.points[n - 2][0], tdz = ep[1] - st.points[n - 2][1]
          const tl = Math.hypot(tdx, tdz) || 1
          target.push(ensureCCW(quarterCapRaw(
            ep, [tdx / tl, tdz / tl], perps[n - 1], side, innerArr[n - 1], outerArr[n - 1]
          )))
        }
      }
    }
    const out = []
    const geo = mergeRawGeo(parts)
    if (geo) out.push({ id: 'silhouette', geo, selected: false })
    const geoSelected = mergeRawGeo(partsSelected)
    if (geoSelected) out.push({ id: 'silhouette-selected', geo: geoSelected, selected: true })
    return out
  }, [surveyActive, renderRibbons, useBoundary, selectedCorridorNames, liveCenterlines])

  // ── Path ribbons (alleys + footways/cycleways/steps/paths) ────
  // Pavement-only ribbons for non-street roadways. Rendered in Design
  // and Measure (Survey is covered by silhouetteMeshes above). Grouped
  // by kind so the Designer panel's alley/footway color picker paints
  // them.
  const pathRibbons = useMemo(() => {
    const groups = {}  // kind → [raw parts]
    const push = (kind, geo) => { (groups[kind] ||= []).push(geo) }
    // Each path entry carries its own `kind` (footway/cycleway/steps/path);
    // alleys are tagged at the source level. Group by that kind so the
    // Designer panel's separate pickers (footway / cycleway / steps / path)
    // and visibility toggles each apply to their own ribbons.
    const sources = [
      { list: ribbons.alleys || [], defaultKind: 'alley' },
      { list: ribbons.paths  || [], defaultKind: 'footway' },
    ]
    for (const { list, defaultKind } of sources) {
      for (let i = 0; i < list.length; i++) {
        const p = list[i]
        const kind = p.kind || defaultKind
        const st = pathAsStreet({ ...p, kind }, i)
        if (useBoundary && !streetInBoundary(st.points)) continue
        const perps = computePerps(st.points)
        for (const [side, sideMeasure] of [[-1, st.measure.left], [+1, st.measure.right]]) {
          const rings = sideToRings(sideMeasure)
          for (const ring of rings) {
            push(st.kind, halfRingRaw(st.points, ring.innerR, ring.outerR, perps, side))
          }
        }
      }
    }
    return Object.entries(groups).map(([kind, parts]) => {
      let geo = mergeRawGeo(parts)
      if (geo) geo = subdivideGeo(geo, 30)
      const color = layerColors[kind] || DEFAULT_LAYER_COLORS[kind] || MAT.asphalt
      return { id: kind, geo, color }
    }).filter(m => m.geo)
  }, [ribbons, layerColors, useBoundary])

  // ── Live-clipped faces ────────────────────────────────────────
  // Face rings emit unclipped from the pipeline (centerline-reach). Here
  // we subtract the live ribbon silhouette (per-side pavementHW + curb +
  // treelawn + sidewalk) from each face, so blocks shrink/grow as Measure
  // drags the ribbon widths. Debounced by 120 ms — the main ribbon stack
  // updates live on drag; faces settle right after handle release.
  const [stableLiveCenterlines, setStableLiveCenterlines] = useState(liveCenterlines)
  useEffect(() => {
    const t = setTimeout(() => setStableLiveCenterlines(liveCenterlines), 120)
    return () => clearTimeout(t)
  }, [liveCenterlines])

  const clippedFaces = useMemo(() => {
    const raw = (ribbons.faces || []).filter(f => !useBoundary || faceInBoundary(f.ring))
    if (!raw.length) return raw
    try {
      // Merge live measures onto pipeline streets by name (same pattern as
      // `meshes` useMemo) so the clip tracks whatever Measure just drew.
      const liveById = new Map()
      const liveByName = new Map()
      if (stableLiveCenterlines) {
        for (const cl of stableLiveCenterlines) {
          if (!cl || cl.disabled) continue
          if (cl.id) liveById.set(cl.id, cl)
          if (cl.name && !liveByName.has(cl.name)) liveByName.set(cl.name, cl)
        }
      }
      // Forward couplers + segmentMeasures along with chain measure so the
      // clip can walk segments. With per-segment overrides, a single chain
      // contributes multiple clip rings (one per segment, per side).
      const ne = (a, b) => a && b && Math.abs(a[0] - b[0]) < 0.5 && Math.abs(a[1] - b[1]) < 0.5
      const streetsToClip = ribbons.streets.map(st => {
        const live = (st.skelId && liveById.get(st.skelId)) || liveByName.get(st.name) || null
        let capEnds = st.capEnds || { start: null, end: null }
        if (live && (live.capStart !== undefined || live.capEnd !== undefined)) {
          const cLive = live.points
          const stFirst = st.points[0], stLast = st.points[st.points.length - 1]
          const cFirst = cLive && cLive[0]
          const cLast = cLive && cLive[cLive.length - 1]
          const applyStart = live.capStart !== undefined && ne(stFirst, cFirst)
          const applyEnd = live.capEnd !== undefined && ne(stLast, cLast)
          if (applyStart || applyEnd) {
            capEnds = {
              start: applyStart ? (live.capStart ?? null) : (capEnds.start ?? null),
              end: applyEnd ? (live.capEnd ?? null) : (capEnds.end ?? null),
            }
          }
        }
        return {
          points: st.points,
          measure: (live?.measure?.left && live?.measure?.right) ? live.measure : st.measure,
          couplers: live?.couplers || st.couplers,
          segmentMeasures: live?.segmentMeasures,
          anchor: live?.anchor || st.anchor,
          innerSign: st.innerSign,
          capEnds,
          // Operator-disabled chains contribute no clip polygon — toggling a
          // chain off in Measure stops it from carving block faces.
          disabled: !!live?.disabled,
        }
      })

      const SCALE = 1000
      const toClipper = (x, z) => ({ X: Math.round(x * SCALE), Y: Math.round(z * SCALE) })
      const { Clipper, PolyType, ClipType, PolyFillType, Paths } = clipperLib

      // Per-side ribbon clip polygons. Building a symmetric offset at
      // min(L,R) (what the old pipeline did) means the face never updates
      // when you widen ONE side — MIN doesn't move. So for each side we
      // build a closed ring = centerline + its own side-offset polyline,
      // and union all sides across all streets. Widening the park side
      // of Missouri now shrinks the park polygon; widening the opposite
      // side moves only that side.
      const offsetPolyline = (points, perps, sideSign, W) => {
        const out = new Array(points.length)
        for (let i = 0; i < points.length; i++) {
          const [x, z] = points[i]
          const [px, pz] = perps[i]
          out[i] = [x + sideSign * px * W, z + sideSign * pz * W]
        }
        return out
      }
      const ribbonClipPaths = []
      for (const st of streetsToClip) {
        if (st.disabled) continue
        if (!st.points || st.points.length < 2) continue
        if (!st.measure?.left || !st.measure?.right) continue
        const perps = computePerps(st.points)
        const segRanges = segmentRangesForCouplers(st.points, st.couplers || [])
        const ranges = segRanges.length ? segRanges : [[0, st.points.length - 1]]
        for (let ord = 0; ord < ranges.length; ord++) {
          const [from, to] = ranges[ord]
          const baseM = (st.segmentMeasures && st.segmentMeasures[String(ord)]) || st.measure
          if (!baseM?.left || !baseM?.right) continue
          const m = inboardPedZoneless(st, baseM)
          const segPts = st.points.slice(from, to + 1)
          const segPp = perps.slice(from, to + 1)
          // Width per side. Skip entirely when the side has no ped zone
          // and no pavement (inner-edge synthetic inboard) — otherwise the
          // CURB_WIDTH constant carves a sliver into the median.
          const widthFor = (s) => {
            if (!s) return 0
            const hw = s.pavementHW || 0, tl = s.treelawn || 0, sw = s.sidewalk || 0
            const cw = Number.isFinite(s.curb) ? s.curb : CURB_WIDTH
            if (!hw && !tl && !sw && (s.terminal === 'none' || !s.terminal)) return 0
            return hw + cw + tl + sw
          }
          const outerL = widthFor(m.left)
          const outerR = widthFor(m.right)
          if (outerL <= 0 && outerR <= 0) continue
          const isFirstSeg = ord === 0
          const isLastSeg = ord === ranges.length - 1
          const ARC_N = 8
          for (const [sideSign, W] of [[-1, outerL], [+1, outerR]]) {
            if (W <= 0) continue
            const outerEdge = offsetPolyline(segPts, segPp, sideSign, W)
            const ring = []
            // Centerline forward
            for (const p of segPts) ring.push(toClipper(p[0], p[1]))
            // End cap: bulge from pt[last] around to offset[last]. Round →
            // quarter-disk arc; blunt → implicit straight (no insert needed).
            if (isLastSeg && st.capEnds?.end === 'round' && segPts.length >= 2) {
              const last = segPts.length - 1
              const ep = segPts[last]
              const tdx = ep[0] - segPts[last - 1][0], tdz = ep[1] - segPts[last - 1][1]
              const tl = Math.hypot(tdx, tdz) || 1
              const tx = tdx / tl, tz = tdz / tl
              const px = segPp[last][0],  pz = segPp[last][1]
              for (let i = 0; i < ARC_N; i++) {
                const a = (i / ARC_N) * (Math.PI / 2)
                const ca = Math.cos(a), sa = Math.sin(a)
                const dx = ca * tx + sa * sideSign * px
                const dz = ca * tz + sa * sideSign * pz
                ring.push(toClipper(ep[0] + dx * W, ep[1] + dz * W))
              }
            }
            // Offset edge backward
            for (let i = outerEdge.length - 1; i >= 0; i--) ring.push(toClipper(outerEdge[i][0], outerEdge[i][1]))
            // Start cap: bulge from offset[0] around to pt[0].
            if (isFirstSeg && st.capEnds?.start === 'round' && segPts.length >= 2) {
              const ep = segPts[0]
              const tdx = ep[0] - segPts[1][0], tdz = ep[1] - segPts[1][1]
              const tl = Math.hypot(tdx, tdz) || 1
              const tx = tdx / tl, tz = tdz / tl
              const px = segPp[0][0],  pz = segPp[0][1]
              for (let i = 1; i <= ARC_N; i++) {
                const a = (i / ARC_N) * (Math.PI / 2)
                const ca = Math.cos(a), sa = Math.sin(a)
                const dx = ca * sideSign * px + sa * tx
                const dz = ca * sideSign * pz + sa * tz
                ring.push(toClipper(ep[0] + dx * W, ep[1] + dz * W))
              }
            }
            ribbonClipPaths.push(ring)
          }
        }
      }
      if (!ribbonClipPaths.length) return raw

      const unionC = new Clipper()
      unionC.AddPaths(ribbonClipPaths, PolyType.ptSubject, true)
      const ribbonUnion = new Paths()
      unionC.Execute(ClipType.ctUnion, ribbonUnion, PolyFillType.pftNonZero, PolyFillType.pftNonZero)

      const out = []
      for (const f of raw) {
        if (f.ring.length < 3) { out.push(f); continue }
        const subj = new Paths()
        subj.push(f.ring.map(([x, z]) => toClipper(x, z)))
        const diff = new Clipper()
        diff.AddPaths(subj, PolyType.ptSubject, true)
        diff.AddPaths(ribbonUnion, PolyType.ptClip, true)
        const result = new Paths()
        diff.Execute(ClipType.ctDifference, result, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
        if (!result.length) continue
        for (const ring of result) {
          if (ring.length < 3) continue
          out.push({ ring: ring.map(p => [p.X / SCALE, p.Y / SCALE]), use: f.use })
        }
      }
      return out
    } catch (e) {
      console.warn('[faces] runtime clip failed; using unclipped:', e)
      return raw
    }
  }, [ribbons, useBoundary, stableLiveCenterlines])

  // ── Face fills (land-use color per block) ─────────────────────
  const faceMeshes = useMemo(() => {
    const faces = clippedFaces
    if (!faces.length) return []

    // Park + residential faces each get their own grass material (richer
    // shaders for shot mode). Other faces group by color and use the flat
    // material.
    const byColor = new Map()
    const parkRings = []
    const residentialRings = []
    for (const face of faces) {
      if (face.use === 'park') { parkRings.push(face.ring); continue }
      if (face.use === 'residential') { residentialRings.push(face.ring); continue }
      const color = (luColors && luColors[face.use]) || LAND_USE_COLORS[face.use] || LAND_USE_COLORS.unknown
      if (!byColor.has(color)) byColor.set(color, [])
      byColor.get(color).push(face.ring)
    }
    if (parkRings.length) byColor.set('__park__', parkRings)
    if (residentialRings.length) byColor.set('__residential__', residentialRings)

    const result = []
    for (const [color, rings] of byColor) {
      const allPos = [], allNrm = [], allIdx = []
      let vOffset = 0
      for (const ring of rings) {
        if (ring.length < 3) continue
        const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, z)))
        const shapeGeo = new THREE.ShapeGeometry(shape)
        const pos = shapeGeo.attributes.position.array
        const idx = shapeGeo.index.array
        for (let i = 0; i < pos.length; i += 3) {
          allPos.push(pos[i], 0, pos[i + 1])
          allNrm.push(0, 1, 0)
        }
        // Flip winding (ShapeGeometry XY→XZ remap reverses winding)
        for (let i = 0; i < idx.length; i += 3) {
          allIdx.push(idx[i] + vOffset, idx[i + 2] + vOffset, idx[i + 1] + vOffset)
        }
        vOffset += pos.length / 3
        shapeGeo.dispose()
      }
      if (allPos.length === 0) continue
      let geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(allPos, 3))
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(allNrm, 3))
      geo.setIndex(allIdx)
      geo = subdivideGeo(geo, 30)
      result.push({
        geo, color,
        isPark: color === '__park__',
        isResidential: color === '__residential__',
      })
    }
    return result
  }, [luColors, clippedFaces])

  // ── Emergent median polygons ─────────────────────────────────
  // `ribbons.medians` is the space between two paired oneway carriageways
  // of the same name, derived in derive.js from the two centerlines.
  // Rendered as flat polygons at ground level with a grass default. The
  // carriageway ribbons paint over the outside of each median where
  // pavement overlaps; what's visibly left IS the landscaped median.
  const medianMeshes = useMemo(() => {
    const meds = (ribbons.medians || []).filter(m => !useBoundary || faceInBoundary(m.ring))
    if (!meds.length) return []
    // Skip medians belonging to the selected corridor entirely — the
    // aerial should show through the authoring region, including the
    // median, for alignment. Real-world median grass is visible in the
    // aerial photo anyway.
    const filtered = selectedCorridorNames
      ? meds.filter(m => !selectedCorridorNames.has(m.name))
      : meds
    if (!filtered.length) return []
    const allPos = [], allNrm = [], allIdx = []
    let vOffset = 0
    for (const m of filtered) {
      if (m.ring.length < 3) continue
      const shape = new THREE.Shape(m.ring.map(([x, z]) => new THREE.Vector2(x, z)))
      const shapeGeo = new THREE.ShapeGeometry(shape)
      const pos = shapeGeo.attributes.position.array
      const idx = shapeGeo.index.array
      for (let i = 0; i < pos.length; i += 3) {
        allPos.push(pos[i], 0, pos[i + 1])
        allNrm.push(0, 1, 0)
      }
      for (let i = 0; i < idx.length; i += 3) {
        allIdx.push(idx[i] + vOffset, idx[i + 2] + vOffset, idx[i + 1] + vOffset)
      }
      vOffset += pos.length / 3
      shapeGeo.dispose()
    }
    if (allPos.length === 0) return []
    let geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(allPos, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(allNrm, 3))
    geo.setIndex(allIdx)
    geo = subdivideGeo(geo, 30)
    return [{ geo }]
  }, [ribbons, useBoundary, selectedCorridorNames])

  // Grass material for park faces — shared by Designer (flat ambient) and
  // shots (full lighting). Lamp lightmap wires in night glow. Sun altitude
  // is updated per-frame below.
  const parkGrass = useMemo(() => {
    const g = makeGrassMaterial({ lampLightmap: getLampLightmap() })
    if (!flat) patchTerrain(g.material, { perVertex: true })
    return g
  }, [flat])
  // Residential grass — lighter/more suburban green. Base color can be
  // overridden via the Designer lot/residential picker.
  const residentialGrass = useMemo(() => {
    const base = (luColors && luColors.residential) || LAND_USE_COLORS.residential
    const g = makeGrassMaterial({ lampLightmap: getLampLightmap(), color: base })
    if (!flat) patchTerrain(g.material, { perVertex: true })
    return g
  }, [flat, luColors])
  useFrame(() => {
    const sP = parkGrass.shaderRef.current
    if (sP) sP.uniforms.uSunAltitude.value = useTimeOfDay.getState().getLightingPhase().sunAltitude
    const sR = residentialGrass.shaderRef.current
    if (sR) sR.uniforms.uSunAltitude.value = useTimeOfDay.getState().getLightingPhase().sunAltitude
  })

  // ── Materials: terrain displacement + shadow-tinted flat ──────
  const makeMaterial = useMemo(() => {
    const fragShader = flat ? CARTOGRAPH_FLAT : SHADOW_TINTED_FLAT
    const cacheKey = flat ? 'sr-flat' : 'sr-shadow'
    return (color, pri, fade = null, opts = {}) => {
      const mat = new THREE.MeshStandardMaterial({
        color: opts.surveyActive ? ARCH_BLUE : color,
        roughness: 0.9, metalness: 0, side: THREE.FrontSide,
        transparent: !!fade || !!opts.measureActive || !!opts.surveyActive || !!opts.selectedCorridor,
        // Selected corridor becomes MORE translucent than any base mode
        // so the aerial underneath is clearly visible for alignment. It
        // always reads as more see-through than the rest of the ribbons
        // around it, in any tool.
        // Translucency strategy:
        //   Selected corridor in Measure → 0.55 (see edits land while aerial reads through)
        //   Selected corridor in Survey  → 0.15 (silhouette + aerial alignment)
        //   Survey, unselected           → 0.28 (all chains slightly translucent in Survey)
        //   Measure, unselected          → 1.0  (only the chain you're editing is translucent)
        //   Default (no tool)            → 1.0
        opacity: opts.selectedCorridor
          ? (opts.measureActive ? 0.55 : 0.15)
          : (opts.surveyActive ? 0.28 : 1),
        // Negative offset pulls ribbons toward the camera (beats terrain at 0).
        // More-negative = closer; higher pri should win, so factor = -pri.
        polygonOffset: true, polygonOffsetFactor: -pri, polygonOffsetUnits: -pri * 4,
      })
      mat.onBeforeCompile = (shader) => {
        assignTerrainUniforms(shader)
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\n' + TERRAIN_DECL + (flat ? '' : '\n' + TERRAIN_CLIP_VARYING_DECL))
          .replace('#include <begin_vertex>', TERRAIN_DISPLACE + (flat ? '' : '\n' + TERRAIN_CLIP_VERTEX))
          .replace('#include <beginnormal_vertex>', TERRAIN_NORMAL)
        if (flat) {
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <lights_fragment_maps>', fragShader)
        } else {
          // Non-flat (shots): SHADOW_TINTED_FLAT with π compensation — palette
          // colors land near their Designer tone in full light, darken toward
          // 25% in shadow. Terrain-edge alpha fade is baked into the shader.
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\n' + TERRAIN_CLIP_VARYING_DECL + '\n' + TERRAIN_DECL)
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <lights_fragment_maps>', fragShader)
        }
        if (fade) {
          shader.uniforms.uFadeCenter = { value: new THREE.Vector2(fade.center.x, fade.center.z) }
          shader.uniforms.uFadeInner  = { value: fade.inner }
          shader.uniforms.uFadeOuter  = { value: fade.outer }
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vFadeWorldPos;')
            .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvFadeWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vFadeWorldPos;\nuniform vec2 uFadeCenter;\nuniform float uFadeInner;\nuniform float uFadeOuter;')
            .replace('#include <opaque_fragment>',
              '#include <opaque_fragment>\n' +
              'float _fadeR = distance(vFadeWorldPos.xz, uFadeCenter);\n' +
              'gl_FragColor.a *= 1.0 - smoothstep(uFadeInner, uFadeOuter, _fadeR);')
        }
      }
      const fadeKey = fade ? `-f${fade.inner}-${fade.outer}` : ''
      mat.customProgramCacheKey = () => (flat ? 'sr-flat' : 'sr-pbr-v3') + fadeKey
      return mat
    }
  }, [flat])

  const hide = hiddenLayers || {}

  const LAYER_MAP = {
    asphalt: 'street', corner_asph: 'street',
    highway: 'highway',
    gutter: 'street',
    'parking-parallel': 'street', 'parking-angled': 'street',
    sidewalk: 'sidewalk', corner_sw: 'sidewalk',
    curb: 'curb', corner_curb: 'curb',
    treelawn: 'treelawn',
    lawn: 'treelawn',
  }

  // Lift ribbons slightly above terrain in shot mode so they don't clip
  // under the displaced ground. In flat/Designer mode MapLayers (footways,
  // paths, etc.) sits at y=0 and the lift would bury those — keep y=0 there.
  return (
    <group position={[0, flat ? 0 : 0.15, 0]}>
      {!hide.lot && !hideFaceFills && faceMeshes.map((m, i) => {
        const faceFade = { center: FADE_CENTER, inner: FACE_FADE.inner, outer: FACE_FADE.outer }
        // Face fills (block land use) stay opaque in every tool. Hide
        // them via the Fills toggle to reveal aerial.
        let mat
        if (m.isPark) {
          mat = flat
            ? makeMaterial(layerColors.park || DEFAULT_LAYER_COLORS.park, FACE_FILL_PRIORITY)
            : parkGrass.material
        } else if (m.isResidential) {
          mat = flat
            ? makeMaterial((luColors && luColors.residential) || LAND_USE_COLORS.residential, FACE_FILL_PRIORITY, faceFade)
            : residentialGrass.material
        } else {
          mat = makeMaterial(m.color, FACE_FILL_PRIORITY, faceFade)
        }
        return <mesh key={`face-${i}`} geometry={m.geo} renderOrder={FACE_FILL_PRIORITY} receiveShadow material={mat} />
      })}
      {/* Emergent medians — between paired oneway carriageways. Rendered
          as park-style grass by default; carriageway ribbons paint over
          the outside where pavement overlaps. */}
      {medianMeshes.map((m, i) => {
        const mat = flat
          ? makeMaterial(layerColors.park || DEFAULT_LAYER_COLORS.park, FACE_FILL_PRIORITY + 0.5)
          : parkGrass.material
        return <mesh key={`median-${i}`} geometry={m.geo} renderOrder={FACE_FILL_PRIORITY + 0.5} receiveShadow material={mat} />
      })}
      {/* Path/alley ribbons — pavement-only roadway strips for non-street
          highways. Rendered in Design and Measure; Survey gets these via
          silhouetteMeshes instead. Designer panel's alley/footway color
          pickers paint them via layerColors. */}
      {!surveyActive && pathRibbons.map((m, i) => {
        if (hide[m.id]) return null
        const streetFade = { center: FADE_CENTER, inner: STREET_FADE.inner, outer: STREET_FADE.outer }
        const mat = makeMaterial(m.color, 8, streetFade, { measureActive })
        return <mesh key={`path-${m.id}-${i}`} geometry={m.geo} renderOrder={8} receiveShadow material={mat} />
      })}
      {/* Per-stripe ribbon stack — the map's normal rendering and Measure's
          color story (translucent stripe fills). Suppressed only in Survey,
          where the blue silhouette pass below replaces it. */}
      {!surveyActive && meshes.map((m, i) => {
        const layerId = LAYER_MAP[m.id]
        if (layerId && hide[layerId]) return null
        const streetFade = { center: FADE_CENTER, inner: STREET_FADE.inner, outer: STREET_FADE.outer }
        let mat
        if (!flat && !measureActive && !m.selected && (m.id === 'treelawn' || m.id === 'lawn')) {
          mat = m.id === 'lawn' ? parkGrass.material : residentialGrass.material
        } else {
          mat = makeMaterial(m.color, m.pri, streetFade, { measureActive, selectedCorridor: m.selected })
        }
        return (
          <mesh key={i} geometry={m.geo} renderOrder={m.pri} receiveShadow material={mat} />
        )
      })}
      {/* Silhouette pass — Survey-only blue envelope per centerline, carved
          by insert couplers (medians, future jogs). */}
      {surveyActive && silhouetteMeshes.map((m, i) => {
        // Selected corridor's silhouette skips rendering entirely so the
        // aerial shows through unfettered for alignment. The centerline
        // + node markers from SurveyorOverlay still mark what's selected.
        if (m.selected) return null
        const streetFade = { center: FADE_CENTER, inner: STREET_FADE.inner, outer: STREET_FADE.outer }
        return (
          <mesh key={`silh-${i}`} geometry={m.geo} renderOrder={8} receiveShadow
            material={makeMaterial(ARCH_BLUE, 8, streetFade, { surveyActive: true })} />
        )
      })}
      {/* Edge strokes — Measure draws per-stripe boundaries (the color
          story), Survey draws only the outer property-line outline in blue. */}
      {authoringActive && edgeStrokes.map((m, i) => {
        if (surveyActive && !m.isOuter) return null
        const strokeColor = surveyActive ? ARCH_BLUE : m.color
        return (
          <mesh key={`edge-${i}`} geometry={m.geo} renderOrder={20} receiveShadow
            material={makeMaterial(strokeColor, 20, null)} />
        )
      })}
    </group>
  )
}
