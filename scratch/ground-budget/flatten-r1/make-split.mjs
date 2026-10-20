// make-split.mjs — writes tileGround.split.js + bake-ground.split.js (never committed): the curb near SPLIT_AT points
// ("x,z;…") at PRE (per-tile pieces, before the cross-tile union) · UNION (`unionRings(acc.C)`) · CLIP (the stencil) ·
// STACK (its stack entry) · LR (the flatten's `layerRegion`) · FLAT (the flatten's emitted curb) — written to SPLIT_OUT
// after the curb's flatten step, where it exits. Hooks PREPENDED (main() runs at module level).
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
const here = (f) => fileURLToPath(new URL(f, import.meta.url))
const once = (s, a, b, what) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`make-split: ${what}: anchor found ${n}×`); return s.replace(a, b) }
let tg = readFileSync(here('../../../src/lib/tileGround.js'), 'utf8')
tg = once(tg, "      curb:     clip(unionRings(acc.C)),", "      curb:     (() => { const u = unionRings(acc.C), c = clip(u); globalThis.__split?.({ PRE: acc.C, UNION: u, CLIP: c }); return c })(),", 'finish curb')
writeFileSync(here('./tileGround.split.js'), tg)
let bg = readFileSync(here('./bake-ground.gate-branch.js'), 'utf8')
bg = once(bg, "  stackEntries.sort((a, b) => FLOOR_KEYS.has(b.groupKey) - FLOOR_KEYS.has(a.groupKey))\n",
  "  stackEntries.sort((a, b) => FLOOR_KEYS.has(b.groupKey) - FLOOR_KEYS.has(a.groupKey))\n  globalThis.__split?.({ STACK: stackEntries.find(e => e.groupKey === 'mat:curb')?.items.flatMap(it => Array.isArray(it) ? [it] : [it.outer, ...(it.holes || [])]) || [] })\n", 'stack entry')
bg = once(bg, "    const mine = layerRegion(e)\n", "    const mine = layerRegion(e)\n    if (e.groupKey === 'mat:curb') globalThis.__split?.({ LR: mine.map(q => q.map(p => [p.X / CLIP_SCALE, p.Y / CLIP_SCALE])) })\n", 'layerRegion')
bg = once(bg, "      out.set(e.groupKey, visible)\n", "      out.set(e.groupKey, visible)\n      if (e.groupKey === 'mat:curb') { globalThis.__split?.({ FLAT: visible.flatMap(it => [it.outer, ...(it.holes || [])]) }); globalThis.__splitDone?.() }\n", 'flatten curb out')
bg = `import * as _fs_split from 'node:fs'
const _SP = (process.env.SPLIT_AT || '').split(';').filter(Boolean).map(s => s.split(',').map(Number)), _spOut = { pts: _SP, stages: {} }
const _spNear = (r) => r && r.length >= 3 && _SP.some(([x, z]) => r.some(v => Math.hypot(v[0] - x, v[1] - z) < 30))
globalThis.__split = (o) => { for (const [k, rings] of Object.entries(o)) _spOut.stages[k] = (rings || []).filter(_spNear) }
globalThis.__splitDone = () => { _fs_split.writeFileSync(process.env.SPLIT_OUT, JSON.stringify(_spOut)); console.log('  [split] ' + Object.entries(_spOut.stages).map(([k, v]) => k + ' ' + v.length).join(' · ') + ' — written; exiting'); process.exit(0) }
` + bg
writeFileSync(here('./bake-ground.split.js'), bg)
console.log('[make-split] tileGround.split.js + bake-ground.split.js written')
