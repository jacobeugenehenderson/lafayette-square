// READ-ONLY (Boz, 2026-10-19, for Jacob's question 11): skeleton.js `stampCustomWidths` turns a town's surveyed sidewalk
// distances into pavementHW / treelawn by subtracting the FIXED CURB_WIDTH, while the ground draws the Look's AUTHORED
// curbWidth. Per surveyed side: had the survey arithmetic used the authored curb, where would the difference Δ = cw − CURB_WIDTH
// have come out — the treelawn, the asphalt, or both? Re-derived from the stamped side itself (seed.left/right in the frozen
// clean/skeleton.json: pavementHW, treelawn, blockEdgeHW, source, tlClamped) and the street's lanes seed (seed.pavementHW),
// with the same formulas (`fromSurveyDist` / `fromRowHalf`), so nothing is poured. Authoring: whether the street's
// blockCustoms author pavementHW or treelawn on any segOrd of that side (side names as skeleton.json carries them — ⚠️ they
// are point-order-relative, so the street level is also given).
//   node scratch/footprint-census/survey-curb-delta.mjs [scene=lafayette-square]
import fs from 'node:fs'
import { CURB_WIDTH, SV_SIDEWALK } from '../../src/cartograph/streetProfiles.js'
const scene = process.argv[2] || 'lafayette-square'
const sk = JSON.parse(fs.readFileSync(`cartograph/data/${scene}/clean/skeleton.json`, 'utf8'))
const design = JSON.parse(fs.readFileSync(`public/looks/${scene}/design.json`, 'utf8')), cw = design.curbWidth, BC = design.blockCustoms || {}
if (!Number.isFinite(cw)) { console.log(`⛔ ${scene}: design.json carries no curbWidth — author curbWidth in this town's Look`); process.exit(1) }
const D = cw - CURB_WIDTH, E = 0.015   // stamped values (and blockEdgeHW, an input) are each rounded to 0.01
const authoredOn = (id, side) => Object.values(BC[id]?.[side] || {}).some(c => c && (c.pavementHW != null || c.treelawn != null))
const T = {}, rows = []
for (const s of sk.streets) for (const side of ['left', 'right']) {
  const m = s.seed?.[side]; if (!m || !String(m.source).startsWith('survey')) continue
  const seedPav = s.seed.pavementHW
  // the room the stamp left the asphalt, from its own block edge
  // (survey: blockEdgeHW = swDist + SV/2, so swInner = blockEdgeHW − SV; row: blockEdgeHW = rowHalf — the same expression)
  const swInner = m.blockEdgeHW - SV_SIDEWALK, room0 = swInner - CURB_WIDTH
  // ⛔ SELF-CHECK: the formula with CURB_WIDTH must give back the stamp, or the inputs are not what skeleton.js used
  const pav0 = Math.min(seedPav, Math.max(0.5, room0)), tl0 = Math.max(0, swInner - (pav0 + CURB_WIDTH))
  if (Math.abs(pav0 - m.pavementHW) > E || Math.abs(tl0 - m.treelawn) > E) { (T['⛔ stamp not reproduced'] ||= { n: 0, pav: 0, tl: 0 }).n++; continue }
  const pav1 = Math.min(seedPav, Math.max(0.5, room0 - D)), tl1 = Math.max(0, swInner - (pav1 + cw))
  const dPav = m.pavementHW - pav1, dTl = m.treelawn - tl1
  const out = dPav <= E ? 'treelawn' : dTl <= E ? 'asphalt' : 'split'
  const auth = authoredOn(s.id, side) ? 'side authored' : (authoredOn(s.id, 'left') || authoredOn(s.id, 'right')) ? 'street authored, not this side' : 'unauthored'
  const k = `${out} · ${auth}`; (T[k] ||= { n: 0, pav: 0, tl: 0 }); T[k].n++; T[k].pav += dPav; T[k].tl += dTl
  rows.push({ id: s.id, side, source: m.source, clamped: !!m.tlClamped, out, auth, dPav, dTl })
}
console.log(`${scene}: authored curbWidth ${cw} · CURB_WIDTH ${CURB_WIDTH.toFixed(4)} · Δ ${D.toFixed(4)} m per side · ${rows.length} surveyed side(s) in clean/skeleton.json`)
for (const [k, v] of Object.entries(T).sort((a, b) => b[1].n - a[1].n)) console.log(`   ${k.padEnd(48)} ${String(v.n).padStart(4)} side(s) · Δ taken from asphalt ${v.pav.toFixed(2)} m, from treelawn ${v.tl.toFixed(2)} m`)
const byOut = rows.reduce((a, r) => (a[r.out] = (a[r.out] || 0) + 1, a), {})
console.log(`   by outcome: ${Object.entries(byOut).map(([k, n]) => `${k} ${n}`).join(' · ')} · of which stamped tlClamped ${rows.filter(r => r.clamped).length}`)
if (process.argv.includes('--rows')) for (const r of rows) console.log(`      ${r.id} ${r.side} ${r.source}${r.clamped ? ' tlClamped' : ''}: ${r.out} (asphalt ${r.dPav.toFixed(3)} · treelawn ${r.dTl.toFixed(3)}) · ${r.auth}`)
