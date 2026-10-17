// make-slivers.mjs — writes bake-ground.slivers.js (never committed): at the stack entry, per group, the items (outer and
// holes as rings) whose mean width 2·area/perimeter is under 1 mm — count, m², and the first few places; written to
// SLIVER_OUT, then exits. Hook PREPENDED.
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
const here = (f) => fileURLToPath(new URL(f, import.meta.url))
const once = (s, a, b, what) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`make-slivers: ${what}: anchor found ${n}×`); return s.replace(a, b) }
let bg = readFileSync(here('./bake-ground.gate-branch.js'), 'utf8')
bg = once(bg, "  stackEntries.sort((a, b) => FLOOR_KEYS.has(b.groupKey) - FLOOR_KEYS.has(a.groupKey))\n",
  "  stackEntries.sort((a, b) => FLOOR_KEYS.has(b.groupKey) - FLOOR_KEYS.has(a.groupKey))\n  globalThis.__slivers(stackEntries)\n", 'stack')
bg = `import * as _fs_sl from 'node:fs'
globalThis.__slivers = (entries) => {
  const area = r => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1] } return a / 2 }
  const per = r => r.reduce((t, p, i) => t + Math.hypot(r[(i + 1) % r.length][0] - p[0], r[(i + 1) % r.length][1] - p[1]), 0)
  const out = {}
  for (const e of entries) { const g = out[e.groupKey] = { rings: 0, slivers: 0, m2: 0, at: [] }
    e.items.forEach((it, idx) => (Array.isArray(it) ? [it] : [it.outer, ...(it.holes || [])]).forEach((r, ri) => { if (!r || r.length < 3) return; g.rings++
      const A = Math.abs(area(r)), P = per(r), w = P ? 2 * A / P : 0
      if (w < 0.001) { g.slivers++; g.m2 += A; if (g.at.length < 6) g.at.push({ idx, ri, n: r.length, at: r[0], m2: +A.toExponential(2), wMm: +(w * 1000).toFixed(3) }) } })) }
  _fs_sl.writeFileSync(process.env.SLIVER_OUT, JSON.stringify(out)); console.log('  [slivers] written; exiting'); process.exit(0)
}
` + bg
writeFileSync(here('./bake-ground.slivers.js'), bg)
console.log('[make-slivers] bake-ground.slivers.js written')
