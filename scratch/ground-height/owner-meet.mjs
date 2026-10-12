// owner-meet.mjs — where do two owners' bands MEET, and with what height gap? (the band decides, Jacob 2026-10-11)
// Rebuild the deformer from the bake's dumped inputs; over every ped triangle of a baked slab (curb · treelawn:* ·
// sidewalk), resolve each vertex's owner and D; an edge whose two ends have different owners is a meeting; its fall at
// the ceiling, E·|ΔD| / length, against the walk limit. READ-ONLY.
//   node scratch/ground-height/owner-meet.mjs <scene> <dump inputs.json> <slab dir>
import { readFileSync } from 'fs'
import { join } from 'path'
const R = new URL('../../', import.meta.url).pathname
const { loadSceneTerrain } = await import(R + 'cartograph/terrainLoad.js')
const { buildDeformer } = await import(R + (process.env.NEARER ? 'scratch/ground-height/groundDeformer.nearer.mjs' : 'cartograph/groundDeformer.mjs'))
const { resolveWalkNorm, resolveLawnNorm } = await import(R + 'cartograph/curb-cut-norm.mjs')
const [scene, dumpP, dir] = process.argv.slice(2)
const dump = JSON.parse(readFileSync(dumpP)), T = loadSceneTerrain(scene), E = T.exag, lim = resolveWalkNorm(scene).crossSlopeMax
const D = buildDeformer({ tiles: dump.tiles, bands: dump.bands, stencil: dump.stencil, raw: T.getElevationRaw,
  limits: { walkMax: lim, lawnMax: resolveLawnNorm(scene).slopeMax ?? null, exag: E, blend: T.stepM, sigma: T.stepM } })
const gj = JSON.parse(readFileSync(join(dir, 'ground.json'))), gb = readFileSync(join(dir, 'ground.bin')), AB = gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength)
const edges = new Map(), t0 = Date.now()
let nV = 0
const vk = (x, z) => `${Math.round(x * 1000)},${Math.round(z * 1000)}`
const at = new Map()
const get = (x, z) => { const k = vk(x, z); let r = at.get(k); if (!r) { r = { v: D.heightAt(x, z), o: D.ownerAt(x, z), x, z }; at.set(k, r); nV++ } return r }
for (const g of gj.groups) {
  if (!(g.id === 'curb' || g.id === 'sidewalk' || g.id.startsWith('treelawn'))) continue
  const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount)
  for (let i = 0; i < I.length; i += 3) for (const [a, b] of [[I[i], I[i + 1]], [I[i + 1], I[i + 2]], [I[i + 2], I[i]]]) {
    const A = get(P[a * 3], P[a * 3 + 2]), B = get(P[b * 3], P[b * 3 + 2])
    if (A.o == null || B.o == null || A.o === B.o) continue
    const L = Math.hypot(A.x - B.x, A.z - B.z); if (L < 1e-6) continue
    const k = [vk(A.x, A.z), vk(B.x, B.z)].sort().join('|'); if (edges.has(k)) continue
    edges.set(k, { fall: E * Math.abs(A.v - B.v) / L, gap: E * Math.abs(A.v - B.v), L, g: g.id, o: [A.o, B.o].sort().join(' ⟷ '), at: [A.x, A.z] })
  }
}
const all = [...edges.values()], over = all.filter(e => e.fall > lim)
// ⭐ SPLIT (Boz, 2026-10-11): owners on ONE ring (a corner arc ⟷ a run, run ⟷ run, arc ⟷ arc) vs owners on DIFFERENT
// rings (another ring of the same tile, or another tile) — the gap distribution of each
const kind = (e) => { const [a, b] = e.o.split(' ⟷ ').map(k => k.split('|'))
  if (a[0] !== b[0]) return 'different tile'
  if (a[1] !== b[1]) return 'same tile, different ring'
  const t = [a[2][0], b[2][0]].sort().join('')
  return t === 'ar' ? 'one ring: arc ⟷ run' : t === 'rr' ? 'one ring: run ⟷ run' : 'one ring: arc ⟷ arc' }
