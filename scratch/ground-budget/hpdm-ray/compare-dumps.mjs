// compare-dumps.mjs <dump A> <dump B> — READ-ONLY (Tern, 2026-10-14; Boz). Two deformer-input dumps (dump.sh): which shape tiles differ,
// field by field, and whether the bands as painted (curb · lawn · walk) differ. Run before reading a classify.mjs comparison: if the
// deformer's input did not move, a per-row result cannot have moved, and an "it survives" means only that.
import { readFileSync } from 'fs'
const [a, b] = process.argv.slice(2).map(d => JSON.parse(readFileSync(d + '/deform.json', 'utf8')))
const f = {}; let nul = 0
a.tiles.forEach((x, i) => { const y = b.tiles[i]; if (!x || !y) { if (x !== y) nul++; return }
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) (f[k] ??= []).push(i) })
console.log(`tiles ${a.tiles.length} vs ${b.tiles.length}${nul ? ` · ${nul} present on one side only` : ''} · fields that differ: ${Object.keys(f).length ? Object.entries(f).map(([k, v]) => `${k} on ${v.length} (${v.join(' ')})`).join(' · ') : 'none'}`)
for (const c of ['curb', 'lawn', 'walk']) console.log(`${c}: ${a.bands[c].length} vs ${b.bands[c].length} piece(s) · ${JSON.stringify(a.bands[c]) === JSON.stringify(b.bands[c]) ? 'identical' : 'DIFFER'}`)
console.log(`stencil ${JSON.stringify(a.stencil) === JSON.stringify(b.stencil) ? 'identical' : 'DIFFERS'} · limits ${JSON.stringify(a.limits) === JSON.stringify(b.limits) ? 'identical' : 'DIFFER'}`)
