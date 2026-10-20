// road-disagree.mjs — read-only: on the road side, WHY ②'s height (H② at q, P's nearest ② point) differs from the ① owner's
// line at P, for every road-group wall triangle whose ① owner is a street (the wall test on the stored terrain part):
//   proj  = line_A(P) − line_A(q): P and q project to different stations of A's chain (Δs along it, its turn between them)
//   owner = line_A(q) − H②(q): ② holds something other than A's line there — another street's line, a corner arc's blend, the
//           terrain of a highway/bridge edge, a cap
// The cause is the larger term. Counts by cause × ② class, with the interchange cell (600,1000) apart, and 3 sites each.
//   node road-disagree.mjs <slab dir> <dump.json> <groundDeformer.mjs>
import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
import { resolveLawnNorm, resolveWalkNorm } from '../../../cartograph/curb-cut-norm.mjs'
import { LATTICE_M } from '../../../src/lib/lattice.js'
import { lineHeights } from '../../../.claude/worktrees/hpdm-gate/cartograph/lineHeight.mjs'
import { readBakeDesign } from '../../../cartograph/lookDesign.mjs'
const [dir, dumpF, defF] = process.argv.slice(2), gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8')), buf = readFileSync(join(dir, gj.bin)), AB = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const town = gj.look, T = loadSceneTerrain(town), raw = T.getElevationRaw, E = T.exag, lawn = resolveLawnNorm(town, null).slopeMax, design = readBakeDesign(town, town, 'rd')
const sigma = design.groundLineSigmaM > 0 ? design.groundLineSigmaM : T.stepM, blend = design.groundBlendM > 0 ? design.groundBlendM : T.stepM
const streets = JSON.parse(readFileSync(`cartograph/data/${town}/clean/ribbons.json`, 'utf8')).streets, LH = lineHeights({ streets, raw, sigma })
const chain = new Map(streets.filter(s => s?.points?.length >= 2).map(s => [s.skelId ?? s.name, s.points]))
const dump = JSON.parse(readFileSync(dumpF, 'utf8')), { buildDeformer } = await import(resolve(defF))
const D = buildDeformer({ town, tiles: dump.tiles, ink: dump.ink, bands: dump.bands, stencil: dump.stencil, raw, line: { step: LH.step, heightAt: (id, p) => LH.heightAt(id, p) },
  limits: { walkMax: resolveWalkNorm(town, null).crossSlopeMax ?? 0, lawnMax: lawn, exag: E, blend, sigma } })
const bridges = new Set(); for (const t of dump.tiles) for (const o of t.ringOwner || []) if (o?.gradeSeparated) bridges.add(o.skelId)
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c } return c }
const segD = (p, q, x, z) => { const dx = q[0] - p[0], dz = q[1] - p[1], L2 = dx * dx + dz * dz, u = L2 > 0 ? Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / L2)) : 0; return [Math.hypot(x - p[0] - u * dx, z - p[1] - u * dz), u] }
// arclength of p's projection onto chain id, and the chain's heading there
const proj = (id, p) => { const P = chain.get(id); if (!P) return null; let best = Infinity, s = 0, out = null
  for (let i = 0; i + 1 < P.length; i++) { const [d, u] = segD(P[i], P[i + 1], p[0], p[1]), L = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1])
    if (d < best) { best = d; out = { s: s + u * L, h: Math.atan2(P[i + 1][1] - P[i][1], P[i + 1][0] - P[i][0]), end: (i === 0 && u === 0) || (i + 2 === P.length && u === 1) } } s += L }
  return out }
const tileOf = (x, z) => dump.tiles.find(t => t.ring && pip(x, z, t.ring))
const owner2 = (t, x, z, id) => { let best = null, bd = Infinity
  t.iaFull.forEach((ring, ri) => ring.forEach((p, i) => { const [d] = segD(p, ring[(i + 1) % ring.length], x, z); if (d < bd) { bd = d; best = { ri, i } } }))
  const a = t.iaArc?.[best.ri]?.[best.i], st = t.iaStamp?.[best.ri]?.[best.i], cp = t.iaCap?.[best.ri]?.[best.i], n = t.iaFull[best.ri].length
  const o2 = a != null && t.iaArc[best.ri][(best.i + 1) % n] === a ? 'arc' : st != null ? t.runs[st]?.skelId : cp != null ? 'cap:' + t.caps[cp]?.skelId : '?'
  return o2 === 'arc' ? 'arc' : o2 === id ? 'same chain' : o2 === '__highway__' || bridges.has(o2) ? 'highway/bridge edge' : o2.startsWith('cap:') ? 'cap' : 'another street' }
