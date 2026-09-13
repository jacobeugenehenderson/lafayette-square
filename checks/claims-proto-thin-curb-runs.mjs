#!/usr/bin/env node
// ⛔⛔ WHAT ARE THE THIN ② RUNS — AUTHORING, OR A DEFECT? Ask the authoring FIRST.
//
// WHY. `?proto=1` shows ② as long thin runs on some streets. ⛔ THE FIRST QUESTION IS NOT "what is
// broken" — `CLAUDE.md` Layer 0 q3, sharpened: "A DIFFERENCE BETWEEN BLOCKS IS THE PRODUCT. IT IS
// NEVER, BY ITSELF, EVIDENCE OF A BUG." A street authored much wider than its to-code default eats
// its blocks; a THIN block is what a WIDE authored street LOOKS like (`SURVEY §4`, the asphalt-edge
// drag: "strokes the pavement half-width outward; the block follows").
// ⭐ Jacob, 2026-09-06: "some of these street widths have been manually authored; don't be confused
// … even if the width is wrong I should be able to grab a handle and drag it to the right place and
// the ribbons and corners are adaptive."
// ⇒ SO THE ACCEPTANCE IS NOT "the curb matches the default". It is: does the ribbon FOLLOW the
// authored width? A thin run under a wide authored width is the tool working.
//
// ⛔ Runs WITH the scene's authoring loaded, and reports each thin run's authored vs base width so
// the two populations can never be reported as one. ▶ node scratch/claims-proto-thin-curb-runs.mjs [scene]
import { feed, buildProto } from './_proto-feed.mjs'
const scene = process.argv[2] || 'lafayette-square'
const f = feed(scene); if (!f) process.exit(1)
const r = buildProto(f)
const O = r.protoOwners || []
const SA = (rg) => { let a = 0; for (let i = 0; i < rg.length; i++) { const j = (i + 1) % rg.length; a += rg[i][0]*rg[j][1] - rg[j][0]*rg[i][1] } return a / 2 }
const per = (rg) => { let p = 0; for (let i = 0; i < rg.length; i++) { const a = rg[i], b = rg[(i+1)%rg.length]; p += Math.hypot(b[0]-a[0], b[1]-a[1]) } return p }
// base (un-authored) width per chain, straight off the artifact
const base = new Map()
for (const s of f.ribbons.streets) base.set(s.skelId ?? s.name, { l: s.measure?.left?.pavementHW, r: s.measure?.right?.pavementHW })
const bc = f.blockCustoms || {}
const authoredHW = (skelId, side, segOrd) => bc?.[skelId]?.[side]?.[segOrd]?.pavementHW

const rows = []
for (let k = 0; k < (r.proto || []).length; k++) {
  const ring = r.proto[k], labs = r.protoLabels?.[k]
  if (!(ring?.length >= 3) || SA(ring) > 0 || !labs) continue      // holes = the blocks
  const p = per(ring); if (!p) continue
  const width = Math.abs(SA(ring)) / (p / 2)                        // the BLOCK's own mean width at ε
  // who bounds it, and what width is each of them carrying
  const own = new Map()
  for (const l of labs) { const o = O[l]; if (!o?.skelId) continue
    const key = `${o.skelId}|${o.side}|${o.segOrd}`
    if (!own.has(key)) own.set(key, { ...o, authored: authoredHW(o.skelId, o.side, o.segOrd), base: base.get(o.skelId)?.[o.side === 'right' ? 'r' : 'l'] }) }
  const hw = [...own.values()].map(o => (Number.isFinite(o.authored) ? o.authored : o.base) || 0)
  const maxHW = Math.max(0, ...hw)
  const anyAuthored = [...own.values()].some(o => Number.isFinite(o.authored))
  rows.push({ k, blockWidth: width, area: Math.abs(SA(ring)), maxHW, anyAuthored,
    survives: width - 2 * maxHW,          // what is LEFT of the block once both curbs are struck
    who: [...own.values()] })
}
rows.sort((a, b) => a.survives - b.survives)
const dead = rows.filter(x => x.survives <= 0)
const thin = rows.filter(x => x.survives > 0 && x.survives < 3)
console.log(`\n${scene}: ${rows.length} block(s) in ①`)
console.log(`  ⛔ ${dead.length} where the two curbs MEET or CROSS (block width ≤ 2 × the half-width) — "if the curbs touch, there's no block"`)
console.log(`  ⚠️ ${thin.length} with under 3 m surviving between the curbs`)
console.log(`\n  ${'blockW'.padStart(8)} ${'maxHW'.padStart(7)} ${'survives'.padStart(9)}  authored?  bounding chains`)
for (const x of [...dead, ...thin].slice(0, 14)) {
  const names = [...new Set(x.who.map(o => o.skelId))].slice(0, 3).join(' + ')
  console.log(`  ${x.blockWidth.toFixed(2).padStart(8)} ${x.maxHW.toFixed(2).padStart(7)} ${x.survives.toFixed(2).padStart(9)}  ${(x.anyAuthored ? 'AUTHORED' : 'default ').padStart(9)}  ${names}`)
}
console.log(`\n  ⭐ AUTHORED rows are the tool working — a wide authored street eats its block (SURVEY §4).`)
console.log(`  ⛔ DEFAULT rows with survives ≤ 0 are the ones to look at: nobody asked for those.`)
const badDefault = dead.filter(x => !x.anyAuthored)
console.log(`  ⇒ curbs meeting on a block with NO authoring anywhere on it: ${badDefault.length}`)
