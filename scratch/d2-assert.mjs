// [D2 — prebake face freeze] THE ZERO-DIFF ASSERT HARNESS (the gate).
//
// Proves the freeze is invisible, three ways, against the COMMITTED
// src/data/ribbons.json (no pipeline rebuild in the loop — isolates the
// freeze itself from any rebuild drift):
//
//   1. TOPOLOGY  — freeze tiles[] exactly as derive.js does (extractFaces
//      over the filtered serialized streets, streetIdx → skelId), JSON
//      round-trip them (simulating the artifact file), rehydrate through the
//      REAL consumer (tilesFromFrozen), and deep-compare against a live
//      extractFaces walk: same tile count/order, ring vertex values exactly
//      equal (===), per-edge (streetIdx, forward, side) identical.
//
//   2. END-TO-END — buildTileGround over ribbons WITH frozen tiles vs
//      WITHOUT (live walk fallback), with full bake-fidelity opts from
//      public/looks/<scene>/design.json (curbWidth, cornerRadiusScale,
//      corner overrides, blockCustoms, blockLandUse, emitArtifact).
//      JSON.stringify of the full result must be byte-identical.
//
//   3. DEFAULT-OPTS END-TO-END — same as 2 with bare defaults (the live
//      Survey render path's opts shape).
//
// Zero diff or the gate FAILS (exit 1, with the first divergence printed).

import { readFileSync } from 'fs'
import { extractFaces, tilesFromFrozen, buildTileGround } from '../src/lib/tileGround.js'

const ROOT = new URL('..', import.meta.url).pathname
const ribbons = JSON.parse(readFileSync(ROOT + 'src/data/ribbons.json', 'utf-8'))
const design = JSON.parse(readFileSync(ROOT + 'public/looks/lafayette-square/design.json', 'utf-8'))

let failures = 0
const fail = (msg) => { failures++; console.error('  ✗ ' + msg) }
const ok = (msg) => console.log('  ✓ ' + msg)

// ── The freeze, exactly as derive.js performs it ─────────────────────────
const faceStreets = (ribbons.streets || []).filter(s => s?.points?.length >= 2 && !s.gradeSeparated)
const frozenRaw = extractFaces(faceStreets).map(f => ({
  ring: f.ring.map(p => [p[0], p[1]]),
  edges: f.edges.map(e => ({ skelId: faceStreets[e.streetIdx].skelId || faceStreets[e.streetIdx].name, side: e.side })),
}))
// JSON round-trip — what the artifact file does to the floats (must be lossless)
const frozen = JSON.parse(JSON.stringify(frozenRaw))

// ── 1. TOPOLOGY zero-diff ────────────────────────────────────────────────
console.log('[1] topology: frozen-consumed vs live extractFaces')
const live = extractFaces(faceStreets)
const consumed = tilesFromFrozen(frozen, faceStreets)
if (!consumed) fail('tilesFromFrozen returned null (skelId mapping failed)')
else {
  if (consumed.length !== live.length) fail(`tile count: frozen ${consumed.length} vs live ${live.length}`)
  const n = Math.min(consumed?.length || 0, live.length)
  let diffs = 0
  for (let t = 0; t < n; t++) {
    const A = consumed[t], B = live[t]
    if (A.ring.length !== B.ring.length) { fail(`tile ${t}: ring length ${A.ring.length} vs ${B.ring.length}`); diffs++; continue }
    for (let i = 0; i < B.ring.length; i++) {
      if (A.ring[i][0] !== B.ring[i][0] || A.ring[i][1] !== B.ring[i][1]) {
        fail(`tile ${t} ring[${i}]: [${A.ring[i]}] vs [${B.ring[i]}]`); diffs++; break
      }
      const ea = A.edges[i], eb = B.edges[i]
      if (ea.streetIdx !== eb.streetIdx || ea.forward !== eb.forward || ea.side !== eb.side) {
        fail(`tile ${t} edge[${i}]: {${ea.streetIdx},${ea.forward},${ea.side}} vs {${eb.streetIdx},${eb.forward},${eb.side}}`); diffs++; break
      }
    }
    if (diffs > 8) { fail('…stopping after 8 diffs'); break }
  }
  if (!diffs && consumed.length === live.length)
    ok(`${live.length} tiles, ${live.reduce((a, f) => a + f.ring.length, 0)} ring vertices + edge tags — IDENTICAL`)
}

// ── 2 + 3. END-TO-END byte-compare ──────────────────────────────────────
const bakeOpts = {
  curbWidth: Number.isFinite(design.curbWidth) ? design.curbWidth : undefined,
  smooth: 0,
  blockLandUse: design.blockLandUse || null,
  cornerRadiusScale: Number.isFinite(design.cornerRadiusScale) ? design.cornerRadiusScale : 1,
  cornerRadiusOverrides: design.cornerRadiusOverrides || null,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides || null,
  blockCustoms: design.blockCustoms || null,
  emitArtifact: true,
}
const cases = [
  ['bake-fidelity opts (design.json + emitArtifact)', bakeOpts],
  ['default opts (live Survey shape)', {}],
]
for (const [label, opts] of cases) {
  console.log(`[${label === cases[0][0] ? 2 : 3}] end-to-end buildTileGround: ${label}`)
  const withTiles = { ...ribbons, tiles: frozen }
  const withoutTiles = { ...ribbons }; delete withoutTiles.tiles
  const a = JSON.stringify(buildTileGround(withTiles, opts))
  const b = JSON.stringify(buildTileGround(withoutTiles, opts))
  if (a === b) ok(`output byte-identical (${(a.length / 1e6).toFixed(1)} MB serialized)`)
  else {
    let i = 0; while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++
    fail(`outputs DIVERGE at char ${i}: …${a.slice(Math.max(0, i - 60), i + 60)}… vs …${b.slice(Math.max(0, i - 60), i + 60)}…`)
  }
}

console.log(failures ? `\nGATE FAILED — ${failures} divergence(s)` : '\nGATE PASSED — the freeze is invisible (zero diff)')
process.exit(failures ? 1 : 0)
