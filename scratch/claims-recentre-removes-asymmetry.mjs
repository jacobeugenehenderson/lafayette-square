#!/usr/bin/env node
/**
 * READ-ONLY. Jacob, 2026-09-04: "there is NO asymmetrical case for the CHAIN ITSELF, for
 * the GROUT ITSELF." `bbf4adf6` already rules that the chain is NOT the road's centreline
 * and that asymmetric `pavementHW` is what an off-centre trace looks like — but it applies
 * that ONLY at the tip. Apply it to the whole chain and asymmetry should disappear:
 *     recentred centreline = chain displaced by (hwR-hwL)/2 toward the wider side
 *     stroke width         = (hwL+hwR)              one symmetric stroke
 *
 * THE QUESTION: is the displacement CONSTANT along a chain (=> recentring is a rigid shift,
 * and asymmetry is not a case at all) or does it VARY (=> what is left is VARIABLE WIDTH,
 * which is authoring, not asymmetry)?
 *
 * ⭐ Reads the producer's own per-run `measure` out of shape.json — no constant, no street
 * knowledge. ⛔ A chain whose width varies is the operator's authoring and is REPORTED AS
 * SUCH, never as a defect.
 *
 *   node scratch/claims-recentre-removes-asymmetry.mjs [scene ...]
 */
import fs from 'fs'
const scenes = process.argv.slice(2).length ? process.argv.slice(2) : ['lafayette-square', 'hipointe-demun']
const spread = a => Math.max(...a) - Math.min(...a)
for (const scene of scenes) {
  const shp = `public/baked/${scene}/shape.json`
  if (!fs.existsSync(shp)) { console.log(`\n${scene}: missing ${shp} — SKIPPED LOUDLY`); continue }
  const sh = JSON.parse(fs.readFileSync(shp, 'utf8'))
  const per = new Map()
  for (const t of sh.tiles) for (const r of (t.runs || [])) {
    const L = r.measure?.left?.pavementHW, R = r.measure?.right?.pavementHW
    if (!Number.isFinite(L) || !Number.isFinite(R)) continue
    const e = per.get(r.skelId) || { disp: [], tot: [] }; per.set(r.skelId, e)
    e.disp.push((R - L) / 2); e.tot.push(L + R)
  }
  const multi = [...per.entries()].filter(([, v]) => v.disp.length >= 2)
  const asym = [...per.entries()].filter(([, v]) => v.disp.some(d => Math.abs(d) > 0.01))
  const dv = multi.filter(([, v]) => spread(v.disp) > 0.01)
  const tv = multi.filter(([, v]) => spread(v.tot) > 0.01)
  console.log(`\n${scene}: ${per.size} chains with per-side runs (${multi.length} with >1 run)`)
  console.log(`   carrying ANY asymmetry (|disp| > 1 cm)            : ${asym.length}`)
  console.log(`   whose DISPLACEMENT varies along the chain         : ${dv.length}   <- recentre is a RIGID shift on the rest`)
  console.log(`   whose TOTAL WIDTH varies along the chain          : ${tv.length}   <- AUTHORING, not asymmetry`)
  console.log(`   => asymmetry removed by recentring: ${asym.length - dv.filter(([k]) => asym.some(([j]) => j === k)).length} of ${asym.length} asymmetric chains`)
  for (const [k, v] of tv.sort((a, b) => spread(b[1].tot) - spread(a[1].tot)).slice(0, 5))
    console.log(`      authored width variation  ${k.padEnd(26)} ${spread(v.tot).toFixed(2)} m across ${v.tot.length} runs`)
}
