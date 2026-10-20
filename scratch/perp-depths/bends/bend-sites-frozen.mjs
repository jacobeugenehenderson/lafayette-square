#!/usr/bin/env node
// Read-only, no build: each RED site of the bend row (claims-a-bend-bends-the-band.mjs; the arc's first point as it prints) →
// the frozen tile whose ring carries that point (by geometry) → its arc, the runs stamped either side and on it, and the
// operator's authoring on each (blockCustoms by skelId|side|segOrd, the corner's cornerCornerRadiusOverrides entry by iaArcKey).
//   node scratch/perp-depths/bends/bend-sites-frozen.mjs [scene=huron] [x,z …]
import fs from 'fs'
import { feed } from '../../_proto-feed.mjs'
const scene = process.argv[2] || 'huron'
const sites = process.argv.slice(3).map(s => s.split(',').map(Number))
const shapePath = process.env.SHAPE || `public/baked/${scene}/shape.json`
const S = JSON.parse(fs.readFileSync(shapePath, 'utf8')), T = S.tiles
const f = feed(scene); if (!f) process.exit(1)
const bc = f.blockCustoms || {}, cc = f.cornerCornerRadiusOverrides || {}
console.log(`${scene}: ${shapePath} (${fs.statSync(shapePath).mtime.toISOString().slice(0, 10)}) · ${T.length} tiles · blockCustoms streets ${Object.keys(bc).length} · corner entries ${Object.keys(cc).length}`)
const run = (t, si, i) => { const r = t.iaStamp?.[si]?.[i]; return r == null ? null : t.runs?.[r] }
const rs = (x) => x ? `${x.skelId}|${x.side}|${x.segOrd}${x.hwy ? ' hwy' : ''}` : 'none'
for (const [x, z] of sites) {
  const hits = []
  T.forEach((t, k) => (t.iaFull || []).forEach((ring, si) => ring.forEach(([px, pz], i) => {
    const d = Math.hypot(px - x, pz - z); if (d < 0.06 && t.iaArc?.[si]?.[i] != null) hits.push({ k, si, i, d }) })))
  console.log(`\n(${x}, ${z}): ${hits.length} arc vertex/vertices within 6 cm`)
  for (const h of hits) {
    const t = T[h.k], arc = t.iaArc[h.si], ring = t.iaFull[h.si], n = ring.length, u = arc[h.i]
    const ix = []; for (let i = 0; i < n; i++) if (arc[i] === u) ix.push(i)
    let f0 = ix[0]; if (ix.length < n && arc[(f0 - 1 + n) % n] === u) f0 = ix.find(i => arc[(i - 1 + n) % n] !== u) ?? f0
    const seq = []; for (let k = 0, i = f0; k < n && arc[i] === u; k++, i = (i + 1) % n) seq.push(i)
    const before = (seq[0] - 1 + n) % n, after = (seq[seq.length - 1] + 1) % n
    const onArc = [...new Set(seq.map(i => rs(run(t, h.si, i))))]
    const key = t.iaArcKey?.[h.si]?.[u] ?? null, jx = t.iaJunction?.[h.si]?.[seq[0]]
    console.log(`  tile ${h.k} ring ${h.si} arc ${u} · vertex ${h.i} (${h.d.toFixed(3)} m) · arc vertices ${seq[0]}..${seq[seq.length - 1]} (${seq.length}) · junction label ${JSON.stringify(jx)} · iaArcKey ${key}`)
    console.log(`    runs: before (v${before}) ${rs(run(t, h.si, before))} · on the arc ${onArc.join(', ')} · after (v${after}) ${rs(run(t, h.si, after))}`)
    const owners = new Map([before, ...seq, after].map(i => run(t, h.si, i)).filter(Boolean).map(r => [rs(r), r]))
    for (const [k, r] of owners) { const c = bc?.[r.skelId]?.[r.side]?.[r.segOrd]
      console.log(`    blockCustoms[${k}]: ${c ? JSON.stringify(c) : 'none'}${bc?.[r.skelId] ? ` (street has entries: ${JSON.stringify(Object.fromEntries(Object.entries(bc[r.skelId]).map(([s, v]) => [s, Object.keys(v || {})])))})` : ''}`) }
    console.log(`    corner entry cornerCornerRadiusOverrides[${key}]: ${key && cc[key] != null ? JSON.stringify(cc[key]) : 'none'}`)
  }
}