const pc = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(p * (s.length - 1))] : NaN }
const cm = (v) => Number.isFinite(v) ? (v * 100).toFixed(1) : '—'
for (const k of ['one ring: arc ⟷ run', 'one ring: run ⟷ run', 'one ring: arc ⟷ arc', 'same tile, different ring', 'different tile']) {
  const A = all.filter(e => kind(e) === k), O = A.filter(e => e.fall > lim), g = O.map(e => e.gap)
  const pairs = new Set(O.map(e => e.o)).size
  console.log(`  ${k}: ${A.length} edge(s) · over the limit ${O.length} in ${pairs} owner pair(s) · gap p50 ${cm(pc(g, .5))} p90 ${cm(pc(g, .9))} max ${cm(pc(g, 1))} cm · >5 cm ${g.filter(v => v > .05).length} · >25 cm ${g.filter(v => v > .25).length} · >1 m ${g.filter(v => v > 1).length}`)
  const by = new Map(); for (const e of O) { const s = by.get(e.o) || { n: 0, max: 0, at: e.at }; s.n++; if (e.gap > s.max) { s.max = e.gap; s.at = e.at } by.set(e.o, s) }
  for (const [o, s] of [...by].sort((a, b) => b[1].max - a[1].max).slice(0, 4)) console.log(`      ${o}: ${s.n} edge(s), gap up to ${cm(s.max)} cm at (${s.at.map(v => v.toFixed(1))})`)
}
console.log(`${nV} ped vertices resolved in ${((Date.now() - t0) / 1000).toFixed(0)}s · ${all.length} edges where the owner changes · ${over.length} of them fall more than the walk limit across the change`)
const q = (a, p) => a.length ? a[Math.floor(p * (a.length - 1))] : NaN
const gaps = over.map(e => e.gap).sort((a, b) => a - b)
console.log(`  their height gap: p50 ${(q(gaps, .5) * 100).toFixed(1)} cm · p90 ${(q(gaps, .9) * 100).toFixed(1)} cm · max ${(gaps.at(-1) * 100).toFixed(1)} cm · over 5 cm ${gaps.filter(g => g > 0.05).length} · over 25 cm ${gaps.filter(g => g > 0.25).length}`)
const by = new Map(); for (const e of over) { const s = by.get(e.o) || { n: 0, max: 0, at: e.at }; s.n++; if (e.gap > s.max) { s.max = e.gap; s.at = e.at } by.set(e.o, s) }
console.log(`  ${by.size} owner pairs; the largest gaps:`)
for (const [o, s] of [...by].sort((a, b) => b[1].max - a[1].max).slice(0, 12)) console.log(`    ${o}: ${s.n} edge(s), gap up to ${(s.max * 100).toFixed(1)} cm at (${s.at.map(v => v.toFixed(1))})`)
console.log('stats', JSON.stringify(D.stats))

// ⭐ WHAT THE ONE-RING GAPS OVER 25 cm TOUCH: a span with NO line (its run carries no h — the ring's H there is filled
// from its neighbours) vs both owners' spans lined. Arcs are named by the runs either side of them on the ring.
const sideRuns = new Map()   // `${ti}|${k}|a${id}` → the run before and after the arc on that ring
for (const [ti, t] of dump.tiles.entries()) (t.iaArc || []).forEach((arc, k) => { const st = t.iaStamp?.[k] || [], n = arc.length
  for (let i = 0; i < n; i++) if (arc[i] != null && arc[(i + n - 1) % n] !== arc[i]) { let j = i; while (arc[j % n] === arc[i] && j < i + n) j++
    sideRuns.set(`${ti}|${k}|a${arc[i]}`, [st[(i + n - 1) % n], st[j % n]]) } })
