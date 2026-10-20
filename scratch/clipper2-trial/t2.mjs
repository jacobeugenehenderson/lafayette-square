// t2.mjs <scene> — TRIAL T2 (scratch/open-source-scout/REPORT.md §3): Clipper2's DeltaCallback offset against ours on the same
// ② input (in-<scene>.json, written by dump.mjs with authoring loaded). Ours is `offsetRingByRects` — the LIVE ② builder
// (every served shape.json tile is `producer: "proto"`; `offsetRingVariable` is reached only from `buildCurbRings`, the legacy
// chain path) — called as the pour calls it, minus the ease (Clipper2 has none): (ring, depth, outward, stamp, easeAt=null,
// PROTO_HW, working-copy map). Each contour (a block's outer, and each hole dilated) is compared on its own.
// Per contour: Hausdorff (sampled every STEP m), XOR area, vertex counts, pieces, spike vertices (< SPIKE_DEG), and the rings
// each produces under our AREA_MIN floor (ours: before the floor; Clipper2: it has none).
// Per seam of the working ring (a depth change at a vertex): the local Hausdorff within 2·depth + 2 m, by class —
//   taper  · either edge is a [start, end] ramp (the 10:1 taper or a flare drew it)
//   step   · no ramp, the vertex turns < 2.5°            jog · no ramp, 2.5°–30°            corner · ≥ 30°
// `--sites` writes t2-sites-<scene>.json: the geometry of the worst seams and contours, for the pictures.
import { readFileSync, writeFileSync } from 'fs'
import { c2Offset, signedArea, xorArea, hausdorff, spikes, STEP, STUB, SPIKE_DEG } from './c2.mjs'
import { offsetRingByRects } from './tileGround.probe.mjs'
const scene = process.argv[2], SITES = process.argv.includes('--sites')
const IN = JSON.parse(readFileSync(new URL(`./in-${scene}.json`, import.meta.url), 'utf8'))
const PROTO_HW = 0.005                                     // tileGround.js `PROTO_HW` default (the pour passes no protoHW)
const MODES = ['vertex', 'stub-min', 'stub-max']
const dS = (d) => Math.max(0, (Array.isArray(d) ? d[0] : d) || 0), dE = (d) => Math.max(0, (Array.isArray(d) ? d[1] : d) || 0)
const ramp = (d) => Array.isArray(d) && Math.abs(d[0] - d[1]) > 1e-9
const turnDeg = (r, i) => { const m = r.length, P = r[(i - 1 + m) % m], V = r[i], N = r[(i + 1) % m]
  const t = Math.atan2(N[1] - V[1], N[0] - V[0]) - Math.atan2(V[1] - P[1], V[0] - P[0]); return Math.abs(Math.atan2(Math.sin(t), Math.cos(t))) * 180 / Math.PI }
const ownerName = (lab) => { const o = IN.owners[lab]; return o ? `${o.skelId}|${o.side}|${o.segOrd}` : String(lab) }
const pct = (a, p) => { if (!a.length) return '—'; const s = [...a].sort((x, y) => x - y); const v = s[Math.min(s.length - 1, Math.floor(p * s.length))]; return v === Infinity ? '∞' : v.toFixed(3) }

