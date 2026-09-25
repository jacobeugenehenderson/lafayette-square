#!/usr/bin/env node
// CLAIM — EVERY HIGHWAY END IS ACCOUNTED FOR, AND AN AT-GRADE END LIES INSIDE THE TOWN'S ASPHALT (H-3 check 5).
//
// A highway chain ends in one of a few ways, and each is drawn deliberately (cartograph/_archive/BRIEF-highway-build-plan-2026-09-23.md step 5):
//   AT-GRADE  its end is a vertex of a town street — a ramp terminal (the street passes through: H BUTTS at
//             the town centreline and the town asphalt draws over it) or an END-TO-END handoff (the street
//             continues it: H tapers to the street's own width, `tileGround` "END-TO-END");
//   GORE      its end lies on ANOTHER highway's interior (a merge/diverge) — the H union is the flush area;
//   JOINT     its end is shared only with other highway ends (a pair of ramps meeting, a carriageway change);
//   OFF-RIM   its end is outside the disc.
// Anything else is a LOOSE end — a highway that stops in a field — and is red, by name.
// For every AT-GRADE end that BUTTS (not a handoff — there H's end is the continuing street's own width, so there is
// no butt), both corners (the node ± H's half-width at that end, across the highway's own direction) must lie inside the town asphalt: over a segment of a
// street at that node, within that street's RESOLVED half-width (with the look's authoring) ON THE CORNER'S SIDE.
// A corner outside it must be received by a FROZEN RAMP-TERMINAL FLARE (`protopolygon.flares`,
// `r-ramp-terminal-flares`) AND by the DRAWN curb: in the baked `shape.json`, just past the butt beside the corner is
// in no block's `iA` (the region inside the asphalt edge). A flare frozen but not so drawn is "declared, not drawn", RED;
// no baked shape ⇒ "not judged", RED. The frozen flares must also be what the REAL `rampTerminalFlares` re-derives.
// ⭐ The geometry is the RIBBONS' points — the tessellated line H is swept on — never the skeleton's anchors, whose
// chord at a curved end is not the direction H arrives in (provincetown trunk-link-9: a 58 m chord across a curve).
// The end-contact rule (butt / handoff) is the source's own `highwayEndContact`, imported, never copied.
//
//   node checks/claims-ramp-ends-classified.mjs [scene…] [--ribbons=path] [--shape=path]
//
// MUTATIONS (each must go red): nudge one highway endpoint 1 m in a temp ribbons (--ribbons) · delete one entry
// of `protopolygon.flares` in a temp ribbons · judge a flared ribbons against a shape baked WITHOUT the flare (--shape).
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'
import { loadSceneStencil } from '../cartograph/sceneStencil.js'
import { highwayEndContact, rampTerminalFlares } from '../src/lib/tileGround.js'
import { resolveChainSegmentation } from '../src/lib/chainSegmentation.js'

