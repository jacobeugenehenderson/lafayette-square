#!/usr/bin/env node
// T1 (Boz, 2026-10-19): osm2streets-js-node@0.1.4 as an independent oracle for topology CLASSES. Never widths; not a producer.
// Input: out/<town>.osm + out/<town>.clip.geojson (build-xml.mjs). Our side, with authoring loaded, is the derive output
// ribbons.json (ribbonsPath; overlay.json's caps and loop interiors applied); design.json's authoring is corners and widths, which no
// class here reads. JOIN BY IDENTITY, NEVER PROXIMITY (A15): their intersection's osm_node_ids → our welded node (nodes.json,
// exact lon/lat) → its exact x,z → our junction at that exact x,z (cm; weld-check (d): every junction sits on an OSM coord).
// junctionMap nodes carry 0.1 m coordinates, so they are joined by our exact x,z ROUNDED to 0.1 m (a function of the point,
// not a search); a 0.1 m key holding two of our junctions is counted and its sites are left out of that join.
// HEAVY: start ≥70% free, abort <30%.   node --max-old-space-size=4096 scratch/osm2streets-trial/run-trial.mjs <town> [--list]
import fs from 'fs'
import { execSync } from 'child_process'
import { createRequire } from 'module'
import { ribbonsPath } from '../../checks/_scenes.mjs'
const require = createRequire(import.meta.url)
const free = () => +execSync('memory_pressure').toString().match(/free percentage: (\d+)/)[1]
const town = process.argv[2], LIST = process.argv.includes('--list'), OUT = 'scratch/osm2streets-trial/out'
if (!town) { console.log('usage: run-trial.mjs <town>'); process.exit(2) }
const f0 = free(); if (f0 < 70) { console.log(`⛔ ${f0}% free — under 70%, not starting`); process.exit(3) }
const { JsStreetNetwork } = require('./node_modules/osm2streets-js-node/osm2streets_js.js')
const xml = fs.readFileSync(`${OUT}/${town}.osm`, 'utf8'), clip = fs.readFileSync(`${OUT}/${town}.clip.geojson`, 'utf8')
const t0 = Date.now()
const net = new JsStreetNetwork(xml, clip, { debug_each_step: false, dual_carriageway_experiment: false, sidepath_zipping_experiment: false, inferred_sidewalks: false, osm2lanes: false })
const plain = JSON.parse(net.toGeojsonPlain()), json = JSON.parse(net.toJson())
fs.writeFileSync(`${OUT}/${town}.plain.geojson`, JSON.stringify(plain)); fs.writeFileSync(`${OUT}/${town}.network.json`, JSON.stringify(json))
const f1 = free(); console.log(`── ${town}: osm2streets ${((Date.now() - t0) / 1000).toFixed(1)} s · ${f1}% free after · rss ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB`)
if (f1 < 30) { console.log('⛔ under 30% free — aborting before the join'); process.exit(4) }
console.log(`   network JSON top-level keys: ${Object.keys(json).join(', ')}`)
const props = [...new Set(plain.features.map(x => x.properties?.type))]
console.log(`   plain features ${plain.features.length} · types ${JSON.stringify(props)}`)
const H = (a) => a.reduce((m, k) => (m[k] = (m[k] || 0) + 1, m), {})
// ── the join tables
const nodes = new Map(JSON.parse(fs.readFileSync(`${OUT}/${town}.nodes.json`, 'utf8')).map(([id, lon, lat, x, z]) => [String(id), { x, z }]))
const R = JSON.parse(fs.readFileSync(ribbonsPath(town), 'utf8'))
const cm = (x, z) => `${x.toFixed(2)},${z.toFixed(2)}`, dm = (x, z) => `${(Math.round(x * 10) / 10).toFixed(1)},${(Math.round(z * 10) / 10).toFixed(1)}`
const ourJ = new Map((R.junctions || []).map(j => [cm(j.x, j.z), j]))
const ourNT = new Map((R.nameTransitions || []).map(t => [cm(t.x, t.z), t]))
const jmByDm = new Map(), dmCount = new Map()
for (const j of R.junctions || []) { const k = dm(j.x, j.z); dmCount.set(k, (dmCount.get(k) || 0) + 1) }
for (const n of R.junctionMap?.nodes || []) jmByDm.set(dm(n.at[0], n.at[1]), n)
const dmAmbig = [...dmCount.values()].filter(c => c > 1).length
// their intersections, each carried to our exact points through its OSM nodes
const ints = plain.features.filter(x => x.properties?.type === 'intersection')
// ⛔ SCOPE BEFORE CLASS. osm2streets reads every highway way; our junctions are among STREETS (skeleton.streets that reach
// ribbons.json). A site is in scope only when EVERY road meeting there is made of our streets' source ways (by OSM way id);
// any other site is counted by scope and never reported as a class disagreement.
const SK = JSON.parse(fs.readFileSync(`cartograph/data/${town}/clean/skeleton.json`, 'utf8')), live = new Set((R.streets || []).map(s => s.skelId))
const streetWay = new Set(SK.streets.filter(s => live.has(s.id)).flatMap(s => s.sources || []).map(String))
const roadsById = new Map((json.roads || []).map(([id, r]) => [id, r])), intsById = new Map((json.intersections || []).map(([id, i]) => [id, i]))
const scopeOf = (id) => { const rs = (intsById.get(id)?.roads || []).map(r => roadsById.get(r)).filter(Boolean)
  if (!rs.length) return 'no roads'; const ours = rs.map(r => (r.osm_ids || []).every(w => streetWay.has(String(w))))
  return ours.every(Boolean) ? 'streets' : ours.some(Boolean) ? 'mixed' : 'not ours' }
