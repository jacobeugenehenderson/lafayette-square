#!/usr/bin/env node
// claims-every-authored-corner-resolves.mjs — DOES EVERY CORNER THE OPERATOR AUTHORED STILL NAME A CORNER ON THE GROUND?
//
// ⭐ THE CLAIM: a Look's corner authoring is keyed, and a key that names no corner is authoring that reaches nothing,
// silently. The corner-keyed fields are the ones `buildTileGround` / `sectionOpen` read off design.json:
//   · `cornerCornerRadiusOverrides` — per corner, "x,z|skelId:side|skelId:side" (radius, `corner` flag, `cut`), read by
//     `protoCornerKey` (the ease's radius) and through the tile's `iaArcKey` (Section's pads, the curb cuts). It resolves
//     iff some tile's iaArcKey carries it.
//   · `cornerRadiusOverrides` — per junction node, "x,z", read through `protoPairNode`. It resolves iff some tile names a
//     junction at that node (`junctions[].node`) or a two-chain corner key there.
// Against the town's served frozen shape (public/baked/<scene>/shape.json — what the pour that is live built), or
// --shape=<file> for a scratch slab.
// ⛔ An unresolved key FAILS by name. A key in the LEGACY form (leg flags `:f`/`:b`) is named as such; the pour already warns
// that nothing reads it. A town that has authored corners but whose shape carries no iaArcKey (poured before corners were
// keyed) is REFUSED by name — it cannot be judged, so it is never passed. A town with nothing authored has nothing to resolve.
// ⭐ AND EVERY AUTHORED CORNER DRAWS WHAT IT ASKED, OR NAMES WHY NOT (Boz, 2026-10-20) — a synthetic row, built live (no
// town): a 22 m block leg with an authored R 30 m corner, which `easeContour` must ease at half its leg (11 m). The build must
// print THAT corner — its key, the radius asked, the radius drawn, the bounding leg — and must NOT name an unauthored corner
// clamped the same way (that stays a count: the same fixture at cornerRadiusScale 4, nothing authored).
// ⭐ MUTANTS (--mutants): (1) an authored key's node moved 1 m → must fail; (2) the shape loses the arc key an authored
// key resolves to → must fail; (3) the shape loses iaArcKey altogether → must be refused; (4) the per-corner print silenced
// → the synthetic row must fail; (5) the authoring removed → the row, still expecting its named corner, must fail.
//   node checks/claims-every-authored-corner-resolves.mjs [--look=a,b] [--shape=<file> --look=<one>] [--mutants]
// Read-only. Exits 1 on any unresolved key or refused town. Never edits authoring.
import { readFileSync, existsSync } from 'fs'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const idx = JSON.parse(readFileSync('public/looks/index.json', 'utf8')).looks.filter(l => l.scene)
const looks = arg('look') ? idx.filter(l => arg('look').split(',').includes(l.id)) : idx
const LEGACY = /\|[^|]+:[fb]\|[^|]+:[fb]$/   // the pour's own test for the leg-flag form (tileGround.js, PROTO② census)

function judge(design, sh) {
  const per = design.cornerCornerRadiusOverrides || {}, ix = design.cornerRadiusOverrides || {}
  const nAuth = Object.keys(per).length + Object.keys(ix).length
  if (!nAuth) return { nAuth, none: true }
  if (!sh.tiles.some(t => t.iaArcKey)) return { nAuth, refused: 'its shape.json carries no iaArcKey (poured before corners were keyed)' }
  const keys = new Set(), nodes = new Set()
  for (const t of sh.tiles) { for (const m of Array.isArray(t.iaArcKey) ? t.iaArcKey : [t.iaArcKey]) for (const k of Object.values(m || {})) { keys.add(k); const p = k.split('|'); if (p[1]?.split(':')[0] !== p[2]?.split(':')[0]) nodes.add(p[0]) }
    for (const j of t.junctions || []) if (j?.node) nodes.add(j.node) }
  const bad = [...Object.keys(per).filter(k => !keys.has(k)).map(k => ({ field: 'cornerCornerRadiusOverrides', k, legacy: LEGACY.test(k) })),
               ...Object.keys(ix).filter(k => !nodes.has(k)).map(k => ({ field: 'cornerRadiusOverrides', k, legacy: false }))]
  return { nAuth, bad, keys }
}
const say = (look, r) => r.none ? `✅ ${look}: nothing authored (no corner-keyed entries)`
  : r.refused ? `⛔ ${look}: REFUSED — ${r.nAuth} authored corner entr${r.nAuth === 1 ? 'y' : 'ies'}, but ${r.refused}; cannot be judged`
  : `${r.bad.length ? '⛔' : '✅'} ${look}: ${r.nAuth} authored corner entr${r.nAuth === 1 ? 'y' : 'ies'} · resolving ${r.nAuth - r.bad.length} · UNRESOLVED ${r.bad.length}`

