// claims-deadend-set-decomposition.mjs — READ-ONLY. Written for PIPELINE-CLAIMS.md (Quill, 2026-08-05).
//
// WHY: the corpus quotes three similar-sized dead-end sets interchangeably —
//   (a) "spurs missing a mouth corner"  (b) "legs running THROUGH the mouth"
//   (c) "fold chains with no mouth disc"
// POLYGON-FIRST §2.1 says (a) is SIX and that the widely-quoted 9 is (b); PIPELINE §Wall
// repeats that. The probe that produced the 6 (`stamp-mouth-audit.mjs`) was DELETED by
// 7b5b87a3 and cannot be re-run. `coupler-slit-anatomy.mjs` — which CAN be re-run — puts
// (a) at 9. This decomposes all three off the frozen artifact and reports the overlap, so
// the claim file can say which sets are actually distinct instead of asserting it.
//
// Reads: src/data/ribbons.json (prebake output) + public/looks/lafayette-square/design.json
// (the mouth-disc side only, via fillByRing). Writes nothing.
//   node scratch/claims-deadend-set-decomposition.mjs
// ⭐ DUAL STATE (CLAUDE.md Layer 0 q3 / the a03-curb-identity pattern). A and B are read
// off `ribbons.json` — PREBAKE output, which does not read design.json/blockCustoms, so
// they are invariant on the authoring channel by construction. C runs the SHAPE pass, so
// it is measured TWICE and both results are printed with the state that produced them.
import fs from 'node:fs'
import { foldLegs, mouthInfo, loadRibbons, ringKey } from './coupler-fold-legs.mjs'

const ribbons = loadRibbons()
const tiles = ribbons.tiles || []
const folds = foldLegs(ribbons)

async function mouthsByRing(authored) {
  let design = {}
  try { design = JSON.parse(fs.readFileSync('public/looks/lafayette-square/design.json', 'utf8')) } catch {}
  const o = console.log; console.log = () => {}
  const { buildTileGround } = await import('../src/lib/tileGround.js')
  const g = buildTileGround(ribbons, {
    smooth: 0, emitArtifact: true,
    blockCustoms: authored ? (design.blockCustoms || null) : null,
    curbWidth: design.curbWidth ?? 0.15,
  })
  console.log = o
  const m = new Map()
  for (const st of g._shapeArtifact) if (st.ring) m.set(ringKey(st.ring), st)
  return m
}

const label = (f) => `${f.skelId}[${f.capEnd}]`
const A = new Set(), B = new Set()
const onePass = new Set()

for (const f of folds) {
  const m = mouthInfo(f, tiles[f.tileIdx])
  if (!m) continue
  if (m.passes.length <= 1) onePass.add(label(f))
  if (!(m.built >= m.passes.length && m.passes.length > 1)) A.add(label(f))
  if (m.runThrough.length) B.add(label(f))
}

// C — no mouth disc FOR THIS CHAIN on its cap tile (the test `coupler-slit-universal`
// uses; an earlier draft of this probe asked "does the tile have any mouth disc at all",
// which is a different and much rarer condition — 1 vs 10).
async function setC(authored) {
  const byRing = await mouthsByRing(authored)
  const C = new Set()
  for (const f of folds) {
    const st = byRing.get(ringKey(f.ring))
    const ms = (st?.mouths || []).map(x => x.spurSkel)
    if (!ms.includes(f.skelId)) C.add(label(f))
  }
  return C
}
const C = await setC(true)
const Cdefaults = await setC(false)

const inter = (x, y) => [...x].filter(v => y.has(v))
const only = (x, ...ys) => [...x].filter(v => ys.every(y => !y.has(v)))

console.log(`folds (dead-end tips) total: ${folds.length}\n`)
console.log(`A · missing >=1 mouth corner : ${A.size}   ${[...A].sort().join(' ')}`)
console.log(`B · leg runs THROUGH mouth   : ${B.size}   ${[...B].sort().join(' ')}`)
console.log(`C · no mouth disc for the chain [AUTHORED]: ${C.size}   ${[...C].sort().join(' ')}`)
console.log(`C · same, [BARE DEFAULTS]                : ${Cdefaults.size}   ${[...Cdefaults].sort().join(' ')}`)
console.log(`\n(of A, how many had only ONE mouth pass rather than a genuine missing corner: ${inter(A, onePass).length})`)
console.log(`\nA ∩ B = ${inter(A, B).length}   A ∩ C = ${inter(A, C).length}   B ∩ C = ${inter(B, C).length}`)
console.log(`A only = ${only(A, B, C).join(' ') || '(none)'}`)
console.log(`B only = ${only(B, A, C).join(' ') || '(none)'}`)
console.log(`C only = ${only(C, A, B).join(' ') || '(none)'}`)
console.log(`\ndistinct CHAINS in C (vs folds): ${new Set([...C].map(s => s.split('[')[0])).size}`)
