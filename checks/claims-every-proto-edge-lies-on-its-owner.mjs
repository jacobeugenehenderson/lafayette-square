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
// grid off tileGround.js (`SCALE`), never restated. Red with coordinates, the label, and the chain it lies on.
// The rim (`__boundary__`) and the water edge own no chain and are not judged.
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
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'
import { loadSceneStencil } from '../cartograph/sceneStencil.js'
import { resolveChainSegmentation } from '../src/lib/chainSegmentation.js'
const quietly = async (f) => { const o = console.log, w = console.warn; console.log = console.warn = () => {}; try { return await f() } finally { console.log = o; console.warn = w } }
const { tessellateAdaptive } = await quietly(() => import('../cartograph/derive.js'))

const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const named = process.argv.slice(2).filter(a => !a.startsWith('--'))
const SCALE = +readFileSync(join(ROOT, 'src/lib/tileGround.js'), 'utf8').match(/^const SCALE = (\d+)/m)?.[1]
if (!SCALE) { console.error('⛔ NOT CHECKED — SCALE not found in tileGround.js'); process.exit(2) }
const DEFAULT_MAP = readFileSync(join(ROOT, 'cartograph/scene.js'), 'utf8').match(/export const DEFAULT_MAP = '([^']+)'/)?.[1]
const ribbonsOf = (s) => s === DEFAULT_MAP ? join(ROOT, 'src/data/ribbons.json') : join(ROOT, 'cartograph/data', s, 'clean/ribbons.json')
const XY = (q) => Array.isArray(q) ? q : [q.x, q.z]
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz; const t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0; return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz) }
const dTo = (Q, q) => { let m = Infinity; for (let i = 0; i + 1 < Q.length; i++) m = Math.min(m, segD(q[0], q[1], Q[i], Q[i + 1])); return m }
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
}
console.log(red ? '\n⛔ Some ① edge carries an owner it does not have — a wrong street, side or span is a wrong curb, paint and authoring slot; a leaked cap drops frontage.' : '\n✅ Every ① edge lies on the chain, the side and the span that own it, and every cap record labels only its cap.')
process.exit(red ? 1 : 0)
