#!/usr/bin/env node
// CLAIM — EVERY ① EDGE LIES ON THE CHAIN THAT OWNS IT (one owner per edge, and it is the right one).
//
// ① is the union of ε-strokes; every block-ring edge is a piece of ONE chain's stroke, so the owner stamped on it
// (`protopolygon.owners[blockLabels[k][i]]` — the label names the edge LEAVING vertex i) must be that chain: the
// edge lies ε from the owner's centreline. The owner is how ② offsets the edge (its width), how ③ paints it (town
// frontage or a bare highway edge), and which authoring slot it answers to — a wrong owner is a wrong curb.
// ⭐ FOUND 2026-09-24 (Gantry, H-3): where one chain ENDS on another's stroke at a shallow angle (a ramp merging, a
// carriageway joint, a chain cut), the ending chain's butt-corner vertex lies on the other's boundary and SURVIVES
// the union with its own label — and the edge leaving it runs along the OTHER chain. provincetown trunk-link-28:
// 14.49 m of snail-road frontage stamped `trunk-link-28 right/0`, painted bare at the highway depth.
// ASSERTS, for every in-disc ① block edge (outer + holes) whose owner is a chain in the ribbons: its two ends and its
// midpoint lie within ε + 2 Clipper grid steps of the owner's centreline — ε read off the artifact (`eps`), the
// grid off src/lib/lattice.js (`CLIP_SCALE`), never restated. Red with coordinates, the label, and the chain it lies on.
// The rim (`__boundary__`) and the water edge own no chain and are not judged HERE; the next block judges them.
// ⭐ AND THE FRAME AND THE WATER OWN THEIR OWN EDGES (2026-10-14, Tern; Boz's ruling, RIBBONS §1 "THE RIM BOUNDS, IT DOES
// NOT OWN"). Over EVERY ① block edge, in the disc or not: an edge lying on ①'s FRAME (the bbox of the frozen blocks — the
// mint's frame, read off the artifact) must be `__boundary__`; an edge lying on a frozen `waterRings` ring must carry a
// water owner; an edge on both may carry either (counted); an edge on NEITHER must carry neither `__boundary__` nor the
// water RING's own owner (the one with `srcIdx` −1 — the coast's stroked chains own `__water__` too, with srcIdx ≥ 0,
// and lie on their own ink). Found where every street that crosses the frame swapped labels with it at the minted
// crossing: Huron 22, Provincetown 26–27, HPDM 178 frame edges carried a street and as many ink edges `__boundary__`;
// one Huron frame edge struck at motorway-56's depth beside a rim edge struck at 0 gave ② a 180° reversal, and the
// painter's corner join cut a 665 m swath through tile 6 (checks/claims-no-kerb-ring-turns-back-on-itself.mjs).
// ⭐ SELF-TEST every run: a synthetic frame crossed by one ink strip, labelled right (green) and with the two labels at
// one crossing swapped (red on both the frame edge and the ink edge).
// ⭐ AND THE REST OF THE OWNER — its SIDE and its SPAN (2026-09-25). Each on-chain edge is projected onto the chain's
// MINT polyline (the skeleton tessellated by derive's own `tessellateAdaptive`, segmented by the mint's own
// `resolveChainSegmentation`): the segment it lies beside gives the true span (`segOrd`, the slot authoring keys by)
// and the true side (measure-right = (−dz, dx)). An edge beside several segments passes if any agrees. Wrong ones
// are split END SEGMENT (a chain's first/last) vs INTERIOR, because the residual after the 2026-09-25 fix is
// almost all the former (cause not established) — an interior one is the regression to watch for.
// ⭐ AND A `cap` RECORD LABELS ONLY ITS CAP: an edge longer than 3·eps carrying one is red (the run emitter
// declines cap edges, so a leak there would silently drop frontage).
//
//   node checks/claims-every-proto-edge-lies-on-its-owner.mjs [scene…] [--ribbons=path]
//
// MUTATIONS (each must go red, on a temp ribbons via --ribbons): swap two block labels · add 1 to one owner's
// `segOrd` (span) · set `cap: true` on one leg edge's owner (cap).
import { readFileSync, existsSync } from 'node:fs'
import { ribbonsPathOf } from '../cartograph/scene.js'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'
import { loadSceneStencil } from '../cartograph/sceneStencil.js'
import { resolveChainSegmentation } from '../src/lib/chainSegmentation.js'
const quietly = async (f) => { const o = console.log, w = console.warn; console.log = console.warn = () => {}; try { return await f() } finally { console.log = o; console.warn = w } }
const { tessellateAdaptive } = await quietly(() => import('../cartograph/derive.js'))

