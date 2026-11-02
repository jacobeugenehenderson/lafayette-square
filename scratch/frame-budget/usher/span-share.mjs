// span-share.mjs <profile.json[.gz]> — the worst busy span of each flight (as spike-analyse.mjs cuts them) and the share of it
// whose stack holds a frame from each named kit file (inclusive: a sample counts for every file on its stack once).
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
const buf = readFileSync(process.argv[2]), P = JSON.parse(process.argv[2].endsWith('.gz') ? gunzipSync(buf) : buf)
const FILES = ['SlabRevetment.jsx', 'revetmentNear.js', 'shoreChunks.js', 'drawnGround.js', 'revetmentDrape.js', 'revetmentFromSlab.js']
for (const [fi, p] of P.entries()) {
  const by = new Map(p.nodes.map(n => [n.id, n])); for (const n of p.nodes) for (const c of n.children || []) by.get(c).parent = n.id
  const stack = (id) => { const s = []; for (let n = by.get(id); n; n = by.get(n.parent)) s.push(n); return s }
  const spans = []; let cur = null
  for (let i = 0; i < p.samples.length; i++) { const dt = (p.timeDeltas[i + 1] ?? 0) / 1000, st = stack(p.samples[i])
    if (st[0].callFrame.functionName === '(idle)') { cur = null; continue }
    if (!cur) spans.push(cur = { ms: 0, s: [] }); cur.ms += dt; cur.s.push([st, dt]) }
  const w = spans.sort((a, b) => b.ms - a.ms)[0], per = Object.fromEntries(FILES.map(f => [f, 0])); let any = 0
  for (const [st, dt] of w.s) { const urls = new Set(st.map(n => n.callFrame.url.split('?')[0].split('/').pop())); let hit = false
    for (const f of FILES) if (urls.has(f)) { per[f] += dt; hit = true } if (hit) any += dt }
  console.log(`flight ${fi + 1}: worst span ${Math.round(w.ms)} ms; under the revetment's files ${Math.round(any)} ms (${Math.round(100 * any / w.ms)}%) — ${FILES.map(f => `${f} ${Math.round(per[f])}`).join(' · ')}`)
}
