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
// ⭐ WHAT THIS LIST TESTS — read before adding to it.
//    WALL.md's doctrine line: "Chains die here. Past the wall, NO GEOMETRY
//    DERIVED FROM CHAINS." §3: what crosses is "everything Section needs,
//    nothing chain-shaped." The rule is about WHERE GEOMETRY COMES FROM. It is
//    not a rule about which words appear in the function body — this scan is a
//    crude proxy for provenance, so every entry needs to earn its place.
//
//    ⛔ THE ENTRIES BELOW ARE THE CHAIN *GRAPH*: reaching any of them would let
//    the open side re-derive a polygon instead of reading the frozen one.
//
// ── `blockCustoms` was REMOVED from this list, 2026-08-04 (Jacob's ruling) ──
//    It sat here from the start and turned the proof RED once `sectionOpen`
//    gained its one authoring read. That was a FALSE POSITIVE:
//      • `blockCustoms` is the OPERATOR'S AUTHORING, not chain identity.
//      • Its only use is a dictionary lookup —
//          blockCustoms?.[run.skelId]?.[run.side]?.[run.segOrd]   (tileGround.js:1107)
//        — returning SCALARS (treelawn/sidewalk width, capFlip). Every polygon
//        still comes from the frozen artifact. No geometry is derived from a chain.
//      • THE LIST CONTRADICTED ITSELF: the note below already grants exactly this
//        exception to `skelId` (id-as-data is fine; dereferencing the GRAPH is not),
//        then banned the table that is merely KEYED by `skelId`.
//      • Taking it literally would be a Layer-0 q3 violation in its own right: if
//        the open side could not see `blockCustoms`, every post-wall view would
//        render the UN-AUTHORED to-code default — the wall erasing the product.
//        "The override IS the product" (ORIENTATION, CLAUDE.md Layer 0 q3).
//
//    ⚠️ THE REAL FRAGILITY, WHICH THIS CHECK CANNOT SEE — KEEP IT IN VIEW.
//    `blockCustoms` is keyed BY `skelId`, so the authoring table's key space is
//    chain-shaped. That is not a wall violation, but if chains ever renumber,
//    AUTHORED CUSTOMS ORPHAN SILENTLY. It is the same hazard already flagged on
//    **T3** (migrate the frontage-edge identity onto the tile `runs`): README's
//    construction-model row — "⚠️ T3 must prove key parity FIRST or authored
//    customs silently orphan" — and ROADMAP **C4**, which T3 gates. If you touch
//    chain numbering or the fe→run identity migration, that parity proof is the
//    gate, not this scan. → ROADMAP C4 · README §construction model · WALL.md §6.
const FORBIDDEN = ['ribbons', 'streets', 'extractFaces', 'centerline', 'skelId', 'buildTileGround']
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
