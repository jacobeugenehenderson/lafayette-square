// count.mjs <scene> [--corners] — traffic signals bound to junctions BY IDENTITY (the same OSM node: exact lon/lat, as
// curb-cut-evidence.mjs binds crossings), never by distance. A signal node (`highway=traffic_signals`, or a crossing node with
// `crossing=traffic_signals`, from raw/osm.json `pois`) is:
//   JUNCTION   a road vertex shared by ways of two or more different skeleton chains (a junction of streets)
//   ROAD       a vertex of one road only (an approach node, or a mid-block signalled crossing)
//   NONE       no road vertex at all
// --corners: the perpendicular corners (the norm the pour would freeze now) whose frozen junction node is a signalled
// junction — the node string matched to the OSM vertex's own scene x,z to 1 cm (the same vertex re-expressed; unmatched counted).
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const scene = process.argv[2], DATA = join('/Users/jacobhenderson/Desktop/lafayette-square.nosync/cartograph/data', scene)   // the main tree's raw data, read only
const ROAD = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service', 'living_street', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'road', 'busway'])
const osm = JSON.parse(readFileSync(join(DATA, 'raw/osm.json'), 'utf8')), skel = JSON.parse(readFileSync(join(DATA, 'clean/skeleton.json'), 'utf8'))
const skelOf = new Map(); for (const s of skel.streets || []) for (const id of s.sources || []) (skelOf.get(id) || skelOf.set(id, new Set()).get(id)).add(s.id)
const key = (c) => `${c.lon},${c.lat}`, at = new Map()
for (const w of osm.ground?.highway || []) if (ROAD.has(w.tags?.highway)) for (const c of w.coords) { const k = key(c); const e = at.get(k) || at.set(k, { chains: new Set(), xz: [c.x, c.z] }).get(k); for (const s of skelOf.get(w.osmId) || []) e.chains.add(s) }
const sig = (osm.pois || []).filter(p => p.osmType === 'node' && (p.tags?.highway === 'traffic_signals' || p.tags?.crossing === 'traffic_signals'))
const T = { junction: 0, road: 0, none: 0 }, J = new Map()
for (const p of sig) { const e = at.get(key(p.coords[0])); if (!e) { T.none++; continue }
  if (e.chains.size >= 2) { T.junction++; J.set(key(p.coords[0]), e) } else T.road++ }
const kind = (p) => p.tags?.highway === 'traffic_signals' ? 'highway=traffic_signals' : 'crossing=traffic_signals'
const byKind = {}; for (const p of sig) byKind[kind(p)] = (byKind[kind(p)] || 0) + 1
console.log(`${scene}: ${sig.length} signal node(s) (${Object.entries(byKind).map(([a, b]) => `${b} ${a}`).join(' · ')}) — on a JUNCTION node ${T.junction} · on one road only ${T.road} · on no road ${T.none} → ${J.size} signalled junction(s)`)
if (process.argv.includes('--corners')) {
  const { feed } = await import('../../_proto-feed.mjs'), { resolveCurbCutNorm } = await import('../../../cartograph/curb-cut-norm.mjs'), { readSources } = await import('../../../cartograph/sources.js')
  const { buildTileGround } = await import('../../../src/lib/tileGround.js')
  const f = feed(scene), src = readSources(scene), nm = resolveCurbCutNorm(scene, src.declared ? src.state : null)
  const pl = console.log, pw = console.warn; console.log = () => {}; console.warn = () => {}
  const R = buildTileGround({ ...f.ribbons, curbCutNorm: nm }, { grout: 'proto', smooth: 0, stencil: f.stencil, curbWidth: f.curbWidth, curbedMinWidth: f.curbedMinWidth, blockCustoms: f.blockCustoms, blockLandUse: f.blockLandUse, cornerCornerRadiusOverrides: f.cornerCornerRadiusOverrides, cornerRadiusOverrides: f.cornerRadiusOverrides, cornerRadiusScale: f.cornerRadiusScale ?? 1, protoProducer: true })
  console.log = pl; console.warn = pw
  const sigXZ = [...J.values()].map(e => e.xz)
  const perp = (R.curbCutRecs || []).filter(r => r.style === 'perpendicular')
  const corners = new Map(); for (const r of perp) corners.set(`${r.tile}|${r.si}|${r.arc}`, r)
  let touched = 0, noNode = 0; const hitJ = new Set()
  for (const r of corners.values()) { if (!r.node) { noNode++; continue }
    const [x, z] = r.node.split(',').map(Number), i = sigXZ.findIndex(([a, b]) => Math.abs(a - x) < 0.01 && Math.abs(b - z) < 0.01)
    if (i >= 0) { touched++; hitJ.add(i) } }
  console.log(`  perpendicular corners: ${corners.size} · at a signalled junction ${touched} (${hitJ.size} of ${J.size} signalled junctions matched to a corner's frozen node) · corners with no frozen node ${noNode}`)
  // ⭐ THE SECOND PATH: a crossing WAY tagged crossing=traffic_signals whose landed end falls on the corner's arc — the pour's
  // own crossing binding (the corner-style run's per-corner rows, 37c3201b, joined by the corner's key), not a distance
  const sigWays = new Set((osm.ground?.highway || []).filter(w => w.tags?.footway === 'crossing' && (w.tags?.crossing === 'traffic_signals' || w.tags?.['crossing:signals'] === 'yes')).map(w => w.osmId))
  let rowsBy = new Map(); try { rowsBy = new Map(JSON.parse(readFileSync(join(ROOT, '../../../scratch/ground-budget/corner-style/out', scene + '.json'), 'utf8')).rows.map(r => [r.key, r])) } catch { console.log('  ⛔ no corner-style rows for this town — the way path is NOT measured') }
  const nodeHit = new Set(); for (const [k, r] of corners) if (r.node) { const [x, z] = r.node.split(',').map(Number); if (sigXZ.some(([a, b]) => Math.abs(a - x) < 0.01 && Math.abs(b - z) < 0.01)) nodeHit.add(k) }
  let arcHit = 0, tanHit = 0, either = 0, union = 0, joined = 0
  for (const c of (R.curbCutCorners || []).filter(c => c.wedge)) { const k = `${c.tile}|${c.si}|${c.arc}`; if (!corners.has(k)) continue
    const row = c.key ? rowsBy.get(c.key) : null; if (!row) continue; joined++
    const a = row.xwalkEnds.some(e => e.kind === 'arc' && sigWays.has(e.osmId)), t = row.xwalkEnds.some(e => e.kind !== 'arc' && sigWays.has(e.osmId))
    if (a) arcHit++; if (t && !a) tanHit++; if (a || t) either++; if (a || t || nodeHit.has(k)) union++ }
  console.log(`  way path: ${sigWays.size} signalled crossing way(s) · of ${joined} perpendicular corners joined to their rows: an end ON the arc ${arcHit} · only near a tangent ${tanHit} · either ${either} · node path OR way path ${union}`)
}
