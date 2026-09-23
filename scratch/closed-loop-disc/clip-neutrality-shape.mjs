// Read-only (Keel, 2026-09-23): {outer, holes} branch, HEAD vs working tree, on every baked shape.json
// tile ring, plus each tile ring holed by its own iA (a real annulus, the shape the branch exists for).
import fs from 'fs'
import { loadSceneStencil } from '../../cartograph/sceneStencil.js'
import { clipAllToStencil as HEAD } from './ribbonsGeometry.PRE-FIX.mjs'
import { clipAllToStencil as LIVE } from '../../src/lib/ribbonsGeometry.js'
let bad = 0
for (const town of process.argv.slice(2)) {
  const sP = `public/baked/${town}/shape.json`, tiles = JSON.parse(fs.readFileSync(sP)).tiles
  const st = loadSceneStencil(process.cwd(), town)
  const items = []
  for (const t of tiles) { if (t.ring?.length >= 3) { items.push({ outer: t.ring, holes: [] }); if (t.iA?.length >= 3) items.push({ outer: t.ring, holes: [t.iA] }) } }
  const a = new Map([['x', items]]), b = new Map([['x', items]])
  HEAD(a, new Map(), st.clipPolygon); LIVE(b, new Map(), st.clipPolygon)
  const same = JSON.stringify(a.get('x')) === JSON.stringify(b.get('x')); if (!same) bad++
  console.log(`${town}  # ${sP} ${fs.statSync(sP).mtime.toISOString()}  ${items.length} items → ${a.get('x').length} out · ${same ? 'byte-identical' : '⛔ DIFFERENT'}`)
}
process.exit(bad ? 1 : 0)
