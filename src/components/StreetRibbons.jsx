import { useMemo } from 'react'
import * as THREE from 'three'
import ribbonsData from '../data/ribbons.json'

// Material tokens — single source of truth for colors
const MAT = {
  asphalt:  '#2e2e2c',
  sidewalk: '#7a756a',
  curb:     '#aa8866',
  treelawn: '#4a6a3a',
}

const COLORS = {
  asphalt: MAT.asphalt, treelawn: MAT.treelawn, sidewalk: MAT.sidewalk, curb: MAT.curb,
  corner_sw: MAT.sidewalk, corner_curb: MAT.curb, corner_asph: MAT.asphalt,
}
const PRIORITY = { treelawn: 3, sidewalk: 5, curb: 6, corner_sw: 7, asphalt: 8, corner_curb: 9, corner_asph: 10 }
const CURB_WIDTH = 0.3

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
    const a=i*2, b=(i+1)*2; indices.push(a,a+1,b, a+1,b+1,b)
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
    const a = j * 2, b = (j + 1) * 2; indices.push(a, a + 1, b, a + 1, b + 1, b)
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
    const a = j * 2, b = (j + 1) * 2; indices.push(a, a + 1, b, a + 1, b + 1, b)
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

export default function StreetRibbons() {
  const meshes = useMemo(() => {
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

      // Process each pair of streets at this intersection
      for (let ai = 0; ai < ix.streets.length; ai++) {
        for (let bi = ai + 1; bi < ix.streets.length; bi++) {
          const stA_ref = ix.streets[ai]
          const stB_ref = ix.streets[bi]

          // Find the street data
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

          // Per-half-arm segment directions
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

              // Pick half-arm direction for this corner
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

    return Object.entries(groups).map(([id, parts]) => ({
      geo: mergeRawGeo(parts), color: COLORS[id], pri: PRIORITY[id],
    })).filter(m => m.geo)
  }, [])

  // Custom material: flat base color, no position-dependent shading
  const makeMaterial = useMemo(() => (color, pri) => {
    const mat = new THREE.MeshStandardMaterial({
      color, roughness: 1, metalness: 0, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -pri * 4, polygonOffsetUnits: -pri * 50,
    })
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_fragment_maps>',
        `#include <lights_fragment_maps>
        reflectedLight.directDiffuse = vec3(0.0);
        reflectedLight.directSpecular = vec3(0.0);
        reflectedLight.indirectSpecular = vec3(0.0);
        reflectedLight.indirectDiffuse = diffuseColor.rgb;`
      )
    }
    return mat
  }, [])

  return (
    <group position={[0, 0.15, 0]}>
      {meshes.map((m, i) => m.geo && (
        <mesh key={i} geometry={m.geo} renderOrder={m.pri} receiveShadow
          material={makeMaterial(m.color, m.pri)} />
      ))}
    </group>
  )
}
