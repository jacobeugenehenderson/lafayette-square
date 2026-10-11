// claims-the-lattice-has-one-home.mjs — THE PARTITION'S GRID IS DEFINED ONCE (src/lib/lattice.js) AND EVERY USE IMPORTS IT.
//
// Every polygon of the ground is cut by Clipper on an integer grid; matching, welding, keying and snapping its vertices
// must use that same grid. Two literals of one grid are two grids the moment one is edited, and the seams between them
// are the partition's own gaps (Boz, 2026-10-11, the seams item: "unify the lattice FIRST").
// A COPY, in any file under src/, cartograph/ (not _archive) or checks/ other than lattice.js, is any of:
//   (1) a numeric constant at lattice.js's value that the same file grids coordinates with — `Math.round(… * NAME)`;
//   (2) a constant named …SCALE / LATTICE / QUANTUM… at lattice.js's value;
//   (3) a coordinate KEY gridded by the literal value — `Math.round(… * 1000)` beside a ',' key separator.
// ⚠️ A grid at ANOTHER value (derive's 1 cm, the coast's 1 cm, extractFaces' 0.1 mm) is its own grid, not a copy: it is
//   not this check's question (lattice.js names them, OPEN).
// It READS lattice.js for the values, never restates them.
// ⭐ MUTATION TEST: `--selftest` — tileGround.js with its old `const SCALE = 1000` put back (in memory) → RED; a literal
//   coordinate key → RED; a lattice-named literal → RED; tileGround.js as it is → GREEN.
//   node checks/claims-the-lattice-has-one-home.mjs [--selftest]
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ROOT } from './_scenes.mjs'
import * as L from '../src/lib/lattice.js'

const HOME = 'src/lib/lattice.js', SELF = 'checks/claims-the-lattice-has-one-home.mjs'
const VALUES = new Set(Object.values(L).filter(v => typeof v === 'number'))
const num = (s) => { const v = Number(s); return Number.isFinite(v) ? v : null }

/** the copies in one file's source: [{ line, why }] */
export function copiesIn(src) {
  const out = [], lines = src.split('\n')
  const defs = new Map()
  lines.forEach((l, i) => { const m = l.match(/^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*([-+]?[\d.]+(?:e[-+]?\d+)?)\s*(?:[;/,]|$)/)
    if (m && num(m[2]) != null) defs.set(m[1], { line: i + 1, v: num(m[2]) }) })
  for (const [name, d] of defs) {
    const grids = new RegExp(`Math\\.round\\([^()]*[*/]\\s*${name.replace(/\$/g, '\\$')}\\b`).test(src)
    if (!VALUES.has(d.v)) continue
    if (grids) out.push({ line: d.line, why: `const ${name} = ${d.v} grids coordinates at the partition's own value (Math.round(… ${name}))` })
    else if (/SCALE|LATTICE|QUANTUM/.test(name)) out.push({ line: d.line, why: `const ${name} = ${d.v} restates lattice.js` })
  }
  const lit = String(L.CLIP_SCALE)
  lines.forEach((l, i) => { if (new RegExp(`Math\\.round\\([^()]*\\*\\s*${lit}\\)\\s*(?:\\}\\s*,|\\+\\s*',')`).test(l) || new RegExp(`,\\$\\{Math\\.round\\([^()]*\\*\\s*${lit}\\)\\}`).test(l))
    out.push({ line: i + 1, why: 'a coordinate key gridded by a literal' }) })
  return out
}

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) { const p = join(dir, e), st = statSync(p)
    if (st.isDirectory()) { if (!/^(node_modules|_archive|data|\.)/.test(e)) walk(p, acc) }
    else if (/\.(m?js|jsx)$/.test(e)) acc.push(p) }
  return acc
}

if (process.argv.includes('--selftest')) {
  const tg = readFileSync(join(ROOT, 'src/lib/tileGround.js'), 'utf8')
  const rows = [
    ['tileGround.js as it is is GREEN', copiesIn(tg).length === 0],
    ['tileGround.js with its old `const SCALE = 1000` put back is RED', copiesIn(tg.replace(/^import \{ CLIP_SCALE as SCALE \} from '\.\/lattice\.js'$/m, 'const SCALE = 1000')).length > 0],
    ['a coordinate key gridded by a literal is RED', copiesIn('const k = `${Math.round(x * 1000)},${Math.round(z * 1000)}`').length > 0],
    ['a lattice-named literal (const LATTICE = 0.001) is RED', copiesIn('const LATTICE = 0.001   // a grid').length > 0],
  ]
  for (const [m, ok] of rows) console.log(`  ${ok ? '✅' : '⛔'} ${m}`)
  process.exit(rows.every(r => r[1]) ? 0 : 1)
}

let bad = 0
for (const f of ['src', 'cartograph', 'checks'].flatMap(d => walk(join(ROOT, d)))) {
  const rel = relative(ROOT, f); if (rel === HOME || rel === SELF) continue
  for (const c of copiesIn(readFileSync(f, 'utf8'))) { bad++; console.log(`  ⛔ ${rel}:${c.line} — ${c.why}`) }
}
console.log(bad ? `⛔ ${bad} copy(ies) of the partition's grid outside ${HOME} — import CLIP_SCALE / LATTICE_M from it`
  : `✅ the partition's grid has one home, ${HOME} (CLIP_SCALE ${L.CLIP_SCALE}, LATTICE_M ${L.LATTICE_M})`)
process.exit(bad ? 1 : 0)
