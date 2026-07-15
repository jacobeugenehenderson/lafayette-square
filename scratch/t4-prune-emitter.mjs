/**
 * t4-prune-emitter — [T4 2026-07-15] throwaway
 *
 * Removes top-level `function X` / `const X =` declarations in a module that
 * nothing references — neither the module itself nor any known importer —
 * iterating to a fixpoint. Used once to clear the figure-ground band emitters
 * orphaned by deleting the geometry half of buildBlockGeometryV2.
 *
 * The gate is scratch/t4-fe-parity.mjs, not this script: run parity after.
 * usage: node scratch/t4-prune-emitter.mjs <file> [--apply]
 */
import { readFileSync, writeFileSync } from 'fs'

const FILE = process.argv[2]
const APPLY = process.argv.includes('--apply')

// Every file that imports from the target module. A name referenced here is
// live no matter what the module itself does.
const IMPORTERS = [
  'src/lib/tileGround.js', 'src/lib/buildPathRibbons.js',
  'src/cartograph/SurveyorOverlay.jsx', 'src/cartograph/MeasureOverlay.jsx',
  'src/cartograph/BlockGeometryV2Debug.jsx', 'cartograph/bake-ground.js',
  'cartograph/bake-scene.js', 'cartograph/pipeline.js',
]
const read = f => { try { return readFileSync(f, 'utf8') } catch { return '' } }
const ext = IMPORTERS.map(read).join('\n')

const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n')

function declRange(lines, start) {
  let depth = 0, inStr = null, seen = false
  for (let i = start; i < lines.length; i++) {
    const l = lines[i]
    for (let j = 0; j < l.length; j++) {
      const c = l[j], prev = l[j - 1]
      if (inStr) { if (c === inStr && prev !== '\\') inStr = null; continue }
      if (c === "'" || c === '"' || c === '`') { inStr = c; continue }
      if (c === '/' && l[j + 1] === '/') break
      if ('([{'.includes(c)) { depth++; seen = true }
      else if (')]}'.includes(c)) depth--
    }
    if (seen && depth <= 0) return [start, i]
    if (!seen && /;\s*$/.test(l)) return [start, i]        // one-line const
    if (!seen && i > start) return [start, i - 1]
  }
  throw new Error('unbalanced from ' + (start + 1))
}

let src = readFileSync(FILE, 'utf8')
const removed = []
for (let round = 1; round <= 12; round++) {
  const lines = src.split('\n')
  const code = strip(src)
  const decls = []
  lines.forEach((l, i) => {
    const m = l.match(/^(?:export )?(?:function|const) (\w+)\s*[(=]/)
    if (m) decls.push({ name: m[1], line: i })
  })
  const dead = decls.filter(d => {
    const inside = (code.match(new RegExp('\\b' + d.name + '\\b', 'g')) || []).length
    const outside = (ext.match(new RegExp('\\b' + d.name + '\\b', 'g')) || []).length
    return inside <= 1 && outside === 0
  })
  if (!dead.length) { console.log(`fixpoint after ${round - 1} round(s)`); break }
  const ranges = dead.map(d => ({ ...d, r: declRange(lines, d.line) }))
    .sort((a, b) => b.r[0] - a.r[0])
  for (const { name, r } of ranges) {
    removed.push({ name, lines: r[1] - r[0] + 1 })
    lines.splice(r[0], r[1] - r[0] + 1)
  }
  src = lines.join('\n')
  console.log(`round ${round}: -${dead.length} — ${dead.map(d => d.name).join(', ')}`)
}
console.log(`\n${removed.length} declarations, ${removed.reduce((a, b) => a + b.lines, 0)} lines`)
if (APPLY) { writeFileSync(FILE, src); console.log('APPLIED') } else console.log('(dry run)')