let bad = 0
for (const l of looks) {
  const dp = `public/looks/${l.id}/design.json`, sp = arg('shape') || `public/baked/${l.scene}/shape.json`
  if (!existsSync(dp) || !existsSync(sp)) { console.log(`⛔ ${l.id}: REFUSED — ${existsSync(dp) ? sp : dp} is missing`); bad++; continue }
  const design = JSON.parse(readFileSync(dp, 'utf8')), sh = JSON.parse(readFileSync(sp, 'utf8'))
  const r = judge(design, sh)
  if (r.refused || r.bad?.length) bad++
  console.log(say(l.id, r) + (arg('shape') ? ` (against ${sp})` : ''))
  for (const b of r.bad || []) console.log(`      ${b.field} "${b.k}"${b.legacy ? ' — the LEGACY leg-flag form (the pour warns: nothing reads it)' : ' — names no corner on the ground'}`)
  if (process.argv.includes('--mutants') && !r.none && !r.refused) {
    const per = design.cornerCornerRadiusOverrides || {}, k0 = Object.keys(per).find(k => r.keys.has(k))
    if (k0) {
      const [x, z] = k0.split('|')[0].split(',').map(Number), moved = `${(x + 1).toFixed(3)},${z.toFixed(3)}|${k0.split('|').slice(1).join('|')}`
      const m1 = judge({ ...design, cornerCornerRadiusOverrides: { ...per, [moved]: per[k0] } }, sh), red1 = m1.bad.length > r.bad.length
      const sh2 = { tiles: sh.tiles.map(t => ({ ...t, iaArcKey: (Array.isArray(t.iaArcKey) ? t.iaArcKey : [t.iaArcKey]).map(m => Object.fromEntries(Object.entries(m || {}).filter(([, v]) => v !== k0)) ) })) }
      const m2 = judge(design, sh2), red2 = m2.bad.length > r.bad.length
      const m3 = judge(design, { tiles: sh.tiles.map(({ iaArcKey, ...t }) => t) }), red3 = !!m3.refused
      if (!red1 || !red2 || !red3) bad++
      console.log(`   mutant · a key's node moved 1 m: ${red1 ? 'RED, as it must be' : '⛔ still GREEN'} · the shape loses its arc key: ${red2 ? 'RED, as it must be' : '⛔ still GREEN'} · the shape loses iaArcKey: ${red3 ? 'REFUSED, as it must be' : '⛔ still judged'}`)
    } else console.log('   mutant · not run — no resolving per-corner key here to mutate')
  }
}
// ── THE SYNTHETIC ROW: an authored radius the leg cannot hold is drawn smaller AND SAID, per corner ─────────────────────
{
  const { buildTileGround } = await import('../src/lib/tileGround.js')
  const { KIT_CURB_WIDTH } = await import('../src/cartograph/streetProfiles.js')
  const m = { left: { pavementHW: 4, treelawn: 1.5, sidewalk: 1.5, terminal: 'sidewalk' }, right: { pavementHW: 4, treelawn: 1.5, sidewalk: 1.5, terminal: 'sidewalk' } }
  const line = (id, a, b) => ({ skelId: id, name: id, highway: 'residential', oneway: false, points: [a, b], measure: m, gradeSeparated: false })
  // a block 30 m between centrelines, 8 m of pavement off it ⇒ 22 m legs: an eased corner may set back at most 11 m
  const streets = [line('n', [-200, -100], [200, -100]), line('s', [-200, 100], [200, 100]), line('w', [-100, -200], [-100, 200]), line('e', [-70, -200], [-70, 200])]
  const build = (co, scale = 1) => { const lines = [], p = console.log, w = console.warn
    console.log = console.warn = (...a) => lines.push(a.join(' '))
    try { return { g: buildTileGround({ streets }, { curbWidth: KIT_CURB_WIDTH, curbedMinWidth: { m: 1, label: 'fixture' }, smooth: 0, cornerRadiusScale: scale, cornerCornerRadiusOverrides: co }), lines } }
    finally { console.log = p; console.warn = w } }
  const ASK = 30
  // → what is wrong: an authored clamped corner the print does not name (key, asked, drawn, leg), or an unauthored one it does
  const judgeClamp = ({ g, lines }, co, expect) => {
    const named = (c) => lines.some(l => l.includes(`authored corner ${c.key}:`) && l.includes(`asked R ${c.asked.toFixed(2)} m`) && l.includes(`drawn R ${c.vertR.toFixed(2)} m`) && l.includes(`(${c.leg.toFixed(2)} m;`))
    const clamped = g.cornerSet.filter(c => c.leg != null), authored = clamped.filter(c => co?.[c.key] != null)
    const why = []
    for (const c of authored) if (!named(c)) why.push(`authored corner ${c.key} drawn R ${c.vertR.toFixed(2)} of ${c.asked} asked, and the build does not say so`)
    for (const c of clamped.filter(c => co?.[c.key] == null)) if (lines.some(l => l.includes(`authored corner ${c.key}:`))) why.push(`unauthored corner ${c.key} named as authored`)
    if (authored.length < expect) why.push(`${expect} authored clamped corner(s) expected, ${authored.length} found — the fixture no longer clamps`)
    return { why, clamped: clamped.length, authored: authored.length }
  }
  const k0 = build(null).g.cornerSet[0]?.key
  if (!k0) { console.log('⛔ synthetic row: the fixture produced no corner'); bad++ }
  else {
    const CO = { [k0]: ASK }, A = build(CO), r = judgeClamp(A, CO, 1)
    const U = build(null, 4), ru = judgeClamp(U, null, 0)
    const counted = U.lines.some(l => /corner\(s\) eased BELOW their radius/.test(l))
    const ok = !r.why.length && !ru.why.length && ru.clamped > 0 && counted
    if (!ok) bad++
    const c = A.g.cornerSet.find(x => x.key === k0)
    console.log(`${ok ? '✅' : '⛔'} synthetic: an authored R ${ASK} m on a ${c?.leg?.toFixed(0)} m leg is drawn R ${c?.vertR?.toFixed(2)} m and named, by key · unauthored clamps (scale 4): ${ru.clamped}, ${counted ? 'counted' : '⛔ not counted'}, none named`)
    for (const w of [...r.why, ...ru.why]) console.log(`      ⛔ ${w}`)
    if (process.argv.includes('--mutants')) {
      const silenced = { g: A.g, lines: A.lines.filter(l => !l.includes('authored corner ')) }
      const red4 = judgeClamp(silenced, CO, 1).why.length > 0
      const red5 = judgeClamp(build(null), CO, 1).why.length > 0
      if (!red4 || !red5) bad++
      console.log(`   mutant · the per-corner print silenced: ${red4 ? 'RED, as it must be' : '⛔ still GREEN'} · the authoring removed: ${red5 ? 'RED, as it must be' : '⛔ still GREEN'}`)
    }
  }
}
console.log(bad ? '\n⛔ RED — an authored corner names no corner on the ground, a town cannot be judged, or an authored radius is drawn smaller unsaid' : '\n✅ GREEN — every authored corner resolves, and draws what it asked or says why not')
process.exit(bad ? 1 : 0)
