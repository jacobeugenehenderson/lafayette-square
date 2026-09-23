// boulder-farfield-cost.mjs — WHAT DOES A WHOLE-SHORE DRAPE COST?
// Jacob ruled 2026-09-23 that the shore must never be empty at any distance: the DRAPE
// shows everywhere, boulders stay near-camera. This measures the drape's cost for ALL
// armoured shore at each resolution, so the far-field plan rests on numbers.
// Read-only. ▶ node scratch/boulder-farfield-cost.mjs
import { readFileSync } from 'node:fs'
import { revetmentFaces } from '../src/lib/revetmentFromSlab.js'
import { drapeGlobals, revetmentDrape } from '../src/lib/revetmentDrape.js'

const doc = JSON.parse(readFileSync('public/baked/huron/revetment.json', 'utf8'))
const faces = revetmentFaces(doc).filter(f => f.anyArmour)
console.log(`huron: ${faces.length} armoured faces · ${doc.totals.armouredM} m armoured of ${doc.totals.ruledM} m ruled\n`)
console.log('oct  faces  verts        tris        ms      MB(pos+nrm f32)')
for (const octaves of [3, 2, 1, 0]) {
  let verts = 0, tris = 0
  const t0 = performance.now()
  for (const f of faces) {
    try {
      const G = drapeGlobals({ poly: f.poly, crestAt: f.crestAt, octaves })
      const d = revetmentDrape({ poly: f.poly, crestAt: f.crestAt, octaves, globals: G })
      tris += d.stats?.tris || 0
      verts += G.nAlong * G.nAcross
    } catch (e) { console.log('   face', f.key, 'FAILED', e.message) }
  }
  const ms = performance.now() - t0
  // position + normal, Float32 — what a baked drape would actually weigh.
  const mb = (verts * 6 * 4) / 1e6
  console.log(`${String(octaves).padStart(3)}  ${String(faces.length).padStart(5)}  ${String(verts).padStart(10)}  ${String(tris).padStart(10)}  ${ms.toFixed(0).padStart(6)}  ${mb.toFixed(1).padStart(6)}`)
}
