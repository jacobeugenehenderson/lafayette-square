// SLICE 2 — THE FLAG'S GATE. (Wren, 2026-08-14)
//
// Two assertions, and the first is the one that protects the map:
//   ① FLAG OFF ⇒ BIT-IDENTICAL. Not "looks the same" — the same bytes. If this
//      fails, the scaffolding has leaked into the shipped path and nothing else
//      here matters.
//   ② FLAG ON  ⇒ the election is disjoint and total, and the split is DECLARED.
//
//   node scratch/slice2-substrate-tiles-gate.mjs [--ribbons=<path>]
//
// ⛔ LS only. ⛔ Writes nothing.
import fs from 'fs'
import crypto from 'crypto'
import { loadScene, banner, ARG } from './_substrate-feed.mjs'

const o = console.log
const S = await loadScene('lafayette-square', ARG('ribbons', null))
banner(S, o)

const quiet = (fn) => { const c = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn() } finally { console.log = c; console.warn = w } }
const { buildTileGround } = await quiet(() => import('../src/lib/tileGround.js'))

const design = S.design
const opts = {
  curbWidth: design.curbWidth,
  blockCustoms: design.blockCustoms || {},
  blockLandUse: design.blockLandUse || {},
  cornerRadiusScale: design.cornerRadiusScale,
  cornerRadiusOverrides: design.cornerRadiusOverrides,
  smooth: 0,
  emitArtifact: true,
}
const H = (v) => 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 12)

o(`\n═══ ① FLAG OFF ⇒ BIT-IDENTICAL ═══`)
const A = quiet(() => buildTileGround(S.ribbons, { ...opts }))
const B = quiet(() => buildTileGround(S.ribbons, { ...opts, substrateTiles: false }))
const hA = H(A._shapeArtifact ?? A), hB = H(B._shapeArtifact ?? B)
o(`  no flag at all ............... ${hA}`)
o(`  substrateTiles: false ........ ${hB}`)
o(`  ${hA === hB ? '✅ IDENTICAL' : '⛔⛔ DIFFERENT — the scaffolding has leaked into the shipped path'}`)
if (hA !== hB) process.exitCode = 1

o(`\n═══ ② FLAG ON ⇒ the election, declared and asserted ═══`)
let C = null, threw = null
try { C = buildTileGround(S.ribbons, { ...opts, substrateTiles: true }) } catch (e) { threw = e }
if (threw) { o(`  ⛔ THREW: ${threw.message}`); process.exitCode = 1 }
else {
  const hC = H(C._shapeArtifact ?? C)
  o(`  substrateTiles: true ......... ${hC}`)
  o(`  ${hC === hA ? '⛔ IDENTICAL TO FLAG-OFF — the flag did nothing, which is a defect of its own' : '✅ DIFFERENT from flag-off, as it must be'}`)
  if (hC === hA) process.exitCode = 1
}

o(`\n⛔ The eye-gate is the REAL RENDER, not this. A SHAPE change is invisible`)
o(`   until re-baked — re-freeze, then say which artifact is on screen.`)
