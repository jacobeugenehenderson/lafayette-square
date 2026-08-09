#!/usr/bin/env node
/**
 * IS THE POST-1d945f3e REFUSAL SET STABLE UNDER A WIDTH DRAG?
 *
 * ③ would paint from the partition where a tile is STAMPED. If a width drag can move
 * a tile between stamped and refused, the cure has a width-dependent seam — and under
 * SURVEY §4.1 the strip drag is the primary gesture, not an edge case.
 *
 * The mint door is closed (provenance now rides Clipper's Z channel), so the
 * remaining doors into "refused" are:
 *   carve:median-*, carve:small — gated on isMedianTile + ringArea, and ringArea is
 *      the FROZEN tile face, so a width drag cannot move it. Verified here, not assumed.
 *   carve:degenerate:* — ⭐ THE DOOR NOBODY HAS SWEPT. An offset that PASSES the gate
 *      and comes back unusable falls back to carve. A07 measured degeneracy 0 on every
 *      scene — at today's authoring only. It is width-dependent by construction:
 *      empty / collapsed / overflow are all judged against the offset's own area.
 *   keyhole-splice — cul-de-sac presence is structural, but the splice disk radius is
 *      built from a half-width, so it is NOT assumed stable either.
 *
 * ⛔ Measurement only. Nothing re-poured, nothing re-baked, live source untouched.
 * ⚠️ A sweep bounds the dial; it is not a claim about real authoring. LS's real
 *    working range is reported SEPARATELY from the full bound — a flip at 14 m is not
 *    the same fact as a flip at 7 m.
 *
 * Usage:  node scratch/refusal-set-under-width.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { buildTileGround } = await import(path.join(ROOT, 'src/lib/tileGround.js'))
const OPTS = { stencil: null, curbWidth: 0.15, smooth: 0, blockLandUse: null, cornerRadiusScale: 1, cornerRadiusOverrides: null, cornerCornerRadiusOverrides: null, emitArtifact: true }
const quiet = (f) => { const w = console.log; console.log = () => {}; try { return f() } finally { console.log = w } }
const rb = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ribbons.json')))
const run = (bc) => quiet(() => buildTileGround(rb, { ...OPTS, blockCustoms: bc }))._shapeArtifact || []

const base = run(null)
const triples = []
for (const t of base) for (const r of (t.runs || [])) if (r.skelId != null) triples.push([r.skelId, r.side, r.segOrd])
const bcAt = (hw) => { const o = {}; for (const [sk, side, ord] of triples) { ((o[sk] ||= {})[side] ||= {})[ord] = { pavementHW: hw } } return o }
import crypto from 'crypto'
const h = (o) => crypto.createHash('sha256').update(JSON.stringify(o, (k, v) => (typeof v === 'number' ? +v.toFixed(6) : v))).digest('hex').slice(0, 12)
const snap = (T) => T.map(t => ({ producer: t.producer, reason: t.producerReason || null, stamped: Array.isArray(t.iaEdge), why: t.iaEdgeReason || null, iA: h(t.iA) }))

const B = snap(base)
// LS's real working range, re-derived from the frozen facts rather than quoted
const WORKING = [5, 6, 7, 8]
const FULL = [2, 3, 4, 5, 6, 7, 8, 10, 12, 14]

console.log('\n⭐ IS THE REFUSAL SET STABLE UNDER A WIDTH DRAG? (post-1d945f3e, LS, 101 tiles)')
console.log('   ⛔ Nothing re-baked. ⚠️ A sweep bounds the dial; it is not a claim about real authoring.\n')
console.log(`   ${'pavementHW'.padStart(11)} ${'offset'.padStart(7)} ${'carve'.padStart(6)} ${'degen'.padStart(6)} ${'keyhole'.padStart(8)} ${'stamped'.padStart(8)}   producer flips vs default`)
const rows = []
for (const hw of FULL) {
  const T = snap(run(bcAt(hw)))
  const off = T.filter(x => x.producer === 'offset').length
  const carve = T.filter(x => x.producer === 'carve').length
  const degen = T.filter(x => /degenerate/.test(x.reason || '')).length
  const key = T.filter(x => x.why === 'keyhole-splice').length
  const flips = T.map((x, i) => x.producer !== B[i].producer ? i : -1).filter(i => i >= 0)
  // ⛔ THE CONTROL. A flat result is only evidence if the dial is biting. If the curb
  // did not move, the sweep measured nothing and the stability below is an artifact.
  const moved = T.filter((x, i) => x.iA !== B[i].iA).length
  const degenList = T.map((x, i) => /degenerate/.test(x.reason || '') ? `${i}:${x.reason}` : null).filter(Boolean)
  rows.push({ hw, flips, degenList, key, moved })
  console.log(`   ${String(hw).padStart(9)} m ${String(off).padStart(7)} ${String(carve).padStart(6)} ${String(degen).padStart(6)} ${String(key).padStart(8)} ${String(T.filter(x => x.stamped).length).padStart(8)}   ${String(moved).padStart(3)} tiles' curb moved   ${flips.length ? flips.join(' ') : '—'}`)
}
const inRange = rows.filter(r => WORKING.includes(r.hw))
const firstFlip = rows.find(r => r.flips.length)
const firstDegen = rows.find(r => r.degenList.length)
const keyBase = B.filter(x => x.why === 'keyhole-splice').length

const dead = rows.filter(r => r.moved === 0).map(r => r.hw)
console.log('\n══ ANSWERS ══')
console.log(`0. ⛔ CONTROL — the curb moved on ${rows.map(r => r.moved).join('/')} tiles across ${FULL.join('/')} m.` +
  (dead.length ? `  ⛔ ${dead.join('/')} m MOVED NOTHING — the sweep did not bite there and those rows prove nothing.` : '  ✅ the dial bites at every step, so the stability below is a real result.'))
console.log(`1. producer flips (offset ↔ carve): ${firstFlip ? `FIRST at ${firstFlip.hw} m — tile(s) ${firstFlip.flips.join(' ')}` : 'NONE anywhere in 2–14 m'}`)
console.log(`2. degenerate:* leaves zero      : ${firstDegen ? `YES — first at ${firstDegen.hw} m: ${firstDegen.degenList.join(' · ')}` : 'NO — stays 0 across the whole 2–14 m bound'}`)
console.log(`3. keyhole-splice set            : baseline ${keyBase} · across the sweep ${[...new Set(rows.map(r => r.key))].join('/')} ${new Set(rows.map(r => r.key)).size === 1 ? '— UNMOVED' : '— MOVES'}`)
console.log(`4. ⭐ AT LS's REAL WORKING RANGE (${WORKING.join('/')} m), stated separately from the bound:`)
console.log(`      producer flips ${inRange.reduce((a, r) => a + r.flips.length, 0)} · degenerate ${inRange.reduce((a, r) => a + r.degenList.length, 0)} · keyhole ${[...new Set(inRange.map(r => r.key))].join('/')}`)
