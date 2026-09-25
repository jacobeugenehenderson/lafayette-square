#!/usr/bin/env node
// CLAIM — EVERY HIGHWAY END IS ACCOUNTED FOR, AND AN AT-GRADE END BUTTS INSIDE THE TOWN'S ASPHALT (H-3 check 5).
//
// A highway chain ends in one of a few ways, and each is drawn deliberately (BRIEF-highway-build step 5):
//   AT-GRADE  its end is a vertex of a town street — a ramp terminal (the street passes through: H BUTTS at
//             the town centreline and the town asphalt draws over it) or an END-TO-END handoff (the street
//             continues it: H tapers to the street's own width, `tileGround` "END-TO-END");
//   GORE      its end lies on ANOTHER highway's interior (a merge/diverge) — the H union is the flush area;
//   JOINT     its end is shared only with other highway ends (a pair of ramps meeting, a carriageway change);
//   OFF-RIM   its end is outside the disc.
// Anything else is a LOOSE end — a highway that stops in a field — and is red, by name.
// For every AT-GRADE end, both butt corners (the node ± H's half-width at that end, across the highway's own
// direction) must lie within the town street's resolved pavement half-width of its centreline (with the look's
// authoring), so the town asphalt covers H's end.
//
//   node checks/claims-ramp-ends-classified.mjs [scene…] [--skeleton=path --ribbons=path]
//
// MUTATION (must go red): nudge one highway endpoint 1 m in a temp skeleton (--skeleton).
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'
import { loadSceneStencil } from '../cartograph/sceneStencil.js'

