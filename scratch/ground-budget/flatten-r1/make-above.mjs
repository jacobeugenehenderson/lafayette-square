// make-above.mjs — writes bake-ground.above.js (never committed): at the stack entry, for the layers the flatten paints ABOVE
// asphalt (the entries before mat:asphalt, top-down), every item edge passing within 0.5 m of ABOVE_AT points; written to
// ABOVE_OUT, then exits. Hook PREPENDED.
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
const here = (f) => fileURLToPath(new URL(f, import.meta.url))
const once = (s, a, b, what) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`make-above: ${what}: anchor found ${n}×`); return s.replace(a, b) }
let bg = readFileSync(here('./bake-ground.gate-branch.js'), 'utf8')
bg = once(bg, "  stackEntries.sort((a, b) => FLOOR_KEYS.has(b.groupKey) - FLOOR_KEYS.has(a.groupKey))\n",
  "  stackEntries.sort((a, b) => FLOOR_KEYS.has(b.groupKey) - FLOOR_KEYS.has(a.groupKey))\n  globalThis.__above(stackEntries)\n", 'stack')
bg = `import * as _fs_above from 'node:fs'
globalThis.__above = (entries) => {
  const pts = (process.env.ABOVE_AT || '').split(';').filter(Boolean).map(t => t.split(',').map(Number)), ai = entries.findIndex(e => e.groupKey === (process.env.ABOVE_GROUP || 'mat:asphalt'))
  const sd = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
  const out = { asphaltIndex: ai, order: entries.map(e => e.groupKey), hits: [] }
  entries.forEach((e, k) => { if (k < ai + (process.env.ABOVE_SELF ? 0 : 1)) return
    e.items.forEach((it, idx) => (Array.isArray(it) ? [it] : [it.outer, ...(it.holes || [])]).forEach((r, ri) => { if (!r) return
      for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]
        for (const P of pts) { const d = sd(P, a, b); if (d < 0.5) out.hits.push({ group: e.groupKey, idx, ri, edge: i, a, b, P, d: +d.toFixed(4) }) } } })) })
  _fs_above.writeFileSync(process.env.ABOVE_OUT, JSON.stringify(out)); console.log('  [above] ' + out.hits.length + ' edge hit(s) — written; exiting'); process.exit(0)
}
` + bg
writeFileSync(here('./bake-ground.above.js'), bg)
console.log('[make-above] bake-ground.above.js written')
