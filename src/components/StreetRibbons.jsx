import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import ribbonsRaw from '../data/ribbons.json'
import { streetInBoundary, faceInBoundary, pointInBoundary } from '../cartograph/boundary.js'
import useCamera from '../hooks/useCamera'
import {
  terrainExag, assignTerrainUniforms,
  TERRAIN_DECL, TERRAIN_DISPLACE, TERRAIN_NORMAL,
} from '../utils/terrainShader'

// Hero mode terrain exaggeration — 10× makes terrain (0–29m) comparable
// to building heights (3–15m) for dramatic but proportional landscape
const HERO_EXAG = 5

// Material tokens — single source of truth for colors
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

const COLORS = {
  asphalt: MAT.asphalt, treelawn: MAT.treelawn, sidewalk: MAT.sidewalk, curb: MAT.curb,
  corner_sw: MAT.sidewalk, corner_curb: MAT.curb, corner_asph: MAT.asphalt,
}
const PRIORITY = { treelawn: 3, sidewalk: 5, curb: 6, corner_sw: 7, asphalt: 8, corner_curb: 9, corner_asph: 10 }
const FACE_FILL_PRIORITY = 1  // lowest — underneath everything
const CURB_WIDTH = 0.3

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
  if (_edgeFade < 0.01) discard;
  diffuseColor.a *= _edgeFade;
}`

// ── Shadow-tinted flat shader ────────────────────────────────────
// Let Three.js compute full PBR lighting (sun, shadows, point lights, ambient).
// Extract a grayscale light factor from the result. Multiply curated colors
// by that factor. Palette stays coherent — shadows darken, sun brightens.

const SHADOW_TINTED_FLAT = `
#include <lights_fragment_maps>
${TERRAIN_CLIP_FRAG}
{
  vec3 _totalLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
  float _baseLum = max(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.0005);
  float _lightMul = dot(_totalLight, vec3(0.2126, 0.7152, 0.0722)) / _baseLum;
  float _lightFactor = clamp(_lightMul, 0.15, 3.0);

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
  return { positions, normals, indices }
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

// ── Convert ribbons profile to ring bounds ───────────────────────

function profileToBounds(profile) {
  const hasTreelawn = profile.treelawn > profile.curb + 0.1
  return {
    asphalt:  { i: 0, o: profile.asphalt },
    curb:     { i: profile.asphalt, o: profile.asphalt + CURB_WIDTH },
    treelawn: hasTreelawn ? { i: profile.asphalt + CURB_WIDTH, o: profile.treelawn } : null,
    sidewalk: { i: hasTreelawn ? profile.treelawn : profile.asphalt + CURB_WIDTH, o: profile.sidewalk },
  }
}

// ── Segment direction helper ─────────────────────────────────────

function segDir(pts, i0, i1) {
  const dx = pts[i1][0] - pts[i0][0], dz = pts[i1][1] - pts[i0][1]
  const l = Math.hypot(dx, dz)
  return l > 1e-6 ? [dx / l, dz / l] : [1, 0]
}

// ── Main component ───────────────────────────────────────────────

export default function StreetRibbons({ hiddenLayers, flat = false }) {

  // ── Drive shared terrain exaggeration from view mode ──────────
  useFrame(() => {
    if (flat) { terrainExag.value = 0; return }
    const vm = useCamera.getState().viewMode
    const target = vm === 'hero' ? HERO_EXAG : vm === 'planetarium' ? 1 : 0
    const cur = terrainExag.value
    if (Math.abs(cur - target) < 0.01) { terrainExag.value = target; return }
    terrainExag.value += (target - cur) * 0.06
  })

  const meshes = useMemo(() => {
    // Filter to neighborhood boundary
    const ribbonsData = {
      streets: ribbonsRaw.streets.filter(st => streetInBoundary(st.points)),
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
    for (const street of ribbonsData.streets) {
      const pts = street.points
      if (pts.length < 2) continue
      const perps = computePerps(pts)
      const lb = profileToBounds(street.profile)

      // Collect intersection indices for this street
      const ixIndices = new Set(street.intersections.map(ix => ix.ix))

      // Split at each intersection index
      const splits = [0, ...street.intersections.map(ix => ix.ix).sort((a, b) => a - b), pts.length - 1]
      const uniqueSplits = [...new Set(splits)].sort((a, b) => a - b)

      for (let si = 0; si < uniqueSplits.length - 1; si++) {
        const from = uniqueSplits[si], to = uniqueSplits[si + 1]
        const segPts = pts.slice(from, to + 1)
        const segPp = perps.slice(from, to + 1)
        if (segPts.length < 2) continue

        for (const id of ['asphalt', 'curb', 'treelawn', 'sidewalk']) {
          const b = lb[id]
          if (!b) continue
          ensure(id)
          if (id === 'asphalt') {
            // Asphalt runs full length (not split at IX)
            if (si === 0) {
              groups[id].push(halfRingRaw(pts, b.i, b.o, perps, +1))
              groups[id].push(halfRingRaw(pts, b.i, b.o, perps, -1))
            }
          } else {
            groups[id].push(halfRingRaw(segPts, b.i, b.o, segPp, +1))
            groups[id].push(halfRingRaw(segPts, b.i, b.o, segPp, -1))
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

          const stA_data = ribbonsData.streets.find(s =>
            s.name === stA_ref.name && s.intersections.some(i =>
              i.ix === stA_ref.ix && i.withStreets.includes(stB_ref.name)))
          const stB_data = ribbonsData.streets.find(s =>
            s.name === stB_ref.name && s.intersections.some(i =>
              i.ix === stB_ref.ix && i.withStreets.includes(stA_ref.name)))
          if (!stA_data || !stB_data) continue

          const ptsA = stA_data.points, ixA = stA_ref.ix
          const ptsB = stB_data.points, ixB = stB_ref.ix
          if (ixA < 1 || ixA >= ptsA.length - 1) continue
          if (ixB < 1 || ixB >= ptsB.length - 1) continue

          const perpsA = computePerps(ptsA)
          const perpsB = computePerps(ptsB)
          const perpA = perpsA[ixA]
          const perpB = perpsB[ixB]

          const dA_left = segDir(ptsA, ixA - 1, ixA)
          const dA_right = segDir(ptsA, ixA, ixA + 1)
          const dB_left = segDir(ptsB, ixB - 1, ixB)
          const dB_right = segDir(ptsB, ixB, ixB + 1)
          const dA_avg = [(dA_left[0]+dA_right[0])/2, (dA_left[1]+dA_right[1])/2]
          const lA = Math.hypot(dA_avg[0], dA_avg[1]); dA_avg[0]/=lA; dA_avg[1]/=lA
          const dB_avg = [(dB_left[0]+dB_right[0])/2, (dB_left[1]+dB_right[1])/2]
          const lB = Math.hypot(dB_avg[0], dB_avg[1]); dB_avg[0]/=lB; dB_avg[1]/=lB

          const lbA = profileToBounds(stA_data.profile)
          const lbB = profileToBounds(stB_data.profile)
          const swOuterA = lbA.sidewalk.o
          const swOuterB = lbB.sidewalk.o
          const curbOuterA = lbA.curb.o
          const curbOuterB = lbB.curb.o
          const asphOuterA = lbA.asphalt.o
          const asphOuterB = lbB.asphalt.o

          for (const sA of [1, -1]) {
            for (const sB of [1, -1]) {
              const P0o = [IX[0] + sA * perpA[0] * swOuterA, IX[1] + sA * perpA[1] * swOuterA]
              const P1o = [IX[0] + sB * perpB[0] * swOuterB, IX[1] + sB * perpB[1] * swOuterB]

              const testOo = lineX(P0o, dA_avg, P1o, dB_avg)
              if (!testOo) continue
              const dotA = (testOo[0]-IX[0])*dA_avg[0] + (testOo[1]-IX[1])*dA_avg[1]
              const dotB = (testOo[0]-IX[0])*dB_avg[0] + (testOo[1]-IX[1])*dB_avg[1]
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
              groups['corner_sw'].push(cornerBandRaw(swA, oo, swB, swA, swB, swCtrl, 16))
              ensure('corner_curb')
              groups['corner_curb'].push(bezierBandRaw(coA, coB, coCtrl, swA, swB, swCtrl, 16))
              ensure('corner_asph')
              groups['corner_asph'].push(cornerBandRaw(coA, pt1, coB, coA, coB, coCtrl, 16))
            }
          }
        }
      }
    }

    const result = Object.entries(groups).map(([id, parts]) => ({
      id, geo: mergeRawGeo(parts), color: COLORS[id], pri: PRIORITY[id],
    })).filter(m => m.geo)

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
  }, [])

  // ── Face fills (land-use color per block) ─────────────────────
  const faceMeshes = useMemo(() => {
    const faces = (ribbonsRaw.faces || []).filter(f => faceInBoundary(f.ring))
    if (!faces.length) return []

    const byColor = new Map()
    for (const face of faces) {
      const color = LAND_USE_COLORS[face.use] || LAND_USE_COLORS.unknown
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
  }, [])

  // ── Materials: terrain displacement + shadow-tinted flat ──────
  const makeMaterial = useMemo(() => {
    const fragShader = flat ? CARTOGRAPH_FLAT : SHADOW_TINTED_FLAT
    const cacheKey = flat ? 'sr-flat' : 'sr-shadow'
    return (color, pri) => {
      const mat = new THREE.MeshStandardMaterial({
        color, roughness: 0.9, metalness: 0, side: THREE.FrontSide,
        polygonOffset: true, polygonOffsetFactor: (11 - pri), polygonOffsetUnits: (11 - pri) * 4,
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
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\n' + TERRAIN_CLIP_VARYING_DECL + '\n' + TERRAIN_DECL)
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <output_fragment>', `#include <output_fragment>\n${TERRAIN_CLIP_FRAG}`)
        }
      }
      mat.customProgramCacheKey = () => flat ? 'sr-flat' : 'sr-pbr-v3'
      return mat
    }
  }, [flat])

  const hide = hiddenLayers || {}

  const LAYER_MAP = {
    asphalt: 'street', corner_asph: 'street',
    sidewalk: 'sidewalk', corner_sw: 'sidewalk',
    curb: 'curb', corner_curb: 'curb',
    treelawn: 'sidewalk',
  }

  return (
    <group>
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
