#!/usr/bin/env node
/**
 * claims-a-parcel-keeps-all-its-parts.mjs — DOES A MULTIPART PARCEL REACH THE MAP WHOLE?
 *
 * ⛔ The class (Screed, 2026-10-18): an assessor parcel is an ArcGIS polygon (`fetch-parcels.mjs` keeps `geometry.rings`
 *    as served). Esri allows several OUTER rings per feature and promises no ring order, but every reader of `rings[0]`
 *    takes the first ring as the whole parcel. derive's emitted `parcel` layer (`clipParcelsToRoundedBlocks`) drops the
 *    other parts, and the land-use vote's face membership (`faceParcelMap`, the centroid + `rings[0]`'s vertices) never
 *    sees a block only another part reaches. The parcel brief reads parcels as the back of the street, so a lost part
 *    is lost ground.
 * ⭐ THE RULE, per town with a declared parcel well (sources.json) and a derived `clean/map.json`:
 *    1. GEOMETRY: every part of every parcel that has ground inside the emitted blocks has SOME emitted parcel cover.
 *       A part is a ring inside no other ring of its parcel (containment, never winding or order).
 *    2. MEMBERSHIP: derive's face membership reads every part — from the source: the `faceParcelMap` build reads no
 *       `rings[0]`. When it does, the parcels it fails are named: those with a part in an emitted block that neither the
 *       centroid nor `rings[0]` reaches. (The faces are local to `deriveLayers` and not emitted; the emitted blocks stand
 *       in for them, so this NAMES the cases and the source read is the gate.)
 *    Cover by ANOTHER parcel's emitted ring counts as cover: stacked parcels would hide a dropped part (a false pass,
 *    never a false fail).
 * ⭐ MUTATION-TESTED EVERY RUN: a two-part parcel emitted with one part must be named, and with both must pass; its rings
 *    reordered (a hole first) must give the same parts; a membership build reading `rings[0]` must be caught, and one
 *    reading every part must not.
 *
 *   node checks/claims-a-parcel-keeps-all-its-parts.mjs [town …]
 * Read-only, seconds. Exit 1 on a failure; 2 when nothing could be checked.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import clipperLib from 'clipper-lib'
import { readSources } from '../cartograph/sources.js'
import { ROOT, scenes } from './_scenes.mjs'

const { Clipper, Paths, PolyType, ClipType, PolyFillType } = clipperLib
// derive's own clipper scale, read from the source, never restated
const DERIVE = readFileSync(join(ROOT, 'cartograph/derive.js'), 'utf8')
const SCALE = Number(DERIVE.match(/^const SCALE = (\d+)$/m)?.[1])
if (!(SCALE > 0)) { console.log('   ⛔ cartograph/derive.js: `const SCALE = …` not found — NOT CHECKED'); process.exit(2) }
const toC = (r) => r.map(p => ({ X: Math.round((p.x ?? p[0]) * SCALE), Y: Math.round((p.z ?? p[1]) * SCALE) }))
const area = (paths) => Math.abs(paths.reduce((a, p) => a + Clipper.Area(p), 0)) / (SCALE * SCALE)
const meet = (a, b) => { const c = new Clipper(); c.AddPaths(a, PolyType.ptSubject, true); c.AddPaths(b, PolyType.ptClip, true); const o = new Paths(); c.Execute(ClipType.ctIntersection, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return o }
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }

/** a parcel's parts: its rings that lie inside no other ring of it */
const partsOf = (rings) => { const R = (rings || []).filter(r => r?.length >= 3)
  return R.filter((r, i) => !R.some((o, j) => j !== i && pip(r[0][0], r[0][1], o) && !pip(o[0][0], o[0][1], r))) }

/** the face-membership build in derive (from `const faceParcelMap` to the next function), or null */
const membershipBuild = (src) => src.match(/const faceParcelMap = new Map\(\)[\s\S]*?\n\s*function /)?.[0] ?? null
const readsFirstRingOnly = (code) => /rings\s*(\?\.)?\s*\[\s*0\s*\]/.test(code)

/** { lost: [...], unreached: [...] } for one town's parcels against its emitted parcel and block rings */
function judge({ parcels, emitted, blocks }, firstOnly) {
  const E = emitted.map(e => toC(e.ring)), B = blocks.map(e => toC(e.ring)), BR = blocks.map(e => e.ring.map(q => [q.x ?? q[0], q.z ?? q[1]])), lost = [], unreached = []
  for (const p of parcels) { const parts = partsOf(p.rings); if (parts.length < 2) continue
    const name = p.handle ?? p.address ?? `(${p.centroid?.join(', ')})`
    parts.forEach((r, k) => { const inB = meet([toC(r)], B); if (!(area(inB) > 0)) return
      if (!(area(meet(inB, E)) > 0)) lost.push(`${name} part ${k + 1} of ${parts.length}: ${area(inB).toFixed(0)} m² of block ground, no emitted parcel over it`) })
    if (firstOnly) { const first = p.rings[0], reached = new Set()
      BR.forEach((R, i) => { if ((p.centroid && pip(p.centroid[0], p.centroid[1], R)) || first.some(([x, z]) => pip(x, z, R))) reached.add(i) })
      const miss = parts.filter(r => r !== first).some(r => BR.some((R, i) => !reached.has(i) && r.some(([x, z]) => pip(x, z, R))))
      if (miss) unreached.push(`${name}: a part lies in a block its centroid and rings[0] never reach`) } }
  return { lost, unreached }
}