const runsOf = (o) => { const [ti, k, sp] = o.split('|'); return sp[0] === 'r' ? [+sp.slice(1)] : (sideRuns.get(o) || []) }
const lined = (ti, r) => { const run = dump.tiles[ti]?.runs?.[r]; return !!(run && Array.isArray(run.h) && run.h.every(v => v != null)) }
const big = over.filter(e => e.gap > 0.25)
const cls = { 'a span with no line': 0, 'both lined': 0 }, ex = { 'a span with no line': [], 'both lined': [] }
for (const e of big) { const [A, B] = e.o.split(' ⟷ '), ti = +A.split('|')[0]
  const rs = [...runsOf(A), ...runsOf(B)].filter(r => r != null), k = rs.some(r => !lined(ti, r)) ? 'a span with no line' : 'both lined'
  cls[k]++; if (!ex[k].some(x => x.o === e.o)) ex[k].push(e) }
console.log(`one-ring gaps over 25 cm: ${big.length} edge(s) · touching a span with no line ${cls['a span with no line']} · both owners lined ${cls['both lined']}`)
for (const k of Object.keys(ex)) for (const e of ex[k].sort((a, b) => b.gap - a.gap).slice(0, 5)) {
  const ti = +e.o.split('|')[0], names = [...new Set(e.o.split(' ⟷ ').flatMap(runsOf))].map(r => `${dump.tiles[ti].runs[r]?.skelId}${lined(ti, r) ? '' : '(no line)'}`)
  console.log(`   ${k}: ${e.o} gap ${(e.gap * 100).toFixed(0)} cm at (${e.at.map(v => v.toFixed(1))}) — ${names.join(' · ')}`) }

// ⭐ SPANS ON A STRUCTURE (Boz, 2026-10-11): a span whose street is raised (ribbons.json layer > 0, or bridge) should own
// no ground. How many ped vertices does such a span own, and which owner-change edges touch one.
const rib = JSON.parse(readFileSync(join(R, 'cartograph/data', scene, 'clean/ribbons.json')))
const raised = new Map(rib.streets.map(st => [st.skelId ?? st.name, (Number(st.layer) > 0 || st.bridge === true || st.bridge === 'yes') ? `layer ${st.layer ?? 0}${st.bridge ? ' bridge' : ''}` : null]))
const raisedOf = (o) => { const ti = +o.split('|')[0]; return runsOf(o).map(r => dump.tiles[ti]?.runs?.[r]?.skelId).filter(id => id && raised.get(id)) }
const ownCount = new Map(); for (const r of at.values()) if (r.o) ownCount.set(r.o, (ownCount.get(r.o) || 0) + 1)
let rv = 0; const rs = new Map()
for (const [o, n] of ownCount) { const ids = raisedOf(o); if (ids.length) { rv += n; for (const id of ids) rs.set(id, (rs.get(id) || 0) + n) } }
console.log(`ped vertices owned by a span on a raised street: ${rv} of ${[...ownCount.values()].reduce((a, b) => a + b, 0)} · by street: ${[...rs].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} (${raised.get(id)}) ${n}`).join(' · ') || 'none'}`)
const tr = over.filter(e => e.o.split(' ⟷ ').some(o => raisedOf(o).length)), tg = tr.map(e => e.gap)
console.log(`owner-change edges over the limit touching a raised span: ${tr.length} · gap p50 ${cm(pc(tg, .5))} p90 ${cm(pc(tg, .9))} max ${cm(pc(tg, 1))} cm · >25 cm ${tg.filter(v => v > .25).length}`)
const rest = over.filter(e => !tr.includes(e)), rg = rest.map(e => e.gap)
console.log(`  the rest: ${rest.length} · gap p50 ${cm(pc(rg, .5))} p90 ${cm(pc(rg, .9))} max ${cm(pc(rg, 1))} cm · >25 cm ${rg.filter(v => v > .25).length} · >1 m ${rg.filter(v => v > 1).length}`)
