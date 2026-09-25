#!/usr/bin/env node
// CLAIM — AN AT-GRADE EXPRESSWAY'S EDGE FOLLOWS ITS SPEED (q-atgrade-expressway-edge).
//
// Both manuals take the vertical curb away at speed: Caltrans at posted ≥ 40 mph (f-caltrans-curb-avoided-40mph),
// MassDOT above 45 mph design (f-massdot-sloped-edging-over-45). The span's speed is resolved by the REAL
// `cartograph/speedContext.mjs` (posted maxspeed → statutory default by context → [U]) — imported, never restated.
// ASSERTS, per scene with a skeleton, raw OSM and a baked shape:
//   · every block edge owned by a span whose edge is `curb` carries a curb (sampled half a curb width inside the
//     edge, against the curb band the REAL painter `sectionPassProtoTile` paints for that frozen tile);
//   · every block edge owned by a span whose edge is `shoulder` carries NO curb;
//   · a `speed` stamped on the ribbons by the pour agrees with the live derivation (else the pour is stale).
// An edge shorter than one curb width is not judged (no room for the sample). A `[U]` span is printed, not judged.
//
//   node checks/claims-expressway-edge-follows-speed.mjs [scene…] [--shape=path] [--expect=curb|shoulder]
//
// MUTATION (must go red): `--expect=shoulder` on huron — its spans are drawn curbed, so claiming they should be
// shouldered must fail on every span. (The reverse, a shouldered span drawn curbed, is the construction's fixture.)
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'
import { expresswaySpeeds } from '../cartograph/speedContext.mjs'
import { townState } from '../src/cartograph/streetProfiles.js'
import { sectionPassProtoTile } from '../src/lib/tileGround.js'

const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const named = process.argv.slice(2).filter(a => !a.startsWith('--'))
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const DEFAULT_MAP = readFileSync(join(ROOT, 'cartograph/scene.js'), 'utf8').match(/export const DEFAULT_MAP = '([^']+)'/)?.[1]
const ribbonsOf = (s) => s === DEFAULT_MAP ? join(ROOT, 'src/data/ribbons.json') : join(ROOT, 'cartograph/data', s, 'clean/ribbons.json')
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const quiet = (f) => { const o = console.log, w = console.warn; console.log = console.warn = () => {}; try { return f() } finally { console.log = o; console.warn = w } }
let red = false
for (const scene of (named.length ? named : scenes('cartograph/data/<scene>/raw/osm.json'))) {
  const skP = join(ROOT, 'cartograph/data', scene, 'clean/skeleton.json'), osmP = join(ROOT, 'cartograph/data', scene, 'raw/osm.json')
  const shapeP = arg('shape') || join(ROOT, 'public/baked', scene, 'shape.json')
  if (!existsSync(skP) || !existsSync(osmP)) { console.log(`── ${scene}   ⛔ NOT CHECKED — no skeleton or raw OSM`); red = true; continue }
  const osm = readJson(osmP), E = expresswaySpeeds(readJson(skP).streets || [], osm, townState(osm).code)
  if (!E.rows.length) { console.log(`── ${scene}   no at-grade expressway span`); continue }
  if (!existsSync(shapeP)) { console.log(`── ${scene}   ⛔ NOT CHECKED — ${E.rows.length} expressway span(s) but no baked shape`); red = true; continue }
  const want = new Map(E.rows.map(r => [r.id, arg('expect') || r.edge]))
  // the stamp the pour left on the ribbons, if any — it must agree with the live derivation
  const bad = [], notes = []
  const rib = existsSync(ribbonsOf(scene)) ? readJson(ribbonsOf(scene)) : null
  const stamped = new Map((rib?.streets || []).filter(s => s.speed).map(s => [s.skelId, s.speed]))
  if (!stamped.size) notes.push('the ribbons carry no `speed` stamp (poured before 1c723b72) — judged against the live derivation')
  for (const r of E.rows) { const s = stamped.get(r.id); if (s && (s.edge !== r.edge || JSON.stringify(s.candidates) !== JSON.stringify(r.candidates))) bad.push(`${r.id}: the pour stamped ${s.candidates.join('/')} mph ⇒ ${s.edge}, the data now says ${r.candidates.join('/')} mph ⇒ ${r.edge} — re-pour`) }
  // the drawn edge
  const design = existsSync(join(ROOT, 'public/looks', scene, 'design.json')) ? readJson(join(ROOT, 'public/looks', scene, 'design.json')) : {}
  const cw = Number.isFinite(design.curbWidth) ? design.curbWidth : 6 * 0.0254
  const tally = new Map()
  for (const t of readJson(shapeP).tiles || []) {
    const runs = t.runs || []; if (!runs.some(r => want.has(r.skelId))) continue
    const out = quiet(() => sectionPassProtoTile(t, cw, { outer: 'LU', inner: 'SW' }, design.blockCustoms || null))
    const curb = (out.curb || []).filter(r => r?.length >= 3)
    ;(t.iaFull || []).forEach((ring, ri) => ring.forEach((a, i) => {
      const k = runs[t.iaStamp?.[ri]?.[i]]?.skelId; if (!want.has(k)) return
      const b = ring[(i + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < cw) return
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L
      const s = t.iaFull.some(g => g?.length >= 3 && pip(mx + nx * cw / 2, mz + nz * cw / 2, g)) ? 1 : -1
      const hit = curb.some(g => pip(mx + s * nx * cw / 2, mz + s * nz * cw / 2, g))
      const e = tally.get(k) || { n: 0, curbed: 0 }; e.n++; if (hit) e.curbed++; tally.set(k, e)
    }))
  }
  const rows = []
  for (const r of E.rows) {
    const w = want.get(r.id), t = tally.get(r.id) || { n: 0, curbed: 0 }
    rows.push(`${r.id}: ${r.candidates.length ? r.candidates.join(' or ') + ' mph' : '[U]'} (${r.basis}) ⇒ ${w} · drawn: ${t.curbed}/${t.n} edges curbed`)
    if (w === '[U]') continue
    if (!t.n) { bad.push(`${r.id}: no block edge owned by this span in the shape — nothing to judge`); continue }
    if (w === 'curb' && t.curbed < t.n) bad.push(`${r.id}: ${t.n - t.curbed} of ${t.n} edges carry NO curb, but its speed keeps the curb`)
    if (w === 'shoulder' && t.curbed > 0) bad.push(`${r.id}: ${t.curbed} of ${t.n} edges carry a CURB, but its speed (${r.candidates.join('/')} mph) takes it away`)
  }
  console.log(`── ${scene} ── ${E.rows.length} expressway span(s) · ${bad.length ? '⛔' : '✅'}`)
  for (const x of rows) console.log(`   ${x}`)
  for (const n of notes) console.log(`   ⚠️ ${n}`)
  for (const b of bad) console.log(`   ⛔ ${b}`)
  if (bad.length) red = true
}
console.log(red ? '\n⛔ An expressway span\'s edge does not follow its speed — or a scene could not be judged.' : '\n✅ Every judged expressway span\'s edge follows its speed.')
process.exit(red ? 1 : 0)
