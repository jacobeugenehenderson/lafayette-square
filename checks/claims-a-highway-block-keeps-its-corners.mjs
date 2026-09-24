#!/usr/bin/env node
// CLAIM — A BLOCK BESIDE A HIGHWAY KEEPS ITS TOWN CORNERS (H-3 step 3; Jacob's ruling "B").
//
// A block that touches a highway is its ② ring MINUS H (`tileGround.js`, "ONE EDGE"). A boolean
// re-mints the ring, and the per-vertex corner metadata — which corner a contour vertex belongs to
// (`iaArc`) and its eased radius — used to die in it (the compound-face path still loses it, counted as
// "went through SHARP"). The difference carries it on `booleanLabelled`'s opt-in payload channel.
// A corner where a town edge meets the highway is SHARP by ruling, so no fillet is made there; every
// fillet on such a tile is therefore a TOWN corner, and its contour vertices must still say so.
//
// ASSERTS, per frozen tile with a highway run (`run.hwy`, the set the shape pass differenced against H):
//   a tile that has fillets has at least one contour vertex carrying a corner id (`iaArc`) — except a
//   COMPOUND face, which already loses them at its hole subtraction (named, not judged).
// Prints, per scene, fillets vs distinct corner ids on H-touching tiles against the other tiles.
// A frozen shape with NO `hwy` stamp predates step 3 and is NOT CHECKED — loud, never a pass.
//
//   node checks/claims-a-highway-block-keeps-its-corners.mjs [scene…] [--shape=path]
//
// MUTATION (must go red): drop the payload — in the H difference pass `payload = null` and set
// `outArc` to nulls — build a shape to a temp file, and pass it as --shape.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'

const shapeOverride = process.argv.find(a => a.startsWith('--shape='))?.slice('--shape='.length)
let red = false
for (const scene of scenes('public/baked/<scene>/shape.json')) {
  const p = shapeOverride || join(ROOT, 'public/baked', scene, 'shape.json')
  if (!existsSync(p)) { console.log(`\n── ${scene}   ⛔ NOT CHECKED — no ${p}`); red = true; continue }
  const shape = JSON.parse(readFileSync(p, 'utf8'))
  const tiles = shape.tiles || []
  const touching = tiles.filter(t => (t.runs || []).some(r => r.hwy))
  if (!tiles.some(t => (t.runs || []).length)) { console.log(`\n── ${scene}   ⛔ NOT CHECKED — the frozen shape carries no runs`); red = true; continue }
  const highwayOwned = tiles.some(t => (t.runs || []).some(r => r.skelId === '__highway__'))
  if (!touching.length) {
    // ⛔ A shape WITH highway rings and no `hwy` stamp was frozen before H-3 step 3 — it cannot be judged.
    const stale = highwayOwned || (shape.highway || []).length > 0
    console.log(`\n── ${scene}   ${stale ? '⛔ NOT CHECKED — the shape has highways but no `hwy` stamp: frozen before H-3 step 3. Re-bake.' : 'no highway in this town'}`)
    if (stale) red = true
    continue
  }
  const stat = (ts) => ts.reduce((a, t) => { a.f += (t.fillets || []).length; a.ids += new Set((t.iaArc || []).flat().filter(x => x != null)).size; return a }, { f: 0, ids: 0 })
  // ⚠️ A COMPOUND FACE (a hole ring in its contour) loses its corner ids at the HOLE subtraction, before
  // H is reached — the pre-existing "went through SHARP" class, deliberately not carried by this channel
  // yet (Boz, 2026-09-24). Named, and kept out of the verdict.
  const area = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1] } return a / 2 }
  const compound = (t) => (t.iaFull || []).some(r => r?.length >= 3 && area(r) < 0)
  const orphaned = touching.filter(t => (t.fillets || []).length && !(t.iaArc || []).flat().some(x => x != null))
  const bad = orphaned.filter(t => !compound(t))
  const cf = orphaned.filter(compound)
  const T = stat(touching), O = stat(tiles.filter(t => !touching.includes(t)))
  console.log(`\n── ${scene} ── ${touching.length} tile(s) beside a highway: ${T.f} town corner fillet(s), ${T.ids} corner id(s) on the contour (other tiles: ${O.f} / ${O.ids}) ${bad.length ? '⛔' : '✅'}`)
  if (cf.length) console.log(`   ⚠️ ${cf.length} compound face(s) lost their corners at the hole subtraction (pre-existing, not this check's): ${cf.map(t => (t.runs || []).find(r => !r.hwy)?.skelId).join(', ')}`)
  if (bad.length) { red = true; console.log(`   ⛔ ${bad.length} tile(s) have fillets but NO contour vertex that knows its corner — the metadata died in the H difference`) }
}
console.log(red ? '\n⛔ A block beside a highway lost its town corners — or a shape could not be judged.' : '\n✅ Every block beside a highway keeps its town corners through the difference.')
process.exit(red ? 1 : 0)