const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const named = process.argv.slice(2).filter(a => !a.startsWith('--'))
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const DEFAULT_MAP = readFileSync(join(ROOT, 'cartograph/scene.js'), 'utf8').match(/export const DEFAULT_MAP = '([^']+)'/)?.[1]
const ribbonsOf = (s) => s === DEFAULT_MAP ? join(ROOT, 'src/data/ribbons.json') : join(ROOT, 'cartograph/data', s, 'clean/ribbons.json')
const H = /^(motorway|motorway_link|trunk|trunk_link)$/
const XY = (p) => Array.isArray(p) ? p : [p.x, p.z]
const K = (p) => { const q = XY(p); return `${(+q[0]).toFixed(2)},${(+q[1]).toFixed(2)}` }
const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz; const t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0; return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz) }
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
let red = false
for (const scene of ((arg('skeleton') || arg('ribbons')) ? named : scenes('cartograph/data/<scene>/raw/osm.json'))) {
  const skP = arg('skeleton') || join(ROOT, 'cartograph/data', scene, 'clean/skeleton.json'), ribP = arg('ribbons') || ribbonsOf(scene)
  if (!existsSync(skP) || !existsSync(ribP)) { console.log(`── ${scene}   ⛔ NOT CHECKED — missing skeleton or ribbons`); red = true; continue }
  const sk = readJson(skP).streets, rib = readJson(ribP)
  const byId = new Map(rib.streets.map(s => [s.skelId, s]))
  const hw = sk.filter(s => H.test(s.highway) && s.gradeSeparated && s.points?.length >= 2)
  if (!hw.length) { console.log(`── ${scene}   no highway`); continue }
  if (!hw.some(s => byId.get(s.id)?.measure?.right?.section)) { console.log(`── ${scene}   ⛔ NOT CHECKED — ribbons carry no highway section (poured before H-3). Re-pour.`); red = true; continue }
  const C = loadSceneStencil(ROOT, scene)?.clipPolygon
  const designP = join(ROOT, 'public/looks', scene, 'design.json')
  const blockCustoms = existsSync(designP) ? (readJson(designP).blockCustoms || null) : null
  // incidences: every vertex of every chain
  const at = new Map()
  for (const s of sk) (s.points || []).forEach((p, i, P) => { const k = K(p); if (!at.has(k)) at.set(k, []); at.get(k).push({ s, pos: i === 0 ? 'start' : i === P.length - 1 ? 'end' : 'mid' }) })
  const tally = { 'at-grade': 0, gore: 0, joint: 0, 'off-rim': 0 }, loose = [], outside = []
  for (const s of hw) for (const which of ['start', 'end']) {
    const node = XY(which === 'start' ? s.points[0] : s.points[s.points.length - 1])
    if (C && !pip(node[0], node[1], C)) { tally['off-rim']++; continue }
    const others = (at.get(K(node)) || []).filter(x => x.s !== s)
    const town = others.filter(x => !(H.test(x.s.highway) && x.s.gradeSeparated))
    const hwyOther = others.filter(x => H.test(x.s.highway) && x.s.gradeSeparated)
    let cls = null
    if (town.length) cls = 'at-grade'
    else if (hwyOther.some(x => x.pos === 'mid')) cls = 'gore'
    else if (hwyOther.length) cls = 'joint'
    if (!cls) { loose.push(`${s.id}.${which} @(${node[0].toFixed(0)}, ${node[1].toFixed(0)})`); continue }
    tally[cls]++
    if (cls !== 'at-grade') continue
    // the butt: H's half-width at this end, across the highway's own direction
    const r = byId.get(s.id), P = s.points.map(XY), n = P.length
    const [a, b] = which === 'end' ? [P[n - 2], P[n - 1]] : [P[1], P[0]]
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L
    const endHw = (side) => { const sp = r?.measure?.[side]?.section?.spans || []; const x = which === 'end' ? sp[sp.length - 1] : sp[0]; return x?.hw }
    // an END-TO-END handoff narrows H to the street's own width at the node (tileGround); a butt keeps the section
    const ts = town.map(x => ({ x, st: byId.get(x.s.id) })).filter(o => o.st)
    const cont = ts.find(o => o.x.pos !== 'mid' && (o.x.s.oneway ? o.x.pos === (which === 'end' ? 'start' : 'end') : ts.length === 1))
    const sideW = (st, side) => { const c = blockCustoms?.[st.skelId]?.[side]; const v = c && Object.values(c).find(q => Number.isFinite(q?.pavementHW)); return Number.isFinite(v?.pavementHW) ? v.pavementHW : st.measure?.[side]?.pavementHW }
    const wR = cont ? sideW(cont.st, 'right') : endHw('right'), wL = cont ? sideW(cont.st, 'left') : endHw('left')
    // right of travel is +n for an END (travel toward the node), −n for a START (travel away from it)
    const sgn = which === 'end' ? 1 : -1
    const corners = [[node[0] + sgn * nx * wR, node[1] + sgn * nz * wR], [node[0] - sgn * nx * wL, node[1] - sgn * nz * wL]]
    const covered = (q) => ts.some(({ st }) => { const SP = st.points; for (let i = 0; i + 1 < SP.length; i++) {
      const w = Math.max(st.measure?.left?.pavementHW || 0, st.measure?.right?.pavementHW || 0, sideW(st, 'left') || 0, sideW(st, 'right') || 0)
      if (segD(q[0], q[1], SP[i], SP[i + 1]) <= w + 0.01) return true } return false })
    const miss = corners.filter(q => !covered(q))
    if (miss.length) outside.push(`${s.id}.${which} @(${node[0].toFixed(0)}, ${node[1].toFixed(0)}) — ${miss.length} butt corner(s) outside ${town.map(x => x.s.id).join('/')}'s asphalt`)
  }
  const bad = loose.length + outside.length
  console.log(`── ${scene} ── highway ends: ${Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(' · ')} · loose ${loose.length} · at-grade butts outside town asphalt ${outside.length} ${bad ? '⛔' : '✅'}`)
  for (const l of loose) console.log(`   ⛔ loose end ${l}`)
  for (const o of outside) console.log(`   ⛔ ${o}`)
  if (bad) red = true
}
console.log(red ? '\n⛔ A highway end is unaccounted for, or its butt pokes out of the town asphalt.' : '\n✅ Every highway end is accounted for, and every at-grade butt sits inside the town asphalt.')
process.exit(red ? 1 : 0)