const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const named = process.argv.slice(2).filter(a => !a.startsWith('--'))
import { CLIP_SCALE as SCALE } from '../src/lib/lattice.js'   // the partition's grid, from its one home
const DEFAULT_MAP = readFileSync(join(ROOT, 'cartograph/scene.js'), 'utf8').match(/export const DEFAULT_MAP = '([^']+)'/)?.[1]
const ribbonsOf = (s) => ribbonsPathOf(s)
const XY = (q) => Array.isArray(q) ? q : [q.x, q.z]
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz; const t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0; return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz) }
const dTo = (Q, q) => { let m = Infinity; for (let i = 0; i + 1 < Q.length; i++) m = Math.min(m, segD(q[0], q[1], Q[i], Q[i + 1])); return m }
// ── the frame and the water own their edges: a pure judgement of one frozen ① (P), so the self-test can feed it ──
export function frameWaterJudge(P, TOL) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
  for (const r of P.blocks) for (const q of r) { x0 = Math.min(x0, q[0]); z0 = Math.min(z0, q[1]); x1 = Math.max(x1, q[0]); z1 = Math.max(z1, q[1]) }
  const onFrame = (a, c) => (Math.abs(a[0] - x0) <= TOL && Math.abs(c[0] - x0) <= TOL) || (Math.abs(a[0] - x1) <= TOL && Math.abs(c[0] - x1) <= TOL)
    || (Math.abs(a[1] - z0) <= TOL && Math.abs(c[1] - z0) <= TOL) || (Math.abs(a[1] - z1) <= TOL && Math.abs(c[1] - z1) <= TOL)
  const W = (P.waterRings || []).map(r => r.map(XY))
  const onWater = (a, c) => W.some(r => r.some((q, j) => { const t = r[(j + 1) % r.length]; return segD(a[0], a[1], q, t) <= TOL && segD(c[0], c[1], q, t) <= TOL }))
  const isB = (o) => o?.skelId === '__boundary__', isW = (o) => !!o?.water || o?.skelId === '__water__', isRingW = (o) => isW(o) && o.srcIdx === -1
  const out = { frame: 0, water: 0, both: 0, bad: { frameNotBoundary: [], waterNotWater: [], boundaryOffFrame: [], waterRingOffWater: [] } }
  P.blocks.forEach((b, k) => {
    const rs = [[b, P.blockLabels[k]], ...(P.blockHoles?.[k] || []).map((h, j) => [h, P.blockHoleLabels?.[k]?.[j]])]
    for (const [ring, labs] of rs) { if (!ring || !labs) continue
      for (let i = 0; i < ring.length; i++) { const a = ring[i], c = ring[(i + 1) % ring.length], o = P.owners[labs[i]], L = Math.hypot(c[0] - a[0], c[1] - a[1])
        if (!(L > TOL)) continue                                           // a lattice-length edge has no direction to lie on anything
        const f = onFrame(a, c), w = onWater(a, c), at = `block ${k} @(${((a[0] + c[0]) / 2).toFixed(1)}, ${((a[1] + c[1]) / 2).toFixed(1)}) ${L.toFixed(1)} m stamped ${o ? `${o.skelId} ${o.side}/${o.segOrd}` : 'nothing'}`
        if (f && w) { out.both++; if (!isB(o) && !isW(o)) out.bad.frameNotBoundary.push({ L, s: at }); continue }
        if (f) { out.frame++; if (!isB(o)) out.bad.frameNotBoundary.push({ L, s: at }); continue }
        if (w) { out.water++; if (!isW(o)) out.bad.waterNotWater.push({ L, s: at }); continue }
        if (isB(o)) out.bad.boundaryOffFrame.push({ L, s: at })
        else if (isRingW(o)) out.bad.waterRingOffWater.push({ L, s: at }) } } })
  return out
}
// the self-test: a 100 m frame, one ink strip (10 m wide) crossing it top to bottom — two blocks, labelled right, then with
// the labels at one crossing swapped
{ const owners = [{ skelId: '__boundary__', side: 'right', segOrd: 0, srcIdx: -1, boundary: true }, { skelId: 'strip', side: 'left', segOrd: 0, srcIdx: 0 }, { skelId: 'strip', side: 'right', segOrd: 0, srcIdx: 0 }]
  // left block: frame bottom, the strip's left edge up, frame top, frame left down (label i names the edge leaving vertex i)
  const left = [[0, 0], [45, 0], [45, 100], [0, 100]], right = [[55, 0], [100, 0], [100, 100], [55, 100]]
  const good = { blocks: [left, right], blockLabels: [[0, 1, 0, 0], [0, 0, 0, 2]], owners, waterRings: [] }
  const swapped = { ...good, blockLabels: [[1, 0, 0, 0], [0, 0, 0, 2]] }       // the crossing at (45, 0): frame edge ↔ strip edge
  const G = frameWaterJudge(good, 0.003), S = frameWaterJudge(swapped, 0.003)
  const nG = Object.values(G.bad).reduce((x, v) => x + v.length, 0), sF = S.bad.frameNotBoundary.length, sB = S.bad.boundaryOffFrame.length
  if (nG !== 0 || sF !== 1 || sB !== 1) { console.error(`⛔ SELF-TEST FAILED — the frame/water judgement: right labels gave ${nG} violation(s) (want 0); swapped gave ${sF} frame edge(s) not __boundary__ and ${sB} __boundary__ edge(s) off the frame (want 1 and 1)`); process.exit(2) }
  console.log('self-test: a frame crossed by one ink strip is judged right, and the two labels swapped at one crossing are both caught') }