const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const named = process.argv.slice(2).filter(a => !a.startsWith('--'))
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const DEFAULT_MAP = readFileSync(join(ROOT, 'cartograph/scene.js'), 'utf8').match(/export const DEFAULT_MAP = '([^']+)'/)?.[1]
const ribbonsOf = (s) => s === DEFAULT_MAP ? join(ROOT, 'src/data/ribbons.json') : join(ROOT, 'cartograph/data', s, 'clean/ribbons.json')
const HW = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link'])
const XY = (p) => Array.isArray(p) ? p : [p.x, p.z]
const K = (p) => { const q = XY(p); return `${(+q[0]).toFixed(3)},${(+q[1]).toFixed(3)}` }
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const TOL = 0.01
let red = false
for (const scene of (arg('ribbons') ? named : scenes('cartograph/data/<scene>/raw/osm.json'))) {
  const ribP = arg('ribbons') || ribbonsOf(scene)
  if (!existsSync(ribP)) { console.log(`── ${scene}   ⛔ NOT CHECKED — no ribbons`); red = true; continue }
  const rib = readJson(ribP)
  const all = rib.streets.filter(s => s.points?.length >= 2)
  const isH = (s) => HW.has(s.highway) && s.gradeSeparated
  const hw = all.filter(isH), town = all.filter(s => !s.gradeSeparated)
  if (!hw.length) { console.log(`── ${scene}   no highway`); continue }
  if (!hw.some(s => s.measure?.right?.section)) { console.log(`── ${scene}   ⛔ NOT CHECKED — ribbons carry no highway section (poured before H-3). Re-pour.`); red = true; continue }
  const C = loadSceneStencil(ROOT, scene)?.clipPolygon
  const designP = join(ROOT, 'public/looks', scene, 'design.json')
  const blockCustoms = existsSync(designP) ? (readJson(designP).blockCustoms || null) : null
  const seg = resolveChainSegmentation(town)
  const segOrdOf = (st, i) => { const n = st.points.length; let so = 0; for (const k of (seg.get(st) || [])) if (k > 0 && k < n - 1 && k <= i) so++; return so }
  // the street's half-width on `side` over span `segOrd`, WITH the look's authoring
  const hwOf = (st, side, segOrd) => { const c = blockCustoms?.[st.skelId]?.[side]?.[segOrd]
    return (c && Number.isFinite(c.pavementHW)) ? c.pavementHW : st.measure?.[side]?.pavementHW }
  // incidences: every vertex of every chain (the RIBBONS' points — the geometry H is swept on)
  const at = new Map()
  for (const s of all) s.points.forEach((p, i, P) => { const k = K(p); if (!at.has(k)) at.set(k, []); at.get(k).push({ s, i, pos: i === 0 ? 'start' : i === P.length - 1 ? 'end' : 'mid' }) })
  // is corner q inside street st's asphalt? over one of its segments, within the resolved width on q's side
  const inside = (q, st) => { const P = st.points.map(XY)
    for (let i = 0; i + 1 < P.length; i++) {
      const a = P[i], b = P[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (!(L > 0)) continue
      const t = ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / L; if (t < -TOL || t > L + TOL) continue
      const lat = ((q[0] - a[0]) * -dz + (q[1] - a[1]) * dx) / L        // + is measure-right = (−dz, dx) of point order
      const w = hwOf(st, lat > 0 ? 'right' : 'left', segOrdOf(st, i))
      if (Number.isFinite(w) && Math.abs(lat) <= w + TOL) return true
    } return false }
  const frozen = rib.protopolygon?.flares
  // the DRAWN curb: every block's region inside the asphalt edge (`iA`), from the baked shape
  const shapeP = arg('shape') || join(ROOT, 'public/baked', scene, 'shape.json')
  const iA = existsSync(shapeP) ? (readJson(shapeP).tiles || []).filter(t => t.iaStamp).map(t => (t.iA || []).filter(r => r?.length >= 3)) : null
  const wind = (x, z, r) => { let w = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]
    if (zj <= z) { if (zi > z && (xi - xj) * (z - zj) - (x - xj) * (zi - zj) > 0) w++ } else if (zi <= z && (xi - xj) * (z - zj) - (x - xj) * (zi - zj) < 0) w-- } return w }
  // ⭐ WHERE THE FLARE SHOWS: the corner itself always sits on H's edge (H is cut out of every block), so it can never
  // be inside a block. The flare's work is just PAST the butt beside the corner — without it the block's curb wraps
  // round H's corner there; with it that spot is town asphalt. Probed 2·TOL beyond the butt and 2·TOL in toward H's
  // centreline (twice the check's on-edge tolerance, so the probe sits on no edge). MEASURED on provincetown: 9 of 9
  // probes inside a block without flares; drawn flares turn theirs to asphalt.
  const inBlock = (q) => iA.some(rs => rs.reduce((w, r) => w + wind(q[0], q[1], r), 0) !== 0)
  const flareKey = (f) => `${f.hwy}.${f.end}.${f.corner}`
  const frozenBy = new Map((frozen || []).map(f => [flareKey(f), f]))
  const tally = { 'at-grade': 0, gore: 0, joint: 0, 'off-rim': 0 }, loose = [], outside = [], undrawn = []
  let handoffs = 0, drawn = 0
  for (const s of hw) for (const which of ['start', 'end']) {
    const P = s.points.map(XY), n = P.length
    const node = which === 'start' ? P[0] : P[n - 1]
    if (C && !pip(node[0], node[1], C)) { tally['off-rim']++; continue }
    const others = (at.get(K(node)) || []).filter(x => x.s !== s)
    const townAt = others.filter(x => !x.s.gradeSeparated), hwyOther = others.filter(x => isH(x.s))
    let cls = null
    if (townAt.length) cls = 'at-grade'
    else if (hwyOther.some(x => x.pos === 'mid')) cls = 'gore'
    else if (hwyOther.length) cls = 'joint'
    if (!cls) { loose.push(`${s.skelId}.${which} @(${node[0].toFixed(0)}, ${node[1].toFixed(0)})`); continue }
    tally[cls]++
    if (cls !== 'at-grade') continue
    const [a, b] = which === 'end' ? [P[n - 2], P[n - 1]] : [P[1], P[0]]
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L
    const endHw = (side) => { const sp = s.measure?.[side]?.section?.spans || []; const x = which === 'end' ? sp[sp.length - 1] : sp[0]; return x?.hw }
    // ⭐ the SOURCE's contact rule: a handoff narrows H to the continuing street's width at the node
    const contact = highwayEndContact(townAt.map(x => ({ st: x.s, at: x.pos })), which)
    // a HANDOFF has no butt: H's end IS the continuing street's width (the sweep's END-TO-END taper), so there is
    // nothing for the town asphalt to receive — counted, not judged here
    if (contact.kind === 'handoff') { handoffs++; continue }
    const wR = endHw('right'), wL = endHw('left')
    const sgn = which === 'end' ? 1 : -1                                   // right of travel: +n at an END, −n at a START
    for (const [corner, q] of [['right', [node[0] + sgn * nx * wR, node[1] + sgn * nz * wR]], ['left', [node[0] - sgn * nx * wL, node[1] - sgn * nz * wL]]]) {
      if (townAt.some(x => inside(q, x.s))) continue
      const tag = `${s.skelId}.${which} ${corner} corner @(${node[0].toFixed(0)}, ${node[1].toFixed(0)})`
      const f = frozenBy.get(`${s.skelId}.${which}.${corner}`)
      if (frozen === undefined) outside.push(`${tag} — outside ${townAt.map(x => x.s.skelId).join('/')}'s asphalt (ribbons poured before flares: re-pour)`)
      else if (!f) outside.push(`${tag} — outside ${townAt.map(x => x.s.skelId).join('/')}'s asphalt, and NO flare is frozen for it`)
      else { const st = all.find(x => x.skelId === f.street), o = f.lateral - hwOf(st, f.side, f.segOrd)
        const what = `${f.street} ${f.side}/${f.segOrd} widens ${o.toFixed(2)} m, tapers over ${(f.rate * o).toFixed(1)} m (${f.sources.filter(x => x.startsWith('[U]')).length ? '[U]' : 'cited'})`
        if (!iA) undrawn.push(`${tag} — flare declared, NOT JUDGED: no baked shape (${shapeP}) — ${what}`)
        else if (inBlock([q[0] + 2 * TOL * (b[0] - a[0]) / L + 2 * TOL * (node[0] - q[0]) / Math.hypot(node[0] - q[0], node[1] - q[1]),
                          q[1] + 2 * TOL * (b[1] - a[1]) / L + 2 * TOL * (node[1] - q[1]) / Math.hypot(node[0] - q[0], node[1] - q[1])])) undrawn.push(`${tag} — flare DECLARED, NOT DRAWN (the block's curb still wraps H's corner): ${what}`)
        else drawn++ }
    }
  }
  // the frozen flares are what the REAL function re-derives from these ribbons
  let drift = []
  if (frozen !== undefined) {
    const q = console.log, w = console.warn; console.log = console.warn = () => {}
    let F; try { F = rampTerminalFlares(town, all.filter(s => s.gradeSeparated), HW, C) } finally { console.log = q; console.warn = w }
    const sig = (f) => `${flareKey(f)}→${f.street}/${f.side}/${f.segOrd}`
    const A = new Set(frozen.map(sig)), B = new Set(F.flares.map(sig))
    drift = [...[...A].filter(x => !B.has(x)).map(x => `frozen but not re-derived: ${x}`), ...[...B].filter(x => !A.has(x)).map(x => `re-derived but not frozen: ${x}`)]
  }
  const bad = loose.length + outside.length + undrawn.length + drift.length
  console.log(`── ${scene} ── highway ends: ${Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(' · ')} (of the at-grade, ${handoffs} handoff) · loose ${loose.length} · corners outside the town asphalt ${outside.length} · flares drawn ${drawn}, declared-not-drawn ${undrawn.length}${frozen === undefined ? ' (no flares frozen)' : ` of ${frozen.length} frozen`}${drift.length ? ` · ⛔ frozen flares drift ${drift.length}` : ''} ${bad ? '⛔' : '✅'}`)
  for (const l of loose) console.log(`   ⛔ loose end ${l}`)
  for (const o of outside) console.log(`   ⛔ ${o}`)
  for (const u of undrawn) console.log(`   ⛔ ${u}`)
  for (const d of drift) console.log(`   ⛔ ${d}`)
  if (bad) red = true
}
console.log(red ? '\n⛔ A highway end is unaccounted for, or a butt corner lies outside the town asphalt with no flare drawn to receive it.' : '\n✅ Every highway end is accounted for, and every butt corner lies inside the town asphalt.')
process.exit(red ? 1 : 0)
