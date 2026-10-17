// make-near.mjs <bake-ground src> <out> [stop-after-group] — probe copy. (1) NEAR_OUT + NEAR="x,z": once the median is
// painted (before the flatten), every byMaterial / byFaceUse item with a vertex within 0.5 m of the point: group, index,
// source (shore: ink = pr.inkShore, median = shore-median.json), each ring's vertices within 5 cm with distances; exits.
// (2) STOP_AFTER=<groupKey>: lets the flatten run and exits 0 when the group after it starts. Read-only.
import { readFileSync, writeFileSync } from 'fs'
const [src, out] = process.argv.slice(2)
let s = readFileSync(src, 'utf8')
const pre = "      byMaterial.get('shore').push(...s.items)\n"
if (s.split(pre).length !== 2) throw new Error('pre')
s = s.replace(pre, "      globalThis.__nInk = byMaterial.get('shore').length\n" + pre)
const anchor = "    } else if (S.state === 'pending')"
if (s.split(anchor).length !== 2) throw new Error('anchor')
s = s.replace(anchor, `      if (process.env.NEAR_OUT) { const [px, pz] = process.env.NEAR.split(',').map(Number), nInk = globalThis.__nInk, rec = []
        const groups = [...[...byMaterial].map(([k, v]) => ['mat:' + k, v]), ...[...byFaceUse].map(([k, v]) => ['face:' + k, v])]
        for (const [k, L] of groups) L.forEach((it, i) => { const rings = Array.isArray(it) ? [it] : [it.outer, ...(it.holes || [])]
          if (!rings.some(r => r && r.some(q => Math.hypot(q[0] - px, q[1] - pz) < 0.5))) return
          rec.push({ group: k, i, src: k === 'mat:shore' ? (i < nInk ? 'ink (pr.inkShore)' : 'median (shore-median.json)') : null,
            rings: rings.map((r, ri) => ({ ri, n: r.length, near: r.map((q, vi) => ({ vi, q, d: Math.hypot(q[0] - px, q[1] - pz) })).filter(v => v.d < (r.length <= 10 ? 1e9 : 0.5)) })).filter(r => r.near.length) }) })
        writeFileSync(process.env.NEAR_OUT, JSON.stringify(rec)); console.log('[NEAR] written; exiting'); process.exit(0) }
` + anchor)
const prog = "    console.log(`  [progress] flatten ${e.groupKey} ${entries.length - i}/${entries.length}`)\n"
if (s.split(prog).length !== 2) throw new Error('prog')
s = s.replace(prog, "    if (globalThis.__stopNext) { console.log('[STOP_AFTER] ' + process.env.STOP_AFTER + ' flattened; exiting'); process.exit(0) }\n    if (process.env.STOP_AFTER && e.groupKey === process.env.STOP_AFTER) globalThis.__stopNext = true\n" + prog)
writeFileSync(out, s); console.log('wrote', out)
