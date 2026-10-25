#!/usr/bin/env node
// CLAIM — EVERY ONE-WAY CHAIN RUNS IN TRAVEL ORDER, AND A REVERSED WAY'S TAGS POINT THE WAY IT NOW RUNS.
//
// OSM `oneway=-1` is one-way AGAINST the way's node order. Every reader downstream assumes a one-way's points run the way
// traffic does: skeleton's canonical-direction pass, the divided pairing (`scoreOnewayPair`, anti-parallel tangents),
// derive's `detectDividedStreets`, `OneWayArrows.jsx` (a chevron per segment, pts[i] → pts[i+1]), `tileGround#
// highwayEndContact` (`x.at === want`) and the highway shoulders. So the pour makes it an INVARIANT at intake
// (`src/cartograph/streetClass.js#travelOrdered`, Zob's ruling (A), Boz 2026-10-25): a −1 way is reversed as it is read,
// its way-relative tags flipped with it (`:left`↔`:right`, `:forward`↔`:backward`, sidewalk/cycleway side values,
// `incline`), and it becomes `oneway=yes`. Before it, −1 read as TWO-WAY (HPDM 15 ways, PTown 1).
//
// THREE PARTS, every one read off the code or the data, never restated:
//   (a) PLANTED — `travelOrdered` on a constructed −1 way: coords reversed, tags flipped, `oneway=yes`, a `yes` way and a
//       two-way untouched; and `highwayEndContact` hands a planted −1 ramp off only once it runs in travel order.
//       MUTANT (in process, always run): an identity `travelOrdered` must make (a) RED, or this check proves nothing.
//   (b) THE INTAKE — the two places the pour reads `ground.highway` for the network (skeleton.js `main`, pipeline.js's
//       `deriveLayers` call) pass it through `travelOrdered`; OneWayArrows draws along `points` order. Source rows.
//   (c) THE DECLARATION AGAINST THE RESULT, per scene: every segment `skeleton.json` attributes (`segmentWays`) to ONE
//       one-way OSM way runs in that way's TRAVEL order (node order for `yes`, reversed for `-1`), by exact vertex
//       identity against `raw/osm.json`'s coords — never by geometry; and a −1 way's carried tags read `oneway=yes`.
//       A segment that spans a way joint (two ways) or was matched only by order is counted, not judged.
//
//   node checks/claims-a-oneway-runs-in-travel-order.mjs [scene…] [--skeleton=<path>]   (--skeleton: one scene's re-pour)
// Exit 1: a planted row, an intake row or a declared segment that is RED, or the mutant that does not go RED.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'
import { travelOrdered, isOneway } from '../src/cartograph/streetClass.js'
import { highwayEndContact } from '../src/lib/tileGround.js'

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const skelOverride = process.argv.find(a => a.startsWith('--skeleton='))?.slice('--skeleton='.length)
let red = 0
const row = (ok, what) => { console.log(`  ${ok ? '✅' : '⛔'} ${what}`); if (!ok) red++ }
const quiet = (f) => { const log = console.log; console.log = () => {}; try { return f() } finally { console.log = log } }

// ── (a) PLANTED ──────────────────────────────────────────────────────────────────────────────────────────────────────
const P = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 20, z: 5 }]
const minus = { osmId: 1, coords: P, tags: { highway: 'residential', oneway: '-1', 'lanes:forward': '0', 'lanes:backward': '2',
  'parking:left': 'lane', 'parking:right': 'no', 'parking:left:orientation': 'parallel', sidewalk: 'left', incline: 'up', 'turn:lanes': 'left|through' } }