const theirs = ints.map(x => { const p = x.properties, ids = (p.osm_node_ids || []).map(String)
  const pts = ids.map(id => nodes.get(id)).filter(Boolean)
  return { kind: p.intersection_kind ?? p.kind ?? null, control: p.control ?? null, ids, pts, unmapped: ids.length - pts.length, id: p.id, scope: scopeOf(p.id),
    deg: (intsById.get(p.id)?.roads || []).length, ways: (intsById.get(p.id)?.roads || []).flatMap(r => roadsById.get(r)?.osm_ids || []).map(String) } })
const chainOfWay = new Map(SK.streets.filter(s => live.has(s.id)).flatMap(s => (s.sources || []).map(w => [String(w), s.id])))
const inWays = new Set(xml.match(/<way id="(\d+)"/g).map(m => m.slice(9, -1))), outWays = new Set([...roadsById.values()].flatMap(r => r.osm_ids || []).map(String))
const dropped = [...inWays].filter(w => !outWays.has(w)), droppedStreet = dropped.filter(w => streetWay.has(w))
console.log(`   input ways ${inWays.size} · in their roads ${outWays.size} · dropped ${dropped.length} (clip, or their own skips) · of which our street sources ${droppedStreet.length}${droppedStreet.length ? `: ${droppedStreet.slice(0, 12).join(', ')}` : ''}`)
console.log(`   their intersections by scope: ${JSON.stringify(H(theirs.map(t => t.scope)))}`)
// ⛔ BOTH SIDES INSIDE THE EXTENT. They clip at it; our live streets run past it (counted). A site outside is no comparison.
const EXT = JSON.parse(fs.readFileSync(`cartograph/data/${town}/neighborhood_boundary.json`, 'utf8')).boundary
const pip = (x, z, r) => { let w = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) w = !w } return w }
const inside = (p) => pip(p.x, p.z, EXT)
console.log(`   our live streets with a point outside the Extent: ${(R.streets || []).filter(s => s.points.some(([x, z]) => !pip(x, z, EXT))).length} of ${(R.streets || []).length}`)
// the ways at each node (raw, exact lon/lat → its x,z) — so a site can say "a way of ours here is missing from their input"
const raw = JSON.parse(fs.readFileSync(`cartograph/data/${town}/raw/osm.json`, 'utf8')), waysAt = new Map()
for (const w of raw.ground?.highway || []) for (const c of w.coords || []) { const k = `${c.x.toFixed(2)},${c.z.toFixed(2)}`; let e = waysAt.get(k); if (!e) waysAt.set(k, e = new Set()); e.add(String(w.osmId)) }
const droppedSet = new Set(droppedStreet), closedSkip = droppedStreet.filter(w => { const g = (raw.ground.highway || []).find(x => String(x.osmId) === w); return g && inside(g.coords[0]) && g.coords.length > 2 && g.coords[0].lon === g.coords.at(-1).lon && g.coords[0].lat === g.coords.at(-1).lat })
console.log(`   our street ways missing from their roads INSIDE the Extent: ${droppedStreet.filter(w => { const g = (raw.ground.highway || []).find(x => String(x.osmId) === w); return g && g.coords.some(inside) }).length} (closed ways — a loop: ${closedSkip.length})`)
const lacks = (p) => [...(waysAt.get(`${p.x.toFixed(2)},${p.z.toFixed(2)}`) || [])].some(w => droppedSet.has(w)) ? ' ⟂ a street way of ours here is not in their roads' : ''
console.log(`   their intersections ${theirs.length} · kinds ${JSON.stringify(H(theirs.map(t => t.kind)))} · with no OSM node id ${theirs.filter(t => !t.ids.length).length} · node ids not in our weld ${theirs.reduce((s, t) => s + t.unmapped, 0)} · consolidated (>1 node) ${theirs.filter(t => t.ids.length > 1).length}`)
console.log(`   our junctions ${ourJ.size} · kinds ${JSON.stringify(H([...ourJ.values()].map(j => j.kind)))} · junctionMap nodes ${R.junctionMap?.nodes?.length ?? 0} · 0.1 m keys holding two junctions ${dmAmbig}`)
const ourAt = (pt) => { const j = ourJ.get(cm(pt.x, pt.z)), n = (dmCount.get(dm(pt.x, pt.z)) || 0) > 1 ? null : jmByDm.get(dm(pt.x, pt.z)), t = ourNT.get(cm(pt.x, pt.z))
  return { j, n, t, label: j ? j.kind : t ? 'nameTransition' : n ? `jm:${n.kinds.join('+')}` : 'none' } }
