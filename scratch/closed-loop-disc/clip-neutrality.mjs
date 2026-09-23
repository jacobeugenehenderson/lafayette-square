// Read-only (Keel, 2026-09-23). Gate (2): run the bake's real overlay rings through clipAllToStencil at
// HEAD and at the working tree; every item whose HEAD output has NO hole must come out byte-identical.
import fs from 'fs'
import { loadSceneStencil } from '../../cartograph/sceneStencil.js'
import { clipAllToStencil as HEAD } from './ribbonsGeometry.PRE-FIX.mjs'
import { clipAllToStencil as LIVE } from '../../src/lib/ribbonsGeometry.js'
import { overlayRings } from './_overlays.mjs'
import clipperLib from 'clipper-lib'
const area = r => { let s = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; s += p[0] * q[1] - q[0] * p[1] } return s / 2 }
const norm = x => Array.isArray(x) ? { outer: x, holes: [] } : x
let bad = 0
for (const town of process.argv.slice(2)) {
  const mP = `cartograph/data/${town}/clean/map.json`; console.log(`== ${town}  # ${mP} ${fs.statSync(mP).mtime.toISOString()}`)
  const map = JSON.parse(fs.readFileSync(mP)), st = loadSceneStencil(process.cwd(), town)
  if (!st.clipPolygon) { console.log('  no stencil'); continue }
  const src = overlayRings(map)
  for (const [mat, rings] of src) {
    let same = 0, diff = 0, holed = 0, dA = 0
    for (const ring of rings) {
      const a = new Map([[mat, [ring]]]), b = new Map([[mat, [ring]]])
      HEAD(a, new Map(), st.clipPolygon); LIVE(b, new Map(), st.clipPolygon)
      const ha = a.get(mat), hb = b.get(mat)
      // HEAD's flat list: a path wound opposite to the input's outer is a lost hole
      const hasHole = ha.length > 1 && new Set(ha.map(r => area(r) > 0)).size > 1
      if (hasHole) { holed++; const tb = hb.map(norm).reduce((s, p) => s + Math.abs(area(p.outer)) - p.holes.reduce((t, h) => t + Math.abs(area(h)), 0), 0); dA += tb; continue }
      if (JSON.stringify(ha) === JSON.stringify(hb)) same++; else { diff++; if (diff <= 3) console.log(`   DIFF ${mat}`, JSON.stringify(ha).slice(0, 160), '\n        ', JSON.stringify(hb).slice(0, 160)) }
    }
    bad += diff
    console.log(`  ${mat.padEnd(16)} items ${String(rings.length).padStart(5)} · no-hole byte-identical ${same} · DIFFERENT ${diff} · had a hole (changed on purpose) ${holed}${holed ? ` → now ${dA.toFixed(1)} m² net` : ''}`)
  }
}
console.log(bad ? `\n⛔ ${bad} no-hole item(s) changed` : '\n✓ every no-hole item byte-identical')
process.exit(bad ? 1 : 0)