const yes = { osmId: 2, coords: P, tags: { highway: 'residential', oneway: 'yes', 'parking:left': 'lane' } }
const two = { osmId: 3, coords: P, tags: { highway: 'residential' } }
function planted(T, label) {
  const before = red
  const [m, y, t] = quiet(() => T([minus, yes, two]))
  const cs = (w) => w.coords.map(p => `${p.x},${p.z}`).join(' ')
  row(cs(m) === '20,5 10,0 0,0', `${label}: a −1 way's coords are reversed into travel order (${cs(m)})`)
  row(m.tags.oneway === 'yes' && isOneway(m.tags), `${label}: it becomes oneway=yes (${m.tags.oneway})`)
  row(m.tags['lanes:forward'] === '2' && m.tags['lanes:backward'] === '0', `${label}: :forward ↔ :backward (lanes:forward ${m.tags['lanes:forward']})`)
  row(m.tags['parking:right'] === 'lane' && m.tags['parking:left'] === 'no' && m.tags['parking:right:orientation'] === 'parallel', `${label}: :left ↔ :right, sub-keys included (parking:right ${m.tags['parking:right']})`)
  row(m.tags.sidewalk === 'right' && m.tags.incline === 'down', `${label}: side values and incline flip (sidewalk ${m.tags.sidewalk}, incline ${m.tags.incline})`)
  row(m.tags['turn:lanes'] === 'left|through', `${label}: turn:lanes is travel-relative and stays`)
  row(y === yes && t === two, `${label}: a yes way and a two-way pass untouched`)
  // the highway handoff: a ramp whose −1 way ends at the town street in NODE order, i.e. it travels away from it, so its
  // TRAVEL start is there; read in travel order the town street's end is where it hands off from
  const at = (w, i) => ({ st: { oneway: isOneway(w.tags) }, at: i === 0 ? 'start' : 'end' })
  const nodeEnd = m.coords[0].x === 20 ? 0 : m.coords.length - 1   // where the planted (20,5) end sits in the result
  const h = highwayEndContact([at(m, nodeEnd)], 'end')
  row(h.kind === 'handoff', `${label}: highwayEndContact hands the −1 ramp off at its travel start (${h.kind})`)
  return red - before
}
console.log('\n(a) planted −1 way')
planted(travelOrdered, 'travelOrdered')
console.log('\n(a) MUTANT — an identity travelOrdered (no reversal) must go RED')
const mutRed = planted((ws) => ws, 'mutant')
red -= mutRed
if (mutRed === 0) { console.log('  ⛔ the mutant stayed GREEN — the planted rows prove nothing'); red++ }
else console.log(`  ✅ the mutant is RED on ${mutRed} row(s), as it must be (not counted against the check)`)

