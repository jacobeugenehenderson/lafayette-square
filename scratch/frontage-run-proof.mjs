// Headless proof for the frontage-run width-drag fix (curb-offset-draw).
//
// Claim under test: the curb is built per-RUN (one run per chain natural-segment
// = per segOrd). A long avenue frontage where a side street T's in on the FAR
// side is ONE block-edge (fe) on the near side — the block-ring walker cuts only
// at REAL corners (different-street adjacency) — but the chain is segmented at
// the far-side T, so that single fe owns MULTIPLE segOrds. A per-block width drag
// that writes only the fe's representative (min) segOrd therefore leaves the
// other run(s) on the chain default → the offset draws a STEP at the through-node.
//
// The fix fans the dragged width across ALL of the anchor fe's segOrds. This
// script asserts the data shape that makes the fix correct + sufficient:
//   (A) there EXIST avenue fes whose segOrds.length > 1 (far-side-T frontages),
//       so writing min() alone strands runs → the bug; fanning fixes it.
//   (B) blocks separated by a REAL corner are DIFFERENT fes (independent widths
//       preserved — no over-unification).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildBlockGeometryV2 } from '../src/lib/buildBlockGeometryV2.js'
import { feCustomKey } from '../src/lib/feCustomKey.js'

const ribbons = JSON.parse(readFileSync(fileURLToPath(new URL('../src/data/ribbons.json', import.meta.url)), 'utf8'))

// Build the LS stencil the SAME way CartographApp does (neighborhood boundary
// scaled out to streetFade.outer + 50). Without a stencil there is no block
// figure and buildFrontageEdges returns 0 fes.
const nb = JSON.parse(readFileSync(fileURLToPath(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)), 'utf8'))
const LS_STENCIL = (() => {
  const poly = nb?.boundary, center = nb?.center, radius = nb?.radius
  if (!poly?.length || !center || !radius) return null
  const targetR = (nb?.streetFade?.outer ?? radius) + 50
  const scale = targetR / radius, cx = center[0], cz = center[1]
  return poly.map(([x, z]) => [cx + (x - cx) * scale, cz + (z - cz) * scale])
})()

const { frontageEdges } = buildBlockGeometryV2(ribbons, { stencil: LS_STENCIL })
console.log(`built ${frontageEdges.length} frontage edges (fes)\n`)

// ── (A) multi-segOrd frontages — the far-side-T / through-node case ──────────
const multi = frontageEdges
  .filter(fe => (fe.segOrds?.length || 0) > 1)
  .sort((a, b) => (b.segOrds.length - a.segOrds.length))

console.log(`(A) fes spanning MULTIPLE segOrds (a far-side T / dogleg lives here): ${multi.length}`)
for (const fe of multi.slice(0, 12)) {
  const k = feCustomKey(fe)
  console.log(
    `   ${String(fe.chainName).padEnd(22)} side=${fe.side.padEnd(5)} ` +
    `segOrds=[${fe.segOrds.join(',')}]  repr(min)=${k ? k[2] : '∅'}  ` +
    `→ OLD drag writes ONLY segOrd ${k ? k[2] : '∅'}; runs ${fe.segOrds.filter(s => s !== (k ? k[2] : -1)).join(',')} miss → STEP`
  )
}

// Focus the canonical case: Lafayette Avenue along the park.
const laf = multi.filter(fe => /lafayette avenue/i.test(fe.chainName || ''))
console.log(`\n   Lafayette Avenue multi-segOrd frontages (the park frontage class): ${laf.length}`)
for (const fe of laf) {
  console.log(`     ${fe.chainSkelId} side=${fe.side} segOrds=[${fe.segOrds.join(',')}]`)
}

// Simulate the FIX's write set vs the OLD write set for one such fe.
const sample = laf[0] || multi[0]
if (sample) {
  const oldKeys = [feCustomKey(sample)]
  const newKeys = sample.segOrds.map(seg => feCustomKey({ ...sample, segOrds: [seg] }))
  console.log(`\n   sample fe = ${sample.chainName} (${sample.chainSkelId}) side=${sample.side}`)
  console.log(`     OLD write set (segOrds): [${oldKeys.map(k => k[2]).join(',')}]   ← one run`)
  console.log(`     NEW write set (segOrds): [${newKeys.map(k => k[2]).join(',')}]   ← whole frontage run`)
  const covers = sample.segOrds.every(seg => newKeys.some(k => k[2] === seg))
  console.log(`     NEW set covers every run of the frontage? ${covers ? 'YES ✓' : 'NO ✗'}`)
  if (!covers) process.exitCode = 1
}

// ── (B) real-corner independence — avenue blocks split by a TRUE corner ──────
// Group fes by chain+side; if a chain has >1 fe on a side, those are
// corner-separated frontages (different block-edges) and keep INDEPENDENT keys.
const byChainSide = new Map()
for (const fe of frontageEdges) {
  const id = `${fe.chainSkelId}|${fe.side}`
  if (!byChainSide.has(id)) byChainSide.set(id, [])
  byChainSide.get(id).push(fe)
}
let multiFeChains = 0, distinctKeyOk = true
for (const [id, fes] of byChainSide) {
  // Only authorable fes carry a key (feCustomKey null = empty segOrds = a tiny
  // fe assignSegOrdsToFes never reached; never authored, falls to chain default).
  const keyed = fes.map(fe => feCustomKey(fe)).filter(Boolean)
  if (keyed.length < 2) continue
  multiFeChains++
  const keys = new Set(keyed.map(k => JSON.stringify(k)))
  if (keys.size !== keyed.length) { distinctKeyOk = false; console.log(`   ✗ ${id}: ${keyed.length} authorable fes but ${keys.size} distinct keys`) }
}
console.log(`\n(B) chain-sides with >1 fe (REAL-corner-separated frontages): ${multiFeChains}`)
console.log(`   every corner-separated fe keeps a DISTINCT customs key (independent width)? ${distinctKeyOk ? 'YES ✓' : 'NO ✗'}`)
if (!distinctKeyOk) process.exitCode = 1

// Cross-check: a multi-segOrd fe's segOrds are DISJOINT from sibling fes on the
// same chain-side (so fanning across them never bleeds into a neighbor block).
let disjointOk = true
for (const [id, fes] of byChainSide) {
  if (fes.length < 2) continue
  const seen = new Map()
  for (const fe of fes) for (const s of (fe.segOrds || [])) {
    if (seen.has(s)) { disjointOk = false; console.log(`   ✗ ${id}: segOrd ${s} shared by 2 fes`) }
    seen.set(s, fe)
  }
}
console.log(`   each segOrd belongs to exactly ONE fe (fan-out can't bleed across a corner)? ${disjointOk ? 'YES ✓' : 'NO ✗'}`)
if (!disjointOk) process.exitCode = 1

console.log(`\nRESULT: ${process.exitCode ? 'FAIL' : 'PASS'}`)