const OUT = [], PAIR = new Map(), PS = new Map(), MS = new Map(), DEV = [], MECH2 = new Map(), MECH = new Map(), R = new Map(), SITE = new Map(), seen = new Set(); let n = 0
for (const g of gj.groups) { if (g.rawByteOffset == null || !/^(asphalt|highway|stripe)$/.test(g.id)) continue
  const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount), Rw = new Float32Array(AB, g.rawByteOffset, g.vertexCount)
  for (let k = 0; k < I.length; k += 3) { const v = [I[k], I[k + 1], I[k + 2]], h = v.map(w => Rw[w]), tr = v.map(w => raw(P[w * 3], P[w * 3 + 2]))
    const ex = (Math.max(...h) - Math.min(...h)) * E - (Math.max(...tr) - Math.min(...tr)) * E; if (!(ex > LATTICE_M)) continue
    const xs = v.map(w => P[w * 3]), zs = v.map(w => P[w * 3 + 2]), span = Math.max(Math.hypot(xs[0] - xs[1], zs[0] - zs[1]), Math.hypot(xs[1] - xs[2], zs[1] - zs[2]), Math.hypot(xs[2] - xs[0], zs[2] - zs[0]))
    if (ex <= lawn * span) continue
    const x = (xs[0] + xs[1] + xs[2]) / 3, z = (zs[0] + zs[1] + zs[2]) / 3, o = D.ownerAt(x, z); if (!o?.startsWith('①')) continue
    const id = o.split('|').pop(); if (id === '__highway__' || id === '__rim__' || bridges.has(id)) continue
    const e = D.explain(x, z); if (!e.station) continue
    const q = e.station, LP = LH.heightAt(id, [x, z]), Lq = LH.heightAt(id, q), H2 = e.H, t = tileOf(x, z); if (LP == null || Lq == null || !t) continue
    n++; const pP = proj(id, [x, z]), pq = proj(id, q), ds = pP && pq ? Math.abs(pP.s - pq.s) : NaN, turn = pP && pq ? Math.abs(((pP.h - pq.h + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * 180 / Math.PI : NaN
    // the owner's line at the triangle's own vertices: does it JUMP inside the triangle (the projection crossing the chain's medial axis)?
    const lv = v.map(w => LH.heightAt(id, [P[w * 3], P[w * 3 + 2]])), lspread = (Math.max(...lv) - Math.min(...lv)) * E, jump = lspread >= 0.5 * ex && lspread > span * 0.286
    const c2 = owner2(t, x, z, id), pr = Math.abs(LP - Lq), ow = Math.abs(Lq - H2), cell = x >= 600 && x < 800 && z >= 1000 && z < 1200 ? 'interchange (600,1000)' : 'elsewhere'
    const ev = v.map(w => D.explain(P[w * 3], P[w * 3 + 2])), hv = ev.map(e => e.H).filter(h => h != null), hspread = hv.length === 3 ? (Math.max(...hv) - Math.min(...hv)) * E : 0
    const qsep = hv.length === 3 ? Math.max(...[0, 1, 2].map(i => Math.hypot(ev[i].station[0] - ev[(i + 1) % 3].station[0], ev[i].station[1] - ev[(i + 1) % 3].station[1]))) : 0
    const h2jump = !jump && hspread >= 0.5 * ex && hspread > 0.286 * Math.max(qsep, 1e-3)
    const cause = jump ? `the owner's line JUMPS inside the triangle (spread ${lspread < 0.05 ? '< 5 cm' : '≥ 5 cm'})` : h2jump ? `H② JUMPS along ② under the triangle (${c2 === 'arc' ? 'on an arc' : 'on a ' + c2 + ' edge'}, q's ${qsep < 0.05 ? '< 5 cm' : '≥ 5 cm'} apart)` : Math.max(pr, ow) * E < 0.5 * ex ? 'neither term at the centroid, no jump found (cause not established)' : pr >= ow ? `projection (Δs ${ds < 2 ? '< 2' : ds < 10 ? '2–10' : '≥ 10'} m${pP?.end || pq?.end ? ', past a chain end' : turn > 10 ? `, a curve` : ', straight'})` : `② holds ${c2 === 'same chain' ? 'its own chain, not the line there' : c2}`
    // ⭐ the MECHANISM test for a jump: walk 1 mm steps between the points whose heights jump (the vertices for the owner's line,
    // their q's for H②) and look for a STATION jump in the projection onto the chain whose line is read there
    if (jump || h2jump) { const pts = jump ? v.map(w => [P[w * 3], P[w * 3 + 2]]) : ev.map(e => e.station), cid = jump ? id : (c2 === 'same chain' ? id : null)
      // for H②, the ② owner's chain (a run's skelId) at q, from the ② edge nearest each q
      const own2 = (q) => { let best = null, bd = Infinity; t.iaFull.forEach((ring, ri) => ring.forEach((p, i) => { const [d] = segD(p, ring[(i + 1) % ring.length], q[0], q[1]); if (d < bd) { bd = d; best = { ri, i } } }))
        const st = t.iaStamp?.[best.ri]?.[best.i], cp = t.iaCap?.[best.ri]?.[best.i]; return st != null ? t.runs[st]?.skelId : cp != null ? t.caps[cp]?.skelId : null }
      const cid2 = jump ? id : own2(pts[0])
      let sj = 0, stot = 0, plen = 0; if (cid2) for (let i = 0; i < 3; i++) { const a0 = pts[i], b0 = pts[(i + 1) % 3], L = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]), m = Math.max(1, Math.ceil(L / 0.001)); let prev = proj(cid2, a0); plen += L
        for (let j = 1; j <= m && m < 5000; j++) { const p = [a0[0] + (b0[0] - a0[0]) * j / m, a0[1] + (b0[1] - a0[1]) * j / m], c = proj(cid2, p); if (prev && c) { const d = Math.abs(c.s - prev.s); sj = Math.max(sj, d); stot += d } prev = c } }
      const ratio = plen > 0 ? stot / plen : 0
      // H② is the edge's line SAMPLED every line.step and interpolated: does it differ from the line asked at q itself?
      const dev = cid2 && !jump ? Math.max(...pts.map((q, i) => Math.abs((ev[i].H ?? 0) - (LH.heightAt(cid2, q) ?? 0)))) * E : 0
      // each q's own ② edge: an arc, or a run (by its skelId), or a cap
      const edgeOf = (q) => { let best = null, bd = Infinity; t.iaFull.forEach((ring, ri) => ring.forEach((p, i) => { const [d] = segD(p, ring[(i + 1) % ring.length], q[0], q[1]); if (d < bd) { bd = d; best = { ri, i } } }))
        const n = t.iaFull[best.ri].length, ar = t.iaArc?.[best.ri]?.[best.i]; if (ar != null && t.iaArc[best.ri][(best.i + 1) % n] === ar) return 'arc' + ar
        const st = t.iaStamp?.[best.ri]?.[best.i], cp = t.iaCap?.[best.ri]?.[best.i]; return st != null ? 'run:' + t.runs[st]?.skelId : cp != null ? 'cap:' + t.caps[cp]?.skelId : '?' }
      const eq = jump ? [] : pts.map(edgeOf), kinds = new Set(eq), anyArc = eq.some(e => e.startsWith('arc'))
      const devSame = !jump && kinds.size === 1 && !anyArc ? Math.max(...pts.map((q, i) => Math.abs((ev[i].H ?? 0) - (LH.heightAt(eq[0].slice(4), q) ?? 0)))) * E : null
      if (devSame != null) DEV.push(devSame)
      if (!jump && kinds.size > 1) { const ks = [...kinds], hw = ks.some(k => k === 'run:__highway__' || bridges.has(k.slice(4))), arcs = ks.some(k => k.startsWith('arc')), runs = new Set(ks.filter(k => k.startsWith('run:') && k !== 'run:__highway__' && !bridges.has(k.slice(4))))
        const pk = hw ? 'a highway/bridge run ↔ ' + (runs.size ? 'a street run' : arcs ? 'an arc' : 'itself') : arcs ? 'an arc ↔ a run' : runs.size > 1 ? 'two street runs, no arc between' : ks.some(k => k.startsWith('cap')) ? 'a cap ↔ a run' : 'other'
        if (pk === 'two street runs, no arc between') OUT.push({ x, z, ex, qs: ev.map(e => e.station), ti: dump.tiles.indexOf(t) })
        PAIR.set(pk, (PAIR.get(pk) || 0) + 1); if (!PS.has(pk)) PS.set(pk, []); if (PS.get(pk).length < 3) PS.get(pk).push(`(${x.toFixed(1)}, ${z.toFixed(1)}) ${ks.join(' | ')} · H② spread ${hspread.toFixed(3)}`) }
      const mk2 = !jump && kinds.size > 1 ? `the q's lie on ${anyArc ? 'an arc and its neighbour' : 'two different ② owners'} (H② changes owner under the triangle)` : !jump && anyArc ? 'the q\'s lie on one corner arc (its blend)' : !jump && devSame != null ? (devSame >= 0.5 * ex ? 'one run: H② (sampled, interpolated) off the line at q' : 'one run: H② equals the line at q (the line itself moves that fast along ②)') : !cid2 ? 'no chain (an arc or no run)' : sj > 0.1 ? 'the projection JUMPS (station Δ > 0.1 m within 1 mm)' : ratio > 3 ? `the chain station runs > 3× faster than ② (the inside of a bend)` : dev >= 0.5 * ex ? 'H② (the line sampled every step and interpolated) is off the line at q itself' : `no station jump, station ≤ 3× ② (cause not established)`
      MECH2.set((jump ? 'line' : 'H②') + ' · ' + mk2, (MECH2.get((jump ? 'line' : 'H②') + ' · ' + mk2) || 0) + 1)
      { const kk = (jump ? 'line' : 'H②') + ' · ' + mk2; const L = MS.get(kk) || MS.set(kk, []).get(kk); if (L.length < 3 && !L.some(z0 => Math.hypot(z0.x - x, z0.z - z) < 20)) L.push({ x, z, txt: `(${x.toFixed(1)}, ${z.toFixed(1)}) ① ${id} · excess ${ex.toFixed(3)} m over ${span.toFixed(3)} m${jump ? ` · line spread ${lspread.toFixed(3)}` : ` · H② spread ${hspread.toFixed(3)} · ② ${[...kinds].join(' | ')}`}` }) }
      let sj1 = 0; if (cid) for (let i = 0; i < 3; i++) { const a0 = pts[i], b0 = pts[(i + 1) % 3], L = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]), m = Math.max(1, Math.ceil(L / 0.001)); let prev = proj(cid, a0)
        for (let j = 1; j <= m && m < 5000; j++) { const p = [a0[0] + (b0[0] - a0[0]) * j / m, a0[1] + (b0[1] - a0[1]) * j / m], c = proj(cid, p); if (prev && c) sj1 = Math.max(sj1, Math.abs(c.s - prev.s)); prev = c } }
      const mk = !cid ? 'chain not tested (② of another owner)' : sj1 > 0.1 ? 'the projection JUMPS (station Δ > 0.1 m within 1 mm)' : 'no station jump'
      MECH.set((jump ? 'line' : 'H②') + ' · ' + mk, (MECH.get((jump ? 'line' : 'H②') + ' · ' + mk) || 0) + 1) }
    const key = `${cell} · ② ${c2} · ${cause}`; R.set(key, (R.get(key) || 0) + 1)
    const sk = `(${x.toFixed(1)}, ${z.toFixed(1)})`; if (!SITE.has(key)) SITE.set(key, [])
    if (SITE.get(key).length < 3 && !seen.has(sk)) { seen.add(sk); SITE.get(key).push(`${sk} ${id} · L(P) ${LP.toFixed(2)} · L(q) ${Lq.toFixed(2)} · H② ${H2.toFixed(2)} · d② ${e.d.toFixed(2)} · Δs ${ds.toFixed(1)} m · turn ${turn.toFixed(0)}°`) } } }
