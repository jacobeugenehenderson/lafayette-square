#!/usr/bin/env node
// ⛔⛔ WOULD MAKING `ribbons.streets[].points` THE SIMPLIFIED SKELETON MOVE THE OPERATOR'S AUTHORING?
//
// WHY THIS MUST RUN BEFORE THAT CHANGE. The drawn centreline and the line ① is built from are two
// different geometries (median 1.00 m apart, max 20.8 m). The fix Jacob's SSoT ruling implies is to
// make `points` BE the simplified geometry — one line everywhere. ⛔ But `blockCustoms` is keyed
// `skelId | side | segOrd`, and **segOrd is an ordinal over the IX partition of the point array**.
// Change the points and the partition can change; change the partition and a slot that still
// RESOLVES may address a DIFFERENT PHYSICAL STRETCH. `WALL.md`'s T3 gate names this: "if chains
// renumber, authored customs orphan silently."
// ⭐ TWO OUTCOMES, AND ONLY ONE IS LOUD:
//   ORPHANED  — segOrd beyond the new count. The slot stops resolving. Visible.
//   RE-POINTED — the slot still resolves, at a different span. INVISIBLE, and it is the real risk:
//                the authoring still "works", it just describes somewhere else.
// ⛔ Do not run the convergence until this reports 0 in BOTH columns, or until a re-key is built.
// ▶ node checks/claims-simplify-preserves-authoring.mjs [scene]
import fs from 'fs'
import { resolveChainSegmentation } from '../src/lib/chainSegmentation.js'
const scene = process.argv[2] || 'lafayette-square'
const RIB = scene === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${scene}/clean/ribbons.json`
const SK = `cartograph/data/${scene}/clean/skeleton.json`
const idx = JSON.parse(fs.readFileSync('public/looks/index.json', 'utf8'))
const look = ((idx.looks || []).find(l => l.id === scene) || (idx.looks || []).find(l => l.scene === scene) || {}).id
if (!fs.existsSync(RIB) || !fs.existsSync(SK) || !look) { console.log(`⛔ ${scene}: missing artifact — SKIPPED LOUDLY`); process.exit(1) }
const rb = JSON.parse(fs.readFileSync(RIB, 'utf8'))
const sk = JSON.parse(fs.readFileSync(SK, 'utf8'))
const bc = JSON.parse(fs.readFileSync(`public/looks/${look}/design.json`, 'utf8')).blockCustoms || {}
const simp = new Map((sk.streets || []).map(s => [s.id, (s.points || []).map(q => Array.isArray(q) ? [q[0], q[1]] : [q.x, q.z])]))
const A = rb.streets.filter(s => s.points?.length >= 2)
const B = A.map(s => { const p = simp.get(s.skelId ?? s.name); return p?.length >= 2 ? { ...s, points: p } : s })
const segA = resolveChainSegmentation(A), segB = resolveChainSegmentation(B)
const nOrd = (streets, seg) => new Map(streets.map(s => {
  const n = s.points.length
  return [s.skelId ?? s.name, [...(seg.get(s) || [])].filter(i => i > 0 && i < n - 1).length]
}))
const a = nOrd(A, segA), b = nOrd(B, segB)
let chainsMoved = 0
for (const [k, v] of a) if (b.get(k) !== v) chainsMoved++
let tot = 0, repointed = 0, orphaned = 0
const rows = []
for (const [k, sides] of Object.entries(bc)) for (const [side, ords] of Object.entries(sides || {})) for (const ord of Object.keys(ords || {})) {
  tot++
  const before = a.get(k), after = b.get(k)
  if (before === undefined || after === undefined || before === after) continue
  if (Number(ord) > after) { orphaned++; rows.push(`ORPHANED   ${k}/${side}/${ord}  (${before}→${after})`) }
  else { repointed++; rows.push(`re-pointed ${k}/${side}/${ord}  (${before}→${after})`) }
}
console.log(`\n${scene}: ${chainsMoved} of ${a.size} chains change their IX-ordinal count under simplification`)
console.log(`  authored slots: ${tot}`)
console.log(`  ⛔ ORPHANED (stops resolving — visible)     : ${orphaned}`)
console.log(`  ⚠️ RE-POINTED (resolves elsewhere — INVISIBLE): ${repointed}`)
rows.slice(0, 12).forEach(r => console.log(`     ${r}`))
console.log(`\n  ⭐ Re-pointing is the one to fear: the authoring still works and describes somewhere else.`)
console.log(`  ⛔ ${orphaned + repointed ? 'DO NOT converge without a re-key.' : 'Safe on this scene — re-run per town, never quote.'}`)
process.exit(orphaned + repointed ? 1 : 0)