const rows = [], seams = [], sites = []
for (const b of IN.blocks) {
  const contours = [{ c: b, outward: false, h: -1 }, ...b.holes.map((h, i) => ({ c: h, outward: true, h: i }))]
  for (const { c, outward, h } of contours) {
    const st = {}
    const ours = offsetRingByRects(c.ring, (j) => c.depth[j], outward, st, null, PROTO_HW, { e: c.e, v: c.v, hwy: c.hwy, own: c.own })
    const maxD = Math.max(0, ...c.depth.map(d => Math.max(dS(d), dE(d))))
    const AREA_MIN = Math.max(0.5, maxD * maxD * 0.6)    // offsetRingByRects's own floor, same expression
    const raw = st._carve?.rawRings || []
    const row = { k: b.k, h, n: c.ring.length, maxD, ours: { v: ours.reduce((s, r) => s + r.length, 0), pieces: ours.length,
      under: raw.filter(r => r.length >= 3 && !(Math.abs(signedArea(r)) > AREA_MIN)).map(r => Math.abs(signedArea(r))),
      holes: ours.filter(r => Math.sign(signedArea(r)) !== Math.sign(signedArea(ours[0] || r))).length, spikes: spikes(ours).n } }
    const outs = {}
    for (const m of MODES) {
      const R = c2Offset(c.ring, c.depth, outward, m); outs[m] = R
      const big = R.filter(r => Math.abs(signedArea(r)) > AREA_MIN)
      row[m] = { v: R.reduce((s, r) => s + r.length, 0), pieces: R.length, H: hausdorff(R, ours), xor: xorArea(R, ours),
        under: R.filter(r => !(Math.abs(signedArea(r)) > AREA_MIN)).map(r => Math.abs(signedArea(r))), Hfloored: hausdorff(big, ours), spikes: spikes(R).n,
        holes: R.filter(r => Math.sign(signedArea(r)) !== Math.sign(signedArea(R[0] || r))).length }
    }
    rows.push(row)
    // seams on the working ring
    const n = c.ring.length
    for (let j = 0; j < n; j++) {
      const pd = c.depth[(j - 1 + n) % n], cd = c.depth[j]
      if (!(Math.abs(dE(pd) - dS(cd)) > 1e-6) && !ramp(pd) && !ramp(cd)) continue
      if (!(Math.abs(dE(pd) - dS(cd)) > 1e-6) && !(ramp(pd) || ramp(cd))) continue
      const tv = turnDeg(c.ring, j)
      const cls = (ramp(pd) || ramp(cd)) ? 'taper' : tv < 2.5 ? 'step' : tv < 30 ? 'jog' : 'corner'
      const at = c.ring[j], r = 2 * Math.max(dE(pd), dS(cd)) + 2
      const s = { k: b.k, h, j, at, cls, turn: tv, dPrev: dE(pd), dNext: dS(cd), own: [c.own?.[(j - 1 + n) % n], c.own?.[j]],
        names: [ownerName(c.labs[c.e[(j - 1 + n) % n]]), ownerName(c.labs[c.e[j]])],
        hwy: !!(c.hwy?.[(j - 1 + n) % n] || c.hwy?.[j]), zero: !(dE(pd) > 0) || !(dS(cd) > 0) }
      for (const m of MODES) s[m] = hausdorff(outs[m], ours, at, r)
      seams.push(s)
    }
    if (SITES) sites.push({ k: b.k, h, ring: c.ring, depth: c.depth, ours, ...Object.fromEntries(MODES.map(m => [m, outs[m]])), row })
  }
}
const L = []; const say = (x = '') => { L.push(x); console.log(x) }
say(`T2 · ${scene} (look ${IN.look}, authored slots ${IN.slots}) · ${IN.blocks.length} blocks, ${rows.length} contours · STEP ${STEP} m · STUB ${STUB} m · spike < ${SPIKE_DEG}°`)
say(`ours = offsetRingByRects (live ②), ease off. Distances in m.`)
say('')
say(`per contour            p50      p90      p99      max     contours with H > 0.01 / > 0.5 / ∞ (one side empty)`)
for (const m of MODES) { const H = rows.map(r => r[m].H)
  say(`H ${m.padEnd(10)}  ${pct(H, .5).padStart(7)}  ${pct(H, .9).padStart(7)}  ${pct(H, .99).padStart(7)}  ${pct(H, 1).padStart(7)}    ${H.filter(x => x > 0.01).length} / ${H.filter(x => x > 0.5).length} / ${H.filter(x => x === Infinity).length}`) }
for (const m of MODES) { const H = rows.map(r => r[m].Hfloored)
  say(`H ${m.padEnd(10)} (C2 rings under AREA_MIN dropped)  p99 ${pct(H, .99)}  max ${pct(H, 1)}  > 0.5: ${H.filter(x => x > 0.5).length}`) }
