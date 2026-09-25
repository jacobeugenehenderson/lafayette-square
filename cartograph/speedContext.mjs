// ⭐⭐ THE SPEED A SPAN IS DRAWN FOR, AND THE EDGE IT GETS (q-atgrade-expressway-edge, q-statutory-speed-default).
//
// Both manuals key an at-grade expressway's edge on SPEED: Caltrans avoids curb at posted ≥ 40 mph
// (f-caltrans-curb-avoided-40mph); MassDOT puts no vertical curb above 45 mph design speed
// (f-massdot-sloped-edging-over-45). The kit carries no speed, so it is RESOLVED here, per chain, from data we hold:
//   1. POSTED — OSM `maxspeed` on the chain's OWN source ways (`osmIds`, never proximity);
//   2. else STATUTORY — the state's prima facie limit for the chain's context (Boz's ruling, 2026-09-24:
//      codes first, never a guess): OH ORC 4511.21 (f-orc-prima-facie-speeds), MA MGL c.90 §17
//      (f-mgl-prima-facie-speeds). The context predicates come from the town's own data:
//        · inside a municipal corporation — every vertex inside an OSM admin_level-8 boundary;
//        · a LEGAL expressway — ORC 4511.01(ZZ) (f-orc-expressway-legal-definition): "an excess of fifty per
//          cent of all crossroads separated in grade", COUNTED on the facility (`crossroadSeparation`);
//        · state-route status of a U.S. route, a business district, a thickly settled district — not held: [U];
//   3. else [U].
// A predicate we cannot decide leaves SEVERAL candidate speeds; the edge is still decided when every candidate
// falls on the same side of the governing threshold, and is [U] (printed, the construction unchanged) otherwise.
// ⛔ No fallback speed, no constant speed: every number here is quoted from a statute read into references/.
//
//   node cartograph/speedContext.mjs <scene>      (the ZZ crossroad test + every expressway span's speed and edge)

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const XY = (p) => Array.isArray(p) ? p : [p.x, p.z]
const K = (p) => XY(p).map(v => (+v).toFixed(2)).join(',')
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = XY(r[i]), [xj, zj] = XY(r[j]); if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const crosses = (a, b, c, d) => { const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0]; if (!den) return false
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den; return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6 }
const HWY = /^(motorway|trunk)(_link)?$/
const nameOf = (s) => s.tags?.name || s.name || s.id
const offGrade = (s) => !!(s.bridge || s.tunnel || (s.layer | 0) !== 0)
export const isExpresswayChain = (s) => s?.tags?.expressway === 'yes' && !s.gradeSeparated && !HWY.test(s.highway || '')

// expressway=yes chains joined by shared vertices → facilities
export function expresswayFacilities(streets) {
  const ex = streets.filter(isExpresswayChain), at = new Map()
  ex.forEach((s, i) => s.points.forEach(p => { const k = K(p); if (!at.has(k)) at.set(k, []); at.get(k).push(i) }))
  const comp = new Array(ex.length).fill(-1); let n = 0
  for (let i = 0; i < ex.length; i++) { if (comp[i] >= 0) continue; const st = [i]; comp[i] = n
    while (st.length) { const j = st.pop(); for (const p of ex[j].points) for (const k of at.get(K(p))) if (comp[k] < 0) { comp[k] = n; st.push(k) } } n++ }
  return [...Array(n)].map((_, c) => ex.filter((_, i) => comp[i] === c))
}

