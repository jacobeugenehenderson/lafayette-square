// claims-water-depth-reads-the-level.mjs — IS WATER DEPTH MEASURED FROM THE TOWN'S LEVEL, NEVER FROM y = 0?
//
// ⭐ THE RULE (cartograph/BAKE.md "every consumer reads the level"): y = 0 is the lidar's water — the tide the survey
// flew at, which no one chose. A town's water stands at its own level (`cartograph/waterLevel.mjs`), so depth is
// level − ground. ⛔ Before 2026-09-27 the water shader read depth as −terrain; at HIGH that put Provincetown's flats
// at depth 0 and read them as bare sand.
// ⚠️ HONEST LIMIT: this scans source for the SHAPES that bug took — a depth written as the negated terrain. It cannot
// prove every consumer reads the level; it stops the known shape coming back. A new consumer that samples depth any
// other way is not caught — read waterLevel.mjs.
// ⭐ MUTATION (built in): the scanner is run over a line in the old shape and must flag it.
//
//   node checks/claims-water-depth-reads-the-level.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
// The shapes: a depth from the negated terrain map (GLSL), or from a negated height on the CPU next to "depth".
const SHAPES = [
  /max\(\s*0\.0\s*,\s*-\s*texture2D\(\s*uTerrainMap/,
  /depth\w*\s*=\s*Math\.max\(\s*0\s*,\s*-\s*\w+/i,
]
const scan = (text) => text.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => !/^\s*(\/\/|\*)/.test(l) && SHAPES.some(r => r.test(l)))

// the mutation first: an instrument that cannot see the old shape proves nothing
const OLD = "         float wDepth = max(0.0, -texture2D(uTerrainMap, _terrainUV(wUV)).r);"
if (!scan(OLD).length) { console.log('⛔ MUTATION SURVIVED: the scanner does not flag the pre-level shader line — this check sees nothing'); process.exit(1) }

const files = []
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); const st = statSync(p)
  if (st.isDirectory()) { if (!/node_modules|_archive|\.git|harness/.test(n)) walk(p) } else if (/\.(m?js|jsx)$/.test(n)) files.push(p) } }
walk(join(ROOT, 'src')); walk(join(ROOT, 'cartograph'))
const hits = []
for (const f of files) for (const [ln, l] of scan(readFileSync(f, 'utf8'))) hits.push(`${relative(ROOT, f)}:${ln}  ${l.trim().slice(0, 140)}`)
console.log(`  scanned ${files.length} source files for water depth taken from y = 0`)
console.log('  ✅ mutation: the pre-level shader line is flagged')
if (hits.length) { for (const h of hits) console.log(`  ⛔ ${h}`); console.log('\n⛔ water depth is measured from y = 0 (the flight\'s tide) — read the level: cartograph/waterLevel.mjs'); process.exit(1) }
console.log('\n✅ no water depth is measured from y = 0')
