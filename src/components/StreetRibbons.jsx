import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import ribbonsRaw from '../data/ribbons.json'
import { streetInBoundary, faceInBoundary, pointInBoundary } from '../cartograph/boundary.js'
import useCamera from '../hooks/useCamera'
import { BAND_COLORS } from '../cartograph/streetProfiles.js'
import useCartographStore from '../cartograph/stores/useCartographStore.js'
import { DEFAULT_LAYER_COLORS, BAND_TO_LAYER } from '../cartograph/m3Colors.js'
import {
  terrainExag, assignTerrainUniforms,
  TERRAIN_DECL, TERRAIN_DISPLACE, TERRAIN_NORMAL,
} from '../utils/terrainShader'

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
  sidewalk:           5,
  gutter:             6,
  curb:               6,
  'parking-parallel': 7,
  'parking-angled':   7,
  asphalt:            8,
}
const CORNER_PRIORITY = { corner_sw: 7, corner_curb: 9, corner_asph: 10 }
const FACE_FILL_PRIORITY = 1  // lowest — underneath everything
const CURB_WIDTH = 0.3

// ── Band-stack helpers ─────────────────────────────────────────────

// Convert one side's band stack ({material, width}, inside→outside) into rings
// with cumulative radii: { material, innerR, outerR, pri, color }.
function sideBandsToRings(sideBands) {
  const rings = []
  let r = 0
  for (const b of (sideBands || [])) {
    if (!b || !(b.width > 0)) continue
    const innerR = r
    r += b.width
    rings.push({
      material: b.material,
      innerR,
      outerR: r,
      pri: BAND_PRIORITY[b.material] ?? 5,
      color: BAND_COLORS[b.material] || LEGACY_COLORS.asphalt,
    })
  }
  return rings
}

// Extract corner-plug reference edges from one side of a band stack.
// These three numbers are all the corner geometry needs — material names
// don't matter, only the radii.
function refEdgesForSide(sideBands) {
  const rings = sideBandsToRings(sideBands)
  const propertyLine = rings.length ? rings[rings.length - 1].outerR : 0
  const curb = rings.find(r => r.material === 'curb')
  return {
    propertyLine,
    curbInner: curb ? curb.innerR : propertyLine,
    curbOuter: curb ? curb.outerR : propertyLine,
  }
}