// ORC 4511.01(ZZ)'s predicate, counted on one facility. A CROSSROAD is another road meeting or crossing it — not a
// ramp/connector (`*_link`), not a motorway/trunk (an interchange or the freeway it hands off to), and not a chain
// carrying the facility's own `ref` at one of its END vertices (the road it continues as).
//   at grade   — shares a facility vertex, on grade;   separated — crosses a facility segment with no shared vertex,
//   off grade (bridge/tunnel/layer);   CONTRADICTORY — off grade yet sharing a vertex, or crossing on grade with no
//   shared vertex: reported by name, and the verdict is [U] only if counting it either way would change the answer.
export function crossroadSeparation(facility, streets) {
  const ids = new Set(facility.map(s => s.id)), refs = new Set(facility.map(s => s.ref).filter(Boolean))
  const v = new Set(), ends = new Set(), segs = []
  const deg = new Map(); for (const s of facility) for (const p of [s.points[0], s.points[s.points.length - 1]]) deg.set(K(p), (deg.get(K(p)) || 0) + 1)
  for (const s of facility) { s.points.forEach(p => v.add(K(p))); for (let i = 0; i + 1 < s.points.length; i++) segs.push([XY(s.points[i]), XY(s.points[i + 1])]) }
  for (const [k, n] of deg) if (n === 1) ends.add(k)
  const road = new Map()                                 // crossroad name → { atGrade, separated, contradictory: [why] }
  const note = (s, kind, why) => { const nm = nameOf(s); let r = road.get(nm); if (!r) road.set(nm, r = { atGrade: false, separated: false, why: [] }); if (kind === 'contradictory') r.why.push(why); else r[kind] = true }
  const skipped = { link: new Set(), highway: new Set(), continuation: new Set() }
  for (const s of streets) {
    if (ids.has(s.id)) continue
    const P = s.points.map(XY), shared = P.filter(p => v.has(K(p)))
    if (/_link$/.test(s.highway || '')) { if (shared.length) skipped.link.add(nameOf(s)); continue }
    if (HWY.test(s.highway || '')) { if (shared.length) skipped.highway.add(nameOf(s)); continue }
    if (s.ref && refs.has(s.ref) && shared.some(p => ends.has(K(p)))) { skipped.continuation.add(nameOf(s)); continue }
    if (shared.length) { if (offGrade(s)) note(s, 'contradictory', `${s.tunnel ? 'tunnel' : s.bridge ? 'bridge' : 'layer ' + s.layer} yet shares a vertex with the facility`); else note(s, 'atGrade'); continue }
    let x = false; for (let i = 0; i + 1 < P.length && !x; i++) x = segs.some(([a, b]) => crosses(a, b, P[i], P[i + 1]))
    if (x) { if (offGrade(s)) note(s, 'separated'); else note(s, 'contradictory', 'crosses on grade with no shared vertex') }
  }
  const rows = [...road].map(([name, r]) => ({ name, ...r, contradictory: r.why.length > 0 }))
  const certainSep = rows.filter(r => r.separated && !r.contradictory && !r.atGrade).length
  const certainAt = rows.filter(r => r.atGrade && !r.contradictory).length
  const unsure = rows.filter(r => r.contradictory).length
  const verdict = (sep, tot) => tot > 0 && sep / tot > 0.5
  const lo = verdict(certainSep, certainSep + certainAt + unsure), hi = verdict(certainSep + unsure, certainSep + certainAt + unsure)
  return { rows, skipped: Object.fromEntries(Object.entries(skipped).map(([k, s]) => [k, [...s]])), separated: certainSep, atGrade: certainAt, contradictory: unsure,
           legalExpressway: certainSep + certainAt + unsure === 0 ? '[U]' : lo === hi ? lo : '[U]' }
}

// admin_level-8 boundaries (municipal corporations) from the town's raw OSM
export function municipalBoundaries(osm) {
  const out = []; const walk = (x) => { if (Array.isArray(x)) return x.forEach(walk); if (!x || typeof x !== 'object') return
    if (x.tags?.admin_level === '8' && x.tags?.boundary === 'administrative' && x.coords?.length >= 3) out.push({ name: x.tags.name || String(x.osmId), outer: x.coords, holes: x.holes || [] })
    for (const [k, v] of Object.entries(x)) if (v && typeof v === 'object' && k !== 'tags') walk(v) }
  walk(osm); return out
}
const insideAll = (P, b) => P.every(p => pip(p[0], p[1], b.outer) && !b.holes.some(h => pip(p[0], p[1], h)))
const insideNone = (P, b) => P.every(p => !pip(p[0], p[1], b.outer) || b.holes.some(h => pip(p[0], p[1], h)))

// the governing curb threshold by the town's state (CA → Caltrans posted ≥ 40; MA → MassDOT design > 45, with the
// posted/statutory speed standing for design — [U]; other → the smaller, `r-manuals-disagree-take-smaller`)
export function edgeThreshold(stateCode) {
  if (stateCode === 'CA') return { mph: 40, atOrAbove: true, cites: ['f-caltrans-curb-avoided-40mph'] }
  if (stateCode === 'MA') return { mph: 45, atOrAbove: false, cites: ['f-massdot-sloped-edging-over-45', '[U] q-atgrade-expressway-edge (MassDOT keys on DESIGN speed; the posted/statutory speed stands for it)'] }
  return { mph: 40, atOrAbove: true, cites: ['f-caltrans-curb-avoided-40mph', 'f-massdot-sloped-edging-over-45', 'r-manuals-disagree-take-smaller'] }
}
const over = (mph, th) => th.atOrAbove ? mph >= th.mph : mph > th.mph

