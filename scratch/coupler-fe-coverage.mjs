// coupler-fe-coverage.mjs — TRUNK PORT (2026-07-30).
//
// Does every dead-end LEG SLOT have a frontage edge to click? The branch original
// asked this of Slice-1's walk-ordinal index (`buildFoldWalkIndex`, 191 of 198). Trunk
// has no walk index — the click addresses the ordinary `[chainSkelId, side, segOrd]`
// triple — so this asks the same question in trunk's own terms: for every FILL run on
// a dead-end cap tile, is there an fe offering that exact key?
//
// ⭐ This measures EXISTENCE (is there a surface to click). It does NOT measure
// BOUNDING (does the leg stop where it should) — and per `POLYGON-FIRST §2.1` Check 5
// the dominant defect is bounding, not existence. Read this probe as the correction to
// "there is nothing to click", never as the gate for the class.
//   node scratch/coupler-fe-coverage.mjs
import fs from 'fs'
import { foldLegs, loadRibbons, ringKey, fillByRing } from './coupler-fold-legs.mjs'

const ribbons = loadRibbons()
const folds = foldLegs(ribbons)
const { design, byRing } = await fillByRing(ribbons)

const nb = JSON.parse(fs.readFileSync('cartograph/data/lafayette-square/neighborhood_boundary.json', 'utf8'))
const sc0 = ((nb?.streetFade?.outer ?? nb.radius) + 50) / nb.radius
const [cx, cz] = nb.center
const stencil = nb.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])

const o = console.log; console.log = () => {}
const { buildBlockGeometryV2 } = await import('../src/lib/buildBlockGeometryV2.js')
const v2 = buildBlockGeometryV2(ribbons, {
  stencil, blockCustoms: design.blockCustoms || null,
  curbWidth: design.curbWidth ?? 0.15, blockLandUse: design.blockLandUse,
})
console.log = o

// every (chain, side, segOrd) an fe actually offers
const feAt = new Set()
for (const fe of v2.frontageEdges || []) {
  const k = fe.chainSkelId || fe.chainName
  if (!k || fe.side == null) continue
  for (const so of (fe.segOrds || [])) feAt.add(`${k}|${fe.side}|${so}`)
}

// every dead-end leg slot the FILL made, on the cap tiles
const slots = new Map()
for (const f of folds) {
  const st = byRing.get(ringKey(f.ring))
  for (const r of (st?.runs || [])) {
    if (r.skelId !== f.skelId) continue
    slots.set(`${r.skelId}|${r.side}|${r.segOrd ?? 0}`, f)
  }
}

let hit = 0, miss = 0
const missRows = []
for (const [key] of slots) {
  if (feAt.has(key)) { hit++; continue }
  miss++
  const [skel, side, so] = key.split('|')
  const flip = side === 'left' ? 'right' : 'left'
  missRows.push(`  ${skel} side=${side} segOrd=${so} — fe on the OPPOSITE side exists: ${feAt.has(`${skel}|${flip}|${so}`)}`)
}

console.log(`── dead-end leg slots vs frontage edges (EXISTENCE, not bounding) ──`)
console.log(`total frontage edges on the map: ${(v2.frontageEdges || []).length}`)
console.log(`dead-end leg slots WITH an fe (clickable): ${hit} / ${slots.size}`)
console.log(`dead-end leg slots with NO fe:             ${miss} / ${slots.size}`)
if (missRows.length) console.log(missRows.sort().join('\n'))
console.log(`\n⭐ The dominant dead-end defect is BOUNDING, not EXISTENCE — see POLYGON-FIRST §2.1 Check 5`)
console.log(`   and scratch/coupler-slit-anatomy.mjs for the missing mouth corner.`)
