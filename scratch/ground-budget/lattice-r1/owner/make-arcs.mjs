// make-arcs.mjs <ucap copy> <out .js> — for the blocks in ARC_BLOCKS (JSON [k,…]): every ease arc the outer offset made, with
// the ① vertex it was eased at (src), its apex V, r and R, and the ② vertices that name a ① vertex near it.
import { readFileSync, writeFileSync } from 'node:fs'
const [src, out] = process.argv.slice(2)
let s = readFileSync(src, 'utf8')
const a = "        // ⭐ per-vertex ① OWNER for each offset ring"
if (s.split(a).length !== 2) throw new Error('anchor')
s = s.replace(a, "        if (JSON.parse(process.env.ARC_BLOCKS || '[]').includes(k)) (globalThis.__arcs ||= []).push({ block: k, arcs: (st.easeArcs || []).map(e => ({ src: e.src, V: e.V, r: e.r, R: e.R, srcAt: ring[e.src] })), labels: st.labels, rings: rings2.map(r => r.length) })\n" + a)
s = s.replace("offNull: globalThis.__offNull || []", "offNull: globalThis.__offNull || [], arcs: globalThis.__arcs || []")
writeFileSync(out, s); console.log('arc copy written:', out)
