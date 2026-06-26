// PHASE 2 gate — iA byte-identity across ALL tiles (incl. multi-spur), splice ON vs OFF.
import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
import { STREET_SMOOTH } from '../src/lib/smoothCenterline.js'
import { CURB_WIDTH } from '../src/cartograph/streetProfiles.js'

const root = new URL('../', import.meta.url)
const ribbons = JSON.parse(fs.readFileSync(new URL('src/data/ribbons.json', root)))
const design = JSON.parse(fs.readFileSync(new URL('public/looks/lafayette-square/design.json', root)))

const baseOpts = {
  curbWidth: Number.isFinite(design.curbWidth) ? design.curbWidth : CURB_WIDTH,
  smooth: STREET_SMOOTH,
  blockLandUse: design.blockLandUse || null,
  cornerRadiusScale: Number.isFinite(design.cornerRadiusScale) ? design.cornerRadiusScale : 1,
  cornerRadiusOverrides: design.cornerRadiusOverrides || null,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides || null,
  blockCustoms: design.blockCustoms || null,
  emitArtifact: true,
}

const silence = () => { const log = console.log; console.log = () => {}; return () => { console.log = log } }
let un = silence()
const prOff = buildTileGround(ribbons, { ...baseOpts, deadEndMouthSplice: false })
const prOn = buildTileGround(ribbons, { ...baseOpts, deadEndMouthSplice: true })
un()

const off = prOff._shapeArtifact, on = prOn._shapeArtifact
const J = (x) => JSON.stringify(x)

console.log(`tiles: off=${off.length} on=${on.length}`)

// ── iA byte-identity (THE GATE) ──
let iaMoved = 0; const moved = []
for (let i = 0; i < off.length; i++) {
  if (J(off[i].iA) !== J(on[i].iA)) { iaMoved++; moved.push(i) }
}
console.log(`\n=== iA byte-identity (THE GATE) ===`)
console.log(`tiles where iA MOVED: ${iaMoved} ${iaMoved === 0 ? '✅ BYTE-IDENTICAL EVERYWHERE' : '❌ ' + J(moved)}`)

// also asphalt(Aacc), curb(Cacc) silhouette equality via the returned aggregate rings
const eq = (a, b) => J(a) === J(b)
console.log(`asphalt aggregate identical: ${eq(prOff.asphalt, prOn.asphalt) ? 'YES' : 'NO'}`)
console.log(`curb aggregate identical:    ${eq(prOff.curb, prOn.curb) ? 'YES' : 'NO'}`)
console.log(`block aggregate identical:   ${eq(prOff.block, prOn.block) ? 'YES' : 'NO'}`)

// ── the splice fired: runs DID move (and where) ──
let runsMoved = 0; const rmTiles = []
for (let i = 0; i < off.length; i++) {
  if (J(off[i].runs) !== J(on[i].runs)) { runsMoved++; rmTiles.push(i) }
}
console.log(`\n=== splice fired (runs moved) ===`)
console.log(`tiles where runs changed: ${runsMoved} -> ${J(rmTiles)}`)

// ── segOrd / customs identity: the splice must NOT renumber runs ──
let segMismatch = 0
for (let i = 0; i < off.length; i++) {
  const a = off[i].runs.map(r => `${r.skelId}|${r.side}|${r.segOrd}`).join(',')
  const b = on[i].runs.map(r => `${r.skelId}|${r.side}|${r.segOrd}`).join(',')
  if (a !== b) { segMismatch++; console.log(`  segOrd mismatch tile[${i}]`) }
}
console.log(`\n=== segOrd / run-identity stability ===`)
console.log(`tiles with segOrd/identity drift: ${segMismatch} ${segMismatch === 0 ? '✅ stable (customs safe)' : '❌'}`)

// ── fillets identity (we read them, never change them) ──
let filletMoved = 0
for (let i = 0; i < off.length; i++) if (J(off[i].fillets) !== J(on[i].fillets)) filletMoved++
console.log(`tiles where fillets changed: ${filletMoved} ${filletMoved === 0 ? '✅' : '❌'}`)
