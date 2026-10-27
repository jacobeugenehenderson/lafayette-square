#!/usr/bin/env node
// CLAIM — EVERY READER OF THE SHORE CELLS READS THE TILE'S (`tile.inkCells`), NEVER THE MINT'S PRE-STAMP COPY.
//
// The mint absorbs ①'s ink and hands its cells to tile creation (`protopolygon.inkCells`). The tile's own cells then take the
// block's water-run vertices — the stamp's coast crossings and the joins (`tileGround.js#shareWaterRunIntoShore`, Boz's ruling, 2026-10-26), so the coast is one line
// with one vertex set. A reader of the mint's copy holds the coast with the OTHER vertex set: the alternate geometry that
// left Huron +1.5 km of asphalt/shore drawn twice. Read off the source, never restated:
//   (1) outside the producer (src/lib/tileGround.js, src/lib/absorbInk.js) and the freeze (cartograph/derive.js), no source in
//       src/ or cartograph/ names `inkCells`: a shore reader goes through buildTileGround's tiles.
//   (2) inside tileGround.js, the mint's copy (`MP.inkCells`, `frozenProto.inkCells`) is read at exactly two sites — the
//       frozen ① passed through to the mint's output, and tile creation — and every other `.inkCells` read is a tile's.
//   MUTANTS (in memory, always run): tileGround's bandByClass pointed at `MP.inkCells` must read RED in (2); a planted reader
//   file naming `protopolygon.inkCells` must read RED in (1).
//   node checks/claims-the-shore-cells-are-read-from-the-tile.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ROOT } from './_scenes.mjs'

let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }
const PRODUCER = new Set(['src/lib/tileGround.js', 'src/lib/absorbInk.js', 'cartograph/derive.js'])
const walk = (d, out = []) => { for (const n of readdirSync(d)) { const p = join(d, n)
  if (/node_modules|_archive|^data$|^\./.test(n)) continue
  const s = statSync(p); if (s.isDirectory()) walk(p, out); else if (/\.(m?js|jsx)$/.test(n)) out.push(p) } return out }
const strip = (src) => src.replace(/\/\/[^\n]*/g, '')   // comments name the field; code reads it
// sources as { rel, text }: every line naming inkCells outside the producer and the freeze
const outside = (srcs) => srcs.flatMap(({ rel, text }) => PRODUCER.has(rel) ? []
  : strip(text).split('\n').map((l, i) => /\binkCells\b/.test(l) ? `${rel}:${i + 1}` : null).filter(Boolean))
const MINT = /\b(MP|frozenProto)\s*\.\s*inkCells\b/g
const inside = (src) => { const code = strip(src), mint = [...code.matchAll(MINT)].length
  const reads = [...code.matchAll(/\b([A-Za-z_$][\w$]*)\s*\.\s*inkCells\b/g)].map(m => m[1])
  const other = reads.filter(r => r !== 'MP' && r !== 'frozenProto' && !['st', 't', 'tile'].includes(r))
  return { mint, other } }

const srcs = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'cartograph'))].map(f => ({ rel: relative(ROOT, f), text: readFileSync(f, 'utf8') }))
const o = outside(srcs)
row(!o.length, `(1) outside the producer and the freeze, ${o.length} source line(s) name inkCells${o.length ? `: ${o.join(' · ')} — read the tile's cells (buildTileGround), never the mint's copy` : ''}`)
const tg = readFileSync(join(ROOT, 'src/lib/tileGround.js'), 'utf8'), I = inside(tg)
row(I.mint === 2 && !I.other.length, `(2) inside tileGround.js, the mint's copy is read at ${I.mint} site(s) (want 2: the frozen pass-through and tile creation)${I.other.length ? ` · ${I.other.length} read(s) on a receiver that is not a tile (${[...new Set(I.other)].join(', ')})` : ''}`)
// ── mutants ──
{ const ANCHOR = 'const of = (cls) => (st.inkCells || [])'
  if (tg.split(ANCHOR).length !== 2) row(false, `mutant (2): bandByClass's read (\`${ANCHOR}\`) is not in tileGround.js once — re-aim the anchor`)
  else { const M = inside(tg.replace(ANCHOR, 'const of = (cls) => (MP.inkCells || [])'))
    row(M.mint !== 2, `mutant (2): bandByClass pointed at the mint's copy → ${M.mint} mint read(s), ${M.mint !== 2 ? 'RED as it must be' : 'not seen — (2) is blind'}`) } }
{ // a planted reader, judged in memory through the same predicate (never written to disk)
  const M = outside([...srcs, { rel: 'cartograph/__planted-reader.mjs', text: 'const shore = P.protopolygon.inkCells.filter(c => c.labels)\n' }]).length - o.length
  row(M === 1, `mutant (1): a planted reader of protopolygon.inkCells → ${M} more line(s) named, ${M === 1 ? 'RED as it must be' : 'not seen — (1) is blind'}`) }
console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ every reader of the shore cells reads the tile\'s')
process.exit(red ? 1 : 0)