// one chain's speed and edge: { candidates: [mph], basis, cites, unknowns: [..], edge: 'shoulder'|'curb'|'[U]', threshold }
export function resolveSpeed(chain, { waysById, state, municipal, facilityVerdict }) {
  const th = edgeThreshold(state)
  const P = chain.points.map(XY)
  const done = (candidates, basis, cites, unknowns = []) => {
    const e = !candidates.length ? '[U]' : candidates.every(m => over(m, th)) ? 'shoulder' : candidates.every(m => !over(m, th)) ? 'curb' : '[U]'
    return { candidates: [...new Set(candidates)].sort((a, b) => b - a), basis, cites, unknowns, edge: e, threshold: th }
  }
  const tags = (chain.osmIds || []).map(id => waysById.get(String(id))?.tags).filter(Boolean)
  const posted = tags.map(t => t.maxspeed).filter(Boolean)
  if (posted.length) {
    const mph = [...new Set(posted.map(v => /^(\d+)\s*mph$/i.exec(v)?.[1] ?? null))]
    if (posted.length !== tags.length || mph.length !== 1 || mph[0] == null) return done([], '[U]', [], [`posted maxspeed partial or unreadable on its ways: ${JSON.stringify(posted)}`])
    return done([+mph[0]], 'posted', ['OSM maxspeed'])
  }
  const inMuni = municipal.find(b => insideAll(P, b)), outAll = municipal.every(b => insideNone(P, b))
  if (state === 'OH') {
    if (inMuni) {
      const U = [`inside the municipal corporation ${inMuni.name}`]
      if (facilityVerdict === true) return done([50], 'statutory', ['f-orc-prima-facie-speeds (B)(4)', 'f-orc-expressway-legal-definition'], U)
      const rest = [35, 25], why = [...U, '[U] a U.S. route as a "state route" (4511.01(JJ)) and the business district (4511.01(NN)) are not held: (B)(3) 35 or (B)(2) 25']
      if (facilityVerdict === false) return done(rest, 'statutory', ['f-orc-prima-facie-speeds (B)(2)/(B)(3)', 'f-orc-expressway-legal-definition'], why)
      return done([50, ...rest], 'statutory', ['f-orc-prima-facie-speeds'], [...why, '[U] legal-expressway test undecided'])
    }
    if (outAll && municipal.length) return done([55], 'statutory', ['f-orc-prima-facie-speeds (B)(5)'], ['outside every municipal corporation in the town data'])
    return done([], '[U]', ['f-orc-prima-facie-speeds'], [municipal.length ? 'straddles a municipal boundary' : 'no municipal boundary in the town data'])
  }
  if (state === 'MA') {
    // "thickly settled" is not held: inside 30, outside 50 on a divided highway (a one-way carriageway), else 40
    return done([30, chain.oneway ? 50 : 40], 'statutory', ['f-mgl-prima-facie-speeds'], ['[U] thickly settled / business district not held'])
  }
  return done([], '[U]', [], [`no statute registered for state ${state ?? '(unknown)'}`])
}

// every expressway span of a town → rows, facilities (for the pour's disclosure and the CLI)
export function expresswaySpeeds(streets, osm, state) {
  const waysById = new Map((osm.ground?.highway || []).map(w => [String(w.osmId), w]))
  const municipal = municipalBoundaries(osm)
  const facilities = expresswayFacilities(streets).map(f => ({ chains: f, test: crossroadSeparation(f, streets) }))
  const rows = facilities.flatMap(F => F.chains.map(c => ({ id: c.id, name: nameOf(c), ...resolveSpeed(c, { waysById, state, municipal, facilityVerdict: F.test.legalExpressway }) })))
  return { facilities, rows, municipal: municipal.map(b => b.name) }
}

// CLI — the committed command for the ZZ test and the per-span speeds
if (import.meta.url === `file://${process.argv[1]}`) {
  const scene = process.argv[2]
  if (!scene) { console.error('usage: node cartograph/speedContext.mjs <scene>'); process.exit(2) }
  const root = join(import.meta.dirname, '..')
  const sk = JSON.parse(readFileSync(join(root, 'cartograph/data', scene, 'clean/skeleton.json'), 'utf8')).streets
  const osm = JSON.parse(readFileSync(join(root, 'cartograph/data', scene, 'raw/osm.json'), 'utf8'))
  const { townState } = await import('../src/cartograph/streetProfiles.js')
  const state = townState(osm).code
  const R = expresswaySpeeds(sk, osm, state)
  console.log(`── ${scene} ── state ${state ?? '[U]'} · municipal boundaries: ${R.municipal.join(', ') || 'NONE'} · ${R.facilities.length} expressway facility/ies`)
  for (const [i, F] of R.facilities.entries()) {
    const t = F.test
    console.log(`\n facility ${i + 1}: ${F.chains.map(c => c.id).join(' ')}`)
    console.log(`   ZZ crossroads: at grade ${t.atGrade} · separated ${t.separated} · contradictory ${t.contradictory} ⇒ legal expressway: ${t.legalExpressway}`)
    for (const r of t.rows) console.log(`     ${r.contradictory ? '⛔ CONTRADICTORY' : r.separated ? 'separated' : 'at grade'} — ${r.name}${r.why.length ? ' (' + r.why.join('; ') + ')' : ''}`)
    for (const [k, v] of Object.entries(t.skipped)) if (v.length) console.log(`     not a crossroad (${k}): ${v.join(', ')}`)
  }
  console.log('\n span · speed · basis · edge (threshold)')
  for (const r of R.rows) console.log(`   ${r.id.padEnd(14)} ${r.candidates.length ? r.candidates.join(' or ') + ' mph' : '[U]'} · ${r.basis} · ${r.edge} (${r.threshold.atOrAbove ? '≥' : '>'} ${r.threshold.mph})${r.unknowns.length ? '\n        ' + r.unknowns.join('\n        ') : ''}`)
}
