// heightAt cost, HEAD's deformer vs another, on the SAME fresh points (memo misses) near the ② rings (Brace, 2026-10-13).
//   node --cpu-prof --cpu-prof-dir=<dir> scratch/ground-budget/sampler-ab.mjs <dump> <other groundDeformer.mjs> <lineHeight.mjs for noLine> [n]
import { readFileSync } from 'fs'
import { resolve } from 'path'
const R = new URL('../../', import.meta.url).pathname
const [dump, other, lhp, nArg = '5000'] = process.argv.slice(2), N = +nArg
const { loadSceneTerrain } = await import(R + 'cartograph/terrainLoad.js')
const meta = JSON.parse(readFileSync(dump + '/meta.json', 'utf8')), T = loadSceneTerrain(meta.scene)
const load = () => JSON.parse(readFileSync(dump + '/deform.json', 'utf8'))
const { runKind } = await import(resolve(lhp)), { ribbonsPathOf } = await import(R + 'cartograph/scene.js')
const bridgeIds = new Set((JSON.parse(readFileSync(ribbonsPathOf(meta.scene), 'utf8')).streets || []).filter(s => s?.gradeSeparated).map(s => s.skelId ?? s.name))
// points: a seeded walk over ② ring vertices, each pushed 0–4 m in a seeded direction (distinct, so every call is a memo miss)
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
const A0 = load(), V = []; for (const t of A0.tiles) for (const r of t.iaFull || []) for (const p of r || []) V.push(p)
const P = Array.from({ length: N }, () => { const p = V[Math.floor(rnd() * V.length)], a = rnd() * 2 * Math.PI, d = rnd() * 4; return [p[0] + d * Math.cos(a), p[1] + d * Math.sin(a)] })
const time = (D, label) => { const t = process.hrtime.bigint(); let nul = 0; for (const [x, z] of P) if (D.heightAt(x, z) == null) nul++
  const us = Number(process.hrtime.bigint() - t) / 1e3 / N; console.log(`  ${label}: ${us.toFixed(1)} µs/call over ${N} fresh points · ${nul} null`); return us }
const { buildDeformer: bHead } = await import(R + 'cartograph/groundDeformer.mjs'), { buildDeformer: bOther } = await import(resolve(other))
const Ah = load(), Ao = load(); for (const t of Ao.tiles) for (const run of t.runs || []) if (!Array.isArray(run.h)) run.noLine = runKind(run, bridgeIds)
const Dh = bHead({ ...Ah, raw: T.getElevationRaw }), Do = bOther({ ...Ao, raw: T.getElevationRaw })
console.log(`${dump} · ${V.length} ② vertices · HEAD vs ${other}`)
// warm each once on a separate point set, then measure on P (fresh for both)
for (let i = 0; i < 200; i++) { const p = V[i * 7 % V.length]; Dh.heightAt(p[0] + 0.1, p[1]); Do.heightAt(p[0] + 0.1, p[1]) }
const h = time(Dh, 'HEAD'), o = time(Do, 'other')
let hh = 1e9, oh = 1e9; for (let r = 0; r < 5; r++) { hh = Math.min(hh, time(Dh, 'HEAD, memo hits')); oh = Math.min(oh, time(Do, 'other, memo hits')) }
console.log(`  memo hit, best of 5: HEAD ${hh.toFixed(2)} · other ${oh.toFixed(2)} µs/call (${(oh / hh).toFixed(2)}×)`)
console.log(`  other / HEAD = ${(o / h).toFixed(2)}×`)
let diff = 0; for (const [x, z] of P) { const a = Dh.heightAt(x, z), b = Do.heightAt(x, z); if ((a == null) !== (b == null) || (a != null && Math.abs(a - b) > 1e-6)) diff++ }
console.log(`  points where the two heights differ: ${diff} of ${N}`)
