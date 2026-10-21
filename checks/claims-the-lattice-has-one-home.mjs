// claims-the-lattice-has-one-home.mjs — THE PARTITION'S GRID IS DEFINED ONCE (src/lib/lattice.js) AND EVERY USE IMPORTS IT.
//
// Every polygon of the ground is cut by Clipper on an integer grid; matching, welding, keying and snapping its vertices
// must use that same grid. Two literals of one grid are two grids the moment one is edited, and the seams between them
// are the partition's own gaps (Boz, 2026-10-11, the seams item: "unify the lattice FIRST").
// A COPY, in any file under src/, cartograph/ (not _archive) or checks/ other than lattice.js, is any of:
//   (1) a numeric constant at lattice.js's value that the same file grids coordinates with — `Math.round(… * NAME)`;
//   (2) a constant named …SCALE / LATTICE / QUANTUM… at lattice.js's value;
//   (3) a coordinate KEY gridded by the literal value — `Math.round(… * 1000)` beside a ',' key separator;
//   (4) ⭐ A SECOND GRID (Jacob, 2026-10-17, ONE GRID: "the kit cuts on lattice.js's 1 mm grid everywhere, the coast and the
//       land use included"): a constant at ANY OTHER value, or such a literal, rounding coordinates INTO A CLIPPER POINT —
//       `X: Math.round(… * S)` or `new IntPoint(Math.round(… * S), …)`. Not a copy of the grid but a second one, and its
//       seams against the first are the partition's gaps (HPDM, measured 2026-10-21: the 1 cm land evidence put 2,179
//       parcel corners 1–6 mm off the OSM line they meet; on the lattice, 11). Rounding an OUTPUT value to centimetres
//       (`Math.round(v * 100) / 100` for a label, a datum) is not a grid and is not judged.
// ⛔ RED WHERE TRUE, BY RULING (Boz, 2026-10-21): OPEN at landing, the unbuilt half of ONE GRID — the coast's second grid
//   (cartograph/outer-coast.mjs `const S = 100`) and the flood outline's (cartograph/bake-terrain.js `const S = 100`). Named,
//   never excused; they clear when the coast moves onto the lattice (docs/briefs/BRIEF-the-stamp-lands-on-the-lattice.md §1a).
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
  // (4) a second grid: a constant at another value, or such a literal, rounded into a Clipper point
  const intoClipper = (scale) => new RegExp(`(?:\\bX\\s*:\\s*|\\bIntPoint\\(\\s*)Math\\.round\\([^()]*\\*\\s*${scale}\\s*\\)`)
  for (const [name, d] of defs) if (!VALUES.has(d.v) && intoClipper(name.replace(/\$/g, '\\$') + '\\b').test(src))
    out.push({ line: d.line, why: `const ${name} = ${d.v} is a SECOND Clipper grid (Math.round(… * ${name}) into a point) — the kit cuts on one grid, lattice.js's` })
  lines.forEach((l, i) => { const m = l.match(/(?:\bX\s*:\s*|\bIntPoint\(\s*)Math\.round\([^()]*\*\s*(\d+(?:\.\d+)?)\s*\)/)
    if (m && !VALUES.has(Number(m[1]))) out.push({ line: i + 1, why: `a literal ${m[1]} rounds coordinates into a Clipper point: a SECOND grid` }) })
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
    ['(4) derive.js\'s old 1 cm grid (`const SCALE = 100` rounded into an IntPoint) is RED', copiesIn('const SCALE = 100\nconst P = (x, z) => new IntPoint(Math.round(x * SCALE), Math.round(z * SCALE))').length > 0],
    ['(4) a 1 cm literal rounded into a Clipper point is RED', copiesIn('const P = (x, z) => ({ X: Math.round(x * 100), Y: Math.round(z * 100) })').length > 0],
    ['(4) an OUTPUT value rounded to centimetres is not a grid (GREEN)', copiesIn('const r2 = (n) => Math.round(n * 100) / 100\nconst label = { x: r2(x) }').length === 0],
  ]
  for (const [m, ok] of rows) console.log(`  ${ok ? '✅' : '⛔'} ${m}`)
  process.exit(rows.every(r => r[1]) ? 0 : 1)
}

let bad = 0
for (const f of ['src', 'cartograph', 'checks'].flatMap(d => walk(join(ROOT, d)))) {
  const rel = relative(ROOT, f); if (rel === HOME || rel === SELF) continue
  for (const c of copiesIn(readFileSync(f, 'utf8'))) { bad++; console.log(`  ⛔ ${rel}:${c.line} — ${c.why}`) }
}
console.log(bad ? `⛔ ${bad} copy(ies) or second grid(s) outside ${HOME} — import CLIP_SCALE / LATTICE_M from it, and cut on it`
  : `✅ the partition's grid has one home, ${HOME} (CLIP_SCALE ${L.CLIP_SCALE}, LATTICE_M ${L.LATTICE_M})`)
process.exit(bad ? 1 : 0)
