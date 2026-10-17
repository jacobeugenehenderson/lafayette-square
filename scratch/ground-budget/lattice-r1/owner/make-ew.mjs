// make-ew.mjs <ucap copy> <out .js> — watches named ① corners through the ease: before each block's outer offset, the watch
// list (block → ① vertex, EW env JSON); in easeContour, each ② vertex that names a watched ① vertex records isCorner, R,
// turn and its two legs; after the call, whether the ease made an arc whose source is that vertex (st.easeArcs).
import { readFileSync, writeFileSync } from 'node:fs'
const [src, out] = process.argv.slice(2)
let s = readFileSync(src, 'utf8')
const one = (a, b) => { if (s.split(a).length !== 2) throw new Error('anchor not found exactly once: ' + a.slice(0, 60)); s = s.replace(a, b) }
one("    const R = R_[i]\n    if (!isCorner_[i]) {", "    const R = R_[i]\n    if (globalThis.__ew?.vs?.includes(vtx?.[i])) globalThis.__ew.hits.push({ v: vtx[i], i, isCorner: isCorner_[i], R, turnDeg: +(turnAt_[i] * 180 / Math.PI).toFixed(2), legBack: legBack[i], legFwd: legFwd[i] })\n    if (!isCorner_[i]) {")
one("        const rings2 = offsetRingByRects(WC.ring,", "        const _W = JSON.parse(process.env.EW || '{}')[k]; globalThis.__ew = _W ? { vs: _W, hits: [] } : null\n        const rings2 = offsetRingByRects(WC.ring,")
one("        // ⭐ per-vertex ① OWNER for each offset ring", "        if (globalThis.__ew) { for (const v of globalThis.__ew.vs) (globalThis.__ewOut ||= []).push({ block: k, v, arcs: (st.easeArcs || []).filter(a => a.src === v).map(a => ({ r: a.r, R: a.R })), hits: globalThis.__ew.hits.filter(h => h.v === v) }); globalThis.__ew = null }\n        // ⭐ per-vertex ① OWNER for each offset ring")
s = s.replace(/offNull: globalThis.__offNull \|\| \[\]/, "offNull: globalThis.__offNull || [], ew: globalThis.__ewOut || []")
writeFileSync(out, s); console.log('ease-watch copy written:', out)
