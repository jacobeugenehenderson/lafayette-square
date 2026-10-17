// make-pt3.mjs — writes tileGround.pt3.js + bake-ground.pt3.js (never committed): (a) every stamp crossing the insert
// spliced (tileGround's `insertStampCrossings`), (b) the stack's curb / asphalt / sidewalk / treelawn rings near PT3_AT
// points ("x,z;…"), (c) every unowned ped vertex's position at the deformer's tally — written to PT_OUT there, then exits.
// Hooks PREPENDED (main() runs at module level).
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
const here = (f) => fileURLToPath(new URL(f, import.meta.url))
const once = (s, a, b, what) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`make-pt3: ${what}: anchor found ${n}×`); return s.replace(a, b) }
let tg = readFileSync(here('../../../src/lib/tileGround.js'), 'utf8')
// every vertex `stampTile` added to the block contours (iA⁺ minus iA), as lattice integers
tg = once(tg, "  st2.iaFull = iaFull; st2.iA = iA; st2.evidenceByPiece = evOut\n",
  "  st2.iaFull = iaFull; st2.iA = iA; st2.evidenceByPiece = evOut\n  { const had = new Set((st.iA || []).flat().map(v => v.join(','))); globalThis.__pt3V?.(iA.flat().filter(v => !had.has(v.join(','))).map(v => [Math.round(v[0] * SCALE), Math.round(v[1] * SCALE)])) }\n", 'stampTile')
writeFileSync(here('./tileGround.pt3.js'), tg)
let bg = readFileSync(here('./bake-ground.gate-branch.js'), 'utf8')
bg = once(bg, "  stackEntries.sort((a, b) => FLOOR_KEYS.has(b.groupKey) - FLOOR_KEYS.has(a.groupKey))\n",
  "  stackEntries.sort((a, b) => FLOOR_KEYS.has(b.groupKey) - FLOOR_KEYS.has(a.groupKey))\n  globalThis.__pt3Stack?.(stackEntries)\n", 'stack')
bg = once(bg, "  if (deformTally.unowned.size) console.log(", "  globalThis.__pt3Done?.(deformTally.unowned)\n  if (deformTally.unowned.size) console.log(", 'unowned tally')
bg = `import * as _fs_pt3 from 'node:fs'
const _P3 = (process.env.PT3_AT || '').split(';').filter(Boolean).map(s => s.split(',').map(Number)), _p3 = { pts: _P3, V: [], near: {}, unowned: [] }
globalThis.__pt3V = (pts) => { for (const p of pts) _p3.V.push(p) }
globalThis.__pt3Stack = (entries) => { for (const e of entries) if (/^mat:(curb|asphalt|sidewalk|curbCut)$|^mat:treelawn:/.test(e.groupKey))
  e.items.forEach((it, idx) => { const rs = Array.isArray(it) ? [it] : [it.outer, ...(it.holes || [])]
    rs.forEach((r, ri) => { if (r && _P3.some(([x, z]) => r.some(v => Math.hypot(v[0] - x, v[1] - z) < 15))) (_p3.near[e.groupKey] ||= []).push({ idx, ri, r }) }) }) }
globalThis.__pt3Done = (u) => { _p3.unowned = [...u.entries()].map(([k, tile]) => { const [x, z] = k.split(',').map(Number); return { x, z, tile } })
  _fs_pt3.writeFileSync(process.env.PT_OUT, JSON.stringify(_p3)); console.log('  [pt3] ' + _p3.V.length + ' stamp crossings · ' + _p3.unowned.length + ' unowned — written; exiting'); process.exit(0) }
` + bg
writeFileSync(here('./bake-ground.pt3.js'), bg)
console.log('[make-pt3] tileGround.pt3.js + bake-ground.pt3.js written')
