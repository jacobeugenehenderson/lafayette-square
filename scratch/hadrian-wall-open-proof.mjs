// ── Hadrian · Phase-D wall proof ────────────────────────────────────────────
// Proves the Section render derives from the FROZEN artifact alone:
//   1. This process loads ONLY public/baked/lafayette-square/shape.json —
//      no ribbons.json, no skeleton, no centerlineData, no store. If
//      sectionOpen composes the full Section ground (block / curb / asphalt /
//      ped fill) here, the render path needs no chain handle. (buildTileGround
//      is never called — assert: we poison it.)
//   2. Static assertion: the source of sectionOpen + sectionPass contains no
//      chain-graph identifiers (streets / ribbons / blockCustoms /
//      extractFaces / centerline) — the signature-level wall, regression-checked.
// Run: node scratch/hadrian-wall-open-proof.mjs
import { readFileSync } from 'node:fs'
import * as TG from '../src/lib/tileGround.js'

const { sectionOpen, sectionPass } = TG

// ── 2. static wall check on the open-side functions ──
//
// ⛔⛔ THIS PROOF CURRENTLY FAILS ON TRUNK — AND THE FAILURE IS UNADJUDICATED.
//     Verified 2026-08-02: it exits 1 with
//        ✗ sectionOpen references chain identifiers: blockCustoms
//     because `sectionOpen` gained a `blockCustoms` reference. ⭐ THE OPEN
//     QUESTION IS WHETHER THAT IS A VIOLATION AT ALL: `blockCustoms` is the
//     operator's AUTHORING, not a chain identifier. Everything else on this list
//     is chain-graph identity (the thing the wall exists to kill). Authoring is
//     not — CLAUDE.md Layer 0 q3: "the override IS the product", and a wall that
//     forbids the open side from seeing authoring would make every post-wall view
//     render the un-authored to-code default.
//     ⚠️ DO NOT "fix" this by editing either side until Jacob rules. Deleting the
//     entry makes a red proof green without deciding anything; deleting the code
//     reference would strip authoring out of Section. It is a DOCTRINE call for
//     the whole corpus, not a lint. → ROADMAP / standup 2026-08-02.
const FORBIDDEN = ['ribbons', 'streets', 'blockCustoms', 'extractFaces', 'centerline', 'skelId', 'buildTileGround']
// (skelId DOES appear in the frozen per-run meta as data — but the open-side
// code must never *dereference* chain identity; it only strokes frozen polys.)
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
for (const fn of [sectionOpen, sectionPass]) {
  const src = stripComments(String(fn))
  const hits = FORBIDDEN.filter(t => src.includes(t))
  if (hits.length) { console.error(`✗ ${fn.name} references chain identifiers: ${hits.join(', ')}`); process.exit(1) }
  console.log(`✓ ${fn.name}: no chain-graph identifiers in source (${FORBIDDEN.join(' / ')})`)
}

// ── 1. open the frozen artifact and compose the Section ground ──
// ⚠️ FIXED 2026-08-02 — this read shape.json as a BARE ARRAY, so `.length` was
// `undefined` and the line printed "✓ artifact loaded: undefined frozen tiles".
// The artifact is `{ tiles, highway }`. The bug was masked because the FORBIDDEN
// scan above exits(1) first (see the ⛔ note at the top), so nothing reached here.
const shapeRaw = JSON.parse(readFileSync(new URL('../public/baked/lafayette-square/shape.json', import.meta.url)))
const shapeTiles = Array.isArray(shapeRaw) ? shapeRaw : shapeRaw?.tiles
if (!Array.isArray(shapeTiles)) {
  console.error(`✗ shape.json is not the expected shape — got keys: ${Object.keys(shapeRaw ?? {}).join(', ') || '(none)'}`)
  process.exit(1)
}
console.log(`✓ artifact loaded: ${shapeTiles.length} frozen tiles (shape.json)`)

// The live Survey build is never invoked: 'buildTileGround' is in the
// FORBIDDEN source scan above — the open path cannot call it even though it
// shares the module. (ESM namespaces are frozen, so no runtime poison needed.)
const cw = 0.1524                                   // store default curbWidth
const out = sectionOpen(shapeTiles, cw, { outer: 'LU', inner: 'SW' })

const area = rings => rings.reduce((s, r) => {
  let a = 0
  for (let i = 0; i < r.length; i++) { const j = (i + 1) % r.length; a += r[i][0] * r[j][1] - r[j][0] * r[i][1] }
  return s + a / 2          // signed sum: Clipper outers CCW(+), holes CW(−) → net = filled area
}, 0)
const report = (k, rings) => console.log(`  ${k.padEnd(9)} ${String(rings.length).padStart(4)} rings  ${Math.round(area(rings)).toLocaleString().padStart(9)} m²`)
console.log('✓ sectionOpen composed the Section ground from the artifact alone:')
report('block', out.block)
report('curb', out.curb)
report('asphalt', out.asphalt)
report('sidewalk', out.sidewalk)
for (const [lu, r] of Object.entries(out.treelawnByLu)) report(`tl:${lu}`, r)
for (const [lu, r] of Object.entries(out.luByClass)) report(`lu:${lu}`, r)

const total = ['block', 'curb', 'asphalt', 'sidewalk'].every(k => out[k].length > 0)
if (!total) { console.error('✗ a core layer came back empty'); process.exit(1) }
console.log('✓ all core layers non-empty — Section opens the frozen Survey shape with no chain access')
