// MEDIANS — IS THE SPADE THE ADAPTER'S, OR WAS IT ALWAYS THERE? (Wren, 2026-08-14)
//
// The ticket attributes the too-wide, pointed median to the substrate adapter
// feeding the walk's CENTRELINE cycle as tile.ring. ⛔ Before undoing anything,
// measure it — a shape must not be attributed to my code until the flag-off path
// is checked, and derive.js's constructed merge asphalt is checked too.
//
// What the live path already does (tileGround.js):
//   :4143  isDividedMedian = a tile bounded by ≥2 carriageways of one pairKey
//   :4153  tl = 0, sw = 0 for a median tile  ⇒ both ped strips zeroed
//   :2555  st.isMedian ⇒ the whole luRemainder is routed to the 'median' class
// luRemainder is the open-field flood INSIDE iA. ⇒ THE MEDIAN'S PAINTED SHAPE IS
// ALREADY BOUNDED BY iA — the inner curb. There is no new construction to make.
// ⇒ So if a median paints centreline-to-centreline, the question is not "which
//   ring did the adapter feed" but "what did iA get inset BY on the inboard side".
//
//   node scratch/slice2-median-shape.mjs [--ribbons=<path>]
//
// ⛔ LS only. ⛔ Writes nothing.
import { loadScene, banner, ARG } from './_substrate-feed.mjs'

const o = console.log
const S = await loadScene('lafayette-square', ARG('ribbons', null))
banner(S, o)

const quiet = (fn) => { const c = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn() } finally { console.log = c; console.warn = w } }
const { buildTileGround } = await quiet(() => import('../src/lib/tileGround.js'))

const d = S.design
const base = {
  curbWidth: d.curbWidth, blockCustoms: d.blockCustoms || {}, blockLandUse: d.blockLandUse || {},
  cornerRadiusScale: d.cornerRadiusScale, cornerRadiusOverrides: d.cornerRadiusOverrides,
  smooth: 0, emitArtifact: true,
}
const areaOf = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2 }
const ringsArea = (rs) => (rs || []).reduce((s, r) => s + Math.abs(areaOf(r)), 0)

for (const [label, opts] of [['FLAG OFF (frozen tiles)', base], ['FLAG ON (walk tiles)', { ...base, substrateTiles: true }]]) {
  const built = quiet(() => buildTileGround(S.ribbons, opts))
  const art = built._shapeArtifact || []
  const meds = art.filter(t => t.isMedian)
  o(`\n═══ ${label} — ${meds.length} tile(s) flagged isMedian of ${art.length} ═══`)
  if (!meds.length) { o('  (none)'); continue }
  o(`  ${'ring m²'.padStart(10)} ${'iA m²'.padStart(10)} ${'iA/ring'.padStart(8)}   inboard pavementHW per bounding run`)
  let flooded = 0
  for (const t of meds.slice(0, 14)) {
    const ra = Math.abs(areaOf(t.ring)), ia = ringsArea(t.iA)
    const hws = (t.runs || []).map(r => {
      const hw = r.measure?.[r.side]?.pavementHW
      return `${r.skelId}|${r.side}=${Number.isFinite(hw) ? hw.toFixed(2) : 'NONE'}`
    })
    const zero = (t.runs || []).filter(r => !(r.measure?.[r.side]?.pavementHW > 0.01)).length
    if (zero) flooded++
    o(`  ${ra.toFixed(0).padStart(10)} ${ia.toFixed(0).padStart(10)} ${(ra > 0 ? ia / ra : 0).toFixed(3).padStart(8)}   ${hws.slice(0, 4).join(' ')}${hws.length > 4 ? ` …+${hws.length - 4}` : ''}`)
  }
  if (meds.length > 14) o(`  … and ${meds.length - 14} more`)
  o(`  ⭐ median tiles with ≥1 bounding run at pavementHW ≈ 0 ... ${flooded} of ${meds.length}`)
  o(`     A zero inboard half-width means iA does NOT inset on that side, so the`)
  o(`     flood reaches the CENTRELINE — which is the "too wide" report, and it is`)
  o(`     a WIDTH fact, not a ring-species fact.`)
}

// ⚠️ THE TICKET'S OWN WARNING, CHECKED. derive.js still emits constructed merge
// asphalt (nose tapers, crossing windows) at divided transitions — RIBBONS §3.5.
// If it is drawing into the medians, part of the shape on screen is not mine.
o(`\n═══ derive.js's CONSTRUCTED merge asphalt — is it drawing into the medians? ═══`)
{
  const meds = (S.ribbons.medians || [])
  const byKind = new Map()
  for (const m of meds) byKind.set(m.kind, (byKind.get(m.kind) || 0) + 1)
  o(`  ribbons.medians entries ...... ${meds.length}`)
  for (const [k, n] of byKind) o(`     kind '${k}' ... ${n}`)
  const merge = meds.filter(m => m.kind === 'merge' && Array.isArray(m.ring) && m.ring.length >= 3)
  o(`  ⭐ ${merge.length} constructed 'merge' ring(s) — these are ASPHALT, emitted by derive.js,`)
  o(`     and they paint in WHATEVER tile they land in (tileGround :2951-2959).`)
  if (merge.length) {
    const as = merge.map(m => Math.abs(areaOf(m.ring))).sort((a, b) => b - a)
    o(`     areas: max ${as[0].toFixed(0)} · median ${as[Math.floor(as.length / 2)].toFixed(0)} · min ${as[as.length - 1].toFixed(0)} m²`)
    o(`  ⛔ So a nose/taper shape at a divided transition may be derive.js's construction,`)
    o(`     not the walk's face. Attribute before fixing.`)
  }
}
