// Read-only (Keel, 2026-09-23): the {outer, holes} branch of clipAllToStencil must be byte-identical
// HEAD vs working tree. Subjects: every ① block of the town (with its holes) as a byMaterial item.
import fs from 'fs'
import { loadSceneStencil } from '../../cartograph/sceneStencil.js'
import { clipAllToStencil as HEAD } from './ribbonsGeometry.PRE-FIX.mjs'
import { clipAllToStencil as LIVE } from '../../src/lib/ribbonsGeometry.js'
let bad = 0
for (const town of process.argv.slice(2)) {
  const rP = `cartograph/data/${town}/clean/ribbons.json`, pr = JSON.parse(fs.readFileSync(rP)).protopolygon
  const st = loadSceneStencil(process.cwd(), town)
  const items = pr.blocks.map((b, i) => ({ outer: b, holes: pr.blockHoles[i] || [] }))
  const a = new Map([['x', items]]), b = new Map([['x', items]])
  HEAD(a, new Map(), st.clipPolygon); LIVE(b, new Map(), st.clipPolygon)
  const same = JSON.stringify(a.get('x')) === JSON.stringify(b.get('x')); if (!same) bad++
  console.log(`${town}  # ${rP} ${fs.statSync(rP).mtime.toISOString()}  ${items.length} {outer,holes} items (${items.filter(i => i.holes.length).length} holed) → ${a.get('x').length} out · ${same ? 'byte-identical' : '⛔ DIFFERENT'}`)
}
process.exit(bad ? 1 : 0)
