// Sextant probe 3 — pin the per-fe width step that feeds the THRU blend.
// Replicate feWidthAt/segOrdAtVertex externally from ribbons + design.
import { readFileSync } from 'fs'
import { resolveChainSegmentation } from '../src/lib/buildBlockGeometryV2.js'

const ribbons = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const design  = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const bc = design.blockCustoms || null
const streets = ribbons.streets
const byId = new Map(streets.map((s, i) => [s.skelId || s.name, i]))
const seg = resolveChainSegmentation(streets)
const ixIdxsByStreet = streets.map(s => {
  const n = s?.points?.length || 0
  return [...(seg.get(s) || [])].filter(i => i > 0 && i < n - 1).sort((a, b) => a - b)
})
const segOrdAtVertex = (idx, lower) => { let so = 0; for (const i of (ixIdxsByStreet[idx] || [])) if (i <= lower) so++; return so }
const baseHW = (idx, side) => Math.max(0, streets[idx]?.measure?.[side]?.pavementHW || 0)
const feWidthAt = (idx, side, segOrd) => {
  const base = baseHW(idx, side)
  if (!bc) return base
  const sk = streets[idx].skelId || streets[idx].name
  const c = sk ? bc[sk]?.[side]?.[segOrd] : null
  return (c && Number.isFinite(c.pavementHW)) ? Math.max(0, c.pavementHW) : base
}
const D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const nrm = (x, y) => { const L = Math.hypot(x, y) || 1; return [x / L, y / L] }

const marks = {
  'Vail->Park':       { at: [340.0, -120.6],  avenue: 'park-avenue-1',     stem: 'vail-place' },
  'Kennett->Miss':    { at: [179.9, 115.9],   avenue: 'mississippi-avenue',stem: 'kennett-place' },
  'Mackay->Park':     { at: [-48.0, -203.9],  avenue: 'park-avenue-1',     stem: 'mackay-place-0' },
  'Albion->Missouri': { at: [-177.5, -78.7],  avenue: 'missouri-avenue-2', stem: 'albion-place' },
  'Waverly->Laf':     { at: [-25.3, 191.6],   avenue: 'lafayette-avenue-3',stem: 'waverly-place-0' },
}
for (const [name, m] of Object.entries(marks)) {
  const idx = byId.get(m.avenue), stem = byId.get(m.stem)
  const av = streets[idx]
  let vi = -1, bd = 1e9
  av.points.forEach((p, i) => { const d = D(p, m.at); if (d < bd) { bd = d; vi = i } })
  const a = av.points[vi - 1], v = av.points[vi], b = av.points[vi + 1]
  const tAv = nrm(b[0] - a[0], b[1] - a[1])
  // off-chord kink at vi
  const cdx = b[0]-a[0], cdz = b[1]-a[1], cL = Math.hypot(cdx,cdz)||1
  const kink = Math.abs(((v[0]-a[0])*cdz - (v[1]-a[1])*cdx)/cL)
  const nL = [tAv[1], -tAv[0]]
  const sp = streets[stem]
  const se = D(sp.points[0], m.at) < D(sp.points[sp.points.length-1], m.at) ? sp.points[1] : sp.points[sp.points.length-2]
  const tStem = nrm(se[0]-m.at[0], se[1]-m.at[1])
  const mouthIsL = (nL[0]*tStem[0] + nL[1]*tStem[1]) > 0
  const sideNo = mouthIsL ? 'right' : 'left'
  const isIX = (ixIdxsByStreet[idx]||[]).includes(vi)
  console.log(`\n=== ${name}  vi=${vi} (IX vertex: ${isIX})  kink=${kink.toFixed(3)}m  no-mouth=${sideNo} ===`)
  for (const side of ['left','right']) {
    const soA = segOrdAtVertex(idx, vi-1), soB = segOrdAtVertex(idx, vi)
    const wA = feWidthAt(idx, side, soA), wB = feWidthAt(idx, side, soB)
    const base = baseHW(idx, side)
    const sk = av.skelId||av.name
    const cA = bc?.[sk]?.[side]?.[soA]?.pavementHW, cB = bc?.[sk]?.[side]?.[soB]?.pavementHW
    const tag = side===sideNo ? '  <== NO-MOUTH' : ''
    console.log(`  ${side}: segOrd ${soA}->${soB}  wA=${wA.toFixed(3)} wB=${wB.toFixed(3)} dw=${Math.abs(wA-wB).toFixed(3)}  (base=${base.toFixed(3)}, custom ${cA??'-'}->${cB??'-'})${tag}`)
  }
}
