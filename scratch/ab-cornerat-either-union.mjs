#!/usr/bin/env node
// A/B the LIVE producer across a cornerAt change: dump every tile's curb ring
// `iA` and diff the two runs vertex by vertex, so the blast radius is MEASURED
// rather than argued.
//
//   node scratch/ab-cornerat-either-union.mjs before.json      # writes a dump
//   node scratch/ab-cornerat-either-union.mjs after.json --vs before.json
//
// ⛔ Loads the scene's AUTHORED blockCustoms (Layer 0 q3). The sibling litmus
// passes `blockCustoms: null` and is blind to the operator's widths; a curb A/B
// taken without them compares two wrong maps and would call an authored width a
// change. If the look is missing this REFUSES rather than measuring bare defaults.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const { buildTileGround } = await import(path.join(ROOT, 'src/lib/tileGround.js'))

const out = process.argv[2]
const vsIdx = process.argv.indexOf('--vs')
const vs = vsIdx > 0 ? process.argv[vsIdx + 1] : null
const SCENE = 'lafayette-square'
if (!out) { console.log('usage: ab-cornerat-either-union.mjs <out.json> [--vs before.json]'); process.exit(2) }

const DESIGN = path.join(ROOT, `public/looks/${SCENE}/design.json`)
if (!fs.existsSync(DESIGN)) { console.log(`⛔ no design.json at ${DESIGN} — refusing to A/B without the authored state`); process.exit(2) }
const design = JSON.parse(fs.readFileSync(DESIGN, 'utf8'))

const ribbons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ribbons.json')))
const pr = buildTileGround(ribbons, {
  stencil: null,
  curbWidth: design.curbWidth ?? 0.15,
  smooth: 0,
  blockLandUse: design.blockLandUse || null,
  cornerRadiusScale: design.cornerRadiusScale ?? 1,
  cornerRadiusOverrides: design.cornerRadiusOverrides || null,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides || null,
  blockCustoms: design.blockCustoms || null,
  emitArtifact: true,
})
const tiles = pr._shapeArtifact || []
// Key each tile by its RING GEOMETRY, never by index — the live pass and the
// frozen artifact number tiles differently, and an index join would silently
// pair unrelated tiles (CLAUDE.md, the coordinate→tile rule).
const round = (v) => Math.round(v * 100) / 100
const dump = {}
for (const t of tiles) {
  if (!t?.ring?.length) continue
  let x = 0, y = 0
  for (const p of t.ring) { x += p[0]; y += p[1] }
  const key = `${round(x / t.ring.length)},${round(y / t.ring.length)}`
  dump[key] = (t.iA || []).map(poly => poly.map(p => [round(p[0]), round(p[1])]))
}
fs.writeFileSync(out, JSON.stringify(dump))
console.log(`wrote ${out}: ${Object.keys(dump).length} tiles`)

if (vs) {
  const before = JSON.parse(fs.readFileSync(vs, 'utf8'))
  const keys = new Set([...Object.keys(before), ...Object.keys(dump)])
  const changed = []
  for (const k of keys) {
    const a = JSON.stringify(before[k] ?? null), b = JSON.stringify(dump[k] ?? null)
    if (a === b) continue
    // where did it move? report the max vertex displacement + its location
    const fa = (before[k] || []).flat(), fb = (dump[k] || []).flat()
    let worst = 0, at = null
    for (const p of fb) {
      let near = Infinity
      for (const q of fa) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < near) near = d }
      if (near > worst) { worst = near; at = p }
    }
    changed.push({ k, vertsBefore: fa.length, vertsAfter: fb.length, worst, at })
  }
  console.log(`\n═══ A/B  ${vs} → ${out}`)
  console.log(`tiles total ${keys.size}   UNCHANGED ${keys.size - changed.length}   CHANGED ${changed.length}`)
  changed.sort((x, y) => y.worst - x.worst)
  for (const c of changed) {
    console.log(`  tile@centroid ${c.k}   iA verts ${c.vertsBefore} → ${c.vertsAfter}   max new-vertex displacement ${c.worst.toFixed(3)} m at [${c.at?.[0]}, ${c.at?.[1]}]`)
  }
}
