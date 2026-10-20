// cap-arc-keys.mjs — per town, read-only, off public/baked/<town>/shape.json (and a --shape=<file> override): for every
// dead-end CAP on a tile contour (iaCap), the eased arcs on and flanking its edges (iaArc), and where each arc's corner KEY
// (iaArcKey, "x,z|legA|legB") names its node. A key's node is `protoCornerOf`'s: the shared pair node for two chains, else
// the leaving leg's own skeleton vertex (`points[o2.srcIdx]`) — so on a cap shoulder it is where that leg's last span
// STARTS. Counted: arcs whose key node sits farther than one cap-width (the cap edges' own extent) from the cap.
// (Boz, 2026-10-18, after HPDM's refused walk at Beacon Way's and Rosedale's caps sat at a seam with an arc keyed 53–58 m off.)
//   node scratch/footprint-census/cap-arc-keys.mjs [town …] [--shape=<shape.json>]
import { readFileSync, existsSync, readdirSync } from 'fs'
const shapeArg = process.argv.find(a => a.startsWith('--shape='))?.slice(8)
const towns = process.argv.slice(2).filter(a => !a.startsWith('--'))
const list = shapeArg ? [[shapeArg, shapeArg]] : (towns.length ? towns : readdirSync('public/baked')).map(t => [t, `public/baked/${t}/shape.json`]).filter(([, p]) => existsSync(p))
const P = (q) => Array.isArray(q) ? q : [q.x, q.z]
for (const [town, path] of list) {
  const sh = JSON.parse(readFileSync(path, 'utf8'))
  // ⛔ an artifact poured before caps (iaCap) or corner keys (iaArcKey) were frozen cannot answer — say so, never print 0
  const miss = ['iaCap', 'iaArcKey', 'iaArc', 'iaFull'].filter(k => !sh.tiles.some(t => t[k] != null))
  if (miss.length) { console.log(`CK ${town}: ⛔ cannot be read — its shape.json carries no ${miss.join(' / ')} (an older pour); re-pour it, or pass a scratch slab's --shape=`); continue }
  let caps = 0, arcs = 0, far = 0, farSame = 0, noKey = 0; const ex = []
  sh.tiles.forEach((t, ti) => (t.iaFull || []).forEach((r0, ri) => { const r = r0.map(P), n = r.length, cap = t.iaCap?.[ri] || [], arc = t.iaArc?.[ri] || [], keys = (Array.isArray(t.iaArcKey) ? t.iaArcKey[ri] : t.iaArcKey) || {}
    const byCap = new Map(); for (let j = 0; j < n; j++) if (cap[j] != null) (byCap.get(cap[j]) || byCap.set(cap[j], []).get(cap[j])).push(j)
    for (const [c, edges] of byCap) { caps++
      const vs = edges.flatMap(j => [r[j], r[(j + 1) % n]]); let w = 0; for (const a of vs) for (const b of vs) w = Math.max(w, Math.hypot(a[0] - b[0], a[1] - b[1]))
      const lo = Math.min(...edges), hi = Math.max(...edges), ids = new Set()
      for (const j of [...edges, (lo - 1 + n) % n, (hi + 1) % n]) if (arc[j] != null) ids.add(arc[j])
      for (const u of ids) { arcs++; const k = keys[u]; if (!k) { noKey++; continue }
        const [x, z] = k.split('|')[0].split(',').map(Number), parts = k.split('|'), d = Math.min(...vs.map(v => Math.hypot(v[0] - x, v[1] - z)))
        if (d > w) { far++; const sameSkel = parts[1]?.split(':')[0] === parts[2]?.split(':')[0]; if (sameSkel) farSame++
          if (ex.length < 6) ex.push(`tile ${ti} cap ${c} (${JSON.stringify(t.caps?.[c])}) arc ${u}: key "${k}" ${d.toFixed(1)} m off, cap ${w.toFixed(1)} m wide`) } } } }))
  console.log(`CK ${town}: ${caps} cap(s) on tile contours · ${arcs} arc(s) on or flanking them · key node farther than one cap-width from its cap ${far} (${farSame} keyed to one chain, a bend form) · no key ${noKey}`)
  for (const e of ex) console.log(`CK     ${e}`)
}
