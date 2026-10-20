// make-pt.mjs — writes bake-ground.pt.js (never committed): who paints the point PT_AT="x,z" (a) right after the flatten,
// (b) after the ease split re-nests the face groups, (c) in the conformed triangles — printed — and (d) every unowned ped
// vertex's position; written to PT_OUT at the unowned tally, where it exits. Run prep-gate.mjs first. For HPDM's eight-group double at (-20.71, -587.62), 2026-10-14.
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
const here = (f) => fileURLToPath(new URL(f, import.meta.url))
const once = (s, a, b, what) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`make-pt: ${what}: anchor found ${n}×`); return s.replace(a, b) }
let bg = readFileSync(here('./bake-ground.gate-branch.js'), 'utf8')
bg = once(bg, "  const flattened = flattenPaintStack(stackEntries, { keepOwnSlot: KEEP_OWN_SLOT, doesNotCut: DOES_NOT_CUT })\n",
  "  const flattened = flattenPaintStack(stackEntries, { keepOwnSlot: KEEP_OWN_SLOT, doesNotCut: DOES_NOT_CUT })\n  _ptRecord('after-flatten', flattened)\n", 'flatten')
bg = once(bg, "    console.log(`  [deform] the line swept across the bands:", "    _ptRecord('after-ease-split', flattened)\n    console.log(`  [deform] the line swept across the bands:", 'ease split')
bg = once(bg, "    let bufs = conformAndRefine(planeSpecs, cstats)\n", "    let bufs = conformAndRefine(planeSpecs, cstats)\n    _ptTris(planeKeys, bufs)\n", 'conform')
bg = once(bg, "  if (deformTally.unowned.size) console.log(", "  _ptDone(deformTally.unowned)\n  if (deformTally.unowned.size) console.log(", 'unowned tally')
bg = `
import * as _fs_pt from 'node:fs'
const _PT = (process.env.PT_AT || '').split(',').map(Number), _ptOut = { at: _PT, stages: {} }
function _ptIn(r, x, z) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c } return c }
function _ptRecord(stage, flattened) {
  const rows = []
  for (const [k, items] of flattened) (items || []).forEach((it, idx) => {
    const o = Array.isArray(it) ? it : it?.outer, hs = Array.isArray(it) ? [] : (it?.holes || [])
    if (!o || o.length < 3 || !_ptIn(o, _PT[0], _PT[1])) return
    const inHole = hs.findIndex(h => h?.length >= 3 && _ptIn(h, _PT[0], _PT[1]))
    rows.push({ group: k, idx, outerN: o.length, holes: hs.length, paints: inHole < 0, inHole }) })
  _ptOut.stages[stage] = rows
  console.log('  [pt] ' + stage + ': painted by ' + (rows.filter(r => r.paints).map(r => r.group + '#' + r.idx + ' (' + r.outerN + ' v, ' + r.holes + ' holes)').join(' · ') || 'nothing'))
}
function _ptTris(keys, bufs) {
  const hit = []
  keys.forEach((k, gi) => { const b = bufs[gi]; if (!b) return; const P = b.positions, I = b.indices
    for (let t = 0; t < I.length; t += 3) { const v = [I[t], I[t + 1], I[t + 2]].map(i => [P[i * 3], P[i * 3 + 2]])
      if (_ptIn(v, _PT[0], _PT[1])) { hit.push(k); break } } })
  _ptOut.stages.conformed = hit; console.log('  [pt] conformed triangles: ' + hit.join(' · '))
}
function _ptDone(unowned) { _ptOut.unowned = [...unowned.entries()].map(([k, tile]) => { const [x, z] = k.split(',').map(Number); return { x, z, tile } })
  _fs_pt.writeFileSync(process.env.PT_OUT, JSON.stringify(_ptOut)); console.log('  [pt] written (' + _ptOut.unowned.length + ' unowned); exiting'); process.exit(0) }
` + bg   // AT THE TOP: the bake's main() runs at module level, so a const declared below it is not yet initialised
writeFileSync(here('./bake-ground.pt.js'), bg)
console.log('[make-pt] bake-ground.pt.js written')
