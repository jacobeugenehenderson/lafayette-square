#!/usr/bin/env node
/**
 * claims-the-land-stops-at-the-water — DOES THE SHORELINE CARVE REFUSE WHEN IT SHOULD?
 *
 * ⭐ This check is SYNTHETIC ON PURPOSE and reads no scene. The carve's whole value is
 * in its REFUSALS, and a refusal cannot be exercised by a town that does not trigger
 * it — Huron carves clean, so a Huron-only check would prove only that the happy path
 * works and would stay green if every guard were deleted. `MEMORY §C`: a passing check
 * proves nothing until it has been seen to FAIL. Every case below asserts a FAILURE.
 *
 * ⛔ It also cannot go stale against a town: no scene data, no fetch, no network.
 */
import { carveWaterFromBoundary } from '../cartograph/landBoundary.mjs'

const disc = []
for (let i = 0; i < 256; i++) { const t = 2 * Math.PI * i / 256; disc.push([1000 * Math.cos(t), 1000 * Math.sin(t)]) }
const shore = (x) => ({ osmId: 1, tags: { natural: 'water', name: 'TestSea' }, isClosed: false, clipped: true,
                        coords: [{ x, z: -3000 }, { x, z: 0 }, { x, z: 3000 }] })
const b = (x, z) => ({ coords: [{ x, z }] })
const run = (o) => carveWaterFromBoundary({ discPoly: disc, center: [0, 0], discR: 1000, buildings: [], ...o })

let fails = 0
const ok = (name, cond, detail) => {
  console.log(`${cond ? '  ✅' : '  ⛔'} ${name}${cond ? '' : `\n       ${detail}`}`)
  if (!cond) fails++
}

console.log('\nTHE HAPPY PATH — it must actually carve, or the refusals below prove nothing')
{
  const r = run({ waterFeatures: [shore(-200)], buildings: [b(300, 0), b(500, 100)] })
  ok('a clipped shoreline carves', r.carved && !r.refusal, r.refusal)
  // Analytic truth: the circular segment left of the chord x = -200 on r = 1000.
  const th = Math.acos(200 / 1000)
  const want = (Math.PI - (th - Math.sin(th) * Math.cos(th))) * 1e6
  const got = Math.abs((r.boundary || []).reduce((s, p, i, A) => { const q = A[(i + 1) % A.length]; return s + p[0] * q[1] - q[0] * p[1] }, 0) / 2)
  ok('the carved land area matches the analytic segment', r.boundary && Math.abs(got - want) / want < 0.005,
     `got ${(got / 1e6).toFixed(4)} km², want ${(want / 1e6).toFixed(4)} km²`)
}

console.log('\nTHE REFUSALS — each must FIRE')
{
  const r = run({ waterFeatures: [shore(-200)], buildings: [b(300, 0), b(-500, 0)] })
  ok('a building left in the water refuses the carve', !r.carved && /building footprint/.test(r.refusal || ''), r.refusal)
}
{
  // Centre inside the water side: the centre-is-land rule must not silently invert.
  const r = run({ waterFeatures: [shore(200)], buildings: [b(-300, 0), b(500, 0)] })
  ok('a building on the far side refuses rather than inverting', !r.carved && !!r.refusal, 'carved anyway')
}
{
  // Endpoints inside the disc: the arc does not span the hood, so the split is undefined.
  const stub = { osmId: 2, tags: { natural: 'water' }, isClosed: false, clipped: true,
                 coords: [{ x: -100, z: -100 }, { x: 0, z: 0 }, { x: 100, z: 100 }] }
  const r = run({ waterFeatures: [stub] })
  ok('a shoreline that does not span the disc refuses', !r.carved && /endpoint lies INSIDE/.test(r.refusal || ''), r.refusal)
}
{
  // A closed pond wholly inside is NOT a boundary — not carved, and SAID so.
  const pond = { osmId: 3, tags: { natural: 'water', name: 'Pond' }, isClosed: true,
                 coords: [{ x: 100, z: 100 }, { x: 200, z: 100 }, { x: 200, z: 200 }, { x: 100, z: 200 }, { x: 100, z: 100 }] }
  const r = run({ waterFeatures: [pond] })
  ok('an interior pond is not carved', !r.carved && !r.refusal, r.refusal)
  ok('and the pour is TOLD it was not carved', r.report.some(l => /WHOLLY INSIDE/.test(l)), 'no report line')
}
{
  // A closed body straddling the rim is held whole by the fetch ⇒ not an edge of the
  // world. Not carved, and loudly, because a real boundary could hide here.
  const lagoon = { osmId: 4, tags: { natural: 'water', name: 'Lagoon' }, isClosed: true,
                   coords: [{ x: 800, z: -200 }, { x: 1400, z: -200 }, { x: 1400, z: 200 }, { x: 800, z: 200 }, { x: 800, z: -200 }] }
  const r = run({ waterFeatures: [lagoon] })
  ok('a closed rim-straddling body is not carved', !r.carved, 'it carved')
  ok('and the pour is WARNED it might have been the boundary',
     r.report.some(l => /CLOSED water bod/.test(l)) && r.report.some(l => /land will not stop/.test(l)), 'no warning')
}
{
  // Nothing to do must be quiet and safe, not a refusal.
  const r = run({ waterFeatures: [] })
  ok('no water is a no-op, not a refusal', !r.carved && !r.refusal && !r.boundary, r.refusal)
}

console.log(fails ? `\n⛔ ${fails} failure(s).\n` : '\n✅ PASS — the carve refuses in every case it must, and carves the one it should.\n')
process.exit(fails ? 1 : 0)
