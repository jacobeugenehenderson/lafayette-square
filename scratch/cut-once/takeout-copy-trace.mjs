// the take-out on the arrangement over TODAY's street decks (checks/fixtures/cut-once-ptown-street-decks-port.json): the one copy edge and the output ring round it. node scratch/cut-once/takeout-copy-trace.mjs
import fs from 'fs'
const S = await import('../../cartograph/structures.mjs'), J = await import('../../cartograph/openCloseJudge.mjs')
const fx = (n) => JSON.parse(fs.readFileSync(new URL(`../../checks/fixtures/cut-once-${n}.json`, import.meta.url), 'utf8')), coast = fx('ptown-coast'), sd = fx('ptown-street-decks-port'), water = coast.water.flatMap(b => [b.outer, ...b.holes])
const P = (r) => r.map(([x, z]) => ({ X: Math.round(x * 1000), Y: Math.round(z * 1000) }))
const w = S.waterWithoutDecks(water, coast.arcs || [], sd.rings, coast.fineM), out = J.ip(w.rings.map(P)), src = J.union(J.ip([...water.map(P), ...sd.rings.map(P)])), o = J.ownEdge(src, out)
console.log('copy', o.copy, JSON.stringify(o.copies))
const [[ax, ay], [bx, by]] = o.copies[0], near = (rs, nm) => rs.forEach((r, k) => r.forEach((p, i) => { const q = r[(i + 1) % r.length]; const m = Math.min(Math.hypot(p[0] - ax, p[1] - ay), Math.hypot(q[0] - bx, q[1] - by)); if (m < 0.01) console.log(`  ${nm} ${k} e${i} (${p.map(v => v.toFixed(3))}) → (${q.map(v => v.toFixed(3))}) ${(Math.hypot(q[0] - p[0], q[1] - p[1]) * 1000).toFixed(1)} mm`) }))
near(water, 'water'); near(sd.rings, 'deck')
w.rings.forEach((r, k) => r.forEach((p, i) => { if (Math.hypot(p[0] - 192.267, p[1] - 63.197) < 0.4) { const a = r[(i - 1 + r.length) % r.length], b = r[(i + 1) % r.length]; console.log(`  out ${k}:${i} (${p.map(v => v.toFixed(3))}) prev (${a.map(v => v.toFixed(3))}) next (${b.map(v => v.toFixed(3))}) deck ${r.deck?.[i]}`) } }))
console.log('slivers near', JSON.stringify(w.slivers.filter(s => Math.hypot(s.at[0] - 192.2, s.at[1] - 63.1) < 20)))