const site = (pt) => `(${pt.x.toFixed(1)}, ${pt.z.toFixed(1)})`
const show = (rows) => (LIST ? rows : rows.slice(0, 6)).map(r => `      ${r}`).join('\n') + (!LIST && rows.length > 6 ? `\n      … ${rows.length - 6} more (--list)` : '')
// ── crosstab: their kind × what we hold at the same OSM node
const X = {}; for (const t of theirs.filter(t => t.scope === 'streets')) for (const pt of t.pts.filter(pt => pip(pt.x, pt.z, EXT))) { const k = `${t.kind} × ${ourAt(pt).label}`; X[k] = (X[k] || 0) + 1 }
console.log(`\n   their intersection_kind × ours at the same node (per node; in scope — every road there is our streets'):`); for (const [k, v] of Object.entries(X).sort((a, b) => b[1] - a[1])) console.log(`      ${String(v).padStart(5)}  ${k}`)
// ── class rows
const theirsAt = new Map(); for (const t of theirs) for (const pt of t.pts) theirsAt.set(cm(pt.x, pt.z), t)
for (const t of theirs) t.pts = t.pts.filter(inside)
const ourIn = (j) => inside(j)
const row = (title, a, b) => { console.log(`\n   ${title}: agree ${a.agree} · theirs only ${a.only.length} · ours only ${b.length}`)
  if (a.only.length) console.log(`     theirs only:\n${show(a.only)}`); if (b.length) console.log(`     ours only:\n${show(b)}`) }
// (1) Terminus vs our dead ends (junction kind deadend) and caps (a street end of degree 1, with its cap)
const capAt = new Map(); for (const s of R.streets || []) for (const e of ['start', 'end']) { const c = s.caps?.[e]; if (c?.degree === 1) { const p = e === 'start' ? s.points[0] : s.points.at(-1); capAt.set(dm(p[0], p[1]), `${s.skelId}:${e}:${c.cap}`) } }
{ const T = theirs.filter(t => t.kind === 'Terminus' && t.scope === 'streets'); let agree = 0; const only = []
  for (const t of T) for (const pt of t.pts) { const o = ourAt(pt); if (o.j?.kind === 'deadend') agree++; else only.push(`${site(pt)} theirs Terminus/${t.deg} · ours ${o.label}${lacks(pt)}${capAt.has(dm(pt.x, pt.z)) ? ` · cap ${capAt.get(dm(pt.x, pt.z))}` : ''}`) }
  const ours = [...ourJ.values()].filter(j => ourIn(j) && j.kind === 'deadend' && theirsAt.get(cm(j.x, j.z))?.kind !== 'Terminus').map(j => `${site(j)} ours deadend${capAt.has(dm(j.x, j.z)) ? ` (cap ${capAt.get(dm(j.x, j.z))})` : ''}${lacks(j)} · theirs ${(() => { const t = theirsAt.get(cm(j.x, j.z)); return t ? `${t.kind}/${t.deg} [${t.scope}]` : 'no intersection at this node' })()}`)
  row('(1) Terminus vs our dead ends (theirs: in scope only)', { agree, only }, ours) }
