// make-pt2.mjs — writes bake-ground.pt2.js (never committed): every partition group's items whose OUTER ring's box holds
// PT_AT, as conform will receive them (after the ease split), written whole to PT_OUT, and the class town-wide (every
// item's hole-on-outer / hole-on-hole / repeated vertices, per group); exits there — no conform.
// The hook block is PREPENDED (the bake's main() runs at module level; a const below it is not yet initialised).
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
const here = (f) => fileURLToPath(new URL(f, import.meta.url))
const once = (s, a, b, what) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`make-pt2: ${what}: anchor found ${n}×`); return s.replace(a, b) }
let bg = readFileSync(here('./bake-ground.gate-branch.js'), 'utf8')
bg = once(bg, "    console.log(`  [deform] the line swept across the bands:", "    _pt2(flattened)\n    console.log(`  [deform] the line swept across the bands:", 'ease split')
bg = `import * as _fs_pt2 from 'node:fs'
const _P2 = (process.env.PT_AT || '').split(',').map(Number)
function _pt2(flattened) {
  const out = { at: _P2, groups: {} }
  for (const [k, items] of flattened) (items || []).forEach((it, idx) => {
    const o = Array.isArray(it) ? it : it?.outer; if (!o || o.length < 3) return
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of o) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z }
    if (_P2[0] < x0 || _P2[0] > x1 || _P2[1] < z0 || _P2[1] > z1) return
    ;(out.groups[k] ||= []).push({ idx, outer: o, holes: Array.isArray(it) ? [] : (it.holes || []) }) })
  // THE CLASS, town-wide: every item conform will triangulate — a hole vertex ON its outer, a vertex shared by two of its
  // holes, a repeated vertex in one ring (each on the lattice: CLIP_SCALE), counted per group, with up to 20 places each
  const key = (p) => Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000)
  out.validity = {}
  for (const [k, items] of flattened) { const v = { items: 0, onOuter: 0, holeHole: 0, repeated: 0, at: [] }
    for (const it of items || []) { const o = Array.isArray(it) ? it : it?.outer, hs = Array.isArray(it) ? [] : (it?.holes || []); if (!o || o.length < 3) continue; v.items++
      const ok = new Set(o.map(key)), seen = new Map()
      hs.forEach((h, hi) => h.forEach(p => { const q = key(p); if (ok.has(q)) { v.onOuter++; if (v.at.length < 20) v.at.push(['hole-on-outer', p]) }
        if (seen.has(q) && seen.get(q) !== hi) { v.holeHole++; if (v.at.length < 20) v.at.push(['hole-on-hole', p]) } seen.set(q, hi) }))
      for (const r of [o, ...hs]) { const s = new Set(); for (const p of r) { const q = key(p); if (s.has(q)) { v.repeated++; if (v.at.length < 20) v.at.push(['repeated', p]) } s.add(q) } } }
    if (v.onOuter || v.holeHole || v.repeated) out.validity[k] = v }
  _fs_pt2.writeFileSync(process.env.PT_OUT, JSON.stringify(out)); console.log('  [pt2] ' + Object.entries(out.groups).map(([k, v]) => k + '×' + v.length).join(' · ') + ' — written; exiting'); process.exit(0)
}
` + bg
writeFileSync(here('./bake-ground.pt2.js'), bg)
console.log('[make-pt2] bake-ground.pt2.js written')