// ── mutations: each must be caught ──
const sq = (x0, z0, s) => [[x0, z0], [x0 + s, z0], [x0 + s, z0 + s], [x0, z0 + s]]
// two parts in two blocks, the second with a hole; the first part's vertices reach only the first block
const hole = [[22, 2], [22, 4], [24, 4], [24, 2]]
const two = { handle: 'two-part', centroid: [5, 5], rings: [sq(0, 0, 10), sq(20, 0, 6), hole] }
const asRing = (r) => ({ ring: r.map(([x, z]) => ({ x, z })) })
const blk = [asRing(sq(-1, -1, 12)), asRing(sq(19, -1, 9))]
const m1 = judge({ parcels: [two], emitted: [asRing(sq(0, 0, 10))], blocks: blk }, true)
const m1ok = judge({ parcels: [two], emitted: [asRing(sq(0, 0, 10)), asRing(sq(20, 0, 6))], blocks: blk }, false)
const ids = (P) => P.map(r => JSON.stringify(r)).sort().join('|')
const reordered = partsOf([hole, sq(20, 0, 6), sq(0, 0, 10)]), straight = partsOf(two.rings)
const sameParts = straight.length === 2 && ids(reordered) === ids(straight)
const fixedBuild = 'const faceParcelMap = new Map()\n  for (const parcel of parcels) { for (const r of partsOf(parcel.rings)) {} }\n  function '
const mutants = [
  ['a two-part parcel emitted with one part is named', m1.lost.length === 1 && m1.lost[0].startsWith('two-part part 2')],
  ['… and with both parts passes', m1ok.lost.length === 0],
  ['its membership through rings[0] alone is named', m1.unreached.length === 1],
  ['its rings reordered (a hole first) give the same two parts', sameParts],
  ['a membership build reading rings[0] is caught', readsFirstRingOnly(membershipBuild(DERIVE.replace(/const faceParcelMap = new Map\(\)/, 'const faceParcelMap = new Map()\n  parcel.rings[0]')) ?? '')],
  ['a membership build reading every part is not', membershipBuild(fixedBuild) != null && !readsFirstRingOnly(membershipBuild(fixedBuild))],
]

// ── the towns ──
const build = membershipBuild(DERIVE)
if (!build) { console.log('   ⛔ cartograph/derive.js: the `faceParcelMap` build is not found — re-aim the membership read. NOT CHECKED'); process.exit(2) }
const firstOnly = readsFirstRingOnly(build)
const fails = [], counted = []
for (const town of scenes('cartograph/data/<scene>/clean/map.json')) {
  const src = readSources(town)
  if (!src.declared) { console.log(`   ${town}: no sources.json — parcels UNDECLARED, not checked`); continue }
  if (!src.parcels?.length) { console.log(`   ${town}: declares no parcel well — nothing to check`); continue }
  const L = JSON.parse(readFileSync(join(ROOT, 'cartograph/data', town, 'clean/map.json'), 'utf8')), layers = L.layers || L
  const missing = src.parcels.map(w => join(ROOT, 'cartograph/data', town, 'raw', w.file)).filter(f => !existsSync(f))
  if (missing.length) { fails.push(`${town}: declared parcel well(s) missing on disk: ${missing.join(', ')}`); continue }
  const parcels = src.parcels.flatMap(w => Object.values(JSON.parse(readFileSync(join(ROOT, 'cartograph/data', town, 'raw', w.file), 'utf8')).parcels || {}))
  const multi = parcels.filter(p => partsOf(p.rings).length > 1).length
  const r = judge({ parcels, emitted: layers.parcel || [], blocks: layers.block || [] }, firstOnly)
  counted.push(town)
  console.log(`   ${town}: ${parcels.length} parcels · ${multi} multipart · parts lost from the emitted layer ${r.lost.length} · membership misses a part ${firstOnly ? r.unreached.length : 0}`)
  for (const f of r.lost) fails.push(`${town}: ${f}`)
  if (firstOnly) for (const f of r.unreached) fails.push(`${town}: ${f}`)
}
if (firstOnly) fails.unshift('cartograph/derive.js: the face-membership build (`faceParcelMap`) reads rings[0] — a parcel votes only where its first ring reaches')
for (const [what, caught] of mutants) { console.log(`   mutation (${what}) ${caught ? 'caught ✓' : 'NOT caught'}`); if (!caught) fails.push(`MUTATION NOT CAUGHT: ${what}`) }
if (!counted.length && !fails.length) { console.log('   ⛔ no town has a declared parcel well and a map.json — NOT CHECKED'); process.exit(2) }
if (fails.length) { for (const f of fails.slice(0, 40)) console.log(`   ⛔ ${f}`); if (fails.length > 40) console.log(`   … +${fails.length - 40}`); process.exit(1) }
console.log('   ✅ every part of every parcel reaches the emitted layer and the land-use vote')
