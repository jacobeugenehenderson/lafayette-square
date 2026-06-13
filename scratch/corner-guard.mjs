// CORNER GUARD — protects the hard-won corner construction from the throat clamp.
// sectionPass is per-tile independent, so:
//   • a tile whose ped output is byte-identical → all its corners trivially safe.
//   • a tile that CHANGES → assert every changed vertex is FAR from any fillet apex
//     (a corner moving lands a changed vertex on a fillet → FAIL loud).
//
//   node scratch/corner-guard.mjs --snapshot   # baseline (run BEFORE editing)
//   node scratch/corner-guard.mjs --check      # after the clamp; PASS/FAIL on corners
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { buildTileGround, sectionPass } from '../src/lib/tileGround.js'

const BASE = new URL('./corner-guard-baseline.json', import.meta.url)
const MARGIN = 8   // m — a change nearer than this to a fillet apex is a corner touch

const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
const cw = d.curbWidth, customs = d.blockCustoms || null
const stripMat = { outer: 'LU', inner: 'SW' }

const pr = buildTileGround(r, { stencil: clip, smooth: 0, curbWidth: cw, blockLandUse: d.blockLandUse||null, cornerRadiusScale: d.cornerRadiusScale??1, blockCustoms: customs, emitArtifact: true })
const tiles = pr._shapeArtifact

const q = (v) => Math.round(v * 1000) / 1000   // mm quantization
const ringsVerts = (rings) => { const s = new Set(); for (const rr of (rings||[])) for (const p of rr) s.add(q(p[0]) + ',' + q(p[1])); return s }
// per-tile signature: the union of SW + TL + LU vertices (the ped output)
function sig(ti) {
  const out = sectionPass([tiles[ti]], cw, stripMat, customs)
  const all = [...out.Wacc, ...Object.values(out.tlByLu||{}).flat(), ...Object.values(out.luByLu||{}).flat()]
  return ringsVerts(all)
}
const apexesOf = (ti) => (tiles[ti].fillets || []).map(f => f.apex)

const mode = process.argv.includes('--check') ? 'check' : 'snapshot'

if (mode === 'snapshot') {
  const snap = tiles.map((_, ti) => ({ verts: [...sig(ti)], apexes: apexesOf(ti) }))
  writeFileSync(BASE, JSON.stringify(snap))
  let nv = 0; for (const s of snap) nv += s.verts.length
  console.log(`SNAPSHOT written: ${snap.length} tiles, ${nv} ped vertices, ${snap.reduce((a,s)=>a+s.apexes.length,0)} fillet apexes (corners protected)`)
} else {
  if (!existsSync(BASE)) { console.error('No baseline — run --snapshot first (BEFORE editing).'); process.exit(1) }
  const snap = JSON.parse(readFileSync(BASE))
  if (snap.length !== tiles.length) console.log(`⚠️ tile count changed ${snap.length}→${tiles.length} (shape pass changed?)`)
  let changedTiles = 0, worst = Infinity, fails = []
  for (let ti = 0; ti < Math.min(snap.length, tiles.length); ti++) {
    const before = new Set(snap[ti].verts)
    const after = sig(ti)
    // symmetric difference = changed vertices
    const changed = []
    for (const v of after) if (!before.has(v)) changed.push(v)
    for (const v of before) if (!after.has(v)) changed.push(v)
    if (!changed.length) continue
    changedTiles++
    const apexes = snap[ti].apexes
    let near = Infinity
    for (const v of changed) {
      const [x, y] = v.split(',').map(Number)
      for (const a of apexes) { const dd = Math.hypot(x - a[0], y - a[1]); if (dd < near) near = dd }
    }
    if (near < worst) worst = near
    const status = near < MARGIN ? '❌ CORNER TOUCH' : 'ok (throat only)'
    if (near < MARGIN) fails.push(ti)
    console.log(`tile#${ti}: ${changed.length} changed verts, nearest corner ${isFinite(near)?near.toFixed(2)+'m':'(no fillet)'} → ${status}`)
  }
  console.log(`\n${changedTiles} tiles changed; nearest any change came to a corner = ${isFinite(worst)?worst.toFixed(2)+'m':'n/a'} (margin ${MARGIN}m)`)
  if (fails.length) { console.log(`\n❌ FAIL — corners touched on tiles ${fails.join(',')}`); process.exit(2) }
  else console.log(`\n✅ PASS — every change is ≥${MARGIN}m from all corners; the corner construction is untouched.`)
}
