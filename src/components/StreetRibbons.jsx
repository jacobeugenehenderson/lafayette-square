import { useMemo } from 'react'
import * as THREE from 'three'

const IX = [-134.2, -325.6]

const RUTGER = {
  points: [
    [-316.1,-373.6],[-305.6,-370.8],[-303.2,-370.2],[-296.9,-368.5],
    [-215.4,-346.8],[-212.1,-345.9],[-167.7,-333.8],
    [-134.2,-325.6],
    [-102.6,-318.2],[-87.3,-314.1],
  ],
  rings: [
    { inner: 0,   outer: 6.1, id: 'asphalt' },
    { inner: 6.1, outer: 7.4, id: 'treelawn' },
    { inner: 7.4, outer: 8.9, id: 'sidewalk' },
  ],
  ix: 7,
}

const MISSOURI = {
  points: [
    [-99.1,-431.6],[-101.3,-425.0],[-132.0,-332.1],
    [-134.2,-325.6],
    [-136.2,-319.5],[-142.8,-299.6],[-149.9,-278.3],
  ],
  rings: [
    { inner: 0,    outer: 4.75, id: 'asphalt' },
    { inner: 4.75, outer: 7.5,  id: 'sidewalk' },
  ],
  ix: 3,
}

const COLORS = { asphalt: '#2e2e2c', treelawn: '#4a6a3a', sidewalk: '#7a756a', curb: '#aa8866', corner_sw: '#7a756a', corner_curb: '#aa8866', corner_asph: '#2e2e2c' }
const PRIORITY = { treelawn: 3, sidewalk: 5, curb: 6, corner_sw: 7, asphalt: 8, corner_curb: 9, corner_asph: 10 }
const CURB_WIDTH = 0.3

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
    // Outer: piecewise linear P0o → oo → P1o
    const s = t <= 0.5 ? t * 2 : (t - 0.5) * 2
    const ox = t <= 0.5 ? P0o[0] * (1 - s) + oo[0] * s : oo[0] * (1 - s) + P1o[0] * s
    const oz = t <= 0.5 ? P0o[1] * (1 - s) + oo[1] * s : oo[1] * (1 - s) + P1o[1] * s
    // Inner: quadratic bezier
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

function layerBounds(street) {
  const asph = street.rings.find(r => r.id === 'asphalt')
  const tl = street.rings.find(r => r.id === 'treelawn')
  const sw = street.rings.find(r => r.id === 'sidewalk')
  return {
    asphalt:  { i: 0, o: asph.outer },
    curb:     { i: asph.outer, o: asph.outer + CURB_WIDTH },
    treelawn: tl ? { i: tl.inner, o: tl.outer } : null,
    sidewalk: { i: sw.inner, o: sw.outer },
  }
}

