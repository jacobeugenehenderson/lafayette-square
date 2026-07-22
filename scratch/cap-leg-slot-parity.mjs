// cap-leg-slot-parity.mjs — THREAD (b) GATE. For every dead-end cap, does the
// slot a LEG flip WRITES (the fe's feCustomKey, fanned across fe.segOrds) match
// the slot the RENDER READS (run.skelId|run.side|run.segOrd on the frozen tile)?
// A mismatch = the flip lands in a slot no run reads → Δ=0.0 on the eye.
//   node scratch/cap-leg-slot-parity.mjs
import fs from 'fs'
import { buildBlockGeometryV2 } from '../src/lib/buildBlockGeometryV2.js'
import { feCustomKey } from '../src/lib/feCustomKey.js'

const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const shape = JSON.parse(fs.readFileSync('public/baked/lafayette-square/shape.json', 'utf8'))
const tipKey = (p) => Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000)

// The runs that END at each frozen dead-end tip → the slots the RENDER reads.
const capTips = []   // { tk, skelId, capEnd, legs:[{skelId,side,segOrd}] }
for (const t of shape.tiles) {
  const tips = [...(t.roundTips || []), ...(t.bluntTips || [])]
  if (!tips.length) continue
  for (const v of tips) {
    const tk = tipKey(v.p)
    const legs = []
    for (const run of (t.runs || [])) {
      if (!run.poly || run.poly.length < 2) continue
      for (const p of [run.poly[0], run.poly[run.poly.length - 1]]) {
        if (tipKey(p) === tk) legs.push({ skelId: run.skelId, side: run.side, segOrd: run.segOrd })
      }
    }
    capTips.push({ tk, skelId: v.skelId, capEnd: v.capEnd, round: !!(t.roundTips || []).includes(v), legs })
  }
}

// The fe slots a flip can WRITE, per (skelId, side): representative key + fan.
// Same construction as scratch/t4-fe-parity.mjs (the fe-identity gate): the fes
// only build inside the neighborhood stencil.
const nb = JSON.parse(fs.readFileSync('cartograph/data/lafayette-square/neighborhood_boundary.json', 'utf8'))
let design = {}
try { design = JSON.parse(fs.readFileSync('public/looks/lafayette-square/design.json', 'utf8')) } catch {}
const sc0 = ((nb?.streetFade?.outer ?? nb.radius) + 50) / nb.radius
const [cx, cz] = nb.center
const stencil = nb.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])
const orig = console.log; console.log = () => {}
const v2 = buildBlockGeometryV2(ribbons, {
  stencil,
  blockCustoms: design.blockCustoms || null,
  cornerRadiusScale: design.cornerRadiusScale,
  cornerRadiusOverrides: design.cornerRadiusOverrides,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides,
  curbWidth: design.curbWidth ?? 0.15,
  blockLandUse: design.blockLandUse,
})
console.log = orig
const fes = v2?.frontageEdges || v2?.fes || []
const writable = new Map()   // skelId|side → Set(segOrd reachable after the fan)
for (const fe of fes) {
  const k = feCustomKey(fe)
  if (!k) continue
  const key = `${k[0]}|${k[1]}`
  if (!writable.has(key)) writable.set(key, new Set())
  for (const so of fe.segOrds) writable.get(key).add(so)
}
console.log(`fes: ${fes.length}, caps: ${capTips.length}`)

let bad = 0
for (const c of capTips) {
  for (const leg of c.legs) {
    if (!leg.skelId) continue
    const set = writable.get(`${leg.skelId}|${leg.side}`)
    const okSlot = set && set.has(leg.segOrd)
    if (!okSlot) {
      bad++
      console.log(`  ✗ ${c.skelId}:${c.capEnd} leg ${leg.skelId}|${leg.side}|segOrd ${leg.segOrd}` +
        ` — writable slots: ${set ? [...set].sort((a, b) => a - b).join(',') : '(no fe)'}`)
    }
  }
}
console.log(bad ? `\n${bad} leg slot(s) UNREACHABLE by a flip write` : '\n✓ every dead-end leg slot is writable')

// ── Summary: WHY unreachable — no fe on that chain-side at all, vs an fe that
// exists but doesn't own the run's segOrd (the render reads one past the last).
const chainSides = new Set(fes.map(fe => `${fe.chainSkelId || fe.chainName}|${fe.side}`))
let noFe = 0, offEnd = 0, other = 0
for (const c of capTips) for (const leg of c.legs) {
  if (!leg.skelId) continue
  const key = `${leg.skelId}|${leg.side}`
  const set = writable.get(key)
  if (set && set.has(leg.segOrd)) continue
  if (!chainSides.has(key) || !set) noFe++
  else if (leg.segOrd > Math.max(...set)) offEnd++
  else other++
}
console.log(`  no fe on that chain-side at all : ${noFe}`)
console.log(`  fe exists, run segOrd past its last: ${offEnd}`)
console.log(`  other mismatch                   : ${other}`)
