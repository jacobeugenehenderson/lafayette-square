// claims-a-verge-span-edge-is-its-street-edge.mjs — A VERGE BEGINS AT THE CARRIAGEWAY'S EDGE, NEVER ON A STREET'S CENTRELINE.
//
// ⭐ WHY (Boz, 2026-10-21; LS #39): a VERGE block (`classifyHighwayBlocks`, H-3) is bounded by highway runs and by OVERPASS
//   SPANS — a street on a bridge between two highway runs. `mkDepth` gave the span edge depth 0, so ② sat on ①, the street's
//   centreline, and LS Mississippi's west half was painted verge (the stripe straddled it). df0b7a4f gives the span its own
//   roadway's depth. This check holds that, on the LIVE producer: `claims-verge-bare` reads the BAKED shape.json, so a ②
//   change cannot reach it before a re-bake, and it never judges where a verge's span edge sits.
// ⭐ READ, NEVER RESTATED: the shape is the producer's own (`buildProto`, the feed every band check uses), the verge class is
//   the tile's frozen `blockClass`, a span edge is a ① ring edge whose owner is a street run (not `hwy`, not neutral `__…`),
//   and its roadway is that run's own measure (`resolveProtoMeasure`, the exported resolver the painter reads, with the
//   town's authoring). ② is the tile's `iaFull`.
// ⛔ THE GATE: at each span edge's midpoint, ② lies no nearer ① than the roadway (pavementHW − ε, ① sitting ε off the
//   centreline) less one lattice step (`lattice.js`). Deeper is disclosed, not failed (a width-step taper or a flare deepens
//   ②). Edges under 1 m are not judged (a taper's own ends), and said.
//
//   node checks/claims-a-verge-span-edge-is-its-street-edge.mjs [<town> …] [--selftest]
// Exit 1 on any span edge shallower than its roadway, or a town that cannot be judged; 2 only if no town has a verge span.
// ⭐ MUTATION TEST (`--selftest`): the depth-0 rule restored in `mkDepth` (a verge's span edge gets no depth) → RED on every
//   town with a verge span (LS: Mississippi).
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { ROOT } from './_scenes.mjs'
import { LATTICE_M } from '../src/lib/lattice.js'

const argv = process.argv.slice(2), SELF = argv.includes('--selftest')
const segD = (q, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz, u = L ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / L)) : 0; return Math.hypot(q[0] - a[0] - u * dx, q[1] - a[1] - u * dz) }

// one loader per module, each with its own one parameter (checks/tier.mjs follows each import to its source)
const loadFeed = async (feedUrl) => import(feedUrl)
const loadTG = async (tgUrl) => import(tgUrl)