for (const m of MODES) { const X = rows.map(r => r[m].xor); say(`XOR m² ${m.padEnd(10)} total ${X.reduce((s, x) => s + x, 0).toFixed(1)}  p99 ${pct(X, .99)}  max ${pct(X, 1)}`) }
say('')
say(`vertices   ours ${rows.reduce((s, r) => s + r.ours.v, 0)} · ` + MODES.map(m => `${m} ${rows.reduce((s, r) => s + r[m].v, 0)}`).join(' · '))
say(`pieces     ours ${rows.reduce((s, r) => s + r.ours.pieces, 0)} · ` + MODES.map(m => `${m} ${rows.reduce((s, r) => s + r[m].pieces, 0)}`).join(' · '))
say(`holes      ours ${rows.reduce((s, r) => s + r.ours.holes, 0)} · ` + MODES.map(m => `${m} ${rows.reduce((s, r) => s + r[m].holes, 0)}`).join(' · '))
say(`spikes     ours ${rows.reduce((s, r) => s + r.ours.spikes, 0)} · ` + MODES.map(m => `${m} ${rows.reduce((s, r) => s + r[m].spikes, 0)}`).join(' · '))
const und = (a) => `${a.length} rings, ${a.reduce((s, x) => s + x, 0).toFixed(2)} m²` + (a.length ? `, largest ${Math.max(...a).toFixed(2)} m²` : '')
say(`under AREA_MIN   ours (before its floor) ${und(rows.flatMap(r => r.ours.under))} · ` + MODES.map(m => `${m} ${und(rows.flatMap(r => r[m].under))}`).join(' · '))
const bk = (a) => [a.filter(x => x < 0.01).length, a.filter(x => x >= 0.01 && x < 0.5).length, a.filter(x => x >= 0.5).length].join(' / ')
say(`  by area < 0.01 / 0.01–0.5 / ≥ 0.5 m²:  ours ${bk(rows.flatMap(r => r.ours.under))} · ` + MODES.map(m => `${m} ${bk(rows.flatMap(r => r[m].under))}`).join(' · '))
say('')
say(`seams (a depth change at a working-ring vertex): local H within 2·depth + 2 m`)
say(`  street = both edges town streets at depth > 0 · hwy = a highway-owned edge (its depth is H-3's placeholder inside H) · zero = an edge at depth 0 (rim, verge)`)
for (const [grp, f] of [['street', s => !s.hwy && !s.zero], ['hwy', s => s.hwy && !s.zero], ['zero', s => s.zero]])
  for (const cls of ['step', 'jog', 'taper', 'corner']) { const S = seams.filter(s => s.cls === cls && f(s)); if (!S.length) { say(`  ${grp.padEnd(6)} ${cls.padEnd(6)}     0`); continue }
    say(`  ${grp.padEnd(6)} ${cls.padEnd(6)} ${String(S.length).padStart(5)}   ` + MODES.map(m => { const H = S.map(s => s[m]); return `${m} p50 ${pct(H, .5)} p90 ${pct(H, .9)} max ${pct(H, 1)}` }).join(' · ')) }
const named = seams.filter(s => /18th/i.test(s.names.join()) && /dolman/i.test(s.names.join()))
if (named.length) { say(''); say(`18th × Dolman seams (by owner name, for the clamp case RIBBONS §1 cites)`)
  for (const s of named) say(`  block ${s.k} v${s.j} ${s.cls} turn ${s.turn.toFixed(2)}° ${s.dPrev.toFixed(3)} → ${s.dNext.toFixed(3)} m  ${s.names.join(' → ')}  ` + MODES.map(m => `${m} ${s[m] === Infinity ? '∞' : s[m].toFixed(3)}`).join(' · ')) }
say(''); say(`worst 8 STREET seams by stub-min local H`)
for (const s of [...seams].filter(s => !s.hwy && !s.zero).sort((a, b) => b['stub-min'] - a['stub-min']).slice(0, 8))
  say(`  block ${s.k}${s.h >= 0 ? ` hole ${s.h}` : ''} v${s.j} ${s.cls} turn ${s.turn.toFixed(1)}° ${s.dPrev.toFixed(2)}→${s.dNext.toFixed(2)}  ${s.names.join(' → ')}  ` + MODES.map(m => `${m} ${s[m] === Infinity ? '∞' : s[m].toFixed(3)}`).join(' · '))
say(''); say(`worst 8 contours by stub-min H`)
for (const r of [...rows].sort((a, b) => b['stub-min'].H - a['stub-min'].H).slice(0, 8))
  say(`  block ${r.k}${r.h >= 0 ? ` hole ${r.h}` : ''} n ${r.n} maxD ${r.maxD.toFixed(2)}  ours ${r.ours.pieces} pc ${r.ours.v} v · ` + MODES.map(m => `${m} H ${r[m].H === Infinity ? '∞' : r[m].H.toFixed(3)} ${r[m].pieces} pc ${r[m].v} v`).join(' · '))
writeFileSync(new URL(`./t2-${scene}.out`, import.meta.url), L.join('\n') + '\n')
writeFileSync(new URL(`./t2-${scene}.json`, import.meta.url), JSON.stringify({ rows, seams }))
if (SITES) writeFileSync(new URL(`./t2-sites-${scene}.json`, import.meta.url), JSON.stringify(sites))
