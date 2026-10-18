// arc-key-collisions.mjs — "ONE CORNER, ONE KEY" (tileGround.js, the ② corner-truth block): does any corner key
// (iaArcKey, `protoCornerOf`) address MORE THAN ONE eased arc? Read-only, off a shape.json (served or a scratch slab).
// Split by the key's form: same-chain (a bend or cap shoulder — named at points[o2.srcIdx]) vs two-chain (the pair node).
//   node scratch/footprint-census/arc-key-collisions.mjs <shape.json> [--show=n]
import { readFileSync } from 'fs'
const path = process.argv[2], SHOW = +(process.argv.find(a => a.startsWith('--show='))?.slice(7) || 8)
const sh = JSON.parse(readFileSync(path, 'utf8'))
if (!sh.tiles.some(t => t.iaArcKey)) { console.log(`⛔ ${path}: no iaArcKey — poured before corners were keyed; cannot be read`); process.exit(2) }
// each arc's place: its edges on the contour (iaArc), so two arcs under one key are told apart — ONE corner the ease split
// into adjacent arcs (their edge runs touch, or lie within one arc's own extent) vs DISTINCT corners
const PT = (q) => Array.isArray(q) ? q : [q.x, q.z]
const place = new Map()
sh.tiles.forEach((t, ti) => (t.iaFull || []).forEach((r0, ri) => { const r = r0.map(PT), a = t.iaArc?.[ri] || []
  r.forEach((v, j) => { const u = a[j]; if (u == null) return; const id = `${ti}|${ri}|${u}`, pl = place.get(id) || place.set(id, { pts: [], edges: [] }).get(id); pl.pts.push(v, r[(j + 1) % r.length]); pl.edges.push(j) }) }))
const ext = (pl) => { let w = 0; for (const a of pl.pts) for (const b of pl.pts) w = Math.max(w, Math.hypot(a[0] - b[0], a[1] - b[1])); return w }
const gap = (A, B) => { let d = Infinity; for (const a of A.pts) for (const b of B.pts) d = Math.min(d, Math.hypot(a[0] - b[0], a[1] - b[1])); return d }
// ⛔ a tile carrying the IDENTICAL contour (iaFull) of an earlier tile repeats that tile's arcs and keys — counted on its own
// line (a different question: whose contour is it?), and its arcs are left out of the collision count
const firstOf = new Map(), dupOf = new Map()
sh.tiles.forEach((t, ti) => { const k = JSON.stringify(t.iaFull || null); if (t.iaFull && firstOf.has(k)) dupOf.set(ti, firstOf.get(k)); else firstOf.set(k, ti) })
const by = new Map()
sh.tiles.forEach((t, ti) => dupOf.has(ti) ? null : (Array.isArray(t.iaArcKey) ? t.iaArcKey : [t.iaArcKey]).forEach((m, ri) => { for (const [u, k] of Object.entries(m || {})) (by.get(k) || by.set(k, []).get(k)).push({ id: `${ti}|${ri}|${u}`, label: `tile ${ti} ring ${ri} arc ${u}` }) }))
// a collision is DISTINCT when some two of its arcs lie farther apart than the larger arc's own extent (or on different tiles/rings)
const distinct = (v) => v.some((A, i) => v.some((B, j) => j > i && (() => { const pa = place.get(A.id), pb = place.get(B.id); if (!pa || !pb) return true
  return A.id.split('|').slice(0, 2).join() !== B.id.split('|').slice(0, 2).join() || gap(pa, pb) > Math.max(ext(pa), ext(pb)) })()))
const same = (k) => { const p = k.split('|'); return p[1]?.split(':')[0] === p[2]?.split(':')[0] }
const coll = [...by].filter(([, v]) => v.length > 1 && distinct(v)), split = [...by].filter(([, v]) => v.length > 1 && !distinct(v))
const n = (f) => [...by.keys()].filter(f).length, c = (f) => coll.filter(([k]) => f(k))
console.log(`${path}: tiles repeating an earlier tile's whole contour ${dupOf.size}${dupOf.size ? ` (${[...dupOf].map(([a, b]) => `${a}=${b}`).join(', ')}; their own rings: ${[...dupOf].map(([a, b]) => `${sh.tiles[b].ring?.length}/${sh.tiles[a].ring?.length} pts`).join(', ')})` : ''}\n   ${by.size} key(s) · same-chain ${n(same)}, two-chain ${n(k => !same(k))} · one corner split into adjacent arcs under its key ${split.length} (not a collision) · keys addressing DISTINCT corners: ${coll.length} — same-chain ${c(same).length} (${c(same).reduce((t, [, v]) => t + v.length, 0)} arcs), two-chain ${c(k => !same(k)).length} (${c(k => !same(k)).reduce((t, [, v]) => t + v.length, 0)} arcs)`)
for (const [k, v] of coll.slice(0, SHOW)) console.log(`   ${same(k) ? 'same-chain' : 'two-chain '} "${k}" → ${v.map(x => x.label).join(' · ')}`)
