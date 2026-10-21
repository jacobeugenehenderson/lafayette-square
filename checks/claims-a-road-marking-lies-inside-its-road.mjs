// claims-a-road-marking-lies-inside-its-road.mjs — EVERY ROAD MARKING THE GROUND PAINTS LIES ON THE ROAD.
//
// ⭐ WHY (Boz, 2026-10-21, LS #39): Mississippi Avenue's centre stripe straddles the block edge at (137.7, 423.5)→
//   (140.5, 406.0): its west half lies on lifted verge, because the stripe is struck from the street's centreline
//   (`bake-ground.js#centreStripeRings`) and never reads where the road was actually painted. Paint on the wrong ground
//   is a defect whatever the kerb does with it, so it is judged here, by itself.
// ⭐ READ, NEVER RESTATED: the markings and the road are the ground bake's own paint stack, exactly as the flatten receives
//   it (`bakeGround({ stackOnly: true })`): the marking groups are every `mat:` group the bake paints as a marking on the
//   carriageway — `stripe` (centre stripes), `edgeline` (parking-lane lines), `bikelane`, `crosswalk` — and the road is
//   `mat:asphalt` ∪ `mat:highway`. A marking group absent from a town is said, never assumed.
// ⛔ THE GATE: each piece of a marking's ground lying outside the road is judged by its own THICKNESS (2 × area ÷ perimeter):
//   thicker than one lattice step (`lattice.js`) is paint off the road, thinner is the boolean's own rounding along a shared
//   edge. ⛔ Never a per-ring area allowance: a stripe the length of its street carries metres of perimeter, and Mississippi's
//   0.9 m² off-road half hid under it. Each finding is named with its group, where it lies, and how much. No tolerance
//   picked for a town.
// ⚠️ "Its road" is the town's road, not the marked street's own: a marking over ANOTHER street's carriageway reads as
//   inside. Stated, not judged.
//
//   node checks/claims-a-road-marking-lies-inside-its-road.mjs [<town> …] [--show=n] [--selftest]
// Exit 1 on any finding (or a town that cannot be judged); 2 when no town had a marking to judge.
// ⛔ A TOWN THAT PAINTS NO MARKING IS NEVER GREEN (Boz, 2026-10-21): its verdict reads "⚪ nothing to judge: no road marking
//   painted" and it counts as not measured. A ✅ over an empty set is a plausible-looking success (Huron, 2026-10-21).
// TIER: local-effect, honestly: it imports cartograph/bake-ground.js (whose closure can write); `stackOnly` writes nothing.
// ⭐ MUTATION TEST (`--selftest`, in memory, on each town's own stack): a real stripe moved 20 m sideways → found;
//   an asphalt piece with no holes offered as a marking (on the road by construction) → not found; the town's markings
//   all removed → "nothing to judge", never GREEN.
// MUTATION (must go red, in the source): give a verge block's span edge depth 0 again in tileGround.js's `mkDepth`
//   (`if (blockCls === 'verge' && !isHwyLab(L[i])) return 0`) — LS reads RED on Mississippi's stripe at (139.0, 415.3), its
//   west half on verge (Truss, 2026-10-21, at f9c5b630). ▶ node checks/claims-a-road-marking-lies-inside-its-road.mjs lafayette-square
import clipperLib from 'clipper-lib'
import { CLIP_SCALE, LATTICE_M } from '../src/lib/lattice.js'

const argv = process.argv.slice(2), SELF = argv.includes('--selftest')
const SHOW = Number(argv.find(a => a.startsWith('--show='))?.slice(7) || 6)
const MARKINGS = ['stripe', 'edgeline', 'bikelane', 'crosswalk'], ROAD = ['asphalt', 'highway']
const { Clipper, ClipType, PolyType, PolyFillType } = clipperLib
const C = (r) => r.map(([x, z]) => ({ X: Math.round(x * CLIP_SCALE), Y: Math.round(z * CLIP_SCALE) }))
const ringsOf = (items) => (items || []).flatMap(it => Array.isArray(it?.[0]) && typeof it[0][0] === 'number' ? [it] : it?.outer ? [it.outer, ...(it.holes || [])] : []).filter(r => r?.length >= 3)
const bbOf = (r) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of r) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z) } return [a, b, c, d] }
const meet = (p, q) => p[0] <= q[2] && q[0] <= p[2] && p[1] <= q[3] && q[1] <= p[3]
const perim = (r) => r.reduce((s, p, i) => s + Math.hypot(r[(i + 1) % r.length][0] - p[0], r[(i + 1) % r.length][1] - p[1]), 0)
const areaC = (paths) => Math.abs(paths.reduce((s, p) => s + Clipper.Area(p), 0)) / (CLIP_SCALE * CLIP_SCALE)