export default function StreetRibbons() {
  const meshes = useMemo(() => {
    const groups = {}
    const ensure = (id) => { if (!groups[id]) groups[id] = [] }

    for (const street of [RUTGER, MISSOURI]) {
      const perps = computePerps(street.points)
      const leftPts = street.points.slice(0, street.ix + 1)
      const leftPp = perps.slice(0, street.ix + 1)
      const rightPts = street.points.slice(street.ix)
      const rightPp = perps.slice(street.ix)
      const lb = layerBounds(street)

      for (const id of ['asphalt', 'curb', 'treelawn', 'sidewalk']) {
        const b = lb[id]
        if (!b) continue
        ensure(id)
        if (id === 'asphalt') {
          groups[id].push(halfRingRaw(street.points, b.i, b.o, perps, +1))
          groups[id].push(halfRingRaw(street.points, b.i, b.o, perps, -1))
        } else {
          for (const [pts, pp] of [[leftPts,leftPp],[rightPts,rightPp]]) {
            groups[id].push(halfRingRaw(pts, b.i, b.o, pp, +1))
            groups[id].push(halfRingRaw(pts, b.i, b.o, pp, -1))
          }
        }
      }
    }

    // --- Corner bands ---
    const perpsA = computePerps(RUTGER.points)
    const perpsB = computePerps(MISSOURI.points)
    const perpA = perpsA[RUTGER.ix]
    const perpB = perpsB[MISSOURI.ix]

    // Tangent directions at IX
    const dxA = RUTGER.points[RUTGER.ix + 1][0] - RUTGER.points[RUTGER.ix - 1][0]
    const dzA = RUTGER.points[RUTGER.ix + 1][1] - RUTGER.points[RUTGER.ix - 1][1]
    const lnA = Math.hypot(dxA, dzA)
    const dA = [dxA / lnA, dzA / lnA]

    const dxB = MISSOURI.points[MISSOURI.ix + 1][0] - MISSOURI.points[MISSOURI.ix - 1][0]
    const dzB = MISSOURI.points[MISSOURI.ix + 1][1] - MISSOURI.points[MISSOURI.ix - 1][1]
    const lnB = Math.hypot(dxB, dzB)
    const dB = [dxB / lnB, dzB / lnB]

    const lbA = layerBounds(RUTGER)
    const lbB = layerBounds(MISSOURI)
    const swOuterA = lbA.sidewalk.o
    const swOuterB = lbB.sidewalk.o
    const curbOuterA = lbA.curb.o
    const curbOuterB = lbB.curb.o
    const asphOuterA = lbA.asphalt.o
    const asphOuterB = lbB.asphalt.o

    for (const sA of [1, -1]) {
      for (const sB of [1, -1]) {
        // Sidewalk outer edge points at IX
        const P0o = [IX[0] + sA * perpA[0] * swOuterA, IX[1] + sA * perpA[1] * swOuterA]
        const P1o = [IX[0] + sB * perpB[0] * swOuterB, IX[1] + sB * perpB[1] * swOuterB]

        // Block corner = intersection of outer edge lines
        const oo = lineX(P0o, dA, P1o, dB)
        if (!oo) continue

        // Unit vectors from oo toward IX along each sw outer line
        const u2 = [P0o[0] - oo[0], P0o[1] - oo[1]]
        const l2 = Math.hypot(u2[0], u2[1]); u2[0] /= l2; u2[1] /= l2
        const u4 = [P1o[0] - oo[0], P1o[1] - oo[1]]
        const l4 = Math.hypot(u4[0], u4[1]); u4[0] /= l4; u4[1] /= l4

        // R = shorter sidewalk width (arc radius for sidewalk boundary)
        const R = Math.min(swOuterA - curbOuterA, swOuterB - curbOuterB)

        // Sidewalk bezier endpoints: R from oo toward IX
        const swA = [oo[0] + R * u2[0], oo[1] + R * u2[1]]
        const swB = [oo[0] + R * u4[0], oo[1] + R * u4[1]]
        const swCtrl = [swA[0] + swB[0] - oo[0], swA[1] + swB[1] - oo[1]]

        // Curb outer endpoints: R + CURB_WIDTH from oo (includes curb thickness)
        const coA = [oo[0] + (R + CURB_WIDTH) * u2[0], oo[1] + (R + CURB_WIDTH) * u2[1]]
        const coB = [oo[0] + (R + CURB_WIDTH) * u4[0], oo[1] + (R + CURB_WIDTH) * u4[1]]
        const coCtrl = [coA[0] + coB[0] - oo[0], coA[1] + coB[1] - oo[1]]

        // Asphalt outer intersection — deep enough to cover all existing arm geometry
        const P0a = [IX[0] + sA * perpA[0] * asphOuterA, IX[1] + sA * perpA[1] * asphOuterA]
        const P1a = [IX[0] + sB * perpB[0] * asphOuterB, IX[1] + sB * perpB[1] * asphOuterB]
        const pt1 = lineX(P0a, dA, P1a, dB)
        if (!pt1) continue

        // 1. Sidewalk (gray): pie wedge from oo to sidewalk bezier
        ensure('corner_sw')
        groups['corner_sw'].push(cornerBandRaw(swA, oo, swB, swA, swB, swCtrl, 16))

        // 2. Curb (brown): strip from sidewalk bezier to curb outer bezier
        ensure('corner_curb')
        groups['corner_curb'].push(bezierBandRaw(coA, coB, coCtrl, swA, swB, swCtrl, 16))

        // 3. Asphalt (black): from curb outer bezier to V through pt1 (nudged toward IX)
        const toIX = [IX[0] - pt1[0], IX[1] - pt1[1]]
        const toIXlen = Math.hypot(toIX[0], toIX[1])
        const pt1b = [pt1[0] + toIX[0] / toIXlen * 0.5, pt1[1] + toIX[1] / toIXlen * 0.5]
        ensure('corner_asph')
        groups['corner_asph'].push(cornerBandRaw(coA, pt1b, coB, coA, coB, coCtrl, 16))
      }
    }

    return Object.entries(groups).map(([id, parts]) => ({
      geo: mergeRawGeo(parts), color: COLORS[id], pri: PRIORITY[id],
    })).filter(m => m.geo)
  }, [])

  return (
    <group position={[0, 0.15, 0]}>
      {meshes.map((m, i) => m.geo && (
        <mesh key={i} geometry={m.geo} renderOrder={m.pri} receiveShadow>
          <meshStandardMaterial
            color={m.color} roughness={0.85} side={THREE.DoubleSide}
            polygonOffset polygonOffsetFactor={-m.pri * 4}
            polygonOffsetUnits={-m.pri * 50}
          />
        </mesh>
      ))}
    </group>
  )
}