// Back-compat shim: if a street has no `bands` field, synthesize a symmetric
// {left, right} from the old `profile` field so the new pipeline still renders
// legacy ribbons.json files.
function ensureBands(street) {
  if (street.bands?.left?.length) return street.bands
  const p = street.profile
  if (!p) return { left: [], right: [] }
  const asphaltWidth = p.asphalt || 0
  const curbWidth = (p.curb || 0) - asphaltWidth
  const treelawnOuter = p.treelawn || p.curb || 0
  const treelawnWidth = treelawnOuter > p.curb + 0.1 ? treelawnOuter - (p.curb || 0) : 0
  const sidewalkWidth = (p.sidewalk || p.curb || 0) - (treelawnWidth > 0 ? treelawnOuter : p.curb || 0)
  const bands = []
  if (asphaltWidth > 0) bands.push({ material: 'asphalt', width: asphaltWidth })
  if (curbWidth > 0) bands.push({ material: 'curb', width: curbWidth })
  if (treelawnWidth > 0) bands.push({ material: 'treelawn', width: treelawnWidth })
  if (sidewalkWidth > 0) bands.push({ material: 'sidewalk', width: sidewalkWidth })
  return { left: bands, right: bands.map(b => ({ ...b })) }
}

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
${TERRAIN_CLIP_FRAG}
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

  for (let pass = 0; pass < 8; pass++) {
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
    if (i < n-1) { const dx=pts[i+1][0]-pts[i][0],dz=pts[i+1][1]-pts[i][1],l=Math.hypot(dx,dz); nx-=dz/l; nz+=dx/l }
    if (i > 0)   { const dx=pts[i][0]-pts[i-1][0],dz=pts[i][1]-pts[i-1][1],l=Math.hypot(dx,dz); nx-=dz/l; nz+=dx/l }
    const l = Math.hypot(nx, nz); return [nx/l, nz/l]
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

function mergeRawGeo(parts) {
  const valid = parts.filter(Boolean)
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

// ── Segment direction helper ─────────────────────────────────────

function segDir(pts, i0, i1) {
  const dx = pts[i1][0] - pts[i0][0], dz = pts[i1][1] - pts[i0][1]
  const l = Math.hypot(dx, dz)
  return l > 1e-6 ? [dx / l, dz / l] : [1, 0]
}

// ── Main component ───────────────────────────────────────────────

export default function StreetRibbons({ hiddenLayers, flat = false, luColors, liveCenterlines }) {

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

  const meshes = useMemo(() => {
    // Build a name → live-centerline lookup for merging Measure/Survey edits
    // into the rendered ribbons without a pipeline rebuild.
    const liveByName = new Map()
    if (liveCenterlines) {
      for (const cl of liveCenterlines) {
        if (!cl || !cl.name || cl.disabled) continue
        // First entry per name wins; prefer ones with _bands or cap flags set
        const prev = liveByName.get(cl.name)
        const hasOverrides = cl._bands || cl.capStart || cl.capEnd
        if (!prev || (hasOverrides && !(prev._bands || prev.capStart || prev.capEnd))) {
          liveByName.set(cl.name, cl)
        }
      }
    }

    // Merge live band/cap overrides onto ribbons.json streets. Points,
    // intersections, and faces stay from ribbons.json (structural); bands and
    // caps come live from centerlineData when present.
    const pointsNearlyEqual = (a, b, eps = 0.5) =>
      a && b && Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps
    const mergedStreets = ribbonsRaw.streets.map(st => {
      const live = liveByName.get(st.name)
      if (!live) return st
      const merged = { ...st }
      if (live._bands && Array.isArray(live._bands) && live._bands.length) {
        const flat = live._bands.map(b => ({ ...b }))
        merged.bands = { left: flat.map(b => ({ ...b })), right: flat.map(b => ({ ...b })) }
      }
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
            start: applyStart ? (live.capStart ?? st.capEnds?.start ?? null) : (st.capEnds?.start ?? null),
            end: applyEnd ? (live.capEnd ?? st.capEnds?.end ?? null) : (st.capEnds?.end ?? null),
          }
        }
      }
      return merged
    })

    // Filter to neighborhood boundary
    const ribbonsData = {
      streets: mergedStreets.filter(st => streetInBoundary(st.points)),
      intersections: ribbonsRaw.intersections.filter(ix => pointInBoundary(ix.point[0], ix.point[1])),
      faces: (ribbonsRaw.faces || []).filter(f => faceInBoundary(f.ring)),
    }

    const groups = {}
    const ensure = (id) => { if (!groups[id]) groups[id] = [] }

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
      const perps = computePerps(pts)
      const bands = ensureBands(street)

      // Split at each intersection index
      const splits = [0, ...street.intersections.map(ix => ix.ix).sort((a, b) => a - b), pts.length - 1]
      const uniqueSplits = [...new Set(splits)].sort((a, b) => a - b)

      for (const [side, sideBands] of [[-1, bands.left], [+1, bands.right]]) {
        const rings = sideBandsToRings(sideBands)
        for (const ring of rings) {
          ensure(ring.material)
          if (FULL_LENGTH_BANDS.has(ring.material)) {
            groups[ring.material].push(halfRingRaw(pts, ring.innerR, ring.outerR, perps, side))
          } else {
            for (let si = 0; si < uniqueSplits.length - 1; si++) {
              const from = uniqueSplits[si], to = uniqueSplits[si + 1]
              const segPts = pts.slice(from, to + 1)
              const segPp = perps.slice(from, to + 1)
              if (segPts.length < 2) continue
              groups[ring.material].push(halfRingRaw(segPts, ring.innerR, ring.outerR, segPp, side))
            }
          }
        }
      }

      // ── Endcaps at operator-marked dead-ends ──
      // capStart / capEnd come from Survey mode (operator is authority, no
      // auto-detection). Round = cul-de-sac (quarter-annulus per band per side).
      // Blunt = flat termination (no extra geometry needed; the ring already
      // ends perpendicular at the last polyline point).
      const CAP_ENABLED = true
      if (CAP_ENABLED) {
        const capEnds = street.capEnds || { start: null, end: null }
        const endInfo = [
          { cap: capEnds.start, idx: 0, tanPt0: pts[1], tanPt1: pts[0] },
          { cap: capEnds.end,   idx: pts.length - 1, tanPt0: pts[pts.length - 2], tanPt1: pts[pts.length - 1] },
        ]
        for (const e of endInfo) {
          if (e.cap !== 'round') continue
          const endpoint = pts[e.idx]
          const tdx = e.tanPt1[0] - e.tanPt0[0], tdz = e.tanPt1[1] - e.tanPt0[1]
          const tlen = Math.hypot(tdx, tdz) || 1
          const tangent = [tdx / tlen, tdz / tlen]
          const perp = perps[e.idx]
          for (const [side, sideBands] of [[-1, bands.left], [+1, bands.right]]) {
            const rings = sideBandsToRings(sideBands)
            for (const ring of rings) {
              ensure(ring.material)
              groups[ring.material].push(
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

          const stA_data = ribbonsData.streets.find(s =>
            s.name === stA_ref.name && s.intersections.some(i =>
              i.ix === stA_ref.ix && i.withStreets.includes(stB_ref.name)))
          const stB_data = ribbonsData.streets.find(s =>
            s.name === stB_ref.name && s.intersections.some(i =>
              i.ix === stB_ref.ix && i.withStreets.includes(stA_ref.name)))
          if (!stA_data || !stB_data) continue

          const ptsA = stA_data.points, ixA = stA_ref.ix
          const ptsB = stB_data.points, ixB = stB_ref.ix

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

          const bandsA = ensureBands(stA_data)
          const bandsB = ensureBands(stB_data)

          for (const sA of [1, -1]) {
            // Per-side refs: asymmetric bands may differ left vs right.
            const refA = refEdgesForSide(sA > 0 ? bandsA.right : bandsA.left)
            for (const sB of [1, -1]) {
              const refB = refEdgesForSide(sB > 0 ? bandsB.right : bandsB.left)
              // Reference edges used by the corner plug math:
              //   property line = outer of outermost band
              //   curbOuter     = outer edge of curb band (or property line if no curb)
              //   curbInner     = inner edge of curb band = outer edge of driving surface
              const swOuterA = refA.propertyLine
              const swOuterB = refB.propertyLine
              const curbOuterA = refA.curbOuter
              const curbOuterB = refB.curbOuter
              const asphOuterA = refA.curbInner
              const asphOuterB = refB.curbInner

              const P0o = [IX[0] + sA * perpA[0] * swOuterA, IX[1] + sA * perpA[1] * swOuterA]
              const P1o = [IX[0] + sB * perpB[0] * swOuterB, IX[1] + sB * perpB[1] * swOuterB]

              const testOo = lineX(P0o, dA_avg, P1o, dB_avg)
              if (!testOo) continue
              const dotA = (testOo[0]-IX[0])*dA_avg[0] + (testOo[1]-IX[1])*dA_avg[1]
              const dotB = (testOo[0]-IX[0])*dB_avg[0] + (testOo[1]-IX[1])*dB_avg[1]

              // Terminal-street quadrant guard: if a street terminates at the IX,
              // skip the quadrants where its "missing arm" would be. This is what
              // distinguishes a T (2 plugs) from an X (4 plugs) — the bezier math
              // doesn't change, we just don't build plugs where there's no arm.
              if (termA_start && dotA < 0) continue  // no pre-IX arm on A
              if (termA_end && dotA > 0) continue    // no post-IX arm on A
              if (termB_start && dotB < 0) continue  // no pre-IX arm on B
              if (termB_end && dotB > 0) continue    // no post-IX arm on B

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

              ensure('corner_sw')
              groups['corner_sw'].push(ensureCCW(cornerBandRaw(swA, oo, swB, swA, swB, swCtrl, 16)))
              ensure('corner_curb')
              groups['corner_curb'].push(ensureCCW(bezierBandRaw(coA, coB, coCtrl, swA, swB, swCtrl, 16)))
              ensure('corner_asph')
              groups['corner_asph'].push(ensureCCW(cornerBandRaw(coA, pt1, coB, coA, coB, coCtrl, 16)))
            }
          }
        }
      }
    }

    // Corner-plug materials inherit color from the underlying band material:
    // sidewalk plug uses sidewalk color, curb plug uses curb color, etc.
    const CORNER_SRC = { corner_sw: 'sidewalk', corner_curb: 'curb', corner_asph: 'asphalt' }
    const result = Object.entries(groups).map(([id, parts]) => {
      const isCorner = id.startsWith('corner_')
      const pri = isCorner ? CORNER_PRIORITY[id] : (BAND_PRIORITY[id] ?? 5)
      const srcMat = isCorner ? CORNER_SRC[id] : id
      // Color resolution order: live panel picker → M3 default → BAND_COLORS
      // fallback → LEGACY. BAND_TO_LAYER maps band materials ('asphalt',
      // 'curb', 'sidewalk' …) onto the Panel's picker ids ('street', 'curb',
      // 'sidewalk' …) so one picker can paint several related bands.
      const layerId = BAND_TO_LAYER[srcMat]
      const color =
        (layerId && layerColors[layerId]) ||
        (layerId && DEFAULT_LAYER_COLORS[layerId]) ||
        BAND_COLORS[srcMat] ||
        LEGACY_COLORS[id] ||
        LEGACY_COLORS.asphalt
      let geo = mergeRawGeo(parts)
      // Subdivide so ribbons follow terrain in non-flat modes (per-vertex
      // displacement needs enough vertices, or the ribbon cuts through hills).
      if (geo) geo = subdivideGeo(geo, 30)
      return { id, geo, color, pri }
    }).filter(m => m.geo)

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
  }, [liveCenterlines, layerColors])

  // ── Face fills (land-use color per block) ─────────────────────
  const faceMeshes = useMemo(() => {
    // The park is a ribbon-rendered surface like any other block face; we
    // don't filter it. Grass-shader treatment for shots happens downstream
    // (tomorrow's work — replaces LafayettePark's own grass plane).
    const faces = (ribbonsRaw.faces || []).filter(f => faceInBoundary(f.ring))
    if (!faces.length) return []

    const byColor = new Map()
    for (const face of faces) {
      const color = (luColors && luColors[face.use]) || LAND_USE_COLORS[face.use] || LAND_USE_COLORS.unknown
      if (!byColor.has(color)) byColor.set(color, [])
      byColor.get(color).push(face.ring)
    }

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
      result.push({ geo, color })
    }
    return result
  }, [luColors])

  // ── Materials: terrain displacement + shadow-tinted flat ──────
  const makeMaterial = useMemo(() => {
    const fragShader = flat ? CARTOGRAPH_FLAT : SHADOW_TINTED_FLAT
    const cacheKey = flat ? 'sr-flat' : 'sr-shadow'
    return (color, pri) => {
      const mat = new THREE.MeshStandardMaterial({
        color, roughness: 0.9, metalness: 0, side: THREE.FrontSide,
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
      }
      mat.customProgramCacheKey = () => flat ? 'sr-flat' : 'sr-pbr-v3'
      return mat
    }
  }, [flat])

  const hide = hiddenLayers || {}

  const LAYER_MAP = {
    asphalt: 'street', corner_asph: 'street',
    gutter: 'street',
    'parking-parallel': 'street', 'parking-angled': 'street',
    sidewalk: 'sidewalk', corner_sw: 'sidewalk',
    curb: 'curb', corner_curb: 'curb',
    treelawn: 'sidewalk',
    lawn: 'sidewalk',
  }

  // Lift ribbons slightly above terrain in shot mode so they don't clip
  // under the displaced ground. In flat/Designer mode MapLayers (footways,
  // paths, etc.) sits at y=0 and the lift would bury those — keep y=0 there.
  return (
    <group position={[0, flat ? 0 : 0.15, 0]}>
      {!hide.lot && faceMeshes.map((m, i) => (
        <mesh key={`face-${i}`} geometry={m.geo} renderOrder={FACE_FILL_PRIORITY} receiveShadow
          material={makeMaterial(m.color, FACE_FILL_PRIORITY)} />
      ))}
      {meshes.map((m, i) => {
        const layerId = LAYER_MAP[m.id]
        if (layerId && hide[layerId]) return null
        return (
          <mesh key={i} geometry={m.geo} renderOrder={m.pri} receiveShadow
            material={makeMaterial(m.color, m.pri)} />
        )
      })}
    </group>
  )
}