// the ground of one marking ring lying outside the road (road rings near it only)
function outsideOf(ring, road) {
  const bb = bbOf(ring), near = road.filter(x => meet(x.bb, bb))
  const c = new Clipper(); c.AddPath(C(ring), PolyType.ptSubject, true)
  for (const x of near) c.AddPath(C(x.r), PolyType.ptClip, true)
  const out = []; c.Execute(ClipType.ctDifference, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  return out
}
function judge(stack) {
  const groups = new Map(stack.map(e => [e.groupKey, ringsOf(e.items)]))
  const road = ROAD.flatMap(k => groups.get('mat:' + k) || []).map(r => ({ r, bb: bbOf(r) }))
  const per = {}, sites = []
  for (const k of MARKINGS) {
    const rs = groups.get('mat:' + k); if (!rs) { per[k] = null; continue }
    const o = per[k] = { rings: rs.length, found: 0, m2: 0 }
    for (const ring of rs) {
      const off = outsideOf(ring, road).filter(p => { const pr = perim(p.map(q => [q.X / CLIP_SCALE, q.Y / CLIP_SCALE])); return pr > 0 && 2 * areaC([p]) / pr > LATTICE_M })
      if (!off.length) continue
      const a = areaC(off); o.found++; o.m2 += a
      const big = off.reduce((m, p) => Math.abs(Clipper.Area(p)) > Math.abs(Clipper.Area(m)) ? p : m, off[0])
      const at = big.reduce((s, q) => [s[0] + q.X / big.length / CLIP_SCALE, s[1] + q.Y / big.length / CLIP_SCALE], [0, 0])
      sites.push({ k, a, at, of: areaC([C(ring)]) }) }
  }
  return { per, sites, road: road.length }
}
// the town's verdict: 'red' (a marking off its road) · 'nothing' (no marking painted: never green) · 'green'
const verdictOf = (r) => r.sites.length ? 'red' : MARKINGS.every(k => !r.per[k]?.rings) ? 'nothing' : 'green'
const print = (town, r) => {
  const v = verdictOf(r)
  if (v === 'nothing') { console.log(`⚪ ${town}: nothing to judge: no road marking painted (road ${r.road} ring(s); ${MARKINGS.join(', ')}: none)`); return v }
  console.log(`${v === 'red' ? '⛔' : '✅'} ${town}: road ${r.road} ring(s) · ` + MARKINGS.map(k => r.per[k] ? `${k} ${r.per[k].found}/${r.per[k].rings} off the road (${r.per[k].m2.toFixed(3)} m²)` : `${k}: none painted`).join(' · '))
  for (const s of r.sites.sort((a, b) => b.a - a.a).slice(0, SHOW))
    console.log(`     ${s.k} at (${s.at[0].toFixed(1)}, ${s.at[1].toFixed(1)}): ${s.a.toFixed(6)} m² of its ${s.of.toFixed(3)} m² lies off the road`)
  return v
}

const { bakeGround } = await import('../cartograph/bake-ground.js')
const { lookFor } = await import('../scratch/_proto-feed.mjs')
const { ribbonScenes } = await import('./_scenes.mjs')
let fail = 0, measured = 0, judged = 0, selfBad = 0
for (const town of ribbonScenes(argv.filter(a => !a.startsWith('--')))) {
  const look = lookFor(town)
  if (!look) { console.log(`⛔ ${town}: no look names this scene (public/looks/index.json) — NOT CHECKED`); fail++; continue }
  const log = console.log, warn = console.warn; console.log = () => {}; console.warn = () => {}
  let st
  try { st = await bakeGround({ look, scene: town, shorePending: true, stackOnly: true }) } finally { console.log = log; console.warn = warn }
  measured++
  if (!SELF) { const v = print(town, judge(st.stackEntries)); if (v === 'red') fail++; if (v !== 'nothing') judged++; continue }
  const bare = judge(st.stackEntries.filter(e => !MARKINGS.some(k => e.groupKey === 'mat:' + k))), empty = verdictOf(bare) === 'nothing'
  console.log(`  ${empty ? '✅' : '⛔'} ${town}: with every marking removed, the verdict is "nothing to judge", never GREEN (${verdictOf(bare)})`)
  if (!empty) selfBad++
  const base = judge(st.stackEntries), stripe = st.stackEntries.find(e => e.groupKey === 'mat:stripe'), asphalt = st.stackEntries.find(e => e.groupKey === 'mat:asphalt')
  if (!stripe || !asphalt || !asphalt.items.some(x => Array.isArray(x?.[0]) || !(x?.holes?.length))) { console.log(`  ⚪ ${town}: no stripe or no asphalt to plant on — selftest not run here, said`); continue }
  const moved = ringsOf(stripe.items)[0].map(([x, z]) => [x + 20, z]), onRoad = (() => { const it = asphalt.items.find(x => Array.isArray(x?.[0]) || !(x?.holes?.length)); return it ? ringsOf([it])[0] : null })()
  const plant = (ring) => st.stackEntries.map(e => e.groupKey === 'mat:stripe' ? { ...e, items: [...e.items, ring] } : e)
  const a = judge(plant(moved)), b = judge(plant(onRoad))
  const caught = a.sites.length > base.sites.length
  const clean = b.sites.length === base.sites.length
  console.log(`  ${caught ? '✅' : '⛔'} ${town}: a stripe moved 20 m off its road is found (${base.sites.length} → ${a.sites.length})`)
  console.log(`  ${clean ? '✅' : '⛔'} ${town}: an asphalt piece (no holes) offered as a marking is not (${base.sites.length} → ${b.sites.length})`)
  if (!caught || !clean) selfBad++
}
if (SELF) { console.log(selfBad || !measured ? '\n⛔ selftest: the instrument missed a planted case' : '\n✅ selftest: a marking off its road is found; one on it is not'); process.exit(selfBad || !measured ? 1 : 0) }
if (!measured) { console.log('⛔ NOT MEASURED — no town could be judged'); process.exit(2) }
if (fail) { console.log(`\n⛔ a road marking lies off its road (or a town could not be judged)`); process.exit(1) }
if (!judged) { console.log('\n⚪ NOT MEASURED: no town painted a road marking, so nothing was judged'); process.exit(2) }
console.log(`\n✅ every road marking lies on the road (${judged} town(s) judged)`)
process.exit(0)