let red = false
for (const scene of (arg('ribbons') ? named : scenes('cartograph/data/<scene>/raw/osm.json'))) {
  const p = arg('ribbons') || ribbonsOf(scene)
  if (!existsSync(p)) { console.log(`── ${scene}   ⛔ NOT CHECKED — no ribbons`); red = true; continue }
  const r = JSON.parse(readFileSync(p, 'utf8')), P = r.protopolygon
  if (!P?.blocks?.length || !P.owners) { console.log(`── ${scene}   ⛔ NOT CHECKED — no frozen ① blocks`); red = true; continue }
  if (!Number.isFinite(P.eps)) { console.log(`── ${scene}   ⛔ NOT CHECKED — ① carries no eps`); red = true; continue }
  const TOL = P.eps + 2 / SCALE
  const C = loadSceneStencil(ROOT, scene)?.clipPolygon
  const chain = new Map(r.streets.map(s => [s.skelId, s.points.map(XY)]))
  let n = 0, len = 0; const bad = []
  // the MINT's polyline per chain (side + span) — the pour's own inputs, or say loudly why not
  const skP = join(ROOT, 'cartograph/data', scene, 'clean/skeleton.json')
  let mint = null, mintWhy = null
  if (!existsSync(skP)) mintWhy = 'no clean/skeleton.json'
  else {
    const simp = new Map((JSON.parse(readFileSync(skP, 'utf8')).streets || []).map(st => [st.id, tessellateAdaptive((st.points || []).map(XY), st.segments)]))
    const ms = r.streets.filter(s => s?.points?.length >= 2 && !s.gradeSeparated).map(s => { const p = simp.get(s.skelId ?? s.name); return p?.length >= 2 ? { ...s, points: p } : null })
    if (ms.some(m => !m)) mintWhy = `${ms.filter(m => !m).length} chain(s) have no skeleton geometry`
    else { const sg = resolveChainSegmentation(ms); mint = new Map(ms.map(st => { const q = st.points.length, ix = [...(sg.get(st) || [])].filter(i => i > 0 && i < q - 1).sort((x, y) => x - y)
      return [st.skelId ?? st.name, { P: st.points, so: (j) => ix.filter(v => v <= j).length }] })) }
  }
  const wrong = { end: [], interior: [] }, capLeak = []
  P.blocks.forEach((b, k) => {
    const rs = [[b, P.blockLabels[k]], ...(P.blockHoles?.[k] || []).map((h, j) => [h, P.blockHoleLabels?.[k]?.[j]])]
    for (const [ring, labs] of rs) { if (!ring || !labs) continue
      for (let i = 0; i < ring.length; i++) {
        const o = P.owners[labs[i]]
        const a = ring[i], c = ring[(i + 1) % ring.length], mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2]
        if (o?.cap && Math.hypot(c[0] - a[0], c[1] - a[1]) > 3 * P.eps) capLeak.push(`block ${k} @(${mid[0].toFixed(1)}, ${mid[1].toFixed(1)}) ${Math.hypot(c[0] - a[0], c[1] - a[1]).toFixed(1)} m carries ${o.skelId} ${o.side}@${o.srcIdx}'s CAP record`)
        const Q = o && chain.get(o.skelId); if (!Q) continue
        if (C && !pip(mid[0], mid[1], C)) continue
        n++
        const d = Math.max(dTo(Q, a), dTo(Q, mid), dTo(Q, c))
        if (d <= TOL) {
          const M = mint?.get(o.skelId), L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (!M || L <= 3 * P.eps) continue
          const cand = []; let best = null
          for (let j = 0; j + 1 < M.P.length; j++) { const p = M.P[j], q = M.P[j + 1], dx = q[0] - p[0], dz = q[1] - p[1], L2 = dx * dx + dz * dz; if (!L2) continue
            const t = Math.max(0, Math.min(1, ((mid[0] - p[0]) * dx + (mid[1] - p[1]) * dz) / L2)), e = { d: Math.hypot(mid[0] - p[0] - t * dx, mid[1] - p[1] - t * dz), j, side: ((mid[0] - p[0]) * -dz + (mid[1] - p[1]) * dx) > 0 ? 'right' : 'left' }
            if (e.d <= TOL) cand.push(e); if (!best || e.d < best.d) best = e }
          if (!cand.length || cand.some(e => e.side === o.side && M.so(e.j) === o.segOrd)) continue
          const e = cand.find(x => x.side === o.side) || best
          ;(e.j === 0 || e.j === M.P.length - 2 ? wrong.end : wrong.interior).push({ L, s: `block ${k} @(${mid[0].toFixed(1)}, ${mid[1].toFixed(1)}) ${L.toFixed(1)} m stamped ${o.skelId} ${o.side}/${o.segOrd} — lies beside ${e.side}/${M.so(e.j)}` })
          continue
        }
        const L = Math.hypot(c[0] - a[0], c[1] - a[1]); len += L
        let on = null; for (const [id, R] of chain) if (id !== o.skelId && dTo(R, mid) <= TOL) { on = id; break }
        bad.push({ L, s: `block ${k} @(${mid[0].toFixed(1)}, ${mid[1].toFixed(1)}) ${L.toFixed(1)} m stamped ${o.skelId} ${o.side}/${o.segOrd} — ${d.toFixed(2)} m off it; lies on ${on ?? '(no chain within tolerance)'}` })
      } }
  })
  console.log(`── ${scene} ── ${n} in-disc ① block edge(s) with a chain owner · ${bad.length} not on their owner (${len.toFixed(0)} m) ${bad.length ? '⛔' : '✅'}`)
  for (const b of bad.sort((x, y) => y.L - x.L).slice(0, 8)) console.log(`   ⛔ ${b.s}`)
  if (bad.length) red = true
  if (!mint) { console.log(`   ⛔ side + span NOT CHECKED — ${mintWhy}`); red = true }
  else for (const [what, W] of [['INTERIOR', wrong.interior], ["a chain's END segment (open residual, cause not established)", wrong.end]]) {
    const m = W.reduce((x, w) => x + w.L, 0)
    console.log(`   side + span, ${what}: ${W.length} wrong (${m.toFixed(0)} m) ${W.length ? '⛔' : '✅'}`)
    for (const w of W.sort((x, y) => y.L - x.L).slice(0, 4)) console.log(`      ⛔ ${w.s}`)
    if (W.length) red = true }
  console.log(`   cap records on a longer edge: ${capLeak.length} ${capLeak.length ? '⛔' : '✅'}`)
  for (const x of capLeak.slice(0, 4)) console.log(`      ⛔ ${x}`)
  if (capLeak.length) red = true
  const FW = frameWaterJudge(P, TOL)
  console.log(`   the frame and the water own their edges (every block edge, in the disc or not): ${FW.frame} on the frame · ${FW.water} on a water ring · ${FW.both} on both`)
  for (const [what, B] of [['on the FRAME, not __boundary__', FW.bad.frameNotBoundary], ['on a WATER ring, no water owner', FW.bad.waterNotWater], ['__boundary__ OFF the frame', FW.bad.boundaryOffFrame], ['the water RING\'s owner off every water ring', FW.bad.waterRingOffWater]]) {
    console.log(`      ${what}: ${B.length} (${B.reduce((x, b) => x + b.L, 0).toFixed(0)} m) ${B.length ? '⛔' : '✅'}`)
    for (const b of B.sort((x, y) => y.L - x.L).slice(0, 3)) console.log(`         ⛔ ${b.s}`)
    if (B.length) red = true }
}
console.log(red ? '\n⛔ Some ① edge carries an owner it does not have — a wrong street, side or span is a wrong curb, paint and authoring slot; a leaked cap drops frontage.' : '\n✅ Every ① edge lies on the chain, the side and the span that own it, and every cap record labels only its cap.')
process.exit(red ? 1 : 0)
