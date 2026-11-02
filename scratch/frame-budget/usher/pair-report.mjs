// pair-report.mjs <dir> [arms=A,B,C] — the paired round, per pair and per arm. A pair is (town, seed, flight); its pose is
// the camera position at the tap. A pair whose pose differs from arm A's by more than one stone chunk (shoreChunks.js#CHUNK_M)
// is UNPAIRED: said, and left out of the per-pair deltas (the seed did not control the phase there).
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
const [dir, armsArg = 'A,B,C'] = process.argv.slice(2)
const arms = armsArg.split(',').filter(a => existsSync(join(dir, `pair-${a}.jsonl`)))
const { CHUNK_M } = await import(new URL('../../../src/lib/shoreChunks.js', import.meta.url).href)
const runs = {}
for (const a of arms) {
  let meta = null
  for (const l of readFileSync(join(dir, `pair-${a}.jsonl`), 'utf8').trim().split('\n')) {
    const o = JSON.parse(l); if (o._arm) { meta = o; continue }
    for (const f of o.flights || []) (runs[`${o.town}|${o.seed}|${f.k}`] ??= {})[a] = { ...f, wardKit: meta?._wardKit, error: o.error }
    if (o.error) console.log(`⛔ ${a} ${o.town} seed ${o.seed}: ${o.error}`)
  }
}
const dist = (p, q) => (p && q ? Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) : Infinity)
const med = (v) => { const s = [...v].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null }
for (const town of [...new Set(Object.keys(runs).map(k => k.split('|')[0]))]) {
  console.log(`\n## ${town} — worst frame ms · heap MB after landing, per pair (pose Δ vs A in m)`)
  console.log(`| seed·flight | ${arms.map(a => `${a} worst · heap`).join(' | ')} | ${arms.slice(1).map(a => `${a} Δpose`).join(' | ')} |`)
  const unpaired = Object.fromEntries(arms.map(a => [a, 0])), per = Object.fromEntries(arms.map(a => [a, { w: [], h: [] }]))
  for (const [k, r] of Object.entries(runs).filter(([k]) => k.startsWith(town + '|')).sort()) {
    const A = r[arms[0]], cells = arms.map(a => r[a] ? `${r[a].worst} · ${r[a].heapAfterMB}` : '—'), deltas = []
    for (const a of arms.slice(1)) { const d = dist(A?.at, r[a]?.at); if (d > CHUNK_M) unpaired[a]++; deltas.push(Number.isFinite(d) ? (d > CHUNK_M ? `${d.toFixed(1)} ✗` : d.toFixed(1)) : '—') }
    for (const a of arms) if (r[a]?.worst != null) { per[a].w.push(r[a].worst); per[a].h.push(r[a].heapAfterMB) }
    console.log(`| ${k.split('|').slice(1).join('·')} | ${cells.join(' | ')} | ${deltas.join(' | ')} |`)
  }
  console.log(`per arm (n flights): ${arms.map(a => `${a}: worst-frame median ${med(per[a].w)} / worst ${Math.max(...per[a].w)} ms, heap median ${med(per[a].h)} / max ${Math.max(...per[a].h)} MB (n=${per[a].w.length})`).join(' · ')}`)
  console.log(`unpaired (pose Δ > ${CHUNK_M} m vs A): ${arms.slice(1).map(a => `${a} ${unpaired[a]}`).join(' · ')}`)
}