console.log(`street-① road walls traced: ${n}`)
for (const [k, v] of [...R].sort((a, b) => b[1] - a[1])) { console.log(`${String(v).padStart(6)}  ${k}`); for (const s of SITE.get(k)) console.log(`          ${s}`) }
console.log('jump mechanism:', [...MECH].map(([k, v]) => `${k} ${v}`).join(' · '))
console.log('jump mechanism (② owner\'s chain for H②):', [...MECH2].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '))
DEV.sort((a, b) => a - b); console.log(`|H②(q) − line(q)| at the H② jump walls: p50 ${(DEV[DEV.length >> 1] ?? 0).toFixed(3)} · p90 ${(DEV[Math.floor(DEV.length * 0.9)] ?? 0).toFixed(3)} · max ${(DEV[DEV.length - 1] ?? 0).toFixed(3)} m`)
for (const [k, L] of [...MS].sort((a, b) => (MECH2.get(b[0]) || 0) - (MECH2.get(a[0]) || 0))) { console.log(`${MECH2.get(k)}  ${k}`); for (const r of L) console.log(`     ${r.txt}`) }
console.log('H② owner change, by pair:'); for (const [k, v] of [...PAIR].sort((a, b) => b[1] - a[1])) { console.log(`  ${v}  ${k}`); for (const t of PS.get(k)) console.log(`       ${t}`) }
if (process.argv[5]) (await import('fs')).writeFileSync(process.argv[5], JSON.stringify(OUT))