// ── (b) THE INTAKE ───────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n(b) the intake reads the ways through travelOrdered')
const skelSrc = readFileSync(join(ROOT, 'cartograph/skeleton.js'), 'utf8')
const pipeSrc = readFileSync(join(ROOT, 'cartograph/pipeline.js'), 'utf8')
const arrowSrc = readFileSync(join(ROOT, 'src/cartograph/OneWayArrows.jsx'), 'utf8')
const hwReads = skelSrc.split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l) && /ground\?*\.highway/.test(l)).length   // code lines, not comments
row(/const highwaysRaw = travelOrdered\(osm\.ground\?\.highway/.test(skelSrc) && hwReads === 1, `skeleton.js main reads ground.highway once, through travelOrdered (${hwReads} read(s))`)
row(/deriveLayers\(travelOrdered\(snapped\.ground\.highway/.test(pipeSrc), `pipeline.js hands deriveLayers the ways through travelOrdered`)
row(/st\?\.oneway/.test(arrowSrc) && /pts\[i\]\[0\][\s\S]{0,80}pts\[i \+ 1\]\[0\]/.test(arrowSrc), 'OneWayArrows draws each one-way segment along points order (pts[i] → pts[i+1])')

// ── (c) THE DECLARATION AGAINST THE RESULT ───────────────────────────────────────────────────────────────────────────
const key = (p) => `${p.x},${p.z}`
for (const scene of scenes('cartograph/data/<scene>/raw/osm.json')) {
  const skelPath = skelOverride || join(ROOT, `cartograph/data/${scene}/clean/skeleton.json`)
  if (!existsSync(skelPath)) { console.log(`\n(c) ${scene}: ⛔ NOT CHECKED — no skeleton.json`); red++; continue }
  const ways = new Map((readJson(join(ROOT, `cartograph/data/${scene}/raw/osm.json`)).ground?.highway || []).filter(w => isOneway(w.tags)).map(w => [w.osmId, w]))
  const minusN = [...ways.values()].filter(w => w.tags.oneway === '-1').length
  const skel = readJson(skelPath)
  let judged = 0, seam = 0, against = [], spans = 0, byOrder = 0, minusSeen = new Set(), staleTags = []
  for (const s of skel.streets || []) {
    for (const r of s.segmentWays || []) {
      if (r.ways.length !== 1) { spans += r.to - r.from; continue }
      if (r.by === 'order') { byOrder += r.to - r.from; continue }
      const w = ways.get(r.ways[0]); if (!w) continue
      // a vertex's FIRST index along the way; a closed way's start is also its end, so a segment arriving at it reads n − 1
      const idx = new Map(), n = w.coords.length, closed = n > 2 && key(w.coords[0]) === key(w.coords[n - 1])
      w.coords.forEach((p, i) => { if (!idx.has(key(p))) idx.set(key(p), i) })
      const travel = w.tags.oneway === '-1' ? -1 : 1
      if (travel < 0) { minusSeen.add(w.osmId); if (s.ways?.[w.osmId]?.oneway !== 'yes') staleTags.push(`${s.id}@${w.osmId}`) }
      // ⭐ A CLOSED WAY'S START IS INDEX 0 AND n − 1 AT ONCE, so a segment touching it has no index order. A run that closes
      // on itself is judged WHOLE, by winding (the chain's signed area against the way's); a partial run's seam segments are
      // counted, not judged.
      if (closed && key(s.points[r.from]) === key(s.points[r.to])) {
        const sa = (ps) => ps.reduce((t, p, i) => { const q = ps[(i + 1) % ps.length]; return t + p.x * q.z - q.x * p.z }, 0)
        const ca = sa(s.points.slice(r.from, r.to))
        if (new Set(s.points.slice(r.from, r.to).map(key)).size < 3 || !ca) { seam += r.to - r.from; continue }   // simplified to a needle: no winding to read
        judged++
        if (Math.sign(ca) !== travel * Math.sign(sa(w.coords.slice(0, n - 1)))) against.push(`${s.id}[${r.from}–${r.to}] on closed way ${w.osmId} (oneway=${w.tags.oneway}), by winding`)
        continue
      }
      for (let i = r.from; i < r.to; i++) {
        const a = idx.get(key(s.points[i])), b = idx.get(key(s.points[i + 1]))
        if (a == null || b == null) continue
        if (closed && (a === 0 || b === 0)) { seam++; continue }
        judged++
        if (Math.sign(b - a) !== travel) against.push(`${s.id}[${i}] on way ${w.osmId} (oneway=${w.tags.oneway})`)
      }
    }
  }
  console.log(`\n(c) ${scene}: ${ways.size} one-way way(s), ${minusN} of them −1 · ${judged} segment(s) judged by exact vertex identity · ${spans} spanning a way joint and ${byOrder} matched by order and ${seam} at a closed way's seam or on a needle loop (not judged) · ${minusSeen.size} −1 way(s) reached a chain`)
  row(!against.length, `every judged one-way segment runs in travel order${against.length ? ` — ${against.length} AGAINST: ${against.slice(0, 6).join(' · ')}${against.length > 6 ? ' …' : ''}` : ''}`)
  row(!staleTags.length, `every −1 way's carried tags read oneway=yes${staleTags.length ? ` — ${staleTags.length} still −1: ${staleTags.slice(0, 6).join(' · ')}` : ''}`)
}

console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ every one-way chain runs in travel order')
process.exit(red ? 1 : 0)