function judge(R, f, resolveProtoMeasure) {
  // ε: the frozen ①'s own (`ribbons.protopolygon.eps`, the mint's PROTO_HW) — ① sits ε off the centreline
  const eps = f.ribbons?.protopolygon?.eps
  if (!(eps >= 0)) return { refused: 'the frozen ① carries no ε (ribbons.protopolygon.eps)' }
  const sites = [], deeper = []; let verges = 0, spans = 0, short = 0
  ;(R.protoShapeTiles || []).forEach((t, ti) => {
    if (t?.blockClass !== 'verge') return; verges++
    const ring = t.ring || [], own = t.ringOwner || [], full = (t.iaFull || []).filter(r => r?.length >= 3)
    for (let i = 0; i < ring.length; i++) {
      const o = own[i]; if (!o || o.kind === 'rim' || String(o.skelId).startsWith('__')) continue
      const run = (t.runs || []).find(r => r.skelId === o.skelId && r.side === o.side && r.segOrd === o.segOrd); if (!run || run.hwy) continue
      const a = ring[i], b = ring[(i + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) { short++; continue }
      spans++
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; let act = Infinity
      for (const r of full) for (let k = 0; k < r.length; k++) act = Math.min(act, segD(m, r[k], r[(k + 1) % r.length]))
      const hw = resolveProtoMeasure(run, f.blockCustoms, f.curbWidth)?.pavementHW
      if (!(hw > 0)) { sites.push({ ti, o, at: m, act, exp: null, why: 'its run resolves no roadway width' }); continue }
      const exp = hw - eps
      if (act < exp - LATTICE_M) sites.push({ ti, o, at: m, act, exp })
      else if (act > exp + LATTICE_M) deeper.push({ ti, o, at: m, act, exp })
    }
  })
  return { verges, spans, short, sites, deeper }
}
const say = (town, r) => {
  if (r.refused) { console.log(`⛔ ${town}: NOT CHECKED — ${r.refused}`); return 'red' }
  if (!r.spans) { console.log(`⚪ ${town}: nothing to judge: ${r.verges} verge tile(s), no span edge ≥ 1 m${r.short ? ` (${r.short} shorter, not judged)` : ''}`); return 'nothing' }
  const bad = r.sites.length
  console.log(`${bad ? '⛔' : '✅'} ${town}: ${r.verges} verge tile(s) · ${r.spans} span edge(s) judged${r.short ? ` · ${r.short} under 1 m not judged` : ''} · ${bad} shallower than its roadway · ${r.deeper.length} deeper (disclosed)`)
  for (const s of r.sites.slice(0, 8)) console.log(`     tile ${s.ti} ${s.o.skelId}|${s.o.side}|${s.o.segOrd} at (${s.at[0].toFixed(1)}, ${s.at[1].toFixed(1)}): ② ${s.act.toFixed(4)} m off ①, its roadway ${s.exp == null ? '—' : s.exp.toFixed(4) + ' m'}${s.why ? ` (${s.why})` : ''}`)
  for (const s of r.deeper.slice(0, 3)) console.log(`     (deeper) tile ${s.ti} ${s.o.skelId}|${s.o.side}|${s.o.segOrd}: ② ${s.act.toFixed(4)} m, roadway ${s.exp.toFixed(4)} m`)
  return bad ? 'red' : 'green'
}

// ⭐ THE MUTANT: one mutated copy of tileGround (the depth-0 rule restored at the top of `mkDepth`), in this run's own temp
// dir, built with the feed's own options (`buildWith`, the same call `buildProto` makes)
const TGF = join(ROOT, 'src/lib/tileGround.js')
const FEEDF = join(ROOT, 'scratch/_proto-feed.mjs')
const ANCHOR = '          if (isHwyLab(L[i])) {'
const DEPTH0 = `          if (blockCls === 'verge' && !isHwyLab(L[i])) return 0\n${ANCHOR}`
const RE_PKG = /from 'clipper-lib'/g
const CLIP = pathToFileURL(join(ROOT, 'node_modules/clipper-lib/clipper.js')).href
const LIB = (m) => pathToFileURL(join(ROOT, 'src/lib', m)).href, SRC = (m) => pathToFileURL(join(ROOT, 'src', m)).href, TOP = (m) => pathToFileURL(join(ROOT, m)).href
const mutantTG = () => { const tgSrc = readFileSync(TGF, 'utf8')
  if (tgSrc.split(ANCHOR).length !== 2) throw new Error('selftest: mkDepth no longer carries its highway branch once — re-aim the mutation')
  const tgPath = join(mkdtempSync(join(tmpdir(), 'verge-span-tg-')), 'tileGround.js')
  writeFileSync(tgPath, tgSrc.replace(ANCHOR, DEPTH0).replace(RE_PKG, `from '${CLIP}'`).replace(/from '\.\/([^']+)'/g, (_, m) => `from '${LIB(m)}'`).replace(/from '\.\.\/([^']+)'/g, (_, m) => `from '${SRC(m)}'`))
  return pathToFileURL(tgPath).href }

const FEED = await loadFeed(pathToFileURL(FEEDF).href)
const TG = await loadTG(pathToFileURL(TGF).href)
const towns = FEED.feedScenes(argv.filter(a => !a.startsWith('--')))
let red = 0, judged = 0, selfBad = 0, selfRan = 0
let MT = null
if (SELF) { const tgCopy = mutantTG()
  MT = await loadTG(tgCopy) }
// the mutant is built the way `buildProto` builds the live shape (scratch/_proto-feed.mjs): the same options, read off the feed
const buildWith = (TGm, f) => TGm.buildTileGround(f.ribbons, { smooth: 0, stencil: f.stencil, curbWidth: f.curbWidth, curbedMinWidth: f.curbedMinWidth,
  blockCustoms: f.blockCustoms, blockLandUse: f.blockLandUse, cornerCornerRadiusOverrides: f.cornerCornerRadiusOverrides,
  cornerRadiusOverrides: f.cornerRadiusOverrides, cornerRadiusScale: f.cornerRadiusScale ?? 1 })
for (const town of towns) {
  const f = FEED.feed(town); if (!f) { console.log(`⛔ ${town}: no feed — NOT CHECKED`); red++; continue }
  const warn = console.warn; console.warn = () => {}
  let R; try { R = FEED.buildProto(f, { quiet: true }) } catch (e) { console.warn = warn; console.log(`⛔ ${town}: the producer refused — ${String(e.message).split('\n')[0].slice(0, 200)}`); red++; continue }
  console.warn = warn
  const r = judge(R, f, TG.resolveProtoMeasure)
  if (!SELF) { const v = say(town, r); if (v === 'red') red++; if (v !== 'nothing') judged++; continue }
  if (!r.spans) { console.log(`  ⚪ ${town}: no verge span edge — the mutant cannot be seen here, said`); continue }
  const log = console.log; console.warn = () => {}; console.log = () => {}; let Rm; try { Rm = buildWith(MT, f) } finally { console.warn = warn; console.log = log }
  const rm = judge(Rm, f, MT.resolveProtoMeasure), caught = rm.sites.length > r.sites.length; selfRan++; if (!caught) selfBad++
  console.log(`  ${caught ? '✅' : '⛔'} ${town}: the depth-0 rule restored → ${rm.sites.length} span edge(s) shallower than their roadway (live: ${r.sites.length})`)
}
if (SELF) { const ok = selfRan && !selfBad; console.log(ok ? '\n✅ selftest: a verge span edge left on its centreline is RED' : '\n⛔ selftest: the instrument missed the depth-0 rule (or no town could show it)'); process.exit(ok ? 0 : 1) }
if (red) { console.log('\n⛔ a verge span edge is shallower than its street\'s roadway (or a town could not be judged)'); process.exit(1) }
if (!judged) { console.log('\n⚪ NOT MEASURED: no town has a verge span edge to judge'); process.exit(2) }
console.log(`\n✅ every verge span edge starts at its street's carriageway edge (${judged} town(s) judged)`)
process.exit(0)
