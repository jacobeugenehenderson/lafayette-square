// MIGRATE a Look's LEGACY per-corner keys (`V|skel:f|skel:b`, leg f/b flags) to the corner key (`ix|skel:side|skel:side`)
// (Sill, 2026-10-07; Boz: "print each one old→new, and make anything that doesn't resolve loud").
// A legacy leg flag says which way the leg LEAVES the node along its street (f = the street's forward direction; the
// arriving leg's flag is written reversed for exactly this). So a legacy entry names the corner between two outgoing
// legs — the sector between their directions — and it maps to the ONE corner at that node, on those two streets,
// whose arc lies inside that sector. Zero or several candidates ⇒ NOT migrated, said by name.
// ⭐ AND THE RUN-KEYED CURB-CUT SLOTS (`blockCustoms[skel][side][segOrd].curbCuts.{end,start}`, retired 2026-10-07): a
// corner's arriving run's `.end` and leaving run's `.start` — read off the tile's own stamp exactly as the painter did —
// become `cut` on the corner's key (`iaArcKey`). A corner whose two slots disagree, or a slot no corner owns: NOT migrated.
//   node scratch/corner-key-migrate.mjs <scene>           dry run: prints old → new
//   node scratch/corner-key-migrate.mjs <scene> --write   rewrites the Look's design.json (only the resolved entries)
import fs from 'fs'
import { feed, buildProto } from './_proto-feed.mjs'
const scene = process.argv[2], write = process.argv.includes('--write')
const f = feed(scene); if (!f) process.exit(1)
const dp = `public/looks/${f.look}/design.json`, design = JSON.parse(fs.readFileSync(dp, 'utf8'))
const map = (design.cornerCornerRadiusOverrides ||= {})
const legacy = Object.keys(map).filter(k => /\|[^|]+:[fb]\|[^|]+:[fb]$/.test(k))
const R = buildProto({ ...f, cornerCornerRadiusOverrides: null }, { quiet: true, protoProducer: true })
// ── the curb-cut slots ──
{ const slotKey = new Map()                       // `skel|side|segOrd|end` → corner key
  for (const t of R.protoShapeTiles || []) (t.iaArc || []).forEach((arc, si) => {
    const n = arc.length, stp = t.iaStamp?.[si] || []
    for (let q = 0; q < n; q++) { const u = arc[q]; if (u == null || arc[(q - 1 + n) % n] === u) continue
      let e = q; for (let k = 0; k < n && arc[(e + 1) % n] === u; k++) e = (e + 1) % n
      const key = t.iaArcKey?.[si]?.[u]; if (!key) continue
      const run = (edge) => { const r = stp[edge]; return r == null ? null : t.runs[r] }
      const a = run((q - 1 + n) % n), b = run(e)
      if (a) slotKey.set(`${a.skelId}|${a.side}|${a.segOrd}|end`, key)
      if (b) slotKey.set(`${b.skelId}|${b.side}|${b.segOrd}|start`, key) } })
  const byCorner = new Map(); let orphan = 0
  for (const [skel, sides] of Object.entries(design.blockCustoms || {})) for (const [side, ords] of Object.entries(sides || {})) for (const [ord, v] of Object.entries(ords || {})) {
    if (!v?.curbCuts) continue
    for (const [end, style] of Object.entries(v.curbCuts)) { const sk = `${skel}|${side}|${ord}|${end}`, key = slotKey.get(sk)
      if (!key) { orphan++; console.log(`  ⛔ slot ${sk} = ${style}  NOT MIGRATED — no corner owns this slot`); continue }
      ;(byCorner.get(key) || byCorner.set(key, []).get(key)).push({ sk, style, v }) } }
  for (const [key, ss] of byCorner) {
    const styles = new Set(ss.map(x => x.style))
    if (styles.size !== 1) { console.log(`  ⛔ ${ss.map(x => x.sk + '=' + x.style).join(' + ')}  NOT MIGRATED — the corner's two slots disagree`); continue }
    const style = ss[0].style
    console.log(`  ✅ ${ss.map(x => 'slot ' + x.sk).join(' + ')} = ${style}  →  ${key} { cut: ${JSON.stringify(style)} }`)
    if (write) { const cur = map[key], e = cur == null ? {} : typeof cur === 'object' ? cur : { r: cur }; map[key] = { ...e, cut: style }
      for (const x of ss) { delete x.v.curbCuts } } }
  if (write) for (const [skel, sides] of Object.entries(design.blockCustoms || {})) {
    for (const [side, ords] of Object.entries(sides || {})) { for (const [ord, v] of Object.entries(ords || {})) if (v && !Object.keys(v).length) delete ords[ord]
      if (!Object.keys(ords || {}).length) delete sides[side] }
    if (!Object.keys(sides || {}).length) delete design.blockCustoms[skel] }
  if (!byCorner.size && !orphan) console.log(`${scene}: no curb-cut slots`)
}
if (!legacy.length) { console.log(`${scene}: no legacy corner keys`); if (write) fs.writeFileSync(dp, JSON.stringify(design, null, 2) + '\n'); process.exit(0) }
const streets = new Map(f.ribbons.streets.map(s => [s.skelId, s]))
const ixKey = (p) => `${(+p[0]).toFixed(3)},${(+p[1]).toFixed(3)}`
// the leg's outward direction at the node: along the street's own chain, forward (f) or backward (b)
const outward = (skel, flag, V) => {
  const pts = streets.get(skel)?.points; if (!pts) return null
  const i = pts.findIndex(p => Math.hypot(p[0] - V[0], p[1] - V[1]) < 0.01); if (i < 0) return null
  const j = flag === 'f' ? i + 1 : i - 1; if (j < 0 || j >= pts.length) return null
  const d = [pts[j][0] - V[0], pts[j][1] - V[1]], l = Math.hypot(d[0], d[1]) || 1; return [d[0] / l, d[1] / l]
}
const cross = (a, b) => a[0] * b[1] - a[1] * b[0]
const inSector = (u, a, b) => { const s = cross(a, b) >= 0 ? 1 : -1; return cross(a, u) * s >= 0 && cross(u, b) * s >= 0 }
let done = 0, refused = 0
for (const k of legacy) {
  const [vk, l1, l2] = k.split('|'), V = vk.split(',').map(Number)
  const [s1, f1] = l1.split(':'), [s2, f2] = l2.split(':')
  // ⛔ The legacy point is the OLD intersection point, centimetres off the skeleton (`junctionMap.at`): never bound by
  // coordinate. Two DIFFERENT streets meet at ONE node — the dial's own ix (`protoPairNode`) — so the corner is found
  // by the street pair; one street on both legs (a bend) has no such identity and is refused.
  if (s1 === s2) { refused++; console.log(`  ⛔ ${k}  NOT MIGRATED — one street on both legs (a bend): the legacy point is not a skeleton vertex, so nothing names which bend`); continue }
  const cands = (R.cornerSet || []).filter(c => [c.legA.split(':')[0], c.legB.split(':')[0]].sort().join() === [s1, s2].sort().join())
  const nodes = [...new Set(cands.map(c => ixKey(c.V)))]
  if (nodes.length !== 1) { refused++; console.log(`  ⛔ ${k}  NOT MIGRATED — the two streets meet at ${nodes.length} node(s)`); continue }
  const N = cands[0].V, d1 = outward(s1, f1, N), d2 = outward(s2, f2, N)
  const hit = (d1 && d2) ? cands.filter(c => { const a = c.fillet?.apex; if (!a) return false; const u = [a[0] - N[0], a[1] - N[1]]; return inSector(u, d1, d2) }) : []
  if (hit.length === 1) { console.log(`  ✅ ${k}  →  ${hit[0].key}  (= ${JSON.stringify(map[k])})`); done++; if (write) { map[hit[0].key] = map[k]; delete map[k] } }
  else { refused++; console.log(`  ⛔ ${k}  NOT MIGRATED — ${!d1 || !d2 ? 'a leg does not leave the node along its street (' + [!d1 && l1, !d2 && l2].filter(Boolean).join(', ') + ')' : `${hit.length} of ${cands.length} corner(s) at the node lie in its sector`}`) }
}
console.log(`${scene}: ${done} migrated · ${refused} NOT migrated (kept, unread, warned at every pour)${write ? ' — written to ' + dp : ' — dry run'}`)
if (write && done) fs.writeFileSync(dp, JSON.stringify(design, null, 2) + '\n')
