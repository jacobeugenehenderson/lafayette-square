// READ-ONLY diagnosis: run bake-coast (a temp copy whose verifier RECORDS instead of refusing, write=false) and describe each bad
// place: its kind, the two edges, and how far each end lies from an embankment's ring.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
const ROOT = new URL('../../', import.meta.url).pathname, HOME = join(ROOT, 'cartograph/bake-coast.mjs'), scene = process.argv[2]
let src = readFileSync(HOME, 'utf8')
const a = '  if (bad.length) throw new Error(`⛔ bake-coast: ${scene} — ${bad.length} place(s)'
if (!src.includes(a)) throw new Error('verifier site gone')
src = src.replace(a, '  if (bad.length) { globalThis.__diag = { bad, simple, emb, fine } }\n  if (false) throw new Error(`⛔ bake-coast: ${scene} — ${bad.length} place(s)')
src = src.replace(/^if \(process\.argv\[1\][^\n]*\n[\s\S]*$/m, '')   // drop the CLI tail
const abs = (spec) => spec.startsWith('.') ? pathToFileURL(join(dirname(HOME), spec)).href : spec.includes(':') ? spec : import.meta.resolve(spec)
const out = join(mkdtempSync(join(tmpdir(), 'coast-diag-')), 'bake-coast.mjs')
writeFileSync(out, src.replace(/from '([^']+)'/g, (_, s) => `from '${abs(s)}'`))
const M = await import(pathToFileURL(out).href)
await M.bakeCoast({ scene, write: false })
const D = globalThis.__diag
if (!D) { console.log('no bad places'); process.exit(0) }
const rings = D.simple.flatMap(bd => [bd.outer, ...bd.holes])
const segD = (v, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((v[0] - a[0]) * dx + (v[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(v[0] - a[0] - t * dx, v[1] - a[1] - t * dz) }
const ringD = (p) => { let d = Infinity; for (const r of D.emb.rings) for (let i = 0; i < r.length; i++) d = Math.min(d, segD(p, r[i], r[(i + 1) % r.length])); return d }
const mm = (x) => (x * 1000).toFixed(2)
for (const v of D.bad) { const r = rings[v.ra ?? 0] || rings[0]
  const ends = [v.a, v.b].filter(Number.isInteger).flatMap(e => [r[e], r[(e + 1) % r.length]])
  console.log(`${v.kind} ${v.where ?? ''} @(${(v.at || ends[0]).map(c => (+c).toFixed(3)).join(', ')}) · gap ${v.gap != null ? mm(v.gap) + ' mm' : '—'} · ends to the embankment ring: ${ends.map(p => mm(ringD(p))).join(' / ')} mm · edge lengths ${[v.a, v.b].filter(Number.isInteger).map(e => mm(Math.hypot(r[(e + 1) % r.length][0] - r[e][0], r[(e + 1) % r.length][1] - r[e][1]))).join(' / ')} mm`) }
console.log(JSON.stringify(D.bad[0]).slice(0, 300))
