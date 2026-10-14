// make-trace.mjs — writes tileGround.trace.js + bake-ground.trace.js (never committed) with trace.mjs's hooks planted,
// each anchor asserted once. Run prep-gate.mjs first. Then, from cartograph/, TRACE_OUT=<json> SWAP_MAP=… node --import
// ../scratch/ground-budget/swap.mjs bake-ground.js --look=<t> --scene=<t> --out-dir=<scratch> --shore=pending
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
const here = (f) => fileURLToPath(new URL(f, import.meta.url))
const once = (s, a, b, what) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`make-trace: ${what}: anchor found ${n}×`); return s.replace(a, b) }
let tg = readFileSync(here('../../../src/lib/tileGround.js'), 'utf8')
tg = "import { trTile as _trTile, trRekey as _trRekey, trS4 as _trS4, trRekeyFull as _trRekeyFull } from '" + here('./trace.mjs') + "';\n" + tg
tg = once(tg, "  return {\n    curbCut: inBlock(strips),", `  _trTile(st, () => { const tl = Wp.length ? differenceRings(env, Wp) : env, cb = band(curbOuter, pedOuter)
    return { S0: { pedOuter, luIn, walkFrom: insD(p => F.get(p).walkFromD), walkTo: insD(p => F.get(p).walkToD) },
      S1: { curb: cb, sidewalk: Wp, treelawn: tl, lu: luIn }, S2: { curb: inBlock(cb), sidewalk: inBlock(Wp), treelawn: inBlock(tl), lu: inBlock(luIn) } } })
  return {
    curbCut: inBlock(strips),`, 'sectionPassProtoTile return')
tg = once(tg, "    tlByLu: rekeyByPiece(st, { [key]: inBlock(Wp.length ? differenceRings(env, Wp) : env) }),\n    luByLu: rekeyByPiece(st, { [key]: inBlock(luIn) }),",
  "    tlByLu: _trRekey(st, 'treelawn', rekeyByPiece(st, { [key]: inBlock(Wp.length ? differenceRings(env, Wp) : env) })),\n    luByLu: _trRekey(st, 'lu', rekeyByPiece(st, { [key]: inBlock(luIn) })),", 'rekey')
tg = once(tg, "    for (const k of Object.keys(acc.tl)) treelawnByLu[k] = clip(unionRings(acc.tl[k]))\n    for (const k of Object.keys(acc.lu)) luByClass[k]   = clip(unionRings(acc.lu[k]))\n",
  "    const _t4 = (k, raw) => { const u = unionRings(raw), c = clip(u); _trS4(k, { pre: raw, union: u, clip: c }); return c }\n    for (const k of Object.keys(acc.tl)) treelawnByLu[k] = _t4('tl:' + k, acc.tl[k])\n    for (const k of Object.keys(acc.lu)) luByClass[k]   = _t4('lu:' + k, acc.lu[k])\n", 'finish tl/lu')
tg = once(tg, "      curb:     clip(unionRings(acc.C)),\n      sidewalk: clip(unionRings(acc.W)),", "      curb:     _t4('curb', acc.C),\n      sidewalk: _t4('sidewalk', acc.W),", 'finish curb/sidewalk')
tg = once(tg, "  for (const lu of classes) {\n    const part = intersectRings(own,", "  _trRekeyFull(st, own, parts, classes, ev)\n  for (const lu of classes) {\n    const part = intersectRings(own,", 'rekeyByPiece parts')
writeFileSync(here('./tileGround.trace.js'), tg)
let bg = readFileSync(here('./bake-ground.gate-branch.js'), 'utf8')
bg = "import { analyse as _trAnalyse, wholeTown as _trWhole, trAtWrite as _trAtWrite } from '" + here('./trace.mjs') + "';\n" + once(bg, "  if (stackOnly) return { stackEntries, keepOwnSlot: KEEP_OWN_SLOT, doesNotCut: DOES_NOT_CUT }\n",
  `  if (stackOnly) return { stackEntries, keepOwnSlot: KEEP_OWN_SLOT, doesNotCut: DOES_NOT_CUT }
  if (process.env.TRACE_AT) { _trAtWrite(); console.log('  [trace-at] written'); process.exit(0) }
  { const r = _trAnalyse(stackEntries.filter(e => !DOES_NOT_CUT.has(e.groupKey)), [['face:residential', 'mat:sidewalk'], ['mat:sidewalk', 'mat:treelawn:residential'], ['mat:sidewalk', 'mat:treelawn:underived'], ['mat:curb', 'mat:treelawn:underived'], ['mat:curb', 'mat:treelawn:residential']], process.env.TRACE_OUT)
    console.log('  [trace] ' + JSON.stringify({ firstStage: r.firstStage, s0: r.s0 }))
    if (process.env.TRACE_WHOLE) console.log('  [trace-whole] m of cross-layer line drawn twice by stage: ' + JSON.stringify(_trWhole(stackEntries.filter(e => !DOES_NOT_CUT.has(e.groupKey)))))
    process.exit(0) }
`, 'stack entry')
writeFileSync(here('./bake-ground.trace.js'), bg)
console.log('[make-trace] tileGround.trace.js + bake-ground.trace.js written')