// (2) Connection vs our through-nodes: a nameTransition, or a junctionMap 'continuation'. ⛔ Neither record sits on the OSM node
// exactly (12 of Huron's 20 nameTransitions are cm off it), so each is joined by IDENTITY: the OSM node its chains' source ways
// SHARE (nameTransition fromId/toId · the node's legs[].chain). More than one shared node = ambiguous, counted and left out.
const wayNodes = new Map(); for (const w of raw.ground?.highway || []) wayNodes.set(String(w.osmId), new Set((w.coords || []).map(c => `${c.x.toFixed(2)},${c.z.toFixed(2)}`)))
const chainSrc = new Map(SK.streets.map(s => [s.id, (s.sources || []).map(String)]))
const nodesOf = (chain) => { const out = new Set(); for (const w of chainSrc.get(chain) || []) for (const k of wayNodes.get(w) || []) out.add(k); return out }
const sharedNode = (chains) => { const cs = [...new Set(chains)]; if (cs.length < 2) return { why: 'one chain' }
  let acc = nodesOf(cs[0]); for (const c of cs.slice(1)) { const b = nodesOf(c); acc = new Set([...acc].filter(k => b.has(k))) }
  return acc.size === 1 ? { k: [...acc][0] } : { why: acc.size ? `${acc.size} shared nodes` : 'no shared node' } }
{ const recs = [...(R.nameTransitions || []).map(t => ({ at: [t.x, t.z], w: 'nameTransition', chains: [t.fromId, t.toId] })),
    // ⛔ a THROUGH-node is geometric degree 2 — a `through` leg is TWO arms, so legs.length is not the degree (CLAUDE.md §4)
    ...(R.junctionMap?.nodes || []).filter(n => n.kinds.includes('continuation') && n.legs.reduce((d, l) => d + (l.end === 'through' ? 2 : 1), 0) === 2).map(n => ({ at: n.at, w: 'jm:continuation', chains: n.legs.map(l => l.chain) }))]
  const jmCont = (R.junctionMap?.nodes || []).filter(n => n.kinds.includes('continuation')), degH = H(jmCont.map(n => n.legs.reduce((d, l) => d + (l.end === 'through' ? 2 : 1), 0)))
  console.log(`\n   (2) our junctionMap 'continuation' nodes by geometric degree: ${JSON.stringify(degH)} — only degree 2 is a through-node`)
  const unjoined = {}, ourK = new Map()
  for (const r of recs) { const s2 = sharedNode(r.chains); if (!s2.k) { unjoined[`${r.w}: ${s2.why}`] = (unjoined[`${r.w}: ${s2.why}`] || 0) + 1; continue }
    const [x, z] = s2.k.split(',').map(Number); if (!pip(x, z, EXT)) continue; const e = ourK.get(s2.k) || { x, z, w: new Set() }; e.w.add(r.w); ourK.set(s2.k, e) }
  console.log(`\n   (2) our through-node records not joinable to one OSM node: ${JSON.stringify(unjoined)}`)
  const T = theirs.filter(t => t.kind === 'Connection' && t.scope === 'streets'); let agree = 0; const only = []
  let inChain = 0
  for (const t of T) for (const pt of t.pts) { const k = cm(pt.x, pt.z); if (ourK.has(k)) { agree++; continue }
    const chains = new Set(t.ways.map(w => chainOfWay.get(w))); if (chains.size === 1 && ourAt(pt).label === 'none') { inChain++; continue }
    only.push(`${site(pt)} theirs Connection/${t.deg} · ours ${ourAt(pt).label} · our chains ${[...chains].join(', ')}${lacks(pt)}`) }
  console.log(`   (2) their in-scope Connection at a node inside ONE of our chains (we weld it — agrees: not a junction): ${inChain}`)
  const ours = [...ourK].filter(([k]) => theirsAt.get(k)?.kind !== 'Connection').map(([k, e]) => { const t = theirsAt.get(k)
    return `${site(e)} ours ${[...e.w].join('+')}${lacks(e)} · theirs ${t ? `${t.kind}/${t.deg} [${t.scope}]` : 'no intersection at this node'}` })
  row('(2) Connection vs our through-nodes (nameTransition · junctionMap continuation), theirs in scope only', { agree, only }, ours) }
// (3) DualCarriageway vs our medians; (4) blocks vs our tiles — only if this build exposes blocks
const blocks = json.blocks ?? json.Blocks ?? null
console.log(`\n   (3) DualCarriageway vs our medians (${(R.medians || []).length}: ${JSON.stringify(H((R.medians || []).map(m => m.kind)))}): ${blocks ? 'blocks present — see below' : 'NOT REACHABLE at 0.1.4 — the network JSON carries no blocks and the JS API has no findAllBlocks'}`)
console.log(`   (4) blocks vs our tiles (ribbons.tiles ${(R.tiles || []).length} · faces ${(R.faces || []).length}): ${blocks ? (Array.isArray(blocks) ? blocks.length : Object.keys(blocks).length) : 'NOT REACHABLE at 0.1.4 (as (3))'}`)
